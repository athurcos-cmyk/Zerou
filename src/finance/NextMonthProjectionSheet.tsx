import { useEffect, useRef, useState } from 'react';
import { PiggyBank } from 'lucide-react';
import { BottomSheet } from '../components/BottomSheet';
import { centsToInputValue, formatMoney, parseMoneyToCents } from './money';

interface NextMonthProjectionSheetProps {
  open: boolean;
  /** Salário já salvo no perfil, ou `undefined` se ainda não configurado. */
  currentProjectedSalaryCents?: number;
  /** Comprometido (modo conservador) já calculado pro card — habilita a prévia ao vivo
   * enquanto digita. `undefined` só na primeiríssima configuração (ainda sem projeção
   * nenhuma pra derivar o comprometido) — a prévia fica de fora nesse caso, sem problema. */
  committedCents?: number;
  /** Saldo total atual (todas as contas) — só usado na prévia se `includeCurrentBalance`. */
  totalBalanceCents: number;
  /** Se a sobra também soma o saldo atual (preferência salva, `profile.projectionIncludesBalance`). */
  includeCurrentBalance: boolean;
  onSave: (projectedSalaryCents: number) => void;
  onRemove: () => void;
  onToggleIncludeBalance: (include: boolean) => void;
  onClose: () => void;
}

/**
 * Define/edita o salário previsto do card "Projeção do próximo mês" (Dashboard). Nunca
 * aceita 0 — bloqueado aqui na UI e de novo em `firestore.rules` (`validProjectedSalaryCents`).
 */
export function NextMonthProjectionSheet({
  open,
  currentProjectedSalaryCents,
  committedCents,
  totalBalanceCents,
  includeCurrentBalance,
  onSave,
  onRemove,
  onToggleIncludeBalance,
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
  const balancePortion = includeCurrentBalance ? totalBalanceCents : 0;
  const livePreviewCents = amountCents > 0 && committedCents !== undefined ? amountCents + balancePortion - committedCents : null;

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
          <div className="projection-input-wrap">
            <span className="projection-input-currency">R$</span>
            <input
              className="projection-input"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
              autoFocus
              aria-label="Salário previsto"
            />
          </div>
        </label>

        <div className="option-row">
          <div>
            <h2 style={{ fontSize: '0.95rem' }}>Contar meu saldo atual</h2>
            <p className="text-secondary" style={{ fontSize: '0.82rem' }}>
              Soma o que você já tem hoje ({formatMoney(totalBalanceCents)}) na sobra prevista, além do salário.
            </p>
          </div>
          <button
            className="button button--secondary"
            type="button"
            aria-pressed={includeCurrentBalance}
            onClick={() => onToggleIncludeBalance(!includeCurrentBalance)}
          >
            <PiggyBank size={16} aria-hidden="true" />
            {includeCurrentBalance ? 'Contando' : 'Não conta'}
          </button>
        </div>

        {livePreviewCents !== null && (
          <p className="projection-live-preview">
            {livePreviewCents >= 0 ? 'Sobra prevista: ' : 'Rombo previsto: '}
            <strong className={livePreviewCents >= 0 ? 'projection-amount--positive' : 'projection-amount--negative'}>
              {formatMoney(livePreviewCents)}
            </strong>
          </p>
        )}

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
