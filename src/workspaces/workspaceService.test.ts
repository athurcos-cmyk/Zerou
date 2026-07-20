import { describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';

// getFirebaseDb é mockado pra explodir: os testes abaixo exercitam só a GUARDA de
// sessão viva, que roda ANTES de qualquer acesso ao Firestore. Se a guarda deixar
// passar, o teste falha ao bater no Firestore — exatamente o que queremos travar.
vi.mock('../firebase/config', () => ({
  getFirebaseAuth: vi.fn(),
  getFirebaseDb: vi.fn(() => {
    throw new Error('não deveria alcançar o Firestore quando a sessão não é válida');
  })
}));

import { getFirebaseAuth } from '../firebase/config';
import { ensurePersonalFoundation } from './workspaceService';

const baseInput = {
  name: 'Fulano de Tal',
  termsVersion: 'test-v1',
  appearance: {} as never
};

describe('ensurePersonalFoundation — guarda contra sessão-zumbi (dados órfãos)', () => {
  it('recusa criar o espaço quando não há usuário Auth vivo (conta deletada / sessão expirada)', async () => {
    vi.mocked(getFirebaseAuth).mockReturnValue({ currentUser: null } as never);

    await expect(
      ensurePersonalFoundation({ user: { uid: 'zombie' } as User, ...baseInput })
    ).rejects.toThrow('Sua sessão expirou');
  });

  it('recusa criar o espaço quando o uid da sessão viva não bate com o uid do onboarding', async () => {
    vi.mocked(getFirebaseAuth).mockReturnValue({ currentUser: { uid: 'outro-uid' } } as never);

    await expect(
      ensurePersonalFoundation({ user: { uid: 'zombie' } as User, ...baseInput })
    ).rejects.toThrow('Sua sessão expirou');
  });
});
