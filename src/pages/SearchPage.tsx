import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Minus, Plus, Search, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useAuth } from '../auth/AuthContext';
import { AnnualSummarySheet } from '../components/AnnualSummarySheet';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { mergeInvoicesWithLedger, useInvoiceLedger } from '../cards/useInvoiceLedger';
import { formatFriendlyDate, toDate } from '../finance/financeDates';
import { dedupeById, nextOccurrenceDate } from '../finance/financeService';
import { useMonthlyTransactions } from '../finance/useMonthlyTransactions';
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
  spendingByCategoryForMonth,
  NO_CATEGORY,
  type BillForCommitment,
  type InvoiceForSpending,
  type RecurringForProjection
} from '../finance/spendingAnalysis';
import { categoryColors, defaultCategoryColor, defaultCategoryColors } from '../theme/palette';

// ─── helpers ──────────────────────────────────────────────────────────────────

function resolveCategoryColor(category: { id: string; color?: string }) {
  if (category.color) return category.color;
  if (defaultCategoryColors[category.id]) return defaultCategoryColors[category.id];
  let hash = 0;
  for (let i = 0; i < category.id.length; i += 1) {
    hash = (hash * 31 + category.id.charCodeAt(i)) >>> 0;
  }
  return categoryColors[hash % categoryColors.length];
}

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

const FULL_MONTH_NAMES: Record<string, string> = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro',
};

function monthLabel(key: string) {
  const [, mm] = key.split('-');
  return MONTH_LABELS[mm] ?? mm;
}

function fullMonthLabel(key: string) {
  const [yyyy, mm] = key.split('-');
  return `${FULL_MONTH_NAMES[mm] ?? mm} de ${yyyy}`;
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

function DonutTooltip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; amountCents: number } }[] }) {
  if (!active || !payload?.length) return null;
  const { name, amountCents } = payload[0].payload;
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '0.65rem', padding: '0.5rem 0.85rem', boxShadow: 'var(--shadow-md)' }}>
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{name}</p>
      <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>{formatMoney(amountCents)}</p>
    </div>
  );
}

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
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [annualOpen, setAnnualOpen] = useState(false);
  const [budgetValues, setBudgetValues] = useState<Record<string, string>>({});

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
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');

  // SearchPage é a única tela que precisa do ledger de TODAS as faturas de TODOS os cartões
  // (análise de gasto por mês/categoria cruza tudo) — carregado sob demanda só quando esta
  // página abre, ao contrário do boot global (`useCardsData`, que não assina ledger nenhum).
  const invoiceRefs = useMemo(
    () => cardsData.invoices.map((inv) => ({ id: inv.id, cardId: inv.cardId })),
    [cardsData.invoices]
  );
  const ledgerEntries = useInvoiceLedger(workspaceId, invoiceRefs, finance.transactionIndex);
  // Faturas reduzidas ao que a Análise precisa (referenceMonth + ledger por parcela).
  const invoicesForSpending = useMemo<InvoiceForSpending[]>(
    () =>
      mergeInvoicesWithLedger(cardsData.invoices, ledgerEntries).map((inv) => ({
        referenceMonth: inv.referenceMonth,
        ledgerEntries: inv.ledgerEntries
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
  // Contas a pagar reduzidas ao que a projeção futura precisa (mês do vencimento resolvido aqui).
  const billsForCommitment = useMemo<BillForCommitment[]>(
    () =>
      finance.bills.map((b) => {
        const due = toDate(b.dueDate);
        return {
          categoryId: b.categoryId,
          amountCents: b.amountCents,
          status: b.status,
          dueMonth: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}`
        };
      }),
    [finance.bills]
  );
  // Recorrências (sempre despesa) reduzidas ao que a projeção precisa.
  const rulesForProjection = useMemo<RecurringForProjection[]>(
    () =>
      finance.recurringRules.map((r) => ({
        id: r.id,
        description: r.description,
        categoryId: r.categoryId,
        amountCents: r.amountCents ?? 0,
        frequency: r.frequency,
        nextOccurrenceAt: toDate(r.nextOccurrenceAt),
        anchorDay: r.anchorDay,
        isActive: r.isActive
      })),
    [finance.recurringRules]
  );
  const hasProjectableRecurring = useMemo(
    () => rulesForProjection.some((r) => r.isActive && r.amountCents > 0),
    [rulesForProjection]
  );
  // Até onde a navegação pra frente pode ir: última parcela/conta comprometida, ou — se há
  // recorrência ativa — pelo menos 12 meses à frente (recorrência é "infinita", precisa de teto).
  const maxMonth = useMemo(() => {
    const committed = lastCommittedMonth(currentMonth, invoicesForSpending, billsForCommitment);
    const recurringHorizon = hasProjectableRecurring ? shiftMonth(currentMonth, 12) : currentMonth;
    return recurringHorizon > committed ? recurringHorizon : committed;
  }, [currentMonth, invoicesForSpending, billsForCommitment, hasProjectableRecurring]);
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
      totals = committedByCategoryForMonth(selectedMonth, invoicesForSpending, billsForCommitment, catOf);
      for (const [cat, cents] of recurringByCategoryForMonth(selectedMonth, rulesForProjection, nextOccurrenceDate)) {
        totals.set(cat, (totals.get(cat) ?? 0) + cents);
      }
    } else {
      totals = spendingByCategoryForMonth(selectedMonth, knownTransactions, invoicesForSpending, catOf);
    }
    return [...totals.entries()]
      .filter(([, amountCents]) => amountCents > 0) // mês só de estorno pode zerar/inverter uma categoria
      .map(([catId, amountCents]) => {
        const isNone = catId === NO_CATEGORY;
        const cat = isNone ? null : categoryMap.get(catId);
        return {
          categoryId: isNone ? null : catId,
          name: isNone ? 'Sem categoria' : (categoryNames.get(catId) ?? 'Sem categoria'),
          amountCents,
          color: cat ? resolveCategoryColor(cat) : defaultCategoryColor
        };
      })
      .sort((a, b) => b.amountCents - a.amountCents);
  }, [knownTransactions, invoicesForSpending, billsForCommitment, rulesForProjection, isFutureMonth, txnCategoryById, categoryMap, categoryNames, selectedMonth]);

  const totalSpent = spendingByCategory.reduce((s, c) => s + c.amountCents, 0);

  const budgetByCategoryId = useMemo(
    () => new Map(finance.budgets.filter((b) => b.isActive).map((b) => [b.categoryId, b])),
    [finance.budgets]
  );

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
      monthlyTotals(last6Months, knownTransactions, invoicesForSpending).map((m) => ({
        month: monthLabel(m.month),
        incomeCents: m.incomeCents,
        expenseCents: m.expenseCents
      })),
    [knownTransactions, invoicesForSpending, last6Months]
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
          id ? txnCategoryById.get(id) : undefined
        )
      ),
    [knownTransactions, invoicesForSpending, txnCategoryById, comparisonMonth]
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
    setShowAllCategories(false);
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
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Análise</p>
          <h1 className="page-title page-title--compact">Seus gastos</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button className="icon-button" type="button" aria-label="Resumo anual" title="Resumo anual" onClick={() => setAnnualOpen(true)}>
            <Calendar size={18} aria-hidden="true" />
          </button>
          <button className="icon-button" type="button" aria-label="Exportar CSV" onClick={handleExportCsv}>
            <Download size={18} aria-hidden="true" />
          </button>
          <button className="icon-button" type="button" aria-label="Buscar" onClick={() => setSearchOpen(true)}>
            <Search size={18} aria-hidden="true" />
          </button>
        </div>
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

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="metric-strip">
        <MetricCard
          accent
          label={isFutureMonth ? 'Previsto no mês' : 'Gasto no mês'}
          value={totalSpent > 0 ? formatMoney(totalSpent) : 'R$ 0'}
        />
        <MetricCard
          long
          label="Maior categoria"
          value={topCat?.name ?? '—'}
          sub={topCat ? formatMoney(topCat.amountCents) : undefined}
        />
        {isFutureMonth ? (
          <MetricCard
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
            <p className="text-secondary" style={{ margin: '0.1rem 0 1rem' }}>{formatMoney(totalSpent)} no total</p>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>

              {/* donut */}
              <div style={{ position: 'relative', flexShrink: 0, width: 200, height: 200 }}>
                <ResponsiveContainer width={200} height={200}>
                  <PieChart>
                    <Pie
                      data={spendingByCategory}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={88}
                      dataKey="amountCents"
                      nameKey="name"
                      paddingAngle={2}
                      startAngle={90}
                      endAngle={-270}
                      onClick={(_, index) => setSelectedCatIndex(index === selectedCatIndex ? null : index)}
                      style={{ cursor: 'pointer' }}
                    >
                      {spendingByCategory.map((cat, i) => (
                        <Cell
                          key={cat.name}
                          fill={cat.color}
                          opacity={selectedCatIndex === null || selectedCatIndex === i ? 1 : 0.2}
                          stroke={selectedCatIndex === i ? 'var(--bg-surface)' : 'transparent'}
                          strokeWidth={selectedCatIndex === i ? 3 : 0}
                          style={{ outline: 'none', transition: 'opacity var(--duration-normal) ease' }}
                        />
                      ))}
                    </Pie>
                    <ReTooltip content={<DonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>

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
                  const budget = cat.categoryId ? budgetByCategoryId.get(cat.categoryId) : undefined;
                  const budgetPct = budget ? Math.round((cat.amountCents / budget.limitCents) * 100) : null;
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
                    <button
                      key={cat.name}
                      type="button"
                      onClick={() => setSelectedCatIndex(i === selectedCatIndex ? null : i)}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                        opacity: isDimmed ? 0.35 : 1,
                        transition: 'opacity var(--duration-normal) ease',
                      }}
                    >
                      {/* nome + valor */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.3rem' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0, display: 'block' }} />
                        <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: isSelected ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cat.name}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{pct}%</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, flexShrink: 0, minWidth: '4.5rem', textAlign: 'right' }}>
                          {formatMoney(cat.amountCents)}
                          {budget ? ` / ${formatMoney(budget.limitCents)}` : ''}
                        </span>
                      </div>
                      {/* barra de progresso */}
                      <div style={{ height: 4, borderRadius: 999, background: 'var(--border-subtle)', overflow: 'hidden', position: 'relative' }}>
                        <div style={{
                          height: 4, borderRadius: 999,
                          background: barColor,
                          width: budgetBarWidthPct !== null ? `${budgetBarWidthPct}%` : `${pct}%`,
                          transition: 'width var(--duration-slow) ease',
                        }} />
                        {budget && (
                          <div
                            title={`Limite: ${formatMoney(budget.limitCents)}`}
                            style={{
                              position: 'absolute', top: 0, height: 4,
                              left: `${budgetMarkerLeftPct}%`, width: 2,
                              background: 'var(--text-secondary)',
                              borderRadius: 1,
                            }}
                          />
                        )}
                      </div>
                    </button>
                  );
                })}

                {spendingByCategory.length > 6 && (
                  <button
                    type="button"
                    onClick={() => setShowAllCategories((v) => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                      fontSize: '0.78rem', fontWeight: 600, color: 'var(--action-primary)',
                      background: 'none', border: 'none', padding: '0.15rem 0 0', cursor: 'pointer',
                    }}
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
          </div>
          <p className="text-secondary" style={{ margin: '0.1rem 0 1rem', fontSize: '0.86rem' }}>
            Estimativa pelas suas recorrências ativas — pode mudar se você cancelar ou ajustar alguma.
          </p>
          <div className="item-list">
            {recurringProjected.map((r) => (
              <div className="list-row" key={r.id}>
                <div>
                  <strong>{r.description}</strong>
                  <span className="text-secondary">{r.categoryId ? (categoryNames.get(r.categoryId) ?? 'Sem categoria') : 'Sem categoria'}</span>
                </div>
                <strong>{formatMoney(r.amountCents)}</strong>
              </div>
            ))}
          </div>
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
            {ongoing.map((purchase) => (
              <div className="list-row" key={purchase.sourceTransactionId}>
                <div>
                  <strong>{purchase.description}</strong>
                  <span className="text-secondary">
                    {purchase.installmentTotal}x de {formatMoney(purchase.installmentValueCents)} · compra de {formatMoney(purchase.fullAmountCents)}
                  </span>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <strong>{formatMoney(purchase.remainingCents)}</strong>
                  <span className="text-secondary" style={{ display: 'block' }}>
                    {purchase.remainingCount} {purchase.remainingCount === 1 ? 'parcela' : 'parcelas'} a vencer
                  </span>
                </div>
              </div>
            ))}
          </div>
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
        ) : (
          <EmptyState
            illustration="transactions"
            compact
            title="Sem movimentação ainda"
            description="Lance entradas e gastos pra ver a evolução mês a mês aqui."
          />
        )}
      </article>

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
          {expenseCategories.map((cat) => {
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
          {expenseCategories.length === 0 && (
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
        currentYear={new Date().getFullYear()}
      />
    </section>
  );
}
