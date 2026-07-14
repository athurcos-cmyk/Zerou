import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { callDeepSeek, deepseekApiKey } from './deepseekClient.js';
import { buildFinancialContext } from './buildFinancialContext.js';
import { verifyWorkspaceMembership } from './verifyWorkspaceMembership.js';

const REGION = 'southamerica-east1';
const DAILY_LIMIT = 60;
const MAX_HISTORY_CONTENT_LENGTH = 4000;

function todayKey(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SYSTEM_PROMPT = `Voce e a Grazi, assistente financeira do Granativa, um app brasileiro de controle de gastos pessoais. Voce se apresenta como Grazi quando perguntarem seu nome. Voce recebe um resumo dos dados financeiros reais do usuario com estas secoes:

RESUMO: mes atual vs anterior, gasto total, receitas, saldo em contas, total comprometido, livre para gastar.
GASTOS POR CATEGORIA: top 5 categorias de gasto no mes atual com comparacao ao mes anterior.
COMPROMETIDO (proximos 30 dias): contas a pagar (com vencimento e status VENCIDA quando atrasada), despesas fixas (recorrentes, com data da proxima ocorrencia), faturas de cartao de credito (com mes de referencia e valor devedor). O total comprometido eh a soma dos tres.

Suas regras:
1. Seja objetivo e direto, mas sempre calorosa e amigavel — como uma amiga organizada que quer ajudar, nao como um gerente de banco.
2. NUNCA invente numeros que nao estao no contexto. Se nao souber algo, diga que nao tem essa informacao.
3. Use SEMPRE os dados da secao COMPROMETIDO para responder sobre contas, despesas fixas, faturas e quanto a pessoa deve. Nao invente que "nao tem nada" se houver itens listados ali.
4. De dicas praticas baseadas nos dados reais quando relevante.
5. Use valores em reais (R$) quando mencionar quantias.
6. Se o usuario perguntar algo fora de financas, responda educadamente que seu foco e ajudar com as financas.
7. Nao sugira produtos financeiros especificos (bancos, cartoes, investimentos) a menos que o usuario pergunte.
8. Mantenha um tom encorajador e proximo, sem ser excessivamente informal.
9. Voce pode usar **negrito** para dar enfase em valores ou alertas importantes. Use listas com - quando enumerar itens. Nao use outros formatos markdown (titulos, tabelas, links).`;

interface ChatHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

function validateHistory(history: unknown): ChatHistoryEntry[] {
  if (history === undefined || history === null) return [];
  if (!Array.isArray(history)) return [];

  const validated: ChatHistoryEntry[] = [];

  for (const entry of history) {
    if (!entry || typeof entry !== 'object') continue;
    const role = (entry as Record<string, unknown>).role;
    if (role !== 'user' && role !== 'assistant') continue;

    const content = (entry as Record<string, unknown>).content;
    if (typeof content !== 'string' || content.length === 0) continue;
    if (content.length > MAX_HISTORY_CONTENT_LENGTH) continue;

    validated.push({ role, content });
  }

  return validated.slice(-10);
}

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

    // request.data pode ser undefined se o client chamar sem argumentos
    const data = request.data as Record<string, unknown> | undefined;
    if (!data || typeof data !== 'object') {
      throw new HttpsError('invalid-argument', 'Dados da requisicao invalidos.');
    }

    const workspaceId = typeof data.workspaceId === 'string' ? data.workspaceId.trim() : '';
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    const history = validateHistory(data.history);

    if (!workspaceId) {
      throw new HttpsError('invalid-argument', 'Espaco nao informado.');
    }

    if (!message) {
      throw new HttpsError('invalid-argument', 'Mensagem vazia.');
    }

    if (message.length > 2000) {
      throw new HttpsError('invalid-argument', 'Mensagem muito longa.');
    }

    const db = getFirestore();

    // ── Membership ───────────────────────────────────────────────────────────
    await verifyWorkspaceMembership(db, workspaceId, uid);

    // ── Rate limit: pre-check only (nao incrementa ainda) ────────────────────
    const key = todayKey();
    const usageRef = db.doc(`workspaces/${workspaceId}/aiUsage/${key}`);

    const usageDoc = await usageRef.get();
    const currentCount = usageDoc.exists ? ((usageDoc.data()?.count as number) ?? 0) : 0;

    if (currentCount >= DAILY_LIMIT) {
      throw new HttpsError(
        'resource-exhausted',
        'Limite diario de mensagens do assistente atingido. Volte amanha!',
      );
    }

    // ── Financial context ────────────────────────────────────────────────────
    let context: string;
    try {
      context = await buildFinancialContext(db, workspaceId);
    } catch (err) {
      logger.error('ai_build_context_failed', { workspaceId, error: String(err) });
      context = 'Nao foi possivel carregar seus dados financeiros no momento.';
    }

    // ── Assemble messages ────────────────────────────────────────────────────
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nCONTEXTO FINANCEIRO DO USUARIO:\n${context}` },
    ];

    for (const h of history) {
      messages.push({ role: h.role, content: h.content });
    }

    messages.push({ role: 'user', content: message });

    // ── Call DeepSeek ────────────────────────────────────────────────────────
    let reply: string;
    try {
      reply = await callDeepSeek(messages);
    } catch (err) {
      logger.error('ai_deepseek_call_failed', { workspaceId, error: String(err) });
      throw new HttpsError('internal', 'Nao consegui processar sua pergunta agora. Tente de novo em alguns segundos.');
    }

    // ── Rate limit: increment AFTER successful call ──────────────────────────
    // set + merge:true + increment(1) é atômico e funciona tanto para criar
    // quanto para atualizar — sem race condition entre if/else com exists obsoleto.
    try {
      await usageRef.set(
        { count: FieldValue.increment(1), createdAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    } catch (err) {
      // Non-critical: the message was already served. Log and continue.
      logger.warn('ai_rate_limit_increment_failed', { workspaceId, error: String(err) });
    }

    return { reply };
  },
);
