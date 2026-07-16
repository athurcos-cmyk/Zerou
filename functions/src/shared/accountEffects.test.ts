import { describe, expect, it } from 'vitest';
import { invertAccountEffects, mergeAccountEffects, transactionAccountEffects } from './accountEffects.js';

describe('transactionAccountEffects', () => {
  it('returns the effect for each transaction type', () => {
    expect(transactionAccountEffects({ type: 'income', amountCents: 500, accountId: 'checking' }))
      .toEqual([{ accountId: 'checking', deltaCents: 500 }]);
    expect(transactionAccountEffects({ type: 'refund', amountCents: 500, accountId: 'checking' }))
      .toEqual([{ accountId: 'checking', deltaCents: 500 }]);
    expect(transactionAccountEffects({ type: 'reimbursement', amountCents: 500, accountId: 'checking' }))
      .toEqual([{ accountId: 'checking', deltaCents: 500 }]);
    expect(transactionAccountEffects({ type: 'expense', amountCents: 500, accountId: 'checking' }))
      .toEqual([{ accountId: 'checking', deltaCents: -500 }]);
    expect(transactionAccountEffects({ type: 'card_payment', amountCents: 500, accountId: 'checking' }))
      .toEqual([{ accountId: 'checking', deltaCents: -500 }]);
    expect(transactionAccountEffects({ type: 'adjustment', amountCents: -300, accountId: 'checking' }))
      .toEqual([{ accountId: 'checking', deltaCents: -300 }]);
    expect(transactionAccountEffects({ type: 'card_purchase', amountCents: 500 })).toEqual([]);
  });

  it('returns both sides for a transfer', () => {
    expect(
      transactionAccountEffects({ type: 'transfer', amountCents: 500, accountId: 'checking', destinationAccountId: 'wallet' })
    ).toEqual([
      { accountId: 'checking', deltaCents: -500 },
      { accountId: 'wallet', deltaCents: 500 }
    ]);
  });

  it('returns nothing for a deleted transaction', () => {
    expect(
      transactionAccountEffects({ type: 'income', amountCents: 500, accountId: 'checking', deletedAt: new Date() })
    ).toEqual([]);
  });

  it('returns nothing when there is no accountId', () => {
    expect(transactionAccountEffects({ type: 'income', amountCents: 500 })).toEqual([]);
  });
});

describe('mergeAccountEffects / invertAccountEffects', () => {
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
});
