import { describe, expect, it } from 'vitest';
import { safeReturnUrl } from './urlSafety.js';

describe('safeReturnUrl', () => {
  const baseUrl = 'https://zerou-five.vercel.app';

  it('accepts URLs from the configured Zerou origin', () => {
    expect(safeReturnUrl('https://zerou-five.vercel.app/app/settings/billing', baseUrl, '/app/settings/billing')).toBe(
      'https://zerou-five.vercel.app/app/settings/billing'
    );
  });

  it('rejects external return URLs', () => {
    expect(() => safeReturnUrl('https://example.com/steal', baseUrl, '/app/settings/billing')).toThrow();
  });

  it('uses a safe fallback when no URL is provided', () => {
    expect(safeReturnUrl(undefined, baseUrl, '/app/settings/billing')).toBe('https://zerou-five.vercel.app/app/settings/billing');
  });
});
