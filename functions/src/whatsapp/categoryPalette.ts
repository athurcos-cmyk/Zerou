// Espelha src/components/categoryIcons.tsx (categoryIconKeys) e src/theme/palette.ts
// (categoryColors, defaultCategoryColor). Cloud Functions não importa src/ do app —
// mantenha em sincronia manualmente se o app mudar esses valores.

export const categoryIconKeys = [
  'briefcase', 'sparkles', 'home', 'utensils', 'pizza', 'coffee',
  'car', 'bus', 'fuel', 'plane', 'heart-pulse', 'stethoscope',
  'smile', 'repeat', 'sliders', 'shopping-bag', 'shirt', 'scissors',
  'graduation', 'book', 'dumbbell', 'gamepad', 'music', 'pet',
  'baby', 'gift', 'tools', 'phone', 'wifi', 'droplets',
  'zap', 'cigarette', 'bank', 'piggy', 'investment', 'money',
];

export const categoryColors = [
  '#EE5524', '#E8911C', '#D4A017', '#5FA052', '#2E9E8F', '#3B82C4',
  '#6366C9', '#9B5DE5', '#D6549A', '#D14545', '#7C6F64', '#4A5568',
];

export const defaultCategoryColor = '#7C6F64';
