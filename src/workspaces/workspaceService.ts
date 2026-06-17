import type { User } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/config';
import type { AppearancePreferences } from '../theme/theme.types';

const FOUNDATION_WRITE_TIMEOUT_MS = 700;

interface EnsurePersonalFoundationInput {
  user: User;
  name: string;
  termsVersion: string;
  appearance: AppearancePreferences;
  goal?: string;
  challenge?: string;
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
  appearance,
  goal,
  challenge
}: EnsurePersonalFoundationInput): Promise<EnsurePersonalFoundationResponse> {
  const db = getFirebaseDb();
  const displayName = sanitizeDisplayName(name);
  const workspaceId = getPersonalWorkspaceId(user.uid);
  const userRef = doc(db, 'users', user.uid);
  const workspaceRef = doc(db, 'workspaces', workspaceId);
  const memberRef = doc(db, 'workspaces', workspaceId, 'members', user.uid);
  const workspaceRefForUser = doc(db, 'users', user.uid, 'workspaceRefs', workspaceId);

  const now = serverTimestamp();
  const batch = writeBatch(db);

  batch.set(userRef, {
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
      ...(goal ? { onboardingGoal: goal } : {}),
      ...(challenge ? { onboardingChallenge: challenge } : {}),
      ...appearance,
      createdAt: now,
      updatedAt: now
  });

  batch.set(workspaceRef, {
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

  batch.set(memberRef, {
      userId: user.uid,
      workspaceId,
      role: 'owner',
      status: 'active',
      joinedAt: now,
      createdAt: now,
      updatedAt: now
  });

  batch.set(workspaceRefForUser, {
      workspaceId,
      type: 'personal',
      role: 'owner',
      status: 'active',
      createdAt: now,
      updatedAt: now
  });

  const commit = batch.commit();
  const timeout = new Promise((resolve) => {
    globalThis.setTimeout(resolve, FOUNDATION_WRITE_TIMEOUT_MS);
  });

  await Promise.race([commit, timeout]);

  void commit.catch(() => undefined);
  return { workspaceId, created: true };
}
