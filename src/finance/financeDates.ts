import { format } from 'date-fns';
import type { Timestamp } from 'firebase/firestore';

export type DateLike = Date | Timestamp | { toDate: () => Date };

export function toDate(value: DateLike) {
  return value instanceof Date ? value : value.toDate();
}

export function toDateInputValue(value: DateLike) {
  return format(toDate(value), 'yyyy-MM-dd');
}

export function monthKeyFromDate(value: Date) {
  return format(value, 'yyyy-MM');
}

export function todayInputValue() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function fromDateInputValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    throw new Error('Informe uma data válida.');
  }

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}
