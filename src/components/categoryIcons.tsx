import {
  Briefcase, Sparkles, Home, UtensilsCrossed, Car, HeartPulse, Smile,
  Repeat, SlidersHorizontal, ShoppingBag, Shirt, Plane, GraduationCap,
  Dumbbell, Gamepad2, Music, BookOpen, Coffee, Dog, Baby, Gift,
  Wrench, Smartphone, Landmark, TrendingUp, Banknote, Bus, Fuel,
  PiggyBank, Wifi, Droplets, Zap, Cigarette, Pizza, Stethoscope, Scissors,
  type LucideIcon
} from 'lucide-react';

export const categoryIcons: Record<string, LucideIcon> = {
  'briefcase': Briefcase,
  'sparkles': Sparkles,
  'home': Home,
  'utensils': UtensilsCrossed,
  'pizza': Pizza,
  'coffee': Coffee,
  'car': Car,
  'bus': Bus,
  'fuel': Fuel,
  'plane': Plane,
  'heart-pulse': HeartPulse,
  'stethoscope': Stethoscope,
  'smile': Smile,
  'repeat': Repeat,
  'sliders': SlidersHorizontal,
  'shopping-bag': ShoppingBag,
  'shirt': Shirt,
  'scissors': Scissors,
  'graduation': GraduationCap,
  'book': BookOpen,
  'dumbbell': Dumbbell,
  'gamepad': Gamepad2,
  'music': Music,
  'pet': Dog,
  'baby': Baby,
  'gift': Gift,
  'tools': Wrench,
  'phone': Smartphone,
  'wifi': Wifi,
  'droplets': Droplets,
  'zap': Zap,
  'cigarette': Cigarette,
  'bank': Landmark,
  'piggy': PiggyBank,
  'investment': TrendingUp,
  'money': Banknote
};

export const categoryIconKeys = Object.keys(categoryIcons);

/** Render a category icon by key at a given size. Falls back to the sliders icon. */
export function CategoryIcon({ icon, size = 18 }: { icon?: string; size?: number }) {
  const Icon = categoryIcons[icon ?? ''] ?? SlidersHorizontal;
  return <Icon size={size} aria-hidden="true" />;
}

/** Sol-flavoured palette for category marks — warm-leaning, all readable on white text. */
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
  '#4A5568'  // slate
];

export const defaultCategoryColor = '#7C6F64';

/** Deterministic colors for the built-in categories so they aren't all gray (no migration needed). */
const defaultCategoryColors: Record<string, string> = {
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

/** Resolve the color to paint a category mark: explicit color → built-in default → hashed palette. */
export function resolveCategoryColor(category: { id: string; color?: string }) {
  if (category.color) return category.color;
  if (defaultCategoryColors[category.id]) return defaultCategoryColors[category.id];
  let hash = 0;
  for (let i = 0; i < category.id.length; i += 1) {
    hash = (hash * 31 + category.id.charCodeAt(i)) >>> 0;
  }
  return categoryColors[hash % categoryColors.length];
}
