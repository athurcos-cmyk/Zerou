import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from '../utils/useFocusTrap';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Render without the default header (title row + close). */
  bare?: boolean;
}

// Trava de rolagem COMPARTILHADA entre todas as sheets. As sheets empilham (SelectField,
// CategoryField e ConfirmDialog abrem por cima de outra sheet), e salvar/restaurar o
// overflow por instância vaza: a de cima captura o 'hidden' que a de baixo pôs e devolve
// esse mesmo 'hidden' ao fechar. O body fica travado pra sempre — a página não rola mais e,
// no iOS, a nav fixa descola do rodapé e aparece no meio da tela.
//
// Um contador é a única fonte da verdade: nenhuma sheet decide sozinha se pode destravar.
// Restaura pra '' (e não pro valor anterior) porque este é o único lugar do app que escreve
// em `document.body.style.overflow`.
let openSheetCount = 0;

function lockBodyScroll() {
  if (openSheetCount++ === 0) document.body.style.overflow = 'hidden';
  return () => {
    openSheetCount = Math.max(0, openSheetCount - 1);
    if (openSheetCount === 0) document.body.style.overflow = '';
  };
}

// Swipe-to-dismiss: além do threshold de distância, um flick rápido (velocidade
// alta com deslocamento menor) também fecha — é o que o dedo espera de sheet nativa.
const DRAG_ACTIVATE_PX = 8;
const DISMISS_DISTANCE_PX = 90;
const DISMISS_FLICK_PX = 24;
const DISMISS_FLICK_VELOCITY = 0.5; // px/ms

export function BottomSheet({ open, onClose, title, subtitle, children, bare = false }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startY: number; startTime: number; delta: number; captured: boolean } | null>(null);
  // Há conteúdo abaixo do corte? Liga o degradê no rodapé da folha (`.sheet-panel--more`).
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  useFocusTrap(open, panelRef);

  // Separado do ESC de propósito: `onClose` costuma ser arrow inline (ConfirmDialog,
  // AppShell), então muda de identidade a cada render. Junto, a trava soltaria e voltaria
  // a cada render — churn à toa em cima de um estado global.
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Folha longa não avisava que rolava (achado pelo dono no sheet "Nova conta" de Contas e
  // assinaturas, 03/08/2026): 256px de formulário — incluindo o botão de criar — ficavam fora
  // da vista, e o corte caía justamente no espaço ENTRE dois campos, então a folha parecia ter
  // acabado ali. O degradê no rodapé some assim que a rolagem chega ao fim, então o aviso só
  // existe enquanto for verdade.
  //
  // `ResizeObserver` no conteúdo (não só no corpo) porque campo condicional — "Frequência" ao
  // marcar recorrente, "Parcelamento" ao escolher cartão — cresce a folha sem o corpo mudar de
  // tamanho; sem isso o degradê ficaria desatualizado exatamente nos formulários mais longos.
  useEffect(() => {
    if (!open) return;
    const body = bodyRef.current;
    if (!body) return;

    // 8px de folga: `scrollHeight`/`clientHeight` são arredondados e um zoom fracionário deixa
    // sobra de sub-pixel no fim da rolagem, que sem a folga acenderia o degradê pra sempre.
    const update = () => setHasMoreBelow(body.scrollHeight - body.scrollTop - body.clientHeight > 8);
    update();

    body.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(body);
    if (body.firstElementChild) observer.observe(body.firstElementChild);
    return () => {
      body.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [open]);

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
    panel.style.transition = 'transform var(--duration-normal) cubic-bezier(0.22, 1, 0.36, 1)';
    panel.style.transform = 'translateY(0)';
  }

  return createPortal(
    <div className="sheet-root" role="dialog" aria-modal="true" aria-label={title || 'Painel'}>
      <button className="sheet-backdrop" type="button" aria-label="Fechar" onClick={onClose} />
      <div className={`sheet-panel${hasMoreBelow ? ' sheet-panel--more' : ''}`} ref={panelRef}>
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
        <div className="sheet-body" ref={bodyRef}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
