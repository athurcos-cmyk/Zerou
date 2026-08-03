import { useState, type FormEvent } from 'react';
import { ChevronRight, Eye, Plus, Scale, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import { BottomSheet } from '../../components/BottomSheet';
import { CategoryField } from '../../components/CategoryField';
import { EmptyState } from '../../components/EmptyState';
import { createSharedExpenseClaim, deleteSharedExpenseClaim, updateSharedExpenseClaimStatus } from '../../shared/sharedService';
import { useCategoryActions } from '../../finance/useCategoryActions';
import { formatFriendlyDate, fromDateInputValueForWrite, todayInputValue } from '../../finance/financeDates';
import { formatMoney, parseMoneyToCents } from '../../finance/money';
import { getUserFacingErrorMessage } from '../../utils/userFacingError';
import { memberLabel } from './memberLabel';
import type { useCoupleWriteGate } from '../../shared/coupleWriteGate';
import type { useFinanceContext } from '../../finance/FinanceDataContext';
import type { CoupleMode, SharedExpenseClaim, WorkspaceMembership } from '../../types/contracts';

type SplitMode = 'equal' | 'percent' | 'value';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface CoupleExpensesSectionProps {
  workspaceId: string;
  userId: string;
  coupleMode: CoupleMode;
  activeMembers: WorkspaceMembership[];
  partnerMember: WorkspaceMembership | undefined;
  claims: SharedExpenseClaim[];
  /** Workspace pessoal de quem está usando — destino da transação real do gasto. */
  personalWorkspaceId: string | undefined;
  personalFinance: ReturnType<typeof useFinanceContext>;
  gate: ReturnType<typeof useCoupleWriteGate>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  onUpgradeMode: (mode: CoupleMode) => void;
  onMessage: (message: string | null) => void;
}

/** Data mostrada na lista: `occurredOn` quando existe, `createdAt` nos registros anteriores a
 * 2026-08-03 (quando o campo não existia). */
function claimDate(claim: SharedExpenseClaim) {
  const stamp = claim.occurredOn ?? claim.createdAt;
  return stamp ? stamp.toDate() : null;
}

/**
 * Despesas divididas + barra de equilíbrio.
 *
 * Desde 2026-08-03 o registro tem data, conta e categoria: a despesa dividida deixou de ser só
 * um número no espaço a dois e passou a virar **transação de verdade** na conta de quem pagou
 * (entrando no Extrato, no saldo e na Análise). Antes disso, quem pagava R$ 200 no mercado
 * ficava com a conta do app R$ 200 acima do banco, sem nada explicando por quê.
 */
export function CoupleExpensesSection({
  workspaceId,
  userId,
  coupleMode,
  activeMembers,
  partnerMember,
  claims,
  personalWorkspaceId,
  personalFinance,
  gate,
  confirm,
  onUpgradeMode,
  onMessage
}: CoupleExpensesSectionProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [claimDescription, setClaimDescription] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [claimDateInput, setClaimDateInput] = useState(todayInputValue);
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [myPercent, setMyPercent] = useState('50');
  const [myValue, setMyValue] = useState('');
  const [detailClaim, setDetailClaim] = useState<SharedExpenseClaim | null>(null);
  const categoryActions = useCategoryActions(setCategoryId);

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

  const selectedAccount = personalFinance.accounts.find((account) => account.id === accountId);

  function resetForm() {
    setClaimDescription('');
    setClaimAmount('');
    setClaimDateInput(todayInputValue());
    setCategoryId('');
    setAccountId('');
    setSplitMode('equal');
    setMyPercent('50');
    setMyValue('');
  }

  function handleCreateClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (gate.blocked) {
      onMessage(gate.message);
      return;
    }
    if (activeMembers.length < 2) {
      onMessage('A despesa compartilhada precisa de duas pessoas ativas no espaço.');
      return;
    }
    // Guardas SÍNCRONOS antes da escrita: `createSharedExpenseClaim` valida com Zod lá dentro,
    // e um erro nascido lá vira promise rejeitada — a sheet já teria fechado e ninguém veria
    // (a mesma armadilha que fazia "Salvar transação" sair da tela sem gravar, ver CHANGELOG
    // de 2026-08-03).
    const totalCents = parseMoneyToCents(claimAmount);
    if (totalCents <= 0) {
      onMessage('Informe o valor total do gasto.');
      return;
    }
    if (claimDescription.trim().length < 2) {
      onMessage('Descreva o gasto compartilhado.');
      return;
    }

    const description = claimDescription.trim();
    const occurredOn = fromDateInputValueForWrite(claimDateInput);
    const split = splitMode === 'equal' ? undefined : computeSplit(totalCents);
    onMessage(null);
    resetForm();
    setSheetOpen(false);
    createSharedExpenseClaim(
      workspaceId,
      userId,
      {
        description,
        totalAmountCents: totalCents,
        participantUserIds: activeMembers.map((member) => member.userId),
        occurredOn,
        split
      },
      { personalWorkspaceId, accountId: accountId || undefined, categoryId: categoryId || undefined }
    ).catch((err) => onMessage(getUserFacingErrorMessage(err, 'Não foi possível registrar a despesa agora.')));
  }

  async function handleDeleteClaim(claim: SharedExpenseClaim) {
    if (gate.blocked) {
      onMessage(gate.message);
      return;
    }
    const ok = await confirm({
      title: 'Excluir esta despesa?',
      message: personalWorkspaceId
        ? 'Ela sai do espaço de vocês e, se tiver virado lançamento numa conta sua, o valor volta pro saldo dessa conta.'
        : 'Ela sai do espaço de vocês.',
      confirmLabel: 'Excluir',
      danger: true
    });
    if (!ok) return;
    setDetailClaim(null);
    deleteSharedExpenseClaim(workspaceId, claim.id, userId, { personalWorkspaceId })
      .catch((err) => onMessage(getUserFacingErrorMessage(err, 'Não foi possível excluir a despesa agora.')));
  }

  function handleClaimStatus(claim: SharedExpenseClaim, status: 'accepted' | 'disputed') {
    if (gate.blocked) {
      onMessage(gate.message);
      return;
    }
    onMessage(null);
    setDetailClaim(null);
    updateSharedExpenseClaimStatus(workspaceId, userId, { claimId: claim.id, status })
      .catch((err) => onMessage(getUserFacingErrorMessage(err, 'Não foi possível atualizar a despesa agora.')));
  }

  const proportionalBalance = (() => {
    if (coupleMode !== 'balanced') return null;
    const counted = claims.filter((claim) => claim.status !== 'disputed');
    const myPaid = counted.filter((c) => c.payerUserId === userId).reduce((sum, c) => sum + c.totalAmountCents, 0);
    const partnerPaid = counted.filter((c) => c.payerUserId !== userId).reduce((sum, c) => sum + c.totalAmountCents, 0);
    const total = myPaid + partnerPaid;
    if (total === 0) return { myPct: 50, partnerPct: 50, myPaid: 0, partnerPaid: 0, total: 0 };
    const myPct = Math.round((myPaid / total) * 100);
    return { myPct, partnerPct: 100 - myPct, myPaid, partnerPaid, total };
  })();

  if (coupleMode === 'savings_only') {
    return (
      <button type="button" className="couple-upgrade-card" disabled={gate.blocked} onClick={() => onUpgradeMode('transparent')}>
        <span className="couple-mode-icon couple-mode-icon--transparent"><Eye size={18} aria-hidden="true" /></span>
        <span className="couple-upgrade-text">
          <strong>Mudar pra transparência</strong>
          <span>Troca o modo do espaço — veja o que cada um paga nas despesas divididas.</span>
        </span>
        <ChevronRight size={16} aria-hidden="true" style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-muted)' }} />
      </button>
    );
  }

  const detailIsMine = detailClaim?.createdBy === userId;
  const detailDate = detailClaim ? claimDate(detailClaim) : null;

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
          <button
            className="icon-button"
            type="button"
            aria-label="Nova despesa"
            disabled={gate.blocked}
            onClick={() => setSheetOpen(true)}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
        {claims.length > 0 ? (
          <div className="item-list">
            {claims.map((claim) => {
              const myShare = claim.split.find((part) => part.userId === userId)?.amountCents ?? 0;
              const date = claimDate(claim);
              return (
                <button className="list-row list-row--tap" type="button" key={claim.id} onClick={() => setDetailClaim(claim)}>
                  <div>
                    <strong>{claim.description}</strong>
                    <span className="text-secondary">
                      {formatMoney(claim.totalAmountCents)} · sua parte {formatMoney(myShare)}
                      {date ? ` · ${formatFriendlyDate(date)}` : ''}
                    </span>
                    <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                      pago por {memberLabel(activeMembers.find((m) => m.userId === claim.payerUserId), userId)}
                      {claim.status === 'disputed' ? ' · contestada' : ''}
                    </span>
                  </div>
                  <ChevronRight size={16} aria-hidden="true" style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-muted)' }} />
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            illustration="wallet"
            compact
            title="Nenhuma despesa ainda"
            description="Adicione um gasto dividido entre vocês."
            action={
              <button className="button button--primary button--compact" type="button" disabled={gate.blocked} onClick={() => setSheetOpen(true)}>
                <Plus size={16} aria-hidden="true" /> Adicionar despesa
              </button>
            }
          />
        )}
      </article>

      {coupleMode === 'transparent' && (
        <button type="button" className="couple-upgrade-card" disabled={gate.blocked} onClick={() => onUpgradeMode('balanced')}>
          <span className="couple-mode-icon couple-mode-icon--balanced"><Scale size={18} aria-hidden="true" /></span>
          <span className="couple-upgrade-text">
            <strong>Mudar pra equilíbrio</strong>
            <span>Troca o modo do espaço — veja a proporção de quem está cobrindo mais no mês.</span>
          </span>
          <ChevronRight size={16} aria-hidden="true" style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-muted)' }} />
        </button>
      )}

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Dividir um gasto"
        subtitle="Só a descrição, o valor e a divisão aparecem pra outra pessoa — sua conta e sua categoria ficam no seu espaço."
      >
        <form className="form-stack" onSubmit={handleCreateClaim}>
          <label className="field">
            <span>Descrição</span>
            <input className="input" value={claimDescription} onChange={(event) => setClaimDescription(event.target.value)} placeholder="Mercado do mês" autoFocus />
          </label>
          <label className="field">
            <span>Valor total</span>
            <input className="input" inputMode="decimal" value={claimAmount} onChange={(event) => setClaimAmount(event.target.value)} placeholder="0,00" />
          </label>
          <label className="field">
            <span>Quando foi</span>
            <input className="input" type="date" value={claimDateInput} onChange={(event) => setClaimDateInput(event.target.value)} />
          </label>
          <div className="field">
            <span className="field-label">Como dividir?</span>
            <div className="segmented" role="radiogroup" aria-label="Como dividir?">
              {(['equal', 'percent', 'value'] as const).map((mode) => (
                <button key={mode} type="button" role="radio" aria-checked={splitMode === mode} onClick={() => setSplitMode(mode)}>
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

          <div className="field">
            <span className="field-label">De qual conta saiu?</span>
            <div className="chip-row chip-row--scroll">
              {personalFinance.accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  className={`chip${accountId === account.id ? ' chip--active' : ''}`}
                  onClick={() => setAccountId(account.id)}
                >
                  {account.name}
                </button>
              ))}
              <button type="button" className={`chip${!accountId ? ' chip--active' : ''}`} onClick={() => setAccountId('')}>
                Só anotar
              </button>
            </div>
            {/* O valor debitado é o TOTAL, não a metade: foi o total que saiu do banco. A parte
                da outra pessoa não se perde — vira dívida dela no acerto do casal. */}
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.4rem 0 0' }}>
              {accountId
                ? `Sai ${formatMoney(parseMoneyToCents(claimAmount || '0'))} de ${selectedAccount?.name ?? 'sua conta'} (o total que você pagou) e entra no seu Extrato e na Análise. A parte de ${memberLabel(partnerMember, userId)} vira dívida dela no acerto.`
                : 'A despesa fica só no espaço de vocês: nenhuma conta sua é debitada e ela não entra na sua Análise.'}
            </p>
          </div>

          {accountId && (
            <CategoryField
              label="Categoria"
              value={categoryId}
              onChange={setCategoryId}
              categories={personalFinance.categories}
              filterType="expense"
              {...categoryActions}
            />
          )}

          <div className="sheet-actions">
            <button className="button button--primary" type="submit" disabled={gate.blocked}>Adicionar despesa</button>
          </div>
        </form>
      </BottomSheet>

      <BottomSheet
        open={Boolean(detailClaim)}
        onClose={() => setDetailClaim(null)}
        title={detailClaim?.description ?? ''}
        subtitle={detailClaim ? `${formatMoney(detailClaim.totalAmountCents)}${detailDate ? ` · ${formatFriendlyDate(detailDate)}` : ''}` : ''}
      >
        {detailClaim && (
          <div className="form-stack">
            <div className="split-preview">
              {detailClaim.split.map((part) => (
                <span key={part.userId}>
                  <strong>{part.userId === userId ? 'Você' : memberLabel(activeMembers.find((m) => m.userId === part.userId), userId)}</strong>
                  {formatMoney(part.amountCents)}
                </span>
              ))}
            </div>
            <p className="text-secondary" style={{ margin: 0 }}>
              Pago por {memberLabel(activeMembers.find((m) => m.userId === detailClaim.payerUserId), userId)}.
              {detailClaim.status === 'disputed' ? ' Contestada — fora do acerto.' : ''}
            </p>

            {detailIsMine ? (
              <button className="button button--ghost button--danger-text" type="button" disabled={gate.blocked} onClick={() => void handleDeleteClaim(detailClaim)}>
                <Trash2 size={16} aria-hidden="true" /> Excluir despesa
              </button>
            ) : detailClaim.status === 'disputed' ? (
              <>
                <p className="text-muted" style={{ margin: 0, fontSize: '0.82rem' }}>
                  Só quem registrou pode excluir — quem registrou aqui foi {memberLabel(activeMembers.find((m) => m.userId === detailClaim.createdBy), userId)}.
                </p>
                <button className="button button--subtle" type="button" disabled={gate.blocked} onClick={() => handleClaimStatus(detailClaim, 'accepted')}>
                  <Undo2 size={16} aria-hidden="true" /> Desfazer contestação
                </button>
              </>
            ) : (
              <>
                <p className="text-muted" style={{ margin: 0, fontSize: '0.82rem' }}>
                  Não reconhece esse gasto? Contestar tira ele do acerto de vocês até resolverem — nada é apagado.
                </p>
                <button className="button button--subtle" type="button" disabled={gate.blocked} onClick={() => handleClaimStatus(detailClaim, 'disputed')}>
                  <TriangleAlert size={16} aria-hidden="true" /> Contestar despesa
                </button>
              </>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
