import { format, isToday, isYesterday, startOfDay } from 'date-fns';
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

/** Mês de referência amigável pro usuário ("jul 2026") — nunca mostrar o
 * `referenceMonth` (`yyyy-MM`) de fatura cru na tela. */
export function formatFriendlyMonth(referenceMonth: string) {
  const [year, month] = referenceMonth.split('-').map(Number);
  return format(new Date(year, month - 1, 1), 'MMM yyyy', { locale: ptBR });
}

const FULL_MONTH_NAMES: Record<string, string> = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro',
};

/** 'yyyy-MM' → "Agosto de 2026". Nome escrito por extenso (não `MMMM` do date-fns) porque
 * seletor de mês e rótulo de filtro precisam do mês com maiúscula inicial, e a locale devolve
 * minúsculo. Mora aqui, e não em cada tela, pra Análise e Extrato não divergirem no rótulo. */
export function fullMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-');
  return `${FULL_MONTH_NAMES[month] ?? month} de ${year}`;
}

export function todayInputValue() {
  return format(new Date(), 'yyyy-MM-dd');
}

interface DatedRecord {
  date: DateLike;
  createdAt?: DateLike;
}

/**
 * `true` quando o `date` do lançamento é o **sentinela meio-dia** — ou seja, a hora ali não
 * significa nada.
 *
 * O app grava data de duas formas: o formulário sempre ancora no meio-dia
 * (`fromDateInputValue`, e o WhatsApp faz igual em lançamento retroativo), enquanto o
 * WhatsApp ao vivo grava o instante real da mensagem. Sem distinguir os dois, a lista mistura
 * "hora de verdade" com "12:00 de enfeite" e a ordem do dia sai errada — foi exatamente o que
 * o dono viu em 25/07/2026: uma despesa lançada às 20:41 pelo app caía atrás de três do
 * WhatsApp das 12:16/13:45/14:08, porque o app tinha gravado 12:00 nela.
 */
function hasNoRecordedTime(value: DateLike) {
  const date = toDate(value);
  return date.getHours() === 12 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
}

/** O instante que representa "quando isto entrou na vida da pessoa", pra ordenar dentro do
 * dia: a hora real do `date` quando ela existe; senão a hora do registro (`createdAt`). */
function orderingInstant(record: DatedRecord) {
  const date = toDate(record.date);
  if (!hasNoRecordedTime(date) || !record.createdAt) return date.getTime();
  return toDate(record.createdAt).getTime();
}

/**
 * Ordena lançamentos do mais recente pro mais antigo.
 *
 * **Dois níveis, de propósito**: primeiro o DIA do `date`, só depois o instante dentro do dia.
 * O dia precisa mandar sozinho porque a lista é agrupada por dia (`dayGroups` em
 * `TransactionsPage`) percorrendo a lista já ordenada — se um lançamento retroativo pudesse
 * saltar pra fora do seu dia (o `createdAt` dele é de outro dia), o mesmo cabeçalho de dia
 * apareceria duas vezes na tela.
 *
 * Dentro do dia, vale o `orderingInstant`: lançamento retroativo (sem hora real) fica no topo
 * do seu dia, na ordem em que foi digitado — decisão do dono, 29/07/2026.
 */
export function compareByDateDesc(a: DatedRecord, b: DatedRecord) {
  const dayDiff = startOfDay(toDate(b.date)).getTime() - startOfDay(toDate(a.date)).getTime();
  if (dayDiff !== 0) return dayDiff;
  return orderingInstant(b) - orderingInstant(a);
}

export function fromDateInputValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    throw new Error('Informe uma data válida.');
  }

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/**
 * Versão de `fromDateInputValue` pra **gravar um lançamento**: quando a data escolhida é HOJE,
 * grava o instante real (mesma convenção que o WhatsApp ao vivo já usa), pra que a ordem do
 * dia seja fiel sem a pessoa precisar digitar hora nenhuma. Data passada continua no
 * meio-dia — não dá pra inventar uma hora que ninguém informou; nesse caso quem ordena é o
 * `createdAt` (ver `compareByDateDesc`).
 */
export function fromDateInputValueForWrite(value: string) {
  return value === todayInputValue() ? new Date() : fromDateInputValue(value);
}

/**
 * Data pra uma **edição**: se a pessoa não mexeu no dia, preserva o timestamp original em vez
 * de reancorar no meio-dia — senão editar a descrição de uma despesa vinda do WhatsApp
 * apagaria a hora real dela e a jogaria pra outro lugar da lista.
 */
export function resolveEditedDate(value: string, originalDate: DateLike) {
  const original = toDate(originalDate);
  return value === toDateInputValue(original) ? original : fromDateInputValueForWrite(value);
}
