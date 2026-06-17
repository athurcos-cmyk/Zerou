import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

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

async function collectWorkspaceTree(workspaceId: string): Promise<DocumentReference[]> {
  const db = getFirestore();
  const refs: DocumentReference[] = [];

  refs.push(...(await collectCardTree(workspaceId)));

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

    // Personal workspace
    const personalWorkspaceId = `personal_${userId}`;
    refs.push(...(await collectWorkspaceTree(personalWorkspaceId)));

    // All workspace refs for this user
    const workspaceRefsSnap = await db.collection(`users/${userId}/workspaceRefs`).get();

    for (const wsRefDoc of workspaceRefsSnap.docs) {
      const wsId = wsRefDoc.id;
      if (wsId === personalWorkspaceId) continue;

      const wsSnap = await db.doc(`workspaces/${wsId}`).get();
      if (!wsSnap.exists) continue;

      const ws = wsSnap.data()!;

      if (ws.ownerUserId === userId) {
        // Owner: delete the entire couple workspace + its invites
        const invitesSnap = await db.collection('coupleInvites').where('workspaceId', '==', wsId).get();
        refs.push(...invitesSnap.docs.map((d) => d.ref));
        refs.push(...(await collectWorkspaceTree(wsId)));
      } else {
        // Partner: remove membership, update workspace to reflect departure
        refs.push(db.doc(`workspaces/${wsId}/members/${userId}`));
        await db.doc(`workspaces/${wsId}`).update({
          partnerUserId: '',
          activeMemberCount: 1,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    // workspaceRefs subcollection
    refs.push(...workspaceRefsSnap.docs.map((d) => d.ref));

    // Billing
    const billingId = `billing_${userId}`;
    const billingSnap = await db.doc(`billingAccounts/${billingId}`).get();
    if (billingSnap.exists) {
      refs.push(...(await collectSubcollection(`billingAccounts/${billingId}/subscriptions`)));
      refs.push(db.doc(`billingAccounts/${billingId}`));
    }

    // Privacy requests
    const privacySnap = await db.collection('privacyRequests').where('userId', '==', userId).get();
    refs.push(...privacySnap.docs.map((d) => d.ref));

    // User profile (last Firestore doc)
    refs.push(db.doc(`users/${userId}`));

    await commitDeletes(refs);

    // Firebase Auth user (after all Firestore data is gone)
    await auth.deleteUser(userId);

    logger.info('admin_deleted_user', {
      deletedUserId: userId,
      deletedBy: request.auth?.uid,
      docsDeleted: refs.length,
    });

    return { success: true, docsDeleted: refs.length };
  },
);
