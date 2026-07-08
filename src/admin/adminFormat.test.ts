import { describe, expect, it } from 'vitest';
import { formatCount } from './adminFormat';

describe('formatCount', () => {
  it('shows the exact count when there is no more to load', () => {
    expect(formatCount(42, false)).toBe('42');
  });

  it('shows zero as a plain "0", not "0+"', () => {
    expect(formatCount(0, false)).toBe('0');
  });

  it('appends a "+" when another page is still available', () => {
    expect(formatCount(100, true)).toBe('100+');
  });
});
