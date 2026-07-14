import { describe, expect, it } from 'vitest';
import { THEME_DEFINITIONS } from './theme.registry';
import { DEFAULT_APPEARANCE, resolveThemeId } from './theme.storage';

describe('Granativa theme system', () => {
  it('registers all twelve official themes', () => {
    expect(THEME_DEFINITIONS.map((theme) => theme.id)).toEqual([
      'paper',
      'perola',
      'floresta',
      'lavanda',
      'rosa',
      'areia',
      'noturno',
      'carbono',
      'cobalto',
      'ametista',
      'grafite',
      'vinho'
    ]);
  });

  it('resolves system mode to Paper for light and Noturno for dark', () => {
    expect(resolveThemeId('system', 'lavanda', false)).toBe('paper');
    expect(resolveThemeId('system', 'lavanda', true)).toBe('noturno');
  });

  it('keeps manual theme selection independent from system preference', () => {
    expect(resolveThemeId('manual', 'carbono', false)).toBe('carbono');
    expect(resolveThemeId('manual', 'carbono', true)).toBe('carbono');
  });

  it('defaults to the light Paper theme for first render persistence', () => {
    expect(DEFAULT_APPEARANCE.themeMode).toBe('manual');
    expect(DEFAULT_APPEARANCE.themeId).toBe('paper');
  });
});
