export type ThemeId = 'paper' | 'sakura' | 'obsidian' | 'midnight' | 'aurora' | 'rose-gold';
export type ThemeMode = 'manual' | 'system';
export type Density = 'comfortable' | 'compact';
export type FontScale = 'sm' | 'md' | 'lg';

export interface AppearancePreferences {
  themeMode: ThemeMode;
  themeId: ThemeId;
  density: Density;
  fontScale: FontScale;
  reduceMotion: boolean;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  tone: 'light' | 'dark';
  description: string;
}
