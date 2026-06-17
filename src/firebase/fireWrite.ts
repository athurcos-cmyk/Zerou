/**
 * Dispara uma escrita do Firestore sem bloquear a UI (offline-first).
 *
 * A persistência (`persistentLocalCache`) grava no cache imediatamente e o `onSnapshot`
 * reflete o resultado na hora (com badge de pendente); quando reconecta, sincroniza.
 * Se o servidor rejeitar, o listener reverte o estado otimista. Erros de rede/escrita
 * são silenciados de propósito — não expomos mensagem técnica ao usuário.
 *
 * Importante: validações síncronas (ex: `schema.parse`) devem rodar ANTES de chamar
 * `fireWrite`, para que erros de validação ainda cheguem ao chamador.
 */
export function fireWrite(op: Promise<unknown>) {
  void op.catch(() => undefined);
}
