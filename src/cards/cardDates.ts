import { addMonths, format, lastDayOfMonth, setDate } from 'date-fns';

function clampDay(date: Date, day: number) {
  const lastDay = lastDayOfMonth(date).getDate();
  return setDate(date, Math.min(day, lastDay));
}

export function resolveInvoiceCycle(purchaseDate: Date, closingDay: number, dueDay: number) {
  const purchaseDay = purchaseDate.getDate();
  const referenceDate = purchaseDay > closingDay ? addMonths(purchaseDate, 1) : purchaseDate;
  const referenceMonth = format(referenceDate, 'yyyy-MM');
  const dueDate = clampDay(referenceDate, dueDay);

  return {
    referenceMonth,
    dueDate
  };
}

export function invoiceIdFor(cardId: string, referenceMonth: string) {
  return `${cardId}_${referenceMonth}`;
}
