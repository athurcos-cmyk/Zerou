import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Timestamp, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

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

function accountPayload(workspaceId: string, accountId: string, uid: string, overrides: Record<string, unknown> = {}) {
  const now = serverTimestamp();

  return {
    id: accountId,
    workspaceId,
    name: 'Conta teste',
    type: 'checking',
    openingBalanceCents: 10000,
    isActive: true,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function transactionPayload(
  workspaceId: string,
  transactionId: string,
  uid: string,
  accountId: string,
  overrides: Record<string, unknown> = {}
) {
  const now = serverTimestamp();

  return {
    id: transactionId,
    workspaceId,
    createdBy: uid,
    updatedBy: uid,
    type: 'expense',
    amountCents: 12345,
    description: 'Mercado',
    accountId,
    date: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
    competenceMonth: '2026-06',
    cashMonth: '2026-06',
    tags: [],
    isRecurring: false,
    clientMutationId: transactionId,
    syncStatus: 'synced',
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
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

  it('allows an active member to create a financial account in their workspace', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertSucceeds(
      setDoc(doc(aliceDb, 'workspaces/workspaceA/accounts/accountA'), accountPayload('workspaceA', 'accountA', 'alice'))
    );
  });

  it('blocks a user from writing financial accounts in another workspace', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertFails(
      setDoc(doc(aliceDb, 'workspaces/workspaceB/accounts/accountB'), accountPayload('workspaceB', 'accountB', 'alice'))
    );
  });

  it('allows a member to create a transaction only for an account in the same workspace', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertSucceeds(
      setDoc(doc(aliceDb, 'workspaces/workspaceA/accounts/accountA'), accountPayload('workspaceA', 'accountA', 'alice'))
    );
    await assertSucceeds(
      setDoc(
        doc(aliceDb, 'workspaces/workspaceA/transactions/txnA'),
        transactionPayload('workspaceA', 'txnA', 'alice', 'accountA')
      )
    );
  });

  it('blocks protected financial transaction fields from being forged', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertSucceeds(
      setDoc(doc(aliceDb, 'workspaces/workspaceA/accounts/accountA'), accountPayload('workspaceA', 'accountA', 'alice'))
    );
    await assertFails(
      setDoc(
        doc(aliceDb, 'workspaces/workspaceA/transactions/txnForged'),
        transactionPayload('workspaceB', 'txnForged', 'bob', 'accountA', {
          workspaceId: 'workspaceB',
          createdBy: 'bob'
        })
      )
    );
  });

  it('blocks cross-workspace transaction reads', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const bobDb = testEnv.authenticatedContext('bob').firestore();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'workspaces/workspaceB/transactions/txnB'), {
        ...transactionPayload('workspaceB', 'txnB', 'bob', 'accountB'),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
    });

    await assertSucceeds(getDoc(doc(bobDb, 'workspaces/workspaceB/transactions/txnB')));
    await assertFails(getDoc(doc(aliceDb, 'workspaces/workspaceB/transactions/txnB')));
  });
});
