import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  ReferenceLine, Tooltip as ReTooltip, ResponsiveContainer,
} from 'recharts';
import { BottomSheet } from './BottomSheet';
import { EmptyState } from './EmptyState';
import { spendingByCategoryAcrossMonths, computeCategoryTrend } from '../finance/spendingAnalysis';
import type { InvoiceForSpending } from '../finance/spendingAnalysis';
import { formatMoney } from '../finance/money';
import { defaultCategoryColor, resolveCategoryColor } from '../theme/palette';
import type { Transaction } from '../types/contracts';

// Rótulo curto do mês pro eixo/tooltip. Espelha os labels da SearchPage (dado de apresentação,
// não lógica) — não vale extrair um util só por 12 strings estáticas.
const MONTH_ABBR: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr', '05': 'Mai', '06': 'Jun',
  '07': 'Jul', '08': 'Ago', '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
};
const monthAbbr = (key: string) => MONTH_ABBR[key.slice(5, 7)] ?? key;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Últimos 6 meses reais, em ordem cronológica. */
  months: string[];
  /** Mês corrente (o mais recente de `months`) — sai da média, marcado "em andamento". */
  currentMonth: string;
  transactions: Transaction[];
  invoices: InvoiceForSpending[];
  categories: { id: string; name: string; color?: string }[];
  categoryOf: (transactionId: string | undefined) => string | undefined;
  /** Categoria pra abrir focada (a destacada no donut, ou a maior). */
  initialCategoryId?: string;
}

interface ChartDatum {
  month: string;
  amountCents: number;
  isCurrent: boolean;
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartDatum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '0.65rem', padding: '0.5rem 0.8rem', boxShadow: 'var(--shadow-md)' }}>
      <p style={{ margin: '0 0 0.25rem', fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
        {monthAbbr(d.month)}{d.isCurrent ? ' · em andamento' : ''}
      </p>
      <strong style={{ fontSize: '0.9rem' }}>{formatMoney(d.amountCents)}</strong>
    </div>
  );
}

export function CategoryTrendSheet({
  open, onClose, months, currentMonth, transactions, invoices, categories, categoryOf, initialCategoryId,
}: Props) {
  const reducedMotion = useReducedMotion();

  const byCategory = useMemo(
    () => spendingByCategoryAcrossMonths(months, transactions, invoices, categoryOf),
    [months, transactions, invoices, categoryOf],
  );

  const categoryMeta = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const categoryName = (id: string) => categoryMeta.get(id)?.name ?? 'Sem categoria';
  const categoryColor = (id: string) => {
    const meta = categoryMeta.get(id);
    return meta ? resolveCategoryColor(meta) : defaultCategoryColor;
  };

  // Categorias com gasto na janela, maior total primeiro (a mais relevante fica logo à vista).
  const rankedCategories = useMemo(() => {
    const totals: { id: string; total: number }[] = [];
    for (const [id, byMonth] of byCategory) {
      let sum = 0;
      for (const cents of byMonth.values()) sum += cents;
      totals.push({ id, total: sum });
    }
    return totals.sort((a, b) => b.total - a.total).map((t) => t.id);
  }, [byCategory]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Ao abrir, foca na categoria pedida (destacada no donut / maior); reset a cada abertura.
  useEffect(() => {
    if (open) setSelectedId(initialCategoryId ?? null);
  }, [open, initialCategoryId]);

  const effectiveId = selectedId && rankedCategories.includes(selectedId)
    ? selectedId
    : rankedCategories[0] ?? null;

  const trend = useMemo(
    () => (effectiveId ? computeCategoryTrend(effectiveId, months, currentMonth, byCategory) : null),
    [effectiveId, months, currentMonth, byCategory],
  );

  const chartData: ChartDatum[] = trend
    ? trend.series.map((m) => ({ month: m.month, amountCents: m.amountCents, isCurrent: m.isCurrent }))
    : [];

  const monthsWithSpend = trend ? trend.series.filter((m) => m.amountCents > 0).length : 0;
  const sparse = monthsWithSpend > 0 && monthsWithSpend < 2;
  const hasBase = !!trend && trend.vsAveragePct !== null;
  const barColor = effectiveId ? categoryColor(effectiveId) : defaultCategoryColor;

  const pct = trend?.vsAveragePct ?? 0;
  const VerdictIcon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  const verdictWord = pct > 0 ? 'acima da média' : pct < 0 ? 'abaixo da média' : 'na média';

  return (
    <BottomSheet open={open} onClose={onClose} title="Tendência por categoria" subtitle="Quanto foi pra cada categoria, mês a mês">
      {rankedCategories.length === 0 || !trend || !effectiveId ? (
        <EmptyState
          illustration="transactions"
          compact
          title="Nada pra comparar ainda"
          description="Assim que você registrar gastos, dá pra ver quanto vai em cada categoria, mês a mês."
        />
      ) : (
        <>
          {/* Seletor de categoria — trilho rolável, seleção exclusiva (radiogroup). */}
          <div className="chip-row chip-row--scroll" role="radiogroup" aria-label="Categoria" style={{ marginBottom: '1rem' }}>
            {rankedCategories.map((id) => {
              const active = id === effectiveId;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`chip${active ? ' chip--active' : ''}`}
                  onClick={() => setSelectedId(id)}
                >
                  <span aria-hidden="true" style={{ width: '0.55rem', height: '0.55rem', borderRadius: '50%', background: categoryColor(id), flexShrink: 0 }} />
                  {categoryName(id)}
                </button>
              );
            })}
          </div>

          {/* Stat-herói — responde a pergunta em texto grande antes do gráfico. */}
          <article className="surface surface-pad metric-card metric-card--accent" style={{ marginBottom: '0.75rem' }}>
            {hasBase ? (
              <>
                <p className="eyebrow">Média mensal</p>
                <strong className="display-number" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.4rem)' }}>
                  {formatMoney(trend.averageCents)}
                </strong>
                <span className="metric-card-sub">por mês em {categoryName(effectiveId)}, nos últimos 6 meses</span>
                <span className="metric-card-sub" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.4rem' }}>
                  <VerdictIcon size={13} aria-hidden="true" />
                  Este mês: {formatMoney(trend.currentCents)} · {Math.abs(pct)}% {verdictWord} · ainda em andamento
                </span>
              </>
            ) : (
              <>
                <p className="eyebrow">Total em {categoryName(effectiveId)}</p>
                <strong className="display-number" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.4rem)' }}>
                  {formatMoney(trend.totalCents)}
                </strong>
                <span className="metric-card-sub">poucos meses com gasto nesta categoria pra comparar</span>
              </>
            )}
          </article>

          {/* Gráfico de barras — evidência. Mês atual mais claro + "em andamento" em palavras (herói/tooltip). */}
          <div role="img" aria-label={`Gasto em ${categoryName(effectiveId)} nos últimos 6 meses`} style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 40, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="month" tickFormatter={monthAbbr} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border-subtle)' }} tickLine={false} />
                <YAxis tickFormatter={(v: number) => formatMoney(v)} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={64} />
                <ReTooltip content={<TrendTooltip />} cursor={{ fill: 'var(--action-primary-soft)' }} />
                {trend.averageCents > 0 && (
                  <ReferenceLine
                    y={trend.averageCents}
                    stroke="var(--text-secondary)"
                    strokeDasharray="4 4"
                    label={{ value: 'média', position: 'right', fontSize: 10, fill: 'var(--text-secondary)' }}
                  />
                )}
                <Bar dataKey="amountCents" radius={[4, 4, 0, 0]} isAnimationActive={!reducedMotion}>
                  {chartData.map((d) => (
                    <Cell key={d.month} fill={barColor} fillOpacity={d.isCurrent ? 0.45 : 1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {sparse && (
            <p className="text-secondary" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', textAlign: 'center' }}>
              Poucos meses com gasto nesta categoria pra comparar.
            </p>
          )}

          {/* Stats secundárias. */}
          {trend.maxMonth && trend.minMonth && (
            <div className="metric-strip" style={{ marginTop: '1rem' }}>
              <article className="surface surface-pad metric-card">
                <p className="eyebrow">Maior mês</p>
                <strong className="metric-card-value--compact">{formatMoney(trend.maxMonth.amountCents)}</strong>
                <span className="metric-card-sub">{monthAbbr(trend.maxMonth.month)}</span>
              </article>
              <article className="surface surface-pad metric-card">
                <p className="eyebrow">Menor mês</p>
                <strong className="metric-card-value--compact">{formatMoney(trend.minMonth.amountCents)}</strong>
                <span className="metric-card-sub">{monthAbbr(trend.minMonth.month)}</span>
              </article>
              <article className="surface surface-pad metric-card">
                <p className="eyebrow">Total (6 meses)</p>
                <strong className="metric-card-value--compact">{formatMoney(trend.totalCents)}</strong>
                <span className="metric-card-sub">somando tudo</span>
              </article>
            </div>
          )}
        </>
      )}
    </BottomSheet>
  );
}
