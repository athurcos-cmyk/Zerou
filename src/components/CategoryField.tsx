import { memo, useState, type FormEvent } from 'react';
import { Check, ChevronRight, Pencil, Plus, Settings2, Tag, Trash2, X } from 'lucide-react';
import type { Category } from '../types/contracts';
import { BottomSheet } from './BottomSheet';
import { useConfirm } from './ConfirmDialog';
import {
  CategoryIcon, categoryColors, categoryIconGroups, resolveCategoryColor
} from './categoryIcons';
import { ACCENT_FOREGROUND } from '../theme/palette';

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

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('shopping-bag');
  const [color, setColor] = useState(categoryColors[0]);
  const [type, setType] = useState<'income' | 'expense' | 'both'>('expense');
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = categories.filter((cat) => {
    if (!cat.isActive) return false;
    if (filterType === 'all') return true;
    return cat.type === filterType || cat.type === 'both';
  });
  const selected = filtered.find((cat) => cat.id === value);

  function startCreate() {
    setEditingId(null);
    setName('');
    setIcon('shopping-bag');
    setColor(categoryColors[0]);
    setType(filterType === 'income' ? 'income' : 'expense');
    setMode('form');
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setName(cat.name);
    setIcon(cat.icon ?? 'shopping-bag');
    setColor(resolveCategoryColor(cat));
    setType(cat.type);
    setMode('form');
  }

  async function handleSubmit(event: FormEvent) {
    // O sheet é renderizado via portal (BottomSheet/createPortal), mas continua
    // filho do <form> externo (transação/conta/recorrência) na árvore React —
    // sem stopPropagation, o submit daqui também dispara o onSubmit de fora e
    // salva o registro pai incompleto junto com a categoria.
    event.preventDefault();
    event.stopPropagation();
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (editingId) {
        if (onUpdateCategory) await onUpdateCategory(editingId, { name: name.trim(), icon, color });
      } else if (onCreateCategory) {
        await onCreateCategory(name.trim(), icon, type, color);
      }
      setMode('list');
      setManage(false);
    } finally {
      setBusy(false);
    }
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

    setDeletingId(id);
    try {
      await onDeleteCategory(id);
      if (value === id) onChange('');
      return true;
    } finally {
      setDeletingId(null);
    }
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
          <form className="category-create" onSubmit={(event) => void handleSubmit(event)}>
            <div className="category-create-preview">
              <span className="category-tile-mark category-tile-mark--lg" style={{ background: color }}>
                <CategoryIcon icon={icon} size={26} />
              </span>
            </div>

            <label className="field">
              <span>Nome</span>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Pets, Streaming, Uber..." autoFocus />
            </label>

            {!editingId && filterType === 'all' && (
              <div className="field">
                <span className="field-label">Tipo</span>
                <div className="segmented" role="radiogroup" aria-label="Tipo de categoria">
                  {(['expense', 'income', 'both'] as const).map((t) => (
                    <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)}>
                      {t === 'expense' ? 'Gasto' : t === 'income' ? 'Receita' : 'Ambos'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="field">
              <span className="field-label">Cor</span>
              <div className="color-grid" role="radiogroup" aria-label="Cor">
                {categoryColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-dot${color === c ? ' color-dot--selected' : ''}`}
                    style={{ background: c, color: c }}
                    aria-label={`Cor ${c}`}
                    role="radio"
                    aria-checked={color === c}
                    onClick={() => setColor(c)}
                  >
                    {color === c && <Check size={15} color={ACCENT_FOREGROUND} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Agrupado por tema: com ~120 ícones, uma grade plana viraria rolagem cega. Cada
                grupo é um radiogroup próprio, com o rótulo da seção como nome acessível. */}
            <div className="field">
              <span className="field-label">Ícone</span>
              <div className="icon-picker">
                {categoryIconGroups.map((group) => (
                  <div className="icon-picker-group" key={group.label}>
                    <span className="icon-picker-label">{group.label}</span>
                    <div className="icon-grid" role="radiogroup" aria-label={`Ícone — ${group.label}`}>
                      {Object.keys(group.icons).map((key) => (
                        <button
                          key={key}
                          type="button"
                          className={`icon-cell${icon === key ? ' icon-cell--selected' : ''}`}
                          style={icon === key ? { background: color, borderColor: color, color: ACCENT_FOREGROUND } : undefined}
                          role="radio"
                          aria-checked={icon === key}
                          onClick={() => setIcon(key)}
                        >
                          <CategoryIcon icon={key} size={19} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sheet-actions">
              <button className="button button--primary" type="submit" disabled={busy || !name.trim()}>
                {busy ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar categoria'}
              </button>
              {/* Vale também pras embutidas: `isDefault` bloqueava a exclusão sem explicar
                  por quê, e a pessoa ficava com categorias que nunca usa entupindo a lista.
                  Só volta pra lista se a exclusão foi confirmada de fato. */}
              {editingId && onDeleteCategory && (
                <button
                  className="button button--ghost button--danger-text"
                  type="button"
                  disabled={busy || deletingId === editingId}
                  onClick={() => { void handleDelete(editingId).then((deleted) => { if (deleted) setMode('list'); }); }}
                >
                  <Trash2 size={16} aria-hidden="true" /> Excluir categoria
                </button>
              )}
              <button className="button button--ghost" type="button" onClick={() => setMode('list')}>
                <X size={16} aria-hidden="true" /> Cancelar
              </button>
            </div>
          </form>
        )}
      </BottomSheet>
      {confirmDialog}
    </div>
  );
});
