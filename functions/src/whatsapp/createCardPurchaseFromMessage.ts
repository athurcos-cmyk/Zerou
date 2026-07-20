import { FieldValue, Timestamp, getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { resolveInstallmentCycle, invoiceIdFor } from '../cards/cardDates.js';
import { assertSaneAmountCents } from './createTransactionFromMessage.js';

/**
 * Cria compra no cartao (com parcelamento) via Admin SDK com o MESMO payload que
 * `cardService.createCardPurchase` gera no client. Admin SDK ignora firestore.rules —
 * a responsabilidade de gerar o payload correto e 100% desta funcao.
 *
 * Mantenha em sincronia com `src/cards/cardService.ts:createCardPurchase()`.
 */

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

function monthKeyFromDate(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function idempotentEntryId(idempotencyKey: string): string {
  return idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140);
}

function installmentAmounts(totalCents: number, installments: number): number[] {
  const base = Math.floor(totalCents / installments);
  const remainder = totalCents % installments;
  return Array.from({ length: installments }, (_, index) => base + (index < remainder ? 1 : 0));
}

export interface CreateCardPurchaseFromMessageInput {
  workspaceId: string;
  userId: string;
  cardId: string;
  amountCents: number;
  description: string;
  categoryId?: string | null;
  installments: number;
  purchaseDate: Date;
}

export async function createCardPurchaseFromMessage(
  input: CreateCardPurchaseFromMessageInput,
): Promise<{ id: string; amountCents: number; description: string; categoryName?: string; cardName: string }> {
  assertSaneAmountCents(input.amountCents, 'compra no cartão');
  if (!Number.isInteger(input.installments) || input.installments < 1 || input.installments > 72) {
    throw new Error(`Número de parcelas inválido para compra via WhatsApp: ${input.installments}`);
  }
  const db = getFirestore();

  const cardSnap = await db.doc(`workspaces/${input.workspaceId}/cards/${input.cardId}`).get();
  if (!cardSnap.exists) throw new Error('Cartão não encontrado.');
  const card = cardSnap.data() as { name: string; closingDay: number; dueDay: number };

  const batch = db.batch();
  const transactionId = createId('txn');
  const installmentGroupId = input.installments > 1 ? createId('installments') : '';
  const amounts = installmentAmounts(input.amountCents, input.installments);
  const now = FieldValue.serverTimestamp();

  const invoicesToCreate = new Map<string, { ref: DocumentReference; payload: Record<string, unknown> }>();

  amounts.forEach((amountCents, index) => {
    const cycle = resolveInstallmentCycle(input.purchaseDate, card.closingDay, card.dueDay, index);
    const invoiceId = invoiceIdFor(input.cardId, cycle.referenceMonth);
    const idempotencyKey = `${transactionId}_purchase_${index + 1}`;
    const entryId = idempotentEntryId(idempotencyKey);
    const invoiceRef = db.doc(`workspaces/${input.workspaceId}/cards/${input.cardId}/invoices/${invoiceId}`);

    if (!invoicesToCreate.has(invoiceId)) {
      invoicesToCreate.set(invoiceId, {
        ref: invoiceRef,
        payload: {
          id: invoiceId,
          cardId: input.cardId,
          workspaceId: input.workspaceId,
          referenceMonth: cycle.referenceMonth,
          dueDate: Timestamp.fromDate(cycle.dueDate),
          status: 'open',
          purchasesTotalCents: 0,
          paymentsTotalCents: 0,
          creditsTotalCents: 0,
          feesTotalCents: 0,
          outstandingBalanceCents: 0,
          overpaidCreditCents: 0,
          processedLedgerEntryIds: [],
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    const ledgerRef = db.doc(`workspaces/${input.workspaceId}/cards/${input.cardId}/invoices/${invoiceId}/ledger/${entryId}`);
    batch.set(ledgerRef, {
      id: entryId,
      invoiceId,
      cardId: input.cardId,
      workspaceId: input.workspaceId,
      type: 'purchase',
      amountCents,
      effectiveAt: Timestamp.fromDate(input.purchaseDate),
      sourceTransactionId: transactionId,
      idempotencyKey,
      createdBy: input.userId,
      createdAt: FieldValue.serverTimestamp(),
      ...(input.installments > 1 ? { installmentNumber: index + 1, installmentTotal: input.installments } : {}),
    });
  });

  const firstCycle = resolveInstallmentCycle(input.purchaseDate, card.closingDay, card.dueDay, 0);
  const firstInvoiceId = invoiceIdFor(input.cardId, firstCycle.referenceMonth);
  const monthKey = monthKeyFromDate(input.purchaseDate);

  batch.set(db.doc(`workspaces/${input.workspaceId}/transactions/${transactionId}`), {
    id: transactionId,
    workspaceId: input.workspaceId,
    createdBy: input.userId,
    updatedBy: input.userId,
    type: 'card_purchase',
    amountCents: input.amountCents,
    description: input.description,
    categoryId: input.categoryId ?? '',
    cardId: input.cardId,
    invoiceId: firstInvoiceId,
    date: Timestamp.fromDate(input.purchaseDate),
    competenceMonth: monthKey,
    cashMonth: monthKey,
    tags: ['whatsapp'],
    isRecurring: false,
    installmentGroupId,
    clientMutationId: transactionId,
    syncStatus: 'synced',
    version: 1,
    source: 'whatsapp',
    createdAt: now,
    updatedAt: now,
  });

  for (const invoiceCreate of invoicesToCreate.values()) {
    const snapshot = await invoiceCreate.ref.get();
    if (!snapshot.exists) {
      batch.set(invoiceCreate.ref, invoiceCreate.payload);
    }
  }

  await batch.commit();

  let categoryName: string | undefined;
  if (input.categoryId) {
    const catDoc = await db.doc(`workspaces/${input.workspaceId}/categories/${input.categoryId}`).get();
    categoryName = catDoc.data()?.name;
  }

  return {
    id: transactionId,
    amountCents: input.amountCents,
    description: input.description,
    categoryName,
    cardName: card.name,
  };
}
