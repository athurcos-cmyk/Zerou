import { useState, type FormEvent } from 'react';
import { Check, ChevronRight, Plus, Settings2, Tag, Trash2, X } from 'lucide-react';
import type { Category } from '../types/contracts';
import { BottomSheet } from './BottomSheet';
import { CategoryIcon, categoryColors, categoryIconKeys, defaultCategoryColor } from './categoryIcons';

interface CategoryFieldProps {
  label?: string;
  value: string;
  onChange: (id: string) => void;
  categories: Category[];
  filterType?: 'income' | 'expense' | 'both' | 'all';
  onCreateCategory?: (name: string, icon: string, type: 'income' | 'expense' | 'both', color: string) => Promise<void>;
  onDeleteCategory?: (id: string) => Promise<void>;
}

export function CategoryField({
  label = 'Categoria',
  value,
  onChange,
  categories,
  filterType = 'all',
  onCreateCategory,
  onDeleteCategory
}: CategoryFieldProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [manage, setManage] = useState(false);

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

  function reset() {
    setName('');
    setIcon('shopping-bag');
    setColor(categoryColors[0]);
    setType(filterType === 'income' ? 'income' : 'expense');
    setMode('list');
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !onCreateCategory) return;
    setBusy(true);
    try {
      await onCreateCategory(name.trim(), icon, type, color);
      reset();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!onDeleteCategory) return;
    setDeletingId(id);
    try {
      await onDeleteCategory(id);
      if (value === id) onChange('');
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
      <button className="select-row" type="button" onClick={() => { setOpen(true); setMode('list'); }}>
        <span
          className="select-row-icon select-row-icon--category"
          style={{ background: selected?.color ?? (selected ? defaultCategoryColor : 'var(--bg-surface-muted)') }}
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
        title={mode === 'create' ? 'Nova categoria' : 'Selecionar categoria'}
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
                    className={`category-tile${isSelected ? ' category-tile--selected' : ''}`}
                    onClick={() => (manage ? undefined : pick(cat.id))}
                  >
                    <span className="category-tile-mark" style={{ background: cat.color ?? defaultCategoryColor }}>
                      <CategoryIcon icon={cat.icon} size={20} />
                    </span>
                    <span className="category-tile-name">{cat.name}</span>
                    {isSelected && !manage && <Check size={14} className="category-tile-check" aria-hidden="true" />}
                    {manage && onDeleteCategory && !cat.isDefault && (
                      <span
                        className="category-tile-delete"
                        role="button"
                        tabIndex={0}
                        aria-label={`Excluir ${cat.name}`}
                        onClick={(event) => { event.stopPropagation(); void handleDelete(cat.id); }}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); void handleDelete(cat.id); } }}
                      >
                        {deletingId === cat.id ? <span className="spinner-dot" /> : <Trash2 size={13} />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="sheet-actions">
              {onCreateCategory && (
                <button className="button button--primary" type="button" onClick={() => { reset(); setType(filterType === 'income' ? 'income' : 'expense'); setMode('create'); }}>
                  <Plus size={17} aria-hidden="true" /> Nova categoria
                </button>
              )}
              {onDeleteCategory && filtered.some((cat) => !cat.isDefault) && (
                <button className="button button--ghost" type="button" onClick={() => setManage((m) => !m)}>
                  <Settings2 size={16} aria-hidden="true" /> {manage ? 'Concluir' : 'Gerenciar'}
                </button>
              )}
            </div>
          </>
        ) : (
          <form className="category-create" onSubmit={(event) => void handleCreate(event)}>
            <div className="category-create-preview">
              <span className="category-tile-mark category-tile-mark--lg" style={{ background: color }}>
                <CategoryIcon icon={icon} size={26} />
              </span>
            </div>

            <label className="field">
              <span>Nome</span>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Pets, Streaming, Uber..." autoFocus />
            </label>

            {filterType === 'all' && (
              <div className="field">
                <span className="field-label">Tipo</span>
                <div className="segmented">
                  {(['expense', 'income', 'both'] as const).map((t) => (
                    <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>
                      {t === 'expense' ? 'Gasto' : t === 'income' ? 'Receita' : 'Ambos'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="field">
              <span className="field-label">Cor</span>
              <div className="color-grid">
                {categoryColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-dot${color === c ? ' color-dot--selected' : ''}`}
                    style={{ background: c }}
                    aria-label={`Cor ${c}`}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                  >
                    {color === c && <Check size={15} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field-label">Ícone</span>
              <div className="icon-grid">
                {categoryIconKeys.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`icon-cell${icon === key ? ' icon-cell--selected' : ''}`}
                    style={icon === key ? { background: color, borderColor: color, color: '#fff' } : undefined}
                    aria-pressed={icon === key}
                    onClick={() => setIcon(key)}
                  >
                    <CategoryIcon icon={key} size={19} />
                  </button>
                ))}
              </div>
            </div>

            <div className="sheet-actions">
              <button className="button button--primary" type="submit" disabled={busy || !name.trim()}>
                {busy ? 'Criando...' : 'Criar categoria'}
              </button>
              <button className="button button--ghost" type="button" onClick={() => setMode('list')}>
                <X size={16} aria-hidden="true" /> Cancelar
              </button>
            </div>
          </form>
        )}
      </BottomSheet>
    </div>
  );
}
