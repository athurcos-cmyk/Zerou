// Sanctioned color-data registry (allowed to hold literals, like themes.css).
// These are persisted as values (per-category / per-goal color choices) and on-accent
// foregrounds, so they live here rather than as CSS variables.

/** White foreground used on top of accent/gradient surfaces. */
export const ACCENT_FOREGROUND = '#ffffff';

/**
 * Paleta Sol para marcas de categoria e meta — quente de origem, toda legível com ícone branco
 * (`ACCENT_FOREGROUND`), que é como estas cores sempre aparecem (`.category-mark`, `.color-dot`).
 *
 * Ordenada como espectro (quente → frio → neutro) pra grade do seletor virar um degradê
 * navegável em vez de um mosaico aleatório. Ao acrescentar cor, **mantenha o tom médio-escuro**:
 * cor clara demais some sob o ícone branco. As 12 primeiras são as originais e não mudam de
 * posição — `resolveCategoryColor` faz hash sobre este array pra colorir categoria sem cor
 * escolhida, então reordenar troca a cor de categorias que já existem por aí.
 *
 * Nenhuma mudança de regra é necessária ao crescer esta lista: `firestore.rules` valida `color`
 * só como string de até 40 chars (`validOptionalString`), não como enum — conferido em
 * 29/07/2026, ao dobrar a paleta.
 */
export const categoryColors = [
  // — originais (posição fixa, ver nota acima) —
  '#EE5524', // tangerina (primária Sol)
  '#E8911C', // âmbar
  '#D4A017', // ouro
  '#5FA052', // verde
  '#2E9E8F', // teal
  '#3B82C4', // azul
  '#6366C9', // índigo
  '#9B5DE5', // violeta
  '#D6549A', // rosa
  '#D14545', // vermelho
  '#7C6F64', // taupe
  '#4A5568', // ardósia
  // — acrescentadas em 29/07/2026 —
  '#C2410C', // laranja queimado
  '#B45309', // bronze
  '#7A8B3A', // oliva
  '#2F7D46', // verde-mata
  '#0E9488', // teal profundo
  '#1F7A9C', // oceano
  '#1E4E8C', // azul-marinho
  '#6B3FA0', // uva
  '#B03E86', // magenta
  '#C2306B', // framboesa
  '#8A5A44', // cacau
  '#2D3748' // grafite
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
 * Cor de uma categoria pra gráficos/legendas: a cor escolhida pela pessoa, senão a cor fixa da
 * categoria embutida, senão uma cor derivada do id (hash estável). Fonte única — antes estava
 * duplicada em SearchPage e AnnualSummarySheet.
 */
export function resolveCategoryColor(category: { id: string; color?: string }): string {
  if (category.color) return category.color;
  if (defaultCategoryColors[category.id]) return defaultCategoryColors[category.id];
  let hash = 0;
  for (let i = 0; i < category.id.length; i += 1) {
    hash = (hash * 31 + category.id.charCodeAt(i)) >>> 0;
  }
  return categoryColors[hash % categoryColors.length];
}

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
