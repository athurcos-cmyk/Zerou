import {
  Timestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { addMonths } from 'date-fns';
import { getFirebaseDb } from '../firebase/config';
import { fireWrite } from '../firebase/fireWrite';
import { monthKeyFromDate } from '../finance/financeDates';
import {
  anticipateInstallmentsSchema,
  createCardPurchaseSchema,
  createCreditCardSchema,
  reconcileInvoiceSchema,
  recordInvoiceCreditSchema,
  recordInvoiceFeeSchema,
  recordInvoicePaymentSchema,
  type AnticipateInstallmentsInput,
  type CreateCardPurchaseInput,
  type CreateCreditCardInput,
  type ReconcileInvoiceInput,
  type RecordInvoiceCreditInput,
  type RecordInvoiceFeeInput,
  type RecordInvoicePaymentInput
} from './cardSchemas';
import { invoiceIdFor, resolveInvoiceCycle } from './cardDates';
import type { CreditCard, Invoice, InvoiceLedgerEntry, InvoiceLedgerEntryType, SyncStatus } from '../types/contracts';

export type LocalCardSynced<T> = T & {
  localSyncStatus: SyncStatus;
};

function createId(prefix: string) {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return `${prefix}_${randomId.replace(/-/g, '')}`;
}

function withLocalSync<T extends object>(snapshot: QueryDocumentSnapshot<DocumentData>) {
  const data = { id: snapshot.id, ...snapshot.data() } as unknown as T;
  const localSyncStatus: SyncStatus = snapshot.metadata.hasPendingWrites ? 'pending' : 'synced';
  return { ...data, localSyncStatus } as LocalCardSynced<T>;
}

function cardRef(workspaceId: string, cardId: string) {
  return doc(getFirebaseDb(), 'workspaces', workspaceId, 'cards', cardId);
}

function cardsRef(workspaceId: string) {
  return collection(getFirebaseDb(), 'workspaces', workspaceId, 'cards');
}

function invoiceRef(workspaceId: string, cardId: string, invoiceId: string) {
  return doc(getFirebaseDb(), 'workspaces', workspaceId, 'cards', cardId, 'invoices', invoiceId);
}

function invoicesRef(workspaceId: string, cardId: string) {
  return collection(getFirebaseDb(), 'workspaces', workspaceId, 'cards', cardId, 'invoices');
}

function ledgerRef(workspaceId: string, cardId: string, invoiceId: string) {
  return collection(getFirebaseDb(), 'workspaces', workspaceId, 'cards', cardId, 'invoices', invoiceId, 'ledger');
}

function ledgerDocRef(workspaceId: string, cardId: string, invoiceId: string, entryId: string) {
  return doc(getFirebaseDb(), 'workspaces', workspaceId, 'cards', cardId, 'invoices', invoiceId, 'ledger', entryId);
}

function transactionRef(workspaceId: string, transactionId: string) {
  return doc(getFirebaseDb(), 'workspaces', workspaceId, 'transactions', transactionId);
}

function idempotentEntryId(idempotencyKey: string) {
  return idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140);
}

function installmentAmounts(totalCents: number, installments: number) {
  const base = Math.floor(totalCents / installments);
  const remainder = totalCents % installments;

  return Array.from({ length: installments }, (_, index) => base + (index < remainder ? 1 : 0));
}

async function loadCard(workspaceId: string, cardId: string) {
  const snapshot = await getDoc(cardRef(workspaceId, cardId));

  if (!snapshot.exists()) {
    throw new Error('Cartão não encontrado.');
  }

  return { id: snapshot.id, ...snapshot.data() } as CreditCard;
}

function invoicePayload(workspaceId: string, cardId: string, invoiceId: string, referenceMonth: string, dueDate: Date) {
  const now = serverTimestamp();

  return {
    id: invoiceId,
    cardId,
    workspaceId,
    referenceMonth,
    dueDate: Timestamp.fromDate(dueDate),
    status: 'open',
    purchasesTotalCents: 0,
    paymentsTotalCents: 0,
    creditsTotalCents: 0,
    feesTotalCents: 0,
    outstandingBalanceCents: 0,
    overpaidCreditCents: 0,
    version: 1,
    createdAt: now,
    updatedAt: now
  };
}

function ledgerPayload(input: {
  id: string;
  workspaceId: string;
  cardId: string;
  invoiceId: string;
  type: InvoiceLedgerEntryType;
  amountCents: number;
  effectiveAt: Date;
  idempotencyKey: string;
  createdBy: string;
  sourceTransactionId?: string;
}) {
  return {
    id: input.id,
    invoiceId: input.invoiceId,
    cardId: input.cardId,
    workspaceId: input.workspaceId,
    type: input.type,
    amountCents: input.amountCents,
    effectiveAt: Timestamp.fromDate(input.effectiveAt),
    sourceTransactionId: input.sourceTransactionId ?? '',
    idempotencyKey: input.idempotencyKey,
    createdBy: input.createdBy,
    createdAt: serverTimestamp()
  };
}

export async function createCreditCard(workspaceId: string, userId: string, input: CreateCreditCardInput) {
  const parsed = createCreditCardSchema.parse(input);
  const id = createId('card');
  const now = serverTimestamp();

  fireWrite(setDoc(cardRef(workspaceId, id), {
    id,
    workspaceId,
    ownerUserId: userId,
    name: parsed.name,
    lastFour: parsed.lastFour,
    brand: parsed.brand,
    limitCents: parsed.limitCents,
    closingDay: parsed.closingDay,
    dueDay: parsed.dueDay,
    colorToken: parsed.colorToken,
    isActive: true,
    createdAt: now,
    updatedAt: now
  }));

  return id;
}

export async function createCardPurchase(workspaceId: string, userId: string, input: CreateCardPurchaseInput) {
  const parsed = createCardPurchaseSchema.parse(input);
  const card = await loadCard(workspaceId, parsed.cardId);
  const batch = writeBatch(getFirebaseDb());
  const transactionId = createId('txn');
  const installmentGroupId = parsed.installments > 1 ? createId('installments') : undefined;
  const amounts = installmentAmounts(parsed.amountCents, parsed.installments);
  const now = serverTimestamp();
  const invoicesToCreate = new Map<
    string,
    { reference: ReturnType<typeof invoiceRef>; payload: ReturnType<typeof invoicePayload> }
  >();

  amounts.forEach((amountCents, index) => {
    const installmentDate = addMonths(parsed.purchaseDate, index);
    const cycle = resolveInvoiceCycle(installmentDate, card.closingDay, card.dueDay);
    const invoiceId = invoiceIdFor(card.id, cycle.referenceMonth);
    const idempotencyKey = `${transactionId}_purchase_${index + 1}`;
    const entryId = idempotentEntryId(idempotencyKey);
    const invoiceDocumentRef = invoiceRef(workspaceId, card.id, invoiceId);

    if (!invoicesToCreate.has(invoiceId)) {
      invoicesToCreate.set(invoiceId, {
        reference: invoiceDocumentRef,
        payload: invoicePayload(workspaceId, card.id, invoiceId, cycle.referenceMonth, cycle.dueDate)
      });
    }
    batch.set(
      ledgerDocRef(workspaceId, card.id, invoiceId, entryId),
      ledgerPayload({
        id: entryId,
        workspaceId,
        cardId: card.id,
        invoiceId,
        type: 'purchase',
        amountCents,
        effectiveAt: parsed.purchaseDate,
        idempotencyKey,
        createdBy: userId,
        sourceTransactionId: transactionId
      })
    );
  });

  const firstCycle = resolveInvoiceCycle(parsed.purchaseDate, card.closingDay, card.dueDay);
  const firstInvoiceId = invoiceIdFor(card.id, firstCycle.referenceMonth);
  const monthKey = monthKeyFromDate(parsed.purchaseDate);

  batch.set(transactionRef(workspaceId, transactionId), {
    id: transactionId,
    workspaceId,
    createdBy: userId,
    updatedBy: userId,
    type: 'card_purchase',
    amountCents: parsed.amountCents,
    description: parsed.description,
    categoryId: parsed.categoryId ?? '',
    cardId: card.id,
    invoiceId: firstInvoiceId,
    date: Timestamp.fromDate(parsed.purchaseDate),
    competenceMonth: monthKey,
    cashMonth: monthKey,
    tags: [],
    isRecurring: false,
    installmentGroupId: installmentGroupId ?? '',
    clientMutationId: transactionId,
    syncStatus: 'synced',
    version: 1,
    createdAt: now,
    updatedAt: now
  });

  await Promise.all(
    Array.from(invoicesToCreate.values()).map(async (invoiceCreate) => {
      const snapshot = await getDoc(invoiceCreate.reference);

      if (!snapshot.exists()) {
        batch.set(invoiceCreate.reference, invoiceCreate.payload);
      }
    })
  );

  fireWrite(batch.commit());
  return transactionId;
}

export async function closeInvoice(workspaceId: string, cardId: string, invoiceId: string) {
  fireWrite(updateDoc(invoiceRef(workspaceId, cardId, invoiceId), {
    status: 'closed',
    updatedAt: serverTimestamp()
  }));
}

export async function recordInvoicePayment(workspaceId: string, userId: string, input: RecordInvoicePaymentInput) {
  const parsed = recordInvoicePaymentSchema.parse(input);
  const transactionId = createId('txn');
  const idempotencyKey = `${transactionId}_payment`;
  const entryId = idempotentEntryId(idempotencyKey);
  const monthKey = monthKeyFromDate(parsed.paidAt);
  const batch = writeBatch(getFirebaseDb());
  const type: InvoiceLedgerEntryType = parsed.advance ? 'advance_payment' : 'payment';
  const now = serverTimestamp();

  batch.set(
    ledgerDocRef(workspaceId, parsed.cardId, parsed.invoiceId, entryId),
    ledgerPayload({
      id: entryId,
      workspaceId,
      cardId: parsed.cardId,
      invoiceId: parsed.invoiceId,
      type,
      amountCents: parsed.amountCents,
      effectiveAt: parsed.paidAt,
      idempotencyKey,
      createdBy: userId,
      sourceTransactionId: transactionId
    })
  );
  batch.set(transactionRef(workspaceId, transactionId), {
    id: transactionId,
    workspaceId,
    createdBy: userId,
    updatedBy: userId,
    type: 'card_payment',
    amountCents: parsed.amountCents,
    description: 'Pagamento de fatura',
    accountId: parsed.accountId,
    cardId: parsed.cardId,
    invoiceId: parsed.invoiceId,
    date: Timestamp.fromDate(parsed.paidAt),
    competenceMonth: monthKey,
    cashMonth: monthKey,
    tags: [],
    isRecurring: false,
    clientMutationId: transactionId,
    syncStatus: 'synced',
    version: 1,
    createdAt: now,
    updatedAt: now
  });

  fireWrite(batch.commit());
  return transactionId;
}

export async function recordInvoiceCredit(workspaceId: string, userId: string, input: RecordInvoiceCreditInput) {
  const parsed = recordInvoiceCreditSchema.parse(input);
  return addLedgerOnlyEntry(workspaceId, userId, parsed.cardId, parsed.invoiceId, parsed.type, parsed.amountCents, parsed.effectiveAt);
}

export async function recordInvoiceFee(workspaceId: string, userId: string, input: RecordInvoiceFeeInput) {
  const parsed = recordInvoiceFeeSchema.parse(input);
  return addLedgerOnlyEntry(workspaceId, userId, parsed.cardId, parsed.invoiceId, parsed.type, parsed.amountCents, parsed.effectiveAt);
}

export async function anticipateInstallments(workspaceId: string, userId: string, input: AnticipateInstallmentsInput) {
  const parsed = anticipateInstallmentsSchema.parse(input);
  const batch = writeBatch(getFirebaseDb());
  const totalCents = parsed.credits.reduce((sum, c) => sum + c.amountCents, 0);
  const seed = createId('anticipation');

  parsed.credits.forEach((credit, index) => {
    const idempotencyKey = `${seed}_credit_${credit.invoiceId}_${index}`;
    const entryId = idempotentEntryId(idempotencyKey);
    batch.set(
      ledgerDocRef(workspaceId, parsed.cardId, credit.invoiceId, entryId),
      ledgerPayload({
        id: entryId,
        workspaceId,
        cardId: parsed.cardId,
        invoiceId: credit.invoiceId,
        type: 'installment_anticipation_credit',
        amountCents: credit.amountCents,
        effectiveAt: parsed.effectiveAt,
        idempotencyKey,
        createdBy: userId,
        sourceTransactionId: credit.sourceTransactionId
      })
    );
  });

  const debitKey = `${seed}_debit`;
  const debitEntryId = idempotentEntryId(debitKey);
  batch.set(
    ledgerDocRef(workspaceId, parsed.cardId, parsed.currentInvoiceId, debitEntryId),
    ledgerPayload({
      id: debitEntryId,
      workspaceId,
      cardId: parsed.cardId,
      invoiceId: parsed.currentInvoiceId,
      type: 'installment_anticipation',
      amountCents: totalCents,
      effectiveAt: parsed.effectiveAt,
      idempotencyKey: debitKey,
      createdBy: userId
    })
  );

  fireWrite(batch.commit());
}

async function addLedgerOnlyEntry(
  workspaceId: string,
  userId: string,
  cardId: string,
  invoiceId: string,
  type: InvoiceLedgerEntryType,
  amountCents: number,
  effectiveAt: Date,
  seed = createId('ledger')
) {
  const idempotencyKey = `${seed}_${type}`;
  const entryId = idempotentEntryId(idempotencyKey);

  fireWrite(setDoc(
    ledgerDocRef(workspaceId, cardId, invoiceId, entryId),
    ledgerPayload({
      id: entryId,
      workspaceId,
      cardId,
      invoiceId,
      type,
      amountCents,
      effectiveAt,
      idempotencyKey,
      createdBy: userId
    })
  ));

  return entryId;
}

export async function reconcileInvoice(workspaceId: string, input: ReconcileInvoiceInput) {
  const parsed = reconcileInvoiceSchema.parse(input);
  fireWrite(updateDoc(invoiceRef(workspaceId, parsed.cardId, parsed.invoiceId), {
    status: parsed.status,
    updatedAt: serverTimestamp()
  }));
}

export function subscribeCards(
  workspaceId: string,
  onNext: (items: Array<LocalCardSynced<CreditCard>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(cardsRef(workspaceId), orderBy('name', 'asc')),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<CreditCard>(item))),
    onError
  );
}

export function subscribeInvoices(
  workspaceId: string,
  cardId: string,
  onNext: (items: Array<LocalCardSynced<Invoice>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(invoicesRef(workspaceId, cardId), orderBy('referenceMonth', 'desc')),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<Invoice>(item))),
    onError
  );
}

export function subscribeInvoiceLedger(
  workspaceId: string,
  cardId: string,
  invoiceId: string,
  onNext: (items: Array<LocalCardSynced<InvoiceLedgerEntry>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(ledgerRef(workspaceId, cardId, invoiceId), orderBy('effectiveAt', 'asc')),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<InvoiceLedgerEntry>(item))),
    onError
  );
}
