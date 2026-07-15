import { describe, it, expect } from 'vitest';
import { computeAnnualSummary } from './annualSummaryCalculations';
import type { Transaction } from '../types/contracts';
import { Timestamp } from 'firebase/firestore';

function makeTxn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1', workspaceId: 'ws-1', type: 'income', amountCents: 100000, accountId: 'acc-1',
    date: Timestamp.fromDate(new Date(2026, 0, 15)), description: 'Salário', createdBy: 'u1', updatedBy: 'u1',
    competenceMonth: '2026-01', ...overrides,
  } as Transaction;
}

describe('computeAnnualSummary', () => {
  it('deve retornar 12 meses no breakdown', () => {
    const result = computeAnnualSummary(2026, [], [], new Map());
    expect(result.monthlyBreakdown).toHaveLength(12);
  });

  it('deve somar income e expense do ano inteiro', () => {
    const txns = [
      makeTxn({ amountCents: 100000, type: 'income', competenceMonth: '2026-01', date: Timestamp.fromDate(new Date(2026, 0, 5)) }),
      makeTxn({ id: 't2', amountCents: 30000, type: 'expense', competenceMonth: '2026-01', date: Timestamp.fromDate(new Date(2026, 0, 10)) }),
      makeTxn({ id: 't3', amountCents: 20000, type: 'expense', competenceMonth: '2026-06', date: Timestamp.fromDate(new Date(2026, 5, 10)) }),
    ];
    const result = computeAnnualSummary(2026, txns, [], new Map());
    expect(result.totalIncomeCents).toBe(100000);
    expect(result.totalExpenseCents).toBe(50000);
  });

  it('deve calcular savings rate corretamente', () => {
    const txns = [
      makeTxn({ amountCents: 100000, type: 'income', competenceMonth: '2026-01', date: Timestamp.fromDate(new Date(2026, 0, 5)) }),
      makeTxn({ id: 't2', amountCents: 30000, type: 'expense', competenceMonth: '2026-01', date: Timestamp.fromDate(new Date(2026, 0, 10)) }),
    ];
    const result = computeAnnualSummary(2026, txns, [], new Map());
    // savings: 100000 - 30000 = 70000, rate = 70%
    expect(result.savingsCents).toBe(70000);
    expect(result.savingsRate).toBe(70);
  });

  it('savingsRate deve ser 0 quando totalIncome for 0', () => {
    const result = computeAnnualSummary(2026, [], [], new Map());
    expect(result.savingsRate).toBe(0);
  });

  it('deve retornar top 5 categorias', () => {
    const txns = [
      makeTxn({ id: 't1', amountCents: 50000, type: 'expense', categoryId: 'mercado', competenceMonth: '2026-01', date: Timestamp.fromDate(new Date(2026, 0, 5)) }),
      makeTxn({ id: 't2', amountCents: 30000, type: 'expense', categoryId: 'transporte', competenceMonth: '2026-01', date: Timestamp.fromDate(new Date(2026, 0, 10)) }),
    ];
    const names = new Map([['mercado', 'Mercado'], ['transporte', 'Transporte']]);
    const result = computeAnnualSummary(2026, txns, [], names);
    expect(result.topCategories).toHaveLength(2);
    expect(result.topCategories[0].name).toBe('Mercado');
    expect(result.topCategories[0].amountCents).toBe(50000);
  });

  it('deve identificar melhor e pior mês', () => {
    const txns = [
      makeTxn({ amountCents: 100000, type: 'income', competenceMonth: '2026-01', date: Timestamp.fromDate(new Date(2026, 0, 5)) }),
      makeTxn({ id: 't2', amountCents: 80000, type: 'expense', competenceMonth: '2026-01', date: Timestamp.fromDate(new Date(2026, 0, 10)) }),
    ];
    const result = computeAnnualSummary(2026, txns, [], new Map());
    expect(result.bestMonth).not.toBeNull();
    expect(result.bestMonth!.savingsCents).toBe(20000);
    expect(result.worstMonth).toBeNull(); // No negative month
  });

  it('ano vazio deve retornar zeros', () => {
    const result = computeAnnualSummary(2026, [], [], new Map());
    expect(result.totalIncomeCents).toBe(0);
    expect(result.totalExpenseCents).toBe(0);
    expect(result.topCategories).toHaveLength(0);
    expect(result.bestMonth).toBeNull();
    expect(result.worstMonth).toBeNull();
  });
});
