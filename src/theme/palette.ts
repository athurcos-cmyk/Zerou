// Sanctioned color-data registry (allowed to hold literals, like themes.css).
// These are persisted as values (per-category / per-goal color choices) and on-accent
// foregrounds, so they live here rather than as CSS variables.

/** White foreground used on top of accent/gradient surfaces. */
export const ACCENT_FOREGROUND = '#ffffff';

/**
 * Paleta Sol para marcas de categoria e meta, **na ordem em que aparece no seletor**: percorre
 * o círculo cromático (vermelho → laranja → amarelo → verde → azul → roxo → rosa) e fecha nos
 * neutros. Grade ordenada por cor se lê como degradê; ordenada por "data em que a cor entrou"
 * vira mosaico aleatório, que era o caso antes de 29/07/2026.
 *
 * Todas são legíveis com ícone branco (`ACCENT_FOREGROUND`), que é como sempre aparecem
 * (`.category-mark`, `.color-dot`). Ao acrescentar, **mantenha o tom médio-escuro** e ponha a
 * cor na posição cromática certa — esta lista pode ser reordenada à vontade, porque quem
 * depende de posição estável é a `hashPaletteColors`, abaixo.
 *
 * Nenhuma mudança de regra é necessária ao crescer esta lista: `firestore.rules` valida `color`
 * só como string de até 40 chars (`validOptionalString`), não como enum.
 */
export const categoryColors = [
  '#D14545', // vermelho
  '#EE5524', // tangerina (primária Sol)
  '#C2410C', // laranja queimado
  '#B45309', // bronze
  '#E8911C', // âmbar
  '#D4A017', // ouro
  '#7A8B3A', // oliva
  '#5FA052', // verde
  '#2F7D46', // verde-mata
  '#2E9E8F', // teal
  '#0E9488', // teal profundo
  '#1F7A9C', // oceano
  '#3B82C4', // azul
  '#1E4E8C', // azul-marinho
  '#6366C9', // índigo
  '#6B3FA0', // uva
  '#9B5DE5', // violeta
  '#B03E86', // magenta
  '#D6549A', // rosa
  '#C2306B', // framboesa
  '#8A5A44', // cacau
  '#7C6F64', // taupe
  '#4A5568', // ardósia
  '#2D3748' // grafite
];

/**
 * Cores usadas só pelo **sorteio** de `resolveCategoryColor` (categoria sem cor escolhida).
 *
 * Existe separada de `categoryColors` por um motivo específico: o sorteio é um hash sobre o
 * índice do array, então **mudar a ordem muda a cor de categorias que já existem**. Congelar
 * esta lista (as 12 originais, na ordem original) é o que permite reordenar e crescer a paleta
 * do seletor sem repintar nada no app de ninguém. Nunca reordene nem remova daqui; acrescentar
 * ao fim também repinta (muda o `% length`), então trate como imutável.
 */
const hashPaletteColors = [
  '#EE5524',
  '#E8911C',
  '#D4A017',
  '#5FA052',
  '#2E9E8F',
  '#3B82C4',
  '#6366C9',
  '#9B5DE5',
  '#D6549A',
  '#D14545',
  '#7C6F64',
  '#4A5568'
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
 * duplicada em SearchPage, AnnualSummarySheet e `categoryIcons.tsx`.
 *
 * O sorteio usa `hashPaletteColors`, **não** `categoryColors`: ver a nota lá em cima sobre por
 * que a lista do sorteio é congelada.
 */
export function resolveCategoryColor(category: { id: string; color?: string }): string {
  if (category.color) return category.color;
  if (defaultCategoryColors[category.id]) return defaultCategoryColors[category.id];
  let hash = 0;
  for (let i = 0; i < category.id.length; i += 1) {
    hash = (hash * 31 + category.id.charCodeAt(i)) >>> 0;
  }
  return hashPaletteColors[hash % hashPaletteColors.length];
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
