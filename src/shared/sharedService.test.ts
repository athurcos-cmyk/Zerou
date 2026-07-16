import { describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  doc: vi.fn().mockReturnValue({ id: 'doc-ref' }),
  serverTimestamp: vi.fn().mockReturnValue('server-timestamp'),
  batchUpdate: vi.fn(),
  batchSet: vi.fn(),
  batchCommit: vi.fn()
}));

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: firestoreMocks.doc,
  getDoc: firestoreMocks.getDoc,
  serverTimestamp: firestoreMocks.serverTimestamp,
  writeBatch: () => ({
    update: firestoreMocks.batchUpdate,
    set: firestoreMocks.batchSet,
    commit: firestoreMocks.batchCommit
  })
}));

vi.mock('../firebase/config', () => ({
  getFirebaseDb: vi.fn().mockReturnValue({})
}));

vi.mock('../billing/billingService', () => ({
  getBillingEntitlementsForUser: vi.fn()
}));

const { acceptSettlement } = await import('./sharedService');

describe('acceptSettlement', () => {
  it('resolve mesmo se o batch.commit() rejeitar — escrita e fire-and-forget (fireWrite), erro nao trava o caller', async () => {
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ version: 1, amountCents: 1000, paidAmountCents: 0, status: 'proposed' })
    });
    const rejection = Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
    firestoreMocks.batchCommit.mockRejectedValue(rejection);

    await expect(acceptSettlement('ws-1', 'user-1', 'settlement-1')).resolves.toBeUndefined();
  });

  it('resolve normalmente quando o batch.commit() dá certo', async () => {
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ version: 1, amountCents: 1000, paidAmountCents: 0, status: 'proposed' })
    });
    firestoreMocks.batchCommit.mockResolvedValue(undefined);

    await expect(acceptSettlement('ws-1', 'user-1', 'settlement-1')).resolves.toBeUndefined();
  });
});
