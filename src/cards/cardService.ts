import {
  Timestamp,
  collection,
  doc,
  getDoc,
  limit,
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
import { addMonths, format } from 'date-fns';
import { getFirebaseDb } from '../firebase/config';
import { fireWrite } from '../firebase/fireWrite';
import { readSnapshotData, readSnapshotDoc } from '../firebase/snapshotData';
import { monthKeyFromDate } from '../finance/financeDates';
import {
  anticipateInstallmentsSchema,
  createCardPurchaseSchema,
  createCreditCardSchema,
  reconcileInvoiceSchema,
  recordInvoiceCreditSchema,
  recordInvoiceFeeSchema,
  recordInvoicePaymentSchema,
  registerOngoingInstallmentsSchema,
  type AnticipateInstallmentsInput,
  type CreateCardPurchaseInput,
  type CreateCreditCardInput,
  type ReconcileInvoiceInput,
  type RecordInvoiceCreditInput,
  type RecordInvoiceFeeInput,
  type RecordInvoicePaymentInput,
  type RegisterOngoingInstallmentsInput
} from './cardSchemas';
import { invoiceDueDateForReferenceMonth, invoiceIdFor, resolveInstallmentCycle } from './cardDates';
import type { CreditCard, Invoice, InvoiceLedgerEntry, InvoiceLedgerEntryType, SyncStatus } from '../types/contracts';

export type LocalCardSynced<T> = T & {
  localSyncStatus: SyncStatus;
};

function createId(prefix: string) {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return `${prefix}_${randomId.replace(/-/g, '')}`;
}

function withLocalSync<T extends object>(snapshot: QueryDocumentSnapshot<DocumentData>) {
  const data = readSnapshotDoc<T>(snapshot);
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
  installmentNumber?: number;
  installmentTotal?: number;
}) {
  const payload: Record<string, unknown> = {
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

  // A regra do Firestore usa `hasOnly`: só incluir as chaves de parcela quando fazem
  // sentido (compra parcelada), senão um pagamento/tarifa carregaria campos vazios.
  if (input.installmentNumber !== undefined && input.installmentTotal !== undefined) {
    payload.installmentNumber = input.installmentNumber;
    payload.installmentTotal = input.installmentTotal;
  }

  return payload;
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

export function deleteCard(workspaceId: string, cardId: string) {
  fireWrite(updateDoc(cardRef(workspaceId, cardId), {
    isActive: false,
    updatedAt: serverTimestamp()
  }));
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
    const cycle = resolveInstallmentCycle(parsed.purchaseDate, card.closingDay, card.dueDay, index);
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
        sourceTransactionId: transactionId,
        // Rótulo "2/10" na fatura. Só quando parcelado (1x à vista não vira "1/1").
        ...(parsed.installments > 1 ? { installmentNumber: index + 1, installmentTotal: parsed.installments } : {})
      })
    );
  });

  const firstCycle = resolveInstallmentCycle(parsed.purchaseDate, card.closingDay, card.dueDay, 0);
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

export interface OngoingInstallmentPlanItem {
  installmentNumber: number;
  referenceMonth: string;
  dueDate: Date;
  amountCents: number;
}

/**
 * Quais parcelas criar para uma compra JÁ EM ANDAMENTO, e em que fatura cada uma cai.
 *
 * Pura, pra ser testável sem Firestore. Cria só as que faltam
 * (`currentInstallment`..`totalInstallments`), uma por mês consecutivo a partir de
 * `nextDueMonth`, cada uma rotulada com o número real (7/10, 8/10…). Os meses vêm do mês
 * informado pela pessoa, não de uma data de compra: quem sabe "estou na parcela 7 de 10" é
 * ela, e inferir por data seria frágil (depende do dia de fechamento).
 */
export function planOngoingInstallments(
  card: Pick<CreditCard, 'closingDay' | 'dueDay'>,
  input: Pick<RegisterOngoingInstallmentsInput, 'installmentValueCents' | 'currentInstallment' | 'totalInstallments' | 'nextDueMonth'>
): OngoingInstallmentPlanItem[] {
  const remaining = input.totalInstallments - input.currentInstallment + 1;
  const firstMonth = new Date(input.nextDueMonth.getFullYear(), input.nextDueMonth.getMonth(), 1, 12, 0, 0);

  return Array.from({ length: Math.max(0, remaining) }, (_, offset) => {
    const referenceMonth = format(addMonths(firstMonth, offset), 'yyyy-MM');
    return {
      installmentNumber: input.currentInstallment + offset,
      referenceMonth,
      dueDate: invoiceDueDateForReferenceMonth(referenceMonth, card.closingDay, card.dueDay),
      amountCents: input.installmentValueCents
    };
  });
}

/**
 * Lança uma compra parcelada que JÁ ESTAVA EM ANDAMENTO quando a pessoa começou a usar o
 * app — ex.: óculos em 10x, já pagou até a 6ª, a próxima (7/10) cai na fatura de setembro.
 * Diferente de `createCardPurchase`, não recria as parcelas já pagas.
 */
export async function registerOngoingInstallments(
  workspaceId: string,
  userId: string,
  input: RegisterOngoingInstallmentsInput
) {
  const parsed = registerOngoingInstallmentsSchema.parse(input);
  const card = await loadCard(workspaceId, parsed.cardId);
  const plan = planOngoingInstallments(card, parsed);
  const batch = writeBatch(getFirebaseDb());
  const transactionId = createId('txn');
  const installmentGroupId = createId('installments');
  const now = serverTimestamp();
  const invoicesToCreate = new Map<
    string,
    { reference: ReturnType<typeof invoiceRef>; payload: ReturnType<typeof invoicePayload> }
  >();

  let firstInvoiceId = '';

  for (const item of plan) {
    const invoiceId = invoiceIdFor(card.id, item.referenceMonth);
    if (!firstInvoiceId) firstInvoiceId = invoiceId;

    const idempotencyKey = `${transactionId}_ongoing_${item.installmentNumber}`;
    const entryId = idempotentEntryId(idempotencyKey);

    if (!invoicesToCreate.has(invoiceId)) {
      invoicesToCreate.set(invoiceId, {
        reference: invoiceRef(workspaceId, card.id, invoiceId),
        payload: invoicePayload(workspaceId, card.id, invoiceId, item.referenceMonth, item.dueDate)
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
        amountCents: item.amountCents,
        effectiveAt: item.dueDate,
        idempotencyKey,
        createdBy: userId,
        sourceTransactionId: transactionId,
        installmentNumber: item.installmentNumber,
        installmentTotal: parsed.totalInstallments
      })
    );
  }

  const firstMonth = new Date(parsed.nextDueMonth.getFullYear(), parsed.nextDueMonth.getMonth(), 1, 12, 0, 0);
  const monthKey = monthKeyFromDate(firstMonth);
  batch.set(transactionRef(workspaceId, transactionId), {
    id: transactionId,
    workspaceId,
    createdBy: userId,
    updatedBy: userId,
    type: 'card_purchase',
    // O que ainda será pago (parcelas que faltam), não o valor original da compra.
    amountCents: parsed.installmentValueCents * plan.length,
    description: parsed.description,
    categoryId: parsed.categoryId ?? '',
    cardId: card.id,
    invoiceId: firstInvoiceId,
    date: Timestamp.fromDate(firstMonth),
    competenceMonth: monthKey,
    cashMonth: monthKey,
    tags: [],
    isRecurring: false,
    installmentGroupId,
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
  const seed = createId('anticipation');

  // Um lançamento de débito por parcela antecipada (não um único débito somado) —
  // cada um carrega o `sourceTransactionId` da compra original correspondente. Sem
  // isso, excluir a compra original depois de antecipada deixava um débito "fantasma"
  // na fatura atual: o filtro de ledger órfão (useCardsData.ts) só sabe remover
  // lançamentos com `sourceTransactionId` apontando pra uma transação excluída, e um
  // débito somado sem esse vínculo nunca seria limpo.
  parsed.credits.forEach((credit, index) => {
    const creditKey = `${seed}_credit_${credit.invoiceId}_${index}`;
    const creditEntryId = idempotentEntryId(creditKey);
    batch.set(
      ledgerDocRef(workspaceId, parsed.cardId, credit.invoiceId, creditEntryId),
      ledgerPayload({
        id: creditEntryId,
        workspaceId,
        cardId: parsed.cardId,
        invoiceId: credit.invoiceId,
        type: 'installment_anticipation_credit',
        amountCents: credit.amountCents,
        effectiveAt: parsed.effectiveAt,
        idempotencyKey: creditKey,
        createdBy: userId,
        sourceTransactionId: credit.sourceTransactionId,
        installmentNumber: credit.installmentNumber,
        installmentTotal: credit.installmentTotal
      })
    );

    const debitKey = `${seed}_debit_${index}`;
    const debitEntryId = idempotentEntryId(debitKey);
    batch.set(
      ledgerDocRef(workspaceId, parsed.cardId, parsed.currentInvoiceId, debitEntryId),
      ledgerPayload({
        id: debitEntryId,
        workspaceId,
        cardId: parsed.cardId,
        invoiceId: parsed.currentInvoiceId,
        type: 'installment_anticipation',
        amountCents: credit.amountCents,
        effectiveAt: parsed.effectiveAt,
        idempotencyKey: debitKey,
        createdBy: userId,
        sourceTransactionId: credit.sourceTransactionId,
        // Rótulo "parcela 8/10 antecipada" na fatura de origem — sem isso, a fatura de destino
        // já não mostra mais qual parcela era (sumiu, ver anticipatedAwayEntryIds), e a origem
        // só dizia "Parcela antecipada" genérico, dando a impressão de faltar parcela no fim.
        installmentNumber: credit.installmentNumber,
        installmentTotal: credit.installmentTotal
      })
    );
  });

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

/**
 * Descobre quais das transações informadas estão excluídas (soft delete), lendo cada
 * documento direto.
 *
 * Existe porque `subscribeTransactions` traz só as 300 mais recentes. Uma compra no
 * cartão excluída que saia dessa janela desaparece do conjunto de "excluídas" que o
 * `useCardsData` usa pra filtrar o ledger — e o valor dela **volta** a somar na fatura,
 * que pode até sair de "paga". As faturas carregadas cobrem 24 ciclos, então uma compra
 * parcelada de 2 anos atrás continua relevante muito depois de sair da janela.
 *
 * Só é chamada para os ids que a janela não cobre (normalmente nenhum), e o Firestore
 * cacheia o resultado. Em caso de erro ou documento ausente, devolve "não excluída": o
 * lado seguro é manter o lançamento, porque some-lo apagaria uma dívida real da fatura.
 */
export async function fetchDeletedTransactionIds(
  workspaceId: string,
  transactionIds: readonly string[]
): Promise<string[]> {
  const results = await Promise.all(
    transactionIds.map(async (transactionId) => {
      try {
        const snapshot = await getDoc(transactionRef(workspaceId, transactionId));
        const isDeleted = snapshot.exists() && Boolean(readSnapshotData(snapshot)?.deletedAt);
        return isDeleted ? transactionId : null;
      } catch {
        return null;
      }
    })
  );

  return results.filter((transactionId): transactionId is string => transactionId !== null);
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

// Limitado aos 24 ciclos mais recentes (~2 anos de fatura mensal): sem isso, cada
// fatura carregada abre seu próprio listener de ledger em useCardsData, e o total
// cresce sem limite pra sempre conforme a conta envelhece.
export function subscribeInvoices(
  workspaceId: string,
  cardId: string,
  onNext: (items: Array<LocalCardSynced<Invoice>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(invoicesRef(workspaceId, cardId), orderBy('referenceMonth', 'desc'), limit(24)),
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
