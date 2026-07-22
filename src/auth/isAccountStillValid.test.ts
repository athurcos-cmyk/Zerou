import { describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { isAccountStillValid } from './authService';

function userWhoseTokenRefresh(behaviour: 'succeeds' | { failsWith: string }): User {
  return {
    getIdToken: vi.fn(async () => {
      if (behaviour === 'succeeds') return 'token';
      throw Object.assign(new Error('refresh failed'), { code: behaviour.failsWith });
    })
  } as unknown as User;
}

describe('isAccountStillValid', () => {
  it('força a renovação do token (o token em memória sobrevive ~1h à exclusão, então checar sem forçar não provaria nada)', async () => {
    const user = userWhoseTokenRefresh('succeeds');

    await expect(isAccountStillValid(user)).resolves.toBe(true);
    expect(user.getIdToken).toHaveBeenCalledWith(true);
  });

  it('reconhece conta excluída (usuário não existe mais)', async () => {
    await expect(isAccountStillValid(userWhoseTokenRefresh({ failsWith: 'auth/user-not-found' }))).resolves.toBe(false);
  });

  it('reconhece sessão revogada', async () => {
    await expect(isAccountStillValid(userWhoseTokenRefresh({ failsWith: 'auth/user-token-expired' }))).resolves.toBe(false);
  });

  it('reconhece conta desativada', async () => {
    await expect(isAccountStillValid(userWhoseTokenRefresh({ failsWith: 'auth/user-disabled' }))).resolves.toBe(false);
  });

  // O falso positivo mais caro: deslogar (e mandar pro landing) alguém que só está sem rede
  // seria pior que o bug original. Offline NUNCA pode ser lido como "conta excluída".
  it('NÃO trata falha de rede como conta excluída', async () => {
    await expect(
      isAccountStillValid(userWhoseTokenRefresh({ failsWith: 'auth/network-request-failed' }))
    ).resolves.toBe(true);
  });
});
