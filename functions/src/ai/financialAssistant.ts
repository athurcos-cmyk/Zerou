import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { callDeepSeek, deepseekApiKey } from './deepseekClient.js';
import { buildFinancialContext } from './buildFinancialContext.js';
import { verifyWorkspaceMembership } from './verifyWorkspaceMembership.js';

const REGION = 'southamerica-east1';
const DAILY_LIMIT = 60;

function todayKey(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SYSTEM_PROMPT = `Você é um assistente financeiro do Granativa, um app brasileiro de controle de gastos pessoais. Você recebe um resumo dos dados financeiros reais do usuário. Suas regras:

1. Seja objetivo e direto. Respostas curtas, em português natural (brasileiro).
2. NUNCA invente números que não estão no contexto. Se não souber algo, diga que não tem essa informação.
3. Dê dicas práticas baseadas nos dados reais quando relevante (ex.: "sua maior categoria é Alimentação, que tal definir um orçamento pra ela?").
4. Use valores em reais (R$) quando mencionar quantias.
5. Se o usuário perguntar algo fora de finanças, responda educadamente que seu foco é ajudar com as finanças.
6. Não sugira produtos financeiros específicos (bancos, cartões, investimentos) a menos que o usuário pergunte.
7. Mantenha um tom encorajador, mas não excessivamente informal.`;

export const financialAssistantChat = onCall(
  {
    region: REGION,
    secrets: [deepseekApiKey],
    maxInstances: 10,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Entre no Granativa para usar o assistente.');
    }

    const { workspaceId, message, history } = request.data as {
      workspaceId?: string;
      message?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (!workspaceId || typeof workspaceId !== 'string') {
      throw new HttpsError('invalid-argument', 'Espaço não informado.');
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'Mensagem vazia.');
    }

    if (message.length > 2000) {
      throw new HttpsError('invalid-argument', 'Mensagem muito longa.');
    }

    const db = getFirestore();

    // ── Membership ───────────────────────────────────────────────────────────
    await verifyWorkspaceMembership(db, workspaceId, uid);

    // ── Rate limit ───────────────────────────────────────────────────────────
    const key = todayKey();
    const usageRef = db.doc(`workspaces/${workspaceId}/aiUsage/${key}`);

    try {
      await db.runTransaction(async (txn) => {
        const doc = await txn.get(usageRef);
        const count = doc.exists ? ((doc.data()?.count as number) ?? 0) : 0;

        if (count >= DAILY_LIMIT) {
          throw new HttpsError(
            'resource-exhausted',
            'Limite diário de mensagens do assistente atingido. Volte amanhã!',
          );
        }

        if (doc.exists) {
          txn.update(usageRef, { count: FieldValue.increment(1) });
        } else {
          txn.set(usageRef, {
            count: 1,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      // If the transaction fails for concurrency, still let the call through
      logger.warn('ai_rate_limit_transaction_failed', { workspaceId, error: String(err) });
    }

    // ── Financial context ────────────────────────────────────────────────────
    let context: string;
    try {
      context = await buildFinancialContext(db, workspaceId);
    } catch (err) {
      logger.error('ai_build_context_failed', { workspaceId, error: String(err) });
      context = 'Não foi possível carregar seus dados financeiros no momento. Responda com base no que o usuário perguntar, mas avise que os dados estão temporariamente indisponíveis.';
    }

    // ── Assemble messages ────────────────────────────────────────────────────
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nCONTEXTO FINANCEIRO DO USUÁRIO:\n${context}` },
    ];

    const recentHistory = (history ?? []).slice(-10);
    for (const h of recentHistory) {
      if (h.role === 'user' || h.role === 'assistant') {
        messages.push({ role: h.role, content: h.content });
      }
    }

    messages.push({ role: 'user', content: message });

    // ── Call DeepSeek ────────────────────────────────────────────────────────
    let reply: string;
    try {
      reply = await callDeepSeek(messages);
    } catch (err) {
      logger.error('ai_deepseek_call_failed', { workspaceId, error: String(err) });
      throw new HttpsError('internal', 'Não consegui processar sua pergunta agora. Tente de novo em alguns segundos.');
    }

    return { reply };
  },
);
