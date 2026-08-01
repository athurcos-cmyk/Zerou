import { useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { BottomSheet } from '../components/BottomSheet';
import { recordInvestmentValueUpdate } from './financeService';
import { formatMoney, parseMoneyToCents } from './money';
import type { Investment } from '../types/contracts';

interface InvestmentValueUpdateSheetProps {
  open: boolean;
  workspaceId?: string;
  userId?: string;
  investment: Investment | null;
  onClose: () => void;
}

export function InvestmentValueUpdateSheet({ open, workspaceId, userId, investment, onClose }: InvestmentValueUpdateSheetProps) {
  const [amount, setAmount] = useState('');
  const [feedback, setFeedback] = useState<{ rendeu: boolean; diffCents: number; pct: number } | null>(null);

  const magnitudeCents = amount.trim() ? parseMoneyToCents(amount) : 0;
  const canSubmit = Boolean(workspaceId && userId && investment) && magnitudeCents > 0;

  function reset() {
    setAmount('');
    setFeedback(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    if (!workspaceId || !userId || !investment || !canSubmit) return;
    const newBalance = magnitudeCents;
    const diffCents = newBalance - investment.currentBalanceCents;
    // % acumulado DESDE O INÍCIO (novo valor vs. total aportado) — não o % desta atualização
    // isolada. Rótulo diz "desde o início"; usar diffCents/contributedCents aqui mostraria só o
    // incremento desta vez (ex.: 0,67% na 2ª atualização quando o rendimento acumulado real já é
    // 1%) — o mesmo cálculo que o cabeçalho da aba já usa pro rendimento total do portfólio.
    const pct = investment.contributedCents > 0 ? (((newBalance - investment.contributedCents) / investment.contributedCents) * 100) : 0;
    recordInvestmentValueUpdate(workspaceId, userId, investment.id, newBalance, investment.contributedCents);
    setFeedback({ rendeu: diffCents >= 0, diffCents, pct });
    setAmount('');
  }

  // Feedback screen after update
  if (feedback && investment) {
    const absDiff = Math.abs(feedback.diffCents);
    const Icon = feedback.rendeu ? TrendingUp : TrendingDown;
    const tone = feedback.rendeu ? 'var(--success)' : 'var(--danger)';
    const bgTone = feedback.rendeu ? 'var(--success-soft)' : 'var(--danger-soft)';

    return (
      <BottomSheet open={open} onClose={handleClose} title={investment.name} subtitle="Resultado da atualização">
        <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: '50%', background: bgTone, color: tone, marginBottom: '1rem'
          }}>
            <Icon size={26} aria-hidden="true" />
          </span>

          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            {feedback.rendeu ? 'Seu investimento rendeu' : 'Seu investimento teve uma perda de'}
          </p>
          <p style={{
            fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 800,
            fontSize: '2rem', color: tone, margin: '0.25rem 0', lineHeight: 1.2
          }}>
            {feedback.rendeu ? '+' : '-'}{formatMoney(absDiff)}
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            {feedback.rendeu ? '+' : ''}{feedback.pct.toFixed(1)}% desde o início
          </p>

          <div style={{
            marginTop: '1rem', padding: '0.75rem',
            background: 'var(--bg-surface-subtle)', borderRadius: '0.5rem',
            display: 'flex', justifyContent: 'space-around', textAlign: 'center'
          }}>
            <div>
              <span className="text-muted" style={{ fontSize: '0.72rem', display: 'block' }}>Valor aportado</span>
              <strong style={{ fontSize: '0.9rem' }}>{formatMoney(investment.contributedCents)}</strong>
            </div>
            <div>
              <span className="text-muted" style={{ fontSize: '0.72rem', display: 'block' }}>Novo valor</span>
              <strong style={{ fontSize: '0.9rem', color: tone }}>{formatMoney(magnitudeCents)}</strong>
            </div>
          </div>

          <div className="sheet-actions" style={{ marginTop: '1rem' }}>
            <button className="button button--primary" type="button" onClick={handleClose}>OK</button>
          </div>
        </div>
      </BottomSheet>
    );
  }

  // Input screen
  return (
    <BottomSheet open={open} onClose={handleClose} title={investment?.name} subtitle="Quanto rendeu desde a última vez?">
      <div className="form-stack">
        {investment && (
          <>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.75rem', background: 'var(--bg-surface-subtle)', borderRadius: '0.5rem'
            }}>
              <span className="text-muted" style={{ fontSize: '0.82rem' }}>Valor aportado</span>
              <strong style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: '0.95rem' }}>
                {formatMoney(investment.contributedCents)}
              </strong>
            </div>
            {investment.currentBalanceCents !== investment.contributedCents && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.75rem', background: 'var(--bg-surface-subtle)', borderRadius: '0.5rem'
              }}>
                <span className="text-muted" style={{ fontSize: '0.82rem' }}>Último valor registrado</span>
                <strong style={{
                  fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: '0.95rem',
                  color: investment.currentBalanceCents > investment.contributedCents ? 'var(--success)' : 'var(--danger)'
                }}>
                  {formatMoney(investment.currentBalanceCents)}
                </strong>
              </div>
            )}
          </>
        )}

        <label className="field">
          <span>Valor atual do investimento</span>
          <input className="input input--money" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" autoFocus />
        </label>

        <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
          Digite o valor que aparece no app da sua corretora hoje. O app calcula a diferença sozinho.
        </p>

        <div className="sheet-actions">
          <button className="button button--primary" type="button" disabled={!canSubmit} onClick={handleSubmit}>
            Atualizar valor
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
