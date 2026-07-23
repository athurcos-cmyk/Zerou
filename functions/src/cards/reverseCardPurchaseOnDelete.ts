import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';

/**
 * O ledger de fatura é imutável (`allow update: if false` no firestore.rules) — quando uma
 * transação `card_purchase` é excluída, as entradas de ledger correspondentes continuam
 * existindo pra sempre. Enquanto os totais da fatura eram recalculados somando o ledger
 * inteiro a cada leitura, isso era "resolvido" filtrando as excluídas na hora. Migrando pra
 * totais persistidos (`invoiceLedgerEntryTrigger.ts`), isso quebraria silenciosamente sem
 * esta correção: pra cada entrada de ledger que a compra excluída gerou (uma compra
 * parcelada pode ter uma por fatura), grava uma entrada de reversão que dispara o trigger
 * de totais normalmente.
 *
 * O tipo da reversão depende do tipo original — não é sempre `purchase_reversal`:
 * - `purchase`/`installment_anticipation` são DÉBITOS (`purchasesTotalCents`) → a reversão
 *   entra como `purchase_reversal`, um CRÉDITO, que cancela certo (débito original + crédito
 *   de reversão = líquido zero na fatura).
 * - `installment_anticipation_credit` já é ele mesmo um CRÉDITO (`creditsTotalCents`, na
 *   fatura futura onde a parcela foi antecipada) — revertê-lo com outro crédito DOBRARIA o
 *   crédito em vez de cancelar. Precisa entrar como `anticipation_credit_reversal`, um
 *   DÉBITO, pro líquido zerar (crédito original + débito de reversão = zero). Bug real já em
 *   produção antes desta correção: editar/excluir uma compra com parcela já antecipada
 *   inflava o crédito da fatura futura, reduzindo o "Comprometido" indevidamente.
 *
 * Nenhum outro tipo aparece nesta query na prática — `payment`/`refund_credit`/tarifas/etc.
 * nunca gravam `sourceTransactionId` apontando pra uma compra (só `purchase`,
 * `installment_anticipation` e `installment_anticipation_credit` fazem isso).
 *
 * **Bug real encontrado ao vivo (2026-07-23):** o id do reversal era montado concatenando
 * `${transactionId}_reversal_${entryDoc.id}` e truncando em 140 caracteres (mesmo limite que
 * `idempotentEntryId` usa em `cardService.ts` pros ids "normais", que nunca passam disso). Só
 * que `entryDoc.id` de um entry de antecipação (`anticipation_credit_${sourceTransactionId}_${invoiceId}`,
 * de `anticipateInstallments` em `cardService.ts`) já tem ~103 caracteres sozinho — concatenado
 * com o prefixo do reversal, passa de 140, e o corte remove exatamente a parte final do
 * `invoiceId` (o mês) que diferenciava uma parcela antecipada da outra. Resultado: antecipar
 * mais de uma parcela de uma vez e depois excluir/editar a compra fazia vários reversals
 * colidirem no MESMO id truncado — `batch.set` (não `create`) sobrescreve silenciosamente, então
 * só o último "vencia" e os outros nunca eram persistidos. Fatura ficava com limite usado
 * fantasma depois de uma exclusão que deveria zerar tudo. Corrigido usando um hash do
 * `entryDoc.id` (comprimento fixo, sem risco de colisão por truncamento) em vez de concatenação.
 */

export function reversalIdFor(entryId: string): string {
  return `reversal_${createHash('sha256').update(entryId).digest('hex').slice(0, 32)}`;
}

export const reversalTypeFor = (originalType: string | undefined): 'purchase_reversal' | 'anticipation_credit_reversal' =>
  originalType === 'installment_anticipation_credit' ? 'anticipation_credit_reversal' : 'purchase_reversal';

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
      // depois de já ter criado as entradas de reversão (elas também têm
      // sourceTransactionId == transactionId, então voltariam nesta mesma query).
      if (entry.type === 'purchase_reversal' || entry.type === 'anticipation_credit_reversal') continue;
      if (typeof entry.amountCents !== 'number' || !entry.cardId || !entry.invoiceId) continue;

      const reversalId = reversalIdFor(entryDoc.id);
      const reversalRef = db.doc(
        `workspaces/${workspaceId}/cards/${entry.cardId}/invoices/${entry.invoiceId}/ledger/${reversalId}`
      );

      batch.set(reversalRef, {
        id: reversalId,
        invoiceId: entry.invoiceId,
        cardId: entry.cardId,
        workspaceId,
        type: reversalTypeFor(entry.type),
        amountCents: entry.amountCents,
        effectiveAt: now,
        sourceTransactionId: transactionId,
        idempotencyKey: reversalId,
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
