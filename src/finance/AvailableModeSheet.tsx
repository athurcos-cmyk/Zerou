import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, PiggyBank, Scale, Wallet } from 'lucide-react';
import { BottomSheet } from '../components/BottomSheet';
import { formatMoney } from './money';
import { availableModeLabels, availableModeSummaries, defaultAvailableMode } from './availableMode';
import type { AvailableMode } from '../types/contracts';

interface AvailableModeSheetProps {
  open: boolean;
  /** Modo já salvo no perfil, ou `undefined` se a pessoa ainda não escolheu. */
  currentMode?: AvailableMode;
  onChoose: (mode: AvailableMode) => void;
  onClose: () => void;
}

const steps = [
  {
    icon: <Wallet size={22} aria-hidden="true" />,
    title: 'Saldo total',
    body: 'É a soma do que existe nas suas contas agora. Não desconta nada.'
  },
  {
    icon: <Scale size={22} aria-hidden="true" />,
    title: 'Comprometido',
    body: 'É o que já tem dono: contas a pagar, recorrências e faturas do cartão. Você escolhe abaixo o que entra nessa conta.'
  },
  {
    icon: <PiggyBank size={22} aria-hidden="true" />,
    title: 'Disponível',
    body: 'É o Saldo total menos o Comprometido. É o número que responde "posso gastar isso sem me enrolar?".'
  }
];

// Exemplo fixo: R$ 1.000 na conta e uma parcela de cartão de R$ 300 que vence em ~3
// semanas, com o próximo salário caindo antes disso. É o caso que separa os dois modos.
const exampleBalanceCents = 100000;
const exampleInstallmentCents = 30000;

const modeExample: Record<AvailableMode, { committedCents: number; caption: string }> = {
  conservative: {
    committedCents: exampleInstallmentCents,
    caption: 'Não conta com o salário: guarda a parcela que vence logo.'
  },
  until_payday: {
    committedCents: 0,
    caption: 'Você recebe antes de a parcela vencer, então ela não pesa agora.'
  }
};

export function AvailableModeSheet({ open, currentMode, onChoose, onClose }: AvailableModeSheetProps) {
  const [selected, setSelected] = useState<AvailableMode>(currentMode ?? defaultAvailableMode);
  const wasOpen = useRef(false);

  // Sincroniza com o perfil só na ABERTURA do sheet, nunca a cada mudança de
  // `currentMode`. Um snapshot do Firestore chegando com o sheet aberto (o próprio
  // write anterior voltando, por exemplo) reverteria a escolha que a pessoa acabou de
  // clicar — mesmo problema que `hasLocalOverride` resolve em `appearance.store.ts` e
  // em `PaydaySettingsPage`.
  useEffect(() => {
    if (open && !wasOpen.current) setSelected(currentMode ?? defaultAvailableMode);
    wasOpen.current = open;
  }, [open, currentMode]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Como ler o seu resumo"
      subtitle="Três números, e uma escolha sua no final."
    >
      <div className="form-stack">
        <ol className="available-mode-steps">
          {steps.map((step) => (
            <li key={step.title}>
              <span className="available-mode-step-icon">{step.icon}</span>
              <div>
                <strong>{step.title}</strong>
                <span className="text-secondary">{step.body}</span>
              </div>
            </li>
          ))}
        </ol>

        <div className="available-mode-example">
          <p className="eyebrow">Um exemplo</p>
          <p className="text-secondary">
            Você tem <strong>{formatMoney(exampleBalanceCents)}</strong> na conta e uma parcela de cartão de{' '}
            <strong>{formatMoney(exampleInstallmentCents)}</strong> que vence em umas 3 semanas — mas seu próximo salário
            cai antes disso. Quanto o app deve dizer que está disponível?
          </p>
        </div>

        <div className="choice-list">
          {(Object.keys(availableModeLabels) as AvailableMode[]).map((mode) => {
            const example = modeExample[mode];
            const isSelected = selected === mode;

            return (
              <button
                key={mode}
                type="button"
                className={`choice-card${isSelected ? ' choice-card--selected' : ''}`}
                aria-pressed={isSelected}
                onClick={() => setSelected(mode)}
              >
                <span className="choice-card-label">
                  <strong>{availableModeLabels[mode]}</strong>
                  <span className="text-secondary">{availableModeSummaries[mode]}</span>
                  <span className="available-mode-preview">
                    Disponível: <strong>{formatMoney(exampleBalanceCents - example.committedCents)}</strong>
                    {' · '}
                    Comprometido: <strong>{formatMoney(example.committedCents)}</strong>
                  </span>
                  <span className="text-muted available-mode-caption">{example.caption}</span>
                </span>
                <span className={`choice-card-radio${isSelected ? ' choice-card-radio--on' : ''}`} aria-hidden="true">
                  {isSelected && <CheckCircle2 size={20} />}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-muted available-mode-footnote">
          Nenhuma escolha é definitiva — dá pra trocar quando quiser em Configurações › Recebimento, e rever esta
          explicação por lá também.
        </p>

        <div className="sheet-actions available-mode-actions">
          <button className="button button--primary" type="button" onClick={() => onChoose(selected)}>
            Usar “{availableModeLabels[selected]}”
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
