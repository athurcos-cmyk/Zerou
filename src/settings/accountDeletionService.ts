import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentReference
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/config';
import { getPersonalWorkspaceId } from '../workspaces/workspaceService';
import type { Workspace, WorkspaceRef } from '../types/contracts';

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
  'auditLogs'
];

async function commitDeletes(refs: DocumentReference[]) {
  const db = getFirebaseDb();

  for (let index = 0; index < refs.length; index += BATCH_LIMIT) {
    const batch = writeBatch(db);
    refs.slice(index, index + BATCH_LIMIT).forEach((reference) => batch.delete(reference));
    await batch.commit();
  }
}

async function collectCollectionDocs(path: string) {
  const snapshot = await getDocs(collection(getFirebaseDb(), path));
  return snapshot.docs.map((item) => item.ref);
}

async function collectCardTree(workspaceId: string) {
  const refs: DocumentReference[] = [];
  const cardsSnapshot = await getDocs(collection(getFirebaseDb(), 'workspaces', workspaceId, 'cards'));

  for (const card of cardsSnapshot.docs) {
    const invoicesSnapshot = await getDocs(collection(card.ref, 'invoices'));

    for (const invoice of invoicesSnapshot.docs) {
      refs.push(...(await collectCollectionDocs(invoice.ref.path + '/ledger')));
      refs.push(invoice.ref);
    }

    refs.push(card.ref);
  }

  return refs;
}

async function collectWorkspaceTree(workspaceId: string) {
  const refs: DocumentReference[] = [];

  refs.push(...(await collectCardTree(workspaceId)));

  for (const collectionName of WORKSPACE_COLLECTIONS) {
    refs.push(...(await collectCollectionDocs(`workspaces/${workspaceId}/${collectionName}`)));
  }

  refs.push(doc(getFirebaseDb(), 'workspaces', workspaceId));
  return refs;
}

async function collectUserWorkspaceRefs(userId: string) {
  const snapshot = await getDocs(collection(getFirebaseDb(), 'users', userId, 'workspaceRefs'));
  return snapshot.docs.map((item) => ({ id: item.id, ref: item.ref, data: item.data() as WorkspaceRef }));
}

async function collectFcmTokens(userId: string) {
  const snapshot = await getDocs(collection(getFirebaseDb(), 'users', userId, 'fcmTokens'));
  return snapshot.docs.map((item) => item.ref);
}

async function collectCoupleInvites(workspaceId: string) {
  const snapshot = await getDocs(query(collection(getFirebaseDb(), 'coupleInvites'), where('workspaceId', '==', workspaceId)));
  return snapshot.docs.map((item) => item.ref);
}

async function collectBillingRefs(userId: string) {
  const billingId = `billing_${userId}`;
  const billingRef = doc(getFirebaseDb(), 'billingAccounts', billingId);
  const billingSnapshot = await getDoc(billingRef);

  if (!billingSnapshot.exists()) {
    return [];
  }

  return [
    ...(await collectCollectionDocs(`billingAccounts/${billingId}/subscriptions`)),
    billingRef
  ];
}

async function leavePartnerWorkspace(workspaceId: string, userId: string, workspaceRefData: WorkspaceRef) {
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  const memberRef = doc(db, 'workspaces', workspaceId, 'members', userId);
  const userWorkspaceRef = doc(db, 'users', userId, 'workspaceRefs', workspaceId);

  batch.update(memberRef, {
    status: 'removed',
    removedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.update(userWorkspaceRef, {
    ...workspaceRefData,
    status: 'removed',
    updatedAt: serverTimestamp()
  });
  batch.update(doc(db, 'workspaces', workspaceId), {
    partnerUserId: '',
    activeMemberCount: 1,
    updatedAt: serverTimestamp()
  });

  await batch.commit();
}

export async function deleteAccountData(userId: string) {
  const refs: DocumentReference[] = [];
  const workspaceRefs = await collectUserWorkspaceRefs(userId);
  const personalWorkspaceId = getPersonalWorkspaceId(userId);

  refs.push(...(await collectWorkspaceTree(personalWorkspaceId)));

  for (const workspaceRef of workspaceRefs) {
    if (workspaceRef.id === personalWorkspaceId) {
      continue;
    }

    const workspaceSnapshot = await getDoc(doc(getFirebaseDb(), 'workspaces', workspaceRef.id));

    if (!workspaceSnapshot.exists()) {
      continue;
    }

    const workspace = workspaceSnapshot.data() as Workspace;

    if (workspace.ownerUserId === userId) {
      refs.push(...(await collectCoupleInvites(workspaceRef.id)));
      refs.push(...(await collectWorkspaceTree(workspaceRef.id)));
      continue;
    }

    await leavePartnerWorkspace(workspaceRef.id, userId, workspaceRef.data);
    refs.push(doc(getFirebaseDb(), 'workspaces', workspaceRef.id, 'members', userId));
  }

  refs.push(...workspaceRefs.map((workspaceRef) => workspaceRef.ref));
  refs.push(...(await collectBillingRefs(userId)));
  refs.push(...(await collectFcmTokens(userId)));
  refs.push(doc(getFirebaseDb(), 'users', userId));

  await commitDeletes(refs);
}
