import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, EllipsisVertical, Gauge, HelpCircle, LineChart, Minus, Plus, Search, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Tooltip as ReTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useAuth } from '../auth/AuthContext';
import { AnalysisTour } from '../onboarding/AnalysisTour';
import { useAnalysisTour } from '../onboarding/analysisTour.store';
import { AnnualSummarySheet } from '../components/AnnualSummarySheet';
import { CategoryTrendSheet } from '../components/CategoryTrendSheet';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { mergeInvoicesWithLedger, useInvoiceLedger } from '../cards/useInvoiceLedger';
import { formatFriendlyDate, fullMonthLabel, toDate } from '../finance/financeDates';
import { dedupeById, nextOccurrenceDate } from '../finance/financeService';
import { useMonthlyTransactions } from '../finance/useMonthlyTransactions';
import { useIsOnline } from '../finance/useIsOnline';
import { billStatusLabels, transactionTypeLabels } from '../finance/financeLabels';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { centsToInputValue } from '../finance/money';
import { downloadCsv, transactionsToCsv } from '../finance/csvExport';
import { createBudget, deleteBudget, updateBudgetLimit } from '../finance/financeService';
import {
  committedByCategoryForMonth,
  lastCommittedMonth,
  monthlyTotals,
  ongoingInstallmentPurchases,
  projectedRecurringForMonth,
  recurringByCategoryForMonth,
  rollUpByParent,
  spendingByCategoryForMonth,
  NO_CATEGORY,
  type BillForCommitment,
  type InvoiceForSpending,
  type RecurringForProjection
} from '../finance/spendingAnalysis';
import { parentCategoryIds } from '../finance/categoryHierarchy';
import { defaultCategoryColor, resolveCategoryColor } from '../theme/palette';
import { CategoryMark } from '../components/categoryIcons';

// ─── helpers ──────────────────────────────────────────────────────────────────

function getLastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
};

function monthLabel(key: string) {
  const [, mm] = key.split('-');
  return MONTH_LABELS[mm] ?? mm;
}

/** Shifts a 'YYYY-MM' key by `delta` months (negative goes back). */
function shiftMonth(key: string, delta: number) {
  const [yyyy, mm] = key.split('-').map(Number);
  const d = new Date(yyyy, mm - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function sumPositive(totals: Map<string, number>) {
  let sum = 0;
  for (const cents of totals.values()) if (cents > 0) sum += cents;
  return sum;
}

// ─── tooltips ─────────────────────────────────────────────────────────────────

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '0.65rem', padding: '0.6rem 0.9rem', boxShadow: 'var(--shadow-md)', minWidth: '9.5rem' }}>
      <p style={{ margin: '0 0 0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.85rem', marginBottom: '0.15rem' }}>
          <span style={{ color: p.color, fontWeight: 500 }}>{p.name}</span>
          <strong>{formatMoney(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}

// ─── sub-componentes ───────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent = false, icon, long = false }: {
  label: string; value: string; sub?: string; accent?: boolean; icon?: ReactNode; long?: boolean;
}) {
  return (
    <article className={`surface surface-pad metric-card${accent ? ' metric-card--accent' : ''}`}>
      <p className="eyebrow">{label}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {icon && <span className="metric-icon">{icon}</span>}
        <strong className={long ? 'metric-card-value--compact' : undefined}>{value}</strong>
      </div>
      {sub && <span className="metric-card-sub">{sub}</span>}
    </article>
  );
}

// ─── componente principal ──────────────────────────────────────────────────────

export function SearchPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceContext();
  const cardsData = useCardsContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedCatIndex, setSelectedCatIndex] = useState<number | null>(null);
  // Uma categoria principal aberta por vez (acordeão): abrir várias empurraria as outras pra
  // fora da tela no celular, que é onde essa lista é lida.
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllRecurring, setShowAllRecurring] = useState(false);
  const [showAllOngoing, setShowAllOngoing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [annualOpen, setAnnualOpen] = useState(false);
  const [trendOpen, setTrendOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [budgetValues, setBudgetValues] = useState<Record<string, string>>({});
  const openAnalysisTour = useAnalysisTour((state) => state.openTour);

  const expenseCategories = useMemo(
    () => finance.categories.filter((c) => c.type === 'expense' || c.type === 'both'),
    [finance.categories]
  );

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [comparisonMode, setComparisonMode] = useState<'previous_month' | 'last_year'>('previous_month');
  const last6Months = useMemo(() => getLastNMonths(6), []);

  // Meses que a Análise precisa COMPLETOS: o gráfico de 6 meses + o mês selecionado + os dois
  // meses de comparação possíveis (mês anterior e mesmo mês do ano passado). A Análise lê esses
  // meses sob demanda, sem a janela de 300 — ver docs/planning/HISTORICO_TRANSACOES.md.
  const analysisMonths = useMemo(
    () => [...new Set([...last6Months, selectedMonth, shiftMonth(selectedMonth, -1), shiftMonth(selectedMonth, -12)])],
    [last6Months, selectedMonth]
  );
  const analysis = useMonthlyTransactions(workspaceId, analysisMonths);
  // União: as 300 do boot (já na tela, sem flash) ∪ os meses completos da Análise. Durante o
  // carregamento a tela mostra o resultado das 300; quando a Análise chega, refina pro completo
  // (a agregação filtra por mês, então a união é completa pros meses que a Análise cobre).
  const knownTransactions = useMemo(
    () => dedupeById(finance.transactions, analysis.transactions),
    [finance.transactions, analysis.transactions]
  );

  // Aviso de offline: com o histórico sob demanda, um mês que você nunca abriu online pode vir
  // incompleto offline. Nota sutil, não bloqueia (o resto segue funcionando pelo cache).
  const isOnline = useIsOnline();

  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');

  // SearchPage é a única tela que precisa do ledger de TODAS as faturas de TODOS os cartões
  // (análise de gasto por mês/categoria cruza tudo) — carregado sob demanda só quando esta
  // página abre, ao contrário do boot global (`useCardsData`, que não assina ledger nenhum).
  const invoiceRefs = useMemo(
    () => cardsData.invoices.map((inv) => ({ id: inv.id, cardId: inv.cardId })),
    [cardsData.invoices]
  );
  const { entries: ledgerEntries, loading: ledgerLoading, error: ledgerError } = useInvoiceLedger(workspaceId, invoiceRefs, finance.transactionIndex);
  // "Sem gasto" e "ainda carregando" pareciam a mesma coisa pro usuário: o donut e o
  // histórico só olhavam o total calculado, sem checar se a fonte já resolveu. Numa
  // conta nova/rede lenta a tela mostrava "nenhum gasto" por alguns segundos até os
  // dados chegarem sozinhos (sem re-render visível de erro) — parecia quebrado até
  // alguém trocar de tela e voltar (o que reassina do zero e geralmente já pega o
  // dado pronto). Mesmo padrão que o Dashboard já usa pra cartões.
  const isLoadingChartData = finance.loading || cardsData.loading || analysis.loading || ledgerLoading;
  const chartDataError = finance.error || cardsData.error || analysis.error || ledgerError;
  // Faturas reduzidas ao que a Análise precisa (referenceMonth + ledger por parcela).
  const invoicesForSpending = useMemo<InvoiceForSpending[]>(
    () =>
      mergeInvoicesWithLedger(cardsData.invoices, ledgerEntries).map((inv) => ({
        referenceMonth: inv.referenceMonth,
        ledgerEntries: inv.ledgerEntries,
        status: inv.status,
        outstandingBalanceCents: inv.outstandingBalanceCents
      })),
    [cardsData.invoices, ledgerEntries]
  );
  // Cartão entra na Análise pela parcela; a categoria/descrição de cada parcela vem da transação-mãe.
  const txnCategoryById = useMemo(
    () => new Map(knownTransactions.map((t) => [t.id, t.categoryId])),
    [knownTransactions]
  );
  const txnDescriptionById = useMemo(
    () => new Map(knownTransactions.map((t) => [t.id, t.description])),
    [knownTransactions]
  );
  // Mês da COMPRA de cada compra no cartão — é o que ancora a parcela 1 no mês em que a pessoa
  // comprou, em vez do mês da fatura (ver `installmentShiftBySource`). Compra fora da janela
  // carregada devolve `undefined` e cai no fallback do `effectiveAt`, sem quebrar nada.
  const purchaseMonthById = useMemo(
    () => new Map(
      knownTransactions
        .filter((t) => t.type === 'card_purchase')
        .map((t) => [t.id, t.cashMonth ?? t.competenceMonth])
    ),
    [knownTransactions]
  );
  const purchaseMonthOf = useCallback(
    (transactionId: string) => purchaseMonthById.get(transactionId),
    [purchaseMonthById]
  );
  // Contas a pagar reduzidas ao que a projeção futura precisa (mês do vencimento resolvido aqui).
  // Conta debitada de uma conta "fora do saldo" (vale-refeição) não entra: o mês futuro mostraria
  // um comprometido que o mês passado, já realizado, não mostra.
  const billsForCommitment = useMemo<BillForCommitment[]>(
    () =>
      finance.bills
        .filter((b) => !(b.accountId && finance.excludedAccountIds.has(b.accountId)))
        .map((b) => {
        const due = toDate(b.dueDate);
        return {
          categoryId: b.categoryId,
          amountCents: b.amountCents,
          status: b.status,
          dueMonth: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}`
        };
      }),
    [finance.bills, finance.excludedAccountIds]
  );
  // Recorrências (sempre despesa) reduzidas ao que a projeção precisa. Mesma exclusão das contas.
  const rulesForProjection = useMemo<RecurringForProjection[]>(
    () =>
      finance.recurringRules
        .filter((r) => !(r.accountId && finance.excludedAccountIds.has(r.accountId)))
        .map((r) => ({
          id: r.id,
          description: r.description,
          categoryId: r.categoryId,
          amountCents: r.amountCents ?? 0,
          frequency: r.frequency,
          nextOccurrenceAt: toDate(r.nextOccurrenceAt),
          anchorDay: r.anchorDay,
          isActive: r.isActive
        })),
    [finance.recurringRules, finance.excludedAccountIds]
  );
  const hasProjectableRecurring = useMemo(
    () => rulesForProjection.some((r) => r.isActive && r.amountCents > 0),
    [rulesForProjection]
  );
  // Até onde a navegação pra frente pode ir: última parcela/conta comprometida, ou — se há
  // recorrência ativa — pelo menos 12 meses à frente (recorrência é "infinita", precisa de teto).
  const maxMonth = useMemo(() => {
    const committed = lastCommittedMonth(currentMonth, invoicesForSpending, billsForCommitment, purchaseMonthOf);
    const recurringHorizon = hasProjectableRecurring ? shiftMonth(currentMonth, 12) : currentMonth;
    return recurringHorizon > committed ? recurringHorizon : committed;
  }, [currentMonth, invoicesForSpending, billsForCommitment, hasProjectableRecurring, purchaseMonthOf]);
  const isFutureMonth = selectedMonth > currentMonth;

  // Arriving from the Dashboard's "Buscar" shortcut opens straight into search.
  useEffect(() => {
    const state = location.state as { autoOpenSearch?: boolean } | null;
    if (state?.autoOpenSearch) {
      setSearchOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryMap = useMemo(() => new Map(finance.categories.map((c) => [c.id, c])), [finance.categories]);
  const categoryNames = useMemo(() => new Map(finance.categories.map((c) => [c.id, c.name])), [finance.categories]);

  // ── gastos do mês selecionado por categoria (regime de caixa: por parcela) ──
  // Mês futuro não tem gasto realizado — mostra o PREVISTO: comprometido (parcela + conta) +
  // recorrências projetadas (estimativa). Mês atual/passado usa o gasto realizado.
  const spendingByCategory = useMemo(() => {
    const catOf = (id?: string) => (id ? txnCategoryById.get(id) : undefined);
    let totals: Map<string, number>;
    if (isFutureMonth) {
      totals = committedByCategoryForMonth(selectedMonth, invoicesForSpending, billsForCommitment, catOf, purchaseMonthOf);
      for (const [cat, cents] of recurringByCategoryForMonth(selectedMonth, rulesForProjection, nextOccurrenceDate)) {
        totals.set(cat, (totals.get(cat) ?? 0) + cents);
      }
    } else {
      totals = spendingByCategoryForMonth(selectedMonth, knownTransactions, invoicesForSpending, catOf, finance.excludedAccountIds, purchaseMonthOf);
    }
    // Subcategoria soma no pai — SÓ aqui. Orçamento e Resumo Anual continuam lendo o cru
    // (ver o aviso em `rollUpByParent`).
    return [...rollUpByParent(totals, categoryMap).entries()]
      .filter(([, rollUp]) => rollUp.totalCents > 0) // mês só de estorno pode zerar/inverter uma categoria
      .map(([catId, rollUp]) => {
        const isNone = catId === NO_CATEGORY;
        const cat = isNone ? null : categoryMap.get(catId);
        const name = isNone ? 'Sem categoria' : (categoryNames.get(catId) ?? 'Sem categoria');
        return {
          categoryId: isNone ? null : catId,
          name,
          amountCents: rollUp.totalCents,
          color: cat ? resolveCategoryColor(cat) : defaultCategoryColor,
          // Linhas da expansão. A chave igual à do pai é o gasto feito na própria categoria antes
          // de ela virar agrupamento ("Casa · geral"). Filha negativa (mês de estorno) FICA: sem
          // ela os valores da expansão não explicariam o total do pai.
          children: [...rollUp.children.entries()]
            .filter(([, cents]) => cents !== 0)
            .map(([childId, cents]) => ({
              id: childId,
              name: childId === catId ? `${name} · geral` : (categoryNames.get(childId) ?? 'Sem categoria'),
              amountCents: cents
            }))
            .sort((a, b) => b.amountCents - a.amountCents)
        };
      })
      .sort((a, b) => b.amountCents - a.amountCents);
  }, [knownTransactions, invoicesForSpending, billsForCommitment, rulesForProjection, isFutureMonth, txnCategoryById, categoryMap, categoryNames, selectedMonth, finance.excludedAccountIds, purchaseMonthOf]);

  const totalSpent = spendingByCategory.reduce((s, c) => s + c.amountCents, 0);

  const budgetByCategoryId = useMemo(
    () => new Map(finance.budgets.filter((b) => b.isActive).map((b) => [b.categoryId, b])),
    [finance.budgets]
  );

  /**
   * Orçamento só em categoria que pode receber lançamento. Numa que virou agrupamento o limite
   * mediria só o gasto direto nela — não o do grupo, que é o número que a pessoa está vendo na
   * lista. Somar as filhas no orçamento é decisão de produto ainda em aberto (`[D1]`).
   *
   * Quem já tem orçamento continua listado mesmo virando pai: senão o limite antigo ficaria ativo
   * e invisível, sem como remover.
   */
  const budgetableCategories = useMemo(() => {
    const paiIds = parentCategoryIds(finance.categories); // parentesco na lista COMPLETA, nunca no recorte
    return expenseCategories
      // Categoria excluída não pode receber limite — ela nem aparece mais no lançamento.
      // `expenseCategories` NÃO filtra `isActive` de propósito (o Resumo Anual e a tendência
      // precisam da lista completa pra resolver o NOME de uma categoria já excluída); quem
      // filtra é quem oferece uma AÇÃO sobre ela, que é o caso aqui. Bug real: uma categoria
      // excluída ficava pra sempre na tela de orçamentos, e apagar o limite não a removia —
      // porque a lista vem das categorias, não dos orçamentos (30/07/2026).
      .filter((cat) => cat.isActive !== false)
      .filter((cat) => !paiIds.has(cat.id) || budgetByCategoryId.has(cat.id));
  }, [expenseCategories, finance.categories, budgetByCategoryId]);

  useEffect(() => {
    if (budgetOpen) {
      const values: Record<string, string> = {};
      for (const b of finance.budgets) {
        if (b.isActive) values[b.categoryId] = centsToInputValue(b.limitCents);
      }
      setBudgetValues(values);
    }
  }, [budgetOpen, finance.budgets]);

  // ── recorrências previstas do mês futuro (a parte "estimativa" do previsto) ──
  const recurringProjected = useMemo(
    () => (isFutureMonth ? projectedRecurringForMonth(selectedMonth, rulesForProjection, nextOccurrenceDate) : []),
    [isFutureMonth, selectedMonth, rulesForProjection]
  );
  const recurringTotalCents = recurringProjected.reduce((s, r) => s + r.amountCents, 0);

  // ── histórico mensal (últimos 6 meses reais — não acompanha selectedMonth) ─
  const monthlyData = useMemo(
    () =>
      monthlyTotals(last6Months, knownTransactions, invoicesForSpending, finance.excludedAccountIds, purchaseMonthOf).map((m) => ({
        month: monthLabel(m.month),
        incomeCents: m.incomeCents,
        expenseCents: m.expenseCents
      })),
    [knownTransactions, invoicesForSpending, last6Months, finance.excludedAccountIds, purchaseMonthOf]
  );

  const hasMonthlyData = monthlyData.some((m) => m.incomeCents > 0 || m.expenseCents > 0);

  // ── variação vs. período de comparação ─────────────────────────────────────
  const comparisonMonth = comparisonMode === 'last_year'
    ? shiftMonth(selectedMonth, -12)
    : shiftMonth(selectedMonth, -1);
  const comparisonExpense = useMemo(
    () =>
      sumPositive(
        spendingByCategoryForMonth(comparisonMonth, knownTransactions, invoicesForSpending, (id) =>
          id ? txnCategoryById.get(id) : undefined,
          finance.excludedAccountIds,
          purchaseMonthOf
        )
      ),
    [knownTransactions, invoicesForSpending, txnCategoryById, comparisonMonth, finance.excludedAccountIds, purchaseMonthOf]
  );
  // Comparação só faz sentido entre meses realizados; mês futuro é comprometido, não gasto.
  const variation = !isFutureMonth && comparisonExpense > 0
    ? Math.round(((totalSpent - comparisonExpense) / comparisonExpense) * 100)
    : null;

  // ── compras parceladas ainda em andamento (visibilidade do valor cheio) ─────
  const ongoing = useMemo(
    () => ongoingInstallmentPurchases(currentMonth, invoicesForSpending, (id) => txnDescriptionById.get(id)),
    [currentMonth, invoicesForSpending, txnDescriptionById]
  );

  // Parcelas por transação, pra mostrar "10x de R$300" nos resultados de busca.
  const installmentInfoById = useMemo(() => {
    const map = new Map<string, { total: number; valueCents: number }>();
    for (const invoice of invoicesForSpending) {
      for (const entry of invoice.ledgerEntries) {
        if (entry.type === 'purchase' && entry.sourceTransactionId && (entry.installmentTotal ?? 0) > 1) {
          map.set(entry.sourceTransactionId, { total: entry.installmentTotal!, valueCents: entry.amountCents });
        }
      }
    }
    return map;
  }, [invoicesForSpending]);

  // ── busca por texto ────────────────────────────────────────────────────────
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    const transactions = knownTransactions
      .filter((t) => !t.deletedAt)
      .filter((t) =>
        [t.description, t.merchant, t.notes, t.tags.join(' ')]
          .filter(Boolean).join(' ')
          .toLocaleLowerCase('pt-BR')
          .includes(normalizedQuery)
      )
      .map((t) => {
        const installment = t.type === 'card_purchase' ? installmentInfoById.get(t.id) : undefined;
        const suffix = installment ? ` · ${installment.total}x de ${formatMoney(installment.valueCents)}` : '';
        return {
          id: t.id,
          kind: 'Transação',
          title: t.description,
          detail: `${transactionTypeLabels[t.type]} · ${formatFriendlyDate(t.date)}${suffix}`,
          amountCents: t.amountCents
        };
      });

    const bills = finance.bills
      .filter((b) => b.description.toLocaleLowerCase('pt-BR').includes(normalizedQuery))
      .map((b) => ({ id: b.id, kind: 'Conta a pagar', title: b.description, detail: `${billStatusLabels[b.status]} · ${formatFriendlyDate(b.dueDate)}`, amountCents: b.amountCents }));

    const accounts = finance.accounts
      .filter((a) => a.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery))
      .map((a) => ({ id: a.id, kind: 'Conta', title: a.name, detail: 'Conta financeira', amountCents: a.openingBalanceCents }));

    return [...transactions, ...bills, ...accounts].slice(0, 25);
  }, [finance.accounts, finance.bills, knownTransactions, installmentInfoById, normalizedQuery]);

  const selectedCat = selectedCatIndex !== null ? spendingByCategory[selectedCatIndex] : null;
  const topCat = spendingByCategory[0] ?? null;
  const isCurrentMonth = selectedMonth === currentMonth;
  const monthTitle = isCurrentMonth ? 'Este mês' : fullMonthLabel(selectedMonth);

  function changeMonth(delta: number) {
    setSelectedCatIndex(null);
    setExpandedCatId(null);
    setShowAllCategories(false);
    setShowAllOngoing(false);
    setSelectedMonth((m) => shiftMonth(m, delta));
  }

  function handleExportCsv() {
    const monthTxs = knownTransactions.filter(
      (t) => !t.deletedAt && (t.cashMonth === selectedMonth || t.competenceMonth === selectedMonth)
    );
    const csv = transactionsToCsv(monthTxs, categoryMap, accountMap);
    downloadCsv(`granativa-${selectedMonth}.csv`, csv);
  }

  const accountMap = useMemo(
    () => new Map(finance.accounts.map((a) => [a.id, a])),
    [finance.accounts]
  );

  return (
    <section className="page-content page-content--narrow">
      <div className="page-heading-row page-heading-row--tight page-heading-row--icon-trailing">
        <div>
          <p className="eyebrow">Análise</p>
          <h1 className="page-title page-title--compact">Seus gastos</h1>
        </div>
        <button className="icon-button" type="button" aria-label="Mais ações" title="Mais ações" onClick={() => setActionsOpen(true)}>
          <EllipsisVertical size={18} aria-hidden="true" />
        </button>
      </div>

      {/* ── Seletor de mês ─────────────────────────────────────────────────── */}
      <div className="month-switcher">
        <button className="icon-button" type="button" aria-label="Mês anterior" onClick={() => changeMonth(-1)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <strong>{fullMonthLabel(selectedMonth)}</strong>
        <button className="icon-button" type="button" aria-label="Próximo mês" disabled={selectedMonth >= maxMonth} onClick={() => changeMonth(1)}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      {chartDataError && (
        <div className="notice notice--danger" role="alert">{chartDataError}</div>
      )}

      {!isOnline && (
        <p className="text-secondary" style={{ textAlign: 'center', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
          Você está offline · meses que você não abriu antes podem aparecer incompletos até reconectar.
        </p>
      )}

      {/* ── Comparação toggle ───────────────────────────────────────────────── */}
      {!isFutureMonth && (
        <div className="segmented" role="group" aria-label="Modo de comparação" style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
          <button
            type="button"
            className={`chip${comparisonMode === 'previous_month' ? ' chip--active' : ''}`}
            onClick={() => setComparisonMode('previous_month')}
          >
            vs. mês anterior
          </button>
          <button
            type="button"
            className={`chip${comparisonMode === 'last_year' ? ' chip--active' : ''}`}
            onClick={() => setComparisonMode('last_year')}
          >
            vs. ano passado
          </button>
        </div>
      )}

      {/* ── Hero: número principal do mês ───────────────────────────────────── */}
      <div className="analysis-hero">
        <p className="eyebrow">{isFutureMonth ? 'Previsto no mês' : 'Gasto no mês'}</p>
        <span className="analysis-hero-amount">{totalSpent > 0 ? formatMoney(totalSpent) : 'R$ 0'}</span>
        {!isFutureMonth && variation !== null && (
          <span className="analysis-hero-meta">
            {variation > 0 ? <TrendingUp size={14} aria-hidden="true" /> : variation < 0 ? <TrendingDown size={14} aria-hidden="true" /> : <Minus size={14} aria-hidden="true" />}
            {variation > 0 ? '+' : ''}{variation}% {comparisonMode === 'last_year' ? 'vs. mesmo mês ano passado' : 'vs. mês anterior'}
          </span>
        )}
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="metric-strip">
        <MetricCard
          long
          label="Maior categoria"
          value={topCat?.name ?? '—'}
          sub={topCat ? formatMoney(topCat.amountCents) : undefined}
        />
        {isFutureMonth ? (
          <MetricCard
            long
            label="Contas recorrentes"
            value={recurringTotalCents > 0 ? `~${formatMoney(recurringTotalCents)}` : 'R$ 0'}
            sub="estimativa do mês"
          />
        ) : (
          <MetricCard
            label={comparisonMode === 'last_year' ? 'vs. mesmo mês ano passado' : 'vs. mês anterior'}
            value={variation !== null ? `${variation > 0 ? '+' : ''}${variation}%` : '—'}
            sub={variation !== null ? (variation > 0 ? 'gastou mais' : variation < 0 ? 'gastou menos' : 'igual') : 'sem dados'}
            icon={
              variation === null ? undefined :
              variation > 0 ? <TrendingUp size={13} /> :
              variation < 0 ? <TrendingDown size={13} /> :
              <Minus size={13} />
            }
          />
        )}
      </div>

      {/* ── Donut + legenda ─────────────────────────────────────────────────── */}
      <article className="surface surface-pad" style={{ marginTop: '0.75rem' }}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">{isFutureMonth ? 'Previsto por categoria' : 'Por categoria'}</p>
            <h2>{monthTitle}</h2>
          </div>
        </div>

        {isFutureMonth && (
          <p className="text-secondary" style={{ margin: '0.1rem 0 0.75rem', fontSize: '0.86rem' }}>
            Mês ainda não chegou — é uma previsão: parcelas de cartão e contas a pagar (<strong>já comprometidas</strong>) mais recorrências (<strong>estimativa</strong>).
          </p>
        )}

        {budgetByCategoryId.size === 0 && (
          <div className="notice" style={{ marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span>Quer travar um limite por categoria (ex.: até R$100 em Doces por mês)?</span>
            <button
              type="button"
              className="button button--primary button--compact"
              onClick={() => setBudgetOpen(true)}
              style={{ flexShrink: 0 }}
            >
              Definir limite
            </button>
          </div>
        )}

        {totalSpent > 0 ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', marginTop: '0.6rem' }}>

              {/* donut — SVG puro (sem Recharts): render instantâneo, sem ResizeObserver, animação
                  de entrada em CSS (GPU) em vez do "forming" em JS que engasgava no celular. */}
              <div style={{ position: 'relative', flexShrink: 0, width: 200, height: 200 }}>
                <svg
                  viewBox="0 0 200 200"
                  width={200}
                  height={200}
                  className="category-donut"
                  role="img"
                  aria-label={`Gastos por categoria — total ${formatMoney(totalSpent)}`}
                >
                  {(() => {
                    const R = 74;
                    const C = 2 * Math.PI * R;
                    // gap entre fatias (só quando há mais de uma); cada fatia desenha um pouco menos
                    // que seu comprimento real pra deixar o respiro.
                    const gapPx = spendingByCategory.length > 1 ? 3.5 : 0;
                    let acc = 0; // comprimento acumulado (px) = onde a fatia começa
                    return spendingByCategory.map((cat, i) => {
                      const segLen = (cat.amountCents / totalSpent) * C;
                      const drawn = Math.max(1, segLen - gapPx);
                      const dimmed = selectedCatIndex !== null && selectedCatIndex !== i;
                      const circle = (
                        <circle
                          key={cat.categoryId ?? NO_CATEGORY}
                          cx={100}
                          cy={100}
                          r={R}
                          fill="none"
                          stroke={cat.color}
                          strokeWidth={26}
                          strokeDasharray={`${drawn} ${C - drawn}`}
                          strokeDashoffset={-acc}
                          transform="rotate(-90 100 100)"
                          opacity={dimmed ? 0.22 : 1}
                          style={{ cursor: 'pointer', transition: 'opacity 180ms ease' }}
                          onClick={() => setSelectedCatIndex(i === selectedCatIndex ? null : i)}
                        />
                      );
                      acc += segLen;
                      return circle;
                    });
                  })()}
                </svg>

                {/* label central */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', gap: '0.1rem' }}>
                  {selectedCat ? (
                    <>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 72, lineHeight: 1.25, fontWeight: 500 }}>
                        {selectedCat.name}
                      </span>
                      <strong style={{ fontSize: '0.92rem', marginTop: '0.15rem', fontWeight: 800 }}>
                        {formatMoney(selectedCat.amountCents)}
                      </strong>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                        {Math.round((selectedCat.amountCents / totalSpent) * 100)}%
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Total</span>
                      <strong style={{ fontSize: '0.92rem', marginTop: '0.15rem', fontWeight: 800 }}>{formatMoney(totalSpent)}</strong>
                    </>
                  )}
                </div>
              </div>

              {/* legenda com barras de progresso */}
              <div style={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                {(showAllCategories ? spendingByCategory : spendingByCategory.slice(0, 6)).map((cat, i) => {
                  const pct = Math.round((cat.amountCents / totalSpent) * 100);
                  const isSelected = selectedCatIndex === i;
                  const isDimmed = selectedCatIndex !== null && !isSelected;
                  const isParent = cat.children.length > 0;
                  const isExpanded = isParent && expandedCatId === cat.categoryId;
                  // Orçamento numa categoria que virou agrupamento: o valor da linha agora é o
                  // roll-up, mas o BudgetAlertBanner mede só o gasto DIRETO. Uma barra aqui seria
                  // dois números diferentes com o mesmo rótulo — vira um aviso dentro da expansão.
                  const budget = cat.categoryId ? budgetByCategoryId.get(cat.categoryId) : undefined;
                  const groupBudget = isParent ? budget : undefined;
                  const leafBudget = isParent ? undefined : budget;
                  const budgetPct = leafBudget ? Math.round((cat.amountCents / leafBudget.limitCents) * 100) : null;
                  const barColor = budgetPct !== null
                    ? budgetPct >= 100 ? 'var(--danger)' : budgetPct >= 80 ? 'var(--warning)' : 'var(--success)'
                    : cat.color;
                  // Escala com folga até 150% do orçamento — sem isso, o traço do limite
                  // sempre cairia na borda direita (a barra já é limitada a 100% ali), virando
                  // um marcador que nunca se move e não comunica nada.
                  const BUDGET_SCALE_CAP_PCT = 150;
                  const budgetMarkerLeftPct = (100 / BUDGET_SCALE_CAP_PCT) * 100;
                  const budgetBarWidthPct = budgetPct !== null
                    ? (Math.min(budgetPct, BUDGET_SCALE_CAP_PCT) / BUDGET_SCALE_CAP_PCT) * 100
                    : null;
                  return (
                    <div
                      key={cat.categoryId ?? NO_CATEGORY}
                      className="category-legend-row"
                      style={{ opacity: isDimmed ? 0.35 : 1, transition: 'opacity var(--duration-normal) ease' }}
                    >
                    <button
                      type="button"
                      className="category-legend-head"
                      aria-expanded={isParent ? isExpanded : undefined}
                      onClick={() => {
                        setSelectedCatIndex(i === selectedCatIndex ? null : i);
                        // Só a LISTA abre a subcategoria — tocar no donut continua sendo só
                        // destacar a fatia (decisão do dono).
                        if (isParent) setExpandedCatId(isExpanded ? null : cat.categoryId);
                      }}
                    >
                      {/* nome + valor */}
                      <div className="category-legend-name-row">
                        <span className="category-legend-dot" style={{ background: cat.color }} />
                        <span className={`category-legend-name${isSelected ? ' category-legend-name--selected' : ''}`}>
                          {cat.name}
                        </span>
                        {/* A seta é o único aviso de que a linha abre — sem ela, ninguém descobre. */}
                        {isParent && (
                          isExpanded
                            ? <ChevronUp size={13} className="text-secondary" style={{ flexShrink: 0 }} aria-hidden="true" />
                            : <ChevronDown size={13} className="text-secondary" style={{ flexShrink: 0 }} aria-hidden="true" />
                        )}
                        {/* Fatia do total (contexto do donut). O % do LIMITE fica ao lado da barra, abaixo. */}
                        <span title="do total gasto" className="category-legend-pct">{pct}%</span>
                        <span className="category-legend-value">
                          {formatMoney(cat.amountCents)}
                          {leafBudget ? ` / ${formatMoney(leafBudget.limitCents)}` : ''}
                        </span>
                      </div>
                      {/* barra de progresso + % do LIMITE (quando há orçamento) */}
                      <div className="category-legend-bar-row">
                        <div className="category-legend-bar-track">
                          <div
                            className="category-legend-bar-fill"
                            style={{
                              background: barColor,
                              width: budgetBarWidthPct !== null ? `${budgetBarWidthPct}%` : `${pct}%`,
                            }}
                          />
                          {leafBudget && (
                            <div
                              title={`Limite: ${formatMoney(leafBudget.limitCents)}`}
                              className="category-legend-bar-marker"
                              style={{ left: `${budgetMarkerLeftPct}%` }}
                            />
                          )}
                        </div>
                        {budgetPct !== null && (
                          <span title="do limite usado" className="category-legend-budget-pct" style={{ color: barColor }}>
                            {budgetPct}% <span>lim.</span>
                          </span>
                        )}
                      </div>
                    </button>

                    {/* expansão: as subcategorias, com % relativo ao PAI (não ao total do mês) */}
                    {isExpanded && (
                      <div className="category-legend-expand" style={{ borderLeftColor: cat.color }}>
                        {cat.children.map((child) => {
                          const isGeral = child.id === cat.categoryId;
                          // Guarda de NaN `[D8]`: o total do pai é o divisor e pode ser zero num
                          // mês de estorno. A lista já filtra total > 0, então isto é defesa em
                          // profundidade — "NaN%" é erro que a pessoa vê antes da gente.
                          const childPct = cat.amountCents > 0
                            ? Math.round((child.amountCents / cat.amountCents) * 100)
                            : null;
                          // Orçamento por SUBCATEGORIA: existe (bug real corrigido em 2026-08-01) —
                          // antes o orçamento era gravado normalmente mas nunca aparecia em lugar
                          // nenhum aqui, porque só a linha do PAI olhava `budgetByCategoryId`.
                          const childBudget = !isGeral ? budgetByCategoryId.get(child.id) : undefined;
                          const childBudgetPct = childBudget
                            ? Math.round((child.amountCents / childBudget.limitCents) * 100)
                            : null;
                          const childBudgetColor = childBudgetPct !== null
                            ? childBudgetPct >= 100 ? 'var(--danger)' : childBudgetPct >= 80 ? 'var(--warning)' : 'var(--success)'
                            : undefined;
                          return (
                            <div key={child.id} className="category-legend-expand-row">
                              <span
                                title={isGeral ? `Lançado direto em ${cat.name}, sem subcategoria` : undefined}
                                className="category-legend-expand-name"
                              >
                                {child.name}
                              </span>
                              {childPct !== null && (
                                <span title={`de ${cat.name}`} className="category-legend-expand-pct">
                                  {childPct}%
                                </span>
                              )}
                              <span className="category-legend-expand-value">
                                {formatMoney(child.amountCents)}
                                {childBudget ? ` / ${formatMoney(childBudget.limitCents)}` : ''}
                              </span>
                              {childBudgetPct !== null && (
                                <span title="do limite usado" className="category-legend-budget-pct" style={{ color: childBudgetColor }}>
                                  {childBudgetPct}% <span>lim.</span>
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {groupBudget && (
                          <p className="category-legend-budget-note">
                            Orçamento de {formatMoney(groupBudget.limitCents)} — conta só o que for lançado direto em {cat.name}, não as subcategorias.
                          </p>
                        )}
                      </div>
                    )}
                    </div>
                  );
                })}

                {spendingByCategory.length > 6 && (
                  <button
                    type="button"
                    className="list-toggle"
                    onClick={() => setShowAllCategories((v) => !v)}
                  >
                    {showAllCategories ? (
                      <>Ver menos <ChevronUp size={14} aria-hidden="true" /></>
                    ) : (
                      <>Ver todas as {spendingByCategory.length} categorias <ChevronDown size={14} aria-hidden="true" /></>
                    )}
                  </button>
                )}
                {selectedCatIndex !== null && (
                  <button
                    type="button"
                    onClick={() => setSelectedCatIndex(null)}
                    style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'none', border: 'none', padding: '0.1rem 0 0', cursor: 'pointer', textAlign: 'left' }}
                  >
                    Limpar seleção ×
                  </button>
                )}
              </div>
            </div>
          </>
        ) : isLoadingChartData ? (
          <LoadingState compact />
        ) : (
          <EmptyState
            illustration="wallet"
            compact
            title={isFutureMonth ? `Nada previsto em ${monthTitle}` : isCurrentMonth ? 'Nenhum gasto neste mês' : `Nenhum gasto em ${monthTitle}`}
            description={isFutureMonth
              ? 'Sem parcelas de cartão, contas a pagar ou recorrências previstas pra esse mês.'
              : 'Assim que uma despesa desse mês for lançada, ela aparece aqui dividida por categoria.'}
          />
        )}
      </article>

      {/* ── Recorrências previstas (só no mês futuro) ──────────────────────── */}
      {isFutureMonth && recurringProjected.length > 0 && (
        <article className="surface surface-pad" style={{ marginTop: '0.75rem' }}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Contas recorrentes previstas</p>
              <h2>{monthTitle}</h2>
            </div>
            <span className="page-badge">{formatMoney(recurringProjected.reduce((sum, r) => sum + r.amountCents, 0))}</span>
          </div>
          <p className="text-secondary" style={{ margin: '0.1rem 0 1rem', fontSize: '0.86rem' }}>
            Estimativa pelas suas recorrências ativas — pode mudar se você cancelar ou ajustar alguma.
          </p>
          <div className="item-list">
            {(showAllRecurring ? recurringProjected : recurringProjected.slice(0, 5)).map((r) => (
              <div className="list-row list-row--with-icon" key={r.id}>
                <CategoryMark category={r.categoryId ? categoryMap.get(r.categoryId) ?? null : null} />
                <div className="list-row-body">
                  <strong>{r.description}</strong>
                  <span className="text-secondary">{r.categoryId ? (categoryNames.get(r.categoryId) ?? 'Sem categoria') : 'Sem categoria'}</span>
                </div>
                <strong>{formatMoney(r.amountCents)}</strong>
              </div>
            ))}
          </div>
          {recurringProjected.length > 5 && (
            <button
              type="button"
              className="list-toggle"
              onClick={() => setShowAllRecurring((v) => !v)}
            >
              {showAllRecurring ? (
                <>Ver menos <ChevronUp size={14} aria-hidden="true" /></>
              ) : (
                <>Ver todas as {recurringProjected.length} recorrências <ChevronDown size={14} aria-hidden="true" /></>
              )}
            </button>
          )}
        </article>
      )}

      {/* ── Compras parceladas em andamento ────────────────────────────────── */}
      {ongoing.length > 0 && (
        <article className="surface surface-pad" style={{ marginTop: '0.75rem' }}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Compras parceladas</p>
              <h2>Em andamento</h2>
            </div>
          </div>
          <p className="text-secondary" style={{ margin: '0.1rem 0 1rem', fontSize: '0.86rem' }}>
            O valor cheio de cada compra. Na visão por categoria acima ele aparece diluído — só a parcela do mês pesa lá.
          </p>
          <div className="item-list">
            {(showAllOngoing ? ongoing : ongoing.slice(0, 3)).map((purchase) => {
              const catId = txnCategoryById.get(purchase.sourceTransactionId);
              return (
                <div className="list-row list-row--with-icon" key={purchase.sourceTransactionId}>
                  <CategoryMark category={catId ? categoryMap.get(catId) ?? null : null} />
                  <div className="list-row-body">
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.6rem' }}>
                      <strong>{purchase.description}</strong>
                      <strong style={{ flexShrink: 0 }}>{formatMoney(purchase.remainingCents)}</strong>
                    </div>
                    <span className="text-secondary">
                      {purchase.installmentTotal}x de {formatMoney(purchase.installmentValueCents)} · compra de {formatMoney(purchase.fullAmountCents)} · {purchase.remainingCount} {purchase.remainingCount === 1 ? 'parcela' : 'parcelas'} a vencer
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {ongoing.length > 3 && (
            <button
              type="button"
              className="list-toggle"
              onClick={() => setShowAllOngoing((v) => !v)}
            >
              {showAllOngoing ? (
                <>Ver menos <ChevronUp size={14} aria-hidden="true" /></>
              ) : (
                <>Ver todas as {ongoing.length} compras parceladas <ChevronDown size={14} aria-hidden="true" /></>
              )}
            </button>
          )}
        </article>
      )}

      {/* ── Barras: histórico 6 meses ──────────────────────────────────────── */}
      <article className="surface surface-pad" style={{ marginTop: '0.75rem' }}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Histórico mensal</p>
            <h2>Entradas e saídas</h2>
          </div>
        </div>

        {hasMonthlyData ? (
          <>
            <p className="text-secondary" style={{ margin: '0.1rem 0 1rem' }}>Últimos 6 meses</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} barGap={4} barCategoryGap="32%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => `${Math.round(v / 100)}`}
                  tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                  axisLine={false}
                  tickLine={false}
                  width={38}
                />
                <ReTooltip content={<BarTooltip />} cursor={{ fill: 'var(--bg-surface-subtle)', radius: 6 }} />
                <Bar dataKey="incomeCents" name="Entradas" fill="var(--success)" radius={[5, 5, 0, 0]} />
                <Bar dataKey="expenseCents" name="Saídas" fill="var(--danger)" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* legenda própria */}
            <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.75rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--success)', display: 'block' }} />
                Entradas
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--danger)', display: 'block' }} />
                Saídas
              </div>
            </div>
          </>
        ) : isLoadingChartData ? (
          <LoadingState compact />
        ) : (
          <EmptyState
            illustration="transactions"
            compact
            title="Sem movimentação ainda"
            description="Lance entradas e gastos pra ver a evolução mês a mês aqui."
          />
        )}
      </article>

      {/* ── Mais ações: agrupa os atalhos que antes eram ícones soltos no cabeçalho —
          sem rótulo visível, ficava impossível saber o que cada um fazia sem tocar. */}
      <BottomSheet open={actionsOpen} onClose={() => setActionsOpen(false)} title="Mais ações">
        <div className="sheet-option-list">
          <button
            className="sheet-option"
            type="button"
            onClick={() => { setActionsOpen(false); setBudgetOpen(true); }}
          >
            <span className="sheet-option-icon" aria-hidden="true"><Gauge size={18} /></span>
            <span className="sheet-option-text">
              <span className="sheet-option-label">Orçamentos por categoria</span>
              <span className="sheet-option-desc">Trave um limite mensal de gasto por categoria</span>
            </span>
          </button>
          <button
            className="sheet-option"
            type="button"
            onClick={() => { setActionsOpen(false); setTrendOpen(true); }}
          >
            <span className="sheet-option-icon" aria-hidden="true"><LineChart size={18} /></span>
            <span className="sheet-option-text">
              <span className="sheet-option-label">Tendência por categoria</span>
              <span className="sheet-option-desc">Veja a evolução de uma categoria mês a mês</span>
            </span>
          </button>
          <button
            className="sheet-option"
            type="button"
            onClick={() => { setActionsOpen(false); setAnnualOpen(true); }}
          >
            <span className="sheet-option-icon" aria-hidden="true"><Calendar size={18} /></span>
            <span className="sheet-option-text">
              <span className="sheet-option-label">Resumo anual</span>
              <span className="sheet-option-desc">Visão consolidada dos 12 meses</span>
            </span>
          </button>
          <button
            className="sheet-option"
            type="button"
            onClick={() => { setActionsOpen(false); handleExportCsv(); }}
          >
            <span className="sheet-option-icon" aria-hidden="true"><Download size={18} /></span>
            <span className="sheet-option-text">
              <span className="sheet-option-label">Exportar CSV</span>
              <span className="sheet-option-desc">Baixa as transações deste mês em planilha</span>
            </span>
          </button>
          <button
            className="sheet-option"
            type="button"
            onClick={() => { setActionsOpen(false); setSearchOpen(true); }}
          >
            <span className="sheet-option-icon" aria-hidden="true"><Search size={18} /></span>
            <span className="sheet-option-text">
              <span className="sheet-option-label">Buscar</span>
              <span className="sheet-option-desc">Encontre uma transação, conta ou compromisso</span>
            </span>
          </button>
          <button
            className="sheet-option"
            type="button"
            onClick={() => { setActionsOpen(false); openAnalysisTour(); }}
          >
            <span className="sheet-option-icon" aria-hidden="true"><HelpCircle size={18} /></span>
            <span className="sheet-option-text">
              <span className="sheet-option-label">Como funciona a Análise</span>
              <span className="sheet-option-desc">Reveja o tutorial desta tela</span>
            </span>
          </button>
        </div>
      </BottomSheet>

      <AnalysisTour />

      {/* ── Busca por texto ────────────────────────────────────────────────── */}
      <BottomSheet open={searchOpen} onClose={() => setSearchOpen(false)} title="Buscar" subtitle="Transações, contas e contas a pagar">
        <div className="form-stack">
          <label className="field search-field">
            <span>Termo</span>
            <div className="input-with-icon">
              <Search size={17} aria-hidden="true" />
              <input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Mercado, aluguel, salário…"
                autoFocus
              />
            </div>
          </label>

          {normalizedQuery && (
            results.length > 0 ? (
              <div className="item-list">
                {results.map((r) => (
                  <div className="list-row" key={`${r.kind}-${r.id}`}>
                    <div>
                      <strong>{r.title}</strong>
                      <span className="text-secondary">{r.kind} · {r.detail}</span>
                    </div>
                    <strong>{formatMoney(r.amountCents)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-secondary" style={{ margin: 0 }}>Nenhum resultado para "{query}".</p>
            )
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        open={budgetOpen}
        onClose={() => setBudgetOpen(false)}
        title="Orçamentos"
        subtitle="Defina um limite por categoria — ele vale todo mês"
      >
        <div className="form-stack">
          {budgetableCategories.map((cat) => {
            const value = budgetValues[cat.id] ?? '';
            const existingBudget = budgetByCategoryId.get(cat.id);
            return (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 500 }}>{cat.name}</span>
                <input
                  className="input input--money"
                  style={{ width: '9rem' }}
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setBudgetValues((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                  placeholder="0,00"
                  onBlur={() => {
                    const cents = parseMoneyToCents(value);
                    if (cents <= 0 || !workspaceId || !user) return;
                    if (existingBudget) {
                      updateBudgetLimit(workspaceId, cat.id, cents);
                    } else {
                      createBudget(workspaceId, user.uid, cat.id, cents);
                    }
                  }}
                />
                {existingBudget && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remover orçamento de ${cat.name}`}
                    title="Remover orçamento"
                    onClick={() => {
                      if (!workspaceId) return;
                      deleteBudget(workspaceId, cat.id);
                      setBudgetValues((prev) => {
                        const next = { ...prev };
                        delete next[cat.id];
                        return next;
                      });
                    }}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
          {budgetableCategories.length === 0 && (
            <p className="text-secondary" style={{ margin: 0 }}>Nenhuma categoria de despesa cadastrada.</p>
          )}
        </div>
      </BottomSheet>

      <AnnualSummarySheet
        open={annualOpen}
        onClose={() => setAnnualOpen(false)}
        workspaceId={workspaceId}
        transactions={finance.transactions}
        invoices={invoicesForSpending}
        categories={expenseCategories}
        excludedAccountIds={finance.excludedAccountIds}
        currentYear={new Date().getFullYear()}
      />

      <CategoryTrendSheet
        open={trendOpen}
        onClose={() => setTrendOpen(false)}
        months={last6Months}
        currentMonth={currentMonth}
        transactions={knownTransactions}
        invoices={invoicesForSpending}
        categories={expenseCategories}
        categoryOf={(id) => (id ? txnCategoryById.get(id) : undefined)}
        excludedAccountIds={finance.excludedAccountIds}
        purchaseMonthOf={purchaseMonthOf}
        initialCategoryId={selectedCat?.categoryId ?? topCat?.categoryId ?? undefined}
      />
    </section>
  );
}
