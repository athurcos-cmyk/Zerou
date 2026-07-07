import { describe, expect, it } from 'vitest';
import { formatCount } from './adminFormat';

describe('formatCount', () => {
  it('shows the exact count when below the cap', () => {
    expect(formatCount(42, 500)).toBe('42');
  });

  it('shows zero as a plain "0", not "0+"', () => {
    expect(formatCount(0, 500)).toBe('0');
  });

  it('appends a "+" when the count reaches the cap exactly (result may be truncated)', () => {
    expect(formatCount(500, 500)).toBe('500+');
  });

  it('appends a "+" when the count is somehow above the cap', () => {
    expect(formatCount(501, 500)).toBe('501+');
  });
});
