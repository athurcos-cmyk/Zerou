import {
  Activity, Apple, Armchair, Baby, Banknote, Bath, Bed, Beef, Beer, Bike,
  BookOpen, Brain, Briefcase, Building2, Bus, Cake, Calculator, Camera, Candy, Car, Carrot, Cat,
  Church, Cigarette, Cloud, Coffee, Coins, Cookie, CreditCard, Croissant, Crown, CupSoda, Dices,
  Dog, Droplets, Drumstick, Dumbbell, FileText, Film, Fish, Flame, Flower2, Fuel, Gamepad2, Gem,
  Gift, Glasses, Globe, GraduationCap, Guitar, HandCoins, Hammer, Handshake, Headphones,
  HeartHandshake, Heart, HeartPulse, Home, Hotel, IceCreamCone, Key, Landmark, Laptop, Leaf,
  Luggage, MapPin, Milk, Monitor, Music, Newspaper, Package, Palette, PartyPopper, PawPrint,
  Percent, PiggyBank, Pill, Pizza, Plane, Plug, Puzzle, Recycle, Receipt, Refrigerator, Repeat,
  Salad, School, Scissors, Ship, Shirt, ShoppingBag, ShoppingCart, ShowerHead, ShieldCheck,
  SlidersHorizontal, Smartphone, Smile, Sofa, Soup, Sparkles, Sprout, Stethoscope, Store, Sun,
  Syringe, Target, Ticket, TrainFront, TreePine, TrendingUp, Trophy, Truck, Tv, Umbrella, Users,
  UtensilsCrossed, WashingMachine, Watch, Wifi, Wine, Wrench, Zap,
  type LucideIcon
} from 'lucide-react';
import { categoryColors, defaultCategoryColor, resolveCategoryColor } from '../theme/palette';

export { categoryColors, defaultCategoryColor, resolveCategoryColor };

/**
 * Ícones de categoria, **agrupados por tema**.
 *
 * O agrupamento não é enfeite: a lista passou de 35 pra ~90 ícones em 29/07/2026, e uma grade
 * plana desse tamanho vira um "onde está o meu?" — a pessoa rola procurando em vez de escolher.
 * Com rótulo de seção o seletor continua navegável.
 *
 * **Nunca renomeie nem remova uma chave existente**: ela fica gravada em `Category.icon` no
 * Firestore, então mudar a chave apaga o ícone de categorias que já existem. Só acrescente.
 * A ordem dentro do grupo é a ordem de exibição.
 *
 * Crescer esta lista não exige mudança em `firestore.rules`: `icon` é validado só como string
 * de até 40 chars (`validOptionalString`), não como enum — conferido em 29/07/2026.
 */
export const categoryIconGroups: ReadonlyArray<{ label: string; icons: Record<string, LucideIcon> }> = [
  {
    label: 'Dinheiro',
    icons: {
      'money': Banknote,
      'bank': Landmark,
      'piggy': PiggyBank,
      'investment': TrendingUp,
      'credit-card': CreditCard,
      'coins': Coins,
      'hand-coins': HandCoins,
      'receipt': Receipt,
      'calculator': Calculator,
      'percent': Percent,
      'target': Target
    }
  },
  {
    label: 'Comida e bebida',
    icons: {
      'utensils': UtensilsCrossed,
      'pizza': Pizza,
      'coffee': Coffee,
      'cart': ShoppingCart,
      'salad': Salad,
      'soup': Soup,
      'beef': Beef,
      'fish': Fish,
      'drumstick': Drumstick,
      'carrot': Carrot,
      'apple': Apple,
      'milk': Milk,
      'candy': Candy,
      'cookie': Cookie,
      'ice-cream': IceCreamCone,
      'croissant': Croissant,
      'beer': Beer,
      'wine': Wine,
      'soda': CupSoda
    }
  },
  {
    label: 'Casa e contas',
    icons: {
      'home': Home,
      'building': Building2,
      'key': Key,
      'bed': Bed,
      'sofa': Sofa,
      'armchair': Armchair,
      'washing-machine': WashingMachine,
      'fridge': Refrigerator,
      'bath': Bath,
      'shower': ShowerHead,
      'droplets': Droplets,
      'zap': Zap,
      'plug': Plug,
      'flame': Flame,
      'wifi': Wifi,
      'recycle': Recycle,
      'tools': Wrench,
      'hammer': Hammer
    }
  },
  {
    label: 'Transporte',
    icons: {
      'car': Car,
      'bus': Bus,
      'train': TrainFront,
      'bike': Bike,
      'truck': Truck,
      'ship': Ship,
      'plane': Plane,
      'fuel': Fuel
    }
  },
  {
    label: 'Saúde',
    icons: {
      'heart-pulse': HeartPulse,
      'stethoscope': Stethoscope,
      'pill': Pill,
      'syringe': Syringe,
      'glasses': Glasses,
      'brain': Brain,
      'activity': Activity
    }
  },
  {
    label: 'Lazer',
    icons: {
      'smile': Smile,
      'gamepad': Gamepad2,
      'music': Music,
      'guitar': Guitar,
      'dumbbell': Dumbbell,
      'tv': Tv,
      'film': Film,
      'ticket': Ticket,
      'camera': Camera,
      'headphones': Headphones,
      'puzzle': Puzzle,
      'dices': Dices,
      'palette': Palette,
      'trophy': Trophy
    }
  },
  {
    label: 'Pessoas e pets',
    icons: {
      'pet': Dog,
      'cat': Cat,
      'paw': PawPrint,
      'baby': Baby,
      'users': Users,
      'heart': Heart,
      'gift': Gift,
      'cake': Cake,
      'party': PartyPopper,
      'donation': HeartHandshake,
      'handshake': Handshake,
      'church': Church
    }
  },
  {
    label: 'Trabalho e estudo',
    icons: {
      'briefcase': Briefcase,
      'graduation': GraduationCap,
      'school': School,
      'book': BookOpen,
      'laptop': Laptop,
      'monitor': Monitor,
      'cloud': Cloud,
      'store': Store,
      'newspaper': Newspaper,
      'file': FileText,
      'phone': Smartphone
    }
  },
  {
    label: 'Compras e cuidados',
    icons: {
      'shopping-bag': ShoppingBag,
      'shirt': Shirt,
      'scissors': Scissors,
      'watch': Watch,
      'gem': Gem,
      'crown': Crown,
      'package': Package
    }
  },
  {
    label: 'Viagem',
    icons: {
      'hotel': Hotel,
      'luggage': Luggage,
      'map-pin': MapPin,
      'globe': Globe
    }
  },
  {
    label: 'Natureza e outros',
    icons: {
      'leaf': Leaf,
      'tree': TreePine,
      'flower': Flower2,
      'sprout': Sprout,
      'sun': Sun,
      'umbrella': Umbrella,
      'shield': ShieldCheck,
      'sparkles': Sparkles,
      'cigarette': Cigarette,
      'repeat': Repeat,
      'sliders': SlidersHorizontal
    }
  }
];

/** Mapa plano chave → ícone, derivado dos grupos (fonte única — não dá pra dessincronizar). */
export const categoryIcons: Record<string, LucideIcon> = Object.assign(
  {},
  ...categoryIconGroups.map((group) => group.icons)
);

export const categoryIconKeys = Object.keys(categoryIcons);

/** Índice do grupo que contém uma chave — usado pra abrir o seletor já no grupo do ícone atual. */
export function iconGroupIndexOf(iconKey: string | undefined): number {
  if (!iconKey) return 0;
  const index = categoryIconGroups.findIndex((group) => iconKey in group.icons);
  return index === -1 ? 0 : index;
}

/** Render a category icon by key at a given size. Falls back to the sliders icon. */
export function CategoryIcon({ icon, size = 18 }: { icon?: string; size?: number }) {
  const Icon = categoryIcons[icon ?? ''] ?? SlidersHorizontal;
  return <Icon size={size} aria-hidden="true" />;
}

/** Colored tile with the category icon — used in list rows. */
export function CategoryMark({
  category,
  fallback
}: {
  category?: { id: string; icon?: string; color?: string } | null;
  fallback?: { icon?: string; color?: string };
}) {
  const color = category ? resolveCategoryColor(category) : (fallback?.color ?? defaultCategoryColor);
  const icon = category?.icon ?? fallback?.icon;
  return (
    <span className="category-mark" style={{ background: color }}>
      <CategoryIcon icon={icon} size={16} />
    </span>
  );
}
