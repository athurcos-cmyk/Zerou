import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { spendingByCategoryForMonth } from '../finance/spendingAnalysis';
import { formatMoney } from '../finance/money';
import { isAlertDismissed, dismissAlert } from '../finance/budgetAlertCache';

export function BudgetAlertBanner() {
  const finance = useFinanceContext();

  const alerts = useMemo(() => {
    if (finance.loading) return [];

    const currentMonth = new Date().toISOString().slice(0, 7);
    const activeBudgets = finance.budgets.filter((b) => b.isActive && b.limitCents > 0);
    if (activeBudgets.length === 0) return [];

    const spending = spendingByCategoryForMonth(
      currentMonth,
      finance.transactions,
      [],
      (txnId) => {
        if (!txnId) return undefined;
        const txn = finance.transactions.find((t) => t.id === txnId);
        return txn?.categoryId;
      },
    );

    return activeBudgets
      .map((budget) => {
        const spent = spending.get(budget.categoryId) ?? 0;
        const pct = budget.limitCents > 0 ? Math.round((spent / budget.limitCents) * 100) : 0;

        if (pct >= 100) return { ...budget, spent, pct, level: 'danger' as const };
        if (pct >= 80) return { ...budget, spent, pct, level: 'warning' as const };
        return null;
      })
      .filter((a): a is NonNullable<typeof a> => {
        if (!a) return false;
        return !isAlertDismissed(a.categoryId, currentMonth);
      })
      .sort((a, b) => b.pct - a.pct);
  }, [finance.budgets, finance.transactions, finance.loading]);

  if (alerts.length === 0) return null;

  const dangerAlerts = alerts.filter((a) => a.level === 'danger');
  const warningAlerts = alerts.filter((a) => a.level === 'warning');
  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
      {dangerAlerts.map((alert) => {
        const category = finance.categories.find((c) => c.id === alert.categoryId);
        const name = category?.name ?? 'Categoria';
        return (
          <div key={alert.categoryId} className="notice notice--danger" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>Orçamento estourado: {name}</strong>{' '}
              <span style={{ fontSize: '0.85rem' }}>
                {formatMoney(alert.spent)} de {formatMoney(alert.limitCents)} ({alert.pct}%)
              </span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={`Dispensar alerta de ${name}`}
              onClick={() => dismissAlert(alert.categoryId, currentMonth)}
              style={{ flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
      {warningAlerts.map((alert) => {
        const category = finance.categories.find((c) => c.id === alert.categoryId);
        const name = category?.name ?? 'Categoria';
        return (
          <div key={alert.categoryId} className="notice" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>Limite próximo: {name}</strong>{' '}
              <span style={{ fontSize: '0.85rem' }}>
                {formatMoney(alert.spent)} de {formatMoney(alert.limitCents)} ({alert.pct}%)
              </span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={`Dispensar alerta de ${name}`}
              onClick={() => dismissAlert(alert.categoryId, currentMonth)}
              style={{ flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
