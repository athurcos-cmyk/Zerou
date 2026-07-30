// ESPELHO de src/components/categoryIcons.tsx (categoryIconKeys) e src/theme/palette.ts
// (categoryColors, defaultCategoryColor). Cloud Functions não importa src/ do app cliente.
//
// A sincronia é garantida pelo teste src/theme/categoryPaletteSync.test.ts, que roda no
// `npm test` do app e falha se este arquivo divergir. Antes desse teste existir, o espelho
// ficou preso em 36 ícones / 12 cores enquanto o app já oferecia 122 / 24 — e toda categoria
// criada pela Vic no WhatsApp saía com o conjunto antigo, em silêncio, porque as três
// checagens do caminho (prompt, parse e gravação) validavam contra esta lista desatualizada.
//
// Lembrete: mudar este arquivo exige DEPLOY das functions — `git push` não reimplanta.
// Ver docs/RUNBOOK.md.

export const categoryIconKeys = [
  'money', 'bank', 'piggy', 'investment', 'credit-card', 'coins',
  'hand-coins', 'receipt', 'calculator', 'percent', 'target', 'utensils',
  'pizza', 'coffee', 'cart', 'salad', 'soup', 'beef',
  'fish', 'drumstick', 'carrot', 'apple', 'milk', 'candy',
  'cookie', 'ice-cream', 'croissant', 'beer', 'wine', 'soda',
  'home', 'building', 'key', 'bed', 'sofa', 'armchair',
  'washing-machine', 'fridge', 'bath', 'shower', 'droplets', 'zap',
  'plug', 'flame', 'wifi', 'recycle', 'tools', 'hammer',
  'car', 'bus', 'train', 'bike', 'truck', 'ship',
  'plane', 'fuel', 'heart-pulse', 'stethoscope', 'pill', 'syringe',
  'glasses', 'brain', 'activity', 'smile', 'gamepad', 'music',
  'guitar', 'dumbbell', 'tv', 'film', 'ticket', 'camera',
  'headphones', 'puzzle', 'dices', 'palette', 'trophy', 'pet',
  'cat', 'paw', 'baby', 'users', 'heart', 'gift',
  'cake', 'party', 'donation', 'handshake', 'church', 'briefcase',
  'graduation', 'school', 'book', 'laptop', 'monitor', 'cloud',
  'store', 'newspaper', 'file', 'phone', 'shopping-bag', 'shirt',
  'scissors', 'watch', 'gem', 'crown', 'package', 'hotel',
  'luggage', 'map-pin', 'globe', 'leaf', 'tree', 'flower',
  'sprout', 'sun', 'umbrella', 'shield', 'sparkles', 'cigarette',
  'repeat', 'sliders',
];

export const categoryColors = [
  '#D14545', '#EE5524', '#C2410C', '#B45309', '#E8911C', '#D4A017',
  '#7A8B3A', '#5FA052', '#2F7D46', '#2E9E8F', '#0E9488', '#1F7A9C',
  '#3B82C4', '#1E4E8C', '#6366C9', '#6B3FA0', '#9B5DE5', '#B03E86',
  '#D6549A', '#C2306B', '#8A5A44', '#7C6F64', '#4A5568', '#2D3748',
];

export const defaultCategoryColor = '#7C6F64';
