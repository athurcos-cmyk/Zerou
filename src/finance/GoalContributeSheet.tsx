import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus } from 'lucide-react';
import { BottomSheet } from '../components/BottomSheet';
import { contributeToGoalWithTransaction } from './financeService';
import { formatMoney, parseMoneyToCents } from './money';
import type { Account, Goal } from '../types/contracts';

interface GoalContributeSheetProps {
  open: boolean;
  workspaceId?: string;
  userId?: string;
  goal: Goal | null;
  accounts: Account[];
  onClose: () => void;
}

/**
 * Guardar (depósito) ou retirar (resgate) valor de uma meta — simétrico: os dois
 * sentidos podem mexer numa conta de verdade (débito no depósito, crédito na retirada)
 * ou só corrigir o progresso registrado ("Só registrar", sem conta escolhida).
 */
export function GoalContributeSheet({ open, workspaceId, userId, goal, accounts, onClose }: GoalContributeSheetProps) {
  const [amount, setAmount] = useState('');
  const [sign, setSign] = useState<1 | -1>(1);
  const [accountId, setAccountId] = useState('');

  const isDebt = goal?.kind === 'debt';
  const magnitudeCents = amount.trim() ? parseMoneyToCents(amount) : 0;
  // Retirada não pode passar do que a meta tem guardado — a regra do Firestore exige
  // savedCents >= 0 depois do update; passar disso seria rejeitado em silêncio.
  const exceedsSaved = sign === -1 && goal ? magnitudeCents > goal.savedCents : false;
  const canSubmit = Boolean(workspaceId && userId && goal) && magnitudeCents > 0 && !exceedsSaved;

  function reset() {
    setAmount('');
    setSign(1);
    setAccountId('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    if (!workspaceId || !userId || !goal || !canSubmit) return;
    const delta = sign * magnitudeCents;
    contributeToGoalWithTransaction(workspaceId, userId, goal, delta, accountId || undefined);
    reset();
    onClose();
  }

  const depositLabel = isDebt ? 'Paguei' : 'Guardei';
  const withdrawLabel = isDebt ? 'Estornar' : 'Retirei';
  const accountFieldLabel = sign === 1 ? 'De qual conta sai?' : 'Pra qual conta volta?';
  const accountHint =
    accountId
      ? sign === 1
        ? 'Vira uma despesa na sua conta e registra o progresso da meta.'
        : 'Volta como receita na conta escolhida e reduz o progresso da meta.'
      : sign === 1
      ? 'Só registra o progresso — não mexe no saldo das contas.'
      : 'Só reduz o progresso registrado — não mexe no saldo das contas.';

  return (
    <BottomSheet open={open} onClose={handleClose} title={goal?.name} subtitle={isDebt ? 'Registrar pagamento' : 'Guardar ou retirar valor'}>
      <div className="form-stack">
        <div className="segmented">
          <button type="button" aria-pressed={sign === 1} onClick={() => setSign(1)}>
            <Plus size={15} aria-hidden="true" /> {depositLabel}
          </button>
          <button type="button" aria-pressed={sign === -1} onClick={() => setSign(-1)}>
            <Minus size={15} aria-hidden="true" /> {withdrawLabel}
          </button>
        </div>
        <label className="field">
          <span>Valor</span>
          <input className="input input--money" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" autoFocus />
        </label>
        {exceedsSaved && goal && (
          <p className="field-hint" style={{ color: 'var(--danger)' }}>
            Essa meta só tem {formatMoney(goal.savedCents)} guardado — não dá pra retirar mais que isso.
          </p>
        )}
        <div className="field">
          <span className="field-label">{accountFieldLabel}</span>
          <div className="chip-row">
            <button type="button" className={`chip${!accountId ? ' chip--active' : ''}`} onClick={() => setAccountId('')}>Só registrar</button>
            {accounts.map((account) => (
              <button key={account.id} type="button" className={`chip${accountId === account.id ? ' chip--active' : ''}`} onClick={() => setAccountId(account.id)}>{account.name}</button>
            ))}
          </div>
          <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.4rem 0 0' }}>{accountHint}</p>
          {accounts.length === 0 && (
            <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0.25rem 0 0' }}>
              Cadastre uma conta em <Link to="/app/accounts" className="inline-link">Contas</Link> pra mexer no saldo de verdade.
            </p>
          )}
        </div>
        <div className="sheet-actions">
          <button className="button button--primary" type="button" disabled={!canSubmit} onClick={handleSubmit}>
            Confirmar
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
