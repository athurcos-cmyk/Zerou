// Sanctioned color-data registry (allowed to hold literals, like themes.css).
// These are persisted as values (per-category / per-goal color choices) and on-accent
// foregrounds, so they live here rather than as CSS variables.

/** White foreground used on top of accent/gradient surfaces. */
export const ACCENT_FOREGROUND = '#ffffff';

/** Sol-flavoured palette for category & goal marks — warm-leaning, readable with white text. */
export const categoryColors = [
  '#EE5524', // tangerine (Sol primary)
  '#E8911C', // amber
  '#D4A017', // gold
  '#5FA052', // green
  '#2E9E8F', // teal
  '#3B82C4', // blue
  '#6366C9', // indigo
  '#9B5DE5', // violet
  '#D6549A', // pink
  '#D14545', // red
  '#7C6F64', // taupe
  '#4A5568' // slate
];

export const defaultCategoryColor = '#7C6F64';

/** Deterministic colors for the built-in categories so they aren't all gray (no migration needed). */
export const defaultCategoryColors: Record<string, string> = {
  income_salary: '#5FA052',
  income_extra: '#2E9E8F',
  expense_home: '#3B82C4',
  expense_food: '#EE5524',
  expense_transport: '#6366C9',
  expense_health: '#D14545',
  expense_leisure: '#9B5DE5',
  both_transfer: '#4A5568',
  both_adjustment: '#7C6F64'
};

/**
 * Cor de marca para serviços cujo logo real é só um wordmark (ilegível espremido num tile
 * de 36px). Em vez do wordmark, o `ServiceMark` desenha um tile "ícone de app": quadrado na
 * cor da marca com as iniciais em branco (`ACCENT_FOREGROUND`). Tons escolhidos com contraste
 * suficiente pra texto branco. Serviço com `logoPath` ignora isto (logo tem prioridade).
 */
export const serviceBrandColors: Record<string, string> = {
  'prime-video': '#146EB4',
  'disney-plus': '#0E1E4A',
  globoplay: '#EC1D2E',
  'xbox-game-pass': '#107C10',
  'nintendo-switch-online': '#E60012',
  wellhub: '#E8590C',
  'smart-fit': '#1D1D1F',
  adobe: '#EB1000',
  canva: '#7D2AE8',
  kindle: '#137A8E',
  vivo: '#660099',
  tim: '#004691',
  sky: '#0057B8'
};

/** Avatar cartoon: skin tones, hair colors, and accessory strokes. */
export const avatarSkinTones = {
  clara: '#FDDCB5',
  media: '#E8B87A',
  escura: '#8D6E5C',
  cravo: '#C68642',
  branco: '#FFF4E6',
} as const;

export const avatarHairColors = {
  castanhoEscuro: '#6B3A2E',
  castanhoMedio: '#8B5E3C',
  castanhoClaro: '#D4A056',
  preto: '#2C1810',
  muitoEscuro: '#1A0E08',
  ruivo: '#C4956A',
} as const;

export const avatarAccessoryStroke = '#333333';
export const avatarMouthRed = '#CC4444';
export const avatarBoneTangerina = '#EE5524';
export const avatarBoneVerde = '#2E7D32';
export const avatarEyeWhite = '#ffffff';
