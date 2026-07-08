import { useEffect, useMemo } from 'react';
import { CalendarClock, CreditCard, Plus, Target, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';

import { calculateDashboardSummary } from '../finance/financeCalculations';
import { readCachedDashboardSummary, saveCachedDashboardSummary } from '../finance/dashboardSummaryCache';
import { toDateInputValue } from '../finance/financeDates';
import { transactionTypeLabels } from '../finance/financeLabels';
import { formatMoney } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import { CategoryMark } from '../components/categoryIcons';
import { defaultCategoryColors } from '../theme/palette';

import { EmptyState } from '../components/EmptyState';

export function DashboardPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceContext();
  const cardsData = useCardsContext();
  const isLoading = finance.loading;
  // Disponível/Comprometido dependem das faturas de cartão (cardsData) além de
  // contas/transações — sem isso, mostrariam um "Disponível" inflado por um instante
  // antes das faturas sincronizarem.
  const isCommittedLoading = finance.loading || cardsData.loading;
  const dashboard = calculateDashboardSummary({
    accounts: finance.accounts,
    transactions: finance.transactions,
    bills: finance.bills,
    recurringRules: finance.recurringRules,
    invoices: cardsData.invoices
  });
  // Mostra o último saldo conhecido (cache local) enquanto os listeners do
  // Firestore ainda não entregaram o primeiro snapshot — evita o "—" piscando
  // por 1-2s a cada reload, sem alterar a lógica de correção do loading em si.
  const cachedSummary = useMemo(() => readCachedDashboardSummary(workspaceId), [workspaceId]);
  useEffect(() => {
    if (!isCommittedLoading && workspaceId) {
      saveCachedDashboardSummary(workspaceId, {
        totalBalanceCents: dashboard.totalBalanceCents,
        freeToSpendCents: dashboard.freeToSpendCents,
        committedCents: dashboard.committedCents
      });
    }
  }, [isCommittedLoading, workspaceId, dashboard.totalBalanceCents, dashboard.freeToSpendCents, dashboard.committedCents]);
  const totalBalanceDisplay = isLoading
    ? cachedSummary
      ? formatMoney(cachedSummary.totalBalanceCents)
      : '—'
    : formatMoney(dashboard.totalBalanceCents);
  const freeToSpendDisplay = isCommittedLoading
    ? cachedSummary
      ? formatMoney(cachedSummary.freeToSpendCents)
      : '—'
    : formatMoney(dashboard.freeToSpendCents);
  const committedDisplay = isCommittedLoading
    ? cachedSummary
      ? formatMoney(cachedSummary.committedCents)
      : '—'
    : formatMoney(dashboard.committedCents);
  const syncStatus = finance.pendingWrites || cardsData.pendingWrites ? 'pending' : 'synced';
  const currentMonth = new Date().toISOString().slice(0, 7);
  const categoryNames = new Map(finance.categories.map((category) => [category.id, category.name]));
  const categoryMap = new Map(finance.categories.map((c) => [c.id, c]));
  const spendingByCategory = finance.transactions
    .filter(
      (transaction) =>
        !transaction.deletedAt &&
        (transaction.type === 'expense' || transaction.type === 'card_purchase') &&
        (transaction.cashMonth === currentMonth || transaction.competenceMonth === currentMonth) &&
        !transaction.tags?.includes('meta') &&
        !transaction.tags?.includes('cofrinho')
    )
    .reduce((totals, transaction) => {
      const categoryName = transaction.categoryId ? categoryNames.get(transaction.categoryId) ?? 'Sem categoria' : 'Sem categoria';
      totals.set(categoryName, (totals.get(categoryName) ?? 0) + transaction.amountCents);
      return totals;
    }, new Map<string, number>());
  const spendingRows = [...spendingByCategory.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
  const maxSpendingCents = Math.max(...spendingRows.map(([, amount]) => amount), 1);
  const hasStarted = finance.accounts.length > 0 || finance.transactions.length > 0 || cardsData.cards.length > 0;

  return (
    <section className="page-content">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Olá{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}</p>
          <h1 className="page-title page-title--compact">Seu resumo</h1>
        </div>
        <SyncStatusBadge status={syncStatus} />
      </div>

      {finance.error || cardsData.error ? <div className="notice notice--danger">{finance.error ?? cardsData.error}</div> : null}

      <div className="dash-summary">
        <article className="surface surface-pad dash-balance dash-hero">
          <p className="eyebrow" style={{ color: 'var(--on-accent-85)' }}>Saldo total</p>
          <strong className="display-number" style={{ color: 'var(--on-accent-95)' }}>
            {totalBalanceDisplay}
          </strong>
          <span style={{ color: 'var(--on-accent-55)', fontSize: '0.84rem' }}>Soma das contas ativas.</span>
        </article>
        <div className="dash-secondary">
          <article className="surface surface-pad dash-metric dash-metric--available">
            <p className="eyebrow">Disponível</p>
            <strong className="display-number">{freeToSpendDisplay}</strong>
            <span className="text-secondary">Livre agora.</span>
          </article>
          <article className="surface surface-pad dash-metric dash-metric--committed">
            <p className="eyebrow">Comprometido</p>
            <strong className="display-number">{committedDisplay}</strong>
            <span className="text-secondary">Contas e fatura.</span>
          </article>
        </div>
      </div>

      <div className="quick-actions">
        <Link className="button button--primary" to="/app/transactions/new">
          <Plus size={18} aria-hidden="true" /> Lançar agora
        </Link>
        <Link className="button button--subtle" to="/app/accounts">
          <Wallet size={17} aria-hidden="true" /> Contas
        </Link>
        <Link className="button button--subtle" to="/app/cards">
          <CreditCard size={17} aria-hidden="true" /> Cartões
        </Link>
        <Link className="button button--subtle" to="/app/bills">
          <CalendarClock size={17} aria-hidden="true" /> Compromissos
        </Link>
        <Link className="button button--subtle" to="/app/goals">
          <Target size={17} aria-hidden="true" /> Metas
        </Link>
      </div>

      {!hasStarted ? (
        <article className="surface surface-pad start-guide">
          <div>
            <p className="eyebrow">Comece em poucos minutos</p>
            <h2>Monte seu primeiro resumo antes de explorar o resto.</h2>
          </div>
          <div className="start-guide-steps" aria-label="Primeiros passos">
            <Link to="/app/accounts">
              <strong>1. Criar conta</strong>
              <span>Carteira, banco ou conta digital.</span>
            </Link>
            <Link to="/app/transactions/new">
              <strong>2. Lançar entrada ou gasto</strong>
              <span>Registre o primeiro movimento.</span>
            </Link>
            <Link to="/app/cards">
              <strong>3. Adicionar cartão</strong>
              <span>Faturas entram sem duplicar saldo.</span>
            </Link>
          </div>
        </article>
      ) : null}

      <article className="surface surface-pad spending-summary-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Resumo de gastos</p>
            <h2>Para onde foi o dinheiro este mês</h2>
          </div>
          <Link className="inline-link" to="/app/search">
            Buscar
          </Link>
        </div>
        {spendingRows.length > 0 ? (
          <div className="spending-bars">
            {spendingRows.map(([category, amount]) => (
              <div className="spending-row" key={category}>
                <div className="spending-row-label">
                  <strong>{category}</strong>
                  <span>{formatMoney(amount)}</span>
                </div>
                <div className="spending-bar-track" aria-hidden="true">
                  <span style={{ width: `${Math.max(8, Math.round((amount / maxSpendingCents) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            illustration="wallet"
            compact
            title="Sem gastos este mês"
            description="Quando você lançar gastos, as maiores categorias do mês aparecem aqui."
          />
        )}
      </article>

      <div className="finance-grid">
        <article className="surface surface-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Próximos compromissos</p>
              <h2>O que vence primeiro</h2>
            </div>
            <Link className="inline-link" to="/app/bills">
              Ver todos
            </Link>
          </div>
          {dashboard.upcomingCommitments.length > 0 ? (
            <div className="item-list">
              {dashboard.upcomingCommitments.map((commitment) => (
                <div className="list-row" key={`${commitment.kind}-${commitment.id}`}>
                  <div>
                    <strong>{commitment.description}</strong>
                    <span className="text-secondary">
                      {commitment.kind === 'bill' ? 'Conta a pagar' : commitment.kind === 'invoice' ? 'Fatura' : 'Recorrência'} ·{' '}
                      {toDateInputValue(commitment.dueAt)}
                    </span>
                  </div>
                  <strong className="amount--expense">{formatMoney(commitment.amountCents)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-secondary">Nenhum compromisso pendente no período.</p>
          )}
        </article>

        <article className="surface surface-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Transações recentes</p>
              <h2>Últimos movimentos</h2>
            </div>
            <Link className="inline-link" to="/app/transactions">
              Ver todas
            </Link>
          </div>
          {dashboard.recentTransactions.length > 0 ? (
            <div className="item-list">
              {dashboard.recentTransactions.map((transaction) => {
                const isIncome = transaction.type === 'income';
                const isExpense = transaction.type === 'expense' || transaction.type === 'card_purchase';
                const amountClass = isIncome ? 'amount--income' : isExpense ? 'amount--expense' : 'amount--neutral';
                const category = transaction.categoryId ? categoryMap.get(transaction.categoryId) : null;
                const fallback = isIncome
                  ? { icon: 'money', color: defaultCategoryColors.income_salary }
                  : transaction.type === 'transfer'
                  ? { icon: 'repeat', color: defaultCategoryColors.both_transfer }
                  : undefined;
                return (
                  <div className="list-row list-row--with-icon" key={transaction.id}>
                    <CategoryMark category={category} fallback={fallback} />
                    <div className="list-row-body">
                      <strong>{transaction.description}</strong>
                      <span className="text-secondary">
                        {transactionTypeLabels[transaction.type]} · {toDateInputValue(transaction.date)}
                      </span>
                    </div>
                    <strong className={amountClass}>
                      {isIncome ? '+' : isExpense ? '−' : ''}{formatMoney(transaction.amountCents)}
                    </strong>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              illustration="transactions"
              compact
              title="Nenhuma transação ainda"
              description="Registre sua primeira entrada ou gasto para ver os movimentos aqui."
              action={
                <Link className="button button--subtle button--compact" to="/app/transactions/new">
                  <Plus size={16} aria-hidden="true" /> Lançar agora
                </Link>
              }
            />
          )}
        </article>
      </div>
    </section>
  );
}
