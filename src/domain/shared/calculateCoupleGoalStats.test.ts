import { describe, expect, it } from 'vitest';
import { calculateCoupleGoalStats } from './calculateCoupleGoalStats';
import type { Goal, GoalContribution } from '../../types/contracts';

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-a',
    workspaceId: 'couple-a',
    name: 'Viagem',
    kind: 'save',
    targetCents: 100000,
    savedCents: 0,
    isActive: true,
    ...overrides
  };
}

function contribution(overrides: Partial<GoalContribution> = {}): GoalContribution {
  return {
    id: `contrib-${Math.random()}`,
    workspaceId: 'couple-a',
    goalId: 'goal-a',
    userId: 'alice',
    amountCents: 1000,
    type: 'deposit',
    monthKey: '2026-07',
    ...overrides
  };
}

describe('calculateCoupleGoalStats', () => {
  it('reports the total straight from goal.savedCents, not by summing contributions', () => {
    const stats = calculateCoupleGoalStats(
      [goal({ savedCents: 50000 })],
      [contribution({ amountCents: 1000 })], // deliberately does not add up to 50000
      '2026-07'
    );

    expect(stats[0].totalCents).toBe(50000);
  });

  it('breaks the total down by user across several deposits', () => {
    const stats = calculateCoupleGoalStats(
      [goal({ savedCents: 30000 })],
      [
        contribution({ userId: 'alice', amountCents: 10000 }),
        contribution({ userId: 'bob', amountCents: 20000 })
      ],
      '2026-07'
    );

    expect(stats[0].byUser).toEqual({ alice: 10000, bob: 20000 });
  });

  it('subtracts withdrawals from the user who made them', () => {
    const stats = calculateCoupleGoalStats(
      [goal({ savedCents: 5000 })],
      [
        contribution({ userId: 'alice', amountCents: 10000, type: 'deposit' }),
        contribution({ userId: 'alice', amountCents: 5000, type: 'withdrawal' })
      ],
      '2026-07'
    );

    expect(stats[0].byUser).toEqual({ alice: 5000 });
  });

  it('nets deposit and withdrawal from different users independently', () => {
    const stats = calculateCoupleGoalStats(
      [goal({ savedCents: 8000 })],
      [
        contribution({ userId: 'alice', amountCents: 10000, type: 'deposit' }),
        contribution({ userId: 'bob', amountCents: 2000, type: 'withdrawal' })
      ],
      '2026-07'
    );

    expect(stats[0].byUser).toEqual({ alice: 10000, bob: -2000 });
  });

  it('treats a legacy contribution without a type field as a deposit', () => {
    const legacy = contribution({ userId: 'alice', amountCents: 4000 });
    delete (legacy as Partial<GoalContribution>).type;

    const stats = calculateCoupleGoalStats([goal({ savedCents: 4000 })], [legacy], '2026-07');

    expect(stats[0].byUser).toEqual({ alice: 4000 });
  });

  it('only counts contributions from the current month towards thisMonthCents', () => {
    const stats = calculateCoupleGoalStats(
      [goal({ savedCents: 15000 })],
      [
        contribution({ amountCents: 10000, monthKey: '2026-06' }),
        contribution({ amountCents: 5000, monthKey: '2026-07' })
      ],
      '2026-07'
    );

    expect(stats[0].thisMonthCents).toBe(5000);
  });

  it('subtracts a same-month withdrawal from thisMonthCents', () => {
    const stats = calculateCoupleGoalStats(
      [goal({ savedCents: 3000 })],
      [
        contribution({ amountCents: 10000, monthKey: '2026-07', type: 'deposit' }),
        contribution({ amountCents: 7000, monthKey: '2026-07', type: 'withdrawal' })
      ],
      '2026-07'
    );

    expect(stats[0].thisMonthCents).toBe(3000);
  });

  it('keeps contributions scoped to their own goal when there are several cofrinhos', () => {
    const stats = calculateCoupleGoalStats(
      [goal({ id: 'goal-trip', savedCents: 1000 }), goal({ id: 'goal-house', savedCents: 2000 })],
      [
        contribution({ goalId: 'goal-trip', amountCents: 1000 }),
        contribution({ goalId: 'goal-house', amountCents: 2000 })
      ],
      '2026-07'
    );

    const trip = stats.find((s) => s.goal.id === 'goal-trip')!;
    const house = stats.find((s) => s.goal.id === 'goal-house')!;
    expect(trip.byUser).toEqual({ alice: 1000 });
    expect(house.byUser).toEqual({ alice: 2000 });
  });

  it('computes percent as 0 when there is no target', () => {
    const stats = calculateCoupleGoalStats([goal({ targetCents: 0, savedCents: 5000 })], [], '2026-07');
    expect(stats[0].percent).toBe(0);
  });

  it('caps percent at 100 when saved exceeds the target', () => {
    const stats = calculateCoupleGoalStats([goal({ targetCents: 10000, savedCents: 25000 })], [], '2026-07');
    expect(stats[0].percent).toBe(100);
  });

  it('rounds percent to the nearest integer in the common case', () => {
    const stats = calculateCoupleGoalStats([goal({ targetCents: 30000, savedCents: 10000 })], [], '2026-07');
    expect(stats[0].percent).toBe(33);
  });

  it('returns an empty byUser and zero thisMonthCents for a goal with no contributions yet', () => {
    const stats = calculateCoupleGoalStats([goal({ savedCents: 0 })], [], '2026-07');
    expect(stats[0].byUser).toEqual({});
    expect(stats[0].thisMonthCents).toBe(0);
  });
});
