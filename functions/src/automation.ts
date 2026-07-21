import { type DocumentReference, FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { sendPushToUser } from './push.js';
import { transactionAccountEffects } from './shared/accountEffects.js';

const region = 'southamerica-east1';

function nowInBRT(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function currentYearMonth(): string {
  const d = nowInBRT();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Mantido em sincronia com nextOccurrenceDate em src/finance/financeService.ts —
// setMonth/setFullYear transbordam quando o mês alvo é mais curto (31/jan viraria
// 3/mar, pulando fevereiro). Em vez disso, clampamos no último dia válido do mês
// alvo, usando anchorDay (dia originalmente pretendido) quando disponível, para
// que a ocorrência "volte" pro dia 31 assim que um mês de 31 dias aparecer.
function nextOccurrenceDate(current: Date, frequency: 'weekly' | 'monthly' | 'yearly', anchorDay?: number): Date {
  if (frequency === 'weekly') {
    const next = new Date(current);
    next.setDate(next.getDate() + 7);
    return next;
  }

  const day = anchorDay ?? current.getDate();
  const targetYear = frequency === 'yearly' ? current.getFullYear() + 1 : current.getFullYear();
  const targetMonth = frequency === 'yearly' ? current.getMonth() : current.getMonth() + 1;
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(day, daysInTargetMonth);

  return new Date(
    targetYear,
    targetMonth,
    clampedDay,
    current.getHours(),
    current.getMinutes(),
    current.getSeconds(),
    current.getMilliseconds()
  );
}

// Mantido em sincronia com `recurringOccurrenceTransactionId` em src/finance/financeService.ts.
// Id determinístico por (regra, ocorrência): faz o "Registrar" do app e esta função
// gravarem no MESMO documento, em vez de criarem duas despesas para a mesma ocorrência.
// A data sai em UTC (`toISOString`) porque o app roda em BRT e esta função em UTC — ler o
// dia no fuso local daria chaves diferentes para o mesmo instante.
function recurringOccurrenceTransactionId(ruleId: string, occurrenceAt: Date): string {
  return `${ruleId}_${occurrenceAt.toISOString().slice(0, 10)}`;
}

function formatBRL(amountCents: number): string {
  return (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── closeInvoicesDue ─────────────────────────────────────────────────────────
// Roda todo dia à meia-noite (BRT). Fecha as faturas de cartões cujo
// dia de fechamento é hoje. Sem isso, o fechamento depende do usuário
// abrir o app e clicar manualmente.
export const closeInvoicesDue = onSchedule(
  { schedule: '0 0 * * *', timeZone: 'America/Sao_Paulo', region, maxInstances: 1 },
  async () => {
    const db = getFirestore();
    const today = nowInBRT().getDate();
    const currentMonth = currentYearMonth();
    let closed = 0;

    const cardsSnap = await db
      .collectionGroup('cards')
      .where('closingDay', '==', today)
      .where('isActive', '==', true)
      .get();

    for (const cardDoc of cardsSnap.docs) {
      try {
        const card = cardDoc.data() as {
          workspaceId: string;
          ownerUserId?: string;
          name: string;
        };
        const { workspaceId, ownerUserId } = card;
        const cardId = cardDoc.id;

        const invoicesSnap = await db
          .collection(`workspaces/${workspaceId}/cards/${cardId}/invoices`)
          .where('status', '==', 'open')
          .where('referenceMonth', '<=', currentMonth)
          .get();

        for (const invoiceDoc of invoicesSnap.docs) {
          await invoiceDoc.ref.update({
            status: 'closed',
            updatedAt: FieldValue.serverTimestamp(),
          });
          closed++;

          if (ownerUserId) {
            // outstandingBalanceCents e mantido incrementalmente por
            // invoiceLedgerEntryTrigger.ts — não precisa mais resomar o ledger aqui.
            const outstandingCents = (invoiceDoc.data().outstandingBalanceCents as number | undefined) ?? 0;

            await sendPushToUser(
              ownerUserId,
              `Fatura ${card.name} fechada`,
              `Valor a pagar: ${formatBRL(outstandingCents)}`,
              'https://granativa.com.br/app/cards'
            ).catch(() => {});
          }
        }
      } catch (err) {
        logger.error('closeInvoicesDue: erro ao processar card — pulando', err);
      }
    }

    logger.info('close_invoices_finished', { today, currentMonth, closed });
  }
);

// ─── generateRecurrences ──────────────────────────────────────────────────────
// Roda todo dia às 6h (BRT). Busca todas as regras de recorrência vencidas e
// cria as transações automaticamente. Sem isso, o usuário precisa abrir o app
// e clicar "Registrar" em cada recorrência.
export const generateRecurrences = onSchedule(
  { schedule: '0 6 * * *', timeZone: 'America/Sao_Paulo', region, maxInstances: 1 },
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();
    const nowDate = nowInBRT();
    const monthKey = currentYearMonth();
    let generated = 0;
    let skipped = 0;

    const rulesSnap = await db
      .collectionGroup('recurring')
      .where('isActive', '==', true)
      .where('nextOccurrenceAt', '<=', now)
      .get();

    for (const ruleDoc of rulesSnap.docs) {
      try {
        const rule = ruleDoc.data() as {
          workspaceId: string;
          createdBy: string;
          description: string;
          amountCents?: number;
          accountId?: string;
          categoryId?: string;
          frequency: 'weekly' | 'monthly' | 'yearly';
          nextOccurrenceAt: Timestamp;
          anchorDay?: number;
        };
  
        const occurrenceAt = rule.nextOccurrenceAt.toDate();
        const nextDate = nextOccurrenceDate(occurrenceAt, rule.frequency, rule.anchorDay);
  
        // Sem valor: cria um compromisso (Bill) pendente pra pessoa preencher quando chegar.
        if (!rule.amountCents) {
          const billId = recurringOccurrenceTransactionId(ruleDoc.id, occurrenceAt);
          const billRef = db.doc(`workspaces/${rule.workspaceId}/bills/${billId}`);
          const alreadyCreatedBill = (await billRef.get()).exists;
  
          if (!alreadyCreatedBill) {
            await billRef.set({
              id: billId,
              workspaceId: rule.workspaceId,
              description: rule.description,
              amountCents: 0,
              dueDate: Timestamp.fromDate(occurrenceAt),
              status: 'pending',
              categoryId: rule.categoryId ?? '',
              accountId: rule.accountId ?? '',
              recurringId: ruleDoc.id,
              createdBy: rule.createdBy,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            generated++;
          } else {
            skipped++;
          }
  
          await ruleDoc.ref.update({
            nextOccurrenceAt: Timestamp.fromDate(nextDate),
            updatedAt: FieldValue.serverTimestamp(),
          });
          continue;
        }
  
        // Sem conta definida não há como criar a transação
        if (!rule.accountId) {
          await ruleDoc.ref.update({
            nextOccurrenceAt: Timestamp.fromDate(nextDate),
            updatedAt: FieldValue.serverTimestamp(),
          });
          skipped++;
          continue;
        }
  
        const txnId = recurringOccurrenceTransactionId(ruleDoc.id, occurrenceAt);
        const txnRef = db.doc(`workspaces/${rule.workspaceId}/transactions/${txnId}`);
  
        // A pessoa pode ter clicado "Registrar" nesta mesma ocorrência antes das 6h. O id
        // determinístico faz as duas escritas caírem no mesmo documento: aqui só avançamos a
        // data (e não mandamos push), em vez de gravar a despesa de novo por cima.
        const alreadyRecorded = (await txnRef.get()).exists;
  
        if (alreadyRecorded) {
          await ruleDoc.ref.update({
            nextOccurrenceAt: Timestamp.fromDate(nextDate),
            updatedAt: FieldValue.serverTimestamp(),
          });
          skipped++;
          continue;
        }
  
        const txnPayload: Record<string, unknown> = {
          id: txnId,
          workspaceId: rule.workspaceId,
          createdBy: rule.createdBy,
          updatedBy: rule.createdBy,
          type: 'expense',
          amountCents: rule.amountCents,
          description: rule.description,
          accountId: rule.accountId,
          date: Timestamp.fromDate(nowDate),
          competenceMonth: monthKey,
          cashMonth: monthKey,
          tags: ['recorrente'],
          isRecurring: true,
          recurringId: ruleDoc.id,
          clientMutationId: txnId,
          syncStatus: 'synced',
          version: 1,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
  
        if (rule.categoryId) {
          txnPayload.categoryId = rule.categoryId;
        }
  
        const batch = db.batch();
        batch.set(txnRef, txnPayload);
        batch.update(ruleDoc.ref, {
          nextOccurrenceAt: Timestamp.fromDate(nextDate),
          updatedAt: FieldValue.serverTimestamp(),
        });
        for (const effect of transactionAccountEffects({ type: 'expense', amountCents: rule.amountCents, accountId: rule.accountId })) {
          batch.update(db.doc(`workspaces/${rule.workspaceId}/accounts/${effect.accountId}`), {
            currentBalanceCents: FieldValue.increment(effect.deltaCents),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
        generated++;
  
        await sendPushToUser(
          rule.createdBy,
          `Conta recorrente: ${rule.description}`,
          `${formatBRL(rule.amountCents)} registrado automaticamente.`
        ).catch(() => {});
      } catch (err) {
        logger.error(`generateRecurrences: erro ao processar regra — pulando`, err);
      }
    }

    logger.info('generate_recurrences_finished', { generated, skipped });
  }
);

// ─── sendDueReminders ─────────────────────────────────────────────────────────
// Roda todo dia às 8h (BRT). Envia push para contas a pagar (bills) com
// vencimento nos próximos 3 dias. O usuário é avisado antes de esquecer.
export const sendDueReminders = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'America/Sao_Paulo', region, maxInstances: 1 },
  async () => {
    const db = getFirestore();
    const now = nowInBRT();
    const threeDaysAhead = new Date(now);
    threeDaysAhead.setDate(threeDaysAhead.getDate() + 3);

    const fromTs = Timestamp.fromDate(now);
    const toTs = Timestamp.fromDate(threeDaysAhead);
    let sent = 0;

    const billsSnap = await db
      .collectionGroup('bills')
      .where('status', '==', 'pending')
      .where('dueDate', '>=', fromTs)
      .where('dueDate', '<=', toTs)
      .get();

    for (const billDoc of billsSnap.docs) {
      try {
        const bill = billDoc.data() as {
          createdBy: string;
        description: string;
        amountCents: number;
        dueDate: Timestamp;
      };

      const dayLabel = bill.dueDate.toDate().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      });

      await sendPushToUser(
        bill.createdBy,
        'Conta vence em breve',
        `${bill.description}: ${formatBRL(bill.amountCents)} vence em ${dayLabel}`,
        'https://granativa.com.br/app/bills'
      ).catch(() => {});
      sent++;
      } catch (err) {
        logger.error('sendDueReminders: erro ao processar bill — pulando', err);
      }
    }

    logger.info('due_reminders_finished', { sent });
  }
);

// ─── sendDailyLogReminder ─────────────────────────────────────────────────────
// Roda todo dia às 20h (BRT). Envia push personalizado com o nome do usuário,
// usando um pool de mensagens variadas pra não ficar repetitivo. Stale tokens
// são limpos por usuário (mesmo padrão do sendPushToUser).
const DAILY_REMINDER_MESSAGES: string[] = [
  'Como foi o dia, {name}? Não esquece de registrar seus gastos.',
  '{name}, passou um café hoje? Registra aí!',
  'Boa noite, {name}! Dá 2 minutinhos pro seu dinheiro?',
  '{name}, todo centavo registrado é um centavo sob controle.',
  'Fechou as contas do dia, {name}? Passa a régua aí.',
  'Seu futuro eu agradece, {name}. Registra os gastos de hoje!',
  '{name}, o pix, o docinho, o busão… deu pra anotar tudo?',
  'Antes de dormir, {name}: já registrou o que gastou hoje?',
  '{name}, 2 minutinhos agora = zero surpresa no fim do mês.',
  'O dinheiro some se você não der nome pra ele, {name}. Bora registrar!',
  'Não deixa pra amanhã o registro que você pode fazer hoje, {name}.',
  '{name}, seu Granativa tá te esperando. Registra os gastos de hoje?',
];

function pickDailyMessage(name: string): string {
  const template = DAILY_REMINDER_MESSAGES[Math.floor(Math.random() * DAILY_REMINDER_MESSAGES.length)];
  return template.replace('{name}', name);
}

function extractUserIdFromTokenPath(docPath: string): string | null {
  const parts = docPath.split('/');
  return parts[1] ?? null;
}

export const sendDailyLogReminder = onSchedule(
  { schedule: '0 20 * * *', timeZone: 'America/Sao_Paulo', region, maxInstances: 1 },
  async () => {
    const db = getFirestore();

    // Agrupa tokens por usuário em vez de mandar tudo num multicast cego.
    const tokensSnap = await db.collectionGroup('fcmTokens').get();
    if (tokensSnap.empty) return;

    const byUser = new Map<string, { token: string; ref: DocumentReference }[]>();
    const userIds = new Set<string>();

    for (const doc of tokensSnap.docs) {
      const userId = extractUserIdFromTokenPath(doc.ref.path);
      const token = doc.data().token as string | undefined;
      if (!userId || !token) continue;

      if (!byUser.has(userId)) byUser.set(userId, []);
      byUser.get(userId)!.push({ token, ref: doc.ref });
      userIds.add(userId);
    }

    if (userIds.size === 0) return;

    // Lê nomes de perfil em batch (até 1 leitura por usuário).
    const profileSnaps = await db.getAll(
      ...[...userIds].map((uid) => db.doc(`users/${uid}`))
    );
    const nameByUser = new Map<string, string>();
    for (const snap of profileSnaps) {
      if (!snap.exists) continue;
      const data = snap.data() as { name?: string; displayName?: string };
      nameByUser.set(snap.id, data?.name || data?.displayName || '');
    }

    const DEFAULT_NAME = '';
    const messaging = getMessaging();
    let sentUsers = 0;
    let staleRemoved = 0;

    for (const [userId, entries] of byUser) {
      try {
        const displayName = nameByUser.get(userId) ?? DEFAULT_NAME;
      const name = displayName || 'você';
      const body = pickDailyMessage(name);

      const tokens = entries.map((e) => e.token);

      const response = await messaging.sendEachForMulticast({
        tokens,
        webpush: {
          notification: {
            title: 'Hora de registrar!',
            body,
            icon: '/brand/granativa-app-icon-192.png',
            badge: '/brand/granativa-app-icon-192.png',
          },
          fcmOptions: { link: 'https://granativa.com.br/app/transactions/new' },
        },
      });

      // Limpa tokens stale (dispositivo desinstalado/revogado) — mesmo padrão do push.ts.
      const staleRefs = response.responses
        .map((r, i) => ({ ok: r.success, entry: entries[i] }))
        .filter(({ ok }) => !ok)
        .map(({ entry }) => entry.ref);

      if (staleRefs.length > 0) {
        await Promise.all(staleRefs.map((ref) => ref.delete()));
        staleRemoved += staleRefs.length;
      }

      sentUsers++;
      } catch (err) {
        logger.error('sendDailyLogReminder: erro — pulando', err);
      }
    }

    logger.info('daily_log_reminder_finished', { sentUsers, staleRemoved });
  }
);
