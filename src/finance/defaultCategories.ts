import type { Category } from '../types/contracts';

export const defaultCategories = [
  { id: 'income_salary', name: 'Salário', type: 'income', icon: 'briefcase' },
  { id: 'income_extra', name: 'Entrada extra', type: 'income', icon: 'sparkles' },
  { id: 'expense_home', name: 'Casa', type: 'expense', icon: 'home' },
  { id: 'expense_food', name: 'Alimentação', type: 'expense', icon: 'utensils' },
  { id: 'expense_transport', name: 'Transporte', type: 'expense', icon: 'car' },
  { id: 'expense_health', name: 'Saúde', type: 'expense', icon: 'heart-pulse' },
  { id: 'expense_leisure', name: 'Lazer', type: 'expense', icon: 'smile' },
  { id: 'both_transfer', name: 'Transferência', type: 'both', icon: 'repeat' },
  { id: 'both_adjustment', name: 'Ajuste', type: 'both', icon: 'sliders' }
] as const;

export function buildDefaultCategory(workspaceId: string, category: (typeof defaultCategories)[number]) {
  return {
    id: category.id,
    workspaceId,
    name: category.name,
    type: category.type,
    icon: category.icon,
    isDefault: true,
    isActive: true
  } satisfies Omit<Category, 'createdAt' | 'updatedAt'>;
}
