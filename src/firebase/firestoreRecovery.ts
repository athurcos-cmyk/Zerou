const RECOVERY_ATTEMPTED_KEY = 'zerou.firestoreRecoveryAttempted';

/**
 * "FIRESTORE (x.y.z) INTERNAL ASSERTION FAILED: Unexpected state" é o SDK do Firestore
 * detectando que seu próprio estado de persistência local ficou inconsistente (bug conhecido
 * do firebase-js-sdk, ver issue 8305 no GitHub) — não é um erro de dado do usuário, é a
 * "gaveta" local corrompida. Reconhecido aqui pra acionar recuperação automática em vez de
 * mostrar o erro técnico cru pro usuário.
 */
export function isFirestoreInternalCorruption(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes('FIRESTORE') &&
    error.message.includes('INTERNAL ASSERTION FAILED')
  );
}

export function hasAttemptedFirestoreRecovery() {
  try {
    return sessionStorage.getItem(RECOVERY_ATTEMPTED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Limpa a persistência local do Firestore (IndexedDB + as chaves de coordenação multi-aba no
 * localStorage) e recarrega — o mesmo efeito de "limpar dados do site", só que automático. Só
 * apaga cache; os dados de verdade vivem no servidor e voltam a sincronizar no próximo boot.
 * Marca uma flag na sessão pra nunca entrar em loop se o erro persistir (não é auto-recuperável).
 */
export async function recoverFromCorruptedFirestorePersistence() {
  try {
    sessionStorage.setItem(RECOVERY_ATTEMPTED_KEY, '1');
  } catch {
    // sessionStorage indisponível — segue tentando limpar mesmo assim.
  }

  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('firestore_'))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // localStorage indisponível — nada a limpar.
  }

  try {
    const dbs = await indexedDB.databases();
    await Promise.all(
      dbs
        .filter((db) => db.name?.startsWith('firestore/'))
        .map(
          (db) =>
            new Promise<void>((resolve) => {
              const request = indexedDB.deleteDatabase(db.name!);
              request.onsuccess = () => resolve();
              request.onerror = () => resolve();
              request.onblocked = () => resolve();
            })
        )
    );
  } catch {
    // indexedDB.databases() não suportado ou indisponível — nada a limpar.
  }
}
