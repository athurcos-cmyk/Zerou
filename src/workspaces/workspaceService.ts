import type { User } from 'firebase/auth';
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/config';
import type { AppearancePreferences } from '../theme/theme.types';

interface EnsurePersonalFoundationInput {
  user: User;
  name: string;
  termsVersion: string;
  appearance: AppearancePreferences;
}

interface EnsurePersonalFoundationResponse {
  workspaceId: string;
  created: boolean;
}

function sanitizeDisplayName(value: string) {
  const name = value.trim();

  if (name.length < 2 || name.length > 80) {
    throw new Error('Informe um nome entre 2 e 80 caracteres.');
  }

  return name;
}

export function getPersonalWorkspaceId(uid: string) {
  return `personal_${uid}`;
}

export async function ensurePersonalFoundation({
  user,
  name,
  termsVersion,
  appearance
}: EnsurePersonalFoundationInput): Promise<EnsurePersonalFoundationResponse> {
  const db = getFirebaseDb();
  const displayName = sanitizeDisplayName(name);
  const workspaceId = getPersonalWorkspaceId(user.uid);
  const userRef = doc(db, 'users', user.uid);
  const workspaceRef = doc(db, 'workspaces', workspaceId);
  const memberRef = doc(db, 'workspaces', workspaceId, 'members', user.uid);
  const workspaceRefForUser = doc(db, 'users', user.uid, 'workspaceRefs', workspaceId);

  return runTransaction(db, async (transaction) => {
    const [userSnapshot, workspaceSnapshot, memberSnapshot, refSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(workspaceRef),
      transaction.get(memberRef),
      transaction.get(workspaceRefForUser)
    ]);

    if (
      userSnapshot.exists() &&
      workspaceSnapshot.exists() &&
      memberSnapshot.exists() &&
      refSnapshot.exists() &&
      userSnapshot.get('defaultWorkspaceId') === workspaceId
    ) {
      return { workspaceId, created: false };
    }

    if (userSnapshot.exists() || workspaceSnapshot.exists() || memberSnapshot.exists() || refSnapshot.exists()) {
      throw new Error('A fundacao da conta esta incompleta. Tente sair e entrar novamente antes de continuar.');
    }

    const now = serverTimestamp();

    transaction.set(userRef, {
      id: user.uid,
      name: displayName,
      email: user.email ?? '',
      avatarUrl: user.photoURL ?? '',
      locale: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      termsAccepted: true,
      termsVersion,
      termsAcceptedAt: now,
      defaultWorkspaceId: workspaceId,
      ...appearance,
      createdAt: now,
      updatedAt: now
    });

    transaction.set(workspaceRef, {
      id: workspaceId,
      type: 'personal',
      name: 'Meu espaco pessoal',
      ownerUserId: user.uid,
      status: 'active',
      currency: 'BRL',
      locale: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      createdAt: now,
      updatedAt: now
    });

    transaction.set(memberRef, {
      userId: user.uid,
      workspaceId,
      role: 'owner',
      status: 'active',
      joinedAt: now,
      createdAt: now,
      updatedAt: now
    });

    transaction.set(workspaceRefForUser, {
      workspaceId,
      type: 'personal',
      role: 'owner',
      status: 'active',
      createdAt: now,
      updatedAt: now
    });

    return { workspaceId, created: true };
  });
}

export async function hasPersonalFoundation(uid: string) {
  const db = getFirebaseDb();
  const workspaceId = getPersonalWorkspaceId(uid);
  const [userSnapshot, workspaceSnapshot, memberSnapshot] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDoc(doc(db, 'workspaces', workspaceId)),
    getDoc(doc(db, 'workspaces', workspaceId, 'members', uid))
  ]);

  return userSnapshot.exists() && workspaceSnapshot.exists() && memberSnapshot.exists();
}
