import { addDays, compareAsc, endOfDay, isAfter, isBefore, isEqual } from 'date-fns';
import { toDate } from './financeDates';
import { defaultAvailableMode } from './availableMode';
import { defaultCommittedWindowDays, nextPaydayFrom } from './payday';
import type { Account, AvailableMode, Bill, Invoice, PaydayRule, RecurringRule, Transaction } from '../types/contracts';

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

// De onde veio a data-limite usada pra decidir o que conta como "Comprometido" —
// exibido no Dashboard pra explicar o número em vez de só mostrar um valor sem contexto.
// `all`: modo conservador, não há data-limite (tudo que se deve conta).
export type CommittedCutoffSource = 'income' | 'payday' | 'window' | 'all';

export interface DashboardSummary {
  totalBalanceCents: number;
  committedCents: number;
  freeToSpendCents: number;
  upcomingCommitments: UpcomingCommitment[];
  recentTransactions: Transaction[];
  nextIncomeAt: Date | null;
  /** `null` no modo conservador: não existe data de corte, tudo que se deve conta. */
  committedCutoff: Date | null;
  committedCutoffSource: CommittedCutoffSource;
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
  // Estritamente DEPOIS de hoje: uma receita lançada com a data de hoje já entrou no
  // saldo, então não é o "próximo recebimento". Comparar contra o instante `now` fazia
  // a mesma receita de hoje contar de manhã (12:00 > 08:00) e não contar à tarde,
  // mudando o Comprometido conforme a hora em que o app era aberto.
  const todayEnd = endOfDay(now);
  const futureIncomeDates = transactions
    .filter((transaction) => isActiveTransaction(transaction) && transaction.type === 'income')
    .map((transaction) => toDate(transaction.date))
    .filter((date) => isAfter(date, todayEnd))
    .sort(compareAsc);

  return futureIncomeDates[0] ?? null;
}

/**
 * `cutoff = null` (modo conservador): não há data-limite — tudo que a pessoa já deve
 * conta como comprometido, inclusive parcelas de faturas de meses futuros.
 */
export function buildUpcomingCommitments(
  bills: Bill[],
  recurringRules: RecurringRule[],
  cutoff: Date | null,
  invoices: Invoice[] = [],
  now: Date = new Date()
): UpcomingCommitment[] {
  const withinCutoff = (dueAt: Date) => cutoff === null || isOnOrBefore(dueAt, cutoff);

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
    .filter((commitment) => withinCutoff(commitment.dueAt));

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
    .filter((commitment) => withinCutoff(commitment.dueAt));

  // Regra de fatura no comprometido:
  // - 'closed': sempre (já fechou, o pagamento é iminente)
  // - 'open': só se o VENCIMENTO REAL cair dentro do mesmo cutoff usado pra contas a
  //   pagar/recorrências (antes do próximo salário, ou 30 dias). Antes usava
  //   "referenceMonth <= mês atual" (mês do CICLO da compra, não da cobrança) — em
  //   cartões que fecham tarde e vencem no mês seguinte (padrão comum: fecha dia 25,
  //   vence dia 5), isso contava a fatura inteira como comprometida um mês antes do
  //   vencimento de verdade, mesmo já com `resolveInvoiceCycle` calculando a data de
  //   vencimento certa. Decisão do dono do produto: vencimento real é o critério.
  // No modo conservador (`cutoff === null`) toda fatura em aberto conta, inclusive as
  // de parcelas que só vencem daqui a meses — é dívida já assumida.
  const invoiceCommitments = invoices
    .filter(
      (invoice) =>
        invoice.status !== 'paid' &&
        invoice.status !== 'overpaid' &&
        invoice.outstandingBalanceCents > 0 &&
        (invoice.status === 'closed' || withinCutoff(toDate(invoice.dueDate)))
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
  payday?: PaydayRule;
  committedWindowDays?: number;
  availableMode?: AvailableMode;
  now?: Date;
}): DashboardSummary {
  const now = input.now ?? new Date();
  const nextIncomeAt = findNextIncomeDate(input.transactions, now);
  const availableMode = input.availableMode ?? defaultAvailableMode;
  // Modo conservador: sem data de corte. Não prevê recebimento nenhum — tudo que a
  // pessoa já deve entra no Comprometido.
  const isConservative = availableMode === 'conservative';
  // Sem receita futura lançada na mão, usa a data de recebimento estimada do perfil
  // (pergunta do onboarding) antes de cair na janela configurável (padrão 30 dias) —
  // evita que uma fatura que só vence depois do próximo salário pareça "comprometida"
  // hoje. "Renda variável" é uma escolha explícita sem data resolvível — cai na janela
  // igual quem nunca respondeu a pergunta.
  const resolvablePayday = input.payday && input.payday.type !== 'variable_income' ? input.payday : undefined;
  const windowDays = input.committedWindowDays ?? defaultCommittedWindowDays;
  const committedCutoffSource: CommittedCutoffSource = isConservative
    ? 'all'
    : nextIncomeAt
    ? 'income'
    : resolvablePayday
    ? 'payday'
    : 'window';
  // `endOfDay`: o corte é um DIA, não um instante. As três origens produzem horas
  // diferentes (receita lançada e vencimentos ficam ao meio-dia; `nextPaydayFrom`
  // devolve meia-noite; a janela de N dias herda a hora atual) — sem normalizar, uma
  // conta que vence no próprio dia do salário entrava ou não no Comprometido dependendo
  // da origem do corte, e a janela de 30 dias mudava de resultado conforme a hora em
  // que o app era aberto.
  const rawCutoff = nextIncomeAt ?? (resolvablePayday ? nextPaydayFrom(resolvablePayday, now) : addDays(now, windowDays));
  const cutoff = isConservative ? null : endOfDay(rawCutoff);
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
    nextIncomeAt,
    committedCutoff: cutoff,
    committedCutoffSource
  };
}
