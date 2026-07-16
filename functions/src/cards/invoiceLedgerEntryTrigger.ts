import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import type { InvoiceLedgerEntryType } from './invoiceTotals.js';
import { invoiceTotalsDeltaForEntry, outstandingFromTotals } from './invoiceTotals.js';

/**
 * Mantém os totais da fatura (purchasesTotalCents, paymentsTotalCents, creditsTotalCents,
 * feesTotalCents, outstandingBalanceCents, overpaidCreditCents) sempre prontos, incrementados
 * a cada entrada nova de ledger — em vez de recalcular somando o ledger inteiro toda vez que o
 * app abre (o que hoje custa até 1.500+ leituras por reabertura e nunca populou de verdade
 * `outstandingBalanceCents`, fazendo a Grazi/WhatsApp sempre reportar R$ 0,00).
 *
 * Idempotente contra reentrega do gatilho: `processedLedgerEntryIds` guarda os ids já
 * processados, checado dentro de uma transação (mesmo padrão de
 * `claimBillingEvent` em `../billing/billingEventProcessor.ts`).
 */
export async function applyLedgerEntryToInvoiceTotals(
  db: Firestore,
  workspaceId: string,
  cardId: string,
  invoiceId: string,
  entryId: string,
  entry: { type: InvoiceLedgerEntryType; amountCents: number }
): Promise<void> {
  const invoiceRef = db.doc(`workspaces/${workspaceId}/cards/${cardId}/invoices/${invoiceId}`);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(invoiceRef);

    if (!snapshot.exists) {
      return;
    }

    const invoice = snapshot.data() as {
      purchasesTotalCents?: number;
      paymentsTotalCents?: number;
      creditsTotalCents?: number;
      feesTotalCents?: number;
      processedLedgerEntryIds?: string[];
    };

    if ((invoice.processedLedgerEntryIds ?? []).includes(entryId)) {
      return;
    }

    const delta = invoiceTotalsDeltaForEntry(entry.type, entry.amountCents);
    const totals = {
      purchasesTotalCents: (invoice.purchasesTotalCents ?? 0) + delta.purchasesTotalCents,
      paymentsTotalCents: (invoice.paymentsTotalCents ?? 0) + delta.paymentsTotalCents,
      creditsTotalCents: (invoice.creditsTotalCents ?? 0) + delta.creditsTotalCents,
      feesTotalCents: (invoice.feesTotalCents ?? 0) + delta.feesTotalCents,
    };
    const outstanding = outstandingFromTotals(totals);

    transaction.update(invoiceRef, {
      ...totals,
      ...outstanding,
      processedLedgerEntryIds: FieldValue.arrayUnion(entryId),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

const region = 'southamerica-east1';

export const onInvoiceLedgerEntryCreated = onDocumentCreated(
  {
    document: 'workspaces/{workspaceId}/cards/{cardId}/invoices/{invoiceId}/ledger/{entryId}',
    region,
    maxInstances: 10,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const entry = snapshot.data() as { type?: InvoiceLedgerEntryType; amountCents?: number };
    if (!entry.type || typeof entry.amountCents !== 'number') return;

    const { workspaceId, cardId, invoiceId, entryId } = event.params;
    const db = snapshot.ref.firestore;

    await applyLedgerEntryToInvoiceTotals(db, workspaceId, cardId, invoiceId, entryId, {
      type: entry.type,
      amountCents: entry.amountCents,
    });
  }
);
