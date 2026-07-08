import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { sendPushToUser } from './push.js';

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
        const invoice = invoiceDoc.data() as { outstandingBalanceCents?: number };

        await invoiceDoc.ref.update({
          status: 'closed',
          updatedAt: FieldValue.serverTimestamp(),
        });
        closed++;

        if (ownerUserId) {
          const amount = formatBRL(invoice.outstandingBalanceCents ?? 0);
          await sendPushToUser(
            ownerUserId,
            `Fatura ${card.name} fechada`,
            `Valor a pagar: ${amount}`,
            'https://granativa.com.br/app/cards'
          ).catch(() => {});
        }
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

    const rulesSnap = await db
      .collectionGroup('recurring')
      .where('isActive', '==', true)
      .where('nextOccurrenceAt', '<=', now)
      .get();

    for (const ruleDoc of rulesSnap.docs) {
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

      // Sem valor ou conta definida não há como criar a transação
      if (!rule.amountCents || !rule.accountId) continue;

      const txnId = db.collection('x').doc().id;
      const nextDate = nextOccurrenceDate(rule.nextOccurrenceAt.toDate(), rule.frequency, rule.anchorDay);

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
      batch.set(db.doc(`workspaces/${rule.workspaceId}/transactions/${txnId}`), txnPayload);
      batch.update(ruleDoc.ref, {
        nextOccurrenceAt: Timestamp.fromDate(nextDate),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      generated++;

      await sendPushToUser(
        rule.createdBy,
        `Recorrência: ${rule.description}`,
        `${formatBRL(rule.amountCents)} registrado automaticamente.`
      ).catch(() => {});
    }

    logger.info('generate_recurrences_finished', { generated });
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
    }

    logger.info('due_reminders_finished', { sent });
  }
);

// ─── sendDailyLogReminder ─────────────────────────────────────────────────────
// Roda todo dia às 20h (BRT). Envia push para todos os usuários com token FCM
// lembrando de registrar os gastos do dia antes de dormir.
export const sendDailyLogReminder = onSchedule(
  { schedule: '0 20 * * *', timeZone: 'America/Sao_Paulo', region, maxInstances: 1 },
  async () => {
    const db = getFirestore();
    const tokensSnap = await db.collectionGroup('fcmTokens').get();
    if (tokensSnap.empty) return;

    const tokens = tokensSnap.docs
      .map((d) => d.data().token as string)
      .filter(Boolean);

    if (tokens.length === 0) return;

    const CHUNK = 500;
    let sent = 0;

    for (let i = 0; i < tokens.length; i += CHUNK) {
      const chunk = tokens.slice(i, i + CHUNK);
      await getMessaging().sendEachForMulticast({
        tokens: chunk,
        webpush: {
          notification: {
            title: 'Como foi o dia?',
            body: 'Registre seus gastos antes de dormir.',
            icon: '/brand/zerou-app-icon-192.png',
            badge: '/brand/zerou-app-icon-192.png',
          },
          fcmOptions: { link: 'https://granativa.com.br/app/transactions/new' },
        },
      });
      sent += chunk.length;
    }

    logger.info('daily_log_reminder_finished', { sent });
  }
);
