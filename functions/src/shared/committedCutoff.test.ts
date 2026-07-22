import { describe, expect, it } from 'vitest';
import { findNextIncomeDate, nextPaydayFrom, resolveCommittedCutoff } from './committedCutoff.js';

const now = new Date('2026-07-15T12:00:00');

describe('findNextIncomeDate', () => {
  it('returns the earliest future income date', () => {
    const next = findNextIncomeDate(
      [
        { type: 'income', date: new Date('2026-07-25') },
        { type: 'income', date: new Date('2026-07-20') },
        { type: 'expense', date: new Date('2026-07-16') }
      ],
      now
    );
    expect(next).toEqual(new Date('2026-07-20'));
  });

  it('ignores income dated today or in the past', () => {
    expect(findNextIncomeDate([{ type: 'income', date: new Date('2026-07-15T08:00:00') }], now)).toBeNull();
    expect(findNextIncomeDate([{ type: 'income', date: new Date('2026-07-10') }], now)).toBeNull();
  });

  it('ignores deleted transactions and goal/piggybank withdrawals', () => {
    expect(
      findNextIncomeDate(
        [
          { type: 'income', date: new Date('2026-07-20'), deletedAt: new Date() },
          { type: 'income', date: new Date('2026-07-21'), tags: ['meta'] },
          { type: 'income', date: new Date('2026-07-22'), tags: ['cofrinho'] }
        ],
        now
      )
    ).toBeNull();
  });

  it('returns null when there is no future income', () => {
    expect(findNextIncomeDate([], now)).toBeNull();
  });
});

describe('nextPaydayFrom', () => {
  it('resolves a fixed day payday', () => {
    expect(nextPaydayFrom({ type: 'fixed_day', day: 25 }, now)).toEqual(new Date(2026, 6, 25));
  });

  it('rolls over to next month when the fixed day already passed', () => {
    expect(nextPaydayFrom({ type: 'fixed_day', day: 5 }, now)).toEqual(new Date(2026, 7, 5));
  });

  it('resolves end of month', () => {
    expect(nextPaydayFrom({ type: 'end_of_month' }, now)).toEqual(new Date(2026, 6, 31));
  });
});

describe('resolveCommittedCutoff', () => {
  it('conservative mode uses a fixed window, ignoring income and payday', () => {
    const result = resolveCommittedCutoff({
      transactions: [{ type: 'income', date: new Date('2026-07-16') }],
      payday: { type: 'fixed_day', day: 20 },
      availableMode: 'conservative',
      committedWindowDays: 10,
      now
    });
    expect(result.source).toBe('window');
    expect(result.cutoff.getTime()).toBeGreaterThan(new Date('2026-07-25').getTime());
  });

  it('until_payday prefers a future lançada income date over payday', () => {
    const result = resolveCommittedCutoff({
      transactions: [{ type: 'income', date: new Date(2026, 7, 1) }],
      payday: { type: 'fixed_day', day: 20 },
      availableMode: 'until_payday',
      now
    });
    expect(result.source).toBe('income');
    expect(result.cutoff.getDate()).toBe(1);
  });

  it('until_payday falls back to the profile payday when there is no future income', () => {
    const result = resolveCommittedCutoff({
      transactions: [],
      payday: { type: 'fixed_day', day: 25 },
      availableMode: 'until_payday',
      now
    });
    expect(result.source).toBe('payday');
    expect(result.cutoff.getDate()).toBe(25);
  });

  it('until_payday falls back to the window when income is variable or unset', () => {
    const variable = resolveCommittedCutoff({
      transactions: [],
      payday: { type: 'variable_income' },
      availableMode: 'until_payday',
      committedWindowDays: 15,
      now
    });
    expect(variable.source).toBe('window');

    const unset = resolveCommittedCutoff({ transactions: [], availableMode: 'until_payday', now });
    expect(unset.source).toBe('window');
  });

  it('never returns a null cutoff, even in conservative mode', () => {
    const result = resolveCommittedCutoff({ transactions: [], availableMode: 'conservative', now });
    expect(result.cutoff).toBeInstanceOf(Date);
  });
});
