/**
 * Dispara uma escrita do Firestore sem bloquear a UI (offline-first).
 *
 * A persistência (`persistentLocalCache`) grava no cache imediatamente e o `onSnapshot`
 * reflete o resultado na hora (com badge de pendente); quando reconecta, sincroniza.
 * Se o servidor rejeitar, o listener reverte o estado otimista. Erros de rede/escrita
 * são silenciados de propósito — não expomos mensagem técnica ao usuário.
 *
 * Em DESENVOLVIMENTO, porém, esse silêncio já escondeu dois bugs graves por semanas:
 * `createCategory` ganhou o campo `createdBy` e `InvoiceLedgerEntryType` ganhou o valor
 * `installment_anticipation_credit`, ambos sem atualizar `firestore.rules` — o servidor
 * rejeitava com PERMISSION_DENIED, a UI mostrava sucesso (cache local), e o dado só
 * sumia ao recarregar a página. Logar no console em dev transforma essa falha invisível
 * num erro visível na hora, sem mudar nada do comportamento de produção.
 *
 * Importante: validações síncronas (ex: `schema.parse`) devem rodar ANTES de chamar
 * `fireWrite`, para que erros de validação ainda cheguem ao chamador.
 */
export function fireWrite(op: Promise<unknown>) {
  void op.catch((error: unknown) => {
    if (import.meta.env.DEV) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'unknown';
      console.error(
        `[fireWrite] escrita rejeitada (${code}). Em permission-denied, confira se firestore.rules aceita este payload.`,
        error
      );
    }
  });
}
