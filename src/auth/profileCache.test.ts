import { afterEach, describe, expect, it } from 'vitest';
import type { UserProfile } from '../types/contracts';
import { clearCachedProfiles, readCachedProfile, readLastCachedProfile, saveCachedProfile } from './profileCache';

function buildProfile(id: string): UserProfile {
  return {
    id,
    name: 'Ana Granativa',
    email: 'ana@Granativa.test',
    defaultWorkspaceId: `personal_${id}`,
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    themeMode: 'manual',
    themeId: 'paper',
    density: 'comfortable',
    fontScale: 'md',
    reduceMotion: false
  };
}

describe('profileCache', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('persiste e recupera o perfil pelo uid', () => {
    const profile = buildProfile('user-1');

    saveCachedProfile(profile);

    expect(readCachedProfile('user-1')).toEqual(profile);
    expect(readLastCachedProfile()).toEqual(profile);
    expect(readCachedProfile('user-2')).toBeNull();
  });

  it('mantem o ultimo perfil salvo para fallback de boot', () => {
    const firstProfile = buildProfile('user-1');
    const secondProfile = buildProfile('user-2');

    saveCachedProfile(firstProfile);
    saveCachedProfile(secondProfile);

    expect(readLastCachedProfile()).toEqual(secondProfile);
  });

  it('ignora cache corrompido sem quebrar o boot', () => {
    window.localStorage.setItem('Granativa.auth.profileCache.v1', '{');

    expect(readCachedProfile('user-1')).toBeNull();
  });

  it('limpa o cache local quando solicitado', () => {
    saveCachedProfile(buildProfile('user-1'));

    clearCachedProfiles();

    expect(readCachedProfile('user-1')).toBeNull();
  });
});
