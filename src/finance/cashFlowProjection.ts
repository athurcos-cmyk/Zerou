import { addDays, isAfter, isBefore, isEqual, isSameDay, startOfDay } from 'date-fns';
import { toDate } from './financeDates';
import { calculateTotalBalance } from './financeCalculations';
import { nextOccurrenceDate } from './financeService';
import { nextPaydayFrom } from './payday';
import type { Account, Bill, Invoice, PaydayRule, RecurringRule, Transaction } from '../types/contracts';

export interface ProjectionEvent {
  id: string;
  kind: 'income' | 'bill' | 'recurring' | 'invoice';
  description: string;
  amountCents: number;
}

export interface DailyProjection {
  date: Date;
  dayLabel: string;
  balanceCents: number;
  inflowCents: number;
  outflowCents: number;
  events: ProjectionEvent[];
}

const WEEKDAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function estimateMonthlyIncome(transactions: Transaction[]): number {
  const incomeTxns = transactions.filter(
    (t) => t.type === 'income' && !t.deletedAt,
  );
  if (incomeTxns.length === 0) return 0;

  const total = incomeTxns.reduce((sum, t) => sum + t.amountCents, 0);
  const months = new Set(incomeTxns.map((t) => toDate(t.date).toISOString().slice(0, 7)));
  const monthCount = months.size || 1;
  return Math.round(total / monthCount);
}

function resolvePaydayDates(payday: PaydayRule | undefined, horizonEnd: Date, now: Date): Date[] {
  if (!payday || payday.type === 'variable_income') return [];

  const dates: Date[] = [];
  let cursor = new Date(now);
  cursor.setDate(1);

  while (cursor <= horizonEnd) {
    const next = nextPaydayFrom(payday, cursor);
    if (!next) break;
    if (isAfter(next, horizonEnd)) break;
    if (isAfter(next, now)) {
      dates.push(next);
    }
    cursor = new Date(next);
    cursor.setDate(cursor.getDate() + 1);
    cursor.setMonth(cursor.getMonth() + 1, 1);
  }

  return dates;
}

function projectRecurringEvents(
  rules: RecurringRule[],
  horizonEnd: Date,
  now: Date,
): { date: Date; description: string; amountCents: number; ruleId: string }[] {
  const events: { date: Date; description: string; amountCents: number; ruleId: string }[] = [];

  for (const rule of rules) {
    if (!rule.isActive || !rule.amountCents) continue;

    let current = toDate(rule.nextOccurrenceAt);
    while (isBefore(current, horizonEnd) || isEqual(current, horizonEnd)) {
      if (isAfter(current, now) || isEqual(startOfDay(current), startOfDay(now))) {
        events.push({
          date: current,
          description: rule.description,
          amountCents: rule.amountCents,
          ruleId: rule.id,
        });
      }

      const next = nextOccurrenceDate(current, rule.frequency, rule.anchorDay);
      if (isBefore(next, current) || isEqual(next, current)) break;
      current = next;
    }
  }

  return events;
}

export function projectDailyBalance(
  horizonDays: number,
  accounts: Account[],
  transactions: Transaction[],
  bills: Bill[],
  recurringRules: RecurringRule[],
  invoices: Invoice[],
  payday?: PaydayRule,
  now: Date = new Date(),
): DailyProjection[] {
  const startBalance = calculateTotalBalance(accounts, transactions);
  const horizonEnd = addDays(now, horizonDays);
  const todayStart = startOfDay(now);
  const estimatedIncome = estimateMonthlyIncome(transactions);
  const incomeDates = payday && payday.type !== 'variable_income'
    ? resolvePaydayDates(payday, horizonEnd, now)
    : [];

  // Bills: pending/overdue with dueDate in horizon
  const billEvents = bills
    .filter((b) => b.status === 'pending' || b.status === 'overdue')
    .map((b) => ({ date: toDate(b.dueDate), description: b.description, amountCents: b.amountCents, id: b.id, kind: 'bill' as const }))
    .filter((e) => isAfter(e.date, todayStart) && (isBefore(e.date, horizonEnd) || isEqual(e.date, horizonEnd)));

  // Recurring
  const recurringEvents = projectRecurringEvents(recurringRules, horizonEnd, now).map((e) => ({
    ...e,
    id: e.ruleId,
    kind: 'recurring' as const,
  }));

  // Invoices: open/closed/partial/overdue with dueDate in horizon and outstanding balance > 0
  const invoiceEvents = invoices
    .filter((inv) => inv.status !== 'paid' && inv.status !== 'overpaid' && inv.outstandingBalanceCents > 0)
    .map((inv) => ({
      date: toDate(inv.dueDate),
      description: `Fatura ${inv.referenceMonth}`,
      amountCents: inv.outstandingBalanceCents,
      id: inv.id,
      kind: 'invoice' as const,
    }))
    .filter((e) => isAfter(e.date, todayStart) && (isBefore(e.date, horizonEnd) || isEqual(e.date, horizonEnd)));

  // Income events
  const incomeEvents: { date: Date; description: string; amountCents: number; id: string; kind: 'income' }[] = [];
  if (estimatedIncome > 0) {
    for (const d of incomeDates) {
      incomeEvents.push({
        date: d,
        description: 'Recebimento previsto',
        amountCents: estimatedIncome,
        id: `income-${d.toISOString().slice(0, 10)}`,
        kind: 'income',
      });
    }
  }

  const allEvents = [...billEvents, ...recurringEvents, ...invoiceEvents, ...incomeEvents];
  const eventsByDay = new Map<string, typeof allEvents>();
  for (const e of allEvents) {
    const key = e.date.toISOString().slice(0, 10);
    const list = eventsByDay.get(key) ?? [];
    list.push(e);
    eventsByDay.set(key, list);
  }

  const days: DailyProjection[] = [];
  let runningBalance = startBalance;

  for (let i = 0; i < horizonDays; i++) {
    const date = addDays(now, i);
    const key = date.toISOString().slice(0, 10);
    const events = eventsByDay.get(key) ?? [];
    const inflowCents = events
      .filter((e) => e.kind === 'income')
      .reduce((sum, e) => sum + e.amountCents, 0);
    const outflowCents = events
      .filter((e) => e.kind !== 'income')
      .reduce((sum, e) => sum + e.amountCents, 0);

    runningBalance += inflowCents - outflowCents;

    const weekday = WEEKDAY_LABELS[date.getDay()];
    const dayNum = date.getDate();
    const monthNum = date.getMonth() + 1;
    let dayLabel: string;
    if (i === 0) {
      dayLabel = 'Hoje';
    } else if (i === 1) {
      dayLabel = 'Amanhã';
    } else {
      dayLabel = `${dayNum}/${String(monthNum).padStart(2, '0')} ${weekday}`;
    }

    days.push({
      date,
      dayLabel,
      balanceCents: runningBalance,
      inflowCents,
      outflowCents,
      events,
    });
  }

  return days;
}
