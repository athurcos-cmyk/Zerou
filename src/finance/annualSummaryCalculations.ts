import { monthlyTotals, spendingByCategoryForMonth, type InvoiceForSpending } from './spendingAnalysis';
import type { Transaction } from '../types/contracts';

export interface AnnualSummary {
  year: number;
  totalIncomeCents: number;
  totalExpenseCents: number;
  savingsCents: number;
  savingsRate: number;
  topCategories: { name: string; categoryId: string; amountCents: number; percentage: number }[];
  monthlyBreakdown: { month: string; monthLabel: string; incomeCents: number; expenseCents: number }[];
  bestMonth: { month: string; monthLabel: string; savingsCents: number } | null;
  worstMonth: { month: string; monthLabel: string; deficitCents: number } | null;
}

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function computeAnnualSummary(
  year: number,
  transactions: Transaction[],
  invoices: InvoiceForSpending[],
  categoryNames: Map<string, string>,
): AnnualSummary {
  const months: string[] = [];
  for (let m = 0; m < 12; m++) {
    months.push(`${year}-${String(m + 1).padStart(2, '0')}`);
  }

  const monthly = monthlyTotals(months, transactions, invoices);
  const monthlyBreakdown = monthly.map((m) => ({
    month: m.month,
    monthLabel: MONTH_LABELS[parseInt(m.month.split('-')[1], 10) - 1] ?? m.month,
    incomeCents: m.incomeCents,
    expenseCents: m.expenseCents,
  }));

  let totalIncomeCents = 0;
  let totalExpenseCents = 0;
  for (const m of monthly) {
    totalIncomeCents += m.incomeCents;
    totalExpenseCents += m.expenseCents;
  }

  const savingsCents = totalIncomeCents - totalExpenseCents;
  const savingsRate = totalIncomeCents > 0 ? Math.round((savingsCents / totalIncomeCents) * 100) : 0;

  // Aggregate spending by category across all 12 months
  const categoryTotals = new Map<string, number>();
  for (const month of months) {
    const byCat = spendingByCategoryForMonth(month, transactions, invoices, (id) => id);
    for (const [catId, cents] of byCat) {
      if (cents <= 0) continue;
      categoryTotals.set(catId, (categoryTotals.get(catId) ?? 0) + cents);
    }
  }

  const topCategories = Array.from(categoryTotals.entries())
    .map(([categoryId, amountCents]) => ({
      name: categoryNames.get(categoryId) ?? categoryId,
      categoryId,
      amountCents,
      percentage: totalExpenseCents > 0 ? Math.round((amountCents / totalExpenseCents) * 100) : 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 5);

  // Best/worst month
  let bestMonth: AnnualSummary['bestMonth'] = null;
  let worstMonth: AnnualSummary['worstMonth'] = null;
  for (const m of monthly) {
    const diff = m.incomeCents - m.expenseCents;
    if (diff > 0 && (!bestMonth || diff > bestMonth.savingsCents)) {
      const mm = parseInt(m.month.split('-')[1], 10) - 1;
      bestMonth = { month: m.month, monthLabel: MONTH_LABELS[mm] ?? m.month, savingsCents: diff };
    }
    if (diff < 0 && (!worstMonth || diff < worstMonth.deficitCents)) {
      const mm = parseInt(m.month.split('-')[1], 10) - 1;
      worstMonth = { month: m.month, monthLabel: MONTH_LABELS[mm] ?? m.month, deficitCents: diff };
    }
  }

  return {
    year,
    totalIncomeCents,
    totalExpenseCents,
    savingsCents,
    savingsRate,
    topCategories,
    monthlyBreakdown,
    bestMonth,
    worstMonth,
  };
}
