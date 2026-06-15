import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Handshake, Link2, MessageSquare, QrCode, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { clearPendingInvite, readPendingInvite, savePendingInvite } from '../auth/pendingInvite';
import { FormMessage } from '../components/FormMessage';
import { formatMoney, parseMoneyToCents } from '../finance/money';
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

function memberLabel(member: WorkspaceMembership | undefined, currentUserId?: string) {
  if (!member) {
    return 'Membro';
  }

  if (member.userId === currentUserId) {
    return 'Você';
  }

  return member.role === 'owner' ? 'Dono' : 'Parceiro';
}

export function SharedSpacePage() {
  const { user, profile } = useAuth();
  const shared = useSharedWorkspaceData(user?.uid);
  const workspaceId = shared.workspace?.id;
  const ownerMember = shared.activeMembers.find((member) => member.role === 'owner');
  const partnerMember = shared.activeMembers.find((member) => member.role === 'partner');
  const activeInvite = shared.invites[0];
  const [message, setMessage] = useState<string | null>(null);
  const [pendingInviteCode, setPendingInviteCode] = useState('');
  const [pendingInvitePreview, setPendingInvitePreview] = useState<CoupleInvite | null>(null);
  const [generatedInvite, setGeneratedInvite] = useState<{ code: string; joinUrl: string; qrDataUrl: string } | null>(null);
  const [claimDescription, setClaimDescription] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [commentTargetId, setCommentTargetId] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [settlementPaymentId, setSettlementPaymentId] = useState('');
  const [settlementPaymentAmount, setSettlementPaymentAmount] = useState('');

  useEffect(() => {
    const storedCode = readPendingInvite();

    if (storedCode) {
      setPendingInviteCode(storedCode);
    }
  }, []);

  async function guardAction(action: () => Promise<unknown>) {
    setMessage(null);

    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir esta ação agora.');
    }
  }

  function handleCreateWorkspace() {
    if (!user) {
      return;
    }

    void guardAction(() => createCoupleWorkspace(user.uid, profile?.name ?? user.displayName ?? 'Zerou'));
  }

  function handleCreateInvite() {
    if (!workspaceId || !user || !shared.workspace) {
      return;
    }

    void guardAction(async () => {
      const invite = await createCoupleInvite(workspaceId, user.uid, shared.workspace!.name);
      setGeneratedInvite(invite);
    });
  }

  function handleRegenerateInvite() {
    if (!workspaceId || !user || !shared.workspace) {
      return;
    }

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
    if (!user) {
      return;
    }

    void guardAction(async () => {
      await acceptCoupleInvite(pendingInviteCode, user.uid, window.confirm('Entrar neste espaço compartilhado da Zerou?'));
      clearPendingInvite();
      setPendingInviteCode('');
      setPendingInvitePreview(null);
    });
  }

  function handleRevokeInvite(inviteId: string) {
    if (!workspaceId || !user) {
      return;
    }

    void guardAction(() => revokeCoupleInvite(workspaceId, inviteId, user.uid));
  }

  function handleCleanupInvites() {
    if (!workspaceId || !user) {
      return;
    }

    void guardAction(() => cleanupExpiredInvites(workspaceId, user.uid));
  }

  function handleCreateClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workspaceId || !user || shared.activeMembers.length < 2) {
      setMessage('A despesa compartilhada precisa de duas pessoas ativas no espaço.');
      return;
    }

    void guardAction(async () => {
      await createSharedExpenseClaim(workspaceId, user.uid, {
        description: claimDescription,
        totalAmountCents: parseMoneyToCents(claimAmount),
        participantUserIds: shared.activeMembers.map((member) => member.userId)
      });
      setClaimDescription('');
      setClaimAmount('');
    });
  }

  function handleClaimStatus(claimId: string, status: 'accepted' | 'disputed' | 'settled') {
    if (!workspaceId || !user) {
      return;
    }

    void guardAction(() => updateSharedExpenseClaimStatus(workspaceId, user.uid, { claimId, status }));
  }

  function handleCreateSettlement() {
    if (!workspaceId || !user || !shared.settlementSuggestion) {
      return;
    }

    void guardAction(() => createSettlementProposal(workspaceId, user.uid, shared.settlementSuggestion!));
  }

  function handleSettlementPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workspaceId || !user) {
      return;
    }

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
    if (!workspaceId || !user) {
      return;
    }

    void guardAction(() => acceptSettlement(workspaceId, user.uid, settlementId));
  }

  function handleComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workspaceId || !user) {
      return;
    }

    void guardAction(async () => {
      await addSharedComment(workspaceId, user.uid, {
        targetType: 'claim',
        targetId: commentTargetId,
        body: commentBody
      });
      setCommentBody('');
    });
  }

  function handleLeaveOrRemove() {
    if (!workspaceId || !user || !shared.workspace) {
      return;
    }

    if (shared.workspace.ownerUserId === user.uid && partnerMember) {
      void guardAction(() => removePartner(workspaceId, user.uid, partnerMember.userId, window.confirm('Remover o parceiro deste espaço compartilhado?')));
      return;
    }

    void guardAction(() => leaveCoupleWorkspace(workspaceId, user.uid, window.confirm('Sair deste espaço compartilhado?')));
  }

  const canLeaveOrRemove = Boolean(shared.workspace?.ownerUserId !== user?.uid || partnerMember);
  const claimOptions = useMemo(() => shared.claims.map((claim) => ({ id: claim.id, label: claim.description })), [shared.claims]);

  useEffect(() => {
    if (!commentTargetId && claimOptions[0]) {
      setCommentTargetId(claimOptions[0].id);
    }
  }, [claimOptions, commentTargetId]);

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Espaço compartilhado</p>
          <h1 className="page-title">Duas pessoas. Dois espaços. Uma organização em comum.</h1>
          <p className="page-description">
            Compartilhe apenas um resumo da despesa e o acerto combinado. Conta, cartão, fatura e histórico pessoal ficam privados.
          </p>
        </div>
        <span className={`sync-badge sync-badge--${shared.pendingWrites ? 'pending' : 'synced'}`}>
          {shared.pendingWrites ? 'Sincronizando' : 'Sincronizado'}
        </span>
      </div>

      <FormMessage>{message ?? shared.error}</FormMessage>

      {!shared.activeCoupleRef ? (
        <div className="finance-grid">
          <article className="surface surface-pad form-stack">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Criar</p>
                <h2>Começar um espaço compartilhado</h2>
              </div>
              <Users size={22} aria-hidden="true" />
            </div>
            <p className="text-secondary">
              A Zerou mantém seu workspace pessoal separado. O espaço compartilhado nasce vazio e recebe somente o que vocês decidirem lançar nele.
            </p>
            <button className="button button--primary" type="button" onClick={handleCreateWorkspace}>
              Criar espaço compartilhado
            </button>
          </article>

          <article className="surface surface-pad form-stack">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Entrar</p>
                <h2>Usar um convite</h2>
              </div>
              <Link2 size={22} aria-hidden="true" />
            </div>
            <form className="form-stack" onSubmit={handlePreviewInvite}>
              <label className="field">
                <span>Código Duo</span>
                <input className="input" value={pendingInviteCode} onChange={(event) => setPendingInviteCode(event.target.value)} placeholder="DUO-7X4K-92" />
              </label>
              <button className="button button--secondary" type="submit">
                Ver convite
              </button>
            </form>
            {pendingInvitePreview ? (
              <div className="notice notice--success">
                Convite ativo para {pendingInvitePreview.workspaceName}. Ele expira em {pendingInvitePreview.expiresAt.toDate().toLocaleString('pt-BR')}.
              </div>
            ) : null}
            <button className="button button--primary" type="button" disabled={!pendingInvitePreview} onClick={handleAcceptInvite}>
              Aceitar convite
            </button>
          </article>
        </div>
      ) : (
        <>
          <div className="metric-grid">
            {shared.balances.map((balance) => (
              <article className="surface surface-pad metric-card" key={balance.userId}>
                <p className="eyebrow">{memberLabel(shared.activeMembers.find((member) => member.userId === balance.userId), user?.uid)}</p>
                <strong>{formatMoney(balance.balanceCents)}</strong>
                <span className="text-secondary">{balance.balanceCents >= 0 ? 'tem a receber' : 'tem a pagar'}</span>
              </article>
            ))}
          </div>

          <div className="shared-flow-hint">
            <span>1. Convide a outra pessoa</span>
            <span>2. Adicione uma despesa</span>
            <span>3. Combine o acerto</span>
          </div>

          <div className="finance-grid">
            <div className="form-stack">
              <article className="surface surface-pad form-stack">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Convite</p>
                    <h2>Trazer a outra pessoa</h2>
                  </div>
                  <QrCode size={22} aria-hidden="true" />
                </div>
                {activeInvite ? (
                  <p className="notice">
                    Existe um convite ativo com final {activeInvite.codeHint}. Por segurança, o código completo só aparece quando é gerado.
                  </p>
                ) : (
                  <p className="text-secondary">Gere um código, link e QR Code derivados do mesmo token lógico.</p>
                )}
                <button className="button button--primary" type="button" onClick={handleCreateInvite}>
                  Gerar convite
                </button>
                <details className="advanced-panel">
                  <summary>Opções do convite</summary>
                  <div className="button-row">
                    <button className="button button--secondary" type="button" onClick={handleRegenerateInvite}>
                      Regenerar
                    </button>
                    {activeInvite ? (
                      <button className="button button--ghost" type="button" onClick={() => handleRevokeInvite(activeInvite.id)}>
                        Revogar
                      </button>
                    ) : null}
                    <button className="button button--ghost" type="button" onClick={handleCleanupInvites}>
                      Limpar expirados
                    </button>
                  </div>
                </details>
                {generatedInvite ? (
                  <div className="shared-invite-card">
                    <strong>{generatedInvite.code}</strong>
                    <span>{generatedInvite.joinUrl}</span>
                    <img src={generatedInvite.qrDataUrl} alt="QR Code do convite Zerou" />
                  </div>
                ) : null}
              </article>

              <form className="surface surface-pad form-stack" onSubmit={handleCreateClaim}>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Despesa</p>
                    <h2>Registrar gasto compartilhado</h2>
                  </div>
                  <ShieldCheck size={22} aria-hidden="true" />
                </div>
                <label className="field">
                  <span>Descrição resumida</span>
                  <input className="input" value={claimDescription} onChange={(event) => setClaimDescription(event.target.value)} placeholder="Mercado do mês" />
                </label>
                <label className="field">
                  <span>Valor total</span>
                  <input className="input" inputMode="decimal" value={claimAmount} onChange={(event) => setClaimAmount(event.target.value)} placeholder="0,00" />
                </label>
                <button className="button button--primary" type="submit" disabled={shared.activeMembers.length < 2}>
                  Adicionar despesa
                </button>
                <p className="text-secondary">A divisão inicial é meio a meio. Nenhuma conta, cartão ou fatura pessoal entra neste registro.</p>
              </form>

              <details className="advanced-panel">
                <summary>Comentários sobre despesas</summary>
                <form className="form-stack" onSubmit={handleComment}>
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Comentários</p>
                      <h2>Conversar sobre uma despesa</h2>
                    </div>
                    <MessageSquare size={22} aria-hidden="true" />
                  </div>
                  <select className="select" value={commentTargetId} onChange={(event) => setCommentTargetId(event.target.value)}>
                    {claimOptions.length > 0 ? (
                      claimOptions.map((claim) => (
                        <option key={claim.id} value={claim.id}>
                          {claim.label}
                        </option>
                      ))
                    ) : (
                      <option value="">Nenhuma despesa ainda</option>
                    )}
                  </select>
                  <textarea className="input textarea" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Escreva um comentário curto." />
                  <button className="button button--secondary" type="submit" disabled={!commentTargetId}>
                    Comentar
                  </button>
                </form>
              </details>
            </div>

            <div className="form-stack">
              <article className="surface surface-pad">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Despesas</p>
                    <h2>Resumo compartilhado</h2>
                  </div>
                  <Handshake size={22} aria-hidden="true" />
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
                          <span className="text-muted">Visibilidade: resumo compartilhado</span>
                        </div>
                        <div className="list-row-end">
                          {claim.status === 'pending' ? (
                            <>
                              <button className="button button--subtle button--compact" type="button" onClick={() => handleClaimStatus(claim.id, 'accepted')}>
                                Aceitar
                              </button>
                              <button className="button button--ghost button--compact" type="button" onClick={() => handleClaimStatus(claim.id, 'disputed')}>
                                Contestar
                              </button>
                            </>
                          ) : null}
                          {claim.status === 'accepted' ? (
                            <button className="button button--ghost button--compact" type="button" onClick={() => handleClaimStatus(claim.id, 'settled')}>
                              Marcar acertado
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-secondary">Nenhuma despesa compartilhada ainda.</p>
                )}
              </article>

              <article className="surface surface-pad form-stack">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Acerto</p>
                    <h2>Proposta de reembolso</h2>
                  </div>
                  <Handshake size={22} aria-hidden="true" />
                </div>
                {shared.settlementSuggestion ? (
                  <p className="notice">
                    Sugestão: {memberLabel(shared.activeMembers.find((member) => member.userId === shared.settlementSuggestion?.fromUserId), user?.uid)} paga {formatMoney(shared.settlementSuggestion.amountCents)} para {memberLabel(shared.activeMembers.find((member) => member.userId === shared.settlementSuggestion?.toUserId), user?.uid)}.
                  </p>
                ) : (
                  <p className="text-secondary">Sem saldo pendente para sugerir acerto.</p>
                )}
                <button className="button button--primary" type="button" disabled={!shared.settlementSuggestion} onClick={handleCreateSettlement}>
                  Criar proposta
                </button>
                {shared.settlements.length > 0 ? (
                  <div className="item-list">
                    {shared.settlements.map((settlement) => (
                      <div className="list-row" key={settlement.id}>
                        <div>
                          <strong>{formatMoney(settlement.amountCents)}</strong>
                          <span className="text-secondary">
                            {settlementStatusLabels[settlement.status]} · pago {formatMoney(settlement.paidAmountCents)}
                          </span>
                        </div>
                        <div className="list-row-end">
                          {settlement.status === 'proposed' ? (
                            <button className="button button--subtle button--compact" type="button" onClick={() => handleAcceptSettlement(settlement.id)}>
                              Aceitar
                            </button>
                          ) : null}
                          <button className="button button--subtle button--compact" type="button" onClick={() => setSettlementPaymentId(settlement.id)}>
                            Registrar pagamento
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <form className="form-stack" onSubmit={handleSettlementPayment}>
                  <select className="select" value={settlementPaymentId} onChange={(event) => setSettlementPaymentId(event.target.value)}>
                    <option value="">Escolha um acerto</option>
                    {shared.settlements.map((settlement) => (
                      <option key={settlement.id} value={settlement.id}>
                        {formatMoney(settlement.amountCents)} · {settlementStatusLabels[settlement.status]}
                      </option>
                    ))}
                  </select>
                  <input className="input" inputMode="decimal" value={settlementPaymentAmount} onChange={(event) => setSettlementPaymentAmount(event.target.value)} placeholder="0,00" />
                  <button className="button button--secondary" type="submit" disabled={!settlementPaymentId}>
                    Registrar parcial ou total
                  </button>
                </form>
              </article>

              <details className="advanced-panel">
                <summary>Comentários recentes</summary>
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
                ) : (
                  <p className="text-secondary">Sem comentários ainda.</p>
                )}
              </details>
            </div>
          </div>

          <details className="advanced-panel shared-admin-panel">
            <summary>Gerenciar espaço</summary>
            <div className="quick-actions">
            {canLeaveOrRemove ? (
              <button className="button button--ghost" type="button" onClick={handleLeaveOrRemove}>
                {shared.workspace?.ownerUserId === user?.uid && partnerMember ? 'Remover parceiro' : 'Sair do espaço'}
              </button>
            ) : null}
            <span className="text-secondary">
              Dono: {memberLabel(ownerMember, user?.uid)} · Parceiro: {partnerMember ? memberLabel(partnerMember, user?.uid) : 'aguardando convite'}
            </span>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
