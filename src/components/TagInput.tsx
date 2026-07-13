import { type KeyboardEvent, useRef } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export function TagInput({ value, onChange, placeholder = 'Digite e pressione Enter' }: TagInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.trim().toLocaleLowerCase('pt-BR');
    if (!tag) return;
    if (value.includes(tag)) return;
    onChange([...value, tag]);
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const input = e.currentTarget;
      addTag(input.value);
      input.value = '';
    }
    if (e.key === 'Backspace' && !e.currentTarget.value && value.length > 0) {
      removeTag(value.length - 1);
    }
  }

  function handleBlur() {
    const input = inputRef.current;
    if (input && input.value.trim()) {
      addTag(input.value);
      input.value = '';
    }
  }

  return (
    <div className="tag-input" onClick={() => inputRef.current?.focus()}>
      {value.map((tag, i) => (
        <span key={`${tag}-${i}`} className="chip tag-input-chip">
          {tag}
          <button
            type="button"
            className="tag-input-remove"
            aria-label={`Remover tag ${tag}`}
            onClick={(e) => { e.stopPropagation(); removeTag(i); }}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        className="tag-input-field"
        type="text"
        placeholder={value.length === 0 ? placeholder : ''}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </div>
  );
}
