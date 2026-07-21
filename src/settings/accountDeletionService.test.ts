import { describe, expect, it, vi } from 'vitest';
import { runAccountDeletion, type AccountDeletionDeps } from './accountDeletionService';

function makeDeps(overrides: Partial<AccountDeletionDeps> = {}): AccountDeletionDeps {
  return {
    hasGoogle: true,
    hasPassword: false,
    currentPassword: '',
    userEmail: '',
    userName: '',
    reauthenticateWithGoogle: vi.fn().mockResolvedValue(undefined),
    reauthenticateWithPassword: vi.fn().mockResolvedValue(undefined),
    sendGoodbyeEmail: vi.fn().mockResolvedValue(undefined),
    forceLogoutAllDevices: vi.fn().mockResolvedValue(undefined),
    deleteAccountData: vi.fn().mockResolvedValue(undefined),
    deleteAuthenticatedUser: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe('runAccountDeletion', () => {
  it('reauthenticates via Google, then deletes Firestore data, then deletes the Auth user, in that order', async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      reauthenticateWithGoogle: vi.fn(async () => { calls.push('reauth'); }),
      deleteAccountData: vi.fn(async () => { calls.push('data'); }),
      deleteAuthenticatedUser: vi.fn(async () => { calls.push('auth'); })
    });

    await runAccountDeletion(deps);

    expect(calls).toEqual(['reauth', 'data', 'auth']);
    expect(deps.logout).not.toHaveBeenCalled();
  });

  it('regression: sends the goodbye email BEFORE revoking tokens and BEFORE wiping data (bug: goodbye fired AFTER forceLogout revoked tokens and was fire-and-forget, so the auth-required onCall lost its session and the page reload aborted the in-flight request — the email never went out)', async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      userEmail: 'user@example.com',
      reauthenticateWithGoogle: vi.fn(async () => { calls.push('reauth'); }),
      sendGoodbyeEmail: vi.fn(async () => { calls.push('goodbye'); }),
      forceLogoutAllDevices: vi.fn(async () => { calls.push('forcelogout'); }),
      deleteAccountData: vi.fn(async () => { calls.push('data'); }),
      deleteAuthenticatedUser: vi.fn(async () => { calls.push('auth'); })
    });

    await runAccountDeletion(deps);

    expect(calls).toEqual(['reauth', 'goodbye', 'forcelogout', 'data', 'auth']);
  });

  it('skips the goodbye email when the account has no email on file', async () => {
    const deps = makeDeps({ userEmail: '' });

    await runAccountDeletion(deps);

    expect(deps.sendGoodbyeEmail).not.toHaveBeenCalled();
    expect(deps.deleteAccountData).toHaveBeenCalledTimes(1);
  });

  it('regression: never deletes Firestore data if reauthentication fails (bug: data was wiped before confirming a fresh session, so a requires-recent-login failure on the Auth delete left the account undeleted but all data gone)', async () => {
    const deps = makeDeps({
      reauthenticateWithGoogle: vi.fn().mockRejectedValue({ code: 'auth/requires-recent-login' })
    });

    await expect(runAccountDeletion(deps)).rejects.toMatchObject({ code: 'auth/requires-recent-login' });

    expect(deps.deleteAccountData).not.toHaveBeenCalled();
    expect(deps.deleteAuthenticatedUser).not.toHaveBeenCalled();
  });

  it('regression: forces logout if the Auth user deletion fails after Firestore data is already gone, instead of leaving a zombie session', async () => {
    const deps = makeDeps({
      deleteAuthenticatedUser: vi.fn().mockRejectedValue(new Error('network hiccup'))
    });

    await expect(runAccountDeletion(deps)).rejects.toThrow('network hiccup');

    expect(deps.deleteAccountData).toHaveBeenCalledTimes(1);
    expect(deps.logout).toHaveBeenCalledTimes(1);
  });

  it('uses password reauthentication when the account has no Google provider linked', async () => {
    const deps = makeDeps({
      hasGoogle: false,
      hasPassword: true,
      currentPassword: 'super-secret'
    });

    await runAccountDeletion(deps);

    expect(deps.reauthenticateWithPassword).toHaveBeenCalledWith('super-secret');
    expect(deps.reauthenticateWithGoogle).not.toHaveBeenCalled();
  });

  it('refuses to proceed (and never touches data) when password reauth is required but no password was typed', async () => {
    const deps = makeDeps({ hasGoogle: false, hasPassword: true, currentPassword: '' });

    await expect(runAccountDeletion(deps)).rejects.toThrow('Digite sua senha atual');

    expect(deps.reauthenticateWithPassword).not.toHaveBeenCalled();
    expect(deps.deleteAccountData).not.toHaveBeenCalled();
  });
});
