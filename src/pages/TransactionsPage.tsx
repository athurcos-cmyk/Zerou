import { Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { toDateInputValue } from '../finance/financeDates';
import { transactionTypeLabels } from '../finance/financeLabels';
import { softDeleteTransaction } from '../finance/financeService';
import { formatMoney } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import { useFinanceData } from '../finance/useFinanceData';

export function TransactionsPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceData(workspaceId, user?.uid);
  const visibleTransactions = finance.transactions.filter((transaction) => !transaction.deletedAt);

  async function handleDelete(transactionId: string) {
    if (!workspaceId || !user) {
      return;
    }

    await softDeleteTransaction(workspaceId, user.uid, transactionId);
  }

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Transações</p>
          <h1 className="page-title">Movimentos do seu espaço.</h1>
          <p className="page-description">Receitas, despesas, transferências e ajustes explícitos com escrita offline-first.</p>
        </div>
        <Link className="button button--primary" to="/app/transactions/new">
          Nova transação
        </Link>
      </div>

      <article className="surface surface-pad">
        {visibleTransactions.length > 0 ? (
          <div className="item-list">
            {visibleTransactions.map((transaction) => (
              <div className="list-row" key={transaction.id}>
                <div>
                  <strong>{transaction.description}</strong>
                  <span className="text-secondary">
                    {transactionTypeLabels[transaction.type]} · {toDateInputValue(transaction.date)}
                  </span>
                </div>
                <div className="list-row-end">
                  <strong>{formatMoney(transaction.amountCents)}</strong>
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
            ))}
          </div>
        ) : (
          <div className="empty-copy">
            <p className="text-secondary">Nenhuma transação registrada ainda.</p>
            <Link className="inline-link" to="/app/transactions/new">
              Cadastrar primeira transação
            </Link>
          </div>
        )}
      </article>
    </section>
  );
}
