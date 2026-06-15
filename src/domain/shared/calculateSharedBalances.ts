import type { MoneyCents, Settlement, SharedExpenseClaim } from '../../types/contracts';

export interface MemberBalance {
  userId: string;
  balanceCents: MoneyCents;
}

export interface SettlementSuggestion {
  fromUserId: string;
  toUserId: string;
  amountCents: MoneyCents;
}

const claimStatusesThatAffectBalance = new Set<SharedExpenseClaim['status']>(['accepted', 'settled']);
const settlementStatusesThatAffectBalance = new Set<Settlement['status']>(['accepted', 'partially_paid', 'settled']);

function uniqueMembers(claims: SharedExpenseClaim[], settlements: Settlement[]) {
  const ids = new Set<string>();

  claims.forEach((claim) => {
    ids.add(claim.payerUserId);
    claim.split.forEach((split) => ids.add(split.userId));
  });
  settlements.forEach((settlement) => {
    ids.add(settlement.fromUserId);
    ids.add(settlement.toUserId);
  });

  return [...ids];
}

function uniqueByMutation<T extends { clientMutationId?: string; id: string }>(items: T[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = item.clientMutationId || item.id;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function calculateSharedBalances(claims: SharedExpenseClaim[], settlements: Settlement[]): MemberBalance[] {
  const balances = new Map(uniqueMembers(claims, settlements).map((userId) => [userId, 0]));

  uniqueByMutation(claims)
    .filter((claim) => claimStatusesThatAffectBalance.has(claim.status))
    .forEach((claim) => {
      claim.split.forEach((split) => {
        if (split.userId === claim.payerUserId) {
          return;
        }

        balances.set(split.userId, (balances.get(split.userId) ?? 0) - split.amountCents);
        balances.set(claim.payerUserId, (balances.get(claim.payerUserId) ?? 0) + split.amountCents);
      });
    });

  uniqueByMutation(settlements)
    .filter((settlement) => settlementStatusesThatAffectBalance.has(settlement.status))
    .forEach((settlement) => {
      const paidAmountCents = Math.min(settlement.paidAmountCents, settlement.amountCents);

      balances.set(settlement.fromUserId, (balances.get(settlement.fromUserId) ?? 0) + paidAmountCents);
      balances.set(settlement.toUserId, (balances.get(settlement.toUserId) ?? 0) - paidAmountCents);
    });

  return [...balances.entries()]
    .map(([userId, balanceCents]) => ({ userId, balanceCents }))
    .sort((left, right) => left.userId.localeCompare(right.userId));
}

export function suggestSettlement(claims: SharedExpenseClaim[], settlements: Settlement[]): SettlementSuggestion | null {
  const balances = calculateSharedBalances(claims, settlements);
  const creditor = [...balances].sort((left, right) => right.balanceCents - left.balanceCents)[0];
  const debtor = [...balances].sort((left, right) => left.balanceCents - right.balanceCents)[0];

  if (!creditor || !debtor || creditor.balanceCents <= 0 || debtor.balanceCents >= 0) {
    return null;
  }

  return {
    fromUserId: debtor.userId,
    toUserId: creditor.userId,
    amountCents: Math.min(creditor.balanceCents, Math.abs(debtor.balanceCents))
  };
}
