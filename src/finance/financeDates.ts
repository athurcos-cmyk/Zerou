import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Timestamp } from 'firebase/firestore';

export type DateLike = Date | Timestamp | { toDate: () => Date };

export function toDate(value: DateLike) {
  return value instanceof Date ? value : value.toDate();
}

export function toDateInputValue(value: DateLike) {
  return format(toDate(value), 'yyyy-MM-dd');
}

/** Data amigável pro usuário ("Hoje", "Ontem", "8 jul", "8 jul 2025") — nunca usar
 * `toDateInputValue` (formato `yyyy-MM-dd` pra `<input type="date">`) como texto de tela. */
export function formatFriendlyDate(value: DateLike) {
  const date = toDate(value);

  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';

  const sameYear = date.getFullYear() === new Date().getFullYear();
  return format(date, sameYear ? 'd MMM' : 'd MMM yyyy', { locale: ptBR });
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
