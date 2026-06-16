import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Render without the default header (title row + close). */
  bare?: boolean;
}

export function BottomSheet({ open, onClose, title, subtitle, children, bare = false }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="sheet-root" role="dialog" aria-modal="true" aria-label={title}>
      <button className="sheet-backdrop" type="button" aria-label="Fechar" onClick={onClose} />
      <div className="sheet-panel">
        <div className="sheet-grabber" aria-hidden="true" />
        {!bare && (
          <div className="sheet-header">
            <div className="sheet-header-text">
              {title && <strong>{title}</strong>}
              {subtitle && <span>{subtitle}</span>}
            </div>
            <button className="sheet-close" type="button" aria-label="Fechar" onClick={onClose}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
