import { describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';

// Mock firebase-admin/firestore
const mockDocGet = vi.fn();
const mockDoc = vi.fn(() => ({ get: mockDocGet }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    doc: mockDoc,
  })),
  FieldValue: { serverTimestamp: vi.fn(), increment: vi.fn((n: number) => n) },
  Timestamp: { fromDate: vi.fn(), now: vi.fn() },
}));

// We import after mocking so the module uses the mocked firebase-admin.
// verifyWorkspaceMembership doesn't import firebase-admin directly though —
// it takes `db` as a parameter. So we can test it with a plain mock object
// without needing the module mock at all.

import { verifyWorkspaceMembership } from './verifyWorkspaceMembership.js';

function mockDb(docData: Record<string, unknown> | null, exists: boolean) {
  return {
    doc: () => ({
      get: async () => ({
        exists,
        data: () => docData,
      }),
    }),
  } as unknown as ReturnType<typeof import('firebase-admin/firestore').getFirestore>;
}

describe('verifyWorkspaceMembership', () => {
  it('resolves when the member doc exists with status active', async () => {
    const db = mockDb({ status: 'active' }, true);
    await expect(verifyWorkspaceMembership(db, 'ws1', 'user1')).resolves.toBeUndefined();
  });

  it('throws permission-denied when the member doc does not exist', async () => {
    const db = mockDb(null, false);
    await expect(verifyWorkspaceMembership(db, 'ws1', 'user1')).rejects.toThrow(HttpsError);
  });

  it('throws permission-denied when member status is not active', async () => {
    const db = mockDb({ status: 'removed' }, true);
    await expect(verifyWorkspaceMembership(db, 'ws1', 'user1')).rejects.toThrow(HttpsError);
  });

  it('throws permission-denied when member data is null', async () => {
    const db = mockDb(null, true);
    await expect(verifyWorkspaceMembership(db, 'ws1', 'user1')).rejects.toThrow(HttpsError);
  });
});
