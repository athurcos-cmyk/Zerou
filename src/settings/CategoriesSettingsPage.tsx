import { useMemo, useState } from 'react';
import { FolderTree, Plus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { useConfirm } from '../components/ConfirmDialog';
import { CategoryForm, type CategoryFormValues } from '../components/CategoryForm';
import { CategoryIcon, resolveCategoryColor } from '../components/categoryIcons';
import { useCategoryActions } from '../finance/useCategoryActions';
import {
  canDeleteCategory,
  childrenOf,
  dependentsOnCategory,
  isParentCategory,
  parentCandidates
} from '../finance/categoryHierarchy';
import type { Category } from '../types/contracts';

/**
 * Tela dedicada a organizar categorias — `/app/settings/categories`, no grupo "Sua conta".
 *
 * **O seletor dentro do lançamento continua existindo** (requisito do dono): quem abre o app pela
 * primeira vez e cai na tela de lançamento precisa conseguir criar categoria ali mesmo. Esta tela
 * é o lugar calmo pra organizar hierarquia, não a única porta.
 *
 * Custo de leitura: **zero**. As categorias já vêm do `useFinanceContext` (carregadas no boot);
 * nenhuma query nova.
 */
export function CategoriesSettingsPage() {
  const { profile } = useAuth();
  const finance = useFinanceContext();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const categoryActions = useCategoryActions();

  const active = useMemo(
    () => finance.categories.filter((cat) => cat.isActive !== false),
    [finance.categories]
  );

  // Raízes primeiro; cada uma leva suas filhas. Uma raiz sem filhas é uma folha comum.
  const groups = useMemo(
    () =>
      active
        .filter((cat) => !cat.parentCategoryId)
        .map((parent) => ({ parent, children: childrenOf(parent.id, active) })),
    [active]
  );

  const editing = editingId ? active.find((cat) => cat.id === editingId) ?? null : null;
  const deleteCheck = editingId ? canDeleteCategory(editingId, active) : null;

  function startCreate() {
    setEditingId(null);
    setFormOpen(true);
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setFormOpen(true);
  }

  /**
   * Aviso do `[D13]`: ao dar a PRIMEIRA subcategoria a uma categoria, as recorrências e contas que
   * apontam pra ela continuam lançando nela. Não bloqueia e não move nada — só conta e aponta o
   * caminho, porque cada recorrência costuma pertencer a uma subcategoria diferente.
   */
  async function warnIfParentHasDependents(parentId: string): Promise<boolean> {
    if (isParentCategory(parentId, active)) return true; // já era pai, o aviso já apareceu antes

    const parent = active.find((cat) => cat.id === parentId);
    const { bills, recurring } = dependentsOnCategory(parentId, {
      bills: finance.bills,
      recurringRules: finance.recurringRules
    });
    if (bills + recurring === 0) return true;

    const partes = [
      recurring > 0 ? `${recurring} recorrência${recurring > 1 ? 's' : ''}` : null,
      bills > 0 ? `${bills} conta${bills > 1 ? 's' : ''} a pagar` : null
    ].filter(Boolean);

    return confirm({
      title: `${parent?.name ?? 'Esta categoria'} tem ${partes.join(' e ')}`,
      message: `Elas continuam lançando em "${parent?.name}" até você reapontar cada uma pra uma subcategoria, em Contas a Pagar. Criar a subcategoria agora?`,
      confirmLabel: 'Criar',
      cancelLabel: 'Deixa pra depois'
    });
  }

  async function handleSubmit(values: CategoryFormValues) {
    const parent = values.parentCategoryId
      ? active.find((cat) => cat.id === values.parentCategoryId)
      : undefined;

    if (parent && !(await warnIfParentHasDependents(parent.id))) return;

    if (editingId) {
      await categoryActions.onUpdateCategory(editingId, {
        name: values.name,
        icon: values.icon,
        color: values.color,
        parentCategoryId: values.parentCategoryId ?? null,
        children: childrenOf(editingId, active)
      });
    } else {
      await categoryActions.onCreateCategory(values.name, values.icon, values.type, values.color, parent);
    }
    setFormOpen(false);
  }

  async function handleDelete(id: string) {
    const target = active.find((cat) => cat.id === id);
    const ok = await confirm({
      title: `Excluir ${target?.name ?? 'categoria'}?`,
      message: 'Ela sai da lista pra novos lançamentos. Os lançamentos antigos continuam como estão, e não dá pra trazer a categoria de volta.',
      confirmLabel: 'Excluir',
      danger: true
    });
    if (!ok) return false;

    await categoryActions.onDeleteCategory(id);
    return true;
  }

  return (
    <section className="page-content page-content--narrow">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Sua conta</p>
          <h1 className="page-title page-title--compact">Categorias</h1>
        </div>
        <button className="button button--primary" type="button" onClick={startCreate}>
          <Plus size={16} aria-hidden="true" /> Nova
        </button>
      </div>

      <article className="surface surface-pad category-explainer">
        <span className="category-explainer-icon" aria-hidden="true">
          <FolderTree size={20} />
        </span>
        <div>
          <strong>Categoria é o rótulo do seu gasto.</strong>
          <p>
            Uma <strong>subcategoria</strong> detalha uma principal: dentro de <em>Casa</em> você pode ter
            <em> Energia</em> e <em>Água</em>. Ela herda a cor da principal, e na Análise o gasto das
            subcategorias aparece somado na fatia da principal — você abre a linha pra ver a divisão.
          </p>
          <p className="text-secondary">
            Uma categoria com subcategorias vira só um agrupamento: o lançamento passa a ser feito
            direto na subcategoria.
          </p>
        </div>
      </article>

      <article className="surface surface-pad">
        {finance.loading && active.length === 0 ? (
          <LoadingState compact />
        ) : active.length === 0 ? (
          <EmptyState
            illustration="wallet"
            compact
            title="Nenhuma categoria ainda"
            description="Crie a primeira pra começar a organizar seus lançamentos."
          />
        ) : (
          <div className="item-list item-list--grouped">
            {groups.map(({ parent, children }) => (
              <section className="day-group" key={parent.id}>
                <button className="list-row list-row--with-icon list-row--tap" type="button" onClick={() => startEdit(parent)}>
                  <span className="category-mark" style={{ background: resolveCategoryColor(parent) }}>
                    <CategoryIcon icon={parent.icon} size={16} />
                  </span>
                  <div className="list-row-body">
                    <strong>{parent.name}</strong>
                    <span className="text-secondary">
                      {children.length > 0
                        ? `${children.length} subcategoria${children.length > 1 ? 's' : ''} · agrupamento`
                        : 'Categoria principal'}
                    </span>
                  </div>
                </button>
                {children.map((child) => (
                  <button
                    className="list-row list-row--with-icon list-row--tap category-child-row"
                    type="button"
                    key={child.id}
                    onClick={() => startEdit(child)}
                  >
                    <span className="category-mark" style={{ background: resolveCategoryColor(child) }}>
                      <CategoryIcon icon={child.icon} size={16} />
                    </span>
                    <div className="list-row-body">
                      <strong>{child.name}</strong>
                      <span className="text-secondary">Dentro de {parent.name}</span>
                    </div>
                  </button>
                ))}
              </section>
            ))}
          </div>
        )}
      </article>

      <BottomSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Editar categoria' : 'Nova categoria'}
        subtitle={profile?.defaultWorkspaceId ? undefined : 'Carregando sua conta...'}
      >
        <CategoryForm
          key={editingId ?? 'new'}
          editing={editing}
          editingColor={editing ? resolveCategoryColor(editing) : undefined}
          filterType="all"
          parentOptions={parentCandidates(active, editingId)}
          deleteBlockedReason={
            deleteCheck && !deleteCheck.ok
              ? `Esta categoria tem ${deleteCheck.blockedByChildren} subcategoria${deleteCheck.blockedByChildren > 1 ? 's' : ''}. Exclua ou mova elas antes.`
              : null
          }
          onSubmit={handleSubmit}
          onDelete={editingId ? () => handleDelete(editingId) : undefined}
          onDeleted={() => setFormOpen(false)}
          onCancel={() => setFormOpen(false)}
        />
      </BottomSheet>
      {confirmDialog}
    </section>
  );
}
