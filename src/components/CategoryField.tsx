import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, FolderTree, Pencil, Plus, Settings2, Tag } from 'lucide-react';
import type { Category } from '../types/contracts';
import { BottomSheet } from './BottomSheet';
import { useConfirm } from './ConfirmDialog';
import { CategoryForm, type CategoryFormValues } from './CategoryForm';
import { CategoryIcon, resolveCategoryColor } from './categoryIcons';
import {
  canDeleteCategory, childrenOf, parentCandidates, parentCategoryIds, selectableCategories
} from '../finance/categoryHierarchy';

export interface CategoryPatch {
  name?: string;
  icon?: string;
  color?: string;
  /** `undefined` = não mexe; `null` = limpa (promove a categoria principal). */
  parentCategoryId?: string | null;
  /** Filhas desta categoria — a cor é propagada pra elas no mesmo batch. */
  children?: ReadonlyArray<{ id: string }>;
}

interface CategoryFieldProps {
  label?: string;
  value: string;
  onChange: (id: string) => void;
  categories: Category[];
  filterType?: 'income' | 'expense' | 'both' | 'all';
  onCreateCategory?: (
    name: string,
    icon: string,
    type: 'income' | 'expense' | 'both',
    color: string,
    parent?: Category
  ) => Promise<void>;
  onUpdateCategory?: (id: string, patch: CategoryPatch) => Promise<void>;
  onDeleteCategory?: (id: string) => Promise<void>;
}

export const CategoryField = memo(function CategoryField({
  label = 'Categoria',
  value,
  onChange,
  categories,
  filterType = 'all',
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory
}: CategoryFieldProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();


  const allActive = categories.filter((cat) => cat.isActive !== false);
  // Quem é pai se decide na lista COMPLETA, antes de qualquer filtro de tipo. Filtrar primeiro
  // escondia a filha (quando o tipo dela diferia do pai) e fazia o pai voltar a ser
  // selecionável — bug real de 29/07/2026, contra a regra [D10].
  const parentIds = parentCategoryIds(allActive);
  // `selectableCategories` é a fonte única de verdade pra "essa categoria pode receber um
  // lançamento" (exclui pai-de-grupo e categoria gerenciada pelo sistema, ex.: a categoria
  // sintética de uma conta de investimento). Delegar em vez de reimplementar evita o bug real de
  // 01/08/2026: esta função tinha sua própria cópia da exclusão de pai e nunca ganhou a exclusão
  // de `linkedInvestmentAccountId` quando ela foi adicionada em `selectableCategories`.
  const selectableIds = new Set(selectableCategories(allActive).map((cat) => cat.id));

  const filtered = allActive.filter((cat) => {
    if (filterType === 'all') return true;
    return cat.type === filterType || cat.type === 'both';
  });
  const selectable = filtered.filter((cat) => selectableIds.has(cat.id));
  const parents = filtered.filter((cat) => parentIds.has(cat.id));
  const rootLeaves = selectable.filter((cat) => !cat.parentCategoryId);

  // Busca na lista COMPLETA (não só nas selecionáveis): um lançamento antigo pode apontar pra
  // uma categoria que virou pai depois. Ela não é mais oferecida, mas precisa continuar sendo
  // EXIBIDA — senão a pessoa vê "Selecione" e acha que perdeu a categoria.
  const selected = allActive.find((cat) => cat.id === value);
  const editingCategory = editingId ? allActive.find((cat) => cat.id === editingId) ?? null : null;
  const deleteCheck = editingId ? canDeleteCategory(editingId, allActive) : null;

  function startCreate() {
    setEditingId(null);
    setMode('form');
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setMode('form');
  }

  async function handleSubmit(values: CategoryFormValues) {
    const parent = values.parentCategoryId
      ? allActive.find((cat) => cat.id === values.parentCategoryId)
      : undefined;

    if (editingId) {
      if (onUpdateCategory) {
        await onUpdateCategory(editingId, {
          name: values.name,
          icon: values.icon,
          color: values.color,
          // `null` limpa o campo (promove a categoria principal); string troca de pai.
          parentCategoryId: values.parentCategoryId ?? null,
          // Propaga a cor pras filhas quando ESTA categoria é um pai.
          children: childrenOf(editingId, allActive)
        });
      }
    } else if (onCreateCategory) {
      await onCreateCategory(values.name, values.icon, values.type, values.color, parent);
    }
    setMode('list');
    setManage(false);
  }

  /**
   * Excluir categoria pede confirmação — inclusive as embutidas, que passaram a ser
   * excluíveis em 29/07/2026 (antes `isDefault` bloqueava, sem a pessoa entender por quê).
   *
   * A confirmação não é cerimônia: a exclusão é lógica (`isActive: false`), mas **não tem
   * como desfazer pela interface**, e `ensureDefaultCategories` não recria a categoria — o
   * documento continua existindo, então ela não volta no próximo boot. Some de vez.
   */
  async function handleDelete(id: string) {
    if (!onDeleteCategory) return false;

    const target = categories.find((cat) => cat.id === id);
    const ok = await confirm({
      title: `Excluir ${target?.name ?? 'categoria'}?`,
      message: 'Ela sai da lista pra novos lançamentos. Os lançamentos antigos continuam como estão, e não dá pra trazer a categoria de volta.',
      confirmLabel: 'Excluir',
      danger: true
    });
    if (!ok) return false;

    // Sem estado de "excluindo" aqui: quem desabilita o botão durante a exclusão é o próprio
    // `CategoryForm`, que tem o estado local dele. Duplicar aqui só criaria estado morto.
    await onDeleteCategory(id);
    if (value === id) onChange('');
    return true;
  }

  function renderTile(cat: Category) {
    const isSelected = cat.id === value;
    return (
      <button
        key={cat.id}
        type="button"
        className={`category-tile${isSelected && !manage ? ' category-tile--selected' : ''}`}
        onClick={() => (manage ? startEdit(cat) : pick(cat.id))}
      >
        <span className="category-tile-mark" style={{ background: resolveCategoryColor(cat) }}>
          <CategoryIcon icon={cat.icon} size={20} />
        </span>
        <span className="category-tile-name">{cat.name}</span>
        {/* Só UM adorno por canto: a lixeira saiu daqui porque disputava o canto com o lápis.
            Excluir vive no formulário de edição — e o sistema não põe ação destrutiva a um
            toque em lista rolável (ver docs/design/DESIGN.md). */}
        {isSelected && !manage && <Check size={14} className="category-tile-check" aria-hidden="true" />}
        {manage && <Pencil size={13} className="category-tile-check" aria-hidden="true" />}
      </button>
    );
  }

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <button className="select-row" type="button" onClick={() => { setOpen(true); setMode('list'); setManage(false); }}>
        <span
          className="select-row-icon select-row-icon--category"
          style={{ background: selected ? resolveCategoryColor(selected) : 'var(--bg-surface-muted)' }}
          aria-hidden="true"
        >
          {selected ? <CategoryIcon icon={selected.icon} size={17} /> : <Tag size={17} />}
        </span>
        <span className="select-row-text">
          {selected ? (
            <span className="select-row-value">{selected.name}</span>
          ) : (
            <span className="select-row-placeholder">Selecione</span>
          )}
        </span>
        <ChevronRight size={18} className="select-row-chevron" aria-hidden="true" />
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={mode === 'form' ? (editingId ? 'Editar categoria' : 'Nova categoria') : 'Selecionar categoria'}
      >
        {mode === 'list' ? (
          <>
            {/* Um tile por categoria selecionável. Folhas de raiz primeiro, depois cada grupo.
                Categoria-pai NÃO aparece como tile: ela é só agrupamento e não recebe
                lançamento — no modo editar vira o cabeçalho tocável do grupo. */}
            {rootLeaves.length > 0 && (
              <div className="category-grid">
                {rootLeaves.map((cat) => renderTile(cat))}
              </div>
            )}

            {parents.map((parent) => (
              <div className="category-group" key={parent.id}>
                {manage && onUpdateCategory ? (
                  <button type="button" className="category-group-header" onClick={() => startEdit(parent)}>
                    <span className="category-group-mark" style={{ background: resolveCategoryColor(parent) }}>
                      <CategoryIcon icon={parent.icon} size={13} />
                    </span>
                    <span className="category-group-name">{parent.name}</span>
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                ) : (
                  <span className="category-group-header">
                    <span className="category-group-mark" style={{ background: resolveCategoryColor(parent) }}>
                      <CategoryIcon icon={parent.icon} size={13} />
                    </span>
                    <span className="category-group-name">{parent.name}</span>
                  </span>
                )}
                <div className="category-grid">
                  {childrenOf(parent.id, selectable).map((cat) => renderTile(cat))}
                </div>
              </div>
            ))}

            <div className="sheet-actions">
              {onCreateCategory && (
                <button className="button button--primary" type="button" onClick={startCreate}>
                  <Plus size={17} aria-hidden="true" /> Nova categoria
                </button>
              )}
              {onUpdateCategory && filtered.length > 0 && (
                <button className="button button--ghost" type="button" onClick={() => setManage((m) => !m)}>
                  <Settings2 size={16} aria-hidden="true" /> {manage ? 'Concluir' : 'Editar categorias'}
                </button>
              )}
              {/* Descoberta da tela dedicada: sem este link ela ficaria escondida em
                  Configurações, e a explicação de subcategoria nunca seria lida. */}
              <Link className="list-toggle" to="/app/settings/categories" onClick={() => setOpen(false)}>
                <FolderTree size={15} aria-hidden="true" /> Organizar em subcategorias
              </Link>
            </div>
            {manage && <p className="sheet-hint">Toque numa categoria para mudar cor, ícone ou nome.</p>}
          </>
        ) : (
          /* `key` remonta o formulário ao alternar criar/editar, resetando os campos sem
             efeito de sincronização. O mesmo componente serve a tela /app/settings/categories. */
          <CategoryForm
            key={editingId ?? 'new'}
            editing={editingCategory}
            editingColor={editingCategory ? resolveCategoryColor(editingCategory) : undefined}
            filterType={filterType}
            parentOptions={parentCandidates(allActive, editingId)}
            deleteBlockedReason={
              deleteCheck && !deleteCheck.ok
                ? `Esta categoria tem ${deleteCheck.blockedByChildren} subcategoria${deleteCheck.blockedByChildren > 1 ? 's' : ''}. Exclua ou mova elas antes.`
                : null
            }
            onSubmit={handleSubmit}
            onDelete={editingId && onDeleteCategory ? () => handleDelete(editingId) : undefined}
            onDeleted={() => setMode('list')}
            onCancel={() => setMode('list')}
          />
        )}
      </BottomSheet>
      {confirmDialog}
    </div>
  );
});
