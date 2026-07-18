import type { Candidate } from './pendingAction.js';

export interface AccountRow {
  id: string;
  name: string;
  isPrimary: boolean;
}

/**
 * Resolve a conta única de débito/crédito de uma despesa/receita: prioriza a conta citada na
 * mensagem (já validada contra a lista em `interpretMessage`), senão a conta principal
 * marcada em Configurações > Contas, senão a única conta ativa (se só existir uma). Retorna
 * null quando ainda resta ambiguidade — nesse caso o bot pergunta.
 */
export function resolveDebitCreditAccount(matchedAccountId: string | null, accounts: AccountRow[]): string | null {
  if (matchedAccountId) return matchedAccountId;
  const primary = accounts.find((a) => a.isPrimary);
  if (primary) return primary.id;
  if (accounts.length === 1) return accounts[0].id;
  return null;
}

/** Mesma prioridade de `resolveDebitCreditAccount`, mas pra um dos lados de uma transferência —
 * exclui a conta já resolvida do outro lado pra nunca sugerir a mesma conta nos dois lados. */
export function resolveTransferSide(matchedAccountId: string | null, accounts: AccountRow[], excludeId: string | null): string | null {
  if (matchedAccountId) return matchedAccountId;
  const candidates = accounts.filter((a) => a.id !== excludeId);
  const primary = candidates.find((a) => a.isPrimary);
  if (primary) return primary.id;
  if (candidates.length === 1) return candidates[0].id;
  return null;
}

export function accountCandidates(accounts: AccountRow[], excludeId?: string | null): Candidate[] {
  return accounts.filter((a) => a.id !== excludeId).map((a) => ({ id: a.id, label: a.name }));
}
