import { describe, expect, it } from 'vitest';
import { nextOccurrenceDate } from './financeService';

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

describe('nextOccurrenceDate', () => {
  it('advances a weekly rule by exactly 7 days, even across a month boundary', () => {
    expect(iso(nextOccurrenceDate(new Date(2025, 11, 25, 12), 'weekly'))).toBe('2026-01-01');
  });

  it('advances a monthly rule to the same day next month in the common case', () => {
    expect(iso(nextOccurrenceDate(new Date(2026, 0, 15, 12), 'monthly'))).toBe('2026-02-15');
  });

  it('advances a yearly rule to the same day next year in the common case', () => {
    expect(iso(nextOccurrenceDate(new Date(2026, 5, 14, 12), 'yearly'))).toBe('2027-06-14');
  });

  it('rolls a monthly rule anchored on day 31 into December → January without skipping a month', () => {
    expect(iso(nextOccurrenceDate(new Date(2026, 11, 31, 12), 'monthly'))).toBe('2027-01-31');
  });

  it('FIXED: a monthly rule anchored on day 31 clamps to Feb 28 instead of skipping to March', () => {
    // Fevereiro não tem dia 31 — em vez de transbordar pra março (bug antigo:
    // pulava fevereiro inteiro e caía em 3/mar), agora clampa no último dia
    // válido do mês alvo (28/fev).
    expect(iso(nextOccurrenceDate(new Date(2026, 0, 31, 12), 'monthly'))).toBe('2026-02-28');
  });

  it('FIXED: a yearly rule anchored on Feb 29 (leap year) clamps to Feb 28 on non-leap years', () => {
    // 2024 é bissexto (29/fev existe); 2025 não é — agora clampa em 28/fev em
    // vez de transbordar pra 1/mar.
    expect(iso(nextOccurrenceDate(new Date(2024, 1, 29, 12), 'yearly'))).toBe('2025-02-28');
  });

  it('handles a monthly rule anchored on day 30 clamping into February', () => {
    // Fevereiro (não bissexto) tem 28 dias: dia 30 clampa em 28, não transborda pra março.
    expect(iso(nextOccurrenceDate(new Date(2026, 0, 30, 12), 'monthly'))).toBe('2026-02-28');
  });

  it('preserves the time of day across the rollover', () => {
    const next = nextOccurrenceDate(new Date(2026, 0, 15, 9, 30, 0), 'monthly');
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(30);
  });

  describe('without an anchorDay (legacy rules created before this field existed)', () => {
    it('loses the original day permanently once clamped — the previous, more limited fix', () => {
      // Sem anchorDay pra lembrar a intenção original, o dia usado é sempre o da
      // última ocorrência (que já pode estar clampado). Uma vez em fev/28, o mês
      // seguinte parte do 28, não do 31 original.
      const first = nextOccurrenceDate(new Date(2026, 0, 31, 12), 'monthly');
      expect(iso(first)).toBe('2026-02-28');

      const second = nextOccurrenceDate(first, 'monthly');
      expect(iso(second)).toBe('2026-03-28');
    });
  });

  describe('with an anchorDay (rule created after this field was introduced)', () => {
    it('bounces back to day 31 as soon as a 31-day month comes around', () => {
      // Jan/31 (anchorDay=31) → clampa em fev/28 → mas março tem 31 dias, então
      // volta pro dia 31 original em vez de ficar preso no 28.
      const first = nextOccurrenceDate(new Date(2026, 0, 31, 12), 'monthly', 31);
      expect(iso(first)).toBe('2026-02-28');

      const second = nextOccurrenceDate(first, 'monthly', 31);
      expect(iso(second)).toBe('2026-03-31');

      const third = nextOccurrenceDate(second, 'monthly', 31);
      expect(iso(third)).toBe('2026-04-30');
    });

    it('bounces back to Feb 29 on the next leap year for a yearly rule', () => {
      const afterOneYear = nextOccurrenceDate(new Date(2024, 1, 29, 12), 'yearly', 29);
      expect(iso(afterOneYear)).toBe('2025-02-28');

      const afterTwoYears = nextOccurrenceDate(afterOneYear, 'yearly', 29);
      expect(iso(afterTwoYears)).toBe('2026-02-28');

      const afterFourYears = nextOccurrenceDate(
        nextOccurrenceDate(afterTwoYears, 'yearly', 29),
        'yearly',
        29
      );
      // 2028 é bissexto de novo — o anchorDay 29 volta a valer.
      expect(iso(afterFourYears)).toBe('2028-02-29');
    });
  });
});
