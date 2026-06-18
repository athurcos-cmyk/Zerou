import { addDays, compareAsc, isAfter, isBefore, isEqual } from 'date-fns';
import { toDate } from './financeDates';
import type { Account, Bill, Invoice, RecurringRule, Transaction } from '../types/contracts';

export interface AccountBalance extends Account {
  balanceCents: number;
}

export interface UpcomingCommitment {
  id: string;
  kind: 'bill' | 'recurring' | 'invoice';
  description: string;
  amountCents: number;
  dueAt: Date;
}

export interface DashboardSummary {
  totalBalanceCents: number;
  committedCents: number;
  freeToSpendCents: number;
  upcomingCommitments: UpcomingCommitment[];
  recentTransactions: Transaction[];
  nextIncomeAt: Date | null;
}

function isActiveTransaction(transaction: Transaction) {
  return !transaction.deletedAt;
}

function isOnOrBefore(left: Date, right: Date) {
  return isBefore(left, right) || isEqual(left, right);
}

function applyTransactionToBalances(
  balances: Map<string, number>,
  transaction: Transaction,
  accountIds: Set<string>
) {
  if (!isActiveTransaction(transaction)) {
    return;
  }

  const sourceId = transaction.accountId;
  const destinationId = transaction.destinationAccountId;

  if (transaction.type === 'income' || transaction.type === 'refund' || transaction.type === 'reimbursement') {
    if (sourceId && accountIds.has(sourceId)) {
      balances.set(sourceId, (balances.get(sourceId) ?? 0) + transaction.amountCents);
    }
    return;
  }

  if (transaction.type === 'expense' || transaction.type === 'card_payment') {
    if (sourceId && accountIds.has(sourceId)) {
      balances.set(sourceId, (balances.get(sourceId) ?? 0) - transaction.amountCents);
    }
    return;
  }

  if (transaction.type === 'card_purchase') {
    return;
  }

  if (transaction.type === 'transfer') {
    if (sourceId && accountIds.has(sourceId)) {
      balances.set(sourceId, (balances.get(sourceId) ?? 0) - transaction.amountCents);
    }

    if (destinationId && accountIds.has(destinationId)) {
      balances.set(destinationId, (balances.get(destinationId) ?? 0) + transaction.amountCents);
    }
    return;
  }

  if (transaction.type === 'adjustment') {
    if (sourceId && accountIds.has(sourceId)) {
      balances.set(sourceId, (balances.get(sourceId) ?? 0) + transaction.amountCents);
    }
  }
}

export function calculateAccountBalances(accounts: Account[], transactions: Transaction[]): AccountBalance[] {
  const accountIds = new Set(accounts.map((account) => account.id));
  const balances = new Map(accounts.map((account) => [account.id, account.openingBalanceCents]));

  transactions.forEach((transaction) => applyTransactionToBalances(balances, transaction, accountIds));

  return accounts.map((account) => ({
    ...account,
    balanceCents: balances.get(account.id) ?? account.openingBalanceCents
  }));
}

export function calculateTotalBalance(accounts: Account[], transactions: Transaction[]) {
  return calculateAccountBalances(accounts, transactions).reduce((total, account) => total + account.balanceCents, 0);
}

export function findNextIncomeDate(transactions: Transaction[], now = new Date()) {
  const futureIncomeDates = transactions
    .filter((transaction) => isActiveTransaction(transaction) && transaction.type === 'income')
    .map((transaction) => toDate(transaction.date))
    .filter((date) => isAfter(date, now) || isEqual(date, now))
    .sort(compareAsc);

  return futureIncomeDates[0] ?? null;
}

export function buildUpcomingCommitments(
  bills: Bill[],
  recurringRules: RecurringRule[],
  cutoff: Date,
  invoices: Invoice[] = [],
  now: Date = new Date()
): UpcomingCommitment[] {
  const billCommitments = bills
    .filter((bill) => bill.status === 'pending' || bill.status === 'overdue')
    .map(
      (bill) =>
        ({
          id: bill.id,
          kind: 'bill',
          description: bill.description,
          amountCents: bill.amountCents,
          dueAt: toDate(bill.dueDate)
        }) satisfies UpcomingCommitment
    )
    .filter((commitment) => isOnOrBefore(commitment.dueAt, cutoff));

  const recurringCommitments = recurringRules
    .filter((rule) => rule.isActive && typeof rule.amountCents === 'number')
    .map(
      (rule) =>
        ({
          id: rule.id,
          kind: 'recurring',
          description: rule.description,
          amountCents: rule.amountCents ?? 0,
          dueAt: toDate(rule.nextOccurrenceAt)
        }) satisfies UpcomingCommitment
    )
    .filter((commitment) => isOnOrBefore(commitment.dueAt, cutoff));

  // Regra de fatura no comprometido:
  // - 'closed': sempre (já fechou, o pagamento é iminente)
  // - 'open' do mês atual ou anterior: sim (dívida do ciclo corrente)
  // - 'open' de meses futuros: não (parcelas futuras — vira comprometido no mês delas)
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const invoiceCommitments = invoices
    .filter(
      (invoice) =>
        invoice.status !== 'paid' &&
        invoice.status !== 'overpaid' &&
        invoice.outstandingBalanceCents > 0 &&
        (invoice.status === 'closed' || invoice.referenceMonth <= currentYearMonth)
    )
    .map(
      (invoice) =>
        ({
          id: invoice.id,
          kind: 'invoice',
          description: `Fatura ${invoice.referenceMonth}`,
          amountCents: invoice.outstandingBalanceCents,
          dueAt: toDate(invoice.dueDate)
        }) satisfies UpcomingCommitment
    );

  return [...billCommitments, ...recurringCommitments, ...invoiceCommitments].sort((left, right) =>
    compareAsc(left.dueAt, right.dueAt)
  );
}

export function calculateDashboardSummary(input: {
  accounts: Account[];
  transactions: Transaction[];
  bills: Bill[];
  recurringRules: RecurringRule[];
  invoices?: Invoice[];
  now?: Date;
}): DashboardSummary {
  const now = input.now ?? new Date();
  const nextIncomeAt = findNextIncomeDate(input.transactions, now);
  const cutoff = nextIncomeAt ?? addDays(now, 30);
  const totalBalanceCents = calculateTotalBalance(input.accounts, input.transactions);
  const commitments = buildUpcomingCommitments(input.bills, input.recurringRules, cutoff, input.invoices ?? [], now);
  const committedCents = commitments.reduce((total, commitment) => total + commitment.amountCents, 0);
  const recentTransactions = input.transactions
    .filter(isActiveTransaction)
    .slice()
    .sort((left, right) => compareAsc(toDate(right.date), toDate(left.date)))
    .slice(0, 5);

  return {
    totalBalanceCents,
    committedCents,
    freeToSpendCents: totalBalanceCents - committedCents,
    upcomingCommitments: commitments.slice(0, 3),
    recentTransactions,
    nextIncomeAt
  };
}
