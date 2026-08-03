import QRCode from 'qrcode';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { addHours } from 'date-fns';
import { getBillingEntitlementsForUser } from '../billing/billingService';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseDb, getFirebaseFunctions } from '../firebase/config';
import { fireWrite } from '../firebase/fireWrite';
import { readSnapshotDoc } from '../firebase/snapshotData';
import { getPersonalWorkspaceId } from '../workspaces/workspaceService';
import { applyAccountEffectsToBatch } from '../finance/accountBatchEffects';
import { invertAccountEffects, transactionAccountEffects } from '../finance/financeCalculations';
import { monthKeyFromDate } from '../finance/financeDates';
import {
  createSettlementSchema,
  createSharedExpenseClaimSchema,
  recordSettlementPaymentSchema,
  registerSettlementPaymentSchema,
  updateClaimStatusSchema,
  type CreateSettlementInput,
  type CreateSharedExpenseClaimInput,
  type RecordSettlementPaymentInput,
  type RegisterSettlementPaymentInput,
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
  CoupleMode,
  CoupleInvite,
  Settlement,
  SharedExpenseClaim,
  SyncStatus,
  Transaction,
  Workspace,
  WorkspaceMembership,
  WorkspaceRef
} from '../types/contracts';

/**
 * Onde o registro do casal encosta nas finanças PESSOAIS de quem registrou.
 *
 * `personalWorkspaceId` é sempre o workspace de quem está mexendo (nunca o do parceiro — o
 * parceiro não é membro dele e as regras recusariam). `accountId` ausente = "só anotar":
 * grava o lado compartilhado e não cria transação nem move saldo nenhum.
 */
export interface PersonalEntryOptions {
  personalWorkspaceId?: string;
  accountId?: string;
  categoryId?: string;
}

export type LocalSharedSynced<T> = T & {
  localSyncStatus: SyncStatus;
};

function createId(prefix: string) {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return `${prefix}_${randomId.replace(/-/g, '')}`;
}

function withLocalSync<T extends object>(snapshot: QueryDocumentSnapshot<DocumentData>) {
  const data = readSnapshotDoc<T>(snapshot);
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

function auditLogRef(workspaceId: string, auditId: string) {
  return doc(getFirebaseDb(), 'workspaces', workspaceId, 'auditLogs', auditId);
}

function membersRef(workspaceId: string) {
  return collection(getFirebaseDb(), 'workspaces', workspaceId, 'members');
}

function personalTransactionRef(personalWorkspaceId: string, transactionId: string) {
  return doc(getFirebaseDb(), 'workspaces', personalWorkspaceId, 'transactions', transactionId);
}

/**
 * Id da transação pessoal de um registro do casal — **derivado**, nunca guardado.
 *
 * O doc do casal não pode conter nenhum ponteiro pra dado pessoal (há teste de regra provando
 * que um `sourcePersonalTransactionId` no claim é recusado, e `hasOnly` mantém isso de pé). Como
 * o id é uma função pura do id compartilhado, excluir o claim consegue achar a transação
 * correspondente sem que o espaço a dois jamais tenha sabido que ela existe. De brinde, sai
 * idempotente: repetir a criação sobrescreve o mesmo doc em vez de duplicar lançamento.
 */
export function personalTransactionIdForShared(sharedId: string) {
  return `txn_shr_${sharedId.replace(/^([a-z]+_)+/, '')}`;
}

function splitEqually(totalAmountCents: number, userIds: string[]) {
  const base = Math.floor(totalAmountCents / userIds.length);
  const remainder = totalAmountCents % userIds.length;

  return userIds.map((userId, index) => ({
    userId,
    amountCents: base + (index < remainder ? 1 : 0)
  }));
}

/** Use an explicit split when its parts sum to the total; otherwise fall back to an equal split. */
function resolveSplit(
  totalAmountCents: number,
  userIds: string[],
  split?: Array<{ userId: string; amountCents: number }>
) {
  if (!split || split.length !== userIds.length) {
    return splitEqually(totalAmountCents, userIds);
  }

  const sum = split.reduce((total, part) => total + part.amountCents, 0);
  const sameMembers = split.every((part) => userIds.includes(part.userId));

  if (sum !== totalAmountCents || !sameMembers) {
    return splitEqually(totalAmountCents, userIds);
  }

  return split.map((part) => ({ userId: part.userId, amountCents: part.amountCents }));
}

/**
 * Acrescenta ao batch a transação pessoal de um registro do casal — ou nada, quando a pessoa
 * escolheu "só anotar".
 *
 * O saldo da conta é movido pelo mesmo `applyAccountEffectsToBatch`/`transactionAccountEffects`
 * que todo lançamento do app usa: o sinal por tipo mora num lugar só, então "acerto pago" nunca
 * pode divergir de uma despesa comum.
 */
function addPersonalEntryToBatch(
  batch: ReturnType<typeof writeBatch>,
  args: {
    sharedId: string;
    userId: string;
    personal: PersonalEntryOptions;
    type: 'expense' | 'reimbursement';
    amountCents: number;
    description: string;
    occurredOn: Date;
    tags?: string[];
  }
) {
  const { personalWorkspaceId, accountId, categoryId } = args.personal;

  if (!personalWorkspaceId || !accountId) {
    return;
  }

  const transactionId = personalTransactionIdForShared(args.sharedId);
  const monthKey = monthKeyFromDate(args.occurredOn);

  batch.set(personalTransactionRef(personalWorkspaceId, transactionId), {
    id: transactionId,
    workspaceId: personalWorkspaceId,
    createdBy: args.userId,
    updatedBy: args.userId,
    type: args.type,
    amountCents: args.amountCents,
    description: args.description,
    accountId,
    ...(categoryId ? { categoryId } : {}),
    date: Timestamp.fromDate(args.occurredOn),
    competenceMonth: monthKey,
    cashMonth: monthKey,
    tags: args.tags ?? ['casal'],
    isRecurring: false,
    clientMutationId: transactionId,
    syncStatus: 'synced' as const,
    version: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  applyAccountEffectsToBatch(
    batch,
    personalWorkspaceId,
    transactionAccountEffects({ type: args.type, amountCents: args.amountCents, accountId })
  );
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

export async function createCoupleWorkspace(userId: string, ownerName: string, mode: CoupleMode = 'savings_only') {
  const entitlement = await canCreateCoupleWorkspace(userId);

  if (!entitlement.allowed) {
    throw new Error(entitlement.reason);
  }

  const workspaceId = createId(`couple_${userId}`);
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const workspaceName = `Espaço compartilhado de ${ownerName || 'Granativa'}`;

  batch.set(workspaceRef(workspaceId), {
    id: workspaceId,
    type: 'couple',
    name: workspaceName,
    ownerUserId: userId,
    partnerUserId: '',
    activeMemberCount: 1,
    coupleMode: mode,
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
    displayName: ownerName || '',
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

export async function updateCoupleMode(workspaceId: string, userId: string, mode: CoupleMode) {
  await updateDoc(workspaceRef(workspaceId), { coupleMode: mode, updatedAt: serverTimestamp() });
  const audit = auditEntry(workspaceId, userId, 'couple_mode_changed', 'workspace', workspaceId, `Modo alterado para ${mode}.`);
  setDoc(audit.reference, audit.payload).catch(() => undefined);
}

export async function createCoupleInvite(workspaceId: string, userId: string, workspaceName: string) {
  const code = generateInviteCode();
  const codeHash = await hashInviteCode(code);
  const id = inviteIdFromHash(codeHash);
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  const now = serverTimestamp();
  // Delete ALL previous invites for this workspace — accepted ones are safe to delete
  // because the member record was already created when the invite was accepted.
  const oldInvites = await getDocs(query(invitesRef(), where('workspaceId', '==', workspaceId)));
  oldInvites.docs.forEach((snapshot) => {
    batch.delete(snapshot.ref);
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

export async function acceptCoupleInvite(code: string, userId: string, displayName: string, confirmed: boolean) {
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
    displayName: displayName || '',
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
  // Member record is created — the invite has no further use. Delete it now.
  deleteDoc(inviteRef(invite.id)).catch(() => undefined);
  return workspaceId;
}

export async function revokeCoupleInvite(workspaceId: string, inviteId: string, userId: string) {
  const db = getFirebaseDb();
  const batch = writeBatch(db);

  batch.delete(inviteRef(inviteId));
  const audit = auditEntry(workspaceId, userId, 'couple_invite_revoked', 'invite', inviteId, 'Convite revogado.');
  batch.set(audit.reference, audit.payload);

  await batch.commit();
}

export async function regenerateCoupleInvite(workspaceId: string, userId: string, workspaceName: string) {
  return createCoupleInvite(workspaceId, userId, workspaceName);
}

export async function cleanupExpiredInvites(workspaceId: string, userId: string) {
  const now = new Date();
  const allInvites = await getDocs(query(invitesRef(), where('workspaceId', '==', workspaceId)));
  const batch = writeBatch(getFirebaseDb());
  let changed = 0;

  allInvites.docs.forEach((snapshot) => {
    const invite = snapshot.data() as CoupleInvite;
    if (invite.status !== 'active' || invite.expiresAt.toDate() <= now) {
      changed += 1;
      batch.delete(snapshot.ref);
    }
  });

  if (changed > 0) {
    const audit = auditEntry(workspaceId, userId, 'couple_invites_cleaned', 'invite', workspaceId, 'Convites antigos removidos.');
    batch.set(audit.reference, audit.payload);
    await batch.commit();
  }

  return changed;
}

export async function cancelCoupleWorkspace(workspaceId: string, userId: string, confirmed: boolean) {
  if (!confirmed) {
    throw new Error('Confirme que deseja cancelar o espaço compartilhado.');
  }
  // Validação rápida no client (feedback instantâneo). A Cloud Function repete esta
  // validação com Admin SDK e usa recursiveDelete — sem deixar subcoleções órfãs.
  const wsSnap = await getDoc(workspaceRef(workspaceId));
  if (wsSnap.exists() && (wsSnap.data().activeMemberCount ?? 1) > 1) {
    throw new Error('Não é possível cancelar um espaço com parceiro ativo. Remova o parceiro primeiro.');
  }

  const fn = httpsCallable<{ workspaceId: string; confirmed: boolean }, { success: boolean }>(
    getFirebaseFunctions(),
    'cancelCoupleWorkspace'
  );
  const result = await fn({ workspaceId, confirmed });

  if (!result.data.success) {
    throw new Error('Não foi possível cancelar o espaço compartilhado.');
  }
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

/**
 * Registra uma despesa dividida — e, no MESMO batch atômico, o lançamento dela nas finanças
 * pessoais de quem pagou.
 *
 * O valor lançado na conta pessoal é o **total**, não a metade: foi o total que saiu do banco.
 * Lançar só a própria parte deixaria o saldo da conta permanentemente acima do saldo real — a
 * mesma divergência que a tela "Acertar saldo com o banco" existe pra consertar. A parte da
 * outra pessoa não desaparece: vira dívida dela no saldo do casal
 * (`calculateSharedBalances`), e quita quando ela paga.
 *
 * Cross-workspace num batch só é o mesmo padrão de `coupleGoalDeposit` (`financeService.ts`):
 * batch do Firestore é atômico em todo o banco, então nunca existe metade do registro.
 *
 * Devolve a promise do commit em vez de engolir com `fireWrite`: aqui erro do servidor é
 * divergência entre duas pessoas, e o chamador precisa poder avisar
 * (ver a trava de conexão em `coupleWriteGate.ts`).
 *
 * `async` de propósito, apesar de não haver `await`: o `schema.parse` abaixo lança, e num handler
 * de evento uma exceção SÍNCRONA não é pega pelo `.catch` do chamador — viraria erro solto em vez
 * de mensagem na tela. Assim falha de validação e falha do servidor caem no mesmo `.catch`. A UI
 * ainda valida antes de chamar (guardas síncronos), isto é a rede de segurança.
 */
export async function createSharedExpenseClaim(
  workspaceId: string,
  userId: string,
  input: CreateSharedExpenseClaimInput,
  personal: PersonalEntryOptions = {}
) {
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
    split: resolveSplit(parsed.totalAmountCents, parsed.participantUserIds, parsed.split),
    occurredOn: Timestamp.fromDate(parsed.occurredOn),
    sourceVisibility: 'summary_only',
    status: 'pending',
    createdBy: userId,
    clientMutationId: id,
    version: 1,
    createdAt: now,
    updatedAt: now
  });
  addPersonalEntryToBatch(batch, {
    sharedId: id,
    userId,
    personal,
    type: 'expense',
    amountCents: parsed.totalAmountCents,
    description: parsed.description,
    occurredOn: parsed.occurredOn
  });
  const audit = auditEntry(workspaceId, userId, 'shared_claim_created', 'claim', id, 'Claim resumido criado.');
  batch.set(audit.reference, audit.payload);

  return batch.commit().then(() => id);
}

/**
 * Exclui a despesa dividida e desfaz junto o lançamento pessoal dela (soft delete + saldo de
 * volta), num batch atômico.
 *
 * A leitura extra (`getDoc` da transação derivada) é o preço de não guardar ponteiro pessoal no
 * doc do casal — e só acontece no caminho de exclusão. Se a pessoa registrou com "só anotar", o
 * doc não existe e o batch fica só com o lado compartilhado.
 *
 * Só quem registrou chega aqui (a regra do Firestore recusa os outros): é a única pessoa que
 * consegue tocar nas duas pontas, porque a transação pessoal vive no workspace dela.
 */
export async function deleteSharedExpenseClaim(
  workspaceId: string,
  claimId: string,
  userId: string,
  personal: Pick<PersonalEntryOptions, 'personalWorkspaceId'> = {}
) {
  const batch = writeBatch(getFirebaseDb());
  const now = serverTimestamp();

  if (personal.personalWorkspaceId) {
    const transactionId = personalTransactionIdForShared(claimId);
    const reference = personalTransactionRef(personal.personalWorkspaceId, transactionId);
    const snapshot = await getDoc(reference);
    const transaction = snapshot.exists() ? (snapshot.data() as Transaction) : null;

    if (transaction && !transaction.deletedAt) {
      batch.update(reference, {
        updatedBy: userId,
        deletedAt: now,
        updatedAt: now,
        version: (transaction.version ?? 1) + 1
      });
      applyAccountEffectsToBatch(
        batch,
        personal.personalWorkspaceId,
        invertAccountEffects(transactionAccountEffects(transaction))
      );
    }
  }

  batch.delete(claimRef(workspaceId, claimId));
  const audit = auditEntry(workspaceId, userId, 'shared_claim_deleted', 'claim', claimId, 'Despesa dividida excluída.');
  batch.set(audit.reference, audit.payload);

  return batch.commit();
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

  // Devolve a promise (em vez de `fireWrite`) pelo mesmo motivo de `createSharedExpenseClaim`:
  // no espaço a dois, escrita recusada em silêncio é divergência entre duas pessoas.
  return batch.commit();
}

/**
 * "Já paguei minha parte" — registra um pagamento de acerto que JÁ aconteceu, junto com a
 * despesa real na conta de quem pagou.
 *
 * Segue a regra de voz do app (`docs/design/DESIGN.md`): o Granativa não transfere dinheiro, a
 * pessoa confirma um fato passado. E cada um lança só o SEU lado — a transação da outra pessoa
 * é impossível de criar aqui (ela não é membro do workspace pessoal de ninguém além dela, e as
 * regras recusariam), por isso quem recebe confirma depois, em `confirmSettlementReceipt`.
 */
// `async` pelo mesmo motivo de `createSharedExpenseClaim`: erro do `schema.parse` tem que chegar
// no `.catch` do chamador, não estourar síncrono dentro do handler de submit.
export async function registerSettlementPayment(
  workspaceId: string,
  userId: string,
  input: RegisterSettlementPaymentInput,
  personal: PersonalEntryOptions = {},
  opts: { partnerLabel?: string; occurredOn?: Date } = {}
) {
  const parsed = registerSettlementPaymentSchema.parse(input);
  const id = createId('settlement');
  const now = serverTimestamp();
  const occurredOn = opts.occurredOn ?? new Date();
  const settled = parsed.amountCents >= parsed.totalOwedCents;
  const batch = writeBatch(getFirebaseDb());

  batch.set(settlementRef(workspaceId, id), {
    id,
    workspaceId,
    fromUserId: userId,
    toUserId: parsed.toUserId,
    amountCents: parsed.totalOwedCents,
    status: settled ? 'settled' : 'partially_paid',
    paidAmountCents: parsed.amountCents,
    createdBy: userId,
    clientMutationId: id,
    version: 1,
    createdAt: now,
    updatedAt: now
  });
  addPersonalEntryToBatch(batch, {
    sharedId: id,
    userId,
    personal,
    type: 'expense',
    amountCents: parsed.amountCents,
    description: opts.partnerLabel ? `Acerto do casal: ${opts.partnerLabel}` : 'Acerto do casal',
    occurredOn,
    tags: ['casal', 'acerto']
  });
  const audit = auditEntry(workspaceId, userId, 'settlement_payment_registered', 'settlement', id, 'Pagamento de acerto registrado.');
  batch.set(audit.reference, audit.payload);

  return batch.commit().then(() => id);
}

/**
 * "Recebi" — quem recebe confirma o pagamento que o outro registrou e lança a entrada na
 * própria conta.
 *
 * `receiptConfirmedAt` só pode ser gravado UMA vez (a regra recusa sobrescrever) — é o que
 * impede a mesma entrada de cair duas vezes na conta de quem recebeu.
 */
export async function confirmSettlementReceipt(
  workspaceId: string,
  userId: string,
  settlement: Pick<Settlement, 'id' | 'paidAmountCents' | 'status' | 'version'>,
  personal: PersonalEntryOptions = {},
  opts: { partnerLabel?: string } = {}
) {
  const now = serverTimestamp();
  const occurredOn = new Date();
  const batch = writeBatch(getFirebaseDb());

  batch.update(settlementRef(workspaceId, settlement.id), {
    status: settlement.status,
    receiptConfirmedAt: now,
    version: settlement.version + 1,
    updatedAt: now
  });
  addPersonalEntryToBatch(batch, {
    sharedId: `receipt_${settlement.id}`,
    userId,
    personal,
    type: 'reimbursement',
    amountCents: settlement.paidAmountCents,
    description: opts.partnerLabel ? `Acerto do casal: ${opts.partnerLabel}` : 'Acerto do casal',
    occurredOn,
    tags: ['casal', 'acerto']
  });
  const audit = auditEntry(workspaceId, userId, 'settlement_receipt_confirmed', 'settlement', settlement.id, 'Recebimento de acerto confirmado.');
  batch.set(audit.reference, audit.payload);

  return batch.commit();
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

  fireWrite(batch.commit());
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

  fireWrite(batch.commit());
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

  fireWrite(batch.commit());
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

export async function readPendingInvitePreview(code: string | null) {
  if (!code) {
    return null;
  }

  return previewCoupleInvite(code);
}

export function personalWorkspaceIdForPrivacyCheck(uid: string) {
  return getPersonalWorkspaceId(uid);
}
