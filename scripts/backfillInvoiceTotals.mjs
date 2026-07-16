#!/usr/bin/env node
// Duas fases, nesta ordem, pra toda fatura de todo cartão de todo workspace:
//
// 1. Reversão retroativa: para toda transação `card_purchase` já excluída ANTES deste
//    backfill existir (portanto sem o `purchase_reversal` que `reverseCardPurchaseOnDelete`
//    passa a gerar dali em diante), cria as entradas de ledger que faltam.
// 2. Recomputa os totais da fatura (`purchasesTotalCents`, `paymentsTotalCents`,
//    `creditsTotalCents`, `feesTotalCents`, `outstandingBalanceCents`, `overpaidCreditCents`)
//    do ZERO somando o ledger inteiro (com o `purchase_reversal` retroativo já incluído) e
//    grava `processedLedgerEntryIds` com todos os ids vistos — dali em diante os totais são
//    mantidos incrementalmente por `functions/src/cards/invoiceLedgerEntryTrigger.ts`.
//
// Uso único. Mesma lógica de soma que `src/domain/invoices/calculateInvoice.ts` — mantenha em
// sincronia manualmente se aquela mudar.
import { initAdminApp } from './backfillShared.mjs';

const DEBIT_TYPES = new Set(['purchase', 'manual_debit', 'installment_anticipation']);
const FEE_TYPES = new Set(['interest', 'fine', 'iof', 'fee']);
const PAYMENT_TYPES = new Set(['payment', 'advance_payment']);
const CREDIT_TYPES = new Set([
  'refund_credit',
  'chargeback_credit',
  'manual_credit',
  'installment_anticipation_credit',
  'purchase_reversal'
]);

function idempotentEntryId(key) {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140);
}

function deltaFor(type, amountCents) {
  if (DEBIT_TYPES.has(type)) return { purchasesTotalCents: amountCents };
  if (FEE_TYPES.has(type)) return { feesTotalCents: amountCents };
  if (PAYMENT_TYPES.has(type)) return { paymentsTotalCents: amountCents };
  if (CREDIT_TYPES.has(type)) return { creditsTotalCents: amountCents };
  return {};
}

async function reverseDeletedPurchases(db, workspaceId) {
  const transactionsSnap = await db
    .collection(`workspaces/${workspaceId}/transactions`)
    .where('type', '==', 'card_purchase')
    .get();

  const deletedPurchases = transactionsSnap.docs.filter((doc) => doc.data().deletedAt);
  let created = 0;

  for (const txnDoc of deletedPurchases) {
    const txn = txnDoc.data();
    const ledgerSnap = await db
      .collectionGroup('ledger')
      .where('workspaceId', '==', workspaceId)
      .where('sourceTransactionId', '==', txnDoc.id)
      .get();

    const batch = db.batch();
    let queued = 0;

    for (const entryDoc of ledgerSnap.docs) {
      const entry = entryDoc.data();
      if (entry.type === 'purchase_reversal') continue;
      if (typeof entry.amountCents !== 'number' || !entry.cardId || !entry.invoiceId) continue;

      const idempotencyKey = `${txnDoc.id}_reversal_${entryDoc.id}`;
      const reversalId = idempotentEntryId(idempotencyKey);
      const reversalRef = db.doc(
        `workspaces/${workspaceId}/cards/${entry.cardId}/invoices/${entry.invoiceId}/ledger/${reversalId}`
      );

      if ((await reversalRef.get()).exists) continue;

      batch.set(reversalRef, {
        id: reversalId,
        invoiceId: entry.invoiceId,
        cardId: entry.cardId,
        workspaceId,
        type: 'purchase_reversal',
        amountCents: entry.amountCents,
        effectiveAt: new Date(),
        sourceTransactionId: txnDoc.id,
        idempotencyKey,
        createdBy: txn.updatedBy ?? txn.createdBy ?? '',
        createdAt: new Date()
      });
      queued++;
    }

    if (queued > 0) {
      await batch.commit();
      created += queued;
      console.log(`  [${workspaceId}] compra excluída ${txnDoc.id}: ${queued} reversão(ões) retroativa(s) criada(s)`);
    }
  }

  return created;
}

async function recomputeInvoiceTotals(db, workspaceId) {
  const cardsSnap = await db.collection(`workspaces/${workspaceId}/cards`).get();
  let totalInvoices = 0;
  let totalChanged = 0;

  for (const cardDoc of cardsSnap.docs) {
    const invoicesSnap = await db.collection(`workspaces/${workspaceId}/cards/${cardDoc.id}/invoices`).get();

    for (const invoiceDoc of invoicesSnap.docs) {
      const ledgerSnap = await db
        .collection(`workspaces/${workspaceId}/cards/${cardDoc.id}/invoices/${invoiceDoc.id}/ledger`)
        .get();

      const seen = new Set();
      const totals = { purchasesTotalCents: 0, paymentsTotalCents: 0, creditsTotalCents: 0, feesTotalCents: 0 };
      const processedIds = [];

      for (const entryDoc of ledgerSnap.docs) {
        const entry = entryDoc.data();
        const dedupeKey = entry.idempotencyKey ?? entryDoc.id;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        processedIds.push(entryDoc.id);

        const delta = deltaFor(entry.type, entry.amountCents ?? 0);
        for (const [key, value] of Object.entries(delta)) {
          totals[key] += value;
        }
      }

      const rawBalance = totals.purchasesTotalCents + totals.feesTotalCents - totals.paymentsTotalCents - totals.creditsTotalCents;
      const outstandingBalanceCents = Math.max(rawBalance, 0);
      const overpaidCreditCents = Math.max(-rawBalance, 0);

      const invoice = invoiceDoc.data();
      totalInvoices++;

      const changed =
        invoice.outstandingBalanceCents !== outstandingBalanceCents ||
        invoice.purchasesTotalCents !== totals.purchasesTotalCents ||
        invoice.paymentsTotalCents !== totals.paymentsTotalCents ||
        invoice.creditsTotalCents !== totals.creditsTotalCents ||
        invoice.feesTotalCents !== totals.feesTotalCents;

      if (changed) {
        totalChanged++;
        console.log(
          `  [${workspaceId}] fatura ${cardDoc.id}/${invoiceDoc.id}: outstanding ${invoice.outstandingBalanceCents ?? '(vazio)'} -> ${outstandingBalanceCents}`
        );
      }

      await invoiceDoc.ref.update({
        ...totals,
        outstandingBalanceCents,
        overpaidCreditCents,
        processedLedgerEntryIds: processedIds,
        updatedAt: new Date()
      });
    }
  }

  return { totalInvoices, totalChanged };
}

async function main() {
  const db = initAdminApp();
  const workspacesSnap = await db.collection('workspaces').get();
  console.log(`Processando fatura de ${workspacesSnap.size} workspace(s)...`);

  let totalReversalsCreated = 0;
  let totalInvoices = 0;
  let totalChanged = 0;

  for (const workspaceDoc of workspacesSnap.docs) {
    const workspaceId = workspaceDoc.id;
    totalReversalsCreated += await reverseDeletedPurchases(db, workspaceId);
    const result = await recomputeInvoiceTotals(db, workspaceId);
    totalInvoices += result.totalInvoices;
    totalChanged += result.totalChanged;
  }

  console.log(`Concluído: ${totalReversalsCreated} reversão(ões) retroativa(s) criada(s) no total.`);
  console.log(`${totalInvoices} fatura(s) verificada(s), ${totalChanged} valor(es) corrigido(s)/definido(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
