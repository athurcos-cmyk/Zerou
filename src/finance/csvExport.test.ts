import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { transactionsToCsv } from './csvExport';
import { categoryColors } from '../theme/palette';
import type { Account, Category, Transaction } from '../types/contracts';

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    workspaceId: 'ws-1',
    createdBy: 'user-1',
    updatedBy: 'user-1',
    type: 'expense',
    amountCents: 123456,
    description: 'Supermercado',
    date: Timestamp.fromDate(new Date(2026, 6, 13)),
    competenceMonth: '2026-07',
    cashMonth: '2026-07',
    tags: ['compras', 'casa'],
    isRecurring: false,
    clientMutationId: 'm1',
    syncStatus: 'synced',
    version: 1,
    ...overrides,
  };
}

const categoryMap = new Map<string, Category>([
  ['cat-1', { id: 'cat-1', name: 'Alimentação', type: 'expense', color: categoryColors[0], icon: 'food', isDefault: true, isActive: true, workspaceId: 'ws-1' }],
]);

const accountMap = new Map<string, Account>([
  ['acc-1', { id: 'acc-1', name: 'Itaú', type: 'checking', openingBalanceCents: 100000, isActive: true, createdBy: 'user-1', workspaceId: 'ws-1' }],
]);

describe('transactionsToCsv', () => {
  it('starts with UTF-8 BOM', () => {
    const csv = transactionsToCsv([makeTx()], categoryMap, accountMap);
    expect(csv.startsWith('﻿')).toBe(true);
  });

  it('uses semicolon as delimiter', () => {
    const csv = transactionsToCsv([makeTx()], categoryMap, accountMap);
    const header = csv.split('\n')[0];
    expect(header).toBe('﻿Data;Tipo;Descrição;Categoria;Conta;Valor;Tags');
  });

  it('formats value in Brazilian format (comma decimal, no R$)', () => {
    const csv = transactionsToCsv([makeTx({ amountCents: 123456 })], categoryMap, accountMap);
    const row = csv.split('\n')[1];
    const fields = row.split(';');
    expect(fields[5]).toBe('1234,56');
  });

  it('formats negative values correctly', () => {
    const csv = transactionsToCsv([makeTx({ amountCents: -5099, type: 'refund' })], categoryMap, accountMap);
    const row = csv.split('\n')[1];
    const fields = row.split(';');
    expect(fields[5]).toBe('-50,99');
  });

  it('escapes fields with semicolons', () => {
    const csv = transactionsToCsv([makeTx({ description: 'Compras; diversos' })], categoryMap, accountMap);
    const row = csv.split('\n')[1];
    expect(row).toContain('"Compras; diversos"');
  });

  it('escapes fields with double quotes', () => {
    const csv = transactionsToCsv([makeTx({ description: 'Presente "especial"' })], categoryMap, accountMap);
    const row = csv.split('\n')[1];
    expect(row).toContain('"Presente ""especial"""');
  });

  it('resolves category name from map', () => {
    const csv = transactionsToCsv([makeTx({ categoryId: 'cat-1' })], categoryMap, accountMap);
    const row = csv.split('\n')[1];
    const fields = row.split(';');
    expect(fields[3]).toBe('Alimentação');
  });

  it('resolves account name from map', () => {
    const csv = transactionsToCsv([makeTx({ accountId: 'acc-1' })], categoryMap, accountMap);
    const row = csv.split('\n')[1];
    const fields = row.split(';');
    expect(fields[4]).toBe('Itaú');
  });

  it('handles empty list', () => {
    const csv = transactionsToCsv([], categoryMap, accountMap);
    expect(csv).toBe('﻿Data;Tipo;Descrição;Categoria;Conta;Valor;Tags');
  });

  it('handles transactions with accented characters', () => {
    const csv = transactionsToCsv([makeTx({ description: 'Açaí na feira' })], categoryMap, accountMap);
    const row = csv.split('\n')[1];
    expect(row).toContain('Açaí na feira');
  });
});
