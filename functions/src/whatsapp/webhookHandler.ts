import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import crypto from 'crypto';
import { sendWhatsAppMessage, getVerifyToken, whatsappAccessToken } from './metaClient.js';
import { interpretMessage, type AccountOption, type CategoryOption, type MessageInterpretation } from './interpretMessage.js';
import { createTransactionFromMessage } from './createTransactionFromMessage.js';
import { createCategoryFromMessage } from './createCategoryFromMessage.js';
import { createCardPurchaseFromMessage } from './createCardPurchaseFromMessage.js';
import { answerFinancialQuestion } from './answerFinancialQuestion.js';
import { processLinkCode } from './linkAccount.js';
import {
  getPendingAction,
  setPendingAction,
  clearPendingAction,
  resolveSingleSelection,
  resolveDualSelection,
} from './pendingAction.js';
import { resolveDebitCreditAccount, resolveTransferSide, accountCandidates, type AccountRow } from './accountResolution.js';
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

      // ── Pergunta pendente: bot tinha perguntado qual cartao/conta usar ──
      const pending = await getPendingAction(db, phone);
      if (pending) {
        await clearPendingAction(db, phone);

        if (pending.kind === 'card_purchase') {
          const resolvedCardId = resolveSingleSelection(cleanText, pending.candidates);
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
        } else if (pending.kind === 'debit_credit') {
          const resolvedAccountId = resolveSingleSelection(cleanText, pending.candidates);
          if (resolvedAccountId) {
            const result = await createTransactionFromMessage({
              workspaceId: pending.workspaceId,
              userId: pending.userId,
              type: pending.type,
              amountCents: pending.amountCents,
              description: pending.description,
              categoryId: pending.categoryId,
              accountId: resolvedAccountId,
              date: new Date(),
              source: 'whatsapp',
            });

            const catSuffix = result.categoryName ? ` (${result.categoryName})` : '';
            const confirmation = pending.type === 'income'
              ? `💰 Receita registrada: ${formatBRL(result.amountCents)} — ${result.description}${catSuffix}`
              : `✅ Registrado: ${formatBRL(result.amountCents)} — ${result.description}${catSuffix}`;
            await sendWhatsAppMessage(phone, confirmation);
            return;
          }
        } else if (pending.kind === 'transfer') {
          let sourceAccountId = pending.sourceAccountId;
          let destinationAccountId = pending.destinationAccountId;

          if (pending.missing === 'both') {
            const resolved = resolveDualSelection(cleanText, pending.candidates);
            if (resolved) {
              sourceAccountId = resolved.sourceId;
              destinationAccountId = resolved.destinationId;
            }
          } else if (pending.missing === 'source') {
            sourceAccountId = resolveSingleSelection(cleanText, pending.candidates);
          } else {
            destinationAccountId = resolveSingleSelection(cleanText, pending.candidates);
          }

          if (sourceAccountId && destinationAccountId && sourceAccountId !== destinationAccountId) {
            const result = await createTransactionFromMessage({
              workspaceId: pending.workspaceId,
              userId: pending.userId,
              type: 'transfer',
              amountCents: pending.amountCents,
              description: pending.description,
              accountId: sourceAccountId,
              destinationAccountId,
              date: new Date(),
              source: 'whatsapp',
            });

            await sendWhatsAppMessage(
              phone,
              `🔄 Transferência registrada: ${formatBRL(result.amountCents)} — ${result.description}`,
            );
            return;
          }
          // Nao resolveu -> descarta a pendencia e segue o fluxo normal com esta mesma mensagem.
        }
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

      // ── Load contas ativas (usadas pra casar nome na mensagem e como fallback) ──
      const acctsSnap = await db
        .collection(`workspaces/${workspaceId}/accounts`)
        .where('isActive', '==', true)
        .get();

      const accounts: AccountRow[] = acctsSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
        isPrimary: d.data().isPrimary === true,
      }));

      const accountOptions: AccountOption[] = accounts.map((a) => ({ id: a.id, name: a.name }));

      // ── Interpretar a mensagem (intencao + extracao, uma unica chamada) ──
      const interpretation = await interpretMessage(cleanText, categories, accountOptions);

      if (!interpretation || interpretation.intent === 'unclear') {
        await sendWhatsAppMessage(
          phone,
          'Não entendi. Você pode:\n- Registrar um gasto: "gastei 15 reais no mercado"\n- Registrar uma receita: "recebi 200 reais de freela"\n- Registrar compra no cartão: "gastei 300 no cartão em 3x"\n- Transferir entre contas: "transfere 50 do nubank pro itaú"\n- Criar categoria: "cria uma categoria chamada Pet"\n- Perguntar sobre suas finanças: "quanto gastei esse mês?"',
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

      // ── Editar/excluir algo ja lancado (transacao, conta, meta, recorrencia) ──
      if (interpretation.intent === 'unsupported_action') {
        await sendWhatsAppMessage(
          phone,
          'Editar ou excluir algo que você já lançou é melhor fazer direto pelo app — evita eu mexer na coisa errada sem querer. Por aqui eu só crio lançamentos novos e respondo perguntas.',
        );
        return;
      }

      // ── Decisao financeira grande (emprestimo, investir reserva, renegociar divida) —
      // redireciona pro app: a Grazi por la tem historico de conversa e consegue ir e voltar
      // com a pessoa pra ajudar a pensar, o que o WhatsApp (mensagem isolada, sem memoria)
      // nao faz direito. O WhatsApp fica focado em lancamento e pergunta rapida do dia a dia.
      if (interpretation.intent === 'advisory_decision') {
        await sendWhatsAppMessage(
          phone,
          'Essa é uma decisão grande — vale mais a pena pensar nela com calma comigo lá no app, na aba Assistente. Lá a gente consegue ir e voltar na conversa direito. Por aqui eu foco em lançamentos e perguntas rápidas do dia a dia. 💛',
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

        await setPendingAction(db, phone, {
          kind: 'card_purchase',
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

      // ── Transferencia entre contas ───────────────────────────────────
      if (interpretation.intent === 'transfer') {
        if (interpretation.confidence === 'low' || interpretation.amountCents <= 0) {
          await sendWhatsAppMessage(
            phone,
            'Não consegui entender o valor da transferência. Pode reformular? Ex: "transfere 100 do nubank pro itaú"',
          );
          return;
        }

        if (accounts.length < 2) {
          await sendWhatsAppMessage(
            phone,
            'Você precisa ter pelo menos duas contas cadastradas pra transferir entre elas. Cadastre outra conta no app primeiro.',
          );
          return;
        }

        const description = interpretation.description || 'Transferência';

        let sourceAccountId: string | null = interpretation.sourceAccountId;
        let destinationAccountId: string | null = interpretation.destinationAccountId;

        if (sourceAccountId && !destinationAccountId) {
          destinationAccountId = resolveTransferSide(null, accounts, sourceAccountId);
        } else if (!sourceAccountId && destinationAccountId) {
          sourceAccountId = resolveTransferSide(null, accounts, destinationAccountId);
        }
        // Se nenhum dos dois lados foi identificado na mensagem, nao adivinha direcao —
        // melhor perguntar do que mover dinheiro pro lado errado.

        if (sourceAccountId && destinationAccountId && sourceAccountId !== destinationAccountId) {
          const result = await createTransactionFromMessage({
            workspaceId,
            userId: linkedByUid,
            type: 'transfer',
            amountCents: interpretation.amountCents,
            description,
            accountId: sourceAccountId,
            destinationAccountId,
            date: new Date(),
            source: 'whatsapp',
          });

          await sendWhatsAppMessage(
            phone,
            `🔄 Transferência registrada: ${formatBRL(result.amountCents)} — ${result.description}`,
          );

          logger.info('whatsapp_transaction_created', {
            phone, workspaceId, transactionId: result.id, type: 'transfer', amountCents: result.amountCents,
          });
          return;
        }

        const missing: 'source' | 'destination' | 'both' = !sourceAccountId && !destinationAccountId
          ? 'both'
          : !sourceAccountId
          ? 'source'
          : 'destination';

        const candidates = missing === 'both'
          ? accountCandidates(accounts)
          : missing === 'source'
          ? accountCandidates(accounts, destinationAccountId)
          : accountCandidates(accounts, sourceAccountId);

        await setPendingAction(db, phone, {
          kind: 'transfer',
          workspaceId,
          userId: linkedByUid,
          amountCents: interpretation.amountCents,
          description,
          sourceAccountId,
          destinationAccountId,
          missing,
          candidates,
        });

        const list = candidates.map((c, i) => `${i + 1} - ${c.label}`).join('\n');
        const question = missing === 'both'
          ? `Você tem mais de uma conta. De qual conta sai e pra qual vai a transferência?\n${list}\n\nResponda com dois números, tipo "1 2" (sai da 1, vai pra 2), em até 3 minutos.`
          : missing === 'source'
          ? `Você tem mais de uma conta. De qual conta sai a transferência?\n${list}\n\nResponda com o número em até 3 minutos.`
          : `Você tem mais de uma conta. Pra qual conta vai a transferência?\n${list}\n\nResponda com o número em até 3 minutos.`;

        await sendWhatsAppMessage(phone, question);
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

      if (accounts.length === 0) {
        await sendWhatsAppMessage(
          phone,
          'Você ainda não tem uma conta cadastrada no Granativa. Crie uma conta primeiro pelo app.',
        );
        return;
      }

      const categoryId = await resolveOrCreateCategory(workspaceId, linkedByUid, interpretation.intent, interpretation, categories);
      const description = interpretation.description || cleanText.slice(0, 80);
      const accountId = resolveDebitCreditAccount(interpretation.accountId, accounts);

      if (!accountId) {
        await setPendingAction(db, phone, {
          kind: 'debit_credit',
          workspaceId,
          userId: linkedByUid,
          type: interpretation.intent,
          amountCents: interpretation.amountCents,
          description,
          categoryId,
          candidates: accountCandidates(accounts),
        });

        const list = accountCandidates(accounts).map((c, i) => `${i + 1} - ${c.label}`).join('\n');
        const verb = interpretation.intent === 'income' ? 'entra' : 'sai';
        await sendWhatsAppMessage(
          phone,
          `Você tem mais de uma conta. De qual conta ${verb} esse valor?\n${list}\n\nResponda com o número em até 3 minutos.`,
        );
        return;
      }

      const result = await createTransactionFromMessage({
        workspaceId,
        userId: linkedByUid,
        type: interpretation.intent,
        amountCents: interpretation.amountCents,
        description,
        categoryId,
        accountId,
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
