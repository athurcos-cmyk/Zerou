import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
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

// Swipe-to-dismiss: além do threshold de distância, um flick rápido (velocidade
// alta com deslocamento menor) também fecha — é o que o dedo espera de sheet nativa.
const DRAG_ACTIVATE_PX = 8;
const DISMISS_DISTANCE_PX = 90;
const DISMISS_FLICK_PX = 24;
const DISMISS_FLICK_VELOCITY = 0.5; // px/ms

export function BottomSheet({ open, onClose, title, subtitle, children, bare = false }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startY: number; startTime: number; delta: number; captured: boolean } | null>(null);

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

  // Gesto restrito à zona do grabber/header — nunca ao corpo, senão briga com o
  // scroll interno das sheets longas (CategoryField, SelectField). ESC, backdrop
  // e o X continuam funcionando; o gesto é camada adicional, não substituto.
  function handleDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragRef.current = { startY: event.clientY, startTime: performance.now(), delta: 0, captured: false };
  }

  function handleDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || !panel) return;
    const delta = event.clientY - drag.startY;
    if (!drag.captured) {
      // Threshold antes de capturar o ponteiro: preserva os cliques no X e no header.
      if (delta < DRAG_ACTIVATE_PX) return;
      drag.captured = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    drag.delta = Math.max(0, delta);
    panel.style.transition = 'none';
    panel.style.transform = `translateY(${drag.delta}px)`;
  }

  function handleDragEnd() {
    const drag = dragRef.current;
    const panel = panelRef.current;
    dragRef.current = null;
    if (!drag || !drag.captured || !panel) return;
    const elapsed = Math.max(1, performance.now() - drag.startTime);
    const velocity = drag.delta / elapsed;
    const shouldDismiss =
      drag.delta > DISMISS_DISTANCE_PX || (drag.delta > DISMISS_FLICK_PX && velocity > DISMISS_FLICK_VELOCITY);
    if (shouldDismiss) {
      // Mesmo caminho do backdrop/ESC — em ConfirmDialog isso equivale a "cancelar".
      onClose();
      return;
    }
    panel.style.transition = 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)';
    panel.style.transform = 'translateY(0)';
  }

  return createPortal(
    <div className="sheet-root" role="dialog" aria-modal="true" aria-label={title || 'Painel'}>
      <button className="sheet-backdrop" type="button" aria-label="Fechar" onClick={onClose} />
      <div className="sheet-panel" ref={panelRef}>
        <div
          className="sheet-drag-zone"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
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
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
