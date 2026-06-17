import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import type { UserProfile, Workspace } from '../types/contracts';
import { getFirebaseDb } from '../firebase/config';

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

export async function getAdminUsers(): Promise<UserProfile[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(500))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserProfile));
}

export async function getAdminCoupleWorkspaces(): Promise<Workspace[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(collection(db, 'workspaces'), where('type', '==', 'couple'), orderBy('createdAt', 'desc'), limit(200))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Workspace));
}

export async function getAdminInvites(): Promise<AdminInvite[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(collection(db, 'coupleInvites'), orderBy('createdAt', 'desc'), limit(200))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminInvite));
}
