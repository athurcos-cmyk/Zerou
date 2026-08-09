import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { addMonths, format, startOfDay } from 'date-fns';
import { getFirebaseDb } from '../firebase/config';
import { fireWrite } from '../firebase/fireWrite';
import { readSnapshotData, readSnapshotDoc } from '../firebase/snapshotData';
import { monthKeyFromDate } from '../finance/financeDates';
import { applyAccountEffectsToBatch } from '../finance/accountBatchEffects';
import { transactionAccountEffects } from '../finance/financeCalculations';
import {
  anticipateInstallmentsSchema,
  createCardPurchaseSchema,
  createCreditCardSchema,
  reconcileInvoiceSchema,
  recordInvoiceCreditSchema,
  recordInvoiceFeeSchema,
  recordInvoicePaymentSchema,
  registerOngoingInstallmentsSchema,
  updateCardSchema,
  type AnticipateInstallmentsInput,
  type CreateCardPurchaseInput,
  type CreateCreditCardInput,
  type ReconcileInvoiceInput,
  type RecordInvoiceCreditInput,
  type RecordInvoiceFeeInput,
  type RecordInvoicePaymentInput,
  type RegisterOngoingInstallmentsInput,
  type UpdateCardInput
} from './cardSchemas';
import { invoiceClosingDateForReferenceMonth, invoiceDueDateForReferenceMonth, invoiceIdFor, resolveInstallmentCycle } from './cardDates';
// Divisão do valor entre as parcelas mora em módulo puro porque `invoicesForSpendingFromTransactions`
// precisa do MESMO resultado exato pra reconstruir essas parcelas sem ler o ledger.
import { installmentAmounts } from './installmentSchedule';
// Derivação do id do lançamento mora em módulo puro pra o TESTE DE REGRAS poder usar a função de
// verdade — o helper do teste montava `idempotencyKey: entryId` à mão e por isso nunca pegou o bug.
import { idempotentEntryId } from './ledgerEntryId';
import type { CreditCard, Invoice, InvoiceLedgerEntry, InvoiceLedgerEntryType, SyncStatus, Transaction } from '../types/contracts';

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
    processedLedgerEntryIds: [],
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
    // ⚠️ SEMPRE igual ao id do documento, por construção. `firestore.rules`
    // (`validInvoiceLedgerCreate`) exige `idempotencyKey == entryId`, e derivar aqui — no único
    // lugar que monta payload de ledger — torna impossível violar essa invariante por
    // sanitização/truncamento do id. Era exatamente o que quebrava o pagamento de fatura em
    // 07/08/2026: a chave tinha 150 caracteres, o id 140, e o batch atômico inteiro era recusado.
    // A deduplicação de `calculateInvoice` continua valendo (id é único por definição).
    idempotencyKey: input.id,
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

/**
 * Fase 1: só limite e nome (`updateCardSchema`). `undefined` = não mexe no campo —
 * mesma convenção de `updateBill`/`updateRecurringRule` em `financeService.ts`.
 */
export async function updateCard(workspaceId: string, cardId: string, patch: UpdateCardInput) {
  const parsed = updateCardSchema.parse(patch);
  const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (parsed.limitCents !== undefined) updates.limitCents = parsed.limitCents;
  if (parsed.name !== undefined) updates.name = parsed.name;

  fireWrite(updateDoc(cardRef(workspaceId, cardId), updates));
}

export function deleteCard(workspaceId: string, cardId: string) {
  fireWrite(updateDoc(cardRef(workspaceId, cardId), {
    isActive: false,
    updatedAt: serverTimestamp()
  }));
}

/**
 * Monta as escritas de uma compra no cartão (ledger por parcela, doc(s) de `Invoice` quando
 * ainda não existem, a `Transaction` `card_purchase`) num `batch` já existente, sem criá-lo
 * nem commitá-lo — permite compor com outras escritas no MESMO batch (ex.: marcar uma conta
 * a pagar como paga, ou avançar `nextOccurrenceAt` de uma recorrência) garantindo que os dois
 * lados aconteçam atomicamente juntos, ou nenhum. `createCardPurchase` (abaixo) é o caso
 * simples: cria o próprio batch e commita sozinho.
 *
 * `opts.transactionId`: normalmente gerado aqui, mas o caller pode passar um id
 * determinístico (ex.: `recurringOccurrenceTransactionId`) pra preservar proteção de
 * idempotência contra clique duplo/retry de rede.
 *
 * `opts.skipInvoiceCheck`: pula o `getDoc` que verifica se cada fatura já existe (abaixo).
 * Só é seguro quando o caller sabe, de antemão, que as faturas já existem — é o caso de
 * `updateCardPurchase` (edição), que consulta o ledger antigo antes de chamar isto e reusa
 * exatamente a mesma `purchaseDate` (edição não permite mudar a data — ver `EditTransactionPage`),
 * então `resolveInstallmentCycle` recalcula sempre as MESMAS faturas de origem, que já têm os
 * entries antigos dentro. Sem essa leitura, o batch comita offline via cache local em vez de
 * esperar rede — se uma fatura realmente não existir mais, a regra `validInvoiceLedgerCreate`
 * (exige `existsAfter(invoiceDoc)`) rejeita o batch inteiro. `createCardPurchase` mantém o
 * default `false`, sem mudança de comportamento.
 */
export async function addCardPurchaseToBatch(
  batch: ReturnType<typeof writeBatch>,
  workspaceId: string,
  userId: string,
  input: CreateCardPurchaseInput,
  opts: { transactionId?: string; skipInvoiceCheck?: boolean; recurringId?: string } = {}
): Promise<{ transactionId: string; firstInvoiceId: string; cardId: string }> {
  const parsed = createCardPurchaseSchema.parse(input);
  const card = await loadCard(workspaceId, parsed.cardId);
  const transactionId = opts.transactionId ?? createId('txn');
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
    // `recurringId` marca a compra como vinda de uma recorrência registrada no cartão —
    // é o que o Comprometido usa pra descontar essa cobrança da fatura e não contar a
    // assinatura duas vezes (recorrência como linha + fatura). Ver `recurringChargesByInvoice`.
    tags: opts.recurringId ? ['recorrente'] : [],
    isRecurring: Boolean(opts.recurringId),
    ...(opts.recurringId ? { recurringId: opts.recurringId } : {}),
    installmentGroupId: installmentGroupId ?? '',
    installments: parsed.installments,
    clientMutationId: transactionId,
    syncStatus: 'synced',
    version: 1,
    createdAt: now,
    updatedAt: now
  });

  if (!opts.skipInvoiceCheck) {
    await Promise.all(
      Array.from(invoicesToCreate.values()).map(async (invoiceCreate) => {
        const snapshot = await getDoc(invoiceCreate.reference);

        if (!snapshot.exists()) {
          batch.set(invoiceCreate.reference, invoiceCreate.payload);
        }
      })
    );
  }

  return { transactionId, firstInvoiceId, cardId: card.id };
}

export async function createCardPurchase(workspaceId: string, userId: string, input: CreateCardPurchaseInput) {
  const batch = writeBatch(getFirebaseDb());
  const { transactionId } = await addCardPurchaseToBatch(batch, workspaceId, userId, input);
  fireWrite(batch.commit());
  return transactionId;
}

/**
 * Edita descrição, categoria e valor de uma compra no cartão — campos que a edição normal de
 * transação (`updateTransaction`) já cobre pra conta bancária, mas nunca existiu pra
 * `card_purchase`.
 *
 * **Só descrição e categoria — nunca valor.** Os dois são puro metadado de exibição: nenhum
 * ledger entry guarda `description`/`categoryId` própria, a fatura e a Análise sempre resolvem
 * os dois ao vivo a partir da transação via `sourceTransactionId` (`txnDescriptions`/
 * `categoryOfTransaction` em `InvoicePage.tsx`/`spendingAnalysis.ts`) — por isso um simples
 * `updateDoc` na transação já existente já reflete em toda parcela, passada ou futura, sem
 * tocar em nenhum ledger entry.
 *
 * **Por que valor NÃO é editável** (era, numa versão anterior desta função — achado ao vivo,
 * 2026-07-23): mudar o valor exigia reverter e recriar as N parcelas (soft-delete + recreate),
 * e isso não distinguia parcela futura de parcela já numa fatura FECHADA/PAGA — editar o valor
 * de uma compra com uma parcela já paga reabria a fatura com saldo devedor (o pagamento já
 * registrado não mudava, mas o valor da parcela recriada sim). Na vida real, o valor de uma
 * parcela já cobrada no cartão não muda. Se a pessoa errou o valor (ou a data, ou o número de
 * parcelas, ou o cartão), o caminho é excluir e lançar de novo — igual já vale pra esses
 * outros campos.
 */
export async function updateCardPurchase(
  workspaceId: string,
  userId: string,
  transactionId: string,
  patch: { description: string; categoryId?: string }
): Promise<void> {
  const transactionSnapshot = await getDoc(transactionRef(workspaceId, transactionId));
  if (!transactionSnapshot.exists()) {
    throw new Error('Transação não encontrada.');
  }

  const transaction = { id: transactionSnapshot.id, ...transactionSnapshot.data() } as Transaction;
  if (transaction.type !== 'card_purchase') {
    throw new Error('Esta transação não é uma compra no cartão.');
  }

  fireWrite(updateDoc(transactionRef(workspaceId, transactionId), {
    description: patch.description,
    categoryId: patch.categoryId ?? '',
    updatedBy: userId,
    version: increment(1),
    updatedAt: serverTimestamp()
  }));
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
        // Data real da compra, não o vencimento da fatura — mesmo padrão de `addCardPurchaseToBatch`,
        // onde todas as parcelas de uma compra compartilham o mesmo `effectiveAt` (a data da compra).
        // Antes usava `item.dueDate`, que é igual pra toda parcela da mesma fatura e fazia a tela de
        // detalhes da fatura mostrar o dia de vencimento do cartão como se fosse a data da compra.
        effectiveAt: parsed.purchaseDate,
        createdBy: userId,
        sourceTransactionId: transactionId,
        installmentNumber: item.installmentNumber,
        installmentTotal: parsed.totalInstallments
      })
    );
  }

  const monthKey = monthKeyFromDate(parsed.purchaseDate);
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
    // Data real da compra (não mais o 1º dia do mês da PRÓXIMA parcela) — antes toda compra
    // lançada por este fluxo caía sempre no dia 1º do mês de `nextDueMonth`, ignorando a data
    // informada pela pessoa.
    date: Timestamp.fromDate(parsed.purchaseDate),
    competenceMonth: monthKey,
    cashMonth: monthKey,
    tags: [],
    isRecurring: false,
    installmentGroupId,
    // Quantas parcelas ficam no ledger a partir de agora (as recriadas, `plan.length`) — não
    // o total original da compra (`totalInstallments`, que inclui as já pagas e nunca recriadas
    // aqui). É esse número que `updateCardPurchase` precisa pra recriar a mesma quantidade
    // numa edição futura.
    installments: plan.length,
    // O número REAL da primeira parcela recriada (o "7" de "7 de 10"). Sem ele, quem reconstrói o
    // cronograma sem o ledger (`invoicesForSpendingFromTransactions`) numeraria de 1, criava uma
    // "parcela 1" falsa e deslocava a série um mês. Ver o campo em `contracts.ts`.
    installmentStart: parsed.currentInstallment,
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

/**
 * Marca como `closed` toda fatura `open` cujo dia de fechamento já chegou. Chamado a cada
 * snapshot de `subscribeInvoices` — silencioso, sem feedback de UI (mesmo padrão de
 * `markOverdueBills` pra contas a pagar). Sem isso, o único jeito de uma fatura fechar é o
 * Cloud Scheduler `closeInvoicesDue`, que roda uma vez por dia e só pega faturas do dia exato
 * do fechamento — uma compra lançada com data retroativa (ou o scheduler falhando um dia)
 * deixava a fatura "Aberta" por até um mês, com o botão errado ("Antecipar fatura" em vez de
 * "Pagar fatura").
 *
 * `<=`, não `<`: a fatura fecha NO dia do fechamento, não no dia seguinte. Com `<`, o cliente
 * dizia "ainda aberta" no dia 2 enquanto o `closeInvoicesDue` do servidor (que fecha
 * `referenceMonth <= currentMonth` rodando nesse mesmo dia) já a tinha fechado — quem visse a
 * tela via um estado e quem lançasse caía noutro. Agora os dois lados usam a mesma fronteira
 * de `resolveInstallmentCycle`, e o estado não depende mais de o scheduler ter rodado.
 */
export function markClosedInvoices(
  workspaceId: string,
  invoices: Array<Pick<Invoice, 'id' | 'cardId' | 'status' | 'referenceMonth'>>,
  closingDay: number
) {
  const todayStart = startOfDay(new Date());

  invoices
    .filter(
      (invoice) =>
        invoice.status === 'open' && invoiceClosingDateForReferenceMonth(invoice.referenceMonth, closingDay) <= todayStart
    )
    .forEach((invoice) => closeInvoice(workspaceId, invoice.cardId, invoice.id));
}

/**
 * ID determinístico de UM pagamento de fatura. Fatura pode ser paga em partes, então `paidAt` +
 * `amountCents` separam pagamentos distintos; um retry/clique duplo repete o MESMO input e cai no
 * mesmo documento — a regra rejeita a segunda escrita (FIN-03).
 *
 * ⚠️ **Não recoloque o `cardId` aqui**: `invoiceId` já é `${cardId}_${referenceMonth}`
 * (`invoiceIdFor`), então prefixar o cartão repetia 37 caracteres à toa e levava a chave do
 * lançamento a 150 — acima do teto de 140 do id, o que fazia `idempotentEntryId` truncar e a regra
 * recusar o pagamento inteiro. O hash em `idempotentEntryId` já protege contra isso, mas encurtar a
 * chave evita chegar lá e mantém o id legível.
 */
export function invoicePaymentTransactionId(
  cardId: string, invoiceId: string, accountId: string, paidAt: Date, amountCents: number
) {
  const invoiceScope = invoiceId.startsWith(`${cardId}_`) ? invoiceId : `${cardId}_${invoiceId}`;
  return `${invoiceScope}_${accountId}_${paidAt.getTime()}_${amountCents}`;
}

export async function recordInvoicePayment(workspaceId: string, userId: string, input: RecordInvoicePaymentInput) {
  const parsed = recordInvoicePaymentSchema.parse(input);
  const transactionId = invoicePaymentTransactionId(
    parsed.cardId, parsed.invoiceId, parsed.accountId, parsed.paidAt, parsed.amountCents
  );
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
  applyAccountEffectsToBatch(
    batch,
    workspaceId,
    transactionAccountEffects({ type: 'card_payment', amountCents: parsed.amountCents, accountId: parsed.accountId })
  );

  // ⚠️ DEVOLVE a promise do commit, ao contrário do resto do arquivo (que usa `fireWrite`).
  //
  // Pagar fatura é a escrita que MAIS precisa de retorno, e era a que menos tinha: `fireWrite` tem
  // catch vazio em produção, e como esta função é `async` sem `await` no commit, ela resolvia na
  // hora — então os `.catch` das telas (InvoicePage/CardDetailPage) eram **código morto** e
  // qualquer `permission-denied` era invisível pro usuário E pro log. Em 06/08/2026 o dono não
  // conseguiu pagar uma fatura e não havia nenhuma forma de saber por quê.
  //
  // Offline-first segue intacto: quem chama fecha o sheet ANTES e só encadeia `.then`/`.catch` —
  // ninguém dá `await` pra liberar a UI. Mesmo padrão que o espaço do casal já usa.
  await batch.commit();
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

  // Um lançamento de débito por parcela antecipada (não um único débito somado) —
  // cada um carrega o `sourceTransactionId` da compra original correspondente. Sem
  // isso, excluir a compra original depois de antecipada deixava um débito "fantasma"
  // na fatura atual: o filtro de ledger órfão (useCardsData.ts) só sabe remover
  // lançamentos com `sourceTransactionId` apontando pra uma transação excluída, e um
  // débito somado sem esse vínculo nunca seria limpo.
  parsed.credits.forEach((credit, index) => {
    // ⚠️ A chave é a PARCELA (`entryId`), não a compra na fatura. Era
    // `${sourceTransactionId}_${invoiceId}` — que identifica "esta compra nesta fatura", e uma
    // compra pode ter DUAS parcelas na mesma fatura: até 09/07/2026 uma compra 4x em 31/jan num
    // cartão que fecha dia 28 caía em `['2026-02','2026-02','2026-04','2026-05']`
    // (`resolveInstallmentCycle`, corrigido desde, mas o dado de quem já tinha ficou como estava).
    // Nesse caso os dois `batch.set` do mesmo commit apontavam pro MESMO documento: a segunda
    // parcela sobrescrevia a primeira, o app antecipava uma só e o total gravado ficava menor que
    // o confirmado no diálogo — sem erro na tela, porque `fireWrite` engole. A leitura já tratava
    // parcelas irmãs por ocorrência desde 07/2026 (`collectFutureInstallments`); só a escrita
    // ficou pra trás. Mesma família dos ids determinísticos de 23/07 e 07/08 no `CLAUDE.md`.
    const creditKey = `anticipation_credit_${credit.entryId}`;
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
        createdBy: userId,
        sourceTransactionId: credit.sourceTransactionId,
        installmentNumber: credit.installmentNumber,
        installmentTotal: credit.installmentTotal
      })
    );

    const debitKey = `anticipation_debit_${credit.entryId}`;
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

  // Espelho na TRANSAÇÃO de cada compra afetada: `mês da fatura da parcela` → `mês em que se
  // antecipou`. Antecipar era 100% evento de ledger, então o "Resumo de gastos" do Dashboard — que
  // reconstrói o cronograma sem ler o ledger, por custo de leitura — continuava mostrando a parcela
  // no mês original, enquanto a Análise já a movia pro mês da antecipação (decisão do dono,
  // 05/08/2026). Com este espelho os dois passam a dizer a mesma coisa.
  //
  // Chaveado por mês da fatura (extraído do `invoiceId`, que é `${cardId}_${yyyy-MM}`) e não por
  // número de parcela: crédito de dado legado pode não ter `installmentNumber`, e o mês é o que a
  // reconstrução conhece de cada parcela.
  const anticipatedByTransaction = new Map<string, Record<string, string>>();
  const anticipationMonth = monthKeyFromDate(parsed.effectiveAt);
  parsed.credits.forEach((credit) => {
    const invoiceMonth = credit.invoiceId.slice(credit.invoiceId.lastIndexOf('_') + 1);
    if (!/^\d{4}-\d{2}$/.test(invoiceMonth)) return;
    const current = anticipatedByTransaction.get(credit.sourceTransactionId) ?? {};
    current[invoiceMonth] = anticipationMonth;
    anticipatedByTransaction.set(credit.sourceTransactionId, current);
  });

  for (const [sourceTransactionId, months] of anticipatedByTransaction) {
    // Chaves pontilhadas (`anticipatedInstallments.2026-11`) preservam o que já estava lá de uma
    // antecipação anterior, em vez de sobrescrever o mapa inteiro — quem antecipa duas vezes na
    // mesma compra, em meses diferentes, não perde o primeiro registro.
    const patch: Record<string, unknown> = {
      updatedBy: userId,
      version: increment(1),
      updatedAt: serverTimestamp()
    };
    for (const [invoiceMonth, month] of Object.entries(months)) {
      patch[`anticipatedInstallments.${invoiceMonth}`] = month;
    }
    batch.update(transactionRef(workspaceId, sourceTransactionId), patch);
  }

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

/**
 * Faturas de um cartão. Esta query faz DUAS coisas ao mesmo tempo, e é importante saber qual é
 * qual antes de mexer:
 *
 * **1. `orderBy('referenceMonth', 'asc')` = a ordem da lista na tela do Cartão** (a mais antiga
 * primeiro, cronológica). Não é detalhe de implementação: era `desc` e foi trocado de propósito
 * (commit `b9cd0e6`, 24/07/2026) porque compra parcelada cria faturas **futuras**, então "mais
 * nova primeiro" jogava fatura de 2027 pro topo, antes das de 2026. `CardDetailPage` renderiza na
 * ordem em que chega, sem reordenar. **Não volte pra `desc`** sem resolver a exibição.
 *
 * **2. `limit(24)` = quantas faturas o app baixa.** Existe por custo, e o custo é real: esta
 * assinatura roda **por cartão, em todo boot** (`useCardsData`, o Comprometido do Dashboard
 * precisa das faturas), e cada fatura carregada vira **um listener de ledger** nas telas que leem
 * ledger — `CardDetailPage` assina o de todas as faturas daquele cartão, e a Análise
 * (`SearchPage`) o de **todas as faturas de todos os cartões**. Sem teto, isso cresce pra sempre
 * conforme a conta envelhece. (O comentário anterior atribuía esse listener ao `useCardsData`,
 * que na verdade não assina ledger nenhum — o custo existe, mas nas telas, não no boot.)
 *
 * ⚠️ **O efeito colateral que ninguém pesou quando a direção mudou:** ordem + limite juntos
 * significam que a janela são as **24 mais ANTIGAS**. Num cartão que passe de 24 faturas, o que
 * fica de fora é o **fim da fila** — a fatura atual e as futuras, justamente as que o Comprometido
 * (`selectCurrentCycleInvoices`) e a Análise de um mês futuro precisam. Quando era `desc`, "24
 * mais recentes" era literal e esse problema não existia.
 *
 * **O gatilho não é o tempo de uso do app, é o tamanho do parcelamento**: o app aceita até 24x
 * (`cardSchemas.ts`), e uma compra em 24x cria 24 faturas futuras de uma vez.
 *
 * **Quando isso virar real, o conserto não é mexer na ordem** (a lista depende dela): é ancorar a
 * janela no presente (`where('referenceMonth', '>=', ...)`) e paginar o passado sob demanda, no
 * mesmo padrão de `loadMoreTransactions` ("Carregar mais" do Extrato). Ver `docs/planning/TODOS.md`.
 */
/** Quantos meses de fatura PASSADA carregar. 24 porque é o que a Análise consome: Resumo Anual do
 *  ano anterior chega a 23 meses atrás, comparação "mesmo mês do ano passado" a 12, histórico e
 *  tendência a 6. Passado é o lado que cresce pra sempre — por isso é o lado com teto. */
export const PAST_INVOICE_WINDOW_MONTHS = 24;

/**
 * Rede de segurança do lado FUTURO — **não é limite funcional**, e não pode ser dimensionado "no
 * olho". O futuro é limitado por natureza (no máximo o maior parcelamento ativo) e encolhe sozinho
 * conforme as séries terminam, então ele NÃO é cortado.
 *
 * ⚠️ Este número tem que ficar folgado em relação ao horizonte alcançável, e **sobe junto** se o
 * teto de parcelas subir. Com 48x (`MAX_CARD_PURCHASE_INSTALLMENTS`), duas compras longas
 * escalonadas alcançam ~52 meses à frente (pergunta do dono, 07/08/2026: "parcelo 48x agora e
 * outra 48x em 4 meses"); 96 deixa quase o dobro de folga. Se um dia bater aqui, o sintoma é o
 * bug que estas duas queries existem pra matar: fatura futura simplesmente não chega.
 */
export const FUTURE_INVOICE_SAFETY_LIMIT = 96;

/**
 * Faturas de um cartão, em DUAS assinaturas com direções opostas.
 *
 * ⚠️ Era uma query só: `orderBy('referenceMonth','asc') + limit(24)`. Isso carregava as 24 mais
 * ANTIGAS, então num cartão com mais de 24 faturas o que não chegava era a fatura atual e as
 * futuras — justamente o que o Comprometido (`selectCurrentCycleInvoices`) e a Análise de mês
 * futuro precisam. **Aumentar o limite não resolvia**: com `asc`, o corte é sempre no futuro,
 * em qualquer número (achado do dono, 07/08/2026, fazendo a conta de duas compras em 48x
 * escalonadas). O conserto é estrutural — cada lado corta do lado certo:
 *
 *   futuro/atual: `>= mês atual`  asc   (sem corte real, só a rede de segurança)
 *   passado:      `<  mês atual`  desc  (as 24 mais recentes)
 *
 * A ordem `asc` da exibição **não depende mais disto**: `useCardsData` ordena a união. Antes a
 * tela do Cartão renderizava na ordem de chegada, e por isso a direção da query era a ordem da
 * lista (commit `b9cd0e6`, 24/07 — trocada de `desc` pra `asc` porque fatura futura aparecia no
 * topo). Aquela correção continua valendo, agora garantida por ordenação explícita.
 *
 * `onNext` recebe QUAL janela entregou, porque quem consome precisa substituir só aquela metade —
 * um `onNext` que trocasse a lista inteira faria as duas assinaturas se apagarem mutuamente.
 */
export function subscribeInvoicesWindow(
  workspaceId: string,
  cardId: string,
  window: 'past' | 'future',
  currentMonth: string,
  onNext: (items: Array<LocalCardSynced<Invoice>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const constraints =
    window === 'future'
      ? [where('referenceMonth', '>=', currentMonth), orderBy('referenceMonth', 'asc'), limit(FUTURE_INVOICE_SAFETY_LIMIT)]
      : [
          where('referenceMonth', '<', currentMonth),
          orderBy('referenceMonth', 'desc'),
          limit(PAST_INVOICE_WINDOW_MONTHS)
        ];

  return onSnapshot(
    query(invoicesRef(workspaceId, cardId), ...constraints),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<Invoice>(item))),
    onError
  );
}

/**
 * Página de faturas ANTIGAS, sob demanda — o "ver mais faturas" da tela do Cartão.
 *
 * `getDocs`, não `onSnapshot`: histórico velho quase não muda e escutar tudo ao vivo custaria à
 * toa. Mesmo desenho de `loadMoreTransactions` (`financeService.ts`), inclusive o cursor por valor
 * — aqui `referenceMonth` é único por cartão, então não precisa do cursor por snapshot.
 *
 * ⚠️ Fatura carregada por aqui vive **só na tela do Cartão**, não entra em `cardsData.invoices` —
 * então isto NÃO amplia o histórico da Análise. Ampliar exigiria pagar o ledger dessas faturas.
 */
export async function loadMoreInvoices(
  workspaceId: string,
  cardId: string,
  beforeReferenceMonth: string,
  pageSize = 12
): Promise<Array<LocalCardSynced<Invoice>>> {
  const snapshot = await getDocs(
    query(
      invoicesRef(workspaceId, cardId),
      where('referenceMonth', '<', beforeReferenceMonth),
      orderBy('referenceMonth', 'desc'),
      limit(pageSize)
    )
  );
  return snapshot.docs.map((item) => withLocalSync<Invoice>(item));
}

export function subscribeInvoiceLedger(
  workspaceId: string,
  cardId: string,
  invoiceId: string,
  onNext: (items: Array<LocalCardSynced<InvoiceLedgerEntry>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  // 'desc' (mais recente primeiro) — usuária relatou que "Compras" na fatura não vinha em
  // ordem de data. Nenhum outro consumidor deste ledger (SearchPage, CardDetailPage) depende
  // de posição no array, só filtra/soma por tipo — seguro mudar a direção aqui na fonte.
  return onSnapshot(
    query(ledgerRef(workspaceId, cardId, invoiceId), orderBy('effectiveAt', 'desc')),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<InvoiceLedgerEntry>(item))),
    onError
  );
}
