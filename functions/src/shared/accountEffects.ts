// Porta de src/finance/financeCalculations.ts (transactionAccountEffects, mergeAccountEffects,
// invertAccountEffects). Cloud Functions não importa src/ do app cliente — mantenha em
// sincronia manualmente se a lógica original mudar.

export type TransactionTypeForBalance =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'adjustment'
  | 'refund'
  | 'reimbursement'
  | 'card_purchase'
  | 'card_payment';

export interface AccountEffect {
  accountId: string;
  deltaCents: number;
}

export function transactionAccountEffects(transaction: {
  type: TransactionTypeForBalance;
  amountCents: number;
  accountId?: string | null;
  destinationAccountId?: string | null;
  deletedAt?: unknown;
}): AccountEffect[] {
  if (transaction.deletedAt) {
    return [];
  }

  const sourceId = transaction.accountId;
  const destinationId = transaction.destinationAccountId;

  if (transaction.type === 'income' || transaction.type === 'refund' || transaction.type === 'reimbursement') {
    return sourceId ? [{ accountId: sourceId, deltaCents: transaction.amountCents }] : [];
  }

  if (transaction.type === 'expense' || transaction.type === 'card_payment') {
    return sourceId ? [{ accountId: sourceId, deltaCents: -transaction.amountCents }] : [];
  }

  if (transaction.type === 'card_purchase') {
    return [];
  }

  if (transaction.type === 'transfer') {
    const effects: AccountEffect[] = [];
    if (sourceId) effects.push({ accountId: sourceId, deltaCents: -transaction.amountCents });
    if (destinationId) effects.push({ accountId: destinationId, deltaCents: transaction.amountCents });
    return effects;
  }

  if (transaction.type === 'adjustment') {
    return sourceId ? [{ accountId: sourceId, deltaCents: transaction.amountCents }] : [];
  }

  return [];
}

export function mergeAccountEffects(...groups: AccountEffect[][]): AccountEffect[] {
  const totals = new Map<string, number>();
  for (const group of groups) {
    for (const effect of group) {
      totals.set(effect.accountId, (totals.get(effect.accountId) ?? 0) + effect.deltaCents);
    }
  }
  return [...totals.entries()]
    .filter(([, deltaCents]) => deltaCents !== 0)
    .map(([accountId, deltaCents]) => ({ accountId, deltaCents }));
}

export function invertAccountEffects(effects: AccountEffect[]): AccountEffect[] {
  return effects.map((effect) => ({ accountId: effect.accountId, deltaCents: -effect.deltaCents }));
}
