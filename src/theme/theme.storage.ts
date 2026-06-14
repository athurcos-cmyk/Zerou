import type { AppearancePreferences, ThemeId, ThemeMode } from './theme.types';
import { isThemeId } from './theme.registry';

const STORAGE_KEYS = {
  themeMode: 'zerou.themeMode',
  themeId: 'zerou.themeId',
  density: 'zerou.density',
  fontScale: 'zerou.fontScale',
  reduceMotion: 'zerou.reduceMotion'
} as const;

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  themeMode: 'system',
  themeId: 'paper',
  density: 'comfortable',
  fontScale: 'md',
  reduceMotion: false
};

function canUseStorage() {
  return typeof window !== 'undefined' && 'localStorage' in window;
}

function readThemeMode(value: string | null): ThemeMode {
  return value === 'manual' || value === 'system' ? value : DEFAULT_APPEARANCE.themeMode;
}

function readThemeId(value: string | null): ThemeId {
  return isThemeId(value) ? value : DEFAULT_APPEARANCE.themeId;
}

export function readStoredAppearance(): AppearancePreferences {
  if (!canUseStorage()) {
    return DEFAULT_APPEARANCE;
  }

  return {
    themeMode: readThemeMode(window.localStorage.getItem(STORAGE_KEYS.themeMode)),
    themeId: readThemeId(window.localStorage.getItem(STORAGE_KEYS.themeId)),
    density:
      window.localStorage.getItem(STORAGE_KEYS.density) === 'compact' ? 'compact' : DEFAULT_APPEARANCE.density,
    fontScale:
      window.localStorage.getItem(STORAGE_KEYS.fontScale) === 'sm' ||
      window.localStorage.getItem(STORAGE_KEYS.fontScale) === 'lg'
        ? (window.localStorage.getItem(STORAGE_KEYS.fontScale) as AppearancePreferences['fontScale'])
        : DEFAULT_APPEARANCE.fontScale,
    reduceMotion: window.localStorage.getItem(STORAGE_KEYS.reduceMotion) === 'true'
  };
}

export function persistAppearance(preferences: AppearancePreferences) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS.themeMode, preferences.themeMode);
  window.localStorage.setItem(STORAGE_KEYS.themeId, preferences.themeId);
  window.localStorage.setItem(STORAGE_KEYS.density, preferences.density);
  window.localStorage.setItem(STORAGE_KEYS.fontScale, preferences.fontScale);
  window.localStorage.setItem(STORAGE_KEYS.reduceMotion, String(preferences.reduceMotion));
}

export function resolveThemeId(themeMode: ThemeMode, themeId: ThemeId, prefersDark: boolean): ThemeId {
  if (themeMode === 'system') {
    return prefersDark ? 'obsidian' : 'paper';
  }

  return themeId;
}
