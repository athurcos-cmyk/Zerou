import { describe, expect, it } from 'vitest';
import { THEME_DEFINITIONS } from './theme.registry';
import { DEFAULT_APPEARANCE, resolveThemeId } from './theme.storage';

describe('Granix theme system', () => {
  it('registers all six official themes', () => {
    expect(THEME_DEFINITIONS.map((theme) => theme.id)).toEqual([
      'paper',
      'sakura',
      'obsidian',
      'midnight',
      'aurora',
      'rose-gold'
    ]);
  });

  it('resolves system mode to Paper for light and Obsidian for dark', () => {
    expect(resolveThemeId('system', 'aurora', false)).toBe('paper');
    expect(resolveThemeId('system', 'aurora', true)).toBe('obsidian');
  });

  it('keeps manual theme selection independent from system preference', () => {
    expect(resolveThemeId('manual', 'rose-gold', false)).toBe('rose-gold');
    expect(resolveThemeId('manual', 'rose-gold', true)).toBe('rose-gold');
  });

  it('defaults to the light Paper theme for first render persistence', () => {
    expect(DEFAULT_APPEARANCE.themeMode).toBe('manual');
    expect(DEFAULT_APPEARANCE.themeId).toBe('paper');
  });
});
