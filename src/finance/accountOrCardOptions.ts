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

/** Opções de parcelamento (1x à vista .. 24x) pro campo "Parcelamento", mesmo limite de
 * `createCardPurchaseSchema`/`createBillSchema`. */
export function installmentOptions(): AccountOrCardOption[] {
  return Array.from({ length: 24 }, (_, i) => i + 1).map((n) => ({
    value: String(n),
    label: n === 1 ? '1x à vista' : `${n}x`
  }));
}
