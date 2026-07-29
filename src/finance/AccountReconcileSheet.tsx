import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check } from 'lucide-react';
import { BottomSheet } from '../components/BottomSheet';
import { reconcileAccountBalance } from './financeService';
import { formatMoney, parseMoneyToCents } from './money';
import type { AccountBalance } from './financeCalculations';

interface AccountReconcileSheetProps {
  open: boolean;
  workspaceId?: string;
  userId?: string;
  account: AccountBalance | null;
  onClose: () => void;
  onApplied: (deltaCents: number) => void;
}

/**
 * "Acertar saldo com o banco": a pessoa digita o saldo REAL do banco e o app lança sozinho
 * o acerto pela diferença (`reconcileAccountBalance`) — banco maior vira uma receita de
 * acerto, banco menor vira uma despesa de acerto. Resolve o costume de calcular na mão a
 * diferença de centavos (ex.: rendimento automático que o banco credita e ninguém digita).
 *
 * O elemento-assinatura é a prévia ao vivo: conforme se digita o saldo do banco, a diferença
 * exata e o que vai acontecer aparecem em texto claro, antes de confirmar.
 */
export function AccountReconcileSheet({ open, workspaceId, userId, account, onClose, onApplied }: AccountReconcileSheetProps) {
  const [target, setTarget] = useState('');

  const currentCents = account?.balanceCents ?? 0;
  const typed = target.trim().length > 0;
  const targetCents = typed ? parseMoneyToCents(target) : currentCents;
  const deltaCents = targetCents - currentCents;
  const canSubmit = Boolean(workspaceId && userId && account) && typed && deltaCents !== 0;

  function handleClose() {
    setTarget('');
    onClose();
  }

  function handleSubmit() {
    if (!workspaceId || !userId || !account || !canSubmit) return;
    const result = reconcileAccountBalance(workspaceId, userId, {
      accountId: account.id,
      currentBalanceCents: currentCents,
      targetBalanceCents: targetCents
    });
    setTarget('');
    onClose();
    if (result.applied) onApplied(result.deltaCents);
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={account?.name} subtitle="Acertar saldo com o banco">
      <div className="form-stack">
        <div className="reconcile-current">
          <span>Saldo no app</span>
          <strong>{formatMoney(currentCents)}</strong>
        </div>

        <label className="field">
          <span>Saldo real no banco</span>
          <input
            className="input input--money"
            inputMode="decimal"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="0,00"
            autoFocus
          />
        </label>

        {typed && (
          <ReconcilePreview deltaCents={deltaCents} accountName={account?.name ?? 'a conta'} />
        )}

        <div className="sheet-actions">
          <button className="button button--primary" type="button" disabled={!canSubmit} onClick={handleSubmit}>
            Acertar saldo
          </button>
        </div>

        <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
          A Granativa não conecta no seu banco — ela lança o acerto pela diferença que você informar,
          igual a um lançamento comum.
        </p>
      </div>
    </BottomSheet>
  );
}

function ReconcilePreview({ deltaCents, accountName }: { deltaCents: number; accountName: string }) {
  if (deltaCents === 0) {
    return (
      <div className="reconcile-diff reconcile-diff--match">
        <Check size={18} aria-hidden="true" />
        <div>
          <strong>Já bate certinho</strong>
          <span>Nenhum acerto necessário.</span>
        </div>
      </div>
    );
  }

  const isCredit = deltaCents > 0;
  const tone = isCredit ? 'credit' : 'debit';
  const Icon = isCredit ? ArrowUpRight : ArrowDownRight;
  const signed = `${isCredit ? '+' : '−'}${formatMoney(Math.abs(deltaCents))}`;

  return (
    <div className={`reconcile-diff reconcile-diff--${tone}`}>
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>{signed}</strong>
        <span>
          O banco tem {isCredit ? 'a mais' : 'a menos'}. Vamos lançar uma {isCredit ? 'receita' : 'despesa'} de
          acerto em {accountName}.
        </span>
      </div>
    </div>
  );
}
