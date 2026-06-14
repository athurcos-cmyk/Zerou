import { create } from 'zustand';
import type { AppearancePreferences, Density, FontScale, ThemeId, ThemeMode } from './theme.types';
import { DEFAULT_APPEARANCE, persistAppearance, readStoredAppearance, resolveThemeId } from './theme.storage';

interface AppearanceState {
  preferences: AppearancePreferences;
  resolvedThemeId: ThemeId;
  hydrateFromProfile: (preferences: Partial<AppearancePreferences>) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
  setThemeId: (themeId: ThemeId) => void;
  setDensity: (density: Density) => void;
  setFontScale: (fontScale: FontScale) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
  refreshSystemTheme: (prefersDark: boolean) => void;
}

function getInitialResolvedTheme(preferences: AppearancePreferences) {
  const prefersDark =
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;

  return resolveThemeId(preferences.themeMode, preferences.themeId, prefersDark);
}

function updatePreferences(
  preferences: AppearancePreferences,
  patch: Partial<AppearancePreferences>,
  prefersDark?: boolean
) {
  const nextPreferences = { ...preferences, ...patch };
  const resolvedThemeId = resolveThemeId(
    nextPreferences.themeMode,
    nextPreferences.themeId,
    prefersDark ?? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );

  persistAppearance(nextPreferences);

  return { preferences: nextPreferences, resolvedThemeId };
}

const initialPreferences = readStoredAppearance();

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  preferences: initialPreferences,
  resolvedThemeId: getInitialResolvedTheme(initialPreferences),
  hydrateFromProfile: (preferences) => {
    set((state) => updatePreferences(state.preferences, { ...DEFAULT_APPEARANCE, ...preferences }));
  },
  setThemeMode: (themeMode) => {
    set((state) => updatePreferences(state.preferences, { themeMode }));
  },
  setThemeId: (themeId) => {
    set((state) => updatePreferences(state.preferences, { themeId, themeMode: 'manual' }));
  },
  setDensity: (density) => {
    set((state) => updatePreferences(state.preferences, { density }));
  },
  setFontScale: (fontScale) => {
    set((state) => updatePreferences(state.preferences, { fontScale }));
  },
  setReduceMotion: (reduceMotion) => {
    set((state) => updatePreferences(state.preferences, { reduceMotion }));
  },
  refreshSystemTheme: (prefersDark) => {
    const { preferences } = get();
    set({
      preferences,
      resolvedThemeId: resolveThemeId(preferences.themeMode, preferences.themeId, prefersDark)
    });
  }
}));
