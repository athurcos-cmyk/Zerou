import { describe, it, expect } from 'vitest';
import { calculateNetWorth, netWorthHistory } from './netWorthCalculations';
import type { Account, Bill, Invoice, Transaction } from '../types/contracts';
import { Timestamp } from 'firebase/firestore';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    workspaceId: 'ws-1',
    name: 'Conta',
    type: 'checking',
    openingBalanceCents: 0,
    isActive: true,
    createdBy: 'user-1',
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    workspaceId: 'ws-1',
    type: 'income',
    amountCents: 100000,
    accountId: 'acc-1',
    date: Timestamp.fromDate(new Date(2026, 5, 15)),
    description: 'Salário',
    createdBy: 'user-1',
    updatedBy: 'user-1',
    competenceMonth: '2026-06',
    ...overrides,
  } as Transaction;
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    cardId: 'card-1',
    workspaceId: 'ws-1',
    referenceMonth: '2026-06',
    dueDate: Timestamp.fromDate(new Date(2026, 6, 10)),
    status: 'open',
    purchasesTotalCents: 0,
    paymentsTotalCents: 0,
    creditsTotalCents: 0,
    feesTotalCents: 0,
    outstandingBalanceCents: 50000,
    overpaidCreditCents: 0,
    version: 1,
    ...overrides,
  };
}

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-1',
    workspaceId: 'ws-1',
    description: 'Aluguel',
    amountCents: 80000,
    dueDate: Timestamp.fromDate(new Date(2026, 6, 5)),
    status: 'pending',
    createdBy: 'user-1',
    ...overrides,
  };
}

describe('calculateNetWorth', () => {
  it('deve calcular ativos como soma dos saldos das contas', () => {
    const accounts = [
      makeAccount({ id: 'acc-1', openingBalanceCents: 100000 }),
      makeAccount({ id: 'acc-2', openingBalanceCents: 50000, type: 'savings' }),
    ];
    const result = calculateNetWorth(accounts, [], []);
    expect(result.totalAssetsCents).toBe(150000);
  });

  it('usa currentBalanceCents quando disponível, senão cai pro saldo de abertura', () => {
    const accounts = [
      makeAccount({ id: 'acc-1', openingBalanceCents: 0, currentBalanceCents: 300000 }),
      makeAccount({ id: 'acc-2', openingBalanceCents: 50000 }),
    ];
    const result = calculateNetWorth(accounts, [], []);
    expect(result.totalAssetsCents).toBe(350000);
  });

  it('deve calcular passivos como soma de faturas pendentes + contas a pagar', () => {
    const invoices = [
      makeInvoice({ outstandingBalanceCents: 40000, status: 'open' }),
      makeInvoice({ id: 'inv-2', outstandingBalanceCents: 10000, status: 'closed' }),
    ];
    const bills = [makeBill({ amountCents: 80000, status: 'pending' })];
    const result = calculateNetWorth([makeAccount({ openingBalanceCents: 100000 })], invoices, bills);
    expect(result.totalLiabilitiesCents).toBe(130000);
    expect(result.liabilitiesByKind.invoices).toBe(50000);
    expect(result.liabilitiesByKind.bills).toBe(80000);
  });

  it('deve ignorar faturas já pagas nos passivos', () => {
    const invoices = [
      makeInvoice({ outstandingBalanceCents: 40000, status: 'paid' }),
      makeInvoice({ id: 'inv-2', outstandingBalanceCents: 10000, status: 'overpaid' }),
    ];
    const result = calculateNetWorth([], invoices, []);
    expect(result.totalLiabilitiesCents).toBe(0);
  });

  it('deve ignorar contas canceladas nos passivos', () => {
    const bills = [makeBill({ amountCents: 80000, status: 'cancelled' })];
    const result = calculateNetWorth([], [], bills);
    expect(result.totalLiabilitiesCents).toBe(0);
  });

  it('patrimônio líquido = ativos - passivos', () => {
    const accounts = [makeAccount({ openingBalanceCents: 500000 })];
    const invoices = [makeInvoice({ outstandingBalanceCents: 200000, status: 'open' })];
    const bills = [makeBill({ amountCents: 50000, status: 'pending' })];
    const result = calculateNetWorth(accounts, invoices, bills);
    expect(result.netWorthCents).toBe(250000);
  });

  it('deve agrupar ativos por tipo de conta', () => {
    const accounts = [
      makeAccount({ id: 'a1', type: 'checking', openingBalanceCents: 10000 }),
      makeAccount({ id: 'a2', type: 'savings', openingBalanceCents: 20000 }),
      makeAccount({ id: 'a3', type: 'checking', openingBalanceCents: 30000 }),
    ];
    const result = calculateNetWorth(accounts, [], []);
    const checkingEntry = result.assetsByType.find((e) => e.type === 'checking');
    const savingsEntry = result.assetsByType.find((e) => e.type === 'savings');
    expect(checkingEntry?.amountCents).toBe(40000);
    expect(savingsEntry?.amountCents).toBe(20000);
  });

  it('deve filtrar tipos com saldo zero do breakdown', () => {
    const accounts = [
      makeAccount({ id: 'a1', type: 'checking', openingBalanceCents: 10000 }),
      makeAccount({ id: 'a2', type: 'investment', openingBalanceCents: 0 }),
    ];
    const result = calculateNetWorth(accounts, [], []);
    expect(result.assetsByType).toHaveLength(1);
  });
});

describe('netWorthHistory', () => {
  it('deve retornar um snapshot por mês', () => {
    const months = ['2026-04', '2026-05', '2026-06'];
    const result = netWorthHistory(months, [], [], new Map(), []);
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.month)).toEqual(months);
  });

  it('deve filtrar transações até o final de cada mês', () => {
    const accounts = [makeAccount({ openingBalanceCents: 0 })];
    const transactions = [
      makeTransaction({ id: 't1', amountCents: 100000, date: Timestamp.fromDate(new Date(2026, 4, 10)) }),
      makeTransaction({ id: 't2', amountCents: 50000, date: Timestamp.fromDate(new Date(2026, 5, 20)) }),
    ];
    const result = netWorthHistory(['2026-05', '2026-06'], accounts, transactions, new Map(), []);
    // Maio: só t1 conta (100000). Junho: t1 + t2 (150000).
    expect(result[0].assetsCents).toBe(100000);
    expect(result[1].assetsCents).toBe(150000);
  });

  it('deve usar as faturas do mês correspondente', () => {
    const invoicesByMonth = new Map([
      ['2026-05', [makeInvoice({ outstandingBalanceCents: 30000, status: 'open' })]],
      ['2026-06', [makeInvoice({ outstandingBalanceCents: 80000, status: 'open' })]],
    ]);
    const result = netWorthHistory(['2026-05', '2026-06'], [], [], invoicesByMonth, []);
    expect(result[0].liabilitiesCents).toBe(30000);
    expect(result[1].liabilitiesCents).toBe(80000);
  });

  it('netWorthCents = assetsCents - liabilitiesCents em cada mês', () => {
    const accounts = [makeAccount({ openingBalanceCents: 200000 })];
    const invoicesByMonth = new Map([
      ['2026-06', [makeInvoice({ outstandingBalanceCents: 50000, status: 'open' })]],
    ]);
    const result = netWorthHistory(['2026-06'], accounts, [], invoicesByMonth, []);
    expect(result[0].netWorthCents).toBe(150000);
  });
});
