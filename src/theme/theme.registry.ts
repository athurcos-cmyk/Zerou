import type { ThemeDefinition, ThemeId } from './theme.types';

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    id: 'paper',
    name: 'Paper',
    tone: 'light',
    description: 'Claro, leve e institucional.'
  },
  {
    id: 'perola',
    name: 'Pérola',
    tone: 'light',
    description: 'Limpo e profissional, azul acinzentado.'
  },
  {
    id: 'floresta',
    name: 'Floresta',
    tone: 'light',
    description: 'Verde calmante com fundo menta.'
  },
  {
    id: 'lavanda',
    name: 'Lavanda',
    tone: 'light',
    description: 'Roxo suave e relaxante.'
  },
  {
    id: 'noturno',
    name: 'Noturno',
    tone: 'dark',
    description: 'Azul marinho profundo, excelente contraste.'
  },
  {
    id: 'carbono',
    name: 'Carbono',
    tone: 'dark',
    description: 'Cinza escuro com toque ciano.'
  },
  {
    id: 'ametista',
    name: 'Ametista',
    tone: 'dark',
    description: 'Roxo escuro com destaque violeta.'
  }
];

export const THEME_IDS = THEME_DEFINITIONS.map((theme) => theme.id) as ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_IDS.includes(value as ThemeId);
}

export function getThemeDefinition(themeId: ThemeId): ThemeDefinition {
  return THEME_DEFINITIONS.find((theme) => theme.id === themeId) ?? THEME_DEFINITIONS[0];
}
