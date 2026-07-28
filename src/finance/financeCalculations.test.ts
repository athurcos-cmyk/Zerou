import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  buildUpcomingCommitments,
  buildUpcomingReceivables,
  calculateAccountBalances,
  calculateDashboardSummary,
  calculateNextMonthProjection,
  calculateTotalBalance,
  currentAccountBalances,
  currentTotalBalance,
  hasPendingCardLedgerActivity,
  invertAccountEffects,
  mergeAccountEffects,
  transactionAccountEffects
} from './financeCalculations';
import type { Account, Bill, CreditCard, Invoice, Receivable, RecurringRule, Transaction } from '../types/contracts';

function account(id: string, openingBalanceCents = 0, overrides: Partial<Account> = {}): Account {
  return {
    id,
    workspaceId: 'workspaceA',
    name: id,
    type: 'checking',
    openingBalanceCents,
    isActive: true,
    createdBy: 'alice',
    ...overrides
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
    recurringId: overrides.recurringId,
    date: overrides.date ?? date,
    competenceMonth: overrides.competenceMonth ?? '2026-06',
    cashMonth: overrides.cashMonth ?? '2026-06',
    tags: overrides.tags ?? [],
    isRecurring: false,
    clientMutationId: overrides.clientMutationId ?? 'mutation-id',
    syncStatus: 'synced',
    version: 1,
    deletedAt: overrides.deletedAt
  };
}

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: overrides.id ?? 'bill-1',
    workspaceId: 'workspaceA',
    description: overrides.description ?? 'Conta',
    amountCents: overrides.amountCents ?? 10000,
    dueDate: overrides.dueDate ?? Timestamp.fromDate(new Date('2026-06-20T12:00:00')),
    status: overrides.status ?? 'pending',
    createdBy: 'alice',
    ...overrides
  };
}

function recurring(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: overrides.id ?? 'rec-1',
    workspaceId: 'workspaceA',
    description: overrides.description ?? 'Assinatura',
    amountCents: 'amountCents' in overrides ? overrides.amountCents : 5000,
    frequency: overrides.frequency ?? 'monthly',
    nextOccurrenceAt: overrides.nextOccurrenceAt ?? Timestamp.fromDate(new Date('2026-06-18T12:00:00')),
    isActive: overrides.isActive ?? true,
    createdBy: 'alice',
    ...overrides
  };
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: overrides.id ?? 'invoice-1',
    workspaceId: 'workspaceA',
    cardId: 'card-1',
    referenceMonth: overrides.referenceMonth ?? '2026-06',
    dueDate: overrides.dueDate ?? Timestamp.fromDate(new Date('2026-06-10T12:00:00')),
    status: overrides.status ?? 'open',
    outstandingBalanceCents: overrides.outstandingBalanceCents ?? 10000,
    createdBy: 'alice',
    ...overrides
  } as Invoice;
}

function card(overrides: Partial<CreditCard> = {}): CreditCard {
  return {
    id: overrides.id ?? 'card-1',
    workspaceId: 'workspaceA',
    name: overrides.name ?? 'Cartão',
    lastFour: '1234',
    brand: 'visa',
    limitCents: 500000,
    closingDay: 3,
    dueDay: 10,
    colorToken: 'default',
    isActive: true,
    ...overrides
  };
}

describe('financial calculations — movimentação de saldo', () => {
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

  it('increases balance with refund and reimbursement, like income', () => {
    const total = calculateTotalBalance(
      [account('checking', 10000)],
      [
        transaction({ type: 'refund', amountCents: 2000, accountId: 'checking' }),
        transaction({ type: 'reimbursement', amountCents: 3000, accountId: 'checking' })
      ]
    );

    expect(total).toBe(15000);
  });

  it('keeps consolidated net worth unchanged on transfers', () => {
    const total = calculateTotalBalance(
      [account('checking', 50000), account('wallet', 0)],
      [transaction({ type: 'transfer', amountCents: 12555, accountId: 'checking', destinationAccountId: 'wallet' })]
    );

    expect(total).toBe(50000);
  });

  it('moves money between the two accounts on transfer, not just the consolidated total', () => {
    const balances = calculateAccountBalances(
      [account('checking', 50000), account('wallet', 0)],
      [transaction({ type: 'transfer', amountCents: 12555, accountId: 'checking', destinationAccountId: 'wallet' })]
    );

    expect(balances.find((a) => a.id === 'checking')?.balanceCents).toBe(37445);
    expect(balances.find((a) => a.id === 'wallet')?.balanceCents).toBe(12555);
  });

  it('debits only the source when a transfer has no destination account', () => {
    const balances = calculateAccountBalances(
      [account('checking', 50000)],
      [transaction({ type: 'transfer', amountCents: 10000, accountId: 'checking', destinationAccountId: undefined })]
    );

    expect(balances.find((a) => a.id === 'checking')?.balanceCents).toBe(40000);
  });

  it('applies explicit adjustment and preserves cents (positive and negative)', () => {
    const increased = calculateTotalBalance(
      [account('checking', 10000)],
      [transaction({ type: 'adjustment', amountCents: 199, accountId: 'checking' })]
    );
    const decreased = calculateTotalBalance(
      [account('checking', 10000)],
      [transaction({ type: 'adjustment', amountCents: -199, accountId: 'checking' })]
    );

    expect(increased).toBe(10199);
    expect(decreased).toBe(9801);
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

  it('restores the balance when a purchase is deleted after being recorded (create → delete round trip)', () => {
    const purchase = transaction({ id: 'tx-1', type: 'expense', amountCents: 15000, accountId: 'checking' });

    const afterPurchase = calculateTotalBalance([account('checking', 100000)], [purchase]);
    expect(afterPurchase).toBe(85000);

    const afterSoftDelete = calculateTotalBalance(
      [account('checking', 100000)],
      [{ ...purchase, deletedAt: Timestamp.fromDate(new Date('2026-06-16T12:00:00')) }]
    );
    expect(afterSoftDelete).toBe(100000);
  });

  it('reflects only the new amount when a transaction is edited (same id, replaced snapshot)', () => {
    const original = transaction({ id: 'tx-1', type: 'expense', amountCents: 15000, accountId: 'checking' });
    const edited = { ...original, amountCents: 40000 };

    const totalBefore = calculateTotalBalance([account('checking', 100000)], [original]);
    const totalAfter = calculateTotalBalance([account('checking', 100000)], [edited]);

    expect(totalBefore).toBe(85000);
    expect(totalAfter).toBe(60000);
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

  it('ignores transactions pointing to an account that no longer exists', () => {
    const total = calculateTotalBalance(
      [account('checking', 10000)],
      [transaction({ type: 'expense', amountCents: 5000, accountId: 'closed-account' })]
    );

    expect(total).toBe(10000);
  });

  it('combines several accounts and mixed transaction types correctly', () => {
    const balances = calculateAccountBalances(
      [account('checking', 100000), account('wallet', 20000), account('savings', 0)],
      [
        transaction({ type: 'income', amountCents: 300000, accountId: 'checking' }),
        transaction({ type: 'expense', amountCents: 50000, accountId: 'checking' }),
        transaction({ type: 'transfer', amountCents: 40000, accountId: 'checking', destinationAccountId: 'savings' }),
        transaction({ type: 'expense', amountCents: 5000, accountId: 'wallet' }),
        transaction({ type: 'adjustment', amountCents: 1000, accountId: 'wallet' }),
        transaction({
          type: 'expense',
          amountCents: 99999,
          accountId: 'checking',
          deletedAt: Timestamp.fromDate(new Date('2026-06-16T12:00:00'))
        })
      ]
    );

    const byId = new Map(balances.map((b) => [b.id, b.balanceCents]));
    expect(byId.get('checking')).toBe(100000 + 300000 - 50000 - 40000);
    expect(byId.get('wallet')).toBe(20000 - 5000 + 1000);
    expect(byId.get('savings')).toBe(0 + 40000);
  });

  it('treats zero-amount transactions as a no-op', () => {
    const total = calculateTotalBalance(
      [account('checking', 10000)],
      [transaction({ type: 'expense', amountCents: 0, accountId: 'checking' })]
    );

    expect(total).toBe(10000);
  });
});

describe('transactionAccountEffects / mergeAccountEffects / invertAccountEffects', () => {
  it('returns the effect for each transaction type', () => {
    expect(transactionAccountEffects(transaction({ type: 'income', amountCents: 500, accountId: 'checking' })))
      .toEqual([{ accountId: 'checking', deltaCents: 500 }]);
    expect(transactionAccountEffects(transaction({ type: 'refund', amountCents: 500, accountId: 'checking' })))
      .toEqual([{ accountId: 'checking', deltaCents: 500 }]);
    expect(transactionAccountEffects(transaction({ type: 'reimbursement', amountCents: 500, accountId: 'checking' })))
      .toEqual([{ accountId: 'checking', deltaCents: 500 }]);
    expect(transactionAccountEffects(transaction({ type: 'expense', amountCents: 500, accountId: 'checking' })))
      .toEqual([{ accountId: 'checking', deltaCents: -500 }]);
    expect(transactionAccountEffects(transaction({ type: 'card_payment', amountCents: 500, accountId: 'checking' })))
      .toEqual([{ accountId: 'checking', deltaCents: -500 }]);
    expect(transactionAccountEffects(transaction({ type: 'adjustment', amountCents: -300, accountId: 'checking' })))
      .toEqual([{ accountId: 'checking', deltaCents: -300 }]);
    expect(transactionAccountEffects(transaction({ type: 'card_purchase', amountCents: 500, accountId: undefined })))
      .toEqual([]);
  });

  it('returns both sides for a transfer', () => {
    expect(
      transactionAccountEffects(
        transaction({ type: 'transfer', amountCents: 500, accountId: 'checking', destinationAccountId: 'wallet' })
      )
    ).toEqual([
      { accountId: 'checking', deltaCents: -500 },
      { accountId: 'wallet', deltaCents: 500 }
    ]);
  });

  it('returns nothing for a deleted transaction, regardless of type', () => {
    expect(
      transactionAccountEffects(
        transaction({ type: 'income', amountCents: 500, accountId: 'checking', deletedAt: Timestamp.now() })
      )
    ).toEqual([]);
  });

  it('returns nothing when there is no accountId (defensive)', () => {
    expect(transactionAccountEffects(transaction({ type: 'income', amountCents: 500, accountId: undefined }))).toEqual([]);
  });

  it('merges effects across groups and drops entries that net to zero', () => {
    const merged = mergeAccountEffects(
      [{ accountId: 'checking', deltaCents: 500 }],
      [{ accountId: 'checking', deltaCents: -500 }, { accountId: 'wallet', deltaCents: 200 }]
    );
    expect(merged).toEqual([{ accountId: 'wallet', deltaCents: 200 }]);
  });

  it('inverts every effect', () => {
    expect(invertAccountEffects([{ accountId: 'checking', deltaCents: 500 }])).toEqual([
      { accountId: 'checking', deltaCents: -500 }
    ]);
  });

  it('edit: changing the amount keeps the same account (delta = new - old)', () => {
    const previous = transaction({ type: 'expense', amountCents: 100, accountId: 'checking' });
    const next = transaction({ type: 'expense', amountCents: 150, accountId: 'checking' });
    const delta = mergeAccountEffects(invertAccountEffects(transactionAccountEffects(previous)), transactionAccountEffects(next));
    expect(delta).toEqual([{ accountId: 'checking', deltaCents: -50 }]);
  });

  it('edit: changing the account moves the full effect between the two', () => {
    const previous = transaction({ type: 'expense', amountCents: 100, accountId: 'checking' });
    const next = transaction({ type: 'expense', amountCents: 100, accountId: 'wallet' });
    const delta = mergeAccountEffects(invertAccountEffects(transactionAccountEffects(previous)), transactionAccountEffects(next));
    expect(delta).toEqual(
      expect.arrayContaining([
        { accountId: 'checking', deltaCents: 100 },
        { accountId: 'wallet', deltaCents: -100 }
      ])
    );
  });

  it('edit: changing the type (expense -> income) doubles the effect on the same account', () => {
    const previous = transaction({ type: 'expense', amountCents: 100, accountId: 'checking' });
    const next = transaction({ type: 'income', amountCents: 100, accountId: 'checking' });
    const delta = mergeAccountEffects(invertAccountEffects(transactionAccountEffects(previous)), transactionAccountEffects(next));
    expect(delta).toEqual([{ accountId: 'checking', deltaCents: 200 }]);
  });

  it('edit: flipping the sides of a transfer reverts both accounts and reapplies inverted', () => {
    const previous = transaction({ type: 'transfer', amountCents: 100, accountId: 'checking', destinationAccountId: 'wallet' });
    const next = transaction({ type: 'transfer', amountCents: 100, accountId: 'wallet', destinationAccountId: 'checking' });
    const delta = mergeAccountEffects(invertAccountEffects(transactionAccountEffects(previous)), transactionAccountEffects(next));
    expect(delta).toEqual(
      expect.arrayContaining([
        { accountId: 'checking', deltaCents: 200 },
        { accountId: 'wallet', deltaCents: -200 }
      ])
    );
  });

  it('delete: reverting each type undoes exactly its own effect', () => {
    const expense = transaction({ type: 'expense', amountCents: 100, accountId: 'checking' });
    expect(invertAccountEffects(transactionAccountEffects(expense))).toEqual([{ accountId: 'checking', deltaCents: 100 }]);

    const transfer = transaction({ type: 'transfer', amountCents: 100, accountId: 'checking', destinationAccountId: 'wallet' });
    expect(invertAccountEffects(transactionAccountEffects(transfer))).toEqual(
      expect.arrayContaining([
        { accountId: 'checking', deltaCents: 100 },
        { accountId: 'wallet', deltaCents: -100 }
      ])
    );
  });
});

describe('currentAccountBalances / currentTotalBalance', () => {
  it('uses currentBalanceCents when present', () => {
    const balances = currentAccountBalances([account('checking', 1000, { currentBalanceCents: 4200 })]);
    expect(balances[0].balanceCents).toBe(4200);
  });

  it('falls back to openingBalanceCents when currentBalanceCents is absent (pre-backfill)', () => {
    const balances = currentAccountBalances([account('checking', 1000)]);
    expect(balances[0].balanceCents).toBe(1000);
  });

  it('sums across accounts', () => {
    const total = currentTotalBalance([
      account('checking', 0, { currentBalanceCents: 1000 }),
      account('wallet', 0, { currentBalanceCents: 500 })
    ]);
    expect(total).toBe(1500);
  });
});

describe('buildUpcomingCommitments', () => {
  it('includes pending and overdue bills, excludes paid/cancelled', () => {
    const commitments = buildUpcomingCommitments(
      [
        bill({ id: 'b-pending', status: 'pending' }),
        bill({ id: 'b-overdue', status: 'overdue' }),
        bill({ id: 'b-paid', status: 'paid' }),
        bill({ id: 'b-cancelled', status: 'cancelled' })
      ],
      []
    );

    expect(commitments.map((c) => c.id).sort()).toEqual(['b-overdue', 'b-pending']);
  });

  // Sem corte por data: uma conta que vence daqui a meses conta do mesmo jeito — é
  // dívida já assumida. O antigo "cutoff" foi removido.
  it('includes bills regardless of how far the due date is', () => {
    const commitments = buildUpcomingCommitments(
      [bill({ id: 'b-far', dueDate: Timestamp.fromDate(new Date('2026-12-01T12:00:00')) })],
      []
    );

    expect(commitments.map((c) => c.id)).toEqual(['b-far']);
  });

  it('excludes inactive recurring rules and rules without a forecast amount', () => {
    const commitments = buildUpcomingCommitments(
      [],
      [
        recurring({ id: 'r-inactive', isActive: false }),
        recurring({ id: 'r-no-amount', amountCents: undefined })
      ]
    );

    expect(commitments).toHaveLength(0);
  });

  // Modelo novo (2026-07-27): TODA recorrência ativa conta como linha (cartão e conta),
  // pela `nextOccurrenceAt` crua — sem projeção pelo ciclo do cartão, sem exclusão. A
  // recorrência de cartão aparece no Comprometido ANTES de ser registrada; a duplicidade
  // com a fatura é desfeita descontando a cobrança da fatura, não excluindo a recorrência.
  it('counts every active recurring rule (card and account) as a line by its nextOccurrenceAt', () => {
    const commitments = buildUpcomingCommitments(
      [],
      [
        recurring({ id: 'r-card', amountCents: 12000, cardId: 'card-1', nextOccurrenceAt: Timestamp.fromDate(new Date('2026-08-01T12:00:00')) }),
        recurring({ id: 'r-account', amountCents: 8000, accountId: 'checking', nextOccurrenceAt: Timestamp.fromDate(new Date('2026-08-10T12:00:00')) })
      ]
    );

    expect(commitments.map((c) => ({ id: c.id, amountCents: c.amountCents, dueAt: c.dueAt }))).toEqual([
      { id: 'r-card', amountCents: 12000, dueAt: new Date('2026-08-01T12:00:00') },
      { id: 'r-account', amountCents: 8000, dueAt: new Date('2026-08-10T12:00:00') }
    ]);
  });

  it('includes every open/closed invoice with an outstanding balance, without a date cutoff', () => {
    const commitments = buildUpcomingCommitments(
      [],
      [],
      [
        invoice({ id: 'inv-closed-past', status: 'closed', referenceMonth: '2026-01', outstandingBalanceCents: 5000 }),
        invoice({ id: 'inv-open-future', status: 'open', referenceMonth: '2026-06', dueDate: Timestamp.fromDate(new Date('2026-12-05T12:00:00')), outstandingBalanceCents: 3000 })
      ]
    );

    expect(commitments.map((c) => c.id).sort()).toEqual(['inv-closed-past', 'inv-open-future']);
  });

  it('excludes paid, overpaid and zero-balance invoices', () => {
    const commitments = buildUpcomingCommitments(
      [],
      [],
      [
        invoice({ id: 'inv-paid', status: 'paid', referenceMonth: '2026-06', outstandingBalanceCents: 0 }),
        invoice({ id: 'inv-overpaid', status: 'overpaid', referenceMonth: '2026-06', outstandingBalanceCents: 0 }),
        invoice({ id: 'inv-zero', status: 'closed', referenceMonth: '2026-06', outstandingBalanceCents: 0 })
      ]
    );

    expect(commitments).toHaveLength(0);
  });

  // O coração do fix de duplicidade: a cobrança de uma recorrência registrada no cartão
  // (`card_purchase` com `recurringId`) é descontada do saldo devedor da fatura no
  // Comprometido — a recorrência já conta como linha própria.
  describe('desconto de cobranças de recorrência na fatura (anti-duplicidade)', () => {
    it('subtracts a recurring-sourced card charge from its invoice total', () => {
      const commitments = buildUpcomingCommitments(
        [],
        [recurring({ id: 'r-claude', amountCents: 12000, cardId: 'card-1', nextOccurrenceAt: Timestamp.fromDate(new Date('2026-08-15T12:00:00')) })],
        [invoice({ id: 'inv-1', status: 'open', outstandingBalanceCents: 20000 })],
        [card({ id: 'card-1' })],
        [transaction({ type: 'card_purchase', amountCents: 12000, recurringId: 'r-claude', invoiceId: 'inv-1' })]
      );

      const recurringLine = commitments.find((c) => c.id === 'r-claude');
      const invoiceLine = commitments.find((c) => c.id === 'inv-1');
      // A recorrência conta cheia (12000); a fatura conta só o que NÃO é recorrência
      // (20000 − 12000 = 8000). Total 20000 — a assinatura não é contada duas vezes.
      expect(recurringLine?.amountCents).toBe(12000);
      expect(invoiceLine?.amountCents).toBe(8000);
    });

    it('drops an invoice that was 100% recurring after the discount (nothing left to show)', () => {
      const commitments = buildUpcomingCommitments(
        [],
        [recurring({ id: 'r-claude', amountCents: 12000, cardId: 'card-1', nextOccurrenceAt: Timestamp.fromDate(new Date('2026-08-15T12:00:00')) })],
        [invoice({ id: 'inv-1', status: 'open', outstandingBalanceCents: 12000 })],
        [card({ id: 'card-1' })],
        [transaction({ type: 'card_purchase', amountCents: 12000, recurringId: 'r-claude', invoiceId: 'inv-1' })]
      );

      expect(commitments.map((c) => c.id)).toEqual(['r-claude']);
    });

    it('does not discount a one-off (non-recurring) card purchase from the invoice', () => {
      const commitments = buildUpcomingCommitments(
        [],
        [],
        [invoice({ id: 'inv-1', status: 'open', outstandingBalanceCents: 20000 })],
        [card({ id: 'card-1' })],
        [transaction({ type: 'card_purchase', amountCents: 5000, invoiceId: 'inv-1' })] // sem recurringId
      );

      expect(commitments.find((c) => c.id === 'inv-1')?.amountCents).toBe(20000);
    });

    it('ignores a deleted recurring charge (no discount)', () => {
      const commitments = buildUpcomingCommitments(
        [],
        [],
        [invoice({ id: 'inv-1', status: 'open', outstandingBalanceCents: 20000 })],
        [card({ id: 'card-1' })],
        [transaction({ type: 'card_purchase', amountCents: 12000, recurringId: 'r-claude', invoiceId: 'inv-1', deletedAt: Timestamp.fromDate(new Date('2026-08-01T12:00:00')) })]
      );

      expect(commitments.find((c) => c.id === 'inv-1')?.amountCents).toBe(20000);
    });
  });

  it('sorts bills, recurring rules and invoices together by due date', () => {
    const commitments = buildUpcomingCommitments(
      [bill({ id: 'b-1', dueDate: Timestamp.fromDate(new Date('2026-06-25T12:00:00')) })],
      [recurring({ id: 'r-1', nextOccurrenceAt: Timestamp.fromDate(new Date('2026-06-16T12:00:00')) })],
      [invoice({ id: 'inv-1', status: 'closed', referenceMonth: '2026-06', dueDate: Timestamp.fromDate(new Date('2026-06-20T12:00:00')), outstandingBalanceCents: 1000 })]
    );

    expect(commitments.map((c) => c.id)).toEqual(['r-1', 'inv-1', 'b-1']);
  });

  it('includes the card name in the invoice description when the card is known', () => {
    const commitments = buildUpcomingCommitments(
      [],
      [],
      [invoice({ id: 'inv-1', status: 'closed', referenceMonth: '2026-06', cardId: 'card-nubank' })],
      [card({ id: 'card-nubank', name: 'Nubank' })]
    );

    expect(commitments[0].description).toBe('Nubank');
  });

  it('falls back to the friendly reference month when the card is missing or not provided', () => {
    const commitments = buildUpcomingCommitments(
      [],
      [],
      [invoice({ id: 'inv-1', status: 'closed', referenceMonth: '2026-06', cardId: 'card-deleted' })],
      [card({ id: 'card-nubank', name: 'Nubank' })]
    );

    expect(commitments[0].description).toBe('Fatura jun 2026');
  });
});

// Regressão (2026-07-24): Disponível/Comprometido no Dashboard e na lista de Cartões somam
// invoice.outstandingBalanceCents, campo que só a Cloud Function atualiza — ela não roda
// offline. Em vez de calcular o valor certo (exigiria carregar o ledger, custo que essas
// telas evitam de propósito), um aviso honesto: "isso pode estar desatualizado".
describe('hasPendingCardLedgerActivity', () => {
  function localTxn(overrides: Partial<Transaction> & { localSyncStatus?: 'pending' | 'synced' }) {
    return { ...transaction(overrides), localSyncStatus: overrides.localSyncStatus ?? 'synced' };
  }

  it('detecta uma compra no cartão ainda não sincronizada', () => {
    const transactions = [localTxn({ type: 'card_purchase', localSyncStatus: 'pending' })];
    expect(hasPendingCardLedgerActivity(transactions)).toBe(true);
  });

  it('detecta um pagamento de fatura ainda não sincronizado', () => {
    const transactions = [localTxn({ type: 'card_payment', localSyncStatus: 'pending' })];
    expect(hasPendingCardLedgerActivity(transactions)).toBe(true);
  });

  it('não acusa nada quando tudo já sincronizou', () => {
    const transactions = [
      localTxn({ type: 'card_purchase', localSyncStatus: 'synced' }),
      localTxn({ type: 'card_payment', localSyncStatus: 'synced' })
    ];
    expect(hasPendingCardLedgerActivity(transactions)).toBe(false);
  });

  it('ignora transação pendente de outro tipo (não afeta fatura de cartão)', () => {
    const transactions = [localTxn({ type: 'expense', localSyncStatus: 'pending' })];
    expect(hasPendingCardLedgerActivity(transactions)).toBe(false);
  });

  // Regressão: excluir uma compra (softDeleteTransaction) marca deletedAt via batch.update,
  // que fica pending do mesmo jeito até sincronizar — é esse update que dispara
  // reverseCardPurchaseOnDelete (a Cloud Function que estorna a compra na fatura). Sem
  // detectar isso, excluir uma compra offline deixaria o valor antigo (mais alto) sem aviso.
  it('detecta uma compra que acabou de ser excluída (deletedAt ainda não sincronizado)', () => {
    const transactions = [
      localTxn({ type: 'card_purchase', localSyncStatus: 'pending', deletedAt: Timestamp.fromDate(new Date('2026-06-14')) })
    ];
    expect(hasPendingCardLedgerActivity(transactions)).toBe(true);
  });

  it('ignora uma compra já excluída E já sincronizada (exclusão antiga, não é mais notícia)', () => {
    const transactions = [
      localTxn({ type: 'card_purchase', localSyncStatus: 'synced', deletedAt: Timestamp.fromDate(new Date('2026-06-14')) })
    ];
    expect(hasPendingCardLedgerActivity(transactions)).toBe(false);
  });

  it('lista vazia não acusa nada', () => {
    expect(hasPendingCardLedgerActivity([])).toBe(false);
  });
});

describe('calculateDashboardSummary', () => {
  it('sums committed from bills and recurring rules (no date cutoff)', () => {
    const summary = calculateDashboardSummary({
      accounts: [account('checking', 300000)],
      transactions: [],
      bills: [bill({ amountCents: 120000, dueDate: Timestamp.fromDate(new Date('2026-12-20T12:00:00')) })],
      recurringRules: [recurring({ amountCents: 10000, nextOccurrenceAt: Timestamp.fromDate(new Date('2026-06-18T12:00:00')) })]
    });

    expect(summary.committedCents).toBe(130000);
    expect(summary.totalBalanceCents).toBe(300000);
    expect(summary.upcomingCommitments).toHaveLength(2);
  });

  it('sums the committed total across ALL commitments, even beyond the 3 shown on the dashboard', () => {
    const bills = [1, 2, 3, 4, 5].map((n) =>
      bill({ id: `b-${n}`, amountCents: 1000 * n, dueDate: Timestamp.fromDate(new Date(`2026-06-${15 + n}T12:00:00`)) })
    );

    const summary = calculateDashboardSummary({
      accounts: [account('checking', 1000000)],
      transactions: [],
      bills,
      recurringRules: []
    });

    const expectedTotal = bills.reduce((sum, b) => sum + b.amountCents, 0);
    expect(summary.upcomingCommitments).toHaveLength(3);
    expect(summary.committedCents).toBe(expectedTotal);
  });

  it('includes invoices in the committed total when provided', () => {
    const summary = calculateDashboardSummary({
      accounts: [account('checking', 500000)],
      transactions: [],
      bills: [],
      recurringRules: [],
      invoices: [invoice({ status: 'closed', referenceMonth: '2026-06', outstandingBalanceCents: 45000 })]
    });

    expect(summary.committedCents).toBe(45000);
  });

  // O cenário-chave do dono: assinatura de cartão de R$120. Antes de registrar, conta
  // pela recorrência; depois de registrar (cobrança na fatura), a fatura é descontada —
  // o Comprometido continua R$120, sem pular pra R$240.
  it('keeps a card subscription at the same committed total before and after it is registered on the invoice', () => {
    const rule = recurring({ id: 'r-claude', amountCents: 12000, cardId: 'card-1', nextOccurrenceAt: Timestamp.fromDate(new Date('2026-08-15T12:00:00')) });
    const cards = [card({ id: 'card-1' })];

    const beforeRegister = calculateDashboardSummary({
      accounts: [account('checking', 100000)],
      transactions: [],
      bills: [],
      recurringRules: [rule],
      invoices: [invoice({ id: 'inv-1', status: 'open', outstandingBalanceCents: 0 })],
      cards
    });
    expect(beforeRegister.committedCents).toBe(12000);

    const afterRegister = calculateDashboardSummary({
      accounts: [account('checking', 100000)],
      // Registrar avança a ocorrência e cria a compra marcada na fatura.
      transactions: [transaction({ type: 'card_purchase', amountCents: 12000, recurringId: 'r-claude', invoiceId: 'inv-1' })],
      bills: [],
      recurringRules: [{ ...rule, nextOccurrenceAt: Timestamp.fromDate(new Date('2026-09-15T12:00:00')) }],
      invoices: [invoice({ id: 'inv-1', status: 'open', outstandingBalanceCents: 12000 })],
      cards
    });
    expect(afterRegister.committedCents).toBe(12000);
  });

  it('defaults committed invoices to zero when the invoices list is omitted', () => {
    const summary = calculateDashboardSummary({
      accounts: [account('checking', 500000)],
      transactions: [],
      bills: [],
      recurringRules: []
    });

    expect(summary.committedCents).toBe(0);
  });

  it('lists only the 5 most recent active transactions, most recent first', () => {
    const dates = ['2026-06-01', '2026-06-05', '2026-06-10', '2026-06-12', '2026-06-13', '2026-06-14'];
    const transactions = dates.map((d, i) =>
      transaction({ id: `tx-${i}`, date: Timestamp.fromDate(new Date(`${d}T12:00:00`)) })
    );

    const summary = calculateDashboardSummary({
      accounts: [account('checking', 100000)],
      transactions,
      bills: [],
      recurringRules: []
    });

    expect(summary.recentTransactions).toHaveLength(5);
    expect(summary.recentTransactions[0].id).toBe('tx-5');
    expect(summary.recentTransactions[4].id).toBe('tx-1');
  });
});

describe('buildUpcomingReceivables', () => {
  const now = new Date('2026-07-19T12:00:00');
  const day = (offset: number) => new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);

  function receivable(id: string, dueDate: Date, status: Receivable['status']): Receivable {
    return {
      id,
      workspaceId: 'workspaceA',
      description: id,
      amountCents: 1000,
      dueDate: Timestamp.fromDate(dueDate),
      status,
      createdBy: 'alice'
    };
  }

  it('mostra só pending/overdue com vencimento em ≤5 dias, ordenado por data', () => {
    const items = [
      receivable('soon', day(3), 'pending'), // ≤5d → entra
      receivable('today', day(0), 'pending'), // hoje → entra
      receivable('atrasado', day(-2), 'overdue'), // atrasado → entra
      receivable('far', day(10), 'pending'), // >5d → fora
      receivable('recebido', day(1), 'received'), // recebido → fora
      receivable('cancelado', day(1), 'cancelled') // cancelado → fora
    ];

    const result = buildUpcomingReceivables(items, now);

    expect(result.map((r) => r.id)).toEqual(['atrasado', 'today', 'soon']);
  });

  it('devolve vazio quando nada vence em ≤5 dias', () => {
    expect(buildUpcomingReceivables([receivable('far', day(20), 'pending')], now)).toEqual([]);
  });
});

describe('calculateNextMonthProjection', () => {
  it('devolve null quando o salário previsto ainda não foi configurado', () => {
    expect(
      calculateNextMonthProjection({
        transactions: [],
        bills: [],
        recurringRules: []
      })
    ).toBeNull();
  });

  it('devolve null quando o salário previsto é 0 (nunca conta como configurado)', () => {
    expect(
      calculateNextMonthProjection({
        projectedSalaryCents: 0,
        transactions: [],
        bills: [],
        recurringRules: []
      })
    ).toBeNull();
  });

  it('calcula sobra = salário previsto − comprometido', () => {
    const result = calculateNextMonthProjection({
      projectedSalaryCents: 500000,
      transactions: [],
      bills: [bill({ amountCents: 120000, dueDate: Timestamp.fromDate(new Date('2026-06-20T12:00:00')) })],
      recurringRules: [recurring({ amountCents: 10000, nextOccurrenceAt: Timestamp.fromDate(new Date('2026-06-18T12:00:00')) })]
    });

    expect(result).not.toBeNull();
    expect(result!.committedCents).toBe(130000);
    expect(result!.leftoverCents).toBe(370000);
  });

  it('sobra pode ser negativa (rombo previsto) — não esconde o número ruim', () => {
    const result = calculateNextMonthProjection({
      projectedSalaryCents: 50000,
      transactions: [],
      bills: [bill({ amountCents: 120000, dueDate: Timestamp.fromDate(new Date('2026-06-20T12:00:00')) })],
      recurringRules: []
    });

    expect(result!.leftoverCents).toBe(-70000);
  });

  // Usa o mesmo Comprometido do Dashboard (sem corte por data, com o desconto de
  // recorrência na fatura) — a compra de recorrência na fatura é descontada, não somada.
  it('usa o mesmo comprometido do dashboard: desconta a cobrança de recorrência da fatura', () => {
    const result = calculateNextMonthProjection({
      projectedSalaryCents: 500000,
      transactions: [transaction({ type: 'card_purchase', amountCents: 12000, recurringId: 'r-claude', invoiceId: 'inv-1' })],
      bills: [],
      recurringRules: [recurring({ id: 'r-claude', amountCents: 12000, cardId: 'card-1' })],
      invoices: [invoice({ id: 'inv-1', status: 'open', outstandingBalanceCents: 12000 })],
      cards: [card({ id: 'card-1' })]
    });

    // Recorrência conta 12000; fatura 12000 − 12000 = 0. Total 12000, não 24000.
    expect(result!.committedCents).toBe(12000);
    expect(result!.leftoverCents).toBe(488000);
  });

  it('por padrão ignora totalBalanceCents (includeCurrentBalance ausente/false) — isolado do saldo real', () => {
    const result = calculateNextMonthProjection({
      projectedSalaryCents: 500000,
      totalBalanceCents: 999999999, // presente, mas deve ser ignorado sem includeCurrentBalance
      transactions: [],
      bills: [],
      recurringRules: []
    });

    expect(result).toEqual({ committedCents: 0, leftoverCents: 500000 });
  });

  it('soma o saldo total atual na sobra quando includeCurrentBalance está ligado', () => {
    const result = calculateNextMonthProjection({
      projectedSalaryCents: 500000,
      includeCurrentBalance: true,
      totalBalanceCents: 200000,
      transactions: [],
      bills: [bill({ amountCents: 120000, dueDate: Timestamp.fromDate(new Date('2026-06-20T12:00:00')) })],
      recurringRules: []
    });

    // 500000 (salário) + 200000 (saldo) - 120000 (comprometido) = 580000
    expect(result!.leftoverCents).toBe(580000);
  });

  it('includeCurrentBalance ligado sem totalBalanceCents informado soma zero (nunca quebra)', () => {
    const result = calculateNextMonthProjection({
      projectedSalaryCents: 500000,
      includeCurrentBalance: true,
      transactions: [],
      bills: [],
      recurringRules: []
    });

    expect(result!.leftoverCents).toBe(500000);
  });
});
