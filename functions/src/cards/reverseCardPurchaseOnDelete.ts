import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';

/**
 * O ledger de fatura é imutável (`allow update: if false` no firestore.rules) — quando uma
 * transação `card_purchase` é excluída, as entradas de ledger correspondentes continuam
 * existindo pra sempre. Enquanto os totais da fatura eram recalculados somando o ledger
 * inteiro a cada leitura, isso era "resolvido" filtrando as excluídas na hora. Migrando pra
 * totais persistidos (`invoiceLedgerEntryTrigger.ts`), isso quebraria silenciosamente sem
 * esta correção: pra cada entrada de ledger que a compra excluída gerou (uma compra
 * parcelada pode ter uma por fatura), grava uma entrada `purchase_reversal` — contada como
 * crédito — que por sua vez dispara o trigger de totais normalmente.
 */

function idempotentEntryId(idempotencyKey: string): string {
  return idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140);
}

const region = 'southamerica-east1';

export const reverseCardPurchaseOnDelete = onDocumentUpdated(
  {
    document: 'workspaces/{workspaceId}/transactions/{transactionId}',
    region,
    maxInstances: 10,
  },
  async (event) => {
    const change = event.data;
    if (!change) return;

    const before = change.before.data();
    const after = change.after.data();
    if (!before || !after) return;

    const justDeleted = !before.deletedAt && after.deletedAt;
    if (!justDeleted || after.type !== 'card_purchase') return;

    const { workspaceId, transactionId } = event.params;
    const db = change.after.ref.firestore;

    const ledgerSnap = await db
      .collectionGroup('ledger')
      .where('workspaceId', '==', workspaceId)
      .where('sourceTransactionId', '==', transactionId)
      .get();

    if (ledgerSnap.empty) return;

    const batch = db.batch();
    const now = Timestamp.now();
    let queued = 0;

    for (const entryDoc of ledgerSnap.docs) {
      const entry = entryDoc.data() as {
        type?: string;
        amountCents?: number;
        cardId?: string;
        invoiceId?: string;
      };

      // Nunca reverter uma reversão já existente — evita recursão caso o gatilho reentregue
      // depois de já ter criado as entradas `purchase_reversal` (elas também têm
      // sourceTransactionId == transactionId, então voltariam nesta mesma query).
      if (entry.type === 'purchase_reversal') continue;
      if (typeof entry.amountCents !== 'number' || !entry.cardId || !entry.invoiceId) continue;

      const idempotencyKey = `${transactionId}_reversal_${entryDoc.id}`;
      const reversalId = idempotentEntryId(idempotencyKey);
      const reversalRef = db.doc(
        `workspaces/${workspaceId}/cards/${entry.cardId}/invoices/${entry.invoiceId}/ledger/${reversalId}`
      );

      batch.set(reversalRef, {
        id: reversalId,
        invoiceId: entry.invoiceId,
        cardId: entry.cardId,
        workspaceId,
        type: 'purchase_reversal',
        amountCents: entry.amountCents,
        effectiveAt: now,
        sourceTransactionId: transactionId,
        idempotencyKey,
        createdBy: (after.updatedBy as string | undefined) ?? (after.createdBy as string | undefined) ?? '',
        createdAt: FieldValue.serverTimestamp(),
      });
      queued++;
    }

    if (queued > 0) {
      await batch.commit();
    }
  }
);
