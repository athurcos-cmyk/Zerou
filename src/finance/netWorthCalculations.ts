import { toDate } from './financeDates';
import { calculateAccountBalances, currentAccountBalances } from './financeCalculations';
import type { Account, AccountType, Bill, Invoice } from '../types/contracts';

export interface NetWorthBreakdown {
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  netWorthCents: number;
  assetsByType: { type: AccountType; label: string; amountCents: number }[];
  liabilitiesByKind: { invoices: number; bills: number };
}

export interface NetWorthSnapshot {
  month: string;
  netWorthCents: number;
  assetsCents: number;
  liabilitiesCents: number;
}

const ASSET_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  wallet: 'Carteira',
  investment: 'Investimentos',
  digital_wallet: 'Conta digital',
  cash: 'Dinheiro',
  shared: 'Conta compartilhada',
};

export function calculateNetWorth(
  accounts: Account[],
  invoices: Invoice[],
  bills: Bill[],
): NetWorthBreakdown {
  const balances = currentAccountBalances(accounts);
  const totalAssetsCents = balances.reduce((sum, a) => sum + a.balanceCents, 0);

  const byType = new Map<AccountType, number>();
  for (const account of balances) {
    byType.set(account.type, (byType.get(account.type) ?? 0) + account.balanceCents);
  }
  const assetsByType = Array.from(byType.entries())
    .filter(([, cents]) => cents !== 0)
    .map(([type, amountCents]) => ({ type, label: ASSET_TYPE_LABELS[type] ?? type, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const invoiceLiability = invoices
    .filter((inv) => inv.status !== 'paid' && inv.status !== 'overpaid')
    .reduce((sum, inv) => sum + Math.max(0, inv.outstandingBalanceCents), 0);

  const billLiability = bills
    .filter((b) => b.status === 'pending' || b.status === 'overdue')
    .reduce((sum, b) => sum + b.amountCents, 0);

  const totalLiabilitiesCents = invoiceLiability + billLiability;

  return {
    totalAssetsCents,
    totalLiabilitiesCents,
    netWorthCents: totalAssetsCents - totalLiabilitiesCents,
    assetsByType,
    liabilitiesByKind: { invoices: invoiceLiability, bills: billLiability },
  };
}

export function netWorthHistory(
  months: string[],
  accounts: Account[],
  transactions: import('../types/contracts').Transaction[],
  invoicesByMonth: Map<string, Invoice[]>,
  bills: Bill[],
): NetWorthSnapshot[] {
  return months.map((month) => {
    const [yyyy, mm] = month.split('-').map(Number);
    const monthEnd = new Date(yyyy, mm, 0, 23, 59, 59, 999);

    const txnsUpTo = transactions.filter((t) => {
      const d = toDate(t.date);
      return d <= monthEnd && !t.deletedAt;
    });

    const assetsCents = calculateAccountBalances(accounts, txnsUpTo).reduce(
      (sum, a) => sum + a.balanceCents,
      0,
    );

    const monthInvoices = invoicesByMonth.get(month) ?? [];
    const invoiceLiability = monthInvoices
      .filter((inv) => inv.status !== 'paid' && inv.status !== 'overpaid')
      .reduce((sum, inv) => sum + Math.max(0, inv.outstandingBalanceCents), 0);

    const billsUpTo = bills.filter((b) => {
      const due = toDate(b.dueDate);
      return due <= monthEnd && (b.status === 'pending' || b.status === 'overdue');
    });
    const billLiability = billsUpTo.reduce((sum, b) => sum + b.amountCents, 0);

    return {
      month,
      netWorthCents: assetsCents - invoiceLiability - billLiability,
      assetsCents,
      liabilitiesCents: invoiceLiability + billLiability,
    };
  });
}
