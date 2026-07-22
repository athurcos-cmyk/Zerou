import { beforeEach, describe, expect, it, vi } from 'vitest';

// `createActiveMemberCheck` chama `getFirestore()` por dentro (as agendadas não recebem db),
// então o módulo precisa ser mockado. `readMembershipStatus` recebe `db` e é testada direto.
const mockGet = vi.fn();
const mockDoc = vi.fn(() => ({ get: mockGet }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({ doc: mockDoc })),
}));

import { createActiveMemberCheck, readMembershipStatus } from './activeMember.js';

type Db = Parameters<typeof readMembershipStatus>[0];

function fakeDb(snapshot: { exists: boolean; data?: () => Record<string, unknown> | undefined }) {
  return {
    doc: () => ({ get: async () => ({ data: () => undefined, ...snapshot }) }),
  } as unknown as Db;
}

describe('readMembershipStatus', () => {
  it('reconhece membro ativo', async () => {
    const db = fakeDb({ exists: true, data: () => ({ status: 'active' }) });
    await expect(readMembershipStatus(db, 'ws', 'user')).resolves.toBe('active');
  });

  // O callable da Vic mostra mensagens diferentes pra cada caso, por isso o status
  // é devolvido em vez de um booleano.
  it('distingue quem nunca foi membro de quem saiu/foi removido', async () => {
    await expect(readMembershipStatus(fakeDb({ exists: false }), 'ws', 'user')).resolves.toBe('not-member');
    await expect(
      readMembershipStatus(fakeDb({ exists: true, data: () => ({ status: 'removed' }) }), 'ws', 'user')
    ).resolves.toBe('inactive');
  });
});

describe('createActiveMemberCheck', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDoc.mockClear();
  });

  // Regressão do vazamento: `leavePartnerWorkspace` marca o membro como `removed` mas o
  // `createdBy` das contas continua apontando pra ele — sem esta checagem o ex-parceiro
  // seguia recebendo push com descrição e valor de um espaço que já não acessa.
  it('nega quem saiu do espaço do casal', async () => {
    mockGet.mockResolvedValue({ exists: true, data: () => ({ status: 'removed' }) });
    const isActiveMember = createActiveMemberCheck();

    await expect(isActiveMember('ws', 'ex-parceiro')).resolves.toBe(false);
  });

  // Guarda contra o erro oposto: o workspace pessoal TAMBÉM tem members/{uid} ativo, então
  // a checagem não pode desligar a notificação de quem usa o app sozinho.
  it('mantém quem usa o app sozinho (workspace pessoal também tem membro ativo)', async () => {
    mockGet.mockResolvedValue({ exists: true, data: () => ({ status: 'active' }) });
    const isActiveMember = createActiveMemberCheck();

    await expect(isActiveMember('personal_user', 'user')).resolves.toBe(true);
  });

  it('cacheia por execução — não relê o mesmo membro a cada item do loop', async () => {
    mockGet.mockResolvedValue({ exists: true, data: () => ({ status: 'active' }) });
    const isActiveMember = createActiveMemberCheck();

    await isActiveMember('ws', 'user');
    await isActiveMember('ws', 'user');
    await isActiveMember('ws', 'user');

    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('não gasta leitura quando falta workspace ou usuário', async () => {
    const isActiveMember = createActiveMemberCheck();

    await expect(isActiveMember(undefined, 'user')).resolves.toBe(false);
    await expect(isActiveMember('ws', undefined)).resolves.toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
