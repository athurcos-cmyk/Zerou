import { useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createCategory, deleteCategory, updateCategory } from './financeService';
import type { Category } from '../types/contracts';
import type { CategoryPatch } from '../components/CategoryField';

export interface CategoryActions {
  onCreateCategory: (
    name: string,
    icon: string,
    type: 'income' | 'expense' | 'both',
    color: string,
    /** Presente = criar subcategoria. O serviço deriva id e cor deste objeto. */
    parent?: Category
  ) => Promise<void>;
  onUpdateCategory: (id: string, patch: CategoryPatch) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
}

/**
 * Os três handlers que todo `CategoryField` precisa, num lugar só.
 *
 * Antes disto existiam **21 closures** repetindo isto em 4 arquivos (`BillsPage` sozinha tinha
 * 12, de 4 instâncias do campo). `onUpdateCategory` e `onDeleteCategory` eram idênticos nas 7
 * instâncias; `onCreateCategory` só variava em qual setter chamar depois de criar — que é
 * exatamente o que `onCreated` cobre aqui.
 *
 * Motivo de existir: qualquer campo novo de categoria (ex.: `parentCategoryId`) passa a entrar
 * em UM lugar em vez de 21. Uma das 21 esquecida **não daria erro de compilação** — viraria uma
 * tela onde criar categoria simplesmente não funciona, em silêncio.
 *
 * **Passe um `onCreated` estável** (um setter de `useState` serve). `CategoryField` é `memo`, e
 * o objeto devolvido aqui só é recriado quando as dependências mudam de verdade — um callback
 * inline nova a cada render anularia a memoização.
 */
export function useCategoryActions(onCreated?: (categoryId: string) => void): CategoryActions {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const userId = user?.uid;

  return useMemo<CategoryActions>(
    () => ({
      async onCreateCategory(name, icon, type, color, parent) {
        if (!workspaceId || !userId) return;
        const id = await createCategory(workspaceId, userId, { name, icon, type, color, parent });
        onCreated?.(id);
      },
      async onUpdateCategory(id, { children, ...patch }) {
        if (!workspaceId) return;
        await updateCategory(workspaceId, id, patch, { children });
      },
      async onDeleteCategory(id) {
        if (!workspaceId) return;
        await deleteCategory(workspaceId, id);
      }
    }),
    [workspaceId, userId, onCreated]
  );
}
