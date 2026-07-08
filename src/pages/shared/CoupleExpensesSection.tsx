import { useState, type FormEvent } from 'react';
import { ChevronRight, Eye, Plus, Scale } from 'lucide-react';
import { BottomSheet } from '../../components/BottomSheet';
import { EmptyState } from '../../components/EmptyState';
import { createSharedExpenseClaim } from '../../shared/sharedService';
import { formatMoney, parseMoneyToCents } from '../../finance/money';
import { getUserFacingErrorMessage } from '../../utils/userFacingError';
import { memberLabel } from './memberLabel';
import type { CoupleMode, SharedExpenseClaim, WorkspaceMembership } from '../../types/contracts';

type SplitMode = 'equal' | 'percent' | 'value';

interface CoupleExpensesSectionProps {
  workspaceId: string;
  userId: string;
  coupleMode: CoupleMode;
  activeMembers: WorkspaceMembership[];
  partnerMember: WorkspaceMembership | undefined;
  claims: SharedExpenseClaim[];
  onUpgradeMode: (mode: CoupleMode) => void;
  onMessage: (message: string | null) => void;
}

/** Despesas divididas + barra de equilíbrio. O form de nova despesa agora vive num BottomSheet, como o resto do app. */
export function CoupleExpensesSection({
  workspaceId,
  userId,
  coupleMode,
  activeMembers,
  partnerMember,
  claims,
  onUpgradeMode,
  onMessage
}: CoupleExpensesSectionProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [claimDescription, setClaimDescription] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [myPercent, setMyPercent] = useState('50');
  const [myValue, setMyValue] = useState('');

  function computeSplit(totalCents: number) {
    const partnerId = partnerMember?.userId;
    if (!partnerId) return undefined;
    let myShare: number;
    if (splitMode === 'equal') {
      myShare = Math.floor(totalCents / 2);
    } else if (splitMode === 'percent') {
      const pct = Math.min(100, Math.max(0, Number(myPercent) || 0));
      myShare = Math.round((totalCents * pct) / 100);
    } else {
      myShare = Math.min(totalCents, Math.max(0, parseMoneyToCents(myValue || '0')));
    }
    return [
      { userId, amountCents: myShare },
      { userId: partnerId, amountCents: totalCents - myShare }
    ];
  }

  const splitPreview = (() => {
    const totalCents = claimAmount ? parseMoneyToCents(claimAmount) : 0;
    if (!totalCents || !partnerMember) return null;
    const split = computeSplit(totalCents);
    if (!split) return null;
    return { mine: split[0].amountCents, partner: split[1].amountCents };
  })();

  function resetForm() {
    setClaimDescription('');
    setClaimAmount('');
    setSplitMode('equal');
    setMyPercent('50');
    setMyValue('');
  }

  function handleCreateClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeMembers.length < 2) {
      onMessage('A despesa compartilhada precisa de duas pessoas ativas no espaço.');
      return;
    }
    const totalCents = parseMoneyToCents(claimAmount);
    const description = claimDescription;
    const split = splitMode === 'equal' ? undefined : computeSplit(totalCents);
    onMessage(null);
    resetForm();
    setSheetOpen(false);
    createSharedExpenseClaim(workspaceId, userId, {
      description,
      totalAmountCents: totalCents,
      participantUserIds: activeMembers.map((member) => member.userId),
      split
    }).catch((err) => onMessage(getUserFacingErrorMessage(err, 'Não foi possível registrar a despesa agora.')));
  }

  const proportionalBalance = (() => {
    if (coupleMode !== 'balanced') return null;
    const myPaid = claims.filter((c) => c.payerUserId === userId).reduce((sum, c) => sum + c.totalAmountCents, 0);
    const partnerPaid = claims.filter((c) => c.payerUserId !== userId).reduce((sum, c) => sum + c.totalAmountCents, 0);
    const total = myPaid + partnerPaid;
    if (total === 0) return { myPct: 50, partnerPct: 50, myPaid: 0, partnerPaid: 0, total: 0 };
    const myPct = Math.round((myPaid / total) * 100);
    return { myPct, partnerPct: 100 - myPct, myPaid, partnerPaid, total };
  })();

  if (coupleMode === 'savings_only') {
    return (
      <button type="button" className="couple-upgrade-card" onClick={() => onUpgradeMode('transparent')}>
        <span className="couple-mode-icon couple-mode-icon--transparent"><Eye size={18} aria-hidden="true" /></span>
        <span className="couple-upgrade-text">
          <strong>Mudar pra transparência</strong>
          <span>Troca o modo do espaço — veja o que cada um paga nas despesas divididas.</span>
        </span>
        <ChevronRight size={16} aria-hidden="true" style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-muted)' }} />
      </button>
    );
  }

  return (
    <div className="form-stack">
      {coupleMode === 'balanced' && (
        <article className="surface surface-pad form-stack">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Equilíbrio do mês</p>
              <h2>Quem está cobrindo mais</h2>
            </div>
            <Scale size={20} aria-hidden="true" />
          </div>
          {proportionalBalance && proportionalBalance.total > 0 ? (
            <>
              <div className="couple-balance-bar">
                <div className="couple-balance-bar-you" style={{ flex: proportionalBalance.myPct }} />
                <div className="couple-balance-bar-partner" style={{ flex: proportionalBalance.partnerPct }} />
              </div>
              <div className="split-preview">
                <span><strong>Você</strong>{formatMoney(proportionalBalance.myPaid)} · {proportionalBalance.myPct}%</span>
                <span><strong>{memberLabel(partnerMember, userId)}</strong>{formatMoney(proportionalBalance.partnerPaid)} · {proportionalBalance.partnerPct}%</span>
              </div>
              {proportionalBalance.myPct > 65 && (
                <p className="text-muted" style={{ margin: 0, fontSize: '0.82rem' }}>Quando {memberLabel(partnerMember, userId)} pagar a próxima, vai equilibrar.</p>
              )}
              {proportionalBalance.partnerPct > 65 && (
                <p className="text-muted" style={{ margin: 0, fontSize: '0.82rem' }}>Você pode pagar a próxima pra equilibrar.</p>
              )}
            </>
          ) : (
            <p className="text-secondary">Nenhuma despesa registrada ainda.</p>
          )}
        </article>
      )}

      <article className="surface surface-pad">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Despesas</p>
            <h2>Registradas juntos</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Nova despesa" onClick={() => setSheetOpen(true)}>
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
        {claims.length > 0 ? (
          <div className="item-list">
            {claims.map((claim) => (
              <div className="list-row" key={claim.id}>
                <div>
                  <strong>{claim.description}</strong>
                  <span className="text-secondary">
                    {formatMoney(claim.totalAmountCents)} · pago por {memberLabel(activeMembers.find((m) => m.userId === claim.payerUserId), userId)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            illustration="wallet"
            compact
            title="Nenhuma despesa ainda"
            description="Adicione um gasto dividido entre vocês."
            action={
              <button className="button button--primary button--compact" type="button" onClick={() => setSheetOpen(true)}>
                <Plus size={16} aria-hidden="true" /> Adicionar despesa
              </button>
            }
          />
        )}
      </article>

      {coupleMode === 'transparent' && (
        <button type="button" className="couple-upgrade-card" onClick={() => onUpgradeMode('balanced')}>
          <span className="couple-mode-icon couple-mode-icon--balanced"><Scale size={18} aria-hidden="true" /></span>
          <span className="couple-upgrade-text">
            <strong>Mudar pra equilíbrio</strong>
            <span>Troca o modo do espaço — veja a proporção de quem está cobrindo mais no mês.</span>
          </span>
          <ChevronRight size={16} aria-hidden="true" style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-muted)' }} />
        </button>
      )}

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Dividir um gasto" subtitle="Nenhuma conta, cartão ou fatura pessoal entra neste registro.">
        <form className="form-stack" onSubmit={handleCreateClaim}>
          <label className="field">
            <span>Descrição</span>
            <input className="input" value={claimDescription} onChange={(event) => setClaimDescription(event.target.value)} placeholder="Mercado do mês" autoFocus />
          </label>
          <label className="field">
            <span>Valor total</span>
            <input className="input" inputMode="decimal" value={claimAmount} onChange={(event) => setClaimAmount(event.target.value)} placeholder="0,00" />
          </label>
          <div className="field">
            <span className="field-label">Como dividir?</span>
            <div className="segmented">
              {(['equal', 'percent', 'value'] as const).map((mode) => (
                <button key={mode} type="button" aria-pressed={splitMode === mode} onClick={() => setSplitMode(mode)}>
                  {mode === 'equal' ? 'Igual' : mode === 'percent' ? 'Porcentagem' : 'Valor'}
                </button>
              ))}
            </div>
          </div>
          {splitMode === 'percent' && (
            <label className="field">
              <span>Sua parte (%)</span>
              <input className="input" inputMode="numeric" value={myPercent} onChange={(event) => setMyPercent(event.target.value)} placeholder="50" />
            </label>
          )}
          {splitMode === 'value' && (
            <label className="field">
              <span>Sua parte (R$)</span>
              <input className="input" inputMode="decimal" value={myValue} onChange={(event) => setMyValue(event.target.value)} placeholder="0,00" />
            </label>
          )}
          {splitPreview && (
            <div className="split-preview">
              <span><strong>Você</strong> {formatMoney(splitPreview.mine)}</span>
              <span><strong>{memberLabel(partnerMember, userId)}</strong> {formatMoney(splitPreview.partner)}</span>
            </div>
          )}
          <div className="sheet-actions">
            <button className="button button--primary" type="submit">Adicionar despesa</button>
          </div>
        </form>
      </BottomSheet>
    </div>
  );
}
