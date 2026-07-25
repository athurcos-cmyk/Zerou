import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { centsToInputValue, parseMoneyToCents } from './money';

interface NextMonthProjectionSheetProps {
  open: boolean;
  /** Salário já salvo no perfil, ou `undefined` se ainda não configurado. */
  currentProjectedSalaryCents?: number;
  onSave: (projectedSalaryCents: number) => void;
  onRemove: () => void;
  onClose: () => void;
}

/**
 * Define/edita o salário previsto do card "Projeção do próximo mês" (Dashboard). Nunca
 * aceita 0 — bloqueado aqui na UI e de novo em `firestore.rules` (`validProjectedSalaryCents`).
 */
export function NextMonthProjectionSheet({
  open,
  currentProjectedSalaryCents,
  onSave,
  onRemove,
  onClose
}: NextMonthProjectionSheetProps) {
  const [amount, setAmount] = useState('');
  const wasOpen = useRef(false);

  // Sincroniza com o perfil só na ABERTURA da sheet, nunca a cada mudança do valor salvo —
  // um snapshot do Firestore chegando com a sheet aberta (o próprio write anterior
  // voltando, por exemplo) reverteria o que a pessoa está digitando agora. Mesmo cuidado
  // de `AvailableModeSheet.tsx`/`PaydaySettingsPage.tsx`.
  useEffect(() => {
    if (open && !wasOpen.current) {
      setAmount(currentProjectedSalaryCents ? centsToInputValue(currentProjectedSalaryCents) : '');
    }
    wasOpen.current = open;
  }, [open, currentProjectedSalaryCents]);

  const amountCents = amount.trim() ? parseMoneyToCents(amount) : 0;
  const canSave = amountCents > 0;

  function handleSave() {
    if (!canSave) return;
    onSave(amountCents);
    onClose();
  }

  function handleRemove() {
    onRemove();
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Projeção do próximo mês"
      subtitle="Quanto você espera receber, pra ver o que sobraria depois de pagar tudo que já está comprometido."
    >
      <div className="form-stack">
        <label className="field">
          <span>Salário previsto</span>
          <input
            className="input input--money"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0,00"
            autoFocus
          />
        </label>
        <p className="text-muted" style={{ fontSize: '0.82rem', margin: 0 }}>
          Só uma simulação com o que você informar aqui — não é dinheiro garantido, e não muda seu Disponível
          nem seu saldo real. Edite quando o valor mudar.
        </p>
        <div className="sheet-actions">
          <button className="button button--primary" type="button" disabled={!canSave} onClick={handleSave}>
            Salvar
          </button>
          {currentProjectedSalaryCents ? (
            <button className="button button--ghost" type="button" onClick={handleRemove}>
              Remover projeção
            </button>
          ) : null}
        </div>
      </div>
    </BottomSheet>
  );
}
