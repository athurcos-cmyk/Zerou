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
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/config';
import { fireWrite } from '../firebase/fireWrite';
import { buildDefaultCategory, defaultCategories } from './defaultCategories';
import { monthKeyFromDate } from './financeDates';
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
import type { Account, Bill, Category, Goal, GoalContribution, RecurringRule, SyncStatus, Transaction } from '../types/contracts';

export type FinancialCollectionName = 'accounts' | 'categories' | 'transactions' | 'bills' | 'recurring' | 'goals' | 'goalContributions';

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

function omitUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== '')) as T;
}

function withLocalSync<T extends object>(snapshot: QueryDocumentSnapshot<DocumentData>) {
  const data = { id: snapshot.id, ...snapshot.data() } as unknown as T;
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

  await batch.commit();
}

export async function createAccount(workspaceId: string, userId: string, input: CreateAccountInput) {
  const parsed = createAccountSchema.parse(input);
  const id = createId('acct');
  const now = serverTimestamp();

  await setDoc(documentRef(workspaceId, 'accounts', id), {
    id,
    workspaceId,
    name: parsed.name,
    type: parsed.type,
    openingBalanceCents: parsed.openingBalanceCents,
    isActive: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  });

  return id;
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

  await setDoc(documentRef(workspaceId, 'transactions', id), omitUndefined({
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
  await setDoc(documentRef(workspaceId, 'goals', id), omitUndefined({
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
  }));
  return id;
}

export async function contributeToGoal(workspaceId: string, goalId: string, deltaCents: number) {
  await updateDoc(documentRef(workspaceId, 'goals', goalId), {
    savedCents: increment(deltaCents),
    updatedAt: serverTimestamp()
  });
}

/**
 * Record a contribution to a (shared) goal: writes a per-person contribution doc and
 * bumps the goal total in one batch. Used by the couple "cofrinho".
 */
export async function addGoalContribution(workspaceId: string, userId: string, goalId: string, amountCents: number) {
  const id = createId('contrib');
  const now = new Date();
  const batch = writeBatch(getFirebaseDb());
  batch.set(documentRef(workspaceId, 'goalContributions', id), {
    id,
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
  await batch.commit();
  return id;
}

/**
 * Registra um resgate (retirada) de um cofrinho compartilhado: mesma mecânica de
 * addGoalContribution, mas em sentido inverso — decrementa savedCents e grava a
 * contribuição com type: 'withdrawal'. amountCents é sempre a magnitude positiva
 * do valor resgatado. A regra do Firestore (validMoneyCents em savedCents) rejeita
 * a escrita caso o resgate deixe o cofrinho negativo.
 */
export async function withdrawGoalContribution(workspaceId: string, userId: string, goalId: string, amountCents: number) {
  const id = createId('contrib');
  const now = new Date();
  const batch = writeBatch(getFirebaseDb());
  batch.set(documentRef(workspaceId, 'goalContributions', id), {
    id,
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
  await batch.commit();
  return id;
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

export async function softDeleteTransaction(workspaceId: string, userId: string, transactionId: string) {
  fireWrite(updateDoc(documentRef(workspaceId, 'transactions', transactionId), {
    updatedBy: userId,
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    version: increment(1)
  }));
}

export async function updateTransaction(
  workspaceId: string,
  userId: string,
  transactionId: string,
  input: CreateTransactionInput
) {
  const parsed = createTransactionSchema.parse(input);
  const date = Timestamp.fromDate(parsed.date);
  const monthKey = monthKeyFromDate(parsed.date);

  await updateDoc(
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
  opts: { accountId?: string; amountCents?: number } = {}
) {
  const amount = opts.amountCents ?? bill.amountCents;
  const acctId = opts.accountId || bill.accountId;
  const batch = writeBatch(getFirebaseDb());
  batch.update(documentRef(workspaceId, 'bills', bill.id), { status: 'paid', updatedAt: serverTimestamp() });
  if (acctId) {
    const id = createId('txn');
    const now = new Date();
    batch.set(documentRef(workspaceId, 'transactions', id), omitUndefined({
      id, workspaceId, createdBy: userId, updatedBy: userId,
      type: 'expense', amountCents: amount, description: bill.description,
      categoryId: bill.categoryId, accountId: acctId,
      date: Timestamp.fromDate(now), competenceMonth: monthKeyFromDate(now), cashMonth: monthKeyFromDate(now),
      tags: ['bill'], isRecurring: false, clientMutationId: id,
      syncStatus: 'synced', version: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    }));
  }
  fireWrite(batch.commit());
}

// ─── recordRecurringPayment ───────────────────────────────────────────────────
// Cria transação de despesa e avança nextOccurrenceAt para a próxima data.
export function recordRecurringPayment(
  workspaceId: string,
  userId: string,
  rule: Pick<RecurringRule, 'id' | 'description' | 'amountCents' | 'categoryId' | 'accountId' | 'frequency' | 'nextOccurrenceAt' | 'anchorDay'>,
  opts: { accountId?: string; amountCents?: number } = {}
) {
  const amount = opts.amountCents ?? rule.amountCents;
  if (!amount) return;
  const acctId = opts.accountId || rule.accountId;
  const nextDate = nextOccurrenceDate(rule.nextOccurrenceAt.toDate(), rule.frequency, rule.anchorDay);
  const batch = writeBatch(getFirebaseDb());
  batch.update(documentRef(workspaceId, 'recurring', rule.id), {
    nextOccurrenceAt: Timestamp.fromDate(nextDate),
    updatedAt: serverTimestamp()
  });
  if (acctId) {
    const id = createId('txn');
    const now = new Date();
    batch.set(documentRef(workspaceId, 'transactions', id), omitUndefined({
      id, workspaceId, createdBy: userId, updatedBy: userId,
      type: 'expense', amountCents: amount, description: rule.description,
      categoryId: rule.categoryId, accountId: acctId,
      date: Timestamp.fromDate(now), competenceMonth: monthKeyFromDate(now), cashMonth: monthKeyFromDate(now),
      tags: ['recorrente'], isRecurring: true, recurringId: rule.id, clientMutationId: id,
      syncStatus: 'synced', version: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    }));
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
