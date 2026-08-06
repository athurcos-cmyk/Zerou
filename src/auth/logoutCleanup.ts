// Chaves de localStorage com escopo de CONTA — dados financeiros, identidade de push,
// estado de UI por conta. Sumir de um logout não quebra nada: são todas caches de
// exibição recriadas do zero no próximo login — a fonte real é o Firestore.
const ACCOUNT_SCOPED_KEYS = [
  'zerou.pushToken.v1',
  // Legado: o banner de orçamento do Dashboard (quem escrevia esta chave) foi removido em
  // 06/08/2026. Nada mais grava aqui — a entrada FICA de propósito, pra limpar o aparelho de
  // quem já dispensou um alerta antes da remoção. Sem ela, a chave ficaria órfã pra sempre.
  'zerou.budgetAlertsDismissed.v1',
  'zerou.pendingInviteCode',
  'zerou.defaultCategoriesPrepared',
] as const;

// Prefixo por workspace (zerou.dashboardView.v2.<workspaceId> e .mini).
const ACCOUNT_SCOPED_PREFIXES = ['zerou.dashboardView.v2.'] as const;

/** Remove caches locais com escopo de conta. Preserva preferências de dispositivo
 * (tema, tours, PWA, cookie consent) e o profileCache (gerido por clearCachedProfiles).
 * Best-effort, nunca lança — localStorage pode estar indisponível em modo privado. */
export function clearAccountLocalCaches() {
  try {
    Object.keys(window.localStorage)
      .filter(
        (key) =>
          (ACCOUNT_SCOPED_KEYS as readonly string[]).includes(key) ||
          ACCOUNT_SCOPED_PREFIXES.some((prefix) => key.startsWith(prefix)),
      )
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // localStorage indisponível — nada a limpar.
  }
}
