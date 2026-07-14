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
    id: 'rosa',
    name: 'Rosa',
    tone: 'light',
    description: 'Rosado delicado e acolhedor.'
  },
  {
    id: 'areia',
    name: 'Areia',
    tone: 'light',
    description: 'Bege natural com toque dourado.'
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
    id: 'cobalto',
    name: 'Cobalto',
    tone: 'dark',
    description: 'Azul intenso e vibrante.'
  },
  {
    id: 'ametista',
    name: 'Ametista',
    tone: 'dark',
    description: 'Roxo escuro com destaque violeta.'
  },
  {
    id: 'grafite',
    name: 'Grafite',
    tone: 'dark',
    description: 'Cinza neutro e discreto.'
  },
  {
    id: 'vinho',
    name: 'Vinho',
    tone: 'dark',
    description: 'Tom avermelhado quente e elegante.'
  }
];

export const THEME_IDS = THEME_DEFINITIONS.map((theme) => theme.id) as ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_IDS.includes(value as ThemeId);
}

export function getThemeDefinition(themeId: ThemeId): ThemeDefinition {
  return THEME_DEFINITIONS.find((theme) => theme.id === themeId) ?? THEME_DEFINITIONS[0];
}
