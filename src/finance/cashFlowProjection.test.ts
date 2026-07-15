import { describe, it, expect } from 'vitest';
import { addDays } from 'date-fns';
import { projectDailyBalance } from './cashFlowProjection';
import type { Account, Bill, Invoice, RecurringRule, Transaction } from '../types/contracts';
import { Timestamp } from 'firebase/firestore';

const NOW = new Date(2026, 6, 14, 10, 0, 0);

function makeAccount(overrides: Partial<Account> = {}): Account {
  return { id: 'acc-1', workspaceId: 'ws-1', name: 'Conta', type: 'checking', openingBalanceCents: 100000, isActive: true, createdBy: 'user-1', ...overrides };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return { id: 'txn-1', workspaceId: 'ws-1', type: 'income', amountCents: 500000, accountId: 'acc-1', date: Timestamp.fromDate(new Date(2026, 6, 1)), description: 'Salário', createdBy: 'user-1', updatedBy: 'user-1', competenceMonth: '2026-07', ...overrides } as Transaction;
}

function makeBill(daysFromNow: number, overrides: Partial<Bill> = {}): Bill {
  const due = addDays(NOW, daysFromNow);
  return { id: 'bill-1', workspaceId: 'ws-1', description: 'Aluguel', amountCents: 80000, dueDate: Timestamp.fromDate(due), status: 'pending', createdBy: 'user-1', ...overrides };
}

function makeRecurring(daysFromNow: number, overrides: Partial<RecurringRule> = {}): RecurringRule {
  const next = addDays(NOW, daysFromNow);
  return { id: 'rec-1', workspaceId: 'ws-1', description: 'Netflix', amountCents: 3990, frequency: 'monthly', nextOccurrenceAt: Timestamp.fromDate(next), isActive: true, createdBy: 'user-1', ...overrides } as RecurringRule;
}

function makeInvoice(daysFromNow: number, overrides: Partial<Invoice> = {}): Invoice {
  const due = addDays(NOW, daysFromNow);
  return { id: 'inv-1', cardId: 'card-1', workspaceId: 'ws-1', referenceMonth: '2026-07', dueDate: Timestamp.fromDate(due), status: 'open', purchasesTotalCents: 0, paymentsTotalCents: 0, creditsTotalCents: 0, feesTotalCents: 0, outstandingBalanceCents: 50000, overpaidCreditCents: 0, version: 1, ...overrides };
}

describe('projectDailyBalance', () => {
  it('deve retornar um array com horizonDays elementos', () => {
    const result = projectDailyBalance(30, [makeAccount()], [], [], [], [], undefined, NOW);
    expect(result).toHaveLength(30);
  });

  it('primeiro dia deve ser "Hoje"', () => {
    const result = projectDailyBalance(5, [makeAccount()], [], [], [], [], undefined, NOW);
    expect(result[0].dayLabel).toBe('Hoje');
    expect(result[1].dayLabel).toBe('Amanhã');
  });

  it('saldo inicial deve refletir o total das contas', () => {
    const accounts = [makeAccount({ openingBalanceCents: 200000 })];
    const result = projectDailyBalance(1, accounts, [], [], [], [], undefined, NOW);
    expect(result[0].balanceCents).toBe(200000);
  });

  it('deve incluir income transactions no cálculo do saldo inicial', () => {
    const accounts = [makeAccount({ openingBalanceCents: 0 })];
    const transactions = [makeTransaction({ amountCents: 300000 })];
    const result = projectDailyBalance(1, accounts, transactions, [], [], [], undefined, NOW);
    expect(result[0].balanceCents).toBe(300000);
  });

  it('deve subtrair bills com vencimento no horizonte do saldo', () => {
    const bill = makeBill(3);
    const result = projectDailyBalance(5, [makeAccount({ openingBalanceCents: 100000 })], [], [bill], [], [], undefined, NOW);
    const day3 = result[3];
    expect(day3.outflowCents).toBe(80000);
  });

  it('deve incluir recorrências como despesas no horizonte', () => {
    const rule = makeRecurring(2, { amountCents: 3990 });
    const result = projectDailyBalance(5, [makeAccount()], [], [], [rule], [], undefined, NOW);
    const day2 = result[2];
    expect(day2.outflowCents).toBe(3990);
  });

  it('deve incluir faturas com saldo devedor no horizonte', () => {
    const invoice = makeInvoice(4, { outstandingBalanceCents: 50000, status: 'closed' });
    const result = projectDailyBalance(10, [makeAccount()], [], [], [], [invoice], undefined, NOW);
    const day4 = result[4];
    expect(day4.outflowCents).toBe(50000);
  });

  it('deve ignorar faturas já pagas', () => {
    const invoice = makeInvoice(4, { outstandingBalanceCents: 50000, status: 'paid' });
    const result = projectDailyBalance(10, [makeAccount()], [], [], [], [invoice], undefined, NOW);
    const totalOutflow = result.reduce((s, d) => s + d.outflowCents, 0);
    expect(totalOutflow).toBe(0);
  });

  it('deve ignorar bills canceladas', () => {
    const bill = makeBill(3, { status: 'cancelled' });
    const result = projectDailyBalance(5, [makeAccount()], [], [bill], [], [], undefined, NOW);
    const totalOutflow = result.reduce((s, d) => s + d.outflowCents, 0);
    expect(totalOutflow).toBe(0);
  });

  it('deve incluir eventos com kind correto', () => {
    const bill = makeBill(2);
    const rule = makeRecurring(3);
    const invoice = makeInvoice(4);
    const result = projectDailyBalance(10, [makeAccount()], [], [bill], [rule], [invoice], undefined, NOW);
    const allEvents = result.flatMap((d) => d.events);
    expect(allEvents.some((e) => e.kind === 'bill')).toBe(true);
    expect(allEvents.some((e) => e.kind === 'recurring')).toBe(true);
    expect(allEvents.some((e) => e.kind === 'invoice')).toBe(true);
  });

  it('saldo acumulado deve refletir entradas e saídas ao longo dos dias', () => {
    const accounts = [makeAccount({ openingBalanceCents: 100000 })];
    const bill = makeBill(1, { amountCents: 30000 });
    const result = projectDailyBalance(3, accounts, [], [bill], [], [], undefined, NOW);
    expect(result[0].balanceCents).toBe(100000);
    expect(result[1].balanceCents).toBe(70000);
    expect(result[2].balanceCents).toBe(70000);
  });

  it('com payday fixo, deve projetar receita nos meses seguintes', () => {
    const accounts = [makeAccount({ openingBalanceCents: 100000 })];
    const payday = { type: 'fixed_day' as const, day: 5 };
    const result = projectDailyBalance(30, accounts, [makeTransaction({ amountCents: 500000, type: 'income', date: Timestamp.fromDate(new Date(2026, 5, 5)) })], [], [], [], payday, NOW);
    const incomeDays = result.filter((d) => d.inflowCents > 0);
    expect(incomeDays.length).toBeGreaterThan(0);
  });
});
