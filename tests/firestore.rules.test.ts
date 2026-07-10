import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Timestamp, deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

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
      onboardingGoal: 'organizar',
      onboardingChallenge: 'para-onde',
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

function categoryPayload(workspaceId: string, categoryId: string, uid: string, overrides: Record<string, unknown> = {}) {
  const now = serverTimestamp();
  const payload: Record<string, unknown> = {
    id: categoryId,
    workspaceId,
    name: 'Categoria teste',
    type: 'expense',
    icon: 'tag',
    color: '#EE5524',
    isDefault: false,
    isActive: true,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };

  // O SDK do Firestore rejeita valores `undefined` explícitos no setDoc — usar
  // `createdBy: undefined` nos overrides pra simular payload de categoria padrão
  // (sem createdBy) precisa remover a chave de verdade, não só zerar o valor.
  if (payload.createdBy === undefined) {
    delete payload.createdBy;
  }

  return payload;
}

function goalPayload(workspaceId: string, goalId: string, uid: string, overrides: Record<string, unknown> = {}) {
  const now = serverTimestamp();

  return {
    id: goalId,
    workspaceId,
    name: 'Reserva',
    kind: 'save',
    targetCents: 100000,
    savedCents: 0,
    icon: 'piggy',
    color: '#EE5524',
    isActive: true,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function goalContributionPayload(workspaceId: string, contribId: string, goalId: string, uid: string, overrides: Record<string, unknown> = {}) {
  return {
    id: contribId,
    workspaceId,
    goalId,
    userId: uid,
    amountCents: 2500,
    monthKey: '2026-06',
    createdAt: serverTimestamp(),
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

function cardPayload(workspaceId: string, cardId: string, uid: string, overrides: Record<string, unknown> = {}) {
  const now = serverTimestamp();

  return {
    id: cardId,
    workspaceId,
    ownerUserId: uid,
    name: 'Cartao teste',
    lastFour: '4242',
    brand: 'Visa',
    limitCents: 200000,
    closingDay: 5,
    dueDay: 12,
    colorToken: 'chart-1',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function invoicePayload(workspaceId: string, cardId: string, invoiceId: string, overrides: Record<string, unknown> = {}) {
  const now = serverTimestamp();

  return {
    id: invoiceId,
    workspaceId,
    cardId,
    referenceMonth: '2026-06',
    dueDate: Timestamp.fromDate(new Date('2026-06-12T12:00:00')),
    status: 'open',
    purchasesTotalCents: 0,
    paymentsTotalCents: 0,
    creditsTotalCents: 0,
    feesTotalCents: 0,
    outstandingBalanceCents: 0,
    overpaidCreditCents: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function ledgerPayload(
  workspaceId: string,
  cardId: string,
  invoiceId: string,
  entryId: string,
  uid: string,
  overrides: Record<string, unknown> = {}
) {
  const now = serverTimestamp();

  return {
    id: entryId,
    workspaceId,
    cardId,
    invoiceId,
    type: 'purchase',
    amountCents: 109000,
    effectiveAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
    sourceTransactionId: 'txnCardPurchase',
    idempotencyKey: entryId,
    createdBy: uid,
    createdAt: now,
    ...overrides
  };
}

function cardPurchaseTransactionPayload(workspaceId: string, transactionId: string, uid: string) {
  const now = serverTimestamp();

  return {
    id: transactionId,
    workspaceId,
    createdBy: uid,
    updatedBy: uid,
    type: 'card_purchase',
    amountCents: 109000,
    description: 'Compra no cartao',
    categoryId: '',
    cardId: 'cardA',
    invoiceId: 'cardA_2026-06',
    date: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
    competenceMonth: '2026-06',
    cashMonth: '2026-06',
    tags: [],
    isRecurring: false,
    installmentGroupId: '',
    clientMutationId: transactionId,
    syncStatus: 'synced',
    version: 1,
    createdAt: now,
    updatedAt: now
  };
}

function cardPaymentTransactionPayload(
  workspaceId: string,
  transactionId: string,
  uid: string,
  overrides: Record<string, unknown> = {}
) {
  const now = serverTimestamp();

  return {
    id: transactionId,
    workspaceId,
    createdBy: uid,
    updatedBy: uid,
    type: 'card_payment',
    amountCents: 55000,
    description: 'Pagamento de fatura',
    accountId: 'accountA',
    cardId: 'cardA',
    invoiceId: 'cardA_2026-06',
    date: Timestamp.fromDate(new Date('2026-06-15T12:00:00')),
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

function coupleWorkspacePayload(workspaceId: string, uid: string, overrides: Record<string, unknown> = {}) {
  const now = serverTimestamp();

  return {
    id: workspaceId,
    type: 'couple',
    name: 'Espaco compartilhado',
    ownerUserId: uid,
    partnerUserId: '',
    activeMemberCount: 1,
    status: 'active',
    currency: 'BRL',
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function coupleMemberPayload(
  workspaceId: string,
  uid: string,
  role: 'owner' | 'partner',
  overrides: Record<string, unknown> = {}
) {
  const now = serverTimestamp();

  return {
    userId: uid,
    workspaceId,
    role,
    status: 'active',
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function workspaceRefPayload(workspaceId: string, role: 'owner' | 'partner', overrides: Record<string, unknown> = {}) {
  const now = serverTimestamp();

  return {
    workspaceId,
    type: 'couple',
    role,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function invitePayload(inviteId: string, workspaceId: string, uid: string, overrides: Record<string, unknown> = {}) {
  const now = serverTimestamp();

  return {
    id: inviteId,
    workspaceId,
    workspaceName: 'Espaco compartilhado',
    codeHash: 'a'.repeat(64),
    codeHint: '92',
    createdBy: uid,
    expiresAt: Timestamp.fromDate(new Date('2026-06-16T12:00:00')),
    status: 'active',
    createdAt: now,
    updatedAt: now,
    version: 1,
    ...overrides
  };
}

function sharedClaimPayload(workspaceId: string, claimId: string, payerUserId: string, overrides: Record<string, unknown> = {}) {
  const now = serverTimestamp();

  return {
    id: claimId,
    workspaceId,
    payerUserId,
    description: 'Mercado compartilhado',
    totalAmountCents: 10000,
    split: [
      { userId: 'alice', amountCents: 5000 },
      { userId: 'bob', amountCents: 5000 }
    ],
    sourceVisibility: 'summary_only',
    status: 'pending',
    createdBy: payerUserId,
    clientMutationId: claimId,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function settlementPayload(workspaceId: string, settlementId: string, uid: string, overrides: Record<string, unknown> = {}) {
  const now = serverTimestamp();

  return {
    id: settlementId,
    workspaceId,
    fromUserId: 'bob',
    toUserId: 'alice',
    amountCents: 5000,
    status: 'proposed',
    paidAmountCents: 0,
    createdBy: uid,
    clientMutationId: settlementId,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function billingAccountPayload(uid: string, canCreateCoupleWorkspace: boolean, overrides: Record<string, unknown> = {}) {
  return {
    id: `billing_${uid}`,
    ownerUserId: uid,
    currentPlanId: canCreateCoupleWorkspace ? 'duo' : 'free',
    subscriptionStatus: canCreateCoupleWorkspace ? 'active' : 'free',
    entitlements: {
      canCreateCoupleWorkspace,
      canUseAdvancedReports: false,
      canUseAutomationRules: false,
      canImportStatements: false,
      canExportXlsx: false,
      canExportPdf: canCreateCoupleWorkspace,
      canUploadReceipts: false,
      canUseOcr: false,
      canUseAdvancedReconciliation: false,
      maxTransactionsPerMonth: canCreateCoupleWorkspace ? 2000 : 250,
      maxReceiptStorageMb: 0,
      maxAutomationRules: 0
    },
    updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
    ...overrides
  };
}

function privacyRequestPayload(requestId: string, uid: string, overrides: Record<string, unknown> = {}) {
  const now = serverTimestamp();

  return {
    id: requestId,
    userId: uid,
    email: `${uid}@zerou.test`,
    type: 'export',
    status: 'open',
    notes: 'Solicitacao criada no centro de privacidade.',
    version: 'zerou-v12.2-privacy-request',
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function createCoupleWorkspaceBatch(db: TestFirestore, workspaceId = 'coupleA', uid = 'alice') {
  const modularDb = db as unknown as Parameters<typeof writeBatch>[0];
  const batch = writeBatch(modularDb);
  batch.set(doc(modularDb, 'workspaces', workspaceId), coupleWorkspacePayload(workspaceId, uid));
  batch.set(doc(modularDb, 'workspaces', workspaceId, 'members', uid), coupleMemberPayload(workspaceId, uid, 'owner'));
  batch.set(doc(modularDb, 'users', uid, 'workspaceRefs', workspaceId), workspaceRefPayload(workspaceId, 'owner'));
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
      await setDoc(doc(adminDb, 'users/charlie'), {
        id: 'charlie',
        name: 'Charlie',
        email: 'charlie@zerou.test',
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        themeMode: 'system',
        themeId: 'paper',
        density: 'comfortable',
        fontScale: 'md',
        reduceMotion: false
      });
      await setDoc(doc(adminDb, 'billingAccounts/billing_alice'), billingAccountPayload('alice', true));
      await setDoc(doc(adminDb, 'billingAccounts/billing_bob'), billingAccountPayload('bob', false));
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

  it('allows creating the foundation with a payday answered during onboarding, and rejects a malformed one', async () => {
    const dianaDb = testEnv.authenticatedContext('diana').firestore();

    await assertSucceeds(
      createFoundationBatch(dianaDb, 'diana', { user: { payday: { type: 'fixed_day', day: 5 } } }).commit()
    );

    const erinDb = testEnv.authenticatedContext('erin').firestore();
    await assertFails(
      createFoundationBatch(erinDb, 'erin', { user: { payday: { type: 'fixed_day', day: 40 } } }).commit()
    );
  });

  it('allows creating the foundation with a committed window (renda variável, no payday), and rejects an out-of-range value', async () => {
    const fabioDb = testEnv.authenticatedContext('fabio').firestore();

    await assertSucceeds(
      createFoundationBatch(fabioDb, 'fabio', { user: { committedWindowDays: 15 } }).commit()
    );

    const gabiDb = testEnv.authenticatedContext('gabi').firestore();
    await assertFails(
      createFoundationBatch(gabiDb, 'gabi', { user: { committedWindowDays: 120 } }).commit()
    );
  });

  it('allows a signed-in user to delete their own personal foundation atomically', async () => {
    const charlieDb = testEnv.authenticatedContext('charlie').firestore();
    const modularDb = charlieDb as unknown as Parameters<typeof writeBatch>[0];

    await assertSucceeds(createFoundationBatch(charlieDb, 'charlie').commit());

    const batch = writeBatch(modularDb);
    batch.delete(doc(modularDb, 'workspaces/personal_charlie/members/charlie'));
    batch.delete(doc(modularDb, 'users/charlie/workspaceRefs/personal_charlie'));
    batch.delete(doc(modularDb, 'workspaces/personal_charlie'));
    batch.delete(doc(modularDb, 'users/charlie'));

    await assertSucceeds(batch.commit());
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

  it('allows reading only the authenticated user billing account shell', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertSucceeds(getDoc(doc(aliceDb, 'billingAccounts/billing_alice')));
    await assertFails(getDoc(doc(aliceDb, 'billingAccounts/billing_bob')));
    await assertFails(getDoc(doc(aliceDb, 'billingAccounts/billing_alice/billingEvents/evt_test')));
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

  it('allows a user to set, change and clear their own payday preference', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertSucceeds(
      updateDoc(doc(aliceDb, 'users/alice'), {
        payday: { type: 'fixed_day', day: 5 },
        updatedAt: serverTimestamp()
      })
    );
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'users/alice'), {
        payday: { type: 'business_day', day: 5 },
        updatedAt: serverTimestamp()
      })
    );
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'users/alice'), {
        payday: { type: 'end_of_month' },
        updatedAt: serverTimestamp()
      })
    );
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'users/alice'), {
        payday: { type: 'variable_income' },
        updatedAt: serverTimestamp()
      })
    );
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'users/alice'), {
        payday: deleteField(),
        updatedAt: serverTimestamp()
      })
    );
  });

  it('rejects a malformed payday and payday updates bundled with unrelated fields', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertFails(
      updateDoc(doc(aliceDb, 'users/alice'), {
        payday: { type: 'fixed_day', day: 32 },
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(aliceDb, 'users/alice'), {
        payday: { type: 'yearly', day: 5 },
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(aliceDb, 'users/alice'), {
        payday: { type: 'fixed_day', day: 5 },
        name: 'Forged name',
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(aliceDb, 'users/alice'), {
        payday: { type: 'variable_income', day: 5 },
        updatedAt: serverTimestamp()
      })
    );
  });

  it('allows a user to set a committed window (renda variável) alongside or instead of payday, and rejects an out-of-range value', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertSucceeds(
      updateDoc(doc(aliceDb, 'users/alice'), {
        payday: deleteField(),
        committedWindowDays: 15,
        updatedAt: serverTimestamp()
      })
    );
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'users/alice'), {
        payday: { type: 'fixed_day', day: 5 },
        committedWindowDays: 30,
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(aliceDb, 'users/alice'), {
        committedWindowDays: 91,
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(aliceDb, 'users/alice'), {
        committedWindowDays: 0,
        updatedAt: serverTimestamp()
      })
    );
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

  it('allows an active member to delete a financial account document', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const accountReference = doc(aliceDb, 'workspaces/workspaceA/accounts/accountA');

    await assertSucceeds(setDoc(accountReference, accountPayload('workspaceA', 'accountA', 'alice')));
    await assertSucceeds(deleteDoc(accountReference));
  });

  it('allows an active member to create and recolor categories', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const categoryReference = doc(aliceDb, 'workspaces/workspaceA/categories/categoryA');

    await assertSucceeds(setDoc(categoryReference, categoryPayload('workspaceA', 'categoryA', 'alice')));
    await assertSucceeds(updateDoc(categoryReference, { color: '#37A24A', updatedAt: serverTimestamp() }));
  });

  it('allows seeding a default category without createdBy, but not a custom category', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    // Default categories (ensureDefaultCategories/buildDefaultCategory) never set createdBy.
    await assertSucceeds(
      setDoc(
        doc(aliceDb, 'workspaces/workspaceA/categories/categoryDefault'),
        categoryPayload('workspaceA', 'categoryDefault', 'alice', { isDefault: true, createdBy: undefined })
      )
    );
    // A non-default (user-created) category without createdBy must be rejected.
    await assertFails(
      setDoc(
        doc(aliceDb, 'workspaces/workspaceA/categories/categoryNoCreator'),
        categoryPayload('workspaceA', 'categoryNoCreator', 'alice', { isDefault: false, createdBy: undefined })
      )
    );
    // A default category that also claims a createdBy must be rejected.
    await assertFails(
      setDoc(
        doc(aliceDb, 'workspaces/workspaceA/categories/categoryDefaultWithCreator'),
        categoryPayload('workspaceA', 'categoryDefaultWithCreator', 'alice', { isDefault: true })
      )
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

  it('allows an active member to create a credit card in their workspace', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertSucceeds(setDoc(doc(aliceDb, 'workspaces/workspaceA/cards/cardA'), cardPayload('workspaceA', 'cardA', 'alice')));
  });

  it('blocks non-members from reading cards and invoices', async () => {
    const bobDb = testEnv.authenticatedContext('bob').firestore();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'workspaces/workspaceA/cards/cardA'), {
        ...cardPayload('workspaceA', 'cardA', 'alice'),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
      await setDoc(doc(adminDb, 'workspaces/workspaceA/cards/cardA/invoices/cardA_2026-06'), {
        ...invoicePayload('workspaceA', 'cardA', 'cardA_2026-06'),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
    });

    await assertFails(getDoc(doc(bobDb, 'workspaces/workspaceA/cards/cardA')));
    await assertFails(getDoc(doc(bobDb, 'workspaces/workspaceA/cards/cardA/invoices/cardA_2026-06')));
  });

  it('allows card purchase transactions to create an invoice and immutable ledger entry atomically', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const modularDb = aliceDb as unknown as Parameters<typeof writeBatch>[0];
    const batch = writeBatch(modularDb);

    await assertSucceeds(setDoc(doc(aliceDb, 'workspaces/workspaceA/cards/cardA'), cardPayload('workspaceA', 'cardA', 'alice')));

    batch.set(
      doc(modularDb, 'workspaces/workspaceA/cards/cardA/invoices/cardA_2026-06'),
      invoicePayload('workspaceA', 'cardA', 'cardA_2026-06')
    );
    batch.set(
      doc(modularDb, 'workspaces/workspaceA/cards/cardA/invoices/cardA_2026-06/ledger/txnCardPurchase_purchase_1'),
      ledgerPayload('workspaceA', 'cardA', 'cardA_2026-06', 'txnCardPurchase_purchase_1', 'alice')
    );
    batch.set(
      doc(modularDb, 'workspaces/workspaceA/transactions/txnCardPurchase'),
      cardPurchaseTransactionPayload('workspaceA', 'txnCardPurchase', 'alice')
    );

    await assertSucceeds(batch.commit());
  });

  it('requires an existing account when recording a card payment transaction', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertSucceeds(setDoc(doc(aliceDb, 'workspaces/workspaceA/cards/cardA'), cardPayload('workspaceA', 'cardA', 'alice')));
    await assertSucceeds(
      setDoc(
        doc(aliceDb, 'workspaces/workspaceA/cards/cardA/invoices/cardA_2026-06'),
        invoicePayload('workspaceA', 'cardA', 'cardA_2026-06')
      )
    );
    await assertSucceeds(
      setDoc(doc(aliceDb, 'workspaces/workspaceA/accounts/accountA'), accountPayload('workspaceA', 'accountA', 'alice'))
    );
    await assertSucceeds(
      setDoc(
        doc(aliceDb, 'workspaces/workspaceA/transactions/txnCardPayment'),
        cardPaymentTransactionPayload('workspaceA', 'txnCardPayment', 'alice')
      )
    );

    const paymentWithoutAccount = cardPaymentTransactionPayload('workspaceA', 'txnCardPaymentNoAccount', 'alice');
    delete (paymentWithoutAccount as Record<string, unknown>).accountId;

    await assertFails(setDoc(doc(aliceDb, 'workspaces/workspaceA/transactions/txnCardPaymentNoAccount'), paymentWithoutAccount));
  });

  it('blocks client changes to invoice aggregate fields while allowing status reconciliation', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const invoiceDocument = doc(aliceDb, 'workspaces/workspaceA/cards/cardA/invoices/cardA_2026-06');

    await assertSucceeds(setDoc(doc(aliceDb, 'workspaces/workspaceA/cards/cardA'), cardPayload('workspaceA', 'cardA', 'alice')));
    await assertSucceeds(setDoc(invoiceDocument, invoicePayload('workspaceA', 'cardA', 'cardA_2026-06')));

    await assertFails(updateDoc(invoiceDocument, { outstandingBalanceCents: 109000, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(invoiceDocument, { status: 'closed', updatedAt: serverTimestamp() }));
  });

  it('keeps invoice ledger entries immutable after creation', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const ledgerDocument = doc(aliceDb, 'workspaces/workspaceA/cards/cardA/invoices/cardA_2026-06/ledger/ledgerPurchaseA');

    await assertSucceeds(setDoc(doc(aliceDb, 'workspaces/workspaceA/cards/cardA'), cardPayload('workspaceA', 'cardA', 'alice')));
    await assertSucceeds(
      setDoc(
        doc(aliceDb, 'workspaces/workspaceA/cards/cardA/invoices/cardA_2026-06'),
        invoicePayload('workspaceA', 'cardA', 'cardA_2026-06')
      )
    );
    await assertSucceeds(
      setDoc(
        ledgerDocument,
        ledgerPayload('workspaceA', 'cardA', 'cardA_2026-06', 'ledgerPurchaseA', 'alice', {
          sourceTransactionId: 'txnLedgerPurchaseA'
        })
      )
    );

    await assertFails(updateDoc(ledgerDocument, { amountCents: 1 }));
  });

  // Regressão: o tipo TS `InvoiceLedgerEntryType` (src/types/contracts.ts) já incluía
  // 'installment_anticipation_credit' desde a criação da feature de antecipação de
  // parcelas, mas `validInvoiceLedgerEntryType` nunca foi atualizada com esse valor —
  // mesmo padrão do bug de `createdBy` faltando em `validCategoryCreate` (2026-07-09):
  // campo/valor novo no cliente sem atualizar a regra correspondente no mesmo commit.
  // Resultado: TODA antecipação de parcela era rejeitada silenciosamente em produção
  // (fire-and-forget engole o erro) desde que a feature existe.
  it('allows creating an installment_anticipation_credit ledger entry (anticipating a future installment)', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertSucceeds(setDoc(doc(aliceDb, 'workspaces/workspaceA/cards/cardA'), cardPayload('workspaceA', 'cardA', 'alice')));
    await assertSucceeds(
      setDoc(
        doc(aliceDb, 'workspaces/workspaceA/cards/cardA/invoices/cardA_2026-08'),
        invoicePayload('workspaceA', 'cardA', 'cardA_2026-08')
      )
    );
    await assertSucceeds(
      setDoc(
        doc(aliceDb, 'workspaces/workspaceA/cards/cardA/invoices/cardA_2026-08/ledger/anticipationCreditA'),
        ledgerPayload('workspaceA', 'cardA', 'cardA_2026-08', 'anticipationCreditA', 'alice', {
          type: 'installment_anticipation_credit',
          sourceTransactionId: 'txnOriginalInstallmentPurchase'
        })
      )
    );
  });

  it('validates goal documents and goal contributions', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const goalReference = doc(aliceDb, 'workspaces/workspaceA/goals/goalA');

    await assertSucceeds(setDoc(goalReference, goalPayload('workspaceA', 'goalA', 'alice')));
    await assertSucceeds(updateDoc(goalReference, { savedCents: 2500, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(goalReference, { createdBy: 'bob', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(aliceDb, 'workspaces/workspaceA/goals/goalForged'), goalPayload('workspaceA', 'goalForged', 'bob')));
    await assertSucceeds(
      setDoc(
        doc(aliceDb, 'workspaces/workspaceA/goalContributions/contribA'),
        goalContributionPayload('workspaceA', 'contribA', 'goalA', 'alice')
      )
    );
    await assertFails(
      setDoc(
        doc(aliceDb, 'workspaces/workspaceA/goalContributions/contribZero'),
        goalContributionPayload('workspaceA', 'contribZero', 'goalA', 'alice', { amountCents: 0 })
      )
    );
  });

  it('allows an owner to create a couple workspace atomically', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertSucceeds(createCoupleWorkspaceBatch(aliceDb).commit());
    await assertSucceeds(getDoc(doc(aliceDb, 'workspaces/coupleA')));
  });

  it('allows couple workspace creation during the free launch mode', async () => {
    const bobDb = testEnv.authenticatedContext('bob').firestore();

    await assertSucceeds(createCoupleWorkspaceBatch(bobDb, 'coupleBob', 'bob').commit());
  });

  it('allows a user to create only their own privacy request', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertSucceeds(
      setDoc(doc(aliceDb, 'privacyRequests/privacy_alice_export'), privacyRequestPayload('privacy_alice_export', 'alice'))
    );
    await assertFails(
      setDoc(doc(aliceDb, 'privacyRequests/privacy_bob_export'), privacyRequestPayload('privacy_bob_export', 'bob'))
    );
    await assertFails(
      setDoc(
        doc(aliceDb, 'privacyRequests/privacy_alice_closed'),
        privacyRequestPayload('privacy_alice_closed', 'alice', { status: 'closed' })
      )
    );
  });

  it('allows a valid couple invite to be accepted once', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const bobDb = testEnv.authenticatedContext('bob').firestore();
    const modularBobDb = bobDb as unknown as Parameters<typeof writeBatch>[0];
    const inviteId = 'invite_' + 'a'.repeat(32);

    await assertSucceeds(createCoupleWorkspaceBatch(aliceDb).commit());
    await assertSucceeds(setDoc(doc(aliceDb, 'coupleInvites', inviteId), invitePayload(inviteId, 'coupleA', 'alice')));

    const batch = writeBatch(modularBobDb);
    batch.update(doc(modularBobDb, 'workspaces/coupleA'), {
      partnerUserId: 'bob',
      activeMemberCount: 2,
      updatedAt: serverTimestamp()
    });
    batch.update(doc(modularBobDb, 'coupleInvites', inviteId), {
      status: 'accepted',
      usedBy: 'bob',
      usedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    batch.set(doc(modularBobDb, 'workspaces/coupleA/members/bob'), coupleMemberPayload('coupleA', 'bob', 'partner', { acceptedInviteId: inviteId }));
    batch.set(doc(modularBobDb, 'users/bob/workspaceRefs/coupleA'), workspaceRefPayload('coupleA', 'partner'));

    await assertSucceeds(batch.commit());
    await assertFails(
      updateDoc(doc(bobDb, 'coupleInvites', inviteId), {
        status: 'accepted',
        usedBy: 'charlie',
        usedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    );
  });

  it('blocks expired, revoked and reused invites from being accepted', async () => {
    const bobDb = testEnv.authenticatedContext('bob').firestore();
    const modularBobDb = bobDb as unknown as Parameters<typeof writeBatch>[0];

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'workspaces/coupleA'), {
        ...coupleWorkspacePayload('coupleA', 'alice'),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
      await setDoc(doc(adminDb, 'workspaces/coupleA/members/alice'), {
        ...coupleMemberPayload('coupleA', 'alice', 'owner'),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        joinedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
      await setDoc(doc(adminDb, 'coupleInvites/invite_expired'), {
        ...invitePayload('invite_expired', 'coupleA', 'alice', {
          expiresAt: Timestamp.fromDate(new Date('2026-06-13T12:00:00'))
        }),
        createdAt: Timestamp.fromDate(new Date('2026-06-12T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-12T12:00:00'))
      });
      await setDoc(doc(adminDb, 'coupleInvites/invite_revoked'), {
        ...invitePayload('invite_revoked', 'coupleA', 'alice', { status: 'revoked' }),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
    });

    for (const inviteId of ['invite_expired', 'invite_revoked']) {
      const batch = writeBatch(modularBobDb);
      batch.update(doc(modularBobDb, 'workspaces/coupleA'), {
        partnerUserId: 'bob',
        activeMemberCount: 2,
        updatedAt: serverTimestamp()
      });
      batch.update(doc(modularBobDb, 'coupleInvites', inviteId), {
        status: 'accepted',
        usedBy: 'bob',
        usedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      batch.set(doc(modularBobDb, 'workspaces/coupleA/members/bob'), coupleMemberPayload('coupleA', 'bob', 'partner', { acceptedInviteId: inviteId }));
      batch.set(doc(modularBobDb, 'users/bob/workspaceRefs/coupleA'), workspaceRefPayload('coupleA', 'partner'));

      await assertFails(batch.commit());
    }
  });

  it('blocks a third active member from joining a couple workspace', async () => {
    const charlieDb = testEnv.authenticatedContext('charlie').firestore();
    const modularCharlieDb = charlieDb as unknown as Parameters<typeof writeBatch>[0];
    const inviteId = 'invite_' + 'b'.repeat(32);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'workspaces/coupleA'), {
        ...coupleWorkspacePayload('coupleA', 'alice', { partnerUserId: 'bob', activeMemberCount: 2 }),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
      await setDoc(doc(adminDb, 'workspaces/coupleA/members/alice'), {
        ...coupleMemberPayload('coupleA', 'alice', 'owner'),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        joinedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
      await setDoc(doc(adminDb, 'workspaces/coupleA/members/bob'), {
        ...coupleMemberPayload('coupleA', 'bob', 'partner', { acceptedInviteId: 'invite_old' }),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        joinedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
      await setDoc(doc(adminDb, 'coupleInvites', inviteId), {
        ...invitePayload(inviteId, 'coupleA', 'alice'),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
    });

    const batch = writeBatch(modularCharlieDb);
    batch.update(doc(modularCharlieDb, 'workspaces/coupleA'), {
      partnerUserId: 'charlie',
      activeMemberCount: 2,
      updatedAt: serverTimestamp()
    });
    batch.update(doc(modularCharlieDb, 'coupleInvites', inviteId), {
      status: 'accepted',
      usedBy: 'charlie',
      usedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    batch.set(doc(modularCharlieDb, 'workspaces/coupleA/members/charlie'), coupleMemberPayload('coupleA', 'charlie', 'partner', { acceptedInviteId: inviteId }));
    batch.set(doc(modularCharlieDb, 'users/charlie/workspaceRefs/coupleA'), workspaceRefPayload('coupleA', 'partner'));

    await assertFails(batch.commit());
  });

  it('keeps personal financial data private between couple members', async () => {
    const bobDb = testEnv.authenticatedContext('bob').firestore();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'workspaces/coupleA'), {
        ...coupleWorkspacePayload('coupleA', 'alice', { partnerUserId: 'bob', activeMemberCount: 2 }),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
      await setDoc(doc(adminDb, 'workspaces/coupleA/members/alice'), {
        ...coupleMemberPayload('coupleA', 'alice', 'owner'),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        joinedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
      await setDoc(doc(adminDb, 'workspaces/coupleA/members/bob'), {
        ...coupleMemberPayload('coupleA', 'bob', 'partner', { acceptedInviteId: 'invite_old' }),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        joinedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
      await setDoc(doc(adminDb, 'workspaces/workspaceA/accounts/accountPrivate'), {
        ...accountPayload('workspaceA', 'accountPrivate', 'alice'),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
      await setDoc(doc(adminDb, 'workspaces/workspaceA/cards/cardPrivate'), {
        ...cardPayload('workspaceA', 'cardPrivate', 'alice'),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
    });

    await assertSucceeds(getDoc(doc(bobDb, 'workspaces/coupleA')));
    await assertFails(getDoc(doc(bobDb, 'workspaces/workspaceA/accounts/accountPrivate')));
    await assertFails(getDoc(doc(bobDb, 'workspaces/workspaceA/cards/cardPrivate')));
  });

  it('allows summary-only shared claims and blocks personal source references', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'workspaces/coupleA'), {
        ...coupleWorkspacePayload('coupleA', 'alice', { partnerUserId: 'bob', activeMemberCount: 2 }),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
      await setDoc(doc(adminDb, 'workspaces/coupleA/members/alice'), {
        ...coupleMemberPayload('coupleA', 'alice', 'owner'),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        joinedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
      await setDoc(doc(adminDb, 'workspaces/coupleA/members/bob'), {
        ...coupleMemberPayload('coupleA', 'bob', 'partner', { acceptedInviteId: 'invite_old' }),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        joinedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
    });

    await assertSucceeds(
      setDoc(doc(aliceDb, 'workspaces/coupleA/sharedExpenseClaims/claimA'), sharedClaimPayload('coupleA', 'claimA', 'alice'))
    );
    await assertFails(
      setDoc(
        doc(aliceDb, 'workspaces/coupleA/sharedExpenseClaims/claimLeak'),
        sharedClaimPayload('coupleA', 'claimLeak', 'alice', { sourcePersonalTransactionId: 'txn_private' })
      )
    );
  });

  it('allows settlements to progress without duplicated client mutation ids', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'workspaces/coupleA'), {
        ...coupleWorkspacePayload('coupleA', 'alice', { partnerUserId: 'bob', activeMemberCount: 2 }),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
      await setDoc(doc(adminDb, 'workspaces/coupleA/members/alice'), {
        ...coupleMemberPayload('coupleA', 'alice', 'owner'),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        joinedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
      await setDoc(doc(adminDb, 'workspaces/coupleA/members/bob'), {
        ...coupleMemberPayload('coupleA', 'bob', 'partner', { acceptedInviteId: 'invite_old' }),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        joinedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
    });

    await assertSucceeds(
      setDoc(doc(aliceDb, 'workspaces/coupleA/settlements/settlementA'), settlementPayload('coupleA', 'settlementA', 'alice'))
    );
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'workspaces/coupleA/settlements/settlementA'), {
        status: 'partially_paid',
        paidAmountCents: 2500,
        version: 2,
        updatedAt: serverTimestamp()
      })
    );
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'workspaces/coupleA/settlements/settlementA'), {
        status: 'settled',
        paidAmountCents: 5000,
        version: 3,
        updatedAt: serverTimestamp()
      })
    );
  });

  it('blocks frontend attempts to alter couple membership roles directly', async () => {
    const bobDb = testEnv.authenticatedContext('bob').firestore();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'workspaces/coupleA'), {
        ...coupleWorkspacePayload('coupleA', 'alice', { partnerUserId: 'bob', activeMemberCount: 2 }),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
      await setDoc(doc(adminDb, 'workspaces/coupleA/members/bob'), {
        ...coupleMemberPayload('coupleA', 'bob', 'partner', { acceptedInviteId: 'invite_old' }),
        createdAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        updatedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00')),
        joinedAt: Timestamp.fromDate(new Date('2026-06-14T12:00:00'))
      });
    });

    await assertFails(updateDoc(doc(bobDb, 'workspaces/coupleA/members/bob'), { role: 'owner', updatedAt: serverTimestamp() }));
  });
});
