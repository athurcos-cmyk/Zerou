import { addMonths, format, lastDayOfMonth, setDate } from 'date-fns';

function clampDay(date: Date, day: number) {
  const lastDay = lastDayOfMonth(date).getDate();
  return setDate(date, Math.min(day, lastDay));
}

export function resolveInvoiceCycle(purchaseDate: Date, closingDay: number, dueDay: number) {
  const purchaseDay = purchaseDate.getDate();
  const referenceDate = purchaseDay > closingDay ? addMonths(purchaseDate, 1) : purchaseDate;
  const referenceMonth = format(referenceDate, 'yyyy-MM');
  // Padrão comum de cartão brasileiro: fecha tarde no mês (ex. dia 25), vence cedo no
  // mês seguinte (ex. dia 5) — dueDay < closingDay indica que o vencimento cai no mês
  // depois do referenceDate, nunca no mesmo mês. Sem isso, o vencimento calculado podia
  // cair ANTES do próprio fechamento (e até antes da compra que o gerou).
  const dueMonthDate = dueDay < closingDay ? addMonths(referenceDate, 1) : referenceDate;
  const dueDate = clampDay(dueMonthDate, dueDay);

  return {
    referenceMonth,
    dueDate
  };
}

export function invoiceIdFor(cardId: string, referenceMonth: string) {
  return `${cardId}_${referenceMonth}`;
}

/**
 * Escolhe a fatura "atual" (a que está acumulando compras novas agora, mais próxima
 * de fechar) entre as faturas abertas de um cartão. Compras parceladas criam faturas
 * abertas em vários meses futuros ao mesmo tempo — sem ordenar por referenceMonth,
 * `.find(status === 'open')` pega a ordem de chegada do array (desc por padrão em
 * subscribeInvoices), o que pode devolver uma fatura futura em vez da que está
 * realmente em aberto para novas compras.
 */
export function pickCurrentInvoice<T extends { status: string; referenceMonth: string }>(
  invoices: T[]
): T | null {
  const openSorted = invoices
    .filter((invoice) => invoice.status === 'open')
    .sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth));

  return openSorted[0] ?? invoices[0] ?? null;
}
