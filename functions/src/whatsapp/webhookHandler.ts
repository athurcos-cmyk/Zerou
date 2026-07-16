import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import crypto from 'crypto';
import { sendWhatsAppMessage, getVerifyToken, whatsappAccessToken } from './metaClient.js';
import { interpretMessage, type CategoryOption, type MessageInterpretation } from './interpretMessage.js';
import { createTransactionFromMessage } from './createTransactionFromMessage.js';
import { createCategoryFromMessage } from './createCategoryFromMessage.js';
import { createCardPurchaseFromMessage } from './createCardPurchaseFromMessage.js';
import { answerFinancialQuestion } from './answerFinancialQuestion.js';
import { processLinkCode } from './linkAccount.js';
import {
  getPendingCardPurchase,
  setPendingCardPurchase,
  clearPendingCardPurchase,
  resolveCardSelection,
} from './pendingCardAction.js';
import { deepseekApiKey } from '../ai/deepseekClient.js';
import { checkAiUsageNotExceeded, incrementAiUsage } from '../ai/aiRateLimit.js';

const region = 'southamerica-east1';

function formatBRL(amountCents: number): string {
  return (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Resolve a categoria de um lancamento: prioriza a mais especifica entre as existentes
 * (compativel com o tipo da intencao), e cria uma nova SE o usuario a nomeou
 * explicitamente e ela ainda nao existe. Compartilhado entre expense/income/card_purchase.
 */
async function resolveOrCreateCategory(
  workspaceId: string,
  userId: string,
  intent: 'expense' | 'income' | 'card_purchase',
  interpretation: MessageInterpretation,
  categories: CategoryOption[],
): Promise<string | null> {
  const expectedType = intent === 'income' ? 'income' : 'expense';

  let categoryId = interpretation.categoryId;
  if (categoryId) {
    const matched = categories.find((c) => c.id === categoryId);
    const typeMatches = matched && (matched.type === expectedType || matched.type === 'both');
    if (!typeMatches) categoryId = null;
  }

  // Usuario nomeou explicitamente uma categoria que ainda nao existe dentro do proprio
  // lancamento (ex.: "gastei 50 no mercado, coloca na categoria trabalho") — cria na hora
  // e usa nesse mesmo lancamento (diferente de criar sem lancamento junto).
  if (!categoryId && interpretation.newCategoryName) {
    const newCategory = await createCategoryFromMessage({
      workspaceId,
      userId,
      name: interpretation.newCategoryName,
      type: interpretation.newCategoryType ?? expectedType,
      icon: interpretation.newCategoryIcon,
    });
    categoryId = newCategory.id;
  }

  return categoryId;
}

/**
 * Webhook público da Meta Cloud API para WhatsApp.
 *
 * GET: verificação do webhook (hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=xxx)
 * POST: mensagem recebida
 *
 * Valida X-Hub-Signature-256 (HMAC-SHA256 do corpo com WHATSAPP_APP_SECRET).
 *
 * memory 512MiB + cpu:1 e exigencia do Cloud Run pra rodar sem CPU throttling
 * (gcloud run services update --no-cpu-throttling, aplicado manualmente pos-deploy).
 * Sem isso o processamento apos o `res.status(200)` roda com CPU cortada e a
 * confirmacao ao usuario demora dezenas de segundos pra sair.
 */
export const whatsappWebhook = onRequest(
  { region, maxInstances: 10, memory: '512MiB', cpu: 1, secrets: [deepseekApiKey] },
  async (req, res) => {
    // ── GET: webhook verification ───────────────────────────────────────
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'] as string;
      const token = req.query['hub.verify_token'] as string;
      const challenge = req.query['hub.challenge'] as string;

      if (mode === 'subscribe' && token === getVerifyToken()) {
        res.status(200).send(challenge);
      } else {
        res.status(403).send('Forbidden');
      }
      return;
    }

    // ── POST: incoming message ──────────────────────────────────────────
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    // Signature validation disabled until WHATSAPP_APP_SECRET is configured.
    // Using the access token (wrong secret) causes HMAC mismatch and Meta stops delivery.
    // TODO: add WHATSAPP_APP_SECRET secret, then uncomment validation below.
    //
    // const appSecret = whatsappAccessToken.value();
    // const signature = req.headers['x-hub-signature-256'] as string;
    // if (appSecret && signature) {
    //   const rawBody = JSON.stringify(req.body);
    //   const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    //   if (signature !== expected) {
    //     res.status(401).json({ error: 'Invalid signature' });
    //     return;
    //   }
    // }

    // Respond 200 immediately — Meta expects fast response
    res.status(200).json({ ok: true });

    try {
      const body = req.body as Record<string, unknown>;
      if (!body || body.object !== 'whatsapp_business_account') return;

      const entries = body.entry as Array<Record<string, unknown>> | undefined;
      if (!entries?.[0]) return;

      const changes = entries[0].changes as Array<Record<string, unknown>> | undefined;
      if (!changes?.[0]) return;

      const value = changes[0].value as Record<string, unknown> | undefined;
      const messages = value?.messages as Array<Record<string, unknown>> | undefined;
      if (!messages?.[0]) return;

      const msg = messages[0];
      const phone = (msg.from as string)?.trim();
      const text = (msg.text as Record<string, unknown>)?.body as string | undefined;
      if (!phone || !text) return;

      const cleanText = text.trim();
      if (!cleanText) return;

      logger.info('whatsapp_message_received', { phone, text: cleanText.slice(0, 100) });

      // ── Check if it's a linking code ────────────────────────────────
      if (/vincular\s+\d{6}/i.test(cleanText)) {
        const reply = await processLinkCode(phone, cleanText);
        if (reply) {
          await sendWhatsAppMessage(phone, reply);
        }
        return;
      }

      // ── Look up workspace by phone number ───────────────────────────
      const db: Firestore = getFirestore();
      const indexDoc = await db.doc(`whatsappPhoneIndex/${phone}`).get();
      if (!indexDoc.exists) {
        await sendWhatsAppMessage(
          phone,
          'Seu WhatsApp ainda não está vinculado ao Granativa. Vá em Configurações > WhatsApp no app para conectar.',
        );
        return;
      }

      const link = indexDoc.data() as {
        workspaceId: string;
        linkedByUid: string;
      };
      const { workspaceId, linkedByUid } = link;
      if (!workspaceId || !linkedByUid) return;

      // ── Pergunta pendente: usuario tinha mais de um cartao e o bot perguntou qual ──
      const pending = await getPendingCardPurchase(db, phone);
      if (pending) {
        const resolvedCardId = resolveCardSelection(cleanText, pending.candidates);
        await clearPendingCardPurchase(db, phone);

        if (resolvedCardId) {
          const result = await createCardPurchaseFromMessage({
            workspaceId: pending.workspaceId,
            userId: pending.userId,
            cardId: resolvedCardId,
            amountCents: pending.amountCents,
            description: pending.description,
            categoryId: pending.categoryId,
            installments: pending.installments,
            purchaseDate: new Date(),
          });

          const catSuffix = result.categoryName ? ` (${result.categoryName})` : '';
          const installmentSuffix = pending.installments > 1 ? ` em ${pending.installments}x` : '';
          await sendWhatsAppMessage(
            phone,
            `✅ Compra registrada no ${result.cardName}${installmentSuffix}: ${formatBRL(result.amountCents)} — ${result.description}${catSuffix}`,
          );
          return;
        }
        // Nao resolveu -> descarta a pendencia e segue o fluxo normal com esta mesma mensagem.
      }

      // ── Load categories (todas — expense/income/both — a intencao decide qual usar) ──
      const catsSnap = await db
        .collection(`workspaces/${workspaceId}/categories`)
        .where('isActive', '==', true)
        .get();

      const categories: CategoryOption[] = catsSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
        type: d.data().type as 'income' | 'expense' | 'both',
      }));

      // ── Interpretar a mensagem (intencao + extracao, uma unica chamada) ──
      const interpretation = await interpretMessage(cleanText, categories);

      if (!interpretation || interpretation.intent === 'unclear') {
        await sendWhatsAppMessage(
          phone,
          'Não entendi. Você pode:\n- Registrar um gasto: "gastei 15 reais no mercado"\n- Registrar uma receita: "recebi 200 reais de freela"\n- Registrar compra no cartão: "gastei 300 no cartão em 3x"\n- Criar categoria: "cria uma categoria chamada Pet"\n- Perguntar sobre suas finanças: "quanto gastei esse mês?"',
        );
        return;
      }

      // ── Acao avancada de cartao (parcela em andamento, antecipar, renegociar) ──
      if (interpretation.intent === 'advanced_card_action') {
        await sendWhatsAppMessage(
          phone,
          'Isso aqui é mais avançado — dá uma olhada em Cartões no app pra fazer isso (parcela que já estava em andamento, antecipar parcela/fatura, renegociar).',
        );
        return;
      }

      // ── Criar categoria (pedido explicito, nunca cria transacao junto) ──
      if (interpretation.intent === 'create_category') {
        if (!interpretation.newCategoryName) {
          await sendWhatsAppMessage(phone, 'Não entendi o nome da categoria. Ex: "cria uma categoria chamada Pet".');
          return;
        }

        const result = await createCategoryFromMessage({
          workspaceId,
          userId: linkedByUid,
          name: interpretation.newCategoryName,
          type: interpretation.newCategoryType ?? 'expense',
          icon: interpretation.newCategoryIcon,
        });

        await sendWhatsAppMessage(
          phone,
          result.created
            ? `✅ Categoria "${result.name}" criada.`
            : `Você já tem uma categoria chamada "${result.name}".`,
        );
        return;
      }

      // ── Pergunta financeira (paridade com a Grazi do app) ───────────
      if (interpretation.intent === 'question') {
        let usageRef;
        try {
          ({ usageRef } = await checkAiUsageNotExceeded(db, workspaceId));
        } catch {
          await sendWhatsAppMessage(
            phone,
            'Você atingiu o limite diário de perguntas para a Grazi. Volte amanhã ou pergunte pelo app.',
          );
          return;
        }

        const answer = await answerFinancialQuestion(db, workspaceId, linkedByUid, cleanText);
        await sendWhatsAppMessage(phone, answer);
        await incrementAiUsage(usageRef);
        return;
      }

      // ── Compra no cartao (a vista ou parcelada) ─────────────────────
      if (interpretation.intent === 'card_purchase') {
        if (interpretation.confidence === 'low' || interpretation.amountCents <= 0) {
          await sendWhatsAppMessage(
            phone,
            'Não consegui entender o valor. Pode reformular? Ex: "gastei 300 no cartão em 3x"',
          );
          return;
        }

        const categoryId = await resolveOrCreateCategory(workspaceId, linkedByUid, 'card_purchase', interpretation, categories);

        const cardsSnap = await db.collection(`workspaces/${workspaceId}/cards`).get();
        // Mesmo padrao de useCardsData.ts: isActive ausente conta como ativo, so exclui isActive === false.
        const activeCards = cardsSnap.docs
          .filter((d) => d.data().isActive !== false)
          .map((d) => ({ id: d.id, label: d.data().name as string }));

        if (activeCards.length === 0) {
          await sendWhatsAppMessage(phone, 'Você ainda não tem cartão cadastrado. Cadastre um no app primeiro.');
          return;
        }

        const description = interpretation.description || cleanText.slice(0, 80);

        if (activeCards.length === 1) {
          const result = await createCardPurchaseFromMessage({
            workspaceId,
            userId: linkedByUid,
            cardId: activeCards[0].id,
            amountCents: interpretation.amountCents,
            description,
            categoryId,
            installments: interpretation.installments,
            purchaseDate: new Date(),
          });

          const catSuffix = result.categoryName ? ` (${result.categoryName})` : '';
          const installmentSuffix = interpretation.installments > 1 ? ` em ${interpretation.installments}x` : '';
          await sendWhatsAppMessage(
            phone,
            `✅ Compra registrada no ${result.cardName}${installmentSuffix}: ${formatBRL(result.amountCents)} — ${result.description}${catSuffix}`,
          );
          return;
        }

        await setPendingCardPurchase(db, phone, {
          workspaceId,
          userId: linkedByUid,
          amountCents: interpretation.amountCents,
          description,
          installments: interpretation.installments,
          categoryId,
          candidates: activeCards,
        });

        const list = activeCards.map((c, i) => `${i + 1} - ${c.label}`).join('\n');
        await sendWhatsAppMessage(
          phone,
          `Você tem mais de um cartão. Qual usar?\n${list}\n\nResponda com o número em até 3 minutos.`,
        );
        return;
      }

      // ── Despesa ou receita — daqui pra baixo intent e 'expense' | 'income' ──
      if (interpretation.confidence === 'low' || interpretation.amountCents <= 0) {
        await sendWhatsAppMessage(
          phone,
          'Não consegui entender o valor. Pode reformular? Ex: "gastei 15 reais no mercado"',
        );
        return;
      }

      const accountsSnap = await db
        .collection(`workspaces/${workspaceId}/accounts`)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      const defaultAccountId = accountsSnap.docs[0]?.id;
      if (!defaultAccountId) {
        await sendWhatsAppMessage(
          phone,
          'Você ainda não tem uma conta cadastrada no Granativa. Crie uma conta primeiro pelo app.',
        );
        return;
      }

      const categoryId = await resolveOrCreateCategory(workspaceId, linkedByUid, interpretation.intent, interpretation, categories);

      const result = await createTransactionFromMessage({
        workspaceId,
        userId: linkedByUid,
        type: interpretation.intent,
        amountCents: interpretation.amountCents,
        description: interpretation.description || cleanText.slice(0, 80),
        categoryId,
        accountId: defaultAccountId,
        date: new Date(),
        source: 'whatsapp',
      });

      const catSuffix = result.categoryName ? ` (${result.categoryName})` : '';
      const confirmation = interpretation.intent === 'income'
        ? `💰 Receita registrada: ${formatBRL(result.amountCents)} — ${result.description}${catSuffix}`
        : `✅ Registrado: ${formatBRL(result.amountCents)} — ${result.description}${catSuffix}`;

      await sendWhatsAppMessage(phone, confirmation);

      logger.info('whatsapp_transaction_created', {
        phone,
        workspaceId,
        transactionId: result.id,
        type: interpretation.intent,
        amountCents: result.amountCents,
      });
    } catch (err) {
      logger.error('whatsapp_webhook_error', { message: (err as Error).message });
    }
  },
);
