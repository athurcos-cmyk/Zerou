import {
  Timestamp,
  collection,
  deleteField,
  deleteDoc,
  doc,
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
  type QuerySnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/config';
import { fireWrite } from '../firebase/fireWrite';
import { readSnapshotData, readSnapshotDoc } from '../firebase/snapshotData';
import { startOfDay } from 'date-fns';
import { buildDefaultCategory, defaultCategories } from './defaultCategories';
import { monthKeyFromDate } from './financeDates';
import { mergeAccountEffects, invertAccountEffects, transactionAccountEffects, type AccountEffect } from './financeCalculations';
import {
  createAccountSchema,
  createBillSchema,
  createRecurringRuleSchema,
  createTransactionSchema,
  type CreateAccountInput,
  type CreateBillInput,
  type CreateRecurringRuleInput,
  type CreateTransactionInput
} from './financeSchemas';
import type { Account, Bill, Budget, Category, Goal, GoalContribution, RecurringRule, SyncStatus, Transaction } from '../types/contracts';

export type FinancialCollectionName = 'accounts' | 'categories' | 'transactions' | 'bills' | 'recurring' | 'goals' | 'goalContributions' | 'budgets';

export type LocalSynced<T> = T & {
  localSyncStatus: SyncStatus;
};

function createId(prefix: string) {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return `${prefix}_${randomId.replace(/-/g, '')}`;
}

function collectionRef(workspaceId: string, collectionName: FinancialCollectionName) {
  return collection(getFirebaseDb(), 'workspaces', workspaceId, collectionName);
}

function documentRef(workspaceId: string, collectionName: FinancialCollectionName, id: string) {
  return doc(getFirebaseDb(), 'workspaces', workspaceId, collectionName, id);
}

/** Aplica os deltas de saldo (ver `transactionAccountEffects`) num batch já existente —
 * `increment()` é atômico no servidor, funciona offline igual o resto do batch. */
export function applyAccountEffectsToBatch(
  batch: ReturnType<typeof writeBatch>,
  workspaceId: string,
  effects: AccountEffect[]
) {
  for (const effect of effects) {
    batch.update(documentRef(workspaceId, 'accounts', effect.accountId), {
      currentBalanceCents: increment(effect.deltaCents),
      updatedAt: serverTimestamp()
    });
  }
}

function omitUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== '')) as T;
}

function withLocalSync<T extends object>(snapshot: QueryDocumentSnapshot<DocumentData>) {
  const data = readSnapshotDoc<T>(snapshot);
  const syncStatus = (data as { syncStatus?: SyncStatus }).syncStatus;
  const localSyncStatus: SyncStatus = snapshot.metadata.hasPendingWrites ? 'pending' : syncStatus ?? 'synced';
  return { ...data, localSyncStatus } as LocalSynced<T>;
}

export async function ensureDefaultCategories(workspaceId: string) {
  const existing = await getDocs(collectionRef(workspaceId, 'categories'));
  const existingIds = new Set(existing.docs.map((snapshot) => snapshot.id));
  const missing = defaultCategories.filter((category) => !existingIds.has(category.id));

  if (missing.length === 0) {
    return;
  }

  const batch = writeBatch(getFirebaseDb());
  const now = serverTimestamp();

  missing.forEach((category) => {
    batch.set(documentRef(workspaceId, 'categories', category.id), {
      ...buildDefaultCategory(workspaceId, category),
      createdAt: now,
      updatedAt: now
    });
  });

  fireWrite(batch.commit());
}

export async function createAccount(workspaceId: string, userId: string, input: CreateAccountInput) {
  const parsed = createAccountSchema.parse(input);
  const id = createId('acct');
  const now = serverTimestamp();

  fireWrite(setDoc(documentRef(workspaceId, 'accounts', id), {
    id,
    workspaceId,
    name: parsed.name,
    type: parsed.type,
    openingBalanceCents: parsed.openingBalanceCents,
    currentBalanceCents: parsed.openingBalanceCents,
    isActive: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  }));

  return id;
}

/** Quantas transações da conta são inspecionadas no servidor antes de decidir. Ver `accountHasLiveTransactions`. */
const ACCOUNT_LINK_PROBE_LIMIT = 20;

/**
 * Existe alguma transação **não excluída** ligada a esta conta? Pergunta ao servidor.
 *
 * `deleteAccount` apaga o documento de vez, então a UI precisa impedir a exclusão de uma
 * conta com histórico — senão as transações dela ficam órfãs no Extrato enquanto somem do
 * saldo. A checagem antiga usava `finance.transactions`, que é a janela das 300 transações
 * mais recentes do workspace inteiro: uma conta antiga, cujos lançamentos já saíram dessa
 * janela, parecia vazia e podia ser apagada.
 *
 * Lê no máximo `ACCOUNT_LINK_PROBE_LIMIT` documentos por lado (origem e destino). Escapar
 * exigiria a conta ter 20+ transações excluídas antes de qualquer viva na ordem do índice —
 * e o custo é pago uma vez, num clique deliberado de exclusão.
 */
export async function accountHasLiveTransactions(workspaceId: string, accountId: string) {
  const transactions = collectionRef(workspaceId, 'transactions');
  const [asSource, asDestination] = await Promise.all([
    getDocs(query(transactions, where('accountId', '==', accountId), limit(ACCOUNT_LINK_PROBE_LIMIT))),
    getDocs(query(transactions, where('destinationAccountId', '==', accountId), limit(ACCOUNT_LINK_PROBE_LIMIT)))
  ]);

  const hasLiveDoc = (snapshot: QuerySnapshot<DocumentData>) =>
    snapshot.docs.some((document) => !readSnapshotData(document)?.deletedAt);

  return hasLiveDoc(asSource) || hasLiveDoc(asDestination);
}

export async function deleteAccount(workspaceId: string, accountId: string) {
  fireWrite(deleteDoc(documentRef(workspaceId, 'accounts', accountId)));
}

export async function createTransaction(workspaceId: string, userId: string, input: CreateTransactionInput) {
  const parsed = createTransactionSchema.parse(input);
  const id = createId('txn');
  const now = serverTimestamp();
  const date = Timestamp.fromDate(parsed.date);
  const monthKey = monthKeyFromDate(parsed.date);

  const batch = writeBatch(getFirebaseDb());
  batch.set(documentRef(workspaceId, 'transactions', id), omitUndefined({
    id,
    workspaceId,
    createdBy: userId,
    updatedBy: userId,
    type: parsed.type,
    amountCents: parsed.amountCents,
    description: parsed.description,
    merchant: parsed.merchant,
    categoryId: parsed.categoryId,
    accountId: parsed.accountId,
    destinationAccountId: parsed.destinationAccountId,
    date,
    competenceMonth: monthKey,
    cashMonth: monthKey,
    tags: parsed.tags,
    notes: parsed.notes,
    isRecurring: false,
    clientMutationId: id,
    syncStatus: 'synced',
    version: 1,
    createdAt: now,
    updatedAt: now
  }));
  applyAccountEffectsToBatch(batch, workspaceId, transactionAccountEffects(parsed));
  fireWrite(batch.commit());

  return id;
}

export async function createCategory(
  workspaceId: string,
  userId: string,
  input: { name: string; icon: string; type: 'income' | 'expense' | 'both'; color?: string }
) {
  const id = createId('cat');
  const now = serverTimestamp();
  fireWrite(setDoc(documentRef(workspaceId, 'categories', id), omitUndefined({
    id,
    workspaceId,
    name: input.name.trim(),
    icon: input.icon,
    color: input.color,
    type: input.type,
    isDefault: false,
    isActive: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  })));
  return id;
}

export async function updateCategory(
  workspaceId: string,
  categoryId: string,
  patch: { name?: string; icon?: string; color?: string }
) {
  fireWrite(updateDoc(documentRef(workspaceId, 'categories', categoryId), omitUndefined({
    name: patch.name?.trim(),
    icon: patch.icon,
    color: patch.color,
    updatedAt: serverTimestamp()
  })));
}

export async function deleteCategory(workspaceId: string, categoryId: string) {
  fireWrite(updateDoc(documentRef(workspaceId, 'categories', categoryId), {
    isActive: false,
    updatedAt: serverTimestamp()
  }));
}

export async function createGoal(
  workspaceId: string,
  userId: string,
  input: { name: string; kind: 'save' | 'debt'; targetCents: number; savedCents?: number; icon?: string; color?: string; dueDate?: Date }
) {
  const id = createId('goal');
  const now = serverTimestamp();
  fireWrite(setDoc(documentRef(workspaceId, 'goals', id), omitUndefined({
    id,
    workspaceId,
    name: input.name.trim(),
    kind: input.kind,
    targetCents: input.targetCents,
    savedCents: input.savedCents ?? 0,
    icon: input.icon,
    color: input.color,
    dueDate: input.dueDate ? Timestamp.fromDate(input.dueDate) : undefined,
    isActive: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  })));
  return id;
}

export async function contributeToGoal(workspaceId: string, goalId: string, deltaCents: number) {
  fireWrite(updateDoc(documentRef(workspaceId, 'goals', goalId), {
    savedCents: increment(deltaCents),
    updatedAt: serverTimestamp()
  }));
}

/**
 * Guardar no cofrinho do casal com transação pessoal no mesmo batch: atômico, cross-workspace.
 * Se `opts.accountId` for omitido, só grava a contribuição — sem mexer no workspace pessoal.
 */
export async function coupleGoalDeposit(
  workspaceId: string,
  personalWorkspaceId: string | undefined,
  userId: string,
  goalId: string,
  amountCents: number,
  opts: { description?: string; accountId?: string } = {}
) {
  const batch = writeBatch(getFirebaseDb());
  const now = new Date();
  const contribId = createId('contrib');
  batch.set(documentRef(workspaceId, 'goalContributions', contribId), {
    id: contribId,
    workspaceId,
    goalId,
    userId,
    amountCents,
    type: 'deposit',
    monthKey: monthKeyFromDate(now),
    createdAt: serverTimestamp()
  });
  batch.update(documentRef(workspaceId, 'goals', goalId), {
    savedCents: increment(amountCents),
    updatedAt: serverTimestamp()
  });
  if (opts.accountId && personalWorkspaceId) {
    const txnId = createId('txn');
    const cashMonth = monthKeyFromDate(now);
    batch.set(documentRef(personalWorkspaceId, 'transactions', txnId), omitUndefined({
      id: txnId,
      workspaceId: personalWorkspaceId,
      createdBy: userId,
      updatedBy: userId,
      type: 'expense' as const,
      amountCents,
      description: opts.description ?? 'Cofrinho',
      categoryId: 'both_cofrinho',
      accountId: opts.accountId,
      date: Timestamp.fromDate(now),
      competenceMonth: cashMonth,
      cashMonth,
      tags: ['cofrinho'],
      isRecurring: false,
      clientMutationId: txnId,
      syncStatus: 'synced' as const,
      version: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));
    applyAccountEffectsToBatch(
      batch,
      personalWorkspaceId,
      transactionAccountEffects({ type: 'expense', amountCents, accountId: opts.accountId })
    );
  }
  fireWrite(batch.commit());
}

/**
 * Resgatar do cofrinho do casal com transação pessoal no mesmo batch: atômico, cross-workspace.
 * Se `opts.accountId` for omitido, só grava a contribuição — sem mexer no workspace pessoal.
 */
export async function coupleGoalWithdraw(
  workspaceId: string,
  personalWorkspaceId: string | undefined,
  userId: string,
  goalId: string,
  amountCents: number,
  opts: { description?: string; accountId?: string } = {}
) {
  const batch = writeBatch(getFirebaseDb());
  const now = new Date();
  const contribId = createId('contrib');
  batch.set(documentRef(workspaceId, 'goalContributions', contribId), {
    id: contribId,
    workspaceId,
    goalId,
    userId,
    amountCents,
    type: 'withdrawal',
    monthKey: monthKeyFromDate(now),
    createdAt: serverTimestamp()
  });
  batch.update(documentRef(workspaceId, 'goals', goalId), {
    savedCents: increment(-amountCents),
    updatedAt: serverTimestamp()
  });
  if (opts.accountId && personalWorkspaceId) {
    const txnId = createId('txn');
    const cashMonth = monthKeyFromDate(now);
    batch.set(documentRef(personalWorkspaceId, 'transactions', txnId), omitUndefined({
      id: txnId,
      workspaceId: personalWorkspaceId,
      createdBy: userId,
      updatedBy: userId,
      type: 'income' as const,
      amountCents,
      description: opts.description ?? 'Cofrinho (resgate)',
      categoryId: 'both_cofrinho',
      accountId: opts.accountId,
      date: Timestamp.fromDate(now),
      competenceMonth: cashMonth,
      cashMonth,
      tags: ['cofrinho'],
      isRecurring: false,
      clientMutationId: txnId,
      syncStatus: 'synced' as const,
      version: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));
    applyAccountEffectsToBatch(
      batch,
      personalWorkspaceId,
      transactionAccountEffects({ type: 'income', amountCents, accountId: opts.accountId })
    );
  }
  fireWrite(batch.commit());
}

export function subscribeGoalContributions(
  workspaceId: string,
  onNext: (items: Array<LocalSynced<GoalContribution>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  // Sem orderBy: a agregação (total/mês/por pessoa) usa monthKey (client-set),
  // e offline o createdAt pendente esconderia a contribuição recém-criada.
  return onSnapshot(
    collectionRef(workspaceId, 'goalContributions'),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<GoalContribution>(item))),
    onError
  );
}

export async function deleteGoal(workspaceId: string, goalId: string) {
  fireWrite(deleteDoc(documentRef(workspaceId, 'goals', goalId)));
}

export async function softDeleteTransaction(
  workspaceId: string,
  userId: string,
  transactionId: string,
  transaction: Pick<Transaction, 'type' | 'amountCents' | 'accountId' | 'destinationAccountId' | 'deletedAt'>
) {
  if (transaction.deletedAt) {
    return;
  }

  const batch = writeBatch(getFirebaseDb());
  batch.update(documentRef(workspaceId, 'transactions', transactionId), {
    updatedBy: userId,
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    version: increment(1)
  });
  applyAccountEffectsToBatch(batch, workspaceId, invertAccountEffects(transactionAccountEffects(transaction)));
  fireWrite(batch.commit());
}

export async function updateTransaction(
  workspaceId: string,
  userId: string,
  transactionId: string,
  previous: Pick<Transaction, 'type' | 'amountCents' | 'accountId' | 'destinationAccountId'>,
  input: CreateTransactionInput
) {
  const parsed = createTransactionSchema.parse(input);
  const date = Timestamp.fromDate(parsed.date);
  const monthKey = monthKeyFromDate(parsed.date);

  const batch = writeBatch(getFirebaseDb());
  batch.update(
    documentRef(workspaceId, 'transactions', transactionId),
    omitUndefined({
      updatedBy: userId,
      type: parsed.type,
      amountCents: parsed.amountCents,
      description: parsed.description,
      merchant: parsed.merchant || deleteField(),
      categoryId: parsed.categoryId || deleteField(),
      accountId: parsed.accountId,
      destinationAccountId: parsed.type === 'transfer' ? parsed.destinationAccountId : deleteField(),
      date,
      competenceMonth: monthKey,
      cashMonth: monthKey,
      tags: parsed.tags,
      notes: parsed.notes || deleteField(),
      isRecurring: false,
      syncStatus: 'synced',
      version: increment(1),
      updatedAt: serverTimestamp()
    })
  );
  applyAccountEffectsToBatch(
    batch,
    workspaceId,
    mergeAccountEffects(invertAccountEffects(transactionAccountEffects(previous)), transactionAccountEffects(parsed))
  );
  fireWrite(batch.commit());
}

export async function createBill(workspaceId: string, userId: string, input: CreateBillInput) {
  const parsed = createBillSchema.parse(input);
  const id = createId('bill');
  const now = serverTimestamp();

  fireWrite(setDoc(documentRef(workspaceId, 'bills', id), omitUndefined({
    id,
    workspaceId,
    description: parsed.description,
    amountCents: parsed.amountCents,
    dueDate: Timestamp.fromDate(parsed.dueDate),
    status: 'pending',
    categoryId: parsed.categoryId,
    accountId: parsed.accountId,
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  })));

  return id;
}

export async function updateBillStatus(workspaceId: string, billId: string, status: Bill['status']) {
  fireWrite(updateDoc(documentRef(workspaceId, 'bills', billId), {
    status,
    updatedAt: serverTimestamp()
  }));
}

/** Marca como `overdue` toda bill `pending` cujo dia de vencimento já passou. Chamado a
 * cada snapshot de `subscribeBills` — silencioso, sem feedback de UI (não é ação do usuário). */
export function markOverdueBills(workspaceId: string, bills: Array<Pick<Bill, 'id' | 'status' | 'dueDate'>>) {
  const todayStart = startOfDay(new Date());

  bills
    .filter((bill) => bill.status === 'pending' && bill.dueDate.toDate() < todayStart)
    .forEach((bill) => updateBillStatus(workspaceId, bill.id, 'overdue'));
}

export async function createRecurringRule(workspaceId: string, userId: string, input: CreateRecurringRuleInput) {
  const parsed = createRecurringRuleSchema.parse(input);
  const id = createId('rec');
  const now = serverTimestamp();

  fireWrite(setDoc(documentRef(workspaceId, 'recurring', id), omitUndefined({
    id,
    workspaceId,
    description: parsed.description,
    amountCents: parsed.amountCents,
    frequency: parsed.frequency,
    nextOccurrenceAt: Timestamp.fromDate(parsed.nextOccurrenceAt),
    anchorDay: parsed.nextOccurrenceAt.getDate(),
    accountId: parsed.accountId,
    categoryId: parsed.categoryId,
    isActive: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  })));

  return id;
}

export function subscribeAccounts(
  workspaceId: string,
  onNext: (items: Array<LocalSynced<Account>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collectionRef(workspaceId, 'accounts'), orderBy('name', 'asc')),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<Account>(item))),
    onError
  );
}

export function subscribeCategories(
  workspaceId: string,
  onNext: (items: Array<LocalSynced<Category>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collectionRef(workspaceId, 'categories'), orderBy('name', 'asc')),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<Category>(item))),
    onError
  );
}

export function subscribeTransactions(
  workspaceId: string,
  onNext: (items: Array<LocalSynced<Transaction>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collectionRef(workspaceId, 'transactions'), orderBy('date', 'desc'), limit(300)),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<Transaction>(item))),
    onError
  );
}

export function subscribeGoals(
  workspaceId: string,
  onNext: (items: Array<LocalSynced<Goal>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  // Sem orderBy('createdAt'): offline o serverTimestamp fica nulo e a query
  // esconderia o item recém-criado. Ordenação fica no cliente (useGoalsData).
  return onSnapshot(
    collectionRef(workspaceId, 'goals'),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<Goal>(item))),
    onError
  );
}

// ─── Budgets ───────────────────────────────────────────────────────────────────

/**
 * Só para o PRIMEIRO valor de um orçamento (o documento ainda não existe). Reenviar
 * `createdAt`/`createdBy` numa edição posterior faria `validBudgetUpdate` rejeitar a
 * escrita (`createdAt` precisa ficar igual ao do documento existente) — por isso
 * criar e editar são funções separadas, igual `createCategory`/`updateCategory`.
 */
export function createBudget(
  workspaceId: string,
  userId: string,
  categoryId: string,
  limitCents: number
) {
  const id = categoryId;
  fireWrite(
    setDoc(documentRef(workspaceId, 'budgets', id), omitUndefined({
      id,
      workspaceId,
      categoryId,
      limitCents,
      isActive: true,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }))
  );
}

/** Edita o limite de um orçamento já existente — só os campos que `validBudgetUpdate` permite mudar. */
export function updateBudgetLimit(workspaceId: string, categoryId: string, limitCents: number) {
  fireWrite(
    updateDoc(documentRef(workspaceId, 'budgets', categoryId), {
      limitCents,
      isActive: true,
      updatedAt: serverTimestamp()
    })
  );
}

export function deleteBudget(workspaceId: string, categoryId: string) {
  fireWrite(deleteDoc(documentRef(workspaceId, 'budgets', categoryId)));
}

export function subscribeBudgets(
  workspaceId: string,
  onNext: (items: Array<LocalSynced<Budget>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collectionRef(workspaceId, 'budgets'),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<Budget>(item))),
    onError
  );
}

export function subscribeBills(
  workspaceId: string,
  onNext: (items: Array<LocalSynced<Bill>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collectionRef(workspaceId, 'bills'), orderBy('dueDate', 'asc')),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<Bill>(item))),
    onError
  );
}

// ─── nextOccurrenceDate ───────────────────────────────────────────────────────

export function nextOccurrenceDate(
  current: Date,
  frequency: 'weekly' | 'monthly' | 'yearly',
  anchorDay?: number
): Date {
  if (frequency === 'weekly') {
    const next = new Date(current);
    next.setDate(next.getDate() + 7);
    return next;
  }

  // setMonth/setFullYear transbordam quando o mês alvo é mais curto (ex.: 31/jan
  // vira 3/mar, pulando fevereiro inteiro). Em vez disso, usamos o dia do mês
  // alvo, mas limitado (clamp) ao último dia válido desse mês (ex.: 31/jan → 28/fev).
  // `anchorDay`, quando informado, é o dia original pretendido (guardado na
  // criação da regra) — usá-lo em vez de `current.getDate()` faz a ocorrência
  // "voltar" pro dia 31 assim que um mês de 31 dias aparecer, em vez de ficar
  // ancorada no dia clampado (28) pra sempre.
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

// ─── payBill ──────────────────────────────────────────────────────────────────
// Marca a conta como paga e cria uma transação de despesa na conta informada.
// Se nenhuma conta for informada, apenas muda o status (sem débito).
export function payBill(
  workspaceId: string,
  userId: string,
  bill: Pick<Bill, 'id' | 'description' | 'amountCents' | 'categoryId' | 'accountId'>,
  opts: { accountId?: string; amountCents?: number; description?: string; categoryId?: string } = {}
) {
  const amount = opts.amountCents ?? bill.amountCents;
  const acctId = opts.accountId ?? bill.accountId;
  const desc = opts.description ?? bill.description;
  const catId = opts.categoryId ?? bill.categoryId;
  const batch = writeBatch(getFirebaseDb());
  batch.update(documentRef(workspaceId, 'bills', bill.id), { status: 'paid', updatedAt: serverTimestamp() });
  if (acctId) {
    const id = createId('txn');
    const now = new Date();
    batch.set(documentRef(workspaceId, 'transactions', id), omitUndefined({
      id, workspaceId, createdBy: userId, updatedBy: userId,
      type: 'expense', amountCents: amount, description: desc,
      categoryId: catId, accountId: acctId,
      date: Timestamp.fromDate(now), competenceMonth: monthKeyFromDate(now), cashMonth: monthKeyFromDate(now),
      tags: ['conta'], isRecurring: false, clientMutationId: id,
      syncStatus: 'synced', version: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    }));
    applyAccountEffectsToBatch(batch, workspaceId, transactionAccountEffects({ type: 'expense', amountCents: amount, accountId: acctId }));
  }
  fireWrite(batch.commit());
}

// ─── recordRecurringPayment ───────────────────────────────────────────────────

/**
 * Id determinístico da transação de UMA ocorrência de uma recorrência.
 *
 * Duas coisas registram a mesma ocorrência: a Cloud Function `generateRecurrences` (roda
 * às 6h) e o botão "Registrar" da tela de Recorrências. Sem uma chave em comum, as duas
 * criavam transações diferentes e a despesa saía em dobro. Com o id derivado de
 * `(regra, data da ocorrência)`, a segunda escrita cai no mesmo documento — e a regra do
 * Firestore a rejeita (`version` não incrementa num payload de create), então o batch
 * inteiro é desfeito e nada é duplicado.
 *
 * A data é lida em **UTC**, não no fuso local: o app roda em BRT e a Cloud Function em UTC,
 * e `getDate()` daria dias diferentes para o mesmo instante. A chave não precisa ser
 * legível, precisa ser idêntica dos dois lados.
 *
 * Mantido em sincronia com `recurringOccurrenceTransactionId` em `functions/src/automation.ts`.
 */
export function recurringOccurrenceTransactionId(ruleId: string, occurrenceAt: Date) {
  return `${ruleId}_${occurrenceAt.toISOString().slice(0, 10)}`;
}

/**
 * Uma ocorrência só pode ser registrada quando já venceu. Se `nextOccurrenceAt` está no
 * futuro, ou a automação já registrou a ocorrência anterior, ou ela ainda não chegou —
 * nos dois casos, "Registrar" criaria uma despesa que não existe.
 */
export function isRecurrenceDue(nextOccurrenceAt: Date, now: Date = new Date()) {
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return nextOccurrenceAt.getTime() <= endOfToday.getTime();
}

/** Dias de antecedência em que já dá pra pagar/registrar uma recorrência antes do vencimento. */
export const RECURRENCE_EARLY_PAY_DAYS = 7;

/**
 * Se a ocorrência já pode ser registrada — vencida OU dentro da janela de antecedência
 * (pra quem paga a conta alguns dias antes do vencimento, ex.: conta do dia 10 paga no dia 7).
 * É seguro liberar adiantado: a transação da ocorrência é identificada pela DATA DE VENCIMENTO
 * (`recurringOccurrenceTransactionId(rule, nextOccurrenceAt)`), não pela data do pagamento —
 * então registrar hoje e a automação rodar no vencimento cai no mesmo id, sem duplicar.
 */
export function canRegisterRecurrence(
  nextOccurrenceAt: Date,
  now: Date = new Date(),
  earlyDays = RECURRENCE_EARLY_PAY_DAYS
) {
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const earliest = new Date(nextOccurrenceAt);
  earliest.setDate(earliest.getDate() - earlyDays);
  return earliest.getTime() <= endOfToday.getTime();
}

// Cria transação de despesa e avança nextOccurrenceAt para a próxima data.
export function recordRecurringPayment(
  workspaceId: string,
  userId: string,
  rule: Pick<RecurringRule, 'id' | 'description' | 'amountCents' | 'categoryId' | 'accountId' | 'frequency' | 'nextOccurrenceAt' | 'anchorDay'>,
  opts: { accountId?: string; amountCents?: number } = {}
) {
  const amount = opts.amountCents ?? rule.amountCents;
  if (amount == null) return;
  const acctId = opts.accountId || rule.accountId;
  const occurrenceAt = rule.nextOccurrenceAt.toDate();
  const nextDate = nextOccurrenceDate(occurrenceAt, rule.frequency, rule.anchorDay);
  const batch = writeBatch(getFirebaseDb());
  batch.update(documentRef(workspaceId, 'recurring', rule.id), {
    nextOccurrenceAt: Timestamp.fromDate(nextDate),
    updatedAt: serverTimestamp()
  });
  if (acctId) {
    const id = recurringOccurrenceTransactionId(rule.id, occurrenceAt);
    const now = new Date();
    batch.set(documentRef(workspaceId, 'transactions', id), omitUndefined({
      id, workspaceId, createdBy: userId, updatedBy: userId,
      type: 'expense', amountCents: amount, description: rule.description,
      categoryId: rule.categoryId, accountId: acctId,
      date: Timestamp.fromDate(now), competenceMonth: monthKeyFromDate(now), cashMonth: monthKeyFromDate(now),
      tags: ['recorrente'], isRecurring: true, recurringId: rule.id, clientMutationId: id,
      syncStatus: 'synced', version: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    }));
    applyAccountEffectsToBatch(batch, workspaceId, transactionAccountEffects({ type: 'expense', amountCents: amount, accountId: acctId }));
  }
  fireWrite(batch.commit());
}

// ─── contributeToGoalWithTransaction ─────────────────────────────────────────
// Atualiza savedCents e, quando conta fornecida e valor positivo, cria despesa.
// Delta negativo (correção) só ajusta a meta sem criar transação.
export function contributeToGoalWithTransaction(
  workspaceId: string,
  userId: string,
  goal: Pick<Goal, 'id' | 'name'>,
  amountCents: number,
  accountId?: string
) {
  const batch = writeBatch(getFirebaseDb());
  batch.update(documentRef(workspaceId, 'goals', goal.id), {
    savedCents: increment(amountCents),
    updatedAt: serverTimestamp()
  });
  if (amountCents > 0 && accountId) {
    const id = createId('txn');
    const now = new Date();
    batch.set(documentRef(workspaceId, 'transactions', id), omitUndefined({
      id, workspaceId, createdBy: userId, updatedBy: userId,
      type: 'expense', amountCents, description: `Meta: ${goal.name}`,
      accountId, date: Timestamp.fromDate(now),
      competenceMonth: monthKeyFromDate(now), cashMonth: monthKeyFromDate(now),
      tags: ['meta'], isRecurring: false, clientMutationId: id,
      syncStatus: 'synced', version: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    }));
    applyAccountEffectsToBatch(batch, workspaceId, transactionAccountEffects({ type: 'expense', amountCents, accountId }));
  }
  fireWrite(batch.commit());
}

export function subscribeRecurringRules(
  workspaceId: string,
  onNext: (items: Array<LocalSynced<RecurringRule>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collectionRef(workspaceId, 'recurring'), orderBy('nextOccurrenceAt', 'asc')),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<RecurringRule>(item))),
    onError
  );
}

export function updateRecurringRule(
  workspaceId: string,
  ruleId: string,
  patch: { description?: string; amountCents?: number; frequency?: 'weekly' | 'monthly' | 'yearly'; nextOccurrenceAt?: Date; accountId?: string; categoryId?: string; isActive?: boolean }
) {
  const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.amountCents !== undefined) updates.amountCents = patch.amountCents;
  if (patch.frequency !== undefined) updates.frequency = patch.frequency;
  if (patch.nextOccurrenceAt !== undefined) updates.nextOccurrenceAt = Timestamp.fromDate(patch.nextOccurrenceAt);
  if (patch.accountId !== undefined) updates.accountId = patch.accountId;
  if (patch.categoryId !== undefined) updates.categoryId = patch.categoryId;
  if (patch.isActive !== undefined) updates.isActive = patch.isActive;
  fireWrite(updateDoc(documentRef(workspaceId, 'recurring', ruleId), updates));
}

export function deleteRecurringRule(workspaceId: string, ruleId: string) {
  fireWrite(updateDoc(documentRef(workspaceId, 'recurring', ruleId), { isActive: false, updatedAt: serverTimestamp() }));
}
