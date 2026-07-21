import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanupAbandonedCouples, cleanupGhostCouples, cleanupOldWhatsAppMessages } from './cleanup.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fakeTimestamp() {
  return { toDate: () => new Date() } as unknown as FirebaseFirestore.Timestamp;
}

function fakeDoc(id: string, data: Record<string, unknown>) {
  return {
    id,
    ref: { path: `workspaces/${id}` },
    data: () => data,
  };
}

function fakeUserDoc(exists: boolean) {
  return { exists, data: () => (exists ? { name: 'Test' } : undefined) };
}

function mockDb(overrides: {
  couples?: ReturnType<typeof fakeDoc>[];
  users?: Record<string, ReturnType<typeof fakeUserDoc>>;
  messages?: ReturnType<typeof fakeDoc>[];
  failCollection?: string;
  failDoc?: string;
  failRecursiveDelete?: boolean;
} = {}) {
  const batch = {
    _deleted: [] as string[],
    delete: vi.fn((ref: { path: string }) => { batch._deleted.push(ref.path); }),
    commit: vi.fn().mockResolvedValue(undefined),
  };

  return {
    collection: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation(() => {
              if (overrides.failCollection === 'couples') {
                return Promise.reject(new Error('Network error'));
              }
              return Promise.resolve({ docs: overrides.couples ?? [], size: (overrides.couples ?? []).length, empty: (overrides.couples ?? []).length === 0 });
            }),
          }),
          get: vi.fn().mockImplementation(() => {
            if (overrides.failCollection === 'couples') {
              return Promise.reject(new Error('Network error'));
            }
            return Promise.resolve({ docs: overrides.couples ?? [], size: (overrides.couples ?? []).length, empty: (overrides.couples ?? []).length === 0 });
          }),
        }),
        get: vi.fn().mockImplementation(() => {
          if (overrides.failCollection === 'messages') {
            return Promise.reject(new Error('Network error'));
          }
          return Promise.resolve({ docs: overrides.messages ?? [], size: (overrides.messages ?? []).length, empty: (overrides.messages ?? []).length === 0 });
        }),
      }),
    }),
    doc: vi.fn().mockImplementation((path: string) => ({
      get: vi.fn().mockImplementation(() => {
        if (overrides.failDoc) {
          return Promise.reject(new Error('Document read error'));
        }
        // Extrai o uid do path "users/{uid}"
        const uid = path.startsWith('users/') ? path.split('/')[1] : null;
        const userDoc = uid ? overrides.users?.[uid] : undefined;
        return Promise.resolve(userDoc ?? fakeUserDoc(false));
      }),
    })),
    recursiveDelete: vi.fn().mockImplementation(() => {
      if (overrides.failRecursiveDelete) return Promise.reject(new Error('Delete failed'));
      return Promise.resolve();
    }),
    batch: vi.fn(() => batch),
  };
}

// ─── Tests: cleanupAbandonedCouples ─────────────────────────────────────────────

describe('cleanupAbandonedCouples', () => {
  it('deve retornar 0 quando não há couples abandonados', async () => {
    const db = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ docs: [], size: 0, empty: true }),
            }),
          }),
        }),
      }),
      recursiveDelete: vi.fn(),
    };
    const result = await cleanupAbandonedCouples(db as any, new Date());
    expect(result).toBe(0);
  });

  it('deve deletar couple com activeMemberCount=1 e sem partnerUserId', async () => {
    const db = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                docs: [fakeDoc('couple_1', { partnerUserId: '', activeMemberCount: 1 })],
                size: 1, empty: false,
              }),
            }),
          }),
        }),
      }),
      recursiveDelete: vi.fn().mockResolvedValue(undefined),
    };
    const result = await cleanupAbandonedCouples(db as any, new Date(2026, 6, 20));
    expect(result).toBe(1);
    expect(db.recursiveDelete).toHaveBeenCalledTimes(1);
  });

  it('deve pular couple com partnerUserId preenchido', async () => {
    const db = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                docs: [fakeDoc('couple_1', { partnerUserId: 'uid_partner', activeMemberCount: 1 })],
                size: 1, empty: false,
              }),
            }),
          }),
        }),
      }),
      recursiveDelete: vi.fn(),
    };
    const result = await cleanupAbandonedCouples(db as any, new Date(2026, 6, 20));
    expect(result).toBe(0);
    expect(db.recursiveDelete).not.toHaveBeenCalled();
  });

  it('não deve propagar erro de query', async () => {
    const db = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockRejectedValue(new Error('Network error')),
            }),
          }),
        }),
      }),
      recursiveDelete: vi.fn(),
    };
    const result = await cleanupAbandonedCouples(db as any, new Date());
    expect(result).toBe(0);
  });

  it('deve continuar deletando após erro em recursiveDelete', async () => {
    const recursiveDelete = vi.fn()
      .mockRejectedValueOnce(new Error('Delete failed'))
      .mockResolvedValueOnce(undefined);

    const db = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                docs: [
                  fakeDoc('couple_1', { partnerUserId: '', activeMemberCount: 1 }),
                  fakeDoc('couple_2', { partnerUserId: '', activeMemberCount: 1 }),
                ],
                size: 2, empty: false,
              }),
            }),
          }),
        }),
      }),
      recursiveDelete,
    };
    const result = await cleanupAbandonedCouples(db as any, new Date(2026, 6, 20));
    expect(result).toBe(1);
  });
});

// ─── Tests: cleanupGhostCouples ─────────────────────────────────────────────────

describe('cleanupGhostCouples', () => {
  it('deve deletar workspace quando owner não existe em users/', async () => {
    const db = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            docs: [fakeDoc('couple_ghost', { ownerUserId: 'uid_ghost' })],
            size: 1,
            empty: false,
          }),
        }),
      }),
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
      }),
      recursiveDelete: vi.fn().mockResolvedValue(undefined),
    };

    const result = await cleanupGhostCouples(db as any);
    expect(result).toBe(1);
    expect(db.recursiveDelete).toHaveBeenCalledTimes(1);
  });

  it('deve preservar workspace quando owner existe em users/', async () => {
    const db = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            docs: [fakeDoc('couple_ok', { ownerUserId: 'uid_ok' })],
            size: 1,
            empty: false,
          }),
        }),
      }),
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ name: 'Test' }) }),
      }),
      recursiveDelete: vi.fn().mockResolvedValue(undefined),
    };

    const result = await cleanupGhostCouples(db as any);
    expect(result).toBe(0);
    expect(db.recursiveDelete).not.toHaveBeenCalled();
  });

  it('deve pular documento sem ownerUserId', async () => {
    const db = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            docs: [fakeDoc('couple_no_owner', { ownerUserId: '' })],
            size: 1,
            empty: false,
          }),
        }),
      }),
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
      }),
      recursiveDelete: vi.fn().mockResolvedValue(undefined),
    };

    const result = await cleanupGhostCouples(db as any);
    expect(result).toBe(0);
  });

  it('deve isolar erro de leitura de um documento — não aborta os outros', async () => {
    let callCount = 0;
    const db = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            docs: [
              fakeDoc('couple_1', { ownerUserId: 'uid_1' }),
              fakeDoc('couple_2', { ownerUserId: 'uid_2' }),
              fakeDoc('couple_3', { ownerUserId: 'uid_3' }),
            ],
            size: 3,
            empty: false,
          }),
        }),
      }),
      doc: vi.fn().mockImplementation((path: string) => {
        callCount++;
        if (path === 'users/uid_2') {
          return { get: vi.fn().mockRejectedValue(new Error('Network error')) };
        }
        const uid = path.split('/')[1];
        const exists = uid === 'uid_4'; // uid_1 e uid_3 são ghosts (owners não existem)
        return { get: vi.fn().mockResolvedValue({ exists, data: () => exists ? {} : undefined }) };
      }),
      recursiveDelete: vi.fn().mockResolvedValue(undefined),
    };

    const result = await cleanupGhostCouples(db as any);
    expect(result).toBe(2);
  });

  it('não deve propagar erro de query', async () => {
    const db = mockDb({ failCollection: 'couples' });
    const result = await cleanupGhostCouples(db as any);
    expect(result).toBe(0);
  });
});

// ─── Tests: cleanupOldWhatsAppMessages ──────────────────────────────────────────

describe('cleanupOldWhatsAppMessages', () => {
  it('deve retornar 0 quando não há mensagens antigas', async () => {
    const db = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ docs: [], size: 0, empty: true }),
        }),
      }),
      batch: vi.fn(() => ({
        delete: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      })),
    };
    const result = await cleanupOldWhatsAppMessages(db as any, new Date());
    expect(result).toBe(0);
  });

  it('deve deletar mensagens em lotes de 400', async () => {
    const messages = Array.from({ length: 850 }, (_, i) =>
      fakeDoc(`msg_${i}`, { processedAt: fakeTimestamp() })
    );
    const db = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ docs: messages, size: 850, empty: false }),
        }),
      }),
      batch: vi.fn(() => ({
        delete: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      })),
    };
    const result = await cleanupOldWhatsAppMessages(db as any, new Date());
    expect(result).toBe(850);
  });

  it('não deve propagar erro de query', async () => {
    const db = {
      collection: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockRejectedValue(new Error('Network error')),
        }),
      }),
      batch: vi.fn(),
    };
    const result = await cleanupOldWhatsAppMessages(db as any, new Date());
    expect(result).toBe(0);
  });
});
