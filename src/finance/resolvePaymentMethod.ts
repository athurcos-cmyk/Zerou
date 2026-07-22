export interface PaymentMethodOverride {
  accountId?: string;
  cardId?: string;
}

/**
 * Decide qual forma de pagamento vale entre uma escolha pontual (`opts`, ex.: override no
 * sheet de pagamento) e o padrão gravado na entidade (`fallback`, ex.: `bill.accountId`/
 * `bill.cardId`). `opts` é tratado como UM método completo: se ela definir `accountId` OU
 * `cardId`, essa escolha vence inteira (não mistura campo a campo com o fallback — senão
 * escolher pagar no banco desta vez, quando a entidade tem um cartão salvo como padrão,
 * seria ignorado). Só quando `opts` não define nada é que o método salvo na entidade entra,
 * preferindo `cardId` se os dois existirem lá (não deveria acontecer — mutuamente exclusivos
 * por `firestore.rules` — mas cartão vence em caso de dado inconsistente).
 *
 * Existia uma inconsistência entre `payBill` (usava `??`) e `recordRecurringPayment`
 * (usava `||`, catalogado em `docs/planning/TODOS.md`) — esta função unifica as duas, e
 * evita duplicar a lógica de resolução ao adicionar `cardId`.
 */
export function resolvePaymentMethod(
  opts: PaymentMethodOverride,
  fallback: PaymentMethodOverride
): PaymentMethodOverride {
  if (opts.cardId !== undefined) return { cardId: opts.cardId };
  if (opts.accountId !== undefined) return { accountId: opts.accountId };
  if (fallback.cardId !== undefined) return { cardId: fallback.cardId };
  return { accountId: fallback.accountId };
}
