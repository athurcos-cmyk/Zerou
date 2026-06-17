import { describe, expect, it } from 'vitest';
import { hasAppearanceChanged } from './appearanceDiff';
import type { AppearancePreferences } from '../theme/theme.types';
import type { UserProfile } from '../types/contracts';

const preferences: AppearancePreferences = {
  themeMode: 'system',
  themeId: 'paper',
  density: 'comfortable',
  fontScale: 'md',
  reduceMotion: false
};

const profile: UserProfile = {
  id: 'user-1',
  name: 'User One',
  email: 'user@example.com',
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  ...preferences
};

describe('hasAppearanceChanged', () => {
  it('does not request a Firestore sync when profile appearance already matches local preferences', () => {
    expect(hasAppearanceChanged(profile, preferences)).toBe(false);
  });

  it('requests a Firestore sync when local preferences changed', () => {
    expect(hasAppearanceChanged(profile, { ...preferences, density: 'compact' })).toBe(true);
  });
});
