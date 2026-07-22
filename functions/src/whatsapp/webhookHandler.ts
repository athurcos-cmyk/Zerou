import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import crypto from 'crypto';
import { sendWhatsAppMessage, getVerifyToken, whatsappAppSecret } from './metaClient.js';
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
import { checkWhatsappTransactionUsageNotExceeded } from './whatsappTransactionRateLimit.js';
import {
  confirmExpense,
  confirmIncome,
  confirmTransfer,
  confirmCardPurchase,
  categoryCreatedMessage,
  categoryAlreadyExistsMessage,
  pendingChoicePrompt,
} from './messageFormat.js';

const region = 'southamerica-east1';

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
  { region, maxInstances: 10, memory: '512MiB', cpu: 1, secrets: [deepseekApiKey, whatsappAppSecret] },
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

    // ── Validação HMAC (X-Hub-Signature-256) ──────────────────────────────
    // A Meta assina o corpo CRU da requisição com o WHATSAPP_APP_SECRET. Comparamos com
    // `req.rawBody` (NÃO `JSON.stringify(req.body)` — não reproduz os bytes assinados) em
    // tempo constante. Sem assinatura válida, a requisição é forjada: rejeita ANTES de processar.
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const expected = `sha256=${crypto.createHmac('sha256', whatsappAppSecret.value()).update(req.rawBody).digest('hex')}`;
    const signatureValid =
      !!signature &&
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!signatureValid) {
      logger.warn('whatsappWebhook: assinatura HMAC ausente ou inválida — requisição rejeitada');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Assinatura OK — responde 200 rápido (Meta espera) e processa em seguida.
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

      const db: Firestore = getFirestore();

      // ── Dedup (WHATSAPP-05): a Meta reentrega webhooks (vimos vários retries hoje). Sem
      // isso, cada reentrega vira uma transação nova. `create()` é atômico (falha se já
      // existe), então claima o message_id ANTES de processar. Coleção Admin-only — nenhum
      // caminho de cliente a acessa (default-deny do Firestore protege, sem regra nova).
      const messageId = (msg.id as string | undefined)?.trim();
      if (messageId) {
        try {
          await db.doc(`whatsappProcessedMessages/${messageId}`).create({
            processedAt: FieldValue.serverTimestamp(),
            phone,
          });
        } catch {
          logger.info('whatsapp_duplicate_message_skipped', { messageId });
          return;
        }
      }

      // ── Check if it's a linking code ────────────────────────────────
      if (/vincular\s+\d{6}/i.test(cleanText)) {
        const reply = await processLinkCode(phone, cleanText);
        if (reply) {
          await sendWhatsAppMessage(phone, reply);
        }
        return;
      }

      // ── Look up workspace by phone number ───────────────────────────
      const indexDoc = await db.doc(`whatsappPhoneIndex/${phone}`).get();
      if (!indexDoc.exists) {
        await sendWhatsAppMessage(
          phone,
          '🔗 Seu WhatsApp ainda não está vinculado ao Granativa.\n\nVá em *Configurações > WhatsApp* no app pra conectar.',
        );
        return;
      }

      const link = indexDoc.data() as {
        workspaceId: string;
        linkedByUid: string;
      };
      const { workspaceId, linkedByUid } = link;
      if (!workspaceId || !linkedByUid) return;

      // ── Membership (WHATSAPP-04): confirma que o vínculo ainda é válido. O usuário pode ter
      // sido removido do workspace ou excluído a conta sem o índice ter sido limpo; sem esta
      // checagem, a mensagem escreveria num workspace órfão via Admin SDK (que ignora as rules).
      const memberDoc = await db.doc(`workspaces/${workspaceId}/members/${linkedByUid}`).get();
      if (!memberDoc.exists) {
        await sendWhatsAppMessage(
          phone,
          '🔗 Seu vínculo do WhatsApp não está mais ativo.\n\nVá em *Configurações > WhatsApp* no app pra reconectar.',
        );
        return;
      }

      // ── Rate limit diário de transações via WhatsApp ──
      try {
        await checkWhatsappTransactionUsageNotExceeded(db, workspaceId);
      } catch {
        await sendWhatsAppMessage(
          phone,
          '⏳ Você atingiu o limite diário de lançamentos pelo WhatsApp.\n\nVolte amanhã ou cadastre pelo app.',
        );
        return;
      }

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

            await sendWhatsAppMessage(
              phone,
              confirmCardPurchase({
                amountCents: result.amountCents,
                description: result.description,
                categoryName: result.categoryName,
                cardName: result.cardName,
                installments: pending.installments,
              }),
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

            const accountName = pending.candidates.find((c) => c.id === resolvedAccountId)?.label;
            const confirm = pending.type === 'income' ? confirmIncome : confirmExpense;
            await sendWhatsAppMessage(
              phone,
              confirm({
                amountCents: result.amountCents,
                description: result.description,
                categoryName: result.categoryName,
                accountName,
              }),
            );
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

            // Nome dos dois lados só sai de graça quando os dois estavam entre os candidatos
            // apresentados (caso `missing: 'both'`) — nos outros dois casos o lado já conhecido
            // não tem nome em mãos sem uma leitura extra, e a rota fica de fora da mensagem.
            const sourceAccountName = pending.candidates.find((c) => c.id === sourceAccountId)?.label;
            const destinationAccountName = pending.candidates.find((c) => c.id === destinationAccountId)?.label;

            await sendWhatsAppMessage(
              phone,
              confirmTransfer({
                amountCents: result.amountCents,
                description: result.description,
                sourceAccountName,
                destinationAccountName,
              }),
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
          '🤔 *Não entendi essa mensagem.*\n\nAqui está o que eu sei fazer:\n💸 Gasto — _"gastei 15 reais no mercado"_\n💰 Receita — _"recebi 200 reais de freela"_\n💳 Compra no cartão — _"gastei 300 no cartão em 3x"_\n🔄 Transferência — _"transfere 50 do nubank pro itaú"_\n🏷️ Categoria nova — _"cria uma categoria chamada Pet"_\n❓ Pergunta financeira — _"quanto gastei esse mês?"_',
        );
        return;
      }

      // ── Acao avancada de cartao (parcela em andamento, antecipar, renegociar) ──
      if (interpretation.intent === 'advanced_card_action') {
        await sendWhatsAppMessage(
          phone,
          '🧭 Isso aqui é mais avançado — dá uma olhada em *Cartões* no app pra fazer isso (parcela que já estava em andamento, antecipar parcela/fatura, renegociar).',
        );
        return;
      }

      // ── Editar/excluir algo ja lancado (transacao, conta, meta, recorrencia) ──
      if (interpretation.intent === 'unsupported_action') {
        await sendWhatsAppMessage(
          phone,
          '✋ Editar ou excluir algo que você já lançou é melhor fazer direto pelo app — evita eu mexer na coisa errada sem querer.\n\nPor aqui eu só crio lançamentos novos e respondo perguntas.',
        );
        return;
      }

      // ── Decisao financeira grande (emprestimo, investir reserva, renegociar divida) —
      // redireciona pro app: a Vic por la tem historico de conversa e consegue ir e voltar
      // com a pessoa pra ajudar a pensar, o que o WhatsApp (mensagem isolada, sem memoria)
      // nao faz direito. O WhatsApp fica focado em lancamento e pergunta rapida do dia a dia.
      if (interpretation.intent === 'advisory_decision') {
        await sendWhatsAppMessage(
          phone,
          '🧠 Essa é uma decisão grande — vale mais a pena pensar nela com calma comigo lá no app, na aba *Assistente*. Lá a gente consegue ir e voltar na conversa direito.\n\nPor aqui eu foco em lançamentos e perguntas rápidas do dia a dia. 💛',
        );
        return;
      }

      // ── Criar categoria (pedido explicito, nunca cria transacao junto) ──
      if (interpretation.intent === 'create_category') {
        if (!interpretation.newCategoryName) {
          await sendWhatsAppMessage(phone, '🤔 Não entendi o nome da categoria.\n\nEx: _"cria uma categoria chamada Pet"_');
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
          result.created ? categoryCreatedMessage(result.name) : categoryAlreadyExistsMessage(result.name),
        );
        return;
      }

      // ── Pergunta financeira (paridade com a Vic do app) ───────────
      if (interpretation.intent === 'question') {
        let usageRef;
        try {
          ({ usageRef } = await checkAiUsageNotExceeded(db, workspaceId));
        } catch {
          await sendWhatsAppMessage(
            phone,
            '⏳ Você atingiu o limite diário de perguntas para a Vic.\n\nVolte amanhã ou pergunte pelo app.',
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
            '🤔 Não consegui entender o valor.\n\nPode reformular? Ex: _"gastei 300 no cartão em 3x"_',
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
          await sendWhatsAppMessage(phone, '💳 Você ainda não tem cartão cadastrado.\n\nCadastre um no app primeiro.');
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

          await sendWhatsAppMessage(
            phone,
            confirmCardPurchase({
              amountCents: result.amountCents,
              description: result.description,
              categoryName: result.categoryName,
              cardName: result.cardName,
              installments: interpretation.installments,
            }),
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

        await sendWhatsAppMessage(
          phone,
          pendingChoicePrompt({
            emoji: '💳',
            question: 'Qual cartão usar?',
            labels: activeCards.map((c) => c.label),
            instructions: 'Responda com o número em até 3 minutos.',
          }),
        );
        return;
      }

      // ── Transferencia entre contas ───────────────────────────────────
      if (interpretation.intent === 'transfer') {
        if (interpretation.confidence === 'low' || interpretation.amountCents <= 0) {
          await sendWhatsAppMessage(
            phone,
            '🤔 Não consegui entender o valor da transferência.\n\nPode reformular? Ex: _"transfere 100 do nubank pro itaú"_',
          );
          return;
        }

        if (accounts.length < 2) {
          await sendWhatsAppMessage(
            phone,
            '🏦 Pra transferir você precisa de pelo menos duas contas (carteira, banco, dinheiro...) cadastradas.\n\nCadastre outra pelo app primeiro.',
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
            confirmTransfer({
              amountCents: result.amountCents,
              description: result.description,
              sourceAccountName: accounts.find((a) => a.id === sourceAccountId)?.name,
              destinationAccountName: accounts.find((a) => a.id === destinationAccountId)?.name,
            }),
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

        const question = missing === 'both'
          ? 'De qual conta sai e pra qual vai a transferência?'
          : missing === 'source'
          ? 'De qual conta sai a transferência?'
          : 'Pra qual conta vai a transferência?';
        const instructions = missing === 'both'
          ? 'Responda com dois números, tipo "1 2" (sai da 1, vai pra 2), em até 3 minutos.'
          : 'Responda com o número em até 3 minutos.';

        await sendWhatsAppMessage(
          phone,
          pendingChoicePrompt({ emoji: '🔄', question, labels: candidates.map((c) => c.label), instructions }),
        );
        return;
      }

      // ── Despesa ou receita — daqui pra baixo intent e 'expense' | 'income' ──
      if (interpretation.confidence === 'low' || interpretation.amountCents <= 0) {
        await sendWhatsAppMessage(
          phone,
          '🤔 Não consegui entender o valor.\n\nPode reformular? Ex: _"gastei 15 reais no mercado"_',
        );
        return;
      }

      if (accounts.length === 0) {
        await sendWhatsAppMessage(
          phone,
          '🏦 Você ainda não cadastrou nenhuma conta (carteira, banco, dinheiro...) no Granativa.\n\nCrie uma pelo app antes de registrar gastos por aqui.',
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

        const verb = interpretation.intent === 'income' ? 'entra' : 'sai';
        await sendWhatsAppMessage(
          phone,
          pendingChoicePrompt({
            emoji: interpretation.intent === 'income' ? '💰' : '💸',
            question: `De qual conta ${verb} esse valor?`,
            labels: accountCandidates(accounts).map((c) => c.label),
            instructions: 'Responda com o número em até 3 minutos.',
          }),
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

      const accountName = accounts.find((a) => a.id === accountId)?.name;
      const confirm = interpretation.intent === 'income' ? confirmIncome : confirmExpense;
      await sendWhatsAppMessage(
        phone,
        confirm({
          amountCents: result.amountCents,
          description: result.description,
          categoryName: result.categoryName,
          accountName,
        }),
      );

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
