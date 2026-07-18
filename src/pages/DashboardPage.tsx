import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CreditCard, Minus, Plus, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { AvailableModeSheet } from '../finance/AvailableModeSheet';
import { updateAvailableMode } from '../workspaces/workspaceService';
import type { AvailableMode, TransactionType } from '../types/contracts';

import { calculateDashboardSummary } from '../finance/financeCalculations';
import { defaultAvailableMode } from '../finance/availableMode';
import {
  readCachedDashboardView,
  saveCachedDashboardView,
  type CachedCategoryMark,
  type CachedSpendingRow
} from '../finance/dashboardViewCache';
import { differenceInCalendarDays } from 'date-fns';
import { formatFriendlyDate, toDate, type DateLike } from '../finance/financeDates';
import { transactionTypeLabels } from '../finance/financeLabels';
import { formatMoney } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import { CategoryMark } from '../components/categoryIcons';
import { defaultCategoryColors } from '../theme/palette';
import { InstallPromptSheet } from '../pwa/InstallPromptSheet';
import { useWelcomeTour } from '../onboarding/welcomeTour.store';
import { BudgetAlertBanner } from '../components/BudgetAlertBanner';

import { EmptyState } from '../components/EmptyState';

// Forma comum que o render das listas consome, venha o dado do cálculo ao vivo ou do cache
// local (que guarda datas como ISO). `DateLike` cobre os dois: Date ao vivo, `new Date(iso)`
// do cache — ambos aceitos por `formatFriendlyDate`.
interface RecentTransactionView {
  id: string;
  type: TransactionType;
  description: string;
  date: DateLike;
  amountCents: number;
  mark: CachedCategoryMark | null;
}

interface CommitmentView {
  id: string;
  kind: 'bill' | 'recurring' | 'invoice';
  cardId?: string;
  description: string;
  dueAt: DateLike;
  amountCents: number;
}

type CategoryLike = { id: string; name?: string; icon?: string; color?: string };

/** Guarda só o que o `CategoryMark` precisa (id/ícone/cor). Props opcionais de propósito:
 * `finance.categories` é uma união (categorias reais + defaults inline) e um dos membros
 * não expõe `color`/`icon` no tipo — o opcional aceita os dois sem erro. */
function markForCategory(category: CategoryLike | null | undefined): CachedCategoryMark | null {
  return category ? { id: category.id, icon: category.icon, color: category.color } : null;
}

/** Reproduz a marca (ícone+cor) exatamente como o render ao vivo: categoria da transação
 * quando existe; senão o fallback por tipo (receita/transferência); senão o padrão. Usado
 * tanto no render ao vivo quanto ao gravar o cache, pra os dois baterem visualmente. */
function markForTransaction(
  transaction: { type: TransactionType; categoryId?: string },
  categoryMap: ReadonlyMap<string, CategoryLike>
): CachedCategoryMark | null {
  const categoryMark = markForCategory(transaction.categoryId ? categoryMap.get(transaction.categoryId) : null);
  if (categoryMark) return categoryMark;
  if (transaction.type === 'income') return { id: '', icon: 'money', color: defaultCategoryColors.income_salary };
  if (transaction.type === 'transfer') return { id: '', icon: 'repeat', color: defaultCategoryColors.both_transfer };
  return null;
}

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
    cards: cardsData.cards,
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
  // Mostra a última tela conhecida (cache local) enquanto os listeners do Firestore ainda
  // não entregaram o primeiro snapshot — evita os números piscando "—" e as listas piscando
  // em branco por 1-2s a cada abertura, sem mexer na lógica de loading em si. A gravação
  // desse cache fica mais abaixo, depois que `spendingRows`/`categoryMap` já existem.
  const cachedView = useMemo(() => readCachedDashboardView(workspaceId), [workspaceId]);

  const effectiveFreeToSpend = isCommittedLoading && cachedView
    ? cachedView.freeToSpendCents
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

  const totalBalanceDisplay = isLoading
    ? cachedView
      ? formatMoney(cachedView.totalBalanceCents)
      : '—'
    : formatMoney(dashboard.totalBalanceCents);
  const freeToSpendDisplay = isCommittedLoading
    ? cachedView
      ? formatMoney(cachedView.freeToSpendCents)
      : '—'
    : formatMoney(dashboard.freeToSpendCents);
  const committedDisplay = isCommittedLoading
    ? cachedView
      ? formatMoney(cachedView.committedCents)
      : '—'
    : formatMoney(dashboard.committedCents);
  const syncStatus = finance.pendingWrites || cardsData.pendingWrites ? 'pending' : 'synced';
  const currentMonth = new Date().toISOString().slice(0, 7);
  const now = new Date();
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  const categoryMap = new Map(finance.categories.map((c) => [c.id, c]));
  const isCountableSpend = (transaction: (typeof finance.transactions)[number], month: string) =>
    !transaction.deletedAt &&
    (transaction.type === 'expense' || transaction.type === 'card_purchase') &&
    (transaction.cashMonth === month || transaction.competenceMonth === month) &&
    !transaction.tags?.includes('meta') &&
    !transaction.tags?.includes('cofrinho');
  const spendingByCategory = finance.transactions
    .filter((transaction) => isCountableSpend(transaction, currentMonth))
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
  // Denormaliza as listas do jeito que o render consome — a mesma forma serve pra gravar no
  // cache e pra reler depois sem depender de `finance.categories` já ter chegado.
  const liveSpending: CachedSpendingRow[] = spendingRows.map(([categoryId, amount]) => {
    const category = categoryMap.get(categoryId);
    return {
      categoryId,
      categoryName: category?.name ?? 'Sem categoria',
      amountCents: amount,
      mark: markForCategory(category)
    };
  });
  const liveRecent: RecentTransactionView[] = dashboard.recentTransactions.map((transaction) => ({
    id: transaction.id,
    type: transaction.type,
    description: transaction.description,
    date: transaction.date,
    amountCents: transaction.amountCents,
    mark: markForTransaction(transaction, categoryMap)
  }));

  // Enquanto ainda carrega, renderiza o que o cache guardou; quando o dado real chega, troca
  // sem piscar (na imensa maioria das aberturas os dois são idênticos, então é imperceptível).
  const effectiveSpending: CachedSpendingRow[] = isCommittedLoading && cachedView ? cachedView.spending : liveSpending;
  const effectiveCommitments: CommitmentView[] = isCommittedLoading && cachedView
    ? cachedView.commitments.map((commitment) => ({ ...commitment, dueAt: new Date(commitment.dueAtISO) }))
    : dashboard.upcomingCommitments;
  const effectiveRecent: RecentTransactionView[] = isLoading && cachedView
    ? cachedView.recentTransactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        description: transaction.description,
        date: new Date(transaction.dateISO),
        amountCents: transaction.amountCents,
        mark: transaction.mark
      }))
    : liveRecent;
  const maxSpendingCents = Math.max(...effectiveSpending.map((row) => row.amountCents), 1);

  // Legendas do Disponível/Comprometido e a variação de gastos também entram no cache, pra
  // não piscarem "Carregando…"/"Contas e fatura." nem trocar de texto durante o boot.
  const liveAvailableCaption =
    perDayDisplay ?? (dashboard.freeToSpendCents <= 0 ? 'Você já comprometeu tudo que tem disponível.' : 'Livre agora.');
  const currentMonthSpendCents = [...spendingByCategory.values()].reduce((sum, amount) => sum + amount, 0);
  const previousMonthSpendCents = finance.transactions
    .filter((transaction) => isCountableSpend(transaction, previousMonth))
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const spendingVariationPct =
    !isCommittedLoading && previousMonthSpendCents > 0
      ? Math.round(((currentMonthSpendCents - previousMonthSpendCents) / previousMonthSpendCents) * 100)
      : null;

  useEffect(() => {
    // Só grava depois que cartões e faturas resolveram (senão poderia persistir um
    // "Comprometido" inflado). Nesse ponto `isLoading` (finanças) também já é false, então
    // todas as listas estão finais e consistentes entre si.
    if (isCommittedLoading || !workspaceId) return;
    saveCachedDashboardView(workspaceId, {
      totalBalanceCents: dashboard.totalBalanceCents,
      freeToSpendCents: dashboard.freeToSpendCents,
      committedCents: dashboard.committedCents,
      availableCaption: liveAvailableCaption,
      committedCaption,
      spendingVariationPct,
      spending: liveSpending,
      commitments: dashboard.upcomingCommitments.map((commitment) => ({
        id: commitment.id,
        kind: commitment.kind,
        cardId: commitment.cardId,
        description: commitment.description,
        dueAtISO: toDate(commitment.dueAt).toISOString(),
        amountCents: commitment.amountCents
      })),
      recentTransactions: dashboard.recentTransactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        description: transaction.description,
        dateISO: toDate(transaction.date).toISOString(),
        amountCents: transaction.amountCents,
        mark: markForTransaction(transaction, categoryMap)
      }))
    });
    // Deps = as fontes estáveis do dashboard (os arrays do contexto só trocam de referência
    // quando chega snapshot novo), não os objetos recomputados a cada render — senão isto
    // regravaria o cache em toda renderização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isCommittedLoading,
    workspaceId,
    finance.accounts,
    finance.transactions,
    finance.bills,
    finance.recurringRules,
    finance.categories,
    cardsData.invoices,
    cardsData.cards,
    profile?.payday,
    profile?.committedWindowDays,
    profile?.availableMode
  ]);
  const hasStarted = finance.accounts.length > 0 || finance.transactions.length > 0 || cardsData.cards.length > 0;
  // Só decide "conta nova" depois que finanças E cartões resolveram. No boot os arrays
  // começam vazios, então sem esse guard o guia "Comece em poucos minutos" piscava mesmo
  // numa conta já usada (achado pelo dono ao dar refresh).
  const showStartGuide = !hasStarted && !isCommittedLoading;

  // Durante o boot: cache se tiver, senão o placeholder antigo. Depois de carregar: dado ao vivo.
  const effectiveAvailableCaption = isCommittedLoading
    ? cachedView
      ? cachedView.availableCaption
      : 'Carregando...'
    : liveAvailableCaption;
  const effectiveCommittedCaption = isCommittedLoading
    ? cachedView
      ? cachedView.committedCaption
      : 'Contas e fatura.'
    : committedCaption;
  const effectiveVariationPct = isCommittedLoading && cachedView ? cachedView.spendingVariationPct : spendingVariationPct;

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

      <BudgetAlertBanner />

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
            <button
              type="button"
              className="dash-metric-explain"
              onClick={() => setTutorialOpen(true)}
              aria-label="Entender como o Disponível e o Comprometido são calculados"
            >
              {effectiveAvailableCaption}
            </button>
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
              {effectiveCommittedCaption}
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

      {/* Mobile: o grid acima some ("Lançar agora" some pois o FAB já cobre), mas
          Contas/Cartões/Compromissos/Metas continuam com atalho aqui. Visibilidade
          controlada em global.css. */}
      <div className="dash-shortcut-row">
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

      {showStartGuide ? (
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
            {effectiveVariationPct !== null && (
              <p className="text-secondary spending-variation">
                {effectiveVariationPct > 0 ? (
                  <TrendingUp size={14} aria-hidden="true" />
                ) : effectiveVariationPct < 0 ? (
                  <TrendingDown size={14} aria-hidden="true" />
                ) : (
                  <Minus size={14} aria-hidden="true" />
                )}
                {effectiveVariationPct > 0 ? '+' : ''}
                {effectiveVariationPct}% vs. mês passado
              </p>
            )}
          </div>
          <Link className="inline-link" to="/app/search" state={{ autoOpenSearch: true }}>
            Buscar
          </Link>
        </div>
        {effectiveSpending.length > 0 ? (
          <div className="spending-bars">
            {effectiveSpending.map((row) => (
              <div className="spending-row" key={row.categoryId}>
                <div className="spending-row-label">
                  <span className="spending-row-name">
                    <CategoryMark category={row.mark} />
                    <strong>{row.categoryName}</strong>
                  </span>
                  <span>{formatMoney(row.amountCents)}</span>
                </div>
                <div className="spending-bar-track" aria-hidden="true">
                  <span style={{ width: `${Math.max(8, Math.round((row.amountCents / maxSpendingCents) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : !isCommittedLoading ? (
          <EmptyState
            illustration="wallet"
            compact
            title="Sem gastos este mês"
            description="Quando você lançar gastos, as maiores categorias do mês aparecem aqui."
          />
        ) : null}
      </article>

      <div className="finance-grid">
        <article className="surface surface-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Próximos compromissos</p>
              <h2>O que vence primeiro</h2>
            </div>
          </div>
          {effectiveCommitments.length > 0 ? (
            <div className="item-list">
              {effectiveCommitments.map((commitment) => {
                // Fatura leva pra fatura do cartao; conta (avulsa ou recorrente) vai pra Contas a Pagar.
                const href =
                  commitment.kind === 'invoice' && commitment.cardId
                    ? `/app/cards/${commitment.cardId}/invoices/${commitment.id}`
                    : '/app/bills';
                return (
                  <Link className="list-row list-row--link" to={href} key={`${commitment.kind}-${commitment.id}`}>
                    <div>
                      <strong>{commitment.description}</strong>
                      <span className="text-secondary">
                        {commitment.kind === 'bill' || commitment.kind === 'recurring' ? 'Conta' : 'Fatura'} ·{' '}
                        {formatFriendlyDate(commitment.dueAt)}
                      </span>
                    </div>
                    <strong className="amount--expense">{formatMoney(commitment.amountCents)}</strong>
                  </Link>
                );
              })}
            </div>
          ) : !isCommittedLoading ? (
            <EmptyState
              illustration="bills"
              compact
              title="Nenhum compromisso pendente"
              description="Contas a pagar, faturas e recorrências futuras aparecem aqui."
            />
          ) : null}
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
          {effectiveRecent.length > 0 ? (
            <div className="item-list">
              {effectiveRecent.map((transaction) => {
                const isIncome = transaction.type === 'income';
                const isExpense = transaction.type === 'expense' || transaction.type === 'card_purchase';
                const amountClass = isIncome ? 'amount--income' : isExpense ? 'amount--expense' : 'amount--neutral';
                return (
                  <div className="list-row list-row--with-icon" key={transaction.id}>
                    <CategoryMark category={transaction.mark} />
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
          ) : !isLoading ? (
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
          ) : null}
        </article>
      </div>
    </section>
  );
}
