import { describe, expect, it } from 'vitest';
import { nextPaydayFrom } from './payday';

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

describe('nextPaydayFrom', () => {
  it('fixed_day: returns this month when the day has not passed yet', () => {
    const next = nextPaydayFrom({ type: 'fixed_day', day: 25 }, new Date(2026, 6, 9));
    expect(iso(next)).toBe('2026-07-25');
  });

  it('fixed_day: counts today as the payday if it matches exactly', () => {
    const next = nextPaydayFrom({ type: 'fixed_day', day: 9 }, new Date(2026, 6, 9));
    expect(iso(next)).toBe('2026-07-09');
  });

  it('fixed_day: rolls to next month when the day already passed', () => {
    const next = nextPaydayFrom({ type: 'fixed_day', day: 5 }, new Date(2026, 6, 9));
    expect(iso(next)).toBe('2026-08-05');
  });

  it('fixed_day: clamps to the last day of a short month (31 -> Feb 28)', () => {
    const next = nextPaydayFrom({ type: 'fixed_day', day: 31 }, new Date(2026, 1, 1));
    expect(iso(next)).toBe('2026-02-28');
  });

  it('end_of_month: returns the last day of the current month', () => {
    const next = nextPaydayFrom({ type: 'end_of_month' }, new Date(2026, 6, 9));
    expect(iso(next)).toBe('2026-07-31');
  });

  it('end_of_month: rolls to the following month once the last day has passed', () => {
    const next = nextPaydayFrom({ type: 'end_of_month' }, new Date(2026, 6, 31));
    // Hoje já é o último dia (31) — ainda conta como o pagamento de hoje.
    expect(iso(next)).toBe('2026-07-31');
    const dayAfter = nextPaydayFrom({ type: 'end_of_month' }, new Date(2026, 7, 1));
    expect(iso(dayAfter)).toBe('2026-08-31');
  });

  it('business_day: finds the 5th business day of the month, skipping weekends', () => {
    // Julho de 2026: dia 1 é uma quarta-feira. 1º dia útil = 1, ..., 5º dia útil = 7 (terça).
    const next = nextPaydayFrom({ type: 'business_day', day: 5 }, new Date(2026, 6, 1));
    expect(iso(next)).toBe('2026-07-07');
  });

  it('business_day: rolls to next month once the Nth business day already passed', () => {
    const next = nextPaydayFrom({ type: 'business_day', day: 5 }, new Date(2026, 6, 9));
    expect(iso(next)).toBe('2026-08-07');
  });
});
