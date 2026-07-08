import { Eye, PiggyBank, Scale, type LucideIcon } from 'lucide-react';
import { BottomSheet } from '../../components/BottomSheet';
import type { CoupleMode } from '../../types/contracts';

interface CoupleModeOption {
  id: CoupleMode;
  icon: LucideIcon;
  label: string;
  desc: string;
  more?: string;
}

export const coupleModeOptions: CoupleModeOption[] = [
  {
    id: 'savings_only',
    icon: PiggyBank,
    label: 'Só o cofrinho',
    desc: 'Juntamos dinheiro pra objetivos em comum. Simples assim.',
    more: 'Despesas podem ser ativadas depois'
  },
  {
    id: 'transparent',
    icon: Eye,
    label: 'Transparência',
    desc: 'Cada um vê o que o outro pagou nas despesas divididas. Sem cálculo de dívida.',
    more: 'Equilíbrio pode ser ativado depois'
  },
  {
    id: 'balanced',
    icon: Scale,
    label: 'Equilíbrio',
    desc: 'Vemos quem está cobrindo mais no mês, em proporção. Sem acerto formal.'
  }
];

export const coupleModeLabels: Record<CoupleMode, string> = {
  savings_only: 'Só o cofrinho',
  transparent: 'Transparência',
  balanced: 'Equilíbrio'
};

interface CoupleModeSheetProps {
  open: boolean;
  onClose: () => void;
  purpose: 'create' | 'change';
  selectedMode: CoupleMode;
  onSelect: (mode: CoupleMode) => void;
  onConfirm: () => void;
}

/** Single source for the mode-picker list — used both when creating the space and when changing its mode later. */
export function CoupleModeSheet({ open, onClose, purpose, selectedMode, onSelect, onConfirm }: CoupleModeSheetProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={purpose === 'create' ? 'Como vocês querem usar?' : 'Modo do espaço'}
      subtitle="Podem mudar a qualquer momento."
    >
      <div className="form-stack">
        {coupleModeOptions.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              className={`couple-mode-card${selectedMode === opt.id ? ' couple-mode-card--selected' : ''}`}
              onClick={() => onSelect(opt.id)}
            >
              <span className={`couple-mode-icon couple-mode-icon--${opt.id.replace('_', '-')}`}>
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="couple-mode-text">
                <strong>{opt.label}</strong>
                <span>{opt.desc}</span>
                {opt.more && <span className="couple-mode-more">{opt.more}</span>}
              </span>
            </button>
          );
        })}
        <div className="sheet-actions">
          <button className="button button--primary" type="button" onClick={onConfirm}>
            {purpose === 'create' ? 'Criar espaço' : 'Confirmar'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
