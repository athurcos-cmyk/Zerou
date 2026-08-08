import { beforeEach, describe, expect, it } from 'vitest';
import { purgeLegacyFirestoreTabMarkers } from './legacyStorageCleanup';

describe('purgeLegacyFirestoreTabMarkers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('apaga as marcações multi-aba herdadas do persistentMultipleTabManager', () => {
    window.localStorage.setItem('firestore_clients_zerou-26757_(default)', '{"a":1}');
    window.localStorage.setItem('firestore_targets_zerou-26757_(default)', '{"b":2}');
    window.localStorage.setItem('firestore_mutations_zerou-26757_(default)_uid', '{"c":3}');

    expect(purgeLegacyFirestoreTabMarkers()).toBe(3);
    expect(Object.keys(window.localStorage).filter((k) => k.startsWith('firestore_'))).toEqual([]);
  });

  it('não encosta nas preferências do app nem em chave de outro dono', () => {
    window.localStorage.setItem('zerou.themeId', 'noturno');
    window.localStorage.setItem('zerou.pushToken.v1', 'token');
    window.localStorage.setItem('firebase:authUser:xyz', 'sessao');
    window.localStorage.setItem('firestore_clients_x', 'lixo');

    purgeLegacyFirestoreTabMarkers();

    expect(window.localStorage.getItem('zerou.themeId')).toBe('noturno');
    expect(window.localStorage.getItem('zerou.pushToken.v1')).toBe('token');
    // A sessão do Firebase Auth NÃO usa o prefixo firestore_ — apagar aqui deslogaria a pessoa.
    expect(window.localStorage.getItem('firebase:authUser:xyz')).toBe('sessao');
    expect(window.localStorage.getItem('firestore_clients_x')).toBeNull();
  });

  it('é no-op silencioso quando não há nada herdado', () => {
    window.localStorage.setItem('zerou.themeId', 'paper');

    expect(purgeLegacyFirestoreTabMarkers()).toBe(0);
    expect(window.localStorage.getItem('zerou.themeId')).toBe('paper');
  });
});
