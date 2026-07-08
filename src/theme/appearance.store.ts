import { create } from 'zustand';
import type { AppearancePreferences, Density, FontScale, ThemeId, ThemeMode } from './theme.types';
import { DEFAULT_APPEARANCE, persistAppearance, readStoredAppearance, resolveThemeId } from './theme.storage';

interface AppearanceState {
  preferences: AppearancePreferences;
  resolvedThemeId: ThemeId;
  // Vira true assim que o usuário troca alguma preferência nesta sessão. A partir
  // daí o Zustand local é a fonte da verdade — hydrateFromProfile para de aplicar
  // (o AppearanceSyncBridge já empurra o valor local para o Firestore em seguida),
  // evitando que um snapshot do perfil em trânsito reverta a escolha que acabou de
  // ser feita (bug: clicar um tema às vezes "voltava" pro anterior).
  hasLocalOverride: boolean;
  resetLocalOverride: () => void;
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
  hasLocalOverride: false,
  // Chamado no logout, para que o próximo login (troca de conta no mesmo
  // navegador, sem reload) volte a hidratar a partir do perfil salvo.
  resetLocalOverride: () => set({ hasLocalOverride: false }),
  hydrateFromProfile: (preferences) => {
    if (get().hasLocalOverride) {
      return;
    }

    set((state) => {
      const next = { ...DEFAULT_APPEARANCE, ...preferences };
      const cur = state.preferences;
      if (
        cur.themeMode === next.themeMode &&
        cur.themeId === next.themeId &&
        cur.density === next.density &&
        cur.fontScale === next.fontScale &&
        cur.reduceMotion === next.reduceMotion
      ) {
        return state;
      }
      return updatePreferences(state.preferences, next);
    });
  },
  setThemeMode: (themeMode) => {
    set((state) => ({ ...updatePreferences(state.preferences, { themeMode }), hasLocalOverride: true }));
  },
  setThemeId: (themeId) => {
    set((state) => ({
      ...updatePreferences(state.preferences, { themeId, themeMode: 'manual' }),
      hasLocalOverride: true
    }));
  },
  setDensity: (density) => {
    set((state) => ({ ...updatePreferences(state.preferences, { density }), hasLocalOverride: true }));
  },
  setFontScale: (fontScale) => {
    set((state) => ({ ...updatePreferences(state.preferences, { fontScale }), hasLocalOverride: true }));
  },
  setReduceMotion: (reduceMotion) => {
    set((state) => ({ ...updatePreferences(state.preferences, { reduceMotion }), hasLocalOverride: true }));
  },
  refreshSystemTheme: (prefersDark) => {
    const { preferences } = get();
    set({
      preferences,
      resolvedThemeId: resolveThemeId(preferences.themeMode, preferences.themeId, prefersDark)
    });
  }
}));
