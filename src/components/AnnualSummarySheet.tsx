import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer,
} from 'recharts';
import { BottomSheet } from './BottomSheet';
import { computeAnnualSummary } from '../finance/annualSummaryCalculations';
import { formatMoney } from '../finance/money';
import { categoryColors, defaultCategoryColor, defaultCategoryColors } from '../theme/palette';
import type { Transaction } from '../types/contracts';
import type { InvoiceForSpending } from '../finance/spendingAnalysis';

function resolveCategoryColor(category: { id: string; color?: string }) {
  if (category.color) return category.color;
  if (defaultCategoryColors[category.id]) return defaultCategoryColors[category.id];
  let hash = 0;
  for (let i = 0; i < category.id.length; i += 1) {
    hash = (hash * 31 + category.id.charCodeAt(i)) >>> 0;
  }
  return categoryColors[hash % categoryColors.length];
}

const FULL_MONTH_NAMES: Record<string, string> = {
  'Jan': 'Janeiro', 'Fev': 'Fevereiro', 'Mar': 'Março', 'Abr': 'Abril',
  'Mai': 'Maio', 'Jun': 'Junho', 'Jul': 'Julho', 'Ago': 'Agosto',
  'Set': 'Setembro', 'Out': 'Outubro', 'Nov': 'Novembro', 'Dez': 'Dezembro',
};

interface Props {
  open: boolean;
  onClose: () => void;
  transactions: Transaction[];
  invoices: InvoiceForSpending[];
  categories: { id: string; name: string; color?: string }[];
  currentYear: number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
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

export function AnnualSummarySheet({ open, onClose, transactions, invoices, categories, currentYear }: Props) {
  const [year, setYear] = useState(currentYear);

  const categoryNames = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const summary = useMemo(
    () => computeAnnualSummary(year, transactions, invoices, categoryNames),
    [year, transactions, invoices, categoryNames],
  );

  const chartData = useMemo(
    () =>
      summary.monthlyBreakdown.map((m) => ({
        month: m.monthLabel,
        Entradas: m.incomeCents,
        Saídas: m.expenseCents,
      })),
    [summary.monthlyBreakdown],
  );

  return (
    <BottomSheet open={open} onClose={onClose} title={`Resumo de ${year}`}>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <button className="icon-button" type="button" aria-label="Ano anterior" onClick={() => setYear((y) => y - 1)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <strong style={{ fontSize: '1.1rem', minWidth: '5rem', textAlign: 'center' }}>{year}</strong>
        <button className="icon-button" type="button" aria-label="Próximo ano" disabled={year >= currentYear} onClick={() => setYear((y) => y + 1)}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      {/* Hero: savings rate */}
      <article className="surface surface-pad metric-card metric-card--accent" style={{ marginBottom: '0.75rem' }}>
        <p className="eyebrow">Taxa de poupança</p>
        <strong className="display-number" style={{ color: 'var(--on-accent-95)', fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 800 }}>
          {summary.savingsRate}%
        </strong>
        <span className="metric-card-sub" style={{ color: 'var(--on-accent-55)' }}>
          {formatMoney(summary.savingsCents)} economizados de {formatMoney(summary.totalIncomeCents)}
        </span>
      </article>

      {/* KPI strip */}
      <div className="metric-strip" style={{ marginBottom: '1rem' }}>
        <article className="surface surface-pad metric-card">
          <p className="eyebrow">Entradas</p>
          <strong style={{ color: 'var(--success)' }}>{formatMoney(summary.totalIncomeCents)}</strong>
        </article>
        <article className="surface surface-pad metric-card">
          <p className="eyebrow">Saídas</p>
          <strong style={{ color: 'var(--danger)' }}>{formatMoney(summary.totalExpenseCents)}</strong>
        </article>
      </div>

      {/* Best / worst month */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
        {summary.bestMonth && (
          <div className="notice" style={{ fontSize: '0.82rem' }}>
            <strong style={{ color: 'var(--success)' }}>Melhor mês</strong>
            <br />
            <span>{FULL_MONTH_NAMES[summary.bestMonth.monthLabel] ?? summary.bestMonth.monthLabel}: economizou {formatMoney(summary.bestMonth.savingsCents)}</span>
          </div>
        )}
        {summary.worstMonth && (
          <div className="notice notice--danger" style={{ fontSize: '0.82rem' }}>
            <strong style={{ color: 'var(--danger)' }}>Pior mês</strong>
            <br />
            <span>{FULL_MONTH_NAMES[summary.worstMonth.monthLabel] ?? summary.worstMonth.monthLabel}: déficit de {formatMoney(Math.abs(summary.worstMonth.deficitCents))}</span>
          </div>
        )}
      </div>

      {/* Top categories */}
      {summary.topCategories.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>Top categorias</p>
          {summary.topCategories.map((cat) => (
            <div key={cat.categoryId} className="list-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: '8rem' }}>
                <span style={{ width: '0.6rem', height: '0.6rem', borderRadius: '50%', background: resolveCategoryColor({ id: cat.categoryId }), flexShrink: 0 }} />
                <span style={{ fontSize: '0.85rem' }}>{cat.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatMoney(cat.amountCents)}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cat.percentage}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Monthly chart */}
      <div>
        <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>Mês a mês</p>
        <div style={{ height: '220px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border-subtle)' }} tickLine={false} />
              <YAxis tickFormatter={(val: number) => formatMoney(val)} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={64} />
              <ReTooltip content={<ChartTooltip />} />
              <Bar dataKey="Entradas" fill="var(--success)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Saídas" fill="var(--danger)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </BottomSheet>
  );
}
