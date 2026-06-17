import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Copy, Handshake, MessageSquare, PiggyBank, Plus, QrCode, Trash2, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { clearPendingInvite, readPendingInvite, savePendingInvite } from '../auth/pendingInvite';
import { BottomSheet } from '../components/BottomSheet';
import { categoryColors } from '../components/categoryIcons';
import { ACCENT_FOREGROUND } from '../theme/palette';
import { useConfirm } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { FormMessage } from '../components/FormMessage';
import { addGoalContribution, createGoal, createTransaction, deleteGoal } from '../finance/financeService';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { useCoupleSavings, type CoupleGoalStats } from '../shared/useCoupleSavings';
import { useFinanceData } from '../finance/useFinanceData';
import { getUserFacingErrorMessage } from '../utils/userFacingError';
import {
  acceptCoupleInvite,
  acceptSettlement,
  addSharedComment,
  cleanupExpiredInvites,
  createCoupleInvite,
  createCoupleWorkspace,
  createSettlementProposal,
  createSharedExpenseClaim,
  leaveCoupleWorkspace,
  previewCoupleInvite,
  recordSettlementPayment,
  regenerateCoupleInvite,
  removePartner,
  revokeCoupleInvite,
  updateSharedExpenseClaimStatus
} from '../shared/sharedService';
import { useSharedWorkspaceData } from '../shared/useSharedWorkspaceData';
import type { CoupleInvite, Settlement, SharedExpenseClaim, WorkspaceMembership } from '../types/contracts';

const claimStatusLabels: Record<SharedExpenseClaim['status'], string> = {
  pending: 'Pendente',
  accepted: 'Aceito',
  disputed: 'Contestação',
  settled: 'Acertado'
};

const settlementStatusLabels: Record<Settlement['status'], string> = {
  proposed: 'Proposto',
  accepted: 'Aceito',
  partially_paid: 'Parcial',
  settled: 'Acertado',
  cancelled: 'Cancelado'
};

type SplitMode = 'equal' | 'percent' | 'value';

function memberLabel(member: WorkspaceMembership | undefined, currentUserId?: string) {
  if (!member) return 'Parceiro(a)';
  if (member.userId === currentUserId) return 'Você';
  return member.role === 'owner' ? 'Dono' : 'Parceiro(a)';
}

export function SharedSpacePage() {
  const { user, profile } = useAuth();
  const shared = useSharedWorkspaceData(user?.uid);
  const workspaceId = shared.workspace?.id;
  const ownerMember = shared.activeMembers.find((member) => member.role === 'owner');
  const partnerMember = shared.activeMembers.find((member) => member.userId !== user?.uid);
  const activeInvite = shared.invites[0];
  const { confirm, dialog } = useConfirm();

  const [message, setMessage] = useState<string | null>(null);
  const [pendingInviteCode, setPendingInviteCode] = useState('');
  const [pendingInvitePreview, setPendingInvitePreview] = useState<CoupleInvite | null>(null);
  const [generatedInvite, setGeneratedInvite] = useState<{ code: string; joinUrl: string; qrDataUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [claimDescription, setClaimDescription] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [myPercent, setMyPercent] = useState('50');
  const [myValue, setMyValue] = useState('');

  const [commentTargetId, setCommentTargetId] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [settleOpen, setSettleOpen] = useState(false);
  const [settlementPaymentId, setSettlementPaymentId] = useState('');
  const [settlementPaymentAmount, setSettlementPaymentAmount] = useState('');

  // Couple savings ("cofrinho")
  const savings = useCoupleSavings(workspaceId);
  const personalFinance = useFinanceData(profile?.defaultWorkspaceId, user?.uid);
  const [cofrinhoOpen, setCofrinhoOpen] = useState(false);
  const [cofrinhoName, setCofrinhoName] = useState('');
  const [cofrinhoTarget, setCofrinhoTarget] = useState('');
  const [cofrinhoColor, setCofrinhoColor] = useState(categoryColors[0]);
  const [guardarTarget, setGuardarTarget] = useState<CoupleGoalStats | null>(null);
  const [guardarAmount, setGuardarAmount] = useState('');
  const [guardarFromAccount, setGuardarFromAccount] = useState('');

  useEffect(() => {
    const storedCode = readPendingInvite();
    if (storedCode) setPendingInviteCode(storedCode);
  }, []);

  // Optimistic: fire writes, close immediately, let the live listener reflect them.
  function handleCreateCofrinho(event: FormEvent) {
    event.preventDefault();
    if (!workspaceId || !user || !cofrinhoName.trim()) return;
    setMessage(null);
    createGoal(workspaceId, user.uid, {
      name: cofrinhoName.trim(),
      kind: 'save',
      targetCents: cofrinhoTarget ? parseMoneyToCents(cofrinhoTarget) : 0,
      icon: 'piggy',
      color: cofrinhoColor
    }).catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível criar o cofrinho agora.')));
    setCofrinhoName('');
    setCofrinhoTarget('');
    setCofrinhoColor(categoryColors[0]);
    setCofrinhoOpen(false);
  }

  function handleGuardar(event: FormEvent) {
    event.preventDefault();
    if (!workspaceId || !user || !guardarTarget) return;
    const amountCents = parseMoneyToCents(guardarAmount);
    if (amountCents <= 0) return;
    setMessage(null);
    addGoalContribution(workspaceId, user.uid, guardarTarget.goal.id, amountCents)
      .catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível guardar agora.')));
    // Optionally pull the money out of a personal account as an expense.
    if (guardarFromAccount && profile?.defaultWorkspaceId) {
      createTransaction(profile.defaultWorkspaceId, user.uid, {
        type: 'expense',
        amountCents,
        description: `Cofrinho: ${guardarTarget.goal.name}`,
        accountId: guardarFromAccount,
        date: new Date(),
        tags: ['cofrinho']
      }).catch(() => undefined);
    }
    setGuardarTarget(null);
    setGuardarAmount('');
    setGuardarFromAccount('');
  }

  async function handleDeleteCofrinho(goalId: string) {
    if (!workspaceId) return;
    const ok = await confirm({ title: 'Excluir este cofrinho?', message: 'O histórico de quanto vocês já juntaram será removido.', confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    await deleteGoal(workspaceId, goalId);
  }

  async function guardAction(action: () => Promise<unknown>) {
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'Nao foi possivel atualizar o espaco do casal agora.'));
    }
  }

  function handleCreateWorkspace() {
    if (!user) return;
    void guardAction(() => createCoupleWorkspace(user.uid, profile?.name ?? user.displayName ?? 'Zerou'));
  }

  function handleCreateInvite() {
    if (!workspaceId || !user || !shared.workspace) return;
    void guardAction(async () => {
      const invite = await createCoupleInvite(workspaceId, user.uid, shared.workspace!.name);
      setGeneratedInvite(invite);
    });
  }

  function handleRegenerateInvite() {
    if (!workspaceId || !user || !shared.workspace) return;
    void guardAction(async () => {
      const invite = await regenerateCoupleInvite(workspaceId, user.uid, shared.workspace!.name);
      setGeneratedInvite(invite);
    });
  }

  function handlePreviewInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    savePendingInvite(pendingInviteCode);
    void guardAction(async () => {
      const preview = await previewCoupleInvite(pendingInviteCode);
      setPendingInvitePreview(preview);
    });
  }

  function handleAcceptInvite() {
    if (!user) return;
    void guardAction(async () => {
      const ok = await confirm({
        title: 'Entrar neste espaço compartilhado?',
        message: pendingInvitePreview ? `Você vai compartilhar resumos de despesa com ${pendingInvitePreview.workspaceName}.` : undefined,
        confirmLabel: 'Entrar'
      });
      if (!ok) return;
      await acceptCoupleInvite(pendingInviteCode, user.uid, true);
      clearPendingInvite();
      setPendingInviteCode('');
      setPendingInvitePreview(null);
    });
  }

  function handleRevokeInvite(inviteId: string) {
    if (!workspaceId || !user) return;
    void guardAction(() => revokeCoupleInvite(workspaceId, inviteId, user.uid));
  }

  function handleCleanupInvites() {
    if (!workspaceId || !user) return;
    void guardAction(() => cleanupExpiredInvites(workspaceId, user.uid));
  }

  async function copyInvite() {
    if (!generatedInvite) return;
    try {
      await navigator.clipboard.writeText(`${generatedInvite.joinUrl}\nCódigo: ${generatedInvite.code}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage('Não foi possível copiar. Copie o código manualmente.');
    }
  }

  function computeSplit(totalCents: number) {
    const me = user!.uid;
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
      { userId: me, amountCents: myShare },
      { userId: partnerId, amountCents: totalCents - myShare }
    ];
  }

  function handleCreateClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !user || shared.activeMembers.length < 2) {
      setMessage('A despesa compartilhada precisa de duas pessoas ativas no espaço.');
      return;
    }
    void guardAction(async () => {
      const totalCents = parseMoneyToCents(claimAmount);
      await createSharedExpenseClaim(workspaceId, user.uid, {
        description: claimDescription,
        totalAmountCents: totalCents,
        participantUserIds: shared.activeMembers.map((member) => member.userId),
        split: splitMode === 'equal' ? undefined : computeSplit(totalCents)
      });
      setClaimDescription('');
      setClaimAmount('');
      setSplitMode('equal');
      setMyPercent('50');
      setMyValue('');
    });
  }

  function handleClaimStatus(claimId: string, status: 'accepted' | 'disputed' | 'settled') {
    if (!workspaceId || !user) return;
    void guardAction(() => updateSharedExpenseClaimStatus(workspaceId, user.uid, { claimId, status }));
  }

  function handleCreateSettlement() {
    if (!workspaceId || !user || !shared.settlementSuggestion) return;
    void guardAction(() => createSettlementProposal(workspaceId, user.uid, shared.settlementSuggestion!));
  }

  function handleSettlementPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !user) return;
    void guardAction(async () => {
      await recordSettlementPayment(workspaceId, user.uid, {
        settlementId: settlementPaymentId,
        amountCents: parseMoneyToCents(settlementPaymentAmount)
      });
      setSettlementPaymentId('');
      setSettlementPaymentAmount('');
    });
  }

  function handleAcceptSettlement(settlementId: string) {
    if (!workspaceId || !user) return;
    void guardAction(() => acceptSettlement(workspaceId, user.uid, settlementId));
  }

  function handleComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !user || !commentTargetId) return;
    void guardAction(async () => {
      await addSharedComment(workspaceId, user.uid, { targetType: 'claim', targetId: commentTargetId, body: commentBody });
      setCommentBody('');
    });
  }

  function handleLeaveOrRemove() {
    if (!workspaceId || !user || !shared.workspace) return;
    const isOwnerRemovingPartner = shared.workspace.ownerUserId === user.uid && partnerMember;
    void guardAction(async () => {
      const ok = await confirm({
        title: isOwnerRemovingPartner ? 'Remover parceiro?' : 'Sair do espaço compartilhado?',
        message: 'As despesas e acertos compartilhados deixam de ser atualizados para você.',
        confirmLabel: isOwnerRemovingPartner ? 'Remover' : 'Sair',
        danger: true
      });
      if (!ok) return;
      if (isOwnerRemovingPartner) {
        await removePartner(workspaceId, user.uid, partnerMember!.userId, true);
      } else {
        await leaveCoupleWorkspace(workspaceId, user.uid, true);
      }
    });
  }

  const claimOptions = useMemo(() => shared.claims.map((claim) => ({ id: claim.id, label: claim.description })), [shared.claims]);

  useEffect(() => {
    if (!commentTargetId && claimOptions[0]) setCommentTargetId(claimOptions[0].id);
  }, [claimOptions, commentTargetId]);

  const partnered = shared.activeMembers.length >= 2;
  const myBalance = shared.balances.find((balance) => balance.userId === user?.uid)?.balanceCents ?? 0;
  const suggestion = shared.settlementSuggestion;

  // Live preview of the split for the add-expense form.
  const splitPreview = (() => {
    const totalCents = claimAmount ? parseMoneyToCents(claimAmount) : 0;
    if (!totalCents || !partnerMember) return null;
    const split = computeSplit(totalCents);
    if (!split) return null;
    return { mine: split[0].amountCents, partner: split[1].amountCents };
  })();

  return (
    <section className="page-content page-content--narrow">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Espaço do casal</p>
          <h1 className="page-title page-title--compact">Organização a dois</h1>
        </div>
        <span className={`sync-badge sync-badge--${shared.pendingWrites ? 'pending' : 'synced'}`}>
          {shared.pendingWrites ? 'Sincronizando' : 'Sincronizado'}
        </span>
      </div>

      <FormMessage>{message ?? shared.error}</FormMessage>

      {/* 1) No shared space yet — create or join */}
      {!shared.activeCoupleRef ? (
        <div className="form-stack">
          <EmptyState
            illustration="shared"
            title="Organize as contas a dois"
            description="Seu espaço pessoal continua privado. O compartilhado recebe só o resumo das despesas que vocês decidirem dividir."
          />
          <button className="button button--primary button--block" type="button" onClick={handleCreateWorkspace}>
            <Plus size={18} aria-hidden="true" /> Criar espaço compartilhado
          </button>

          <details className="advanced-panel">
            <summary>Tenho um convite</summary>
            <form className="form-stack" onSubmit={handlePreviewInvite}>
              <label className="field">
                <span>Código do convite</span>
                <input className="input" value={pendingInviteCode} onChange={(event) => setPendingInviteCode(event.target.value)} placeholder="DUO-7X4K-92" />
              </label>
              <button className="button button--secondary" type="submit">Ver convite</button>
              {pendingInvitePreview ? (
                <div className="notice notice--success">
                  Convite ativo para {pendingInvitePreview.workspaceName}. Expira em {pendingInvitePreview.expiresAt.toDate().toLocaleString('pt-BR')}.
                </div>
              ) : null}
              <button className="button button--primary" type="button" disabled={!pendingInvitePreview} onClick={handleAcceptInvite}>
                Aceitar convite
              </button>
            </form>
          </details>
        </div>
      ) : !partnered ? (
        /* 2) Space exists but waiting for partner — invite hero */
        <div className="form-stack">
          <article className="surface surface-pad form-stack invite-hero">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Convite</p>
                <h2>Chame a outra pessoa</h2>
              </div>
              <QrCode size={22} aria-hidden="true" />
            </div>
            {generatedInvite ? (
              <div className="shared-invite-card">
                <strong>{generatedInvite.code}</strong>
                <span>{generatedInvite.joinUrl}</span>
                <img src={generatedInvite.qrDataUrl} alt="QR Code do convite Zerou" />
                <button className="button button--subtle button--block" type="button" onClick={() => void copyInvite()}>
                  <Copy size={16} aria-hidden="true" /> {copied ? 'Copiado!' : 'Copiar link e código'}
                </button>
              </div>
            ) : (
              <>
                <p className="text-secondary">Gere um código, link e QR Code para a outra pessoa entrar.</p>
                <button className="button button--primary button--block" type="button" onClick={handleCreateInvite}>
                  Gerar convite
                </button>
              </>
            )}
            <details className="advanced-panel">
              <summary>Opções do convite</summary>
              <div className="button-row">
                <button className="button button--secondary" type="button" onClick={handleRegenerateInvite}>Regenerar</button>
                {activeInvite ? (
                  <button className="button button--ghost" type="button" onClick={() => handleRevokeInvite(activeInvite.id)}>Revogar</button>
                ) : null}
                <button className="button button--ghost" type="button" onClick={handleCleanupInvites}>Limpar expirados</button>
              </div>
            </details>
          </article>

          <details className="advanced-panel shared-admin-panel">
            <summary>Gerenciar espaço</summary>
            <button className="button button--ghost" type="button" onClick={handleLeaveOrRemove}>Sair do espaço</button>
          </details>
        </div>
      ) : (
        /* 3) Partnered — cofrinho, balances, expenses, settlement */
        <div className="form-stack">
          {/* Cofrinho do casal — juntar dinheiro juntos */}
          <section className="cofrinho-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Cofrinho do casal</p>
                <h2>Juntem dinheiro juntos</h2>
              </div>
              <PiggyBank size={22} aria-hidden="true" />
            </div>

            {savings.stats.length === 0 ? (
              <article className="surface surface-pad">
                <EmptyState
                  illustration="goals"
                  compact
                  title="Nenhum cofrinho ainda"
                  description="Criem um objetivo em comum — viagem, reserva, casa — e acompanhem quanto já juntaram."
                  action={
                    <button className="button button--primary button--compact" type="button" onClick={() => setCofrinhoOpen(true)}>
                      <Plus size={16} aria-hidden="true" /> Criar cofrinho
                    </button>
                  }
                />
              </article>
            ) : (
              <div className="form-stack">
                {savings.stats.map((stat) => {
                  const mine = stat.byUser[user?.uid ?? ''] ?? 0;
                  const partnerCents = Object.entries(stat.byUser)
                    .filter(([uid]) => uid !== user?.uid)
                    .reduce((total, [, value]) => total + value, 0);
                  return (
                    <article className="surface cofrinho-card" key={stat.goal.id}>
                      <div className="cofrinho-top">
                        <span className="cofrinho-mark" style={{ background: stat.goal.color ?? categoryColors[0] }}><PiggyBank size={20} /></span>
                        <div className="cofrinho-title">
                          <strong>{stat.goal.name}</strong>
                          <span>Juntos este mês: {formatMoney(stat.thisMonthCents)}</span>
                        </div>
                        <button className="icon-button" type="button" aria-label="Excluir cofrinho" onClick={() => void handleDeleteCofrinho(stat.goal.id)}>
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                      <div className="cofrinho-amount">
                        <strong className="display-number">{formatMoney(stat.totalCents)}</strong>
                        {stat.goal.targetCents > 0 ? <span> de {formatMoney(stat.goal.targetCents)} · {stat.percent}%</span> : null}
                      </div>
                      {stat.goal.targetCents > 0 ? (
                        <div className="goal-progress-track" aria-hidden="true">
                          <span className="goal-progress-fill" style={{ width: `${Math.max(3, stat.percent)}%`, background: stat.goal.color }} />
                        </div>
                      ) : null}
                      <div className="cofrinho-people">
                        <div><span>Você juntou</span><strong>{formatMoney(mine)}</strong></div>
                        <div><span>{memberLabel(partnerMember, user?.uid)} juntou</span><strong>{formatMoney(partnerCents)}</strong></div>
                      </div>
                      <button className="button button--primary button--block" type="button" onClick={() => { setGuardarTarget(stat); setGuardarAmount(''); setGuardarFromAccount(''); }}>
                        <PiggyBank size={17} aria-hidden="true" /> Guardar no cofrinho
                      </button>
                    </article>
                  );
                })}
                <button className="button button--ghost" type="button" onClick={() => setCofrinhoOpen(true)}>
                  <Plus size={16} aria-hidden="true" /> Novo cofrinho
                </button>
              </div>
            )}
          </section>

          <article className={`surface balance-hero${myBalance > 0 ? ' balance-hero--credit' : myBalance < 0 ? ' balance-hero--debit' : ''}`}>
            {myBalance === 0 ? (
              <>
                <p className="balance-hero-label">Tudo certo entre vocês</p>
                <strong className="balance-hero-amount display-number">{formatMoney(0)}</strong>
                <span className="balance-hero-sub">Sem pendências no momento.</span>
              </>
            ) : myBalance > 0 ? (
              <>
                <p className="balance-hero-label">Você tem a receber</p>
                <strong className="balance-hero-amount display-number">{formatMoney(myBalance)}</strong>
                <span className="balance-hero-sub">{memberLabel(partnerMember, user?.uid)} deve esse valor a você.</span>
              </>
            ) : (
              <>
                <p className="balance-hero-label">Você deve</p>
                <strong className="balance-hero-amount display-number">{formatMoney(Math.abs(myBalance))}</strong>
                <span className="balance-hero-sub">para {memberLabel(partnerMember, user?.uid)}.</span>
              </>
            )}
            <button className="button button--block balance-hero-cta" type="button" onClick={() => setSettleOpen(true)}>
              <Handshake size={18} aria-hidden="true" /> Acertar contas
            </button>
          </article>

          {/* Add shared expense with flexible split */}
          <form className="surface surface-pad form-stack" onSubmit={handleCreateClaim}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Nova despesa</p>
                <h2>Dividir um gasto</h2>
              </div>
              <Plus size={20} aria-hidden="true" />
            </div>
            <label className="field">
              <span>Descrição</span>
              <input className="input" value={claimDescription} onChange={(event) => setClaimDescription(event.target.value)} placeholder="Mercado do mês" />
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
                <span><strong>{memberLabel(partnerMember, user?.uid)}</strong> {formatMoney(splitPreview.partner)}</span>
              </div>
            )}

            <button className="button button--primary button--block" type="submit">Adicionar despesa</button>
            <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>Nenhuma conta, cartão ou fatura pessoal entra neste registro.</p>
          </form>

          {/* Claims list */}
          <article className="surface surface-pad">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Despesas</p>
                <h2>Resumo compartilhado</h2>
              </div>
              <Users size={20} aria-hidden="true" />
            </div>
            {shared.claims.length > 0 ? (
              <div className="item-list">
                {shared.claims.map((claim) => (
                  <div className="list-row" key={claim.id}>
                    <div>
                      <strong>{claim.description}</strong>
                      <span className="text-secondary">
                        {formatMoney(claim.totalAmountCents)} · {claimStatusLabels[claim.status]} · pago por {memberLabel(shared.activeMembers.find((member) => member.userId === claim.payerUserId), user?.uid)}
                      </span>
                    </div>
                    <div className="list-row-end">
                      {claim.status === 'pending' ? (
                        <>
                          <button className="button button--subtle button--compact" type="button" onClick={() => handleClaimStatus(claim.id, 'accepted')}>Aceitar</button>
                          <button className="button button--ghost button--compact" type="button" onClick={() => handleClaimStatus(claim.id, 'disputed')}>Contestar</button>
                        </>
                      ) : null}
                      {claim.status === 'accepted' ? (
                        <button className="button button--ghost button--compact" type="button" onClick={() => handleClaimStatus(claim.id, 'settled')}>Marcar acertado</button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState illustration="wallet" compact title="Nenhuma despesa dividida" description="Adicione um gasto acima para começar a dividir." />
            )}
          </article>

          {/* Comments */}
          <details className="advanced-panel">
            <summary><MessageSquare size={15} aria-hidden="true" /> Comentários</summary>
            <form className="form-stack" onSubmit={handleComment}>
              {shared.comments.length > 0 ? (
                <div className="item-list">
                  {shared.comments.slice(0, 5).map((comment) => (
                    <div className="list-row" key={comment.id}>
                      <div>
                        <strong>{memberLabel(shared.activeMembers.find((member) => member.userId === comment.createdBy), user?.uid)}</strong>
                        <span className="text-secondary">{comment.body}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {claimOptions.length > 0 ? (
                <>
                  <textarea className="input textarea" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Escreva um comentário sobre a despesa selecionada." />
                  <button className="button button--secondary" type="submit" disabled={!commentTargetId || !commentBody.trim()}>Comentar</button>
                </>
              ) : (
                <p className="text-secondary">Adicione uma despesa para comentar sobre ela.</p>
              )}
            </form>
          </details>

          {/* Manage */}
          <details className="advanced-panel shared-admin-panel">
            <summary>Gerenciar espaço</summary>
            <div className="form-stack">
              <span className="text-secondary">
                Dono: {memberLabel(ownerMember, user?.uid)} · Parceiro: {partnerMember ? memberLabel(partnerMember, user?.uid) : 'aguardando'}
              </span>
              <button className="button button--ghost button--danger-text" type="button" onClick={handleLeaveOrRemove}>
                {shared.workspace?.ownerUserId === user?.uid && partnerMember ? 'Remover parceiro' : 'Sair do espaço'}
              </button>
            </div>
          </details>
        </div>
      )}

      {/* Settlement sheet */}
      <BottomSheet open={settleOpen} onClose={() => setSettleOpen(false)} title="Acertar contas" subtitle="Combine e registre o reembolso">
        {suggestion ? (
          <div className="notice notice--success">
            Sugestão: {memberLabel(shared.activeMembers.find((member) => member.userId === suggestion.fromUserId), user?.uid)} paga {formatMoney(suggestion.amountCents)} para {memberLabel(shared.activeMembers.find((member) => member.userId === suggestion.toUserId), user?.uid)}.
          </div>
        ) : (
          <p className="text-secondary">Sem saldo pendente para sugerir acerto.</p>
        )}
        <button className="button button--primary button--block" type="button" disabled={!suggestion} onClick={handleCreateSettlement} style={{ marginTop: '0.75rem' }}>
          Criar proposta de acerto
        </button>

        {shared.settlements.length > 0 ? (
          <div className="item-list" style={{ marginTop: '1rem' }}>
            {shared.settlements.map((settlement) => (
              <div className="list-row" key={settlement.id}>
                <div>
                  <strong>{formatMoney(settlement.amountCents)}</strong>
                  <span className="text-secondary">{settlementStatusLabels[settlement.status]} · pago {formatMoney(settlement.paidAmountCents)}</span>
                </div>
                <div className="list-row-end">
                  {settlement.status === 'proposed' ? (
                    <button className="button button--subtle button--compact" type="button" onClick={() => handleAcceptSettlement(settlement.id)}>Aceitar</button>
                  ) : null}
                  <button className="button button--ghost button--compact" type="button" onClick={() => setSettlementPaymentId(settlement.id)}>Pagar</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {settlementPaymentId ? (
          <form className="form-stack" onSubmit={handleSettlementPayment} style={{ marginTop: '1rem' }}>
            <label className="field">
              <span>Valor pago</span>
              <input className="input" inputMode="decimal" value={settlementPaymentAmount} onChange={(event) => setSettlementPaymentAmount(event.target.value)} placeholder="0,00" autoFocus />
            </label>
            <button className="button button--secondary button--block" type="submit">Registrar pagamento</button>
          </form>
        ) : null}
      </BottomSheet>

      {/* Create cofrinho sheet */}
      <BottomSheet open={cofrinhoOpen} onClose={() => setCofrinhoOpen(false)} title="Novo cofrinho do casal" subtitle="Um objetivo em comum">
        <form className="category-create" onSubmit={(event) => void handleCreateCofrinho(event)}>
          <div className="category-create-preview">
            <span className="category-tile-mark category-tile-mark--lg" style={{ background: cofrinhoColor }}><PiggyBank size={26} /></span>
          </div>
          <label className="field">
            <span>Nome</span>
            <input className="input" value={cofrinhoName} onChange={(event) => setCofrinhoName(event.target.value)} placeholder="Ex: Viagem, Reserva, Casa nova..." autoFocus />
          </label>
          <label className="field">
            <span>Meta (opcional)</span>
            <input className="input" inputMode="decimal" value={cofrinhoTarget} onChange={(event) => setCofrinhoTarget(event.target.value)} placeholder="0,00" />
          </label>
          <div className="field">
            <span className="field-label">Cor</span>
            <div className="color-grid">
              {categoryColors.map((color) => (
                <button key={color} type="button" className={`color-dot${cofrinhoColor === color ? ' color-dot--selected' : ''}`} style={{ background: color, color }} aria-pressed={cofrinhoColor === color} aria-label={`Cor ${color}`} onClick={() => setCofrinhoColor(color)}>
                  {cofrinhoColor === color && <Check size={15} color={ACCENT_FOREGROUND} />}
                </button>
              ))}
            </div>
          </div>
          <div className="sheet-actions">
            <button className="button button--primary" type="submit" disabled={!cofrinhoName.trim()}>Criar cofrinho</button>
          </div>
        </form>
      </BottomSheet>

      {/* Guardar (contribute) sheet */}
      <BottomSheet open={Boolean(guardarTarget)} onClose={() => setGuardarTarget(null)} title={guardarTarget ? `Guardar — ${guardarTarget.goal.name}` : ''} subtitle="Quanto você vai guardar?">
        <form className="form-stack" onSubmit={(event) => void handleGuardar(event)}>
          <label className="field">
            <span>Valor</span>
            <input className="input input--money" inputMode="decimal" value={guardarAmount} onChange={(event) => setGuardarAmount(event.target.value)} placeholder="0,00" autoFocus />
          </label>
          <div className="field">
            <span className="field-label">De onde sai o dinheiro?</span>
            <div className="chip-row">
              <button type="button" className={`chip${!guardarFromAccount ? ' chip--active' : ''}`} onClick={() => setGuardarFromAccount('')}>Só registrar</button>
              {personalFinance.accounts.map((account) => (
                <button key={account.id} type="button" className={`chip${guardarFromAccount === account.id ? ' chip--active' : ''}`} onClick={() => setGuardarFromAccount(account.id)}>{account.name}</button>
              ))}
            </div>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.4rem 0 0' }}>
              {guardarFromAccount ? 'Vira uma despesa "Cofrinho" na sua conta pessoal e some no total do casal.' : 'Só soma no cofrinho do casal, sem mexer no saldo das suas contas.'}
            </p>
          </div>
          <div className="sheet-actions">
            <button className="button button--primary" type="submit" disabled={!guardarAmount}>Guardar</button>
          </div>
        </form>
      </BottomSheet>

      {dialog}
    </section>
  );
}
