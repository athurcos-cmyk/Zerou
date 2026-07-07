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

  it('ignores proposed and rejected/cancelled settlements when computing balances', () => {
    expect(
      calculateSharedBalances([claim()], [settlement({ status: 'proposed', paidAmountCents: 0 })])
    ).toEqual([
      { userId: 'alice', balanceCents: 5000 },
      { userId: 'bob', balanceCents: -5000 }
    ]);
  });

  it('nets out several claims paid by different people between the same two members', () => {
    const claims = [
      claim({ id: 'c-1', clientMutationId: 'c-1', payerUserId: 'alice', totalAmountCents: 10000, split: [
        { userId: 'alice', amountCents: 5000 },
        { userId: 'bob', amountCents: 5000 }
      ] }),
      claim({ id: 'c-2', clientMutationId: 'c-2', payerUserId: 'bob', totalAmountCents: 6000, split: [
        { userId: 'alice', amountCents: 3000 },
        { userId: 'bob', amountCents: 3000 }
      ] })
    ];

    // Alice pagou 5000 que era do Bob; Bob pagou 3000 que era da Alice → líquido: Bob deve 2000 pra Alice.
    expect(calculateSharedBalances(claims, [])).toEqual([
      { userId: 'alice', balanceCents: 2000 },
      { userId: 'bob', balanceCents: -2000 }
    ]);
  });

  it('handles a claim where the payer covers 100% of someone else\'s share', () => {
    const soloClaim = claim({ split: [{ userId: 'bob', amountCents: 10000 }] });

    expect(calculateSharedBalances([soloClaim], [])).toEqual([
      { userId: 'alice', balanceCents: 10000 },
      { userId: 'bob', balanceCents: -10000 }
    ]);
  });

  it('caps a settlement credit at the settlement amount even if paidAmountCents overshoots', () => {
    // paidAmountCents nunca deveria exceder amountCents, mas a lógica não deve
    // criar crédito além do combinado caso isso aconteça (dado corrompido/race).
    expect(
      calculateSharedBalances([claim()], [settlement({ status: 'settled', amountCents: 5000, paidAmountCents: 999999 })])
    ).toEqual([
      { userId: 'alice', balanceCents: 0 },
      { userId: 'bob', balanceCents: 0 }
    ]);
  });

  it('returns no settlement suggestion once balances are perfectly even', () => {
    expect(suggestSettlement([claim()], [settlement({ status: 'settled', paidAmountCents: 5000 })])).toBeNull();
  });

  it('returns no settlement suggestion when there are no claims or settlements at all', () => {
    expect(suggestSettlement([], [])).toBeNull();
  });

  it('does not blow up with more than two members and still finds the extreme creditor/debtor', () => {
    const claims = [
      claim({ id: 'c-1', payerUserId: 'alice', split: [
        { userId: 'alice', amountCents: 5000 },
        { userId: 'bob', amountCents: 3000 },
        { userId: 'carol', amountCents: 2000 }
      ], totalAmountCents: 10000 })
    ];

    const balances = calculateSharedBalances(claims, []);
    expect(balances).toEqual([
      { userId: 'alice', balanceCents: 5000 },
      { userId: 'bob', balanceCents: -3000 },
      { userId: 'carol', balanceCents: -2000 }
    ]);
    expect(suggestSettlement(claims, [])).toEqual({ fromUserId: 'bob', toUserId: 'alice', amountCents: 3000 });
  });
});
