import { useEffect } from 'react';
import { useAppearanceStore } from './appearance.store';

export function ThemeRuntime() {
  const preferences = useAppearanceStore((state) => state.preferences);
  const resolvedThemeId = useAppearanceStore((state) => state.resolvedThemeId);
  const refreshSystemTheme = useAppearanceStore((state) => state.refreshSystemTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedThemeId;
    document.documentElement.dataset.themeMode = preferences.themeMode;
    document.documentElement.dataset.density = preferences.density;
    document.documentElement.dataset.fontScale = preferences.fontScale;
    document.documentElement.dataset.reduceMotion = String(preferences.reduceMotion);
  }, [preferences, resolvedThemeId]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      refreshSystemTheme(event.matches);
    };

    media.addEventListener('change', onChange);
    refreshSystemTheme(media.matches);

    return () => media.removeEventListener('change', onChange);
  }, [refreshSystemTheme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => {
      document.documentElement.dataset.reduceMotion = String(event.matches);
    };

    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return null;
}
