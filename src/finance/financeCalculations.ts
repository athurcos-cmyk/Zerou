import { addDays, compareAsc, endOfDay, isAfter, isBefore, isEqual } from 'date-fns';
import { toDate } from './financeDates';
import { defaultAvailableMode } from './availableMode';
import { defaultCommittedWindowDays, nextPaydayFrom } from './payday';
import type { Account, AvailableMode, Bill, CreditCard, Invoice, PaydayRule, RecurringRule, Transaction } from '../types/contracts';

export interface AccountBalance extends Account {
  balanceCents: number;
}

export interface UpcomingCommitment {
  id: string;
  kind: 'bill' | 'recurring' | 'invoice';
  description: string;
  amountCents: number;
  dueAt: Date;
  /** Só em `kind: 'invoice'` — pra linkar direto pra fatura do cartão no Dashboard. */
  cardId?: string;
}

// De onde veio a data-limite usada pra decidir o que conta como "Comprometido" —
// exibido no Dashboard pra explicar o número em vez de só mostrar um valor sem contexto.
export type CommittedCutoffSource = 'income' | 'payday' | 'window';

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

export interface AccountEffect {
  accountId: string;
  deltaCents: number;
}

/**
 * Delta de saldo que uma transação aplica, por conta afetada — fonte única de
 * verdade pro sinal de cada tipo, usada tanto pelo cálculo histórico
 * (`applyTransactionToBalances`, abaixo) quanto pelo saldo incremental
 * (`currentBalanceCents`, mantido via `increment()` no mesmo batch da escrita).
 */
export function transactionAccountEffects(
  transaction: Pick<Transaction, 'type' | 'amountCents' | 'accountId' | 'destinationAccountId' | 'deletedAt'>
): AccountEffect[] {
  if (transaction.deletedAt) {
    return [];
  }

  const sourceId = transaction.accountId;
  const destinationId = transaction.destinationAccountId;

  if (transaction.type === 'income' || transaction.type === 'refund' || transaction.type === 'reimbursement') {
    return sourceId ? [{ accountId: sourceId, deltaCents: transaction.amountCents }] : [];
  }

  if (transaction.type === 'expense' || transaction.type === 'card_payment') {
    return sourceId ? [{ accountId: sourceId, deltaCents: -transaction.amountCents }] : [];
  }

  if (transaction.type === 'card_purchase') {
    return [];
  }

  if (transaction.type === 'transfer') {
    const effects: AccountEffect[] = [];
    if (sourceId) effects.push({ accountId: sourceId, deltaCents: -transaction.amountCents });
    if (destinationId) effects.push({ accountId: destinationId, deltaCents: transaction.amountCents });
    return effects;
  }

  if (transaction.type === 'adjustment') {
    return sourceId ? [{ accountId: sourceId, deltaCents: transaction.amountCents }] : [];
  }

  return [];
}

/**
 * Soma deltas por conta vindos de múltiplos grupos (ex.: reverter o efeito antigo +
 * aplicar o novo numa edição) e descarta entradas cujo delta líquido ficou zero —
 * evita um `increment(0)` inútil no batch.
 */
export function mergeAccountEffects(...groups: AccountEffect[][]): AccountEffect[] {
  const totals = new Map<string, number>();
  for (const group of groups) {
    for (const effect of group) {
      totals.set(effect.accountId, (totals.get(effect.accountId) ?? 0) + effect.deltaCents);
    }
  }
  return [...totals.entries()]
    .filter(([, deltaCents]) => deltaCents !== 0)
    .map(([accountId, deltaCents]) => ({ accountId, deltaCents }));
}

export function invertAccountEffects(effects: AccountEffect[]): AccountEffect[] {
  return effects.map((effect) => ({ accountId: effect.accountId, deltaCents: -effect.deltaCents }));
}

/**
 * Saldo atual (agora), lido direto do campo mantido incrementalmente — nunca precisa
 * reler o histórico de transações. Fallback pro saldo de abertura em contas criadas
 * antes do backfill (`currentBalanceCents` ainda ausente).
 */
export function currentAccountBalances(accounts: Account[]): AccountBalance[] {
  return accounts.map((account) => ({
    ...account,
    balanceCents: account.currentBalanceCents ?? account.openingBalanceCents
  }));
}

export function currentTotalBalance(accounts: Account[]): number {
  return currentAccountBalances(accounts).reduce((total, account) => total + account.balanceCents, 0);
}

function applyTransactionToBalances(
  balances: Map<string, number>,
  transaction: Transaction,
  accountIds: Set<string>
) {
  for (const effect of transactionAccountEffects(transaction)) {
    if (accountIds.has(effect.accountId)) {
      balances.set(effect.accountId, (balances.get(effect.accountId) ?? 0) + effect.deltaCents);
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
  cards: CreditCard[] = []
): UpcomingCommitment[] {
  const withinCutoff = (dueAt: Date) => cutoff === null || isOnOrBefore(dueAt, cutoff);
  const cardNameById = new Map(cards.map((card) => [card.id, card.name]));

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
    .map((invoice) => {
      const cardName = cardNameById.get(invoice.cardId);
      // Sem prefixo "Fatura"/mês de referência: a linha já mostra "Fatura · <data>"
      // embaixo (mesmo padrão de bill.description/rule.description, que também são só
      // o nome, sem repetir o tipo). Fallback mantém o texto antigo se o cartão sumiu
      // (excluído) ou não foi passado pro caller.
      return {
        id: invoice.id,
        kind: 'invoice',
        description: cardName ?? `Fatura ${invoice.referenceMonth}`,
        amountCents: invoice.outstandingBalanceCents,
        dueAt: toDate(invoice.dueDate),
        cardId: invoice.cardId
      } satisfies UpcomingCommitment;
    });

  return [...billCommitments, ...recurringCommitments, ...invoiceCommitments].sort((left, right) =>
    compareAsc(left.dueAt, right.dueAt)
  );
}

export interface CommittedCutoff {
  /** `null` no modo conservador: não existe data-limite, tudo que se deve conta. */
  cutoff: Date | null;
  source: CommittedCutoffSource;
  nextIncomeAt: Date | null;
}

/**
 * Até quando o "Comprometido" enxerga. É o coração do "Disponível", e a tela de
 * Configurações usa esta mesma função pra mostrar a data real que está em vigor —
 * sem isso, a explicação lá e o número do Dashboard poderiam divergir em silêncio.
 */
export function resolveCommittedCutoff(input: {
  transactions: Transaction[];
  payday?: PaydayRule;
  committedWindowDays?: number;
  availableMode?: AvailableMode;
  now?: Date;
}): CommittedCutoff {
  const now = input.now ?? new Date();
  const nextIncomeAt = findNextIncomeDate(input.transactions, now);
  const availableMode = input.availableMode ?? defaultAvailableMode;
  const windowDays = input.committedWindowDays ?? defaultCommittedWindowDays;

  // Modo conservador: nunca assume que o salário vai cair, então ignora receita futura
  // lançada e a data de recebimento do perfil — usa só a janela fixa de N dias. Assim
  // uma parcela de cartão só entra no Comprometido quando o vencimento dela chega perto,
  // em vez de as 10 parcelas de uma compra caírem todas de uma vez (o que jogava o
  // Disponível pra muito negativo, sem sentido, no caso de quem tem compra parcelada).
  if (availableMode === 'conservative') {
    return { cutoff: endOfDay(addDays(now, windowDays)), source: 'window', nextIncomeAt };
  }

  // Sem receita futura lançada na mão, usa a data de recebimento estimada do perfil
  // (pergunta do onboarding) antes de cair na janela configurável (padrão 30 dias) —
  // evita que uma fatura que só vence depois do próximo salário pareça "comprometida"
  // hoje. "Renda variável" é uma escolha explícita sem data resolvível — cai na janela
  // igual quem nunca respondeu a pergunta.
  const resolvablePayday = input.payday && input.payday.type !== 'variable_income' ? input.payday : undefined;
  const source: CommittedCutoffSource = nextIncomeAt ? 'income' : resolvablePayday ? 'payday' : 'window';
  // `endOfDay`: o corte é um DIA, não um instante. As três origens produzem horas
  // diferentes (receita lançada e vencimentos ficam ao meio-dia; `nextPaydayFrom`
  // devolve meia-noite; a janela de N dias herda a hora atual) — sem normalizar, uma
  // conta que vence no próprio dia do salário entrava ou não no Comprometido dependendo
  // da origem do corte, e a janela de 30 dias mudava de resultado conforme a hora em
  // que o app era aberto.
  const rawCutoff = nextIncomeAt ?? (resolvablePayday ? nextPaydayFrom(resolvablePayday, now) : addDays(now, windowDays));

  return { cutoff: endOfDay(rawCutoff), source, nextIncomeAt };
}

export function calculateDashboardSummary(input: {
  accounts: Account[];
  transactions: Transaction[];
  bills: Bill[];
  recurringRules: RecurringRule[];
  invoices?: Invoice[];
  cards?: CreditCard[];
  payday?: PaydayRule;
  committedWindowDays?: number;
  availableMode?: AvailableMode;
  now?: Date;
}): DashboardSummary {
  const now = input.now ?? new Date();
  const { cutoff, source: committedCutoffSource, nextIncomeAt } = resolveCommittedCutoff({
    transactions: input.transactions,
    payday: input.payday,
    committedWindowDays: input.committedWindowDays,
    availableMode: input.availableMode,
    now
  });
  const totalBalanceCents = currentTotalBalance(input.accounts);
  const commitments = buildUpcomingCommitments(input.bills, input.recurringRules, cutoff, input.invoices ?? [], input.cards ?? []);
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
