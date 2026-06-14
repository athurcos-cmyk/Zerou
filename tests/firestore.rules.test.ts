import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;
type TestFirestore = ReturnType<RulesTestContext['firestore']>;

function foundationPayload(uid: string) {
  const workspaceId = `personal_${uid}`;
  const now = serverTimestamp();

  return {
    workspaceId,
    user: {
      id: uid,
      name: `${uid} Zerou`,
      email: `${uid}@zerou.test`,
      avatarUrl: '',
      locale: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      termsAccepted: true,
      termsVersion: 'zerou-v12.2-foundation',
      termsAcceptedAt: now,
      defaultWorkspaceId: workspaceId,
      themeMode: 'system',
      themeId: 'paper',
      density: 'comfortable',
      fontScale: 'md',
      reduceMotion: false,
      createdAt: now,
      updatedAt: now
    },
    workspace: {
      id: workspaceId,
      type: 'personal',
      name: 'Meu espaco pessoal',
      ownerUserId: uid,
      status: 'active',
      currency: 'BRL',
      locale: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      createdAt: now,
      updatedAt: now
    },
    member: {
      userId: uid,
      workspaceId,
      role: 'owner',
      status: 'active',
      joinedAt: now,
      createdAt: now,
      updatedAt: now
    },
    workspaceRef: {
      workspaceId,
      type: 'personal',
      role: 'owner',
      status: 'active',
      createdAt: now,
      updatedAt: now
    }
  };
}

function createFoundationBatch(db: TestFirestore, uid: string, overrides: Record<string, unknown> = {}) {
  const payload = foundationPayload(uid);
  const modularDb = db as unknown as Parameters<typeof writeBatch>[0];
  const userOverrides = (overrides.user ?? {}) as Record<string, unknown>;
  const workspaceOverrides = (overrides.workspace ?? {}) as Record<string, unknown>;
  const memberOverrides = (overrides.member ?? {}) as Record<string, unknown>;
  const workspaceRefOverrides = (overrides.workspaceRef ?? {}) as Record<string, unknown>;
  const batch = writeBatch(modularDb);
  batch.set(doc(modularDb, 'users', uid), { ...payload.user, ...userOverrides });
  batch.set(doc(modularDb, 'workspaces', payload.workspaceId), { ...payload.workspace, ...workspaceOverrides });
  batch.set(doc(modularDb, 'workspaces', payload.workspaceId, 'members', uid), {
    ...payload.member,
    ...memberOverrides
  });
  batch.set(doc(modularDb, 'users', uid, 'workspaceRefs', payload.workspaceId), {
    ...payload.workspaceRef,
    ...workspaceRefOverrides
  });
  return batch;
}

describe('firestore security rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: `zerou-rules-${Date.now()}`,
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8')
      }
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users/alice'), {
        id: 'alice',
        name: 'Alice',
        email: 'alice@zerou.test',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        themeMode: 'system',
        themeId: 'paper',
        density: 'comfortable',
        fontScale: 'md',
        reduceMotion: false
      });
      await setDoc(doc(adminDb, 'users/bob'), {
        id: 'bob',
        name: 'Bob',
        email: 'bob@zerou.test',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        themeMode: 'system',
        themeId: 'paper',
        density: 'comfortable',
        fontScale: 'md',
        reduceMotion: false
      });
      await setDoc(doc(adminDb, 'workspaces/workspaceA'), {
        id: 'workspaceA',
        type: 'personal',
        name: 'Alice pessoal',
        ownerUserId: 'alice',
        status: 'active',
        currency: 'BRL',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo'
      });
      await setDoc(doc(adminDb, 'workspaces/workspaceA/members/alice'), {
        userId: 'alice',
        workspaceId: 'workspaceA',
        role: 'owner',
        status: 'active'
      });
      await setDoc(doc(adminDb, 'workspaces/workspaceB'), {
        id: 'workspaceB',
        type: 'personal',
        name: 'Bob pessoal',
        ownerUserId: 'bob',
        status: 'active',
        currency: 'BRL',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo'
      });
      await setDoc(doc(adminDb, 'workspaces/workspaceB/members/bob'), {
        userId: 'bob',
        workspaceId: 'workspaceB',
        role: 'owner',
        status: 'active'
      });
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it('allows a user to read their own profile and active workspace', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertSucceeds(getDoc(doc(aliceDb, 'users/alice')));
    await assertSucceeds(getDoc(doc(aliceDb, 'workspaces/workspaceA')));
  });

  it('allows a signed-in user to create their own Spark foundation atomically', async () => {
    const charlieDb = testEnv.authenticatedContext('charlie').firestore();

    await assertSucceeds(createFoundationBatch(charlieDb, 'charlie').commit());
    await assertSucceeds(getDoc(doc(charlieDb, 'users/charlie')));
    await assertSucceeds(getDoc(doc(charlieDb, 'workspaces/personal_charlie')));
  });

  it('blocks forged Spark foundation owner and workspace references', async () => {
    const charlieDb = testEnv.authenticatedContext('charlie').firestore();

    await assertFails(
      createFoundationBatch(charlieDb, 'charlie', {
        user: { defaultWorkspaceId: 'personal_bob' },
        workspace: { ownerUserId: 'bob' },
        member: { role: 'partner' },
        workspaceRef: { workspaceId: 'personal_bob' }
      }).commit()
    );
  });

  it('blocks creating foundation documents for another uid', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertFails(createFoundationBatch(aliceDb, 'mallory').commit());
  });

  it('blocks a user from reading another user workspace', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertFails(getDoc(doc(aliceDb, 'users/bob')));
    await assertFails(getDoc(doc(aliceDb, 'workspaces/workspaceB')));
  });

  it('allows only appearance updates on the user profile', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertSucceeds(
      updateDoc(doc(aliceDb, 'users/alice'), {
        themeMode: 'manual',
        themeId: 'sakura',
        density: 'compact',
        fontScale: 'lg',
        reduceMotion: true,
        updatedAt: serverTimestamp()
      })
    );

    await assertFails(updateDoc(doc(aliceDb, 'users/alice'), { defaultWorkspaceId: 'workspaceB' }));
  });

  it('blocks client writes to owner and role protected fields', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertFails(updateDoc(doc(aliceDb, 'workspaces/workspaceA'), { ownerUserId: 'bob' }));
    await assertFails(updateDoc(doc(aliceDb, 'workspaces/workspaceA/members/alice'), { role: 'partner' }));
  });

  it('keeps anonymous users out of private data', async () => {
    const anonymousDb = testEnv.unauthenticatedContext().firestore();

    await expect(assertFails(getDoc(doc(anonymousDb, 'workspaces/workspaceA')))).resolves.toBeDefined();
  });
});
