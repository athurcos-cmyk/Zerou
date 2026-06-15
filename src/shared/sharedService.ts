import QRCode from 'qrcode';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { addHours } from 'date-fns';
import { getBillingEntitlementsForUser } from '../billing/billingService';
import { getFirebaseDb } from '../firebase/config';
import { getPersonalWorkspaceId } from '../workspaces/workspaceService';
import {
  addSharedCommentSchema,
  createSettlementSchema,
  createSharedExpenseClaimSchema,
  recordSettlementPaymentSchema,
  updateClaimStatusSchema,
  type AddSharedCommentInput,
  type CreateSettlementInput,
  type CreateSharedExpenseClaimInput,
  type RecordSettlementPaymentInput,
  type UpdateClaimStatusInput
} from './sharedSchemas';
import {
  buildJoinUrl,
  generateInviteCode,
  hashInviteCode,
  inviteCodeHint,
  inviteIdFromCode,
  inviteIdFromHash,
  normalizeInviteCode
} from './inviteCode';
import type {
  AuditLog,
  CoupleInvite,
  Settlement,
  SharedComment,
  SharedExpenseClaim,
  SyncStatus,
  Workspace,
  WorkspaceMembership,
  WorkspaceRef
} from '../types/contracts';

export type LocalSharedSynced<T> = T & {
  localSyncStatus: SyncStatus;
};

function createId(prefix: string) {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return `${prefix}_${randomId.replace(/-/g, '')}`;
}

function withLocalSync<T extends object>(snapshot: QueryDocumentSnapshot<DocumentData>) {
  const data = { id: snapshot.id, ...snapshot.data() } as unknown as T;
  const localSyncStatus: SyncStatus = snapshot.metadata.hasPendingWrites ? 'pending' : 'synced';
  return { ...data, localSyncStatus } as LocalSharedSynced<T>;
}

function workspaceRef(workspaceId: string) {
  return doc(getFirebaseDb(), 'workspaces', workspaceId);
}

function memberRef(workspaceId: string, uid: string) {
  return doc(getFirebaseDb(), 'workspaces', workspaceId, 'members', uid);
}

function userWorkspaceRef(uid: string, workspaceId: string) {
  return doc(getFirebaseDb(), 'users', uid, 'workspaceRefs', workspaceId);
}

function userWorkspaceRefs(uid: string) {
  return collection(getFirebaseDb(), 'users', uid, 'workspaceRefs');
}

function inviteRef(inviteId: string) {
  return doc(getFirebaseDb(), 'coupleInvites', inviteId);
}

function invitesRef() {
  return collection(getFirebaseDb(), 'coupleInvites');
}

function claimsRef(workspaceId: string) {
  return collection(getFirebaseDb(), 'workspaces', workspaceId, 'sharedExpenseClaims');
}

function claimRef(workspaceId: string, claimId: string) {
  return doc(getFirebaseDb(), 'workspaces', workspaceId, 'sharedExpenseClaims', claimId);
}

function settlementsRef(workspaceId: string) {
  return collection(getFirebaseDb(), 'workspaces', workspaceId, 'settlements');
}

function settlementRef(workspaceId: string, settlementId: string) {
  return doc(getFirebaseDb(), 'workspaces', workspaceId, 'settlements', settlementId);
}

function commentsRef(workspaceId: string) {
  return collection(getFirebaseDb(), 'workspaces', workspaceId, 'comments');
}

function auditLogRef(workspaceId: string, auditId: string) {
  return doc(getFirebaseDb(), 'workspaces', workspaceId, 'auditLogs', auditId);
}

function membersRef(workspaceId: string) {
  return collection(getFirebaseDb(), 'workspaces', workspaceId, 'members');
}

function splitEqually(totalAmountCents: number, userIds: string[]) {
  const base = Math.floor(totalAmountCents / userIds.length);
  const remainder = totalAmountCents % userIds.length;

  return userIds.map((userId, index) => ({
    userId,
    amountCents: base + (index < remainder ? 1 : 0)
  }));
}

function auditEntry(workspaceId: string, actorUserId: string, type: string, targetType: AuditLog['targetType'], targetId: string, summary: string) {
  const id = createId('audit');

  return {
    reference: auditLogRef(workspaceId, id),
    payload: {
      id,
      workspaceId,
      actorUserId,
      type,
      targetType,
      targetId,
      summary,
      createdAt: serverTimestamp()
    }
  };
}

async function getActiveCoupleRefForUser(userId: string) {
  const snapshot = await getDocs(userWorkspaceRefs(userId));

  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }) as unknown as WorkspaceRef)
    .find((item) => item.type === 'couple' && item.status === 'active');
}

export async function canCreateCoupleWorkspace(userId: string) {
  const existingCouple = await getActiveCoupleRefForUser(userId);

  if (existingCouple) {
    return { allowed: false, reason: 'Você já possui um espaço compartilhado ativo.' };
  }

  const entitlements = await getBillingEntitlementsForUser(userId);

  if (!entitlements.canCreateCoupleWorkspace) {
    return { allowed: false, reason: 'Não foi possível liberar o espaço compartilhado gratuito para esta conta agora.' };
  }

  return { allowed: true };
}

export async function createCoupleWorkspace(userId: string, ownerName: string) {
  const entitlement = await canCreateCoupleWorkspace(userId);

  if (!entitlement.allowed) {
    throw new Error(entitlement.reason);
  }

  const workspaceId = createId(`couple_${userId}`);
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const workspaceName = `Espaço compartilhado de ${ownerName || 'Zerou'}`;

  batch.set(workspaceRef(workspaceId), {
    id: workspaceId,
    type: 'couple',
    name: workspaceName,
    ownerUserId: userId,
    partnerUserId: '',
    activeMemberCount: 1,
    status: 'active',
    currency: 'BRL',
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    createdAt: now,
    updatedAt: now
  });
  batch.set(memberRef(workspaceId, userId), {
    userId,
    workspaceId,
    role: 'owner',
    status: 'active',
    joinedAt: now,
    createdAt: now,
    updatedAt: now
  });
  batch.set(userWorkspaceRef(userId, workspaceId), {
    workspaceId,
    type: 'couple',
    role: 'owner',
    status: 'active',
    createdAt: now,
    updatedAt: now
  });
  const audit = auditEntry(workspaceId, userId, 'couple_workspace_created', 'workspace', workspaceId, 'Espaço compartilhado criado.');
  batch.set(audit.reference, audit.payload);

  await batch.commit();
  return workspaceId;
}

export async function createCoupleInvite(workspaceId: string, userId: string, workspaceName: string) {
  const code = generateInviteCode();
  const codeHash = await hashInviteCode(code);
  const id = inviteIdFromHash(codeHash);
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const activeInvites = await getDocs(query(invitesRef(), where('workspaceId', '==', workspaceId), where('status', '==', 'active')));

  activeInvites.docs.forEach((snapshot) => {
    batch.update(snapshot.ref, {
      status: 'revoked',
      revokedAt: now,
      updatedAt: now
    });
  });

  batch.set(inviteRef(id), {
    id,
    workspaceId,
    workspaceName,
    codeHash,
    codeHint: inviteCodeHint(code),
    createdBy: userId,
    expiresAt: Timestamp.fromDate(addHours(new Date(), 48)),
    status: 'active',
    createdAt: now,
    updatedAt: now,
    version: 1
  });
  const audit = auditEntry(workspaceId, userId, 'couple_invite_created', 'invite', id, 'Convite criado sem registrar o código puro.');
  batch.set(audit.reference, audit.payload);

  await batch.commit();

  const joinUrl = buildJoinUrl(code);
  const qrDataUrl = await QRCode.toDataURL(joinUrl, { margin: 1, width: 240 });

  return { id, code: normalizeInviteCode(code), joinUrl, qrDataUrl };
}

export async function previewCoupleInvite(code: string) {
  const id = await inviteIdFromCode(code);
  const snapshot = await getDoc(inviteRef(id));

  if (!snapshot.exists()) {
    throw new Error('Convite não encontrado.');
  }

  const invite = { id: snapshot.id, ...snapshot.data() } as CoupleInvite;

  if (invite.status !== 'active') {
    throw new Error('Este convite não está mais ativo.');
  }

  if (invite.expiresAt.toDate() <= new Date()) {
    throw new Error('Este convite expirou. Peça um novo código.');
  }

  return invite;
}

export async function acceptCoupleInvite(code: string, userId: string, confirmed: boolean) {
  if (!confirmed) {
    throw new Error('Confirme que deseja entrar neste espaço compartilhado.');
  }

  const normalized = normalizeInviteCode(code);
  const invite = await previewCoupleInvite(normalized);

  if (invite.createdBy === userId) {
    throw new Error('Use este convite com a conta da outra pessoa.');
  }

  const workspaceId = invite.workspaceId;
  const now = serverTimestamp();
  const db = getFirebaseDb();
  const batch = writeBatch(db);

  batch.update(workspaceRef(workspaceId), {
    partnerUserId: userId,
    activeMemberCount: 2,
    updatedAt: now
  });
  batch.update(inviteRef(invite.id), {
    status: 'accepted',
    usedBy: userId,
    usedAt: now,
    updatedAt: now
  });
  batch.set(memberRef(workspaceId, userId), {
    userId,
    workspaceId,
    role: 'partner',
    status: 'active',
    acceptedInviteId: invite.id,
    joinedAt: now,
    createdAt: now,
    updatedAt: now
  });
  batch.set(userWorkspaceRef(userId, workspaceId), {
    workspaceId,
    type: 'couple',
    role: 'partner',
    status: 'active',
    createdAt: now,
    updatedAt: now
  });
  const audit = auditEntry(workspaceId, userId, 'couple_invite_accepted', 'invite', invite.id, 'Convite aceito sem registrar o código puro.');
  batch.set(audit.reference, audit.payload);

  await batch.commit();
  return workspaceId;
}

export async function revokeCoupleInvite(workspaceId: string, inviteId: string, userId: string) {
  const now = serverTimestamp();
  const db = getFirebaseDb();
  const batch = writeBatch(db);

  batch.update(inviteRef(inviteId), {
    status: 'revoked',
    revokedAt: now,
    updatedAt: now
  });
  const audit = auditEntry(workspaceId, userId, 'couple_invite_revoked', 'invite', inviteId, 'Convite revogado.');
  batch.set(audit.reference, audit.payload);

  await batch.commit();
}

export async function regenerateCoupleInvite(workspaceId: string, userId: string, workspaceName: string) {
  return createCoupleInvite(workspaceId, userId, workspaceName);
}

export async function cleanupExpiredInvites(workspaceId: string, userId: string) {
  const now = new Date();
  const expiredInvites = await getDocs(query(invitesRef(), where('workspaceId', '==', workspaceId), where('status', '==', 'active')));
  const batch = writeBatch(getFirebaseDb());
  let changed = 0;

  expiredInvites.docs.forEach((snapshot) => {
    const invite = snapshot.data() as CoupleInvite;

    if (invite.expiresAt.toDate() <= now) {
      changed += 1;
      batch.update(snapshot.ref, {
        status: 'expired',
        updatedAt: serverTimestamp()
      });
    }
  });

  if (changed > 0) {
    const audit = auditEntry(workspaceId, userId, 'couple_invites_cleaned', 'invite', workspaceId, 'Convites expirados marcados como expirados.');
    batch.set(audit.reference, audit.payload);
    await batch.commit();
  }

  return changed;
}

export async function leaveCoupleWorkspace(workspaceId: string, userId: string, confirmed: boolean) {
  if (!confirmed) {
    throw new Error('Confirme que deseja sair do espaço compartilhado.');
  }

  const now = serverTimestamp();
  const db = getFirebaseDb();
  const batch = writeBatch(db);

  batch.update(memberRef(workspaceId, userId), {
    status: 'removed',
    removedAt: now,
    updatedAt: now
  });
  batch.update(userWorkspaceRef(userId, workspaceId), {
    status: 'removed',
    updatedAt: now
  });
  batch.update(workspaceRef(workspaceId), {
    partnerUserId: '',
    activeMemberCount: 1,
    updatedAt: now
  });
  const audit = auditEntry(workspaceId, userId, 'member_left_workspace', 'member', userId, 'Membro saiu do espaço compartilhado.');
  batch.set(audit.reference, audit.payload);

  await batch.commit();
}

export async function removePartner(workspaceId: string, ownerUserId: string, partnerUserId: string, confirmed: boolean) {
  if (!confirmed) {
    throw new Error('Confirme que deseja remover o parceiro.');
  }

  const now = serverTimestamp();
  const db = getFirebaseDb();
  const batch = writeBatch(db);

  batch.update(memberRef(workspaceId, partnerUserId), {
    status: 'removed',
    removedAt: now,
    updatedAt: now
  });
  batch.update(userWorkspaceRef(partnerUserId, workspaceId), {
    status: 'removed',
    updatedAt: now
  });
  batch.update(workspaceRef(workspaceId), {
    partnerUserId: '',
    activeMemberCount: 1,
    updatedAt: now
  });
  const audit = auditEntry(workspaceId, ownerUserId, 'partner_removed', 'member', partnerUserId, 'Parceiro removido do espaço compartilhado.');
  batch.set(audit.reference, audit.payload);

  await batch.commit();
}

export async function createSharedExpenseClaim(workspaceId: string, userId: string, input: CreateSharedExpenseClaimInput) {
  const parsed = createSharedExpenseClaimSchema.parse(input);
  const id = createId('claim');
  const now = serverTimestamp();
  const batch = writeBatch(getFirebaseDb());

  batch.set(doc(claimsRef(workspaceId), id), {
    id,
    workspaceId,
    payerUserId: userId,
    description: parsed.description,
    totalAmountCents: parsed.totalAmountCents,
    split: splitEqually(parsed.totalAmountCents, parsed.participantUserIds),
    sourceVisibility: 'summary_only',
    status: 'pending',
    createdBy: userId,
    clientMutationId: id,
    version: 1,
    createdAt: now,
    updatedAt: now
  });
  const audit = auditEntry(workspaceId, userId, 'shared_claim_created', 'claim', id, 'Claim resumido criado.');
  batch.set(audit.reference, audit.payload);

  await batch.commit();
  return id;
}

export async function updateSharedExpenseClaimStatus(workspaceId: string, userId: string, input: UpdateClaimStatusInput) {
  const parsed = updateClaimStatusSchema.parse(input);
  const snapshot = await getDoc(claimRef(workspaceId, parsed.claimId));

  if (!snapshot.exists()) {
    throw new Error('Claim não encontrado.');
  }

  const claim = snapshot.data() as SharedExpenseClaim;
  const now = serverTimestamp();
  const batch = writeBatch(getFirebaseDb());

  batch.update(claimRef(workspaceId, parsed.claimId), {
    status: parsed.status,
    updatedAt: now,
    version: claim.version + 1
  });
  const audit = auditEntry(workspaceId, userId, `shared_claim_${parsed.status}`, 'claim', parsed.claimId, `Claim marcado como ${parsed.status}.`);
  batch.set(audit.reference, audit.payload);

  await batch.commit();
}

export async function createSettlementProposal(workspaceId: string, userId: string, input: CreateSettlementInput) {
  const parsed = createSettlementSchema.parse(input);
  const id = createId('settlement');
  const now = serverTimestamp();
  const batch = writeBatch(getFirebaseDb());

  batch.set(settlementRef(workspaceId, id), {
    id,
    workspaceId,
    fromUserId: parsed.fromUserId,
    toUserId: parsed.toUserId,
    amountCents: parsed.amountCents,
    status: 'proposed',
    paidAmountCents: 0,
    createdBy: userId,
    clientMutationId: id,
    version: 1,
    createdAt: now,
    updatedAt: now
  });
  const audit = auditEntry(workspaceId, userId, 'settlement_proposed', 'settlement', id, 'Proposta de acerto criada.');
  batch.set(audit.reference, audit.payload);

  await batch.commit();
  return id;
}

export async function acceptSettlement(workspaceId: string, userId: string, settlementId: string) {
  const snapshot = await getDoc(settlementRef(workspaceId, settlementId));

  if (!snapshot.exists()) {
    throw new Error('Acerto não encontrado.');
  }

  const settlement = snapshot.data() as Settlement;
  const now = serverTimestamp();
  const batch = writeBatch(getFirebaseDb());

  batch.update(settlementRef(workspaceId, settlementId), {
    status: 'accepted',
    updatedAt: now,
    version: settlement.version + 1
  });
  const audit = auditEntry(workspaceId, userId, 'settlement_accepted', 'settlement', settlementId, 'Acerto aceito.');
  batch.set(audit.reference, audit.payload);

  await batch.commit();
}

export async function recordSettlementPayment(workspaceId: string, userId: string, input: RecordSettlementPaymentInput) {
  const parsed = recordSettlementPaymentSchema.parse(input);
  const snapshot = await getDoc(settlementRef(workspaceId, parsed.settlementId));

  if (!snapshot.exists()) {
    throw new Error('Acerto não encontrado.');
  }

  const settlement = snapshot.data() as Settlement;
  const nextPaidAmount = Math.min(settlement.amountCents, settlement.paidAmountCents + parsed.amountCents);
  const nextStatus: Settlement['status'] = nextPaidAmount >= settlement.amountCents ? 'settled' : 'partially_paid';
  const now = serverTimestamp();
  const batch = writeBatch(getFirebaseDb());

  batch.update(settlementRef(workspaceId, parsed.settlementId), {
    status: nextStatus,
    paidAmountCents: nextPaidAmount,
    updatedAt: now,
    version: settlement.version + 1
  });
  const audit = auditEntry(workspaceId, userId, 'settlement_payment_recorded', 'settlement', parsed.settlementId, 'Pagamento de acerto registrado.');
  batch.set(audit.reference, audit.payload);

  await batch.commit();
}

export async function addSharedComment(workspaceId: string, userId: string, input: AddSharedCommentInput) {
  const parsed = addSharedCommentSchema.parse(input);
  const id = createId('comment');

  await setDoc(doc(commentsRef(workspaceId), id), {
    id,
    workspaceId,
    targetType: parsed.targetType,
    targetId: parsed.targetId,
    body: parsed.body,
    createdBy: userId,
    createdAt: serverTimestamp()
  });

  return id;
}

export function subscribeWorkspaceRefs(
  userId: string,
  onNext: (items: Array<LocalSharedSynced<WorkspaceRef>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(userWorkspaceRefs(userId), orderBy('createdAt', 'asc')),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<WorkspaceRef>(item))),
    onError
  );
}

export function subscribeWorkspace(
  workspaceId: string,
  onNext: (item: LocalSharedSynced<Workspace> | null) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    workspaceRef(workspaceId),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.exists() ? withLocalSync<Workspace>(snapshot as QueryDocumentSnapshot<DocumentData>) : null),
    onError
  );
}

export function subscribeMembers(
  workspaceId: string,
  onNext: (items: Array<LocalSharedSynced<WorkspaceMembership>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(membersRef(workspaceId), orderBy('createdAt', 'asc')),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<WorkspaceMembership>(item))),
    onError
  );
}

export function subscribeActiveInvites(
  workspaceId: string,
  onNext: (items: Array<LocalSharedSynced<CoupleInvite>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(invitesRef(), where('workspaceId', '==', workspaceId), where('status', '==', 'active')),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<CoupleInvite>(item))),
    onError
  );
}

export function subscribeSharedClaims(
  workspaceId: string,
  onNext: (items: Array<LocalSharedSynced<SharedExpenseClaim>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(claimsRef(workspaceId), orderBy('createdAt', 'desc')),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<SharedExpenseClaim>(item))),
    onError
  );
}

export function subscribeSettlements(
  workspaceId: string,
  onNext: (items: Array<LocalSharedSynced<Settlement>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(settlementsRef(workspaceId), orderBy('createdAt', 'desc')),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<Settlement>(item))),
    onError
  );
}

export function subscribeSharedComments(
  workspaceId: string,
  onNext: (items: Array<LocalSharedSynced<SharedComment>>) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(commentsRef(workspaceId), orderBy('createdAt', 'desc')),
    { includeMetadataChanges: true },
    (snapshot) => onNext(snapshot.docs.map((item) => withLocalSync<SharedComment>(item))),
    onError
  );
}

export async function readPendingInvitePreview(code: string | null) {
  if (!code) {
    return null;
  }

  return previewCoupleInvite(code);
}

export function personalWorkspaceIdForPrivacyCheck(uid: string) {
  return getPersonalWorkspaceId(uid);
}
