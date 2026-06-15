import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { calculateDashboardSummary, calculateTotalBalance } from './financeCalculations';
import type { Account, Bill, RecurringRule, Transaction } from '../types/contracts';

function account(id: string, openingBalanceCents = 0): Account {
  return {
    id,
    workspaceId: 'workspaceA',
    name: id,
    type: 'checking',
    openingBalanceCents,
    isActive: true,
    createdBy: 'alice'
  };
}

function transaction(overrides: Partial<Transaction>): Transaction {
  const date = Timestamp.fromDate(new Date('2026-06-14T12:00:00'));

  return {
    id: overrides.id ?? `tx-${Math.random()}`,
    workspaceId: 'workspaceA',
    createdBy: 'alice',
    updatedBy: 'alice',
    type: overrides.type ?? 'expense',
    amountCents: overrides.amountCents ?? 0,
    description: overrides.description ?? 'Movimento',
    accountId: 'accountId' in overrides ? overrides.accountId : 'checking',
    destinationAccountId: overrides.destinationAccountId,
    cardId: overrides.cardId,
    invoiceId: overrides.invoiceId,
    date: overrides.date ?? date,
    competenceMonth: '2026-06',
    cashMonth: '2026-06',
    tags: [],
    isRecurring: false,
    clientMutationId: overrides.clientMutationId ?? 'mutation-id',
    syncStatus: 'synced',
    version: 1,
    deletedAt: overrides.deletedAt
  };
}

describe('financial calculations', () => {
  it('increases balance with income and decreases with expense', () => {
    const total = calculateTotalBalance(
      [account('checking')],
      [
        transaction({ type: 'income', amountCents: 250050, accountId: 'checking' }),
        transaction({ type: 'expense', amountCents: 100025, accountId: 'checking' })
      ]
    );

    expect(total).toBe(150025);
  });

  it('keeps consolidated net worth unchanged on transfers', () => {
    const total = calculateTotalBalance(
      [account('checking', 50000), account('wallet', 0)],
      [transaction({ type: 'transfer', amountCents: 12555, accountId: 'checking', destinationAccountId: 'wallet' })]
    );

    expect(total).toBe(50000);
  });

  it('applies explicit adjustment and preserves cents', () => {
    const total = calculateTotalBalance(
      [account('checking', 10000)],
      [transaction({ type: 'adjustment', amountCents: 199, accountId: 'checking' })]
    );

    expect(total).toBe(10199);
  });

  it('ignores logically deleted transactions', () => {
    const total = calculateTotalBalance(
      [account('checking', 10000)],
      [
        transaction({
          type: 'expense',
          amountCents: 9999,
          accountId: 'checking',
          deletedAt: Timestamp.fromDate(new Date('2026-06-15T12:00:00'))
        })
      ]
    );

    expect(total).toBe(10000);
  });

  it('does not reduce cash balance when a card purchase is recorded', () => {
    const total = calculateTotalBalance(
      [account('checking', 100000)],
      [transaction({ type: 'card_purchase', amountCents: 25000, accountId: undefined, cardId: 'cardA', invoiceId: 'invoiceA' })]
    );

    expect(total).toBe(100000);
  });

  it('reduces cash balance once when an invoice payment is recorded', () => {
    const total = calculateTotalBalance(
      [account('checking', 100000)],
      [
        transaction({ type: 'card_purchase', amountCents: 25000, accountId: undefined, cardId: 'cardA', invoiceId: 'invoiceA' }),
        transaction({ type: 'card_payment', amountCents: 25000, accountId: 'checking', cardId: 'cardA', invoiceId: 'invoiceA' })
      ]
    );

    expect(total).toBe(75000);
  });

  it('calculates free to spend from bills and recurring rules', () => {
    const bills: Bill[] = [
      {
        id: 'bill-1',
        workspaceId: 'workspaceA',
        description: 'Aluguel',
        amountCents: 120000,
        dueDate: Timestamp.fromDate(new Date('2026-06-20T12:00:00')),
        status: 'pending',
        createdBy: 'alice'
      }
    ];
    const recurringRules: RecurringRule[] = [
      {
        id: 'rec-1',
        workspaceId: 'workspaceA',
        description: 'Internet',
        amountCents: 10000,
        frequency: 'monthly',
        nextOccurrenceAt: Timestamp.fromDate(new Date('2026-06-18T12:00:00')),
        isActive: true,
        createdBy: 'alice'
      }
    ];

    const summary = calculateDashboardSummary({
      accounts: [account('checking', 300000)],
      transactions: [],
      bills,
      recurringRules,
      now: new Date('2026-06-14T12:00:00')
    });

    expect(summary.committedCents).toBe(130000);
    expect(summary.freeToSpendCents).toBe(170000);
    expect(summary.upcomingCommitments).toHaveLength(2);
  });
});
