// Porta de src/finance/financeCalculations.ts (resolveCommittedCutoff, findNextIncomeDate) e
// src/finance/payday.ts (nextPaydayFrom, defaultCommittedWindowDays). Cloud Functions não
// importa src/ do app cliente — mantenha em sincronia manualmente se a lógica original mudar.
//
// Existe pra corrigir uma divergência real: a Vic (buildFinancialContext.ts) calculava
// "Comprometido" com uma janela fixa de 30 dias, ignorando o AvailableMode (conservador /
// até o recebimento) que a pessoa escolheu no app — o Dashboard usa esta mesma lógica de
// corte. Sem isso, a Vic e o Dashboard podem relatar números de Comprometido diferentes
// pro mesmo workspace.

export type PaydayRule =
  | { type: 'fixed_day'; day: number }
  | { type: 'business_day'; day: number }
  | { type: 'end_of_month' }
  | { type: 'variable_income' };

type ResolvablePaydayRule = Exclude<PaydayRule, { type: 'variable_income' }>;

export type AvailableMode = 'conservative' | 'until_payday';

export const defaultCommittedWindowDays = 30;

export interface IncomeTransaction {
  type: string;
  date: Date;
  tags?: string[];
  deletedAt?: unknown;
}

export type CommittedCutoffSource = 'income' | 'payday' | 'window';

export interface CommittedCutoff {
  cutoff: Date;
  source: CommittedCutoffSource;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// Não considera feriados (não há calendário nacional de feriados) — só pula fins de
// semana. Aproximação suficiente pra estimar "quando devo receber".
function nthBusinessDayOfMonth(year: number, month: number, n: number) {
  let count = 0;
  let day = 1;
  const total = daysInMonth(year, month);

  while (day <= total) {
    const date = new Date(year, month, day);
    if (!isWeekend(date)) {
      count += 1;
      if (count === n) {
        return date;
      }
    }
    day += 1;
  }

  return new Date(year, month, total);
}

function paydayForMonth(payday: ResolvablePaydayRule, year: number, month: number) {
  if (payday.type === 'end_of_month') {
    return new Date(year, month, daysInMonth(year, month));
  }

  if (payday.type === 'fixed_day') {
    return new Date(year, month, Math.min(payday.day, daysInMonth(year, month)));
  }

  return nthBusinessDayOfMonth(year, month, payday.day);
}

/** Próxima data de recebimento a partir de `from` (inclui hoje, se hoje for dia de pagamento). */
export function nextPaydayFrom(payday: ResolvablePaydayRule, from: Date): Date {
  const year = from.getFullYear();
  const month = from.getMonth();
  const fromDateOnly = new Date(year, month, from.getDate());
  const thisMonth = paydayForMonth(payday, year, month);

  if (thisMonth.getTime() >= fromDateOnly.getTime()) {
    return thisMonth;
  }

  return paydayForMonth(payday, year, month + 1);
}

/**
 * Estritamente DEPOIS de hoje: uma receita lançada com a data de hoje já entrou no
 * saldo, então não é o "próximo recebimento". `meta`/`cofrinho` excluídas — retirada
 * de meta/cofrinho é receita na conta, mas não é "próximo recebimento" pro Comprometido.
 */
export function findNextIncomeDate(transactions: IncomeTransaction[], now: Date): Date | null {
  const todayEnd = endOfDay(now);
  const futureIncomeDates = transactions
    .filter(
      (transaction) =>
        !transaction.deletedAt &&
        transaction.type === 'income' &&
        !transaction.tags?.includes('meta') &&
        !transaction.tags?.includes('cofrinho')
    )
    .map((transaction) => transaction.date)
    .filter((date) => date.getTime() > todayEnd.getTime())
    .sort((a, b) => a.getTime() - b.getTime());

  return futureIncomeDates[0] ?? null;
}

/**
 * Até quando o "Comprometido" enxerga — mesma lógica usada pelo Dashboard
 * (`resolveCommittedCutoff` em `src/finance/financeCalculations.ts`). Sempre retorna um
 * `Date` concreto, inclusive no modo conservador (janela fixa) — nunca `null`.
 */
export function resolveCommittedCutoff(input: {
  transactions: IncomeTransaction[];
  payday?: PaydayRule;
  committedWindowDays?: number;
  availableMode?: AvailableMode;
  now: Date;
}): CommittedCutoff {
  const now = input.now;
  const nextIncomeAt = findNextIncomeDate(input.transactions, now);
  const availableMode = input.availableMode ?? 'until_payday';
  const windowDays = input.committedWindowDays ?? defaultCommittedWindowDays;

  // Modo conservador: nunca assume que o salário vai cair — ignora receita futura
  // lançada e a data de recebimento do perfil, usa só a janela fixa de N dias.
  if (availableMode === 'conservative') {
    return { cutoff: endOfDay(addDays(now, windowDays)), source: 'window' };
  }

  const resolvablePayday = input.payday && input.payday.type !== 'variable_income' ? input.payday : undefined;
  const source: CommittedCutoffSource = nextIncomeAt ? 'income' : resolvablePayday ? 'payday' : 'window';
  const rawCutoff = nextIncomeAt ?? (resolvablePayday ? nextPaydayFrom(resolvablePayday, now) : addDays(now, windowDays));

  return { cutoff: endOfDay(rawCutoff), source };
}
