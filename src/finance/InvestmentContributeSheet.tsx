import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BottomSheet } from '../components/BottomSheet';
import { contributeToInvestment } from './financeService';
import { formatMoney, parseMoneyToCents } from './money';
import type { Account, Investment } from '../types/contracts';

interface InvestmentContributeSheetProps {
  open: boolean;
  workspaceId?: string;
  userId?: string;
  investment: Investment | null;
  categoryId: string;
  accounts: Account[];
  onClose: () => void;
}

export function InvestmentContributeSheet({ open, workspaceId, userId, investment, categoryId, accounts, onClose }: InvestmentContributeSheetProps) {
  const [amount, setAmount] = useState('');
  const [sign, setSign] = useState<1 | -1>(1);
  const [accountId, setAccountId] = useState('');

  const magnitudeCents = amount.trim() ? parseMoneyToCents(amount) : 0;
  const canSubmit = Boolean(workspaceId && userId && investment) && magnitudeCents > 0 && Boolean(accountId);

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
    if (!workspaceId || !userId || !investment || !canSubmit) return;
    const delta = sign * magnitudeCents;
    contributeToInvestment(workspaceId, userId, investment, categoryId, accountId, delta, investment.contributedCents, investment.currentBalanceCents);
    reset();
    onClose();
  }

  const isContribution = sign === 1;
  const directionColor = isContribution ? 'var(--action-primary)' : 'var(--success)';
  const DirectionIcon = isContribution ? ArrowUpRight : ArrowDownRight;
  const actionLabel = isContribution ? 'Aportar' : 'Resgatar';

  return (
    <BottomSheet open={open} onClose={handleClose} title={investment?.name} subtitle={actionLabel}>
      <div className="form-stack">
        {/* Direction toggle */}
        <div className="segmented" role="radiogroup" aria-label="Aportar ou resgatar">
          <button type="button" role="radio" aria-checked={sign === 1} onClick={() => { setSign(1); setAccountId(''); }}>
            <Plus size={16} aria-hidden="true" /> Aportar
          </button>
          <button type="button" role="radio" aria-checked={sign === -1} onClick={() => { setSign(-1); setAccountId(''); }}>
            <Minus size={16} aria-hidden="true" /> Resgatar
          </button>
        </div>

        {/* Amount */}
        <label className="field">
          <span>Valor</span>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)',
              color: directionColor, display: 'flex', alignItems: 'center', pointerEvents: 'none', zIndex: 1
            }}>
              <DirectionIcon size={18} aria-hidden="true" />
            </span>
            <input
              className="input input--money"
              style={{ paddingLeft: '2.25rem' }}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
              autoFocus
            />
          </div>
        </label>

        {/* Guard: resgatar mais do que tem */}
        {investment && sign === -1 && magnitudeCents > investment.currentBalanceCents && (
          <p className="field-hint" style={{ color: 'var(--danger)', fontWeight: 500 }}>
            Esse investimento só tem {formatMoney(investment.currentBalanceCents)} — não dá pra resgatar mais que isso.
          </p>
        )}

        {/* Account picker */}
        <div className="field">
          <span className="field-label">{isContribution ? 'De qual conta sai o dinheiro?' : 'Pra qual conta vai o dinheiro?'}</span>
          <div className="chip-row">
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                className={`chip${accountId === account.id ? ' chip--active' : ''}`}
                onClick={() => setAccountId(account.id)}
              >
                {account.name}
              </button>
            ))}
          </div>
          {accounts.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0.25rem 0 0' }}>
              Cadastre uma conta em <Link to="/app/accounts" className="inline-link">Contas</Link> pra conseguir aportar ou resgatar.
            </p>
          ) : (
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.4rem 0 0' }}>
              {isContribution
                ? 'Vira uma despesa na conta escolhida. O valor do investimento sobe na mesma hora.'
                : 'Volta como receita na conta escolhida. O valor do investimento desce na mesma hora.'}
            </p>
          )}
        </div>

        <div className="sheet-actions">
          <button className="button button--primary" type="button" disabled={!canSubmit} onClick={handleSubmit}>
            {actionLabel} {magnitudeCents > 0 ? formatMoney(magnitudeCents) : ''}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
