import { ArrowRight, CalendarClock, Plus, ReceiptText, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCardsData } from '../cards/useCardsData';
import { calculateDashboardSummary } from '../finance/financeCalculations';
import { toDateInputValue } from '../finance/financeDates';
import { transactionTypeLabels } from '../finance/financeLabels';
import { formatMoney } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import { useFinanceData } from '../finance/useFinanceData';

export function DashboardPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceData(workspaceId, user?.uid);
  const cardsData = useCardsData(workspaceId);
  const dashboard = calculateDashboardSummary({
    accounts: finance.accounts,
    transactions: finance.transactions,
    bills: finance.bills,
    recurringRules: finance.recurringRules,
    invoices: cardsData.invoices
  });
  const syncStatus = finance.pendingWrites || cardsData.pendingWrites ? 'pending' : 'synced';

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Dashboard Zerou</p>
          <h1 className="page-title">Seu dinheiro, seus compromissos.</h1>
          <p className="page-description">
            Acompanhe saldo, disponível livre, faturas e próximos vencimentos do seu espaço pessoal.
          </p>
        </div>
        <SyncStatusBadge status={syncStatus} />
      </div>

      {finance.error || cardsData.error ? <div className="notice notice--danger">{finance.error ?? cardsData.error}</div> : null}

      <div className="metric-grid">
        <article className="surface surface-pad metric-card">
          <span className="metric-icon">
            <Wallet size={20} aria-hidden="true" />
          </span>
          <p className="eyebrow">Saldo total</p>
          <strong>{formatMoney(dashboard.totalBalanceCents)}</strong>
          <span className="text-secondary">Soma das contas ativas.</span>
        </article>
        <article className="surface surface-pad metric-card">
          <span className="metric-icon">
            <ReceiptText size={20} aria-hidden="true" />
          </span>
          <p className="eyebrow">Disponível livre v1</p>
          <strong>{formatMoney(dashboard.freeToSpendCents)}</strong>
          <span className="text-secondary">Saldo menos compromissos previstos.</span>
        </article>
        <article className="surface surface-pad metric-card">
          <span className="metric-icon">
            <CalendarClock size={20} aria-hidden="true" />
          </span>
          <p className="eyebrow">Comprometido</p>
          <strong>{formatMoney(dashboard.committedCents)}</strong>
          <span className="text-secondary">Bills, recorrências e faturas até o próximo corte.</span>
        </article>
      </div>

      <div className="quick-actions">
        <Link className="button button--primary" to="/app/transactions/new">
          <Plus size={18} aria-hidden="true" /> Nova transação
        </Link>
        <Link className="button button--secondary" to="/app/accounts">
          Criar conta
        </Link>
        <Link className="button button--secondary" to="/app/cards">
          Cartões
        </Link>
        <Link className="button button--secondary" to="/app/bills">
          Novo compromisso
        </Link>
      </div>

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
                  <strong>{formatMoney(commitment.amountCents)}</strong>
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
              {dashboard.recentTransactions.map((transaction) => (
                <div className="list-row" key={transaction.id}>
                  <div>
                    <strong>{transaction.description}</strong>
                    <span className="text-secondary">
                      {transactionTypeLabels[transaction.type]} · {toDateInputValue(transaction.date)}
                    </span>
                  </div>
                  <strong>{formatMoney(transaction.amountCents)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-copy">
              <p className="text-secondary">Nenhuma transação ainda. Crie sua primeira conta e registre uma entrada.</p>
              <Link className="inline-link" to="/app/transactions/new">
                Começar agora <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
