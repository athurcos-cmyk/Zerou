import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { clearPendingInvite, readPendingInvite, savePendingInvite } from '../auth/pendingInvite';
import { useConfirm } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { FormMessage } from '../components/FormMessage';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { useCoupleSavingsContext, useSharedContext } from '../shared/SharedDataContext';
import { getUserFacingErrorMessage } from '../utils/userFacingError';
import {
  acceptCoupleInvite,
  cancelCoupleWorkspace,
  createCoupleWorkspace,
  leaveCoupleWorkspace,
  previewCoupleInvite,
  removePartner,
  updateCoupleMode
} from '../shared/sharedService';
import { CoupleExpensesSection } from './shared/CoupleExpensesSection';
import { CoupleInviteSection } from './shared/CoupleInviteSection';
import { CoupleModeSheet, coupleModeLabels } from './shared/CoupleModeSheet';
import { CoupleSavingsSection } from './shared/CoupleSavingsSection';
import { memberLabel } from './shared/memberLabel';
import type { CoupleInvite, CoupleMode } from '../types/contracts';

export function SharedSpacePage() {
  const { user, profile } = useAuth();
  const shared = useSharedContext();
  const savings = useCoupleSavingsContext();
  const personalFinance = useFinanceContext();
  const workspaceId = shared.workspace?.id;
  const ownerMember = shared.activeMembers.find((member) => member.role === 'owner');
  const partnerMember = shared.activeMembers.find((member) => member.userId !== user?.uid);
  const { confirm, dialog } = useConfirm();

  const [message, setMessage] = useState<string | null>(null);
  const [pendingInviteCode, setPendingInviteCode] = useState('');
  const [pendingInvitePreview, setPendingInvitePreview] = useState<CoupleInvite | null>(null);

  // Modo do casal (criar ou trocar) — mesmo BottomSheet nos dois casos, sem lista duplicada.
  const [modeSheetOpen, setModeSheetOpen] = useState(false);
  const [modeSheetPurpose, setModeSheetPurpose] = useState<'create' | 'change'>('create');
  const [selectedMode, setSelectedMode] = useState<CoupleMode>('savings_only');

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
                  <button className="button button--primary button--block" type="button" onClick={() => void handleAcceptInvite()}>
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
                <summary>Já tenho um código</summary>
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
        /* 2) Space exists but waiting for partner — invite card */
        <div className="form-stack">
          {workspaceId && user ? (
            <CoupleInviteSection
              workspaceId={workspaceId}
              workspaceName={shared.workspace?.name ?? ''}
              userId={user.uid}
              activeInvite={shared.invites[0]}
              confirm={confirm}
              onMessage={setMessage}
            />
          ) : null}
          <button className="button button--ghost button--block" type="button" onClick={handleLeaveOrRemove}>
            Cancelar espaço compartilhado
          </button>
        </div>
      ) : (
        /* 3) Partnered — cofrinho + despesas + gerenciar */
        <div className="form-stack">
          {workspaceId && user ? (
            <CoupleSavingsSection
              workspaceId={workspaceId}
              userId={user.uid}
              personalDefaultWorkspaceId={profile?.defaultWorkspaceId}
              savings={savings}
              personalFinance={personalFinance}
              confirm={confirm}
              onMessage={setMessage}
            />
          ) : null}

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
              <button className="button button--primary button--block" type="button" onClick={handleOpenModeChange}>
                Escolher modo
              </button>
            </article>
          )}

          {workspaceId && coupleMode ? (
            <CoupleExpensesSection
              workspaceId={workspaceId}
              userId={user!.uid}
              coupleMode={coupleMode}
              activeMembers={shared.activeMembers}
              partnerMember={partnerMember}
              claims={shared.claims}
              onUpgradeMode={handleUpgradeMode}
              onMessage={setMessage}
            />
          ) : null}

          <details className="advanced-panel shared-admin-panel">
            <summary>Gerenciar espaço</summary>
            <div className="form-stack">
              <span className="text-secondary">
                Dono: {memberLabel(ownerMember, user?.uid)} · Parceiro: {partnerMember ? memberLabel(partnerMember, user?.uid) : 'aguardando'}
              </span>
              {coupleMode && (
                <div className="form-stack">
                  <p className="text-secondary" style={{ margin: 0, fontSize: '0.82rem' }}>
                    Modo atual: <strong>{coupleModeLabels[coupleMode]}</strong>
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

      <CoupleModeSheet
        open={modeSheetOpen}
        onClose={() => setModeSheetOpen(false)}
        purpose={modeSheetPurpose}
        selectedMode={selectedMode}
        onSelect={setSelectedMode}
        onConfirm={handleConfirmModeSheet}
      />

      {dialog}
    </section>
  );
}
