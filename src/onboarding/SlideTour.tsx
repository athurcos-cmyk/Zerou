import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useFocusTrap } from '../utils/useFocusTrap';

export interface TourSlide {
  icon: ReactNode;
  title: string;
  text: string;
}

interface SlideTourProps {
  open: boolean;
  slides: TourSlide[];
  ariaLabel: string;
  onClose: () => void;
  /** Rótulo do botão no último slide. Padrão "Entendi". */
  lastLabel?: string;
}

/**
 * Carrossel de slides genérico — extraído do `WelcomeTour` original pra ser reusado por
 * qualquer tutorial de tela (ver `AnalysisTour`). Sem estado de "já viu"/auto-abertura:
 * isso fica no store específico de cada tour (`welcomeTour.store.ts`, `analysisTour.store.ts`).
 */
export function SlideTour({ open, slides, ariaLabel, onClose, lastLabel = 'Entendi' }: SlideTourProps) {
  const [index, setIndex] = useState(0);
  const tourRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(open, tourRef);

  // Sempre começa do primeiro slide ao (re)abrir.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  if (!open) return null;

  const slide = slides[index];
  const isLast = index === slides.length - 1;

  return (
    <div className="welcome-tour" role="dialog" aria-modal="true" aria-label={ariaLabel} ref={tourRef}>
      <div className="welcome-tour-card">
        <button className="welcome-tour-skip" type="button" onClick={onClose}>
          Pular
        </button>

        <div className="welcome-tour-icon" aria-hidden="true">{slide.icon}</div>
        <h2 className="welcome-tour-title">{slide.title}</h2>
        <p className="welcome-tour-text">{slide.text}</p>

        <div className="welcome-tour-dots" aria-hidden="true">
          {slides.map((item, i) => (
            <span key={item.title} className={`welcome-tour-dot${i === index ? ' welcome-tour-dot--active' : ''}`} />
          ))}
        </div>

        <div className="welcome-tour-nav">
          {index > 0 ? (
            <button className="button button--subtle" type="button" onClick={() => setIndex((i) => i - 1)}>
              <ArrowLeft size={18} aria-hidden="true" /> Voltar
            </button>
          ) : (
            <span />
          )}
          {isLast ? (
            <button className="button button--primary" type="button" onClick={onClose}>
              {lastLabel}
            </button>
          ) : (
            <button className="button button--primary" type="button" onClick={() => setIndex((i) => i + 1)}>
              Próximo <ArrowRight size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
