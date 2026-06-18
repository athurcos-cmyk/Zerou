import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { sendPushToUser } from './push.js';

const db = getFirestore();
const region = 'southamerica-east1';

function nowInBRT(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function currentYearMonth(): string {
  const d = nowInBRT();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextOccurrenceDate(current: Date, frequency: 'weekly' | 'monthly' | 'yearly'): Date {
  const next = new Date(current);
  if (frequency === 'weekly') next.setDate(next.getDate() + 7);
  else if (frequency === 'monthly') next.setMonth(next.getMonth() + 1);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
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
            'https://zerou-five.vercel.app/app/cards'
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
      };

      // Sem valor ou conta definida não há como criar a transação
      if (!rule.amountCents || !rule.accountId) continue;

      const txnId = db.collection('x').doc().id;
      const nextDate = nextOccurrenceDate(rule.nextOccurrenceAt.toDate(), rule.frequency);

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
        'https://zerou-five.vercel.app/app/bills'
      ).catch(() => {});
      sent++;
    }

    logger.info('due_reminders_finished', { sent });
  }
);
