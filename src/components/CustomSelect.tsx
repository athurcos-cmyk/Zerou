import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
}

export function CustomSelect({ value, onChange, options, placeholder = 'Escolha uma opção', id }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function handleKey(event: React.KeyboardEvent) {
    if (event.key === 'Escape') setOpen(false);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen((prev) => !prev);
    }
  }

  return (
    <div className="custom-select" ref={containerRef}>
      <button
        id={id}
        className={`custom-select-trigger${open ? ' custom-select-trigger--open' : ''}`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleKey}
      >
        <span className="custom-select-value">
          {selected ? (
            <>
              {selected.icon && <span className="custom-select-icon" aria-hidden="true">{selected.icon}</span>}
              <span>{selected.label}</span>
            </>
          ) : (
            <span className="custom-select-placeholder">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={16} className={`custom-select-chevron${open ? ' custom-select-chevron--open' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="custom-select-dropdown" role="listbox" aria-label="Opções">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`custom-select-option${opt.value === value ? ' custom-select-option--selected' : ''}`}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.icon && <span className="custom-select-icon" aria-hidden="true">{opt.icon}</span>}
              <span className="custom-select-option-text">
                <span>{opt.label}</span>
                {opt.description && <span className="custom-select-option-desc">{opt.description}</span>}
              </span>
              {opt.value === value && <Check size={15} className="custom-select-check" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
