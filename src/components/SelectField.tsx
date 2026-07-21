import { memo, useState, type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { BottomSheet } from './BottomSheet';

export interface SheetOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SheetOption[];
  placeholder?: string;
  /** Optional leading icon shown on the field row. */
  leading?: ReactNode;
  sheetTitle?: string;
  sheetSubtitle?: string;
  /** Show a search box inside the sheet when there are many options. */
  searchable?: boolean;
}

export const SelectField = memo(function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'Selecione',
  leading,
  sheetTitle,
  sheetSubtitle,
  searchable = false
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((opt) => opt.value === value);

  const filtered = searchable && query.trim()
    ? options.filter((opt) => opt.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function handlePick(next: string) {
    onChange(next);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <button className="select-row" type="button" onClick={() => setOpen(true)}>
        {(selected?.icon ?? leading) && (
          <span className="select-row-icon" aria-hidden="true">{selected?.icon ?? leading}</span>
        )}
        <span className="select-row-text">
          {selected ? (
            <>
              <span className="select-row-value">{selected.label}</span>
              {selected.description && <span className="select-row-desc">{selected.description}</span>}
            </>
          ) : (
            <span className="select-row-placeholder">{placeholder}</span>
          )}
        </span>
        <ChevronRight size={18} className="select-row-chevron" aria-hidden="true" />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={sheetTitle ?? label} subtitle={sheetSubtitle}>
        {searchable && (
          <input
            className="input sheet-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome"
            aria-label="Buscar"
            autoFocus
          />
        )}
        <div className="sheet-option-list">
          {filtered.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                className={`sheet-option${isSelected ? ' sheet-option--selected' : ''}`}
                type="button"
                onClick={() => handlePick(opt.value)}
              >
                {opt.icon && <span className="sheet-option-icon" aria-hidden="true">{opt.icon}</span>}
                <span className="sheet-option-text">
                  <span className="sheet-option-label">{opt.label}</span>
                  {opt.description && <span className="sheet-option-desc">{opt.description}</span>}
                </span>
                <span className={`sheet-radio${isSelected ? ' sheet-radio--on' : ''}`} aria-hidden="true">
                  {isSelected && <Check size={14} />}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="sheet-empty">Nada encontrado.</p>}
        </div>
      </BottomSheet>
    </div>
  );
});
