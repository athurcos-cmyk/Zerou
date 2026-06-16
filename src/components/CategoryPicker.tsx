import { useState, type FormEvent } from 'react';
import {
  Briefcase, Sparkles, Home, UtensilsCrossed, Car, HeartPulse, Smile,
  Repeat, SlidersHorizontal, ShoppingBag, Shirt, Plane, GraduationCap,
  Dumbbell, Gamepad2, Music, BookOpen, Coffee, Dog, Baby, Gift,
  Wrench, Smartphone, Landmark, TrendingUp, Banknote, X, Plus, Check
} from 'lucide-react';
import type { Category } from '../types/contracts';

export const categoryIconMap: Record<string, React.ReactNode> = {
  'briefcase':    <Briefcase size={18} />,
  'sparkles':     <Sparkles size={18} />,
  'home':         <Home size={18} />,
  'utensils':     <UtensilsCrossed size={18} />,
  'car':          <Car size={18} />,
  'heart-pulse':  <HeartPulse size={18} />,
  'smile':        <Smile size={18} />,
  'repeat':       <Repeat size={18} />,
  'sliders':      <SlidersHorizontal size={18} />,
  'shopping-bag': <ShoppingBag size={18} />,
  'shirt':        <Shirt size={18} />,
  'plane':        <Plane size={18} />,
  'graduation':   <GraduationCap size={18} />,
  'dumbbell':     <Dumbbell size={18} />,
  'gamepad':      <Gamepad2 size={18} />,
  'music':        <Music size={18} />,
  'book':         <BookOpen size={18} />,
  'coffee':       <Coffee size={18} />,
  'pet':          <Dog size={18} />,
  'baby':         <Baby size={18} />,
  'gift':         <Gift size={18} />,
  'tools':        <Wrench size={18} />,
  'phone':        <Smartphone size={18} />,
  'bank':         <Landmark size={18} />,
  'investment':   <TrendingUp size={18} />,
  'money':        <Banknote size={18} />,
};

const allIconKeys = Object.keys(categoryIconMap);

interface CategoryPickerProps {
  value: string;
  onChange: (id: string) => void;
  categories: Category[];
  filterType?: 'income' | 'expense' | 'both' | 'all';
  onCreateCategory?: (name: string, icon: string, type: 'income' | 'expense' | 'both') => Promise<void>;
  onDeleteCategory?: (id: string) => Promise<void>;
}

export function CategoryPicker({ value, onChange, categories, filterType = 'all', onCreateCategory, onDeleteCategory }: CategoryPickerProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('shopping-bag');
  const [newType, setNewType] = useState<'income' | 'expense' | 'both'>('expense');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = categories.filter((cat) => {
    if (!cat.isActive) return false;
    if (filterType === 'all') return true;
    return cat.type === filterType || cat.type === 'both';
  });

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim() || !onCreateCategory) return;
    setCreating(true);
    try {
      await onCreateCategory(newName.trim(), newIcon, newType);
      setNewName('');
      setNewIcon('shopping-bag');
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, event: React.MouseEvent) {
    event.stopPropagation();
    if (!onDeleteCategory) return;
    setDeletingId(id);
    try {
      await onDeleteCategory(id);
      if (value === id) onChange('');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="category-picker">
      <div className="category-picker-grid">
        <button
          className={`category-option category-option--none${!value ? ' category-option--selected' : ''}`}
          type="button"
          onClick={() => onChange('')}
          aria-pressed={!value}
        >
          <span className="category-option-icon">—</span>
          <span>Sem categoria</span>
        </button>

        {filtered.map((cat) => {
          const icon = categoryIconMap[cat.icon ?? ''] ?? categoryIconMap['sliders'];
          const isSelected = cat.id === value;
          return (
            <button
              key={cat.id}
              className={`category-option${isSelected ? ' category-option--selected' : ''}`}
              type="button"
              onClick={() => onChange(cat.id)}
              aria-pressed={isSelected}
            >
              <span className="category-option-icon" aria-hidden="true">{icon}</span>
              <span>{cat.name}</span>
              {onDeleteCategory && !cat.isDefault && (
                <button
                  className="category-option-delete"
                  type="button"
                  aria-label={`Excluir ${cat.name}`}
                  disabled={deletingId === cat.id}
                  onClick={(e) => void handleDelete(cat.id, e)}
                >
                  <X size={12} />
                </button>
              )}
              {isSelected && <Check size={13} className="category-option-check" aria-hidden="true" />}
            </button>
          );
        })}

        {onCreateCategory && (
          <button
            className="category-option category-option--add"
            type="button"
            onClick={() => setShowCreate(true)}
          >
            <span className="category-option-icon"><Plus size={16} /></span>
            <span>Nova</span>
          </button>
        )}
      </div>

      {showCreate && (
        <form className="category-create-form" onSubmit={(e) => void handleCreate(e)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>Nova categoria</strong>
            <button className="icon-button" type="button" onClick={() => setShowCreate(false)}><X size={16} /></button>
          </div>
          <div className="form-grid-2">
            <label className="field">
              <span>Nome</span>
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Pets, Streaming..." autoFocus />
            </label>
            <label className="field">
              <span>Tipo</span>
              <div className="segmented" style={{ width: '100%' }}>
                {(['expense', 'income', 'both'] as const).map((t) => (
                  <button key={t} type="button" style={{ flex: 1 }} aria-pressed={newType === t} onClick={() => setNewType(t)}>
                    {t === 'expense' ? 'Gasto' : t === 'income' ? 'Receita' : 'Ambos'}
                  </button>
                ))}
              </div>
            </label>
          </div>
          <div>
            <span className="field-label" style={{ display: 'block', marginBottom: '0.5rem' }}>Ícone</span>
            <div className="category-icon-grid">
              {allIconKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`category-icon-option${newIcon === key ? ' category-icon-option--selected' : ''}`}
                  aria-pressed={newIcon === key}
                  onClick={() => setNewIcon(key)}
                >
                  {categoryIconMap[key]}
                </button>
              ))}
            </div>
          </div>
          <div className="button-row" style={{ marginTop: '0.75rem' }}>
            <button className="button button--primary" type="submit" disabled={creating || !newName.trim()}>
              {creating ? 'Criando...' : 'Criar categoria'}
            </button>
            <button className="button button--ghost" type="button" onClick={() => setShowCreate(false)}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
