import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore();
const region = 'southamerica-east1';

type ThemeId = 'paper' | 'sakura' | 'obsidian' | 'midnight' | 'aurora' | 'rose-gold';
type ThemeMode = 'manual' | 'system';

interface EnsureUserProfileInput {
  name?: unknown;
  termsVersion?: unknown;
  appearance?: {
    themeMode?: ThemeMode;
    themeId?: ThemeId;
    density?: 'comfortable' | 'compact';
    fontScale?: 'sm' | 'md' | 'lg';
    reduceMotion?: boolean;
  };
}

const validThemeIds = new Set(['paper', 'sakura', 'obsidian', 'midnight', 'aurora', 'rose-gold']);

function assertAuthenticated(uid?: string): asserts uid is string {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Entre na Zerou para continuar.');
  }
}

function sanitizeName(value: unknown) {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Informe seu nome para continuar.');
  }

  const name = value.trim();

  if (name.length < 2 || name.length > 80) {
    throw new HttpsError('invalid-argument', 'Informe um nome entre 2 e 80 caracteres.');
  }

  return name;
}

function readAppearance(input: EnsureUserProfileInput['appearance']) {
  const themeMode = input?.themeMode === 'manual' || input?.themeMode === 'system' ? input.themeMode : 'system';
  const themeId = validThemeIds.has(String(input?.themeId)) ? input?.themeId : 'paper';
  const density = input?.density === 'compact' ? 'compact' : 'comfortable';
  const fontScale = input?.fontScale === 'sm' || input?.fontScale === 'lg' ? input.fontScale : 'md';
  const reduceMotion = Boolean(input?.reduceMotion);

  return { themeMode, themeId, density, fontScale, reduceMotion };
}

export const ensureUserProfile = onCall({ region }, async (request) => {
  const uid = request.auth?.uid;
  assertAuthenticated(uid);

  const data = (request.data ?? {}) as EnsureUserProfileInput;
  const name = sanitizeName(data.name);
  const termsVersion = typeof data.termsVersion === 'string' ? data.termsVersion : 'zerou-v12.2-foundation';
  const appearance = readAppearance(data.appearance);
  const userRecord = request.auth?.token;
  const userRef = db.doc(`users/${uid}`);
  const snapshot = await userRef.get();
  const now = FieldValue.serverTimestamp();

  await userRef.set(
    {
      id: uid,
      name,
      email: typeof userRecord?.email === 'string' ? userRecord.email : '',
      avatarUrl: typeof userRecord?.picture === 'string' ? userRecord.picture : undefined,
      locale: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      termsAccepted: true,
      termsVersion,
      termsAcceptedAt: snapshot.exists ? snapshot.get('termsAcceptedAt') ?? now : now,
      ...appearance,
      createdAt: snapshot.exists ? snapshot.get('createdAt') ?? now : now,
      updatedAt: now
    },
    { merge: true }
  );

  return { ok: true };
});

export const ensurePersonalWorkspace = onCall({ region }, async (request) => {
  const uid = request.auth?.uid;
  assertAuthenticated(uid);

  const userRef = db.doc(`users/${uid}`);
  const workspaceId = `personal_${uid}`;
  const workspaceRef = db.doc(`workspaces/${workspaceId}`);
  const memberRef = workspaceRef.collection('members').doc(uid);
  const workspaceRefForUser = userRef.collection('workspaceRefs').doc(workspaceId);
  const now = FieldValue.serverTimestamp();

  const result = await db.runTransaction(async (transaction) => {
    const [userSnapshot, workspaceSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(workspaceRef)
    ]);

    if (!userSnapshot.exists) {
      throw new HttpsError('failed-precondition', 'Conclua o onboarding da Zerou antes de criar o workspace.');
    }

    const existingDefaultWorkspaceId = userSnapshot.get('defaultWorkspaceId') as string | undefined;
    const targetWorkspaceId = existingDefaultWorkspaceId ?? workspaceId;
    const targetWorkspaceRef = db.doc(`workspaces/${targetWorkspaceId}`);
    const targetWorkspaceSnapshot =
      targetWorkspaceId === workspaceId ? workspaceSnapshot : await transaction.get(targetWorkspaceRef);

    if (targetWorkspaceSnapshot.exists) {
      transaction.set(
        userRef,
        {
          defaultWorkspaceId: targetWorkspaceId,
          updatedAt: now
        },
        { merge: true }
      );

      return { workspaceId: targetWorkspaceId, created: false };
    }

    transaction.set(workspaceRef, {
      id: workspaceId,
      type: 'personal',
      name: 'Meu espaço pessoal',
      ownerUserId: uid,
      status: 'active',
      currency: 'BRL',
      locale: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      createdAt: now,
      updatedAt: now
    });

    transaction.set(memberRef, {
      userId: uid,
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

    transaction.set(
      userRef,
      {
        defaultWorkspaceId: workspaceId,
        updatedAt: now
      },
      { merge: true }
    );

    return { workspaceId, created: true };
  });

  return result;
});
