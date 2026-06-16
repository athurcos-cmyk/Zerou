import {
  Timestamp,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDocs,
  increment,
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
import type { Account, Bill, Category, RecurringRule, SyncStatus, Transaction } from '../types/contracts';

export type FinancialCollectionName = 'accounts' | 'categories' | 'transactions' | 'bills' | 'recurring';

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
  await deleteDoc(documentRef(workspaceId, 'accounts', accountId));
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
  input: { name: string; icon: string; type: 'income' | 'expense' | 'both' }
) {
  const id = createId('cat');
  const now = serverTimestamp();
  await setDoc(documentRef(workspaceId, 'categories', id), {
    id,
    workspaceId,
    name: input.name.trim(),
    icon: input.icon,
    type: input.type,
    isDefault: false,
    isActive: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  });
  return id;
}

export async function deleteCategory(workspaceId: string, categoryId: string) {
  await updateDoc(documentRef(workspaceId, 'categories', categoryId), {
    isActive: false,
    updatedAt: serverTimestamp()
  });
}

export async function softDeleteTransaction(workspaceId: string, userId: string, transactionId: string) {
  await updateDoc(documentRef(workspaceId, 'transactions', transactionId), {
    updatedBy: userId,
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    version: increment(1)
  });
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

  await setDoc(documentRef(workspaceId, 'bills', id), omitUndefined({
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
  }));

  return id;
}

export async function updateBillStatus(workspaceId: string, billId: string, status: Bill['status']) {
  await updateDoc(documentRef(workspaceId, 'bills', billId), {
    status,
    updatedAt: serverTimestamp()
  });
}

export async function createRecurringRule(workspaceId: string, userId: string, input: CreateRecurringRuleInput) {
  const parsed = createRecurringRuleSchema.parse(input);
  const id = createId('rec');
  const now = serverTimestamp();

  await setDoc(documentRef(workspaceId, 'recurring', id), omitUndefined({
    id,
    workspaceId,
    description: parsed.description,
    amountCents: parsed.amountCents,
    frequency: parsed.frequency,
    nextOccurrenceAt: Timestamp.fromDate(parsed.nextOccurrenceAt),
    accountId: parsed.accountId,
    categoryId: parsed.categoryId,
    isActive: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  }));

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
    query(collectionRef(workspaceId, 'transactions'), orderBy('date', 'desc')),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<Transaction>(item))),
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
