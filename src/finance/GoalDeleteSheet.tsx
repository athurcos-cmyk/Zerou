import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { BottomSheet } from '../components/BottomSheet';
import { deleteGoal, deleteGoalWithRefund } from './financeService';
import { formatMoney } from './money';
import type { Account, Goal } from '../types/contracts';

interface GoalDeleteSheetProps {
  open: boolean;
  workspaceId?: string;
  userId?: string;
  goal: Goal | null;
  accounts: Account[];
  onClose: () => void;
  /** Chamado depois de excluir de verdade — a tela de detalhe usa isso pra navegar de
   * volta pra lista; a lista em si não precisa fazer nada além de fechar a sheet. */
  onDeleted?: () => void;
}

type Choice = 'refund' | 'forfeit' | null;

/**
 * Excluir uma meta. Meta de dívida (ou meta sem nada guardado) só pede confirmação —
 * não tem "dinheiro guardado" real pra devolver. Meta de economizar com saldo > 0
 * pede uma escolha explícita: devolver o valor pra uma conta, ou deixar sumir.
 */
export function GoalDeleteSheet({ open, workspaceId, userId, goal, accounts, onClose, onDeleted }: GoalDeleteSheetProps) {
  const [choice, setChoice] = useState<Choice>(null);
  const [refundAccountId, setRefundAccountId] = useState('');
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setChoice(null);
      setRefundAccountId('');
    }
    wasOpen.current = open;
  }, [open]);

  if (!goal) return null;

  const offersRefund = goal.kind === 'save' && goal.savedCents > 0;

  function handleForfeit() {
    if (!workspaceId || !goal) return;
    deleteGoal(workspaceId, goal.id);
    onClose();
    onDeleted?.();
  }

  function handleRefund() {
    if (!workspaceId || !userId || !goal || !refundAccountId) return;
    deleteGoalWithRefund(workspaceId, userId, goal, refundAccountId);
    onClose();
    onDeleted?.();
  }

  if (!offersRefund) {
    return (
      <BottomSheet open={open} onClose={onClose} title={`Excluir "${goal.name}"?`} subtitle="Essa ação não pode ser desfeita.">
        <div className="sheet-actions">
          <button className="button button--danger" type="button" onClick={handleForfeit}>Excluir meta</button>
          <button className="button button--ghost" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`Excluir "${goal.name}"?`}
      subtitle={`Você tem ${formatMoney(goal.savedCents)} guardado nessa meta.`}
    >
      <div className="form-stack">
        <div className="choice-list" role="radiogroup" aria-label="O que fazer com o valor guardado?">
          <button
            type="button"
            className={`choice-card${choice === 'refund' ? ' choice-card--selected' : ''}`}
            role="radio"
            aria-checked={choice === 'refund'}
            onClick={() => setChoice('refund')}
          >
            <span className="choice-card-label">
              <strong>Devolver {formatMoney(goal.savedCents)} pra uma conta</strong>
              <span className="text-secondary">O valor guardado volta como receita na conta que você escolher.</span>
            </span>
            <span className={`choice-card-radio${choice === 'refund' ? ' choice-card-radio--on' : ''}`} aria-hidden="true">
              {choice === 'refund' && <CheckCircle2 size={20} />}
            </span>
          </button>

          {choice === 'refund' && (
            <div className="field" style={{ marginTop: '-0.3rem' }}>
              <span className="field-label">Pra qual conta volta?</span>
              <div className="chip-row">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className={`chip${refundAccountId === account.id ? ' chip--active' : ''}`}
                    onClick={() => setRefundAccountId(account.id)}
                  >
                    {account.name}
                  </button>
                ))}
              </div>
              {accounts.length === 0 && (
                <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0.25rem 0 0' }}>
                  Cadastre uma conta em <Link to="/app/accounts" className="inline-link">Contas</Link> pra poder devolver.
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            className={`choice-card${choice === 'forfeit' ? ' choice-card--selected' : ''}`}
            role="radio"
            aria-checked={choice === 'forfeit'}
            onClick={() => setChoice('forfeit')}
          >
            <span className="choice-card-label">
              <strong>Não devolver</strong>
              <span className="text-secondary">O dinheiro some — não volta pra nenhuma conta.</span>
            </span>
            <span className={`choice-card-radio${choice === 'forfeit' ? ' choice-card-radio--on' : ''}`} aria-hidden="true">
              {choice === 'forfeit' && <CheckCircle2 size={20} />}
            </span>
          </button>
        </div>

        <div className="sheet-actions">
          <button
            className="button button--danger"
            type="button"
            disabled={choice === null || (choice === 'refund' && !refundAccountId)}
            onClick={choice === 'refund' ? handleRefund : handleForfeit}
          >
            Excluir meta
          </button>
          <button className="button button--ghost" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </BottomSheet>
  );
}
