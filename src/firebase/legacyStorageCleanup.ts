const LEGACY_PREFIX = 'firestore_';

/**
 * Apaga as marcações de coordenação multi-aba que o Firestore deixou no `localStorage`.
 *
 * Até 24/07/2026 este app usava `persistentMultipleTabManager`, que grava `firestore_clients_*`,
 * `firestore_targets_*` e afins pra coordenar abas. Essas chaves só se limpam sozinhas num
 * fechamento de aba limpo (`beforeunload`) — evento que um PWA no celular quase nunca dispara,
 * porque o sistema simplesmente mata o app. Sessão após sessão elas acumulam até estourar a quota
 * do `localStorage`; a partir daí as próprias escritas de coordenação do SDK falham e o Firestore
 * derruba tudo com "INTERNAL ASSERTION FAILED: Unexpected state".
 *
 * A troca pra `persistentSingleTabManager` (ver `config.ts`) parou de CRIAR chaves novas, mas não
 * apagou nenhuma das já acumuladas — e nenhum outro caminho do app apaga (`clearAccountLocalCaches`
 * só mexe em `zerou.*`). Quem instalou o PWA antes daquela data continuava carregando o lixo, e a
 * recuperação automática não salvava porque o erro é assíncrono e nenhum error boundary do React
 * alcança erro assíncrono. Confirmado ao vivo em 07/08/2026: o PWA instalado abria em tela BRANCA
 * enquanto uma aba anônima (localStorage vazio) do mesmo aparelho abria normal.
 *
 * Sob single-tab essas chaves não têm leitor nenhum — são lixo puro. O cache offline de verdade
 * mora no IndexedDB e não é tocado aqui.
 *
 * Roda ANTES do `initializeApp`, quando nada ainda pode estar usando o storage.
 */
export function purgeLegacyFirestoreTabMarkers() {
  try {
    const legacyKeys = Object.keys(window.localStorage).filter((key) => key.startsWith(LEGACY_PREFIX));
    legacyKeys.forEach((key) => window.localStorage.removeItem(key));
    return legacyKeys.length;
  } catch {
    // localStorage indisponível (modo privado, storage bloqueado) — nada a limpar.
    return 0;
  }
}
