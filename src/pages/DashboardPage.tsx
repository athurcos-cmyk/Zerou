import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CreditCard, Plus, Target, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { AvailableModeSheet } from '../finance/AvailableModeSheet';
import { updateAvailableMode } from '../workspaces/workspaceService';
import type { AvailableMode } from '../types/contracts';

import { calculateDashboardSummary } from '../finance/financeCalculations';
import { defaultAvailableMode } from '../finance/availableMode';
import { readCachedDashboardSummary, saveCachedDashboardSummary } from '../finance/dashboardSummaryCache';
import { differenceInCalendarDays } from 'date-fns';
import { formatFriendlyDate } from '../finance/financeDates';
import { transactionTypeLabels } from '../finance/financeLabels';
import { formatMoney } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import { CategoryMark } from '../components/categoryIcons';
import { defaultCategoryColors } from '../theme/palette';
import { InstallPromptSheet } from '../pwa/InstallPromptSheet';
import { useWelcomeTour } from '../onboarding/welcomeTour.store';

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
  // Perfil sem `availableMode` = ainda não passou pelo mini tutorial. Ele abre sozinho
  // (uma vez), e qualquer escolha — inclusive manter o padrão — grava o campo, que é o
  // que impede de reabrir no próximo boot.
  const hasChosenAvailableMode = Boolean(profile?.availableMode);
  const welcomeTourSeen = useWelcomeTour((state) => state.seen);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialDismissed, setTutorialDismissed] = useState(false);
  const dashboard = calculateDashboardSummary({
    accounts: finance.accounts,
    transactions: finance.transactions,
    bills: finance.bills,
    recurringRules: finance.recurringRules,
    invoices: cardsData.invoices,
    payday: profile?.payday,
    committedWindowDays: profile?.committedWindowDays,
    availableMode: profile?.availableMode
  });
  const committedCaption =
    dashboard.committedCutoffSource === 'income'
      ? `Considerando sua receita de ${formatFriendlyDate(dashboard.committedCutoff!)}`
      : dashboard.committedCutoffSource === 'payday'
      ? `Considerando seu recebimento em ${formatFriendlyDate(dashboard.committedCutoff!)}`
      : `Considerando os próximos ${profile?.committedWindowDays ?? 30} dias`;

  // Só depois que o perfil carregou (senão o sheet pisca antes de sabermos a escolha) e
  // depois que o tour de boas-vindas fechou — pra não empilhar dois modais no primeiro acesso.
  const shouldAutoOpenTutorial = Boolean(profile) && !hasChosenAvailableMode && !tutorialDismissed && welcomeTourSeen;

  function handleChooseAvailableMode(mode: AvailableMode) {
    if (user) updateAvailableMode(user.uid, mode);
    setTutorialDismissed(true);
    setTutorialOpen(false);
  }

  function handleCloseTutorial() {
    // Fechar sem escolher assume o padrão e grava — senão o tutorial reabre pra sempre.
    if (user && !hasChosenAvailableMode) updateAvailableMode(user.uid, defaultAvailableMode);
    setTutorialDismissed(true);
    setTutorialOpen(false);
  }
  // Mostra o último saldo conhecido (cache local) enquanto os listeners do
  // Firestore ainda não entregaram o primeiro snapshot — evita o "—" piscando
  // por 1-2s a cada reload, sem alterar a lógica de correção do loading em si.
  const cachedSummary = useMemo(() => readCachedDashboardSummary(workspaceId), [workspaceId]);

  const effectiveFreeToSpend = isCommittedLoading && cachedSummary
    ? cachedSummary.freeToSpendCents
    : dashboard.freeToSpendCents;

  const perDayDisplay = useMemo(() => {
    if (!dashboard.committedCutoff) return null;
    if (effectiveFreeToSpend <= 0) return null;
    const daysUntilCutoff = Math.max(1, differenceInCalendarDays(dashboard.committedCutoff, new Date()));
    const perDayCents = Math.floor(effectiveFreeToSpend / daysUntilCutoff);
    return perDayCents > 0
      ? `≈ ${formatMoney(perDayCents)}/dia até ${formatFriendlyDate(dashboard.committedCutoff)}`
      : null;
  }, [dashboard.committedCutoff, effectiveFreeToSpend]);

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
      // `||`, não `??`: compra no cartão sem categoria grava `categoryId: ''`
      // (`createCardPurchase`), e string vazia passa pelo `??`. Com `??`, os sem-categoria
      // caíam em dois baldes ('' e 'uncategorized') e o resumo mostrava duas linhas
      // "Sem categoria".
      const categoryId = transaction.categoryId || 'uncategorized';
      totals.set(categoryId, (totals.get(categoryId) ?? 0) + transaction.amountCents);
      return totals;
    }, new Map<string, number>());
  const spendingRows = [...spendingByCategory.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
  const maxSpendingCents = Math.max(...spendingRows.map(([, amount]) => amount), 1);
  const hasStarted = finance.accounts.length > 0 || finance.transactions.length > 0 || cardsData.cards.length > 0;

  return (
    <section className="page-content">
      <InstallPromptSheet />
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
            <span className="text-secondary">
              {perDayDisplay
                ? perDayDisplay
                : isCommittedLoading
                ? 'Carregando...'
                : dashboard.freeToSpendCents <= 0
                ? 'Você já comprometeu tudo que tem disponível.'
                : 'Livre agora.'}
            </span>
          </article>
          <article className="surface surface-pad dash-metric dash-metric--committed">
            <p className="eyebrow">Comprometido</p>
            <strong className="display-number">{committedDisplay}</strong>
            <button
              type="button"
              className="dash-metric-explain"
              onClick={() => setTutorialOpen(true)}
              aria-label="Entender como o Disponível e o Comprometido são calculados"
            >
              {isCommittedLoading ? 'Contas e fatura.' : committedCaption}
            </button>
          </article>
        </div>
      </div>

      <AvailableModeSheet
        open={tutorialOpen || shouldAutoOpenTutorial}
        currentMode={profile?.availableMode}
        onChoose={handleChooseAvailableMode}
        onClose={handleCloseTutorial}
      />

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
          <Link className="inline-link" to="/app/search" state={{ autoOpenSearch: true }}>
            Buscar
          </Link>
        </div>
        {spendingRows.length > 0 ? (
          <div className="spending-bars">
            {spendingRows.map(([categoryId, amount]) => {
              const category = categoryMap.get(categoryId);
              return (
                <div className="spending-row" key={categoryId}>
                  <div className="spending-row-label">
                    <span className="spending-row-name">
                      <CategoryMark category={category} />
                      <strong>{category?.name ?? 'Sem categoria'}</strong>
                    </span>
                    <span>{formatMoney(amount)}</span>
                  </div>
                  <div className="spending-bar-track" aria-hidden="true">
                    <span style={{ width: `${Math.max(8, Math.round((amount / maxSpendingCents) * 100))}%` }} />
                  </div>
                </div>
              );
            })}
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
              {dashboard.upcomingCommitments.map((commitment) => {
                // Fatura leva pra fatura do cartao; conta a pagar pros Compromissos; despesa fixa pras Despesas Fixas.
                const href =
                  commitment.kind === 'invoice' && commitment.cardId
                    ? `/app/cards/${commitment.cardId}/invoices/${commitment.id}`
                    : commitment.kind === 'recurring'
                    ? '/app/recurring'
                    : '/app/bills';
                return (
                  <Link className="list-row list-row--link" to={href} key={`${commitment.kind}-${commitment.id}`}>
                    <div>
                      <strong>{commitment.description}</strong>
                      <span className="text-secondary">
                        {commitment.kind === 'bill' ? 'Conta a pagar' : commitment.kind === 'invoice' ? 'Fatura' : 'Despesa Fixa'} ·{' '}
                        {formatFriendlyDate(commitment.dueAt)}
                      </span>
                    </div>
                    <strong className="amount--expense">{formatMoney(commitment.amountCents)}</strong>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              illustration="bills"
              compact
              title="Nenhum compromisso pendente"
              description="Contas a pagar, faturas e recorrências futuras aparecem aqui."
            />
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
                        {transactionTypeLabels[transaction.type]} · {formatFriendlyDate(transaction.date)}
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
