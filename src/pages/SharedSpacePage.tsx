import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, ChevronRight, Copy, Eye, PiggyBank, Plus, QrCode, Scale, Settings2, Trash2, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { calculateAccountBalances } from '../finance/financeCalculations';
import { clearPendingInvite, readPendingInvite, savePendingInvite } from '../auth/pendingInvite';
import { BottomSheet } from '../components/BottomSheet';
import { categoryColors } from '../components/categoryIcons';
import { ACCENT_FOREGROUND } from '../theme/palette';
import { useConfirm } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { FormMessage } from '../components/FormMessage';
import { addGoalContribution, createGoal, createTransaction, deleteGoal } from '../finance/financeService';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { type CoupleGoalStats } from '../shared/useCoupleSavings';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { useCoupleSavingsContext, useSharedContext } from '../shared/SharedDataContext';
import { getUserFacingErrorMessage } from '../utils/userFacingError';
import {
  acceptCoupleInvite,
  cancelCoupleWorkspace,
  cleanupExpiredInvites,
  createCoupleInvite,
  createCoupleWorkspace,
  createSharedExpenseClaim,
  leaveCoupleWorkspace,
  previewCoupleInvite,
  regenerateCoupleInvite,
  removePartner,
  revokeCoupleInvite,
  updateCoupleMode
} from '../shared/sharedService';
import type { CoupleInvite, CoupleMode, WorkspaceMembership } from '../types/contracts';

type SplitMode = 'equal' | 'percent' | 'value';

const modeLabels: Record<CoupleMode, string> = {
  savings_only: 'Só o cofrinho',
  transparent: 'Transparência',
  balanced: 'Equilíbrio'
};

function memberLabel(member: WorkspaceMembership | undefined, currentUserId?: string) {
  if (!member) return 'Parceiro(a)';
  if (member.userId === currentUserId) return 'Você';
  return member.displayName || (member.role === 'owner' ? 'Dono' : 'Parceiro(a)');
}

export function SharedSpacePage() {
  const { user, profile } = useAuth();
  const shared = useSharedContext();
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


  // Modo do casal
  const [modeSheetOpen, setModeSheetOpen] = useState(false);
  const [modeSheetPurpose, setModeSheetPurpose] = useState<'create' | 'change'>('create');
  const [selectedMode, setSelectedMode] = useState<CoupleMode>('savings_only');

  // Couple savings ("cofrinho")
  const savings = useCoupleSavingsContext();
  const personalFinance = useFinanceContext();
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

  // Auto-preview when a pending invite code lands and user has no couple space yet
  useEffect(() => {
    if (!pendingInviteCode || pendingInvitePreview || shared.activeCoupleRef) return;
    previewCoupleInvite(pendingInviteCode)
      .then(setPendingInvitePreview)
      .catch((err) => setMessage(getUserFacingErrorMessage(err, 'Convite não encontrado ou expirado.')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInviteCode]);

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
    if (guardarFromAccount) {
      const balances = calculateAccountBalances(personalFinance.accounts, personalFinance.transactions);
      const acct = balances.find((a) => a.id === guardarFromAccount);
      if (acct && amountCents > acct.balanceCents) {
        setMessage(`Saldo insuficiente. Disponível na conta: ${formatMoney(acct.balanceCents)}`);
        return;
      }
    }
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
    deleteGoal(workspaceId, goalId)
      .catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível excluir o cofrinho agora.')));
  }

  function handleCreateWorkspace() {
    setSelectedMode('savings_only');
    setModeSheetPurpose('create');
    setModeSheetOpen(true);
  }

  function handleConfirmModeSheet() {
    setModeSheetOpen(false);
    setMessage(null);
    if (modeSheetPurpose === 'create') {
      if (!user) return;
      createCoupleWorkspace(user.uid, profile?.name ?? user.displayName ?? 'Granativa', selectedMode)
        .catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível criar o espaço agora.')));
    } else {
      if (!workspaceId || !user) return;
      updateCoupleMode(workspaceId, user.uid, selectedMode)
        .catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível mudar o modo agora.')));
    }
  }

  function handleOpenModeChange() {
    setSelectedMode(shared.workspace?.coupleMode ?? 'savings_only');
    setModeSheetPurpose('change');
    setModeSheetOpen(true);
  }

  function handleUpgradeMode(mode: CoupleMode) {
    if (!workspaceId || !user) return;
    setMessage(null);
    updateCoupleMode(workspaceId, user.uid, mode)
      .catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível mudar o modo agora.')));
  }

  function handleCreateInvite() {
    if (!workspaceId || !user || !shared.workspace) return;
    setMessage(null);
    createCoupleInvite(workspaceId, user.uid, shared.workspace.name)
      .then(setGeneratedInvite)
      .catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível gerar o convite agora.')));
  }

  function handleRegenerateInvite() {
    if (!workspaceId || !user || !shared.workspace) return;
    setMessage(null);
    regenerateCoupleInvite(workspaceId, user.uid, shared.workspace.name)
      .then(setGeneratedInvite)
      .catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível regenerar o convite agora.')));
  }

  function handlePreviewInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    savePendingInvite(pendingInviteCode);
    setMessage(null);
    previewCoupleInvite(pendingInviteCode)
      .then(setPendingInvitePreview)
      .catch((err) => setMessage(getUserFacingErrorMessage(err, 'Convite não encontrado ou expirado.')));
  }

  async function handleAcceptInvite() {
    if (!user) return;
    setMessage(null);
    const ok = await confirm({
      title: 'Entrar neste espaço compartilhado?',
      message: pendingInvitePreview ? `Você vai compartilhar resumos de despesa com ${pendingInvitePreview.workspaceName}.` : undefined,
      confirmLabel: 'Entrar'
    });
    if (!ok) return;
    clearPendingInvite();
    setPendingInviteCode('');
    setPendingInvitePreview(null);
    acceptCoupleInvite(pendingInviteCode, user.uid, profile?.name ?? user.displayName ?? '', true)
      .catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível aceitar o convite agora.')));
  }

  function handleRevokeInvite(inviteId: string) {
    if (!workspaceId || !user) return;
    setMessage(null);
    revokeCoupleInvite(workspaceId, inviteId, user.uid)
      .catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível revogar o convite agora.')));
  }

  function handleCleanupInvites() {
    if (!workspaceId || !user) return;
    cleanupExpiredInvites(workspaceId, user.uid).catch(() => undefined);
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
    const totalCents = parseMoneyToCents(claimAmount);
    const description = claimDescription;
    const split = splitMode === 'equal' ? undefined : computeSplit(totalCents);
    setMessage(null);
    setClaimDescription('');
    setClaimAmount('');
    setSplitMode('equal');
    setMyPercent('50');
    setMyValue('');
    createSharedExpenseClaim(workspaceId, user.uid, {
      description,
      totalAmountCents: totalCents,
      participantUserIds: shared.activeMembers.map((member) => member.userId),
      split,
    }).catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível registrar a despesa agora.')));
  }

  function handleLeaveOrRemove() {
    if (!workspaceId || !user || !shared.workspace) return;
    const isOwner = shared.workspace.ownerUserId === user.uid;
    const isOwnerRemovingPartner = isOwner && Boolean(partnerMember);
    const isOwnerAlone = isOwner && !partnerMember;
    void (async () => {
      setMessage(null);
      const ok = await confirm({
        title: isOwnerRemovingPartner ? 'Remover parceiro?' : isOwnerAlone ? 'Cancelar espaço compartilhado?' : 'Sair do espaço compartilhado?',
        message: isOwnerAlone
          ? 'O espaço compartilhado será excluído. Você pode criar um novo a qualquer momento.'
          : 'As despesas e acertos compartilhados deixam de ser atualizados para você.',
        confirmLabel: isOwnerRemovingPartner ? 'Remover' : isOwnerAlone ? 'Excluir' : 'Sair',
        danger: true
      });
      if (!ok) return;
      const fn = isOwnerRemovingPartner
        ? () => removePartner(workspaceId, user.uid, partnerMember!.userId, true)
        : isOwnerAlone
        ? () => cancelCoupleWorkspace(workspaceId, user.uid, true)
        : () => leaveCoupleWorkspace(workspaceId, user.uid, true);
      fn().catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível sair do espaço agora.')));
    })();
  }

  const partnered = shared.activeMembers.length >= 2;
  const coupleMode = shared.workspace?.coupleMode ?? null;

  const proportionalBalance = useMemo(() => {
    if (coupleMode !== 'balanced' || !partnered) return null;
    const myPaid = shared.claims.filter((c) => c.payerUserId === user?.uid).reduce((sum, c) => sum + c.totalAmountCents, 0);
    const partnerPaid = shared.claims.filter((c) => c.payerUserId !== user?.uid).reduce((sum, c) => sum + c.totalAmountCents, 0);
    const total = myPaid + partnerPaid;
    if (total === 0) return { myPct: 50, partnerPct: 50, myPaid: 0, partnerPaid: 0, total: 0 };
    const myPct = Math.round((myPaid / total) * 100);
    return { myPct, partnerPct: 100 - myPct, myPaid, partnerPaid, total };
  }, [coupleMode, partnered, shared.claims, user?.uid]);

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

          {pendingInviteCode ? (
            /* Pending invite — show acceptance as the primary action */
            <article className="surface surface-pad form-stack">
              <p className="eyebrow">Convite pendente</p>
              {pendingInvitePreview ? (
                <>
                  <div className="notice notice--success">
                    <strong>{pendingInvitePreview.workspaceName}</strong>
                    <br />
                    <span>Expira em {pendingInvitePreview.expiresAt.toDate().toLocaleString('pt-BR')}</span>
                  </div>
                  <button className="button button--primary button--block" type="button" onClick={handleAcceptInvite}>
                    Entrar no espaço compartilhado
                  </button>
                </>
              ) : (
                <form className="form-stack" onSubmit={handlePreviewInvite}>
                  <label className="field">
                    <span>Código do convite</span>
                    <input className="input" value={pendingInviteCode} onChange={(event) => setPendingInviteCode(event.target.value)} placeholder="DUO-7X4K-92" />
                  </label>
                  <button className="button button--primary" type="submit">Ver convite</button>
                </form>
              )}
              <button
                className="button button--ghost"
                type="button"
                onClick={() => { clearPendingInvite(); setPendingInviteCode(''); setPendingInvitePreview(null); }}
              >
                Cancelar
              </button>
            </article>
          ) : (
            /* No pending invite — create workspace or enter a code */
            <>
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
                </form>
              </details>
            </>
          )}
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
                <img src={generatedInvite.qrDataUrl} alt="QR Code do convite Granativa" />
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

          <button className="button button--ghost button--block" type="button" onClick={handleLeaveOrRemove}>
            Cancelar e sair do espaço
          </button>
        </div>
      ) : (
        /* 3) Partnered — renderização baseada no coupleMode */
        <div className="form-stack">

          {/* Cofrinho — sempre presente */}
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
                {savings.stats.map((stat) => (
                  <article className="surface cofrinho-card" key={stat.goal.id}>
                    <div className="cofrinho-top">
                      <span className="cofrinho-mark" style={{ background: stat.goal.color ?? categoryColors[0] }}><PiggyBank size={20} /></span>
                      <div className="cofrinho-title">
                        <strong>{stat.goal.name}</strong>
                        {stat.thisMonthCents > 0 && <span>Juntos este mês: {formatMoney(stat.thisMonthCents)}</span>}
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
                    <button className="button button--primary button--block" type="button" onClick={() => { setGuardarTarget(stat); setGuardarAmount(''); setGuardarFromAccount(''); }}>
                      <PiggyBank size={17} aria-hidden="true" /> Guardar no cofrinho
                    </button>
                  </article>
                ))}
                <button className="button button--ghost" type="button" onClick={() => setCofrinhoOpen(true)}>
                  <Plus size={16} aria-hidden="true" /> Novo cofrinho
                </button>
              </div>
            )}
          </section>

          {/* Modo não configurado → seleção inline */}
          {!coupleMode && (
            <article className="surface surface-pad form-stack">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Modo do espaço</p>
                  <h2>Como vocês querem usar?</h2>
                </div>
                <Settings2 size={20} aria-hidden="true" />
              </div>
              <p className="text-secondary" style={{ margin: 0 }}>Escolham o modo que combina com vocês. Dá pra mudar quando quiser.</p>
              {([
                { id: 'savings_only' as CoupleMode, icon: <PiggyBank size={18} />, label: 'Só o cofrinho', desc: 'Juntamos dinheiro pra objetivos em comum. Simples assim.', more: 'Despesas podem ser ativadas depois' },
                { id: 'transparent' as CoupleMode, icon: <Eye size={18} />, label: 'Transparência', desc: 'Cada um vê o que o outro pagou nas despesas divididas. Sem cálculo de dívida.', more: 'Equilíbrio pode ser ativado depois' },
                { id: 'balanced' as CoupleMode, icon: <Scale size={18} />, label: 'Equilíbrio', desc: 'Vemos quem está cobrindo mais no mês, em proporção. Sem acerto formal.' }
              ] as const).map((opt) => (
                <button key={opt.id} type="button" className={`couple-mode-card${selectedMode === opt.id ? ' couple-mode-card--selected' : ''}`} onClick={() => setSelectedMode(opt.id)}>
                  <span className={`couple-mode-icon couple-mode-icon--${opt.id.replace('_', '-')}`}>{opt.icon}</span>
                  <span className="couple-mode-text">
                    <strong>{opt.label}</strong>
                    <span>{opt.desc}</span>
                    {'more' in opt && opt.more && <span className="couple-mode-more">{opt.more}</span>}
                  </span>
                </button>
              ))}
              <button className="button button--primary button--block" type="button" onClick={() => handleUpgradeMode(selectedMode)}>
                Usar este modo
              </button>
            </article>
          )}

          {/* Equilíbrio — barra proporcional */}
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
                    <span><strong>{memberLabel(partnerMember, user?.uid)}</strong>{formatMoney(proportionalBalance.partnerPaid)} · {proportionalBalance.partnerPct}%</span>
                  </div>
                  {proportionalBalance.myPct > 65 && (
                    <p className="text-muted" style={{ margin: 0, fontSize: '0.82rem' }}>Quando {memberLabel(partnerMember, user?.uid)} pagar a próxima, vai equilibrar.</p>
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

          {/* Despesas divididas — transparent e balanced */}
          {(coupleMode === 'transparent' || coupleMode === 'balanced') && (
            <>
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

              <article className="surface surface-pad">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Despesas</p>
                    <h2>Registradas juntos</h2>
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
                            {formatMoney(claim.totalAmountCents)} · pago por {memberLabel(shared.activeMembers.find((m) => m.userId === claim.payerUserId), user?.uid)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState illustration="wallet" compact title="Nenhuma despesa ainda" description="Adicione um gasto acima pra começar a registrar." />
                )}
              </article>

              {coupleMode === 'transparent' && (
                <button type="button" className="couple-upgrade-card" onClick={() => handleUpgradeMode('balanced')}>
                  <span className="couple-mode-icon couple-mode-icon--balanced"><Scale size={18} aria-hidden="true" /></span>
                  <span className="couple-upgrade-text">
                    <strong>Ativar equilíbrio</strong>
                    <span>Veja a proporção de quem está cobrindo mais no mês.</span>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-muted)' }} />
                </button>
              )}
            </>
          )}

          {/* savings_only: upgrade card */}
          {coupleMode === 'savings_only' && (
            <button type="button" className="couple-upgrade-card" onClick={() => handleUpgradeMode('transparent')}>
              <span className="couple-mode-icon couple-mode-icon--transparent"><Eye size={18} aria-hidden="true" /></span>
              <span className="couple-upgrade-text">
                <strong>Ativar transparência</strong>
                <span>Veja o que cada um paga nas despesas divididas.</span>
              </span>
              <ChevronRight size={16} aria-hidden="true" style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-muted)' }} />
            </button>
          )}

          {/* Gerenciar */}
          <details className="advanced-panel shared-admin-panel">
            <summary>Gerenciar espaço</summary>
            <div className="form-stack">
              <span className="text-secondary">
                Dono: {memberLabel(ownerMember, user?.uid)} · Parceiro: {partnerMember ? memberLabel(partnerMember, user?.uid) : 'aguardando'}
              </span>
              {coupleMode && (
                <div className="form-stack">
                  <p className="text-secondary" style={{ margin: 0, fontSize: '0.82rem' }}>
                    Modo atual: <strong>{modeLabels[coupleMode]}</strong>
                  </p>
                  <button className="button button--ghost button--block" type="button" onClick={handleOpenModeChange}>
                    Mudar modo do espaço
                  </button>
                </div>
              )}
              <button className="button button--ghost button--danger-text" type="button" onClick={handleLeaveOrRemove}>
                {shared.workspace?.ownerUserId === user?.uid && partnerMember ? 'Remover parceiro' : 'Sair do espaço'}
              </button>
            </div>
          </details>
        </div>
      )}

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

      {/* Mode selection sheet — create or change */}
      <BottomSheet
        open={modeSheetOpen}
        onClose={() => setModeSheetOpen(false)}
        title={modeSheetPurpose === 'create' ? 'Como vocês querem usar?' : 'Modo do espaço'}
        subtitle="Podem mudar a qualquer momento."
      >
        <div className="form-stack">
          {([
            { id: 'savings_only' as CoupleMode, icon: <PiggyBank size={18} />, label: 'Só o cofrinho', desc: 'Juntamos dinheiro pra objetivos em comum. Simples assim.', more: 'Despesas podem ser ativadas depois' },
            { id: 'transparent' as CoupleMode, icon: <Eye size={18} />, label: 'Transparência', desc: 'Cada um vê o que o outro pagou nas despesas divididas. Sem cálculo de dívida.', more: 'Equilíbrio pode ser ativado depois' },
            { id: 'balanced' as CoupleMode, icon: <Scale size={18} />, label: 'Equilíbrio', desc: 'Vemos quem está cobrindo mais no mês, em proporção. Sem acerto formal.' }
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`couple-mode-card${selectedMode === opt.id ? ' couple-mode-card--selected' : ''}`}
              onClick={() => setSelectedMode(opt.id)}
            >
              <span className={`couple-mode-icon couple-mode-icon--${opt.id.replace('_', '-')}`}>{opt.icon}</span>
              <span className="couple-mode-text">
                <strong>{opt.label}</strong>
                <span>{opt.desc}</span>
                {'more' in opt && opt.more && <span className="couple-mode-more">{opt.more}</span>}
              </span>
            </button>
          ))}
          <div className="sheet-actions">
            <button className="button button--primary" type="button" onClick={handleConfirmModeSheet}>
              {modeSheetPurpose === 'create' ? 'Criar espaço' : 'Confirmar'}
            </button>
          </div>
        </div>
      </BottomSheet>

      {dialog}
    </section>
  );
}
