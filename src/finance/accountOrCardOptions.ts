import type { Account, CreditCard } from '../types/contracts';

export const CARD_PREFIX = 'card:';

export interface AccountOrCardOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * Mescla contas bancárias e cartões ativos num só grupo de opções, prefixando cartões
 * com `card:` pra diferenciar num único campo de seleção — mesmo padrão já usado em
 * `NewTransactionPage.tsx` antes desta extração, agora compartilhado com `BillsPage.tsx`
 * (form de criar conta/recorrência, sheets de editar e de pagamento). Retorna os dois
 * grupos separados (não já mesclados) pra cada caller decidir a ordem/quando incluir
 * cartões (ex.: só faz sentido pra despesa, não pra receita).
 */
export function buildAccountOrCardOptions(
  accounts: Account[],
  cards: CreditCard[]
): { accountOptions: AccountOrCardOption[]; cardOptions: AccountOrCardOption[] } {
  const accountOptions = accounts.map((account) => ({ value: account.id, label: account.name }));

  const cardOptions = cards
    .filter((card) => card.isActive !== false)
    .map((card) => ({ value: `${CARD_PREFIX}${card.id}`, label: card.name, description: `Cartão · ${card.brand}` }));

  return { accountOptions, cardOptions };
}

/** Separa o valor de um SelectField/chip mesclado de volta em `accountId` ou `cardId`
 * (nunca os dois — `''` vira `undefined` nos dois, pra combinar com `resolvePaymentMethod`). */
export function parseAccountOrCard(value: string): { accountId?: string; cardId?: string } {
  if (!value) return { accountId: undefined, cardId: undefined };
  if (value.startsWith(CARD_PREFIX)) return { cardId: value.slice(CARD_PREFIX.length) };
  return { accountId: value };
}

/**
 * Teto de parcelas de uma COMPRA no cartão — 48x desde 07/08/2026 (pedido do dono: carro, móvel).
 * `firestore.rules` já aceitava até 72 em `installments` da transação e do ledger, então subir
 * daqui não precisou de deploy de regra. Espelha `createCardPurchaseSchema`.
 */
export const MAX_CARD_PURCHASE_INSTALLMENTS = 48;

/**
 * Teto de parcelas de uma CONTA A PAGAR paga no cartão — segue em 24.
 *
 * ⚠️ Não subir sem deploy: aqui o limite está na **regra** (`validBillInstallments`,
 * `firestore.rules`), e não no schema do cliente. Subir só este número faria o app oferecer 48x e
 * o servidor rejeitar em silêncio (`fireWrite` engole) — exatamente o modo de falha que a REGRA
 * PRINCIPAL do `CLAUDE.md` descreve. Item anotado em `docs/planning/TODOS.md`.
 */
export const MAX_BILL_INSTALLMENTS = 24;

/**
 * Opções de parcelamento (1x à vista .. `max`) pro campo "Parcelamento".
 *
 * `max` é obrigatório porque os dois fluxos que usam este seletor têm tetos DIFERENTES e por
 * motivos diferentes (um no schema do cliente, outro na regra do servidor) — herdar um número
 * único aqui foi o que quase fez a conta a pagar oferecer 48x com a regra travada em 24.
 */
export function installmentOptions(max: number): AccountOrCardOption[] {
  return Array.from({ length: max }, (_, i) => i + 1).map((n) => ({
    value: String(n),
    label: n === 1 ? '1x à vista' : `${n}x`
  }));
}
