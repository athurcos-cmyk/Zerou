import { useState, type FormEvent } from 'react';
import { Check, ChevronRight, Trash2, X } from 'lucide-react';
import type { Category } from '../types/contracts';
import { BottomSheet } from './BottomSheet';
import {
  CategoryIcon, categoryColors, categoryIconGroups, categoryIconKeys, iconGroupIndexOf
} from './categoryIcons';
import { ACCENT_FOREGROUND } from '../theme/palette';

export interface CategoryFormValues {
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense' | 'both';
}

interface CategoryFormProps {
  /** `null` = criar. Categoria = editar (nome/ícone/cor pré-preenchidos). */
  editing?: Category | null;
  /** Cor inicial ao editar — vem resolvida por quem chama (`resolveCategoryColor`). */
  editingColor?: string;
  /** Quando `all`, o formulário deixa escolher o tipo (só na criação). */
  filterType?: 'income' | 'expense' | 'both' | 'all';
  onSubmit: (values: CategoryFormValues) => Promise<void>;
  /** Devolve `true` se a exclusão foi confirmada e executada. */
  onDelete?: () => Promise<boolean>;
  onCancel: () => void;
  onDeleted?: () => void;
}

/**
 * Formulário de categoria: nome, tipo, 24 cores, 122 ícones (em folha própria) e as ações.
 *
 * Extraído do `CategoryField` para ser usado nos DOIS lugares que criam/editam categoria — a
 * folha do seletor (dentro de um lançamento) e a tela dedicada `/app/settings/categories`.
 * Duplicar isso garantiria divergência: é a mesma classe de problema que fez existirem 21
 * closures duplicadas de categoria neste código antes de `useCategoryActions`.
 *
 * **O estado dos campos vive aqui.** Quem chama controla criar-vs-editar pela prop `editing` e
 * deve passar `key` (ex.: `key={editingId ?? 'new'}`) para o React remontar e resetar os campos
 * ao alternar entre os dois — mais simples e menos frágil que sincronizar por efeito.
 */
export function CategoryForm({
  editing = null,
  editingColor,
  filterType = 'all',
  onSubmit,
  onDelete,
  onCancel,
  onDeleted
}: CategoryFormProps) {
  const [name, setName] = useState(editing?.name ?? '');
  const [icon, setIcon] = useState(editing?.icon ?? 'shopping-bag');
  const [color, setColor] = useState(editingColor ?? categoryColors[0]);
  const [type, setType] = useState<'income' | 'expense' | 'both'>(
    editing?.type ?? (filterType === 'income' ? 'income' : 'expense')
  );
  const [iconSheetOpen, setIconSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Grupo do ícone escolhido — vira o subtítulo da linha ("Comida e bebida"), pra ela dizer algo
  // além de repetir o desenho que já está no tile ao lado.
  const activeIconGroup = categoryIconGroups[iconGroupIndexOf(icon)] ?? categoryIconGroups[0];

  async function handleSubmit(event: FormEvent) {
    // O formulário pode ser renderizado dentro de um `BottomSheet` (portal), mas continua filho
    // do <form> externo (transação/conta/recorrência) na árvore React — sem `stopPropagation` o
    // submit daqui dispararia o onSubmit de fora e salvaria o registro pai incompleto.
    event.preventDefault();
    event.stopPropagation();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), icon, color, type });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      if (await onDelete()) onDeleted?.();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form className="category-create" onSubmit={(event) => void handleSubmit(event)}>
      <div className="category-create-preview">
        <span className="category-tile-mark category-tile-mark--lg" style={{ background: color }}>
          <CategoryIcon icon={icon} size={26} />
        </span>
      </div>

      <label className="field">
        <span>Nome</span>
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex: Pets, Streaming, Uber..."
          autoFocus
        />
      </label>

      {!editing && filterType === 'all' && (
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

      {/* Escolher ícone vive numa folha própria: com 122 ícones, grade rolável dentro de um sheet
          que também rola esconde o tamanho do conteúdo (não se sabe se ainda tem ícone embaixo),
          e trilho de chips dependia da pessoa adivinhar que dava pra arrastar de lado. */}
      <div className="field">
        <span className="field-label">Ícone</span>
        <button className="select-row" type="button" onClick={() => setIconSheetOpen(true)}>
          <span className="select-row-icon select-row-icon--category" style={{ background: color }} aria-hidden="true">
            <CategoryIcon icon={icon} size={17} />
          </span>
          <span className="select-row-text">
            <span className="select-row-value">{activeIconGroup.label}</span>
          </span>
          <ChevronRight size={18} className="select-row-chevron" aria-hidden="true" />
        </button>
      </div>

      <div className="sheet-actions">
        <button className="button button--primary" type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar categoria'}
        </button>
        {editing && onDelete && (
          <button
            className="button button--ghost button--danger-text"
            type="button"
            disabled={busy || deleting}
            onClick={() => void handleDelete()}
          >
            <Trash2 size={16} aria-hidden="true" /> Excluir categoria
          </button>
        )}
        <button className="button button--ghost" type="button" onClick={onCancel}>
          <X size={16} aria-hidden="true" /> Cancelar
        </button>
      </div>

      <BottomSheet
        open={iconSheetOpen}
        onClose={() => setIconSheetOpen(false)}
        title="Escolher ícone"
        subtitle={`${categoryIconKeys.length} ícones`}
      >
        <div className="icon-sheet">
          {categoryIconGroups.map((group) => (
            <div className="icon-sheet-group" key={group.label}>
              <span className="icon-sheet-label">{group.label}</span>
              <div className="icon-grid" role="radiogroup" aria-label={`Ícone — ${group.label}`}>
                {Object.keys(group.icons).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`icon-cell${icon === key ? ' icon-cell--selected' : ''}`}
                    style={icon === key ? { background: color, borderColor: color, color: ACCENT_FOREGROUND } : undefined}
                    role="radio"
                    aria-checked={icon === key}
                    onClick={() => { setIcon(key); setIconSheetOpen(false); }}
                  >
                    <CategoryIcon icon={key} size={19} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </BottomSheet>
    </form>
  );
}
