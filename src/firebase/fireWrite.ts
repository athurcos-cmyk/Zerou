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
  // Pilha capturada AQUI, na chamada — o stack do `FirebaseError` que chega no `catch` é o da
  // camada de transporte do SDK e não diz quem tentou escrever. Sem isso, o log dizia "escrita
  // rejeitada" e a pessoa tinha que adivinhar entre as ~40 chamadas de `fireWrite` do app (em
  // 07/08/2026 gastei uma investigação inteira olhando o lugar errado por causa disso). Só em
  // DEV: criar um `Error` por escrita não vai pra produção.
  const callSite = import.meta.env.DEV ? new Error().stack : undefined;

  void op.catch((error: unknown) => {
    if (import.meta.env.DEV) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'unknown';
      const origem = callSite
        ?.split('\n')
        .slice(2, 6)
        .map((line) => line.trim())
        .join(' <- ');
      console.error(
        `[fireWrite] escrita rejeitada (${code}). Em permission-denied, confira se firestore.rules aceita este payload.` +
          (origem ? `\n  chamada em: ${origem}` : ''),
        error
      );
    }
  });
}
