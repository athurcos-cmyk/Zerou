import { memo, useState } from 'react';
import { Check, ChevronRight, Pencil, Plus, Settings2, Tag } from 'lucide-react';
import type { Category } from '../types/contracts';
import { BottomSheet } from './BottomSheet';
import { useConfirm } from './ConfirmDialog';
import { CategoryForm } from './CategoryForm';
import { CategoryIcon, resolveCategoryColor } from './categoryIcons';

export interface CategoryPatch {
  name?: string;
  icon?: string;
  color?: string;
}

interface CategoryFieldProps {
  label?: string;
  value: string;
  onChange: (id: string) => void;
  categories: Category[];
  filterType?: 'income' | 'expense' | 'both' | 'all';
  onCreateCategory?: (name: string, icon: string, type: 'income' | 'expense' | 'both', color: string) => Promise<void>;
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


  const filtered = categories.filter((cat) => {
    if (!cat.isActive) return false;
    if (filterType === 'all') return true;
    return cat.type === filterType || cat.type === 'both';
  });
  const selected = filtered.find((cat) => cat.id === value);
  const editingCategory = editingId ? filtered.find((cat) => cat.id === editingId) ?? null : null;

  function startCreate() {
    setEditingId(null);
    setMode('form');
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setMode('form');
  }

  async function handleSubmit(values: { name: string; icon: string; color: string; type: 'income' | 'expense' | 'both' }) {
    if (editingId) {
      if (onUpdateCategory) await onUpdateCategory(editingId, { name: values.name, icon: values.icon, color: values.color });
    } else if (onCreateCategory) {
      await onCreateCategory(values.name, values.icon, values.type, values.color);
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
            <div className="category-grid">
              {filtered.map((cat) => {
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
                    {/* Só UM adorno por canto. A lixeira ficava aqui também, sobreposta ao
                        lápis (`.category-tile-check` em top/right 0.4rem vs `.category-tile-delete`
                        em -0.35rem): dois ícones disputando o mesmo canto. Excluir agora vive
                        dentro do formulário de edição — que é o lugar certo de qualquer jeito,
                        já que o sistema não põe ação destrutiva a um toque em lista rolável
                        (ver docs/design/DESIGN.md). */}
                    {isSelected && !manage && <Check size={14} className="category-tile-check" aria-hidden="true" />}
                    {manage && <Pencil size={13} className="category-tile-check" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

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
