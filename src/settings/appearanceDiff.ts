import type { AppearancePreferences } from '../theme/theme.types';
import type { UserProfile } from '../types/contracts';

export function hasAppearanceChanged(profile: UserProfile, preferences: AppearancePreferences) {
  return (
    profile.themeMode !== preferences.themeMode
    || profile.themeId !== preferences.themeId
    || profile.density !== preferences.density
    || profile.fontScale !== preferences.fontScale
    || profile.reduceMotion !== preferences.reduceMotion
  );
}
