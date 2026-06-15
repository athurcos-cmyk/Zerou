import { describe, expect, it } from 'vitest';
import { calculateSharedBalances, suggestSettlement } from './calculateSharedBalances';
import type { Settlement, SharedExpenseClaim } from '../../types/contracts';

function claim(overrides: Partial<SharedExpenseClaim> = {}): SharedExpenseClaim {
  return {
    id: 'claim-a',
    workspaceId: 'couple-a',
    payerUserId: 'alice',
    description: 'Mercado',
    totalAmountCents: 10000,
    split: [
      { userId: 'alice', amountCents: 5000 },
      { userId: 'bob', amountCents: 5000 }
    ],
    sourceVisibility: 'summary_only',
    status: 'accepted',
    createdBy: 'alice',
    clientMutationId: 'claim-a',
    version: 1,
    ...overrides
  };
}

function settlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    id: 'settlement-a',
    workspaceId: 'couple-a',
    fromUserId: 'bob',
    toUserId: 'alice',
    amountCents: 5000,
    paidAmountCents: 0,
    status: 'proposed',
    createdBy: 'bob',
    clientMutationId: 'settlement-a',
    version: 1,
    ...overrides
  };
}

describe('shared balance calculations', () => {
  it('uses accepted claims to compose member balances', () => {
    expect(calculateSharedBalances([claim()], [])).toEqual([
      { userId: 'alice', balanceCents: 5000 },
      { userId: 'bob', balanceCents: -5000 }
    ]);
  });

  it('ignores pending and disputed claims', () => {
    expect(calculateSharedBalances([claim({ status: 'pending' }), claim({ id: 'claim-b', status: 'disputed' })], [])).toEqual([
      { userId: 'alice', balanceCents: 0 },
      { userId: 'bob', balanceCents: 0 }
    ]);
  });

  it('reduces balance after partial settlement payment', () => {
    expect(calculateSharedBalances([claim()], [settlement({ status: 'partially_paid', paidAmountCents: 2000 })])).toEqual([
      { userId: 'alice', balanceCents: 3000 },
      { userId: 'bob', balanceCents: -3000 }
    ]);
  });

  it('settles the pending balance after full reimbursement', () => {
    expect(calculateSharedBalances([claim()], [settlement({ status: 'settled', paidAmountCents: 5000 })])).toEqual([
      { userId: 'alice', balanceCents: 0 },
      { userId: 'bob', balanceCents: 0 }
    ]);
  });

  it('does not duplicate claims or settlements retried with the same mutation id', () => {
    const claims = [claim({ id: 'claim-a' }), claim({ id: 'claim-retry', clientMutationId: 'claim-a' })];
    const settlements = [
      settlement({ id: 'settlement-a', status: 'partially_paid', paidAmountCents: 2500 }),
      settlement({ id: 'settlement-retry', clientMutationId: 'settlement-a', status: 'partially_paid', paidAmountCents: 2500 })
    ];

    expect(calculateSharedBalances(claims, settlements)).toEqual([
      { userId: 'alice', balanceCents: 2500 },
      { userId: 'bob', balanceCents: -2500 }
    ]);
  });

  it('suggests the minimal settlement from debtor to creditor', () => {
    expect(suggestSettlement([claim()], [])).toEqual({
      fromUserId: 'bob',
      toUserId: 'alice',
      amountCents: 5000
    });
  });
});
