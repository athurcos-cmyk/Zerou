import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { UserProfile, Workspace } from '../types/contracts';
import { getFirebaseDb, getFirebaseFunctions } from '../firebase/config';

export interface AdminInvite {
  id: string;
  workspaceId: string;
  workspaceName: string;
  codeHint: string;
  createdBy: string;
  expiresAt: Timestamp | null;
  status: 'active' | 'accepted' | 'revoked' | 'expired';
  usedBy?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

// Tetos das queries — usados também pra sinalizar na UI quando o resultado pode
// estar truncado (contagem == limite não significa "é exatamente isso", significa
// "pode ter mais").
export const ADMIN_USERS_LIMIT = 500;
export const ADMIN_COUPLES_LIMIT = 200;
export const ADMIN_INVITES_LIMIT = 200;

export async function getAdminUsers(): Promise<UserProfile[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(ADMIN_USERS_LIMIT))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserProfile));
}

export async function getAdminCoupleWorkspaces(): Promise<Workspace[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(collection(db, 'workspaces'), where('type', '==', 'couple'), orderBy('createdAt', 'desc'), limit(ADMIN_COUPLES_LIMIT))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Workspace));
}

export async function getAdminInvites(): Promise<AdminInvite[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(collection(db, 'coupleInvites'), orderBy('createdAt', 'desc'), limit(ADMIN_INVITES_LIMIT))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminInvite));
}

export async function callAdminDeleteUser(userId: string): Promise<{ docsDeleted: number }> {
  const fn = httpsCallable<{ userId: string }, { success: boolean; docsDeleted: number }>(
    getFirebaseFunctions(),
    'adminDeleteUser'
  );
  const result = await fn({ userId });
  return result.data;
}
