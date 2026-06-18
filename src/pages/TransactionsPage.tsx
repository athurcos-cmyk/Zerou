import { Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { EmptyState } from '../components/EmptyState';
import { CategoryMark } from '../components/categoryIcons';
import { defaultCategoryColors } from '../theme/palette';
import { toDateInputValue } from '../finance/financeDates';
import { transactionTypeLabels } from '../finance/financeLabels';
import { softDeleteTransaction } from '../finance/financeService';
import { formatMoney } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';

export function TransactionsPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceContext();
  const visibleTransactions = finance.transactions.filter((transaction) => !transaction.deletedAt);
  const categoryMap = new Map(finance.categories.map((c) => [c.id, c]));

  async function handleDelete(transactionId: string) {
    if (!workspaceId || !user) {
      return;
    }

    await softDeleteTransaction(workspaceId, user.uid, transactionId);
  }

  return (
    <section className="page-content">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Pessoal</p>
          <h1 className="page-title page-title--compact">Transações</h1>
        </div>
        <Link className="button button--primary" to="/app/transactions/new">
          <Plus size={16} aria-hidden="true" /> Nova
        </Link>
      </div>

      <article className="surface surface-pad">
        {visibleTransactions.length > 0 ? (
          <div className="item-list">
            {visibleTransactions.map((transaction) => {
              const isIncome = transaction.type === 'income';
              const isExpense = transaction.type === 'expense' || transaction.type === 'card_purchase';
              const amountClass = isIncome ? 'amount--income' : isExpense ? 'amount--expense' : '';
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
                  <div className="list-row-end">
                    <strong className={amountClass}>
                      {isIncome ? '+' : isExpense ? '−' : ''}{formatMoney(transaction.amountCents)}
                    </strong>
                    <SyncStatusBadge status={transaction.localSyncStatus} />
                    <Link className="button button--subtle button--compact" to={`/app/transactions/${transaction.id}/edit`}>
                      Editar
                    </Link>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Excluir transação"
                      onClick={() => void handleDelete(transaction.id)}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            illustration="transactions"
            title="Nenhuma transação registrada"
            description="Seus lançamentos de entradas, gastos e transferências aparecem aqui."
            action={
              <Link className="button button--primary button--compact" to="/app/transactions/new">
                <Plus size={16} aria-hidden="true" /> Cadastrar primeira
              </Link>
            }
          />
        )}
      </article>
    </section>
  );
}
