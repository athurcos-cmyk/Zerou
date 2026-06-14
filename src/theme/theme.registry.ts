import type { ThemeDefinition, ThemeId } from './theme.types';

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    id: 'paper',
    name: 'Paper',
    tone: 'light',
    description: 'Claro, leve e institucional.'
  },
  {
    id: 'sakura',
    name: 'Sakura',
    tone: 'light',
    description: 'Quente e acolhedor, com contraste suave.'
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    tone: 'dark',
    description: 'Escuro neutro, discreto e concentrado.'
  },
  {
    id: 'midnight',
    name: 'Midnight',
    tone: 'dark',
    description: 'Indigo profundo para foco noturno.'
  },
  {
    id: 'aurora',
    name: 'Aurora',
    tone: 'dark',
    description: 'Escuro com base verde fria e calma.'
  },
  {
    id: 'rose-gold',
    name: 'Rose Gold',
    tone: 'dark',
    description: 'Escuro quente, elegante e moderado.'
  }
];

export const THEME_IDS = THEME_DEFINITIONS.map((theme) => theme.id) as ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_IDS.includes(value as ThemeId);
}

export function getThemeDefinition(themeId: ThemeId): ThemeDefinition {
  return THEME_DEFINITIONS.find((theme) => theme.id === themeId) ?? THEME_DEFINITIONS[0];
}
