import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

initializeApp();

const ADMIN_EMAIL = 'a.thurcos@gmail.com';
const REGION = 'southamerica-east1';
const BATCH_LIMIT = 450;

const WORKSPACE_COLLECTIONS = [
  'accounts',
  'categories',
  'transactions',
  'bills',
  'recurring',
  'goals',
  'goalContributions',
  'members',
  'sharedExpenseClaims',
  'settlements',
  'comments',
  'auditLogs',
];

function assertAdmin(email: string | undefined): void {
  if (email !== ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'Acesso negado.');
  }
}

async function commitDeletes(refs: DocumentReference[]): Promise<void> {
  const db = getFirestore();
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    refs.slice(i, i + BATCH_LIMIT).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function collectSubcollection(path: string): Promise<DocumentReference[]> {
  const snap = await getFirestore().collection(path).get();
  return snap.docs.map((d) => d.ref);
}

async function collectCardTree(workspaceId: string): Promise<DocumentReference[]> {
  const db = getFirestore();
  const refs: DocumentReference[] = [];
  const cardsSnap = await db.collection(`workspaces/${workspaceId}/cards`).get();

  for (const card of cardsSnap.docs) {
    const invoicesSnap = await card.ref.collection('invoices').get();
    for (const invoice of invoicesSnap.docs) {
      const ledgerSnap = await invoice.ref.collection('ledger').get();
      refs.push(...ledgerSnap.docs.map((d) => d.ref));
      refs.push(invoice.ref);
    }
    refs.push(card.ref);
  }

  return refs;
}

// Fecha o mesmo gap achado na auto-exclusão (accountDeletionService.ts, 2026-07-17): o
// número de WhatsApp ficava vinculado depois da conta excluída, porque nem a exclusão do
// próprio usuário nem a do admin nunca tocavam nessas coleções.
async function collectWhatsappRefs(workspaceId: string): Promise<DocumentReference[]> {
  const db = getFirestore();
  const refs: DocumentReference[] = [];
  const linksSnap = await db.collection(`workspaces/${workspaceId}/whatsappLinks`).get();

  for (const linkDoc of linksSnap.docs) {
    refs.push(linkDoc.ref);
    refs.push(db.doc(`whatsappPhoneIndex/${linkDoc.id}`));
  }

  return refs;
}

async function collectWorkspaceTree(workspaceId: string): Promise<DocumentReference[]> {
  const db = getFirestore();
  const refs: DocumentReference[] = [];

  refs.push(...(await collectCardTree(workspaceId)));
  refs.push(...(await collectWhatsappRefs(workspaceId)));

  for (const col of WORKSPACE_COLLECTIONS) {
    refs.push(...(await collectSubcollection(`workspaces/${workspaceId}/${col}`)));
  }

  refs.push(db.doc(`workspaces/${workspaceId}`));
  return refs;
}

export const adminDeleteUser = onCall(
  { region: REGION, maxInstances: 5 },
  async (request) => {
    assertAdmin(request.auth?.token.email);

    const userId = request.data?.userId;
    if (!userId || typeof userId !== 'string') {
      throw new HttpsError('invalid-argument', 'userId obrigatório.');
    }

    const auth = getAuth();
    try {
      await auth.getUser(userId);
    } catch {
      throw new HttpsError('not-found', 'Usuário não encontrado no Firebase Auth.');
    }

    const db = getFirestore();
    const refs: DocumentReference[] = [];

    const personalWorkspaceId = `personal_${userId}`;
    refs.push(...(await collectWorkspaceTree(personalWorkspaceId)));

    refs.push(...(await collectSubcollection(`users/${userId}/fcmTokens`)));
    refs.push(...(await collectSubcollection(`users/${userId}/whatsappLinkCodes`)));

    const workspaceRefsSnap = await db.collection(`users/${userId}/workspaceRefs`).get();

    for (const wsRefDoc of workspaceRefsSnap.docs) {
      const wsId = wsRefDoc.id;
      if (wsId === personalWorkspaceId) continue;

      const wsSnap = await db.doc(`workspaces/${wsId}`).get();
      if (!wsSnap.exists) continue;

      const ws = wsSnap.data()!;

      if (ws.ownerUserId === userId) {
        const invitesSnap = await db.collection('coupleInvites').where('workspaceId', '==', wsId).get();
        refs.push(...invitesSnap.docs.map((d) => d.ref));
        refs.push(...(await collectWorkspaceTree(wsId)));
      } else {
        refs.push(db.doc(`workspaces/${wsId}/members/${userId}`));
        await db.doc(`workspaces/${wsId}`).update({
          partnerUserId: '',
          activeMemberCount: 1,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    refs.push(...workspaceRefsSnap.docs.map((d) => d.ref));

    const billingId = `billing_${userId}`;
    const billingSnap = await db.doc(`billingAccounts/${billingId}`).get();
    if (billingSnap.exists) {
      refs.push(...(await collectSubcollection(`billingAccounts/${billingId}/subscriptions`)));
      refs.push(db.doc(`billingAccounts/${billingId}`));
    }

    const privacySnap = await db.collection('privacyRequests').where('userId', '==', userId).get();
    refs.push(...privacySnap.docs.map((d) => d.ref));

    refs.push(db.doc(`users/${userId}`));

    await commitDeletes(refs);
    await auth.deleteUser(userId);

    logger.info('admin_deleted_user', {
      deletedUserId: userId,
      deletedBy: request.auth?.uid,
      docsDeleted: refs.length,
    });

    return { success: true, docsDeleted: refs.length };
  },
);

export const adminForceLogout = onCall(
  { region: REGION, maxInstances: 5 },
  async (request) => {
    assertAdmin(request.auth?.token.email);

    const userId = request.data?.userId;
    if (!userId || typeof userId !== 'string') {
      throw new HttpsError('invalid-argument', 'userId obrigatório.');
    }

    const auth = getAuth();
    try {
      await auth.getUser(userId);
    } catch {
      throw new HttpsError('not-found', 'Usuário não encontrado no Firebase Auth.');
    }

    await auth.revokeRefreshTokens(userId);

    logger.info('admin_forced_logout', {
      targetUserId: userId,
      actorUserId: request.auth?.uid,
    });

    return { success: true };
  },
);
