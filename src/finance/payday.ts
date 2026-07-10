import type { PaydayRule } from '../types/contracts';

// "Renda variável" é uma escolha explícita, não uma data — não tem como calcular
// "próximo recebimento" pra ela, então `nextPaydayFrom` só aceita as variantes que
// realmente resolvem pra uma data do calendário.
export type ResolvablePaydayRule = Exclude<PaydayRule, { type: 'variable_income' }>;

export const paydayBusinessDayMax = 15;
export const paydayFixedDayMax = 31;
export const defaultCommittedWindowDays = 30;
export const committedWindowDaysMin = 1;
export const committedWindowDaysMax = 90;

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// Não considera feriados (não há calendário nacional de feriados no app hoje) — só
// pula fins de semana. Aproximação suficiente pra estimar "quando devo receber",
// não uma folha de pagamento exata.
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

  // Mês sem dias úteis suficientes (não deveria acontecer com n <= 15): cai no
  // último dia do mês em vez de estourar pro mês seguinte por engano.
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

/** Próxima data de recebimento a partir de `from` (inclui hoje, se hoje for dia
 * de pagamento). Usado como estimativa pra saber até quando "Comprometido" deve
 * olhar quando a pessoa não lançou nenhuma receita futura manualmente. */
export function nextPaydayFrom(payday: ResolvablePaydayRule, from: Date): Date {
  const year = from.getFullYear();
  const month = from.getMonth();
  const fromDateOnly = new Date(year, month, from.getDate());
  const thisMonth = paydayForMonth(payday, year, month);

  if (thisMonth >= fromDateOnly) {
    return thisMonth;
  }

  return paydayForMonth(payday, year, month + 1);
}
