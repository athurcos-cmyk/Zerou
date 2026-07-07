import { useMemo, useState } from 'react';
import { Search, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { toDateInputValue } from '../finance/financeDates';
import { billStatusLabels, transactionTypeLabels } from '../finance/financeLabels';
import { formatMoney } from '../finance/money';
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

function monthLabel(key: string) {
  const [, mm] = key.split('-');
  return MONTH_LABELS[mm] ?? mm;
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

function KpiCard({ label, value, sub, accent = false, icon }: {
  label: string; value: string; sub?: string; accent?: boolean; icon?: React.ReactNode;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: accent ? 'var(--action-primary)' : 'var(--bg-surface)',
      border: accent ? 'none' : '1px solid var(--border-subtle)',
      borderRadius: '1rem',
      padding: '0.85rem 1rem',
      display: 'flex', flexDirection: 'column', gap: '0.25rem',
    }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: accent ? 'var(--on-accent-85)' : 'var(--text-secondary)' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        {icon && <span style={{ color: accent ? 'var(--accent-foreground)' : 'var(--text-primary)' }}>{icon}</span>}
        <strong style={{ fontSize: '1.05rem', fontWeight: 800, color: accent ? 'var(--accent-foreground)' : 'var(--text-primary)', lineHeight: 1.2 }}>
          {value}
        </strong>
      </div>
      {sub && (
        <span style={{ fontSize: '0.72rem', color: accent ? 'var(--on-accent-55)' : 'var(--text-secondary)' }}>
          {sub}
        </span>
      )}
    </div>
  );
}

// ─── componente principal ──────────────────────────────────────────────────────

export function SearchPage() {
  const finance = useFinanceContext();
  const [query, setQuery] = useState('');
  const [selectedCatIndex, setSelectedCatIndex] = useState<number | null>(null);

  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const currentMonth = new Date().toISOString().slice(0, 7);
  const last6Months = getLastNMonths(6);

  const categoryMap = new Map(finance.categories.map((c) => [c.id, c]));
  const categoryNames = new Map(finance.categories.map((c) => [c.id, c.name]));

  // ── gastos do mês atual por categoria ─────────────────────────────────────
  const spendingByCategory = useMemo(() => {
    const totals = new Map<string, { name: string; amountCents: number; color: string }>();
    for (const t of finance.transactions) {
      if (t.deletedAt) continue;
      if (t.type !== 'expense' && t.type !== 'card_purchase') continue;
      if (t.cashMonth !== currentMonth && t.competenceMonth !== currentMonth) continue;
      if (t.tags?.includes('meta') || t.tags?.includes('cofrinho')) continue;
      const catId = t.categoryId ?? '__none__';
      const catName = t.categoryId ? (categoryNames.get(t.categoryId) ?? 'Sem categoria') : 'Sem categoria';
      const cat = t.categoryId ? categoryMap.get(t.categoryId) : null;
      const color = cat ? resolveCategoryColor(cat) : defaultCategoryColor;
      const prev = totals.get(catId);
      totals.set(catId, { name: catName, amountCents: (prev?.amountCents ?? 0) + t.amountCents, color });
    }
    return [...totals.values()].sort((a, b) => b.amountCents - a.amountCents);
  }, [finance.transactions, finance.categories, currentMonth]);

  const totalSpent = spendingByCategory.reduce((s, c) => s + c.amountCents, 0);

  // ── histórico mensal (6 meses) ─────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    return last6Months.map((month) => {
      let incomeCents = 0;
      let expenseCents = 0;
      for (const t of finance.transactions) {
        if (t.deletedAt) continue;
        const m = t.cashMonth ?? t.competenceMonth;
        if (m !== month) continue;
        if (t.tags?.includes('meta') || t.tags?.includes('cofrinho')) continue;
        if (t.type === 'income') incomeCents += t.amountCents;
        else if (t.type === 'expense' || t.type === 'card_purchase') expenseCents += t.amountCents;
      }
      return { month: monthLabel(month), incomeCents, expenseCents };
    });
  }, [finance.transactions, last6Months]);

  // ── variação mês a mês ─────────────────────────────────────────────────────
  const prevExpense = monthlyData[4]?.expenseCents ?? 0;
  const thisExpense = monthlyData[5]?.expenseCents ?? 0;
  const variation = prevExpense > 0
    ? Math.round(((thisExpense - prevExpense) / prevExpense) * 100)
    : null;

  // ── busca por texto ────────────────────────────────────────────────────────
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    const transactions = finance.transactions
      .filter((t) => !t.deletedAt)
      .filter((t) =>
        [t.description, t.merchant, t.notes, t.tags.join(' ')]
          .filter(Boolean).join(' ')
          .toLocaleLowerCase('pt-BR')
          .includes(normalizedQuery)
      )
      .map((t) => ({ id: t.id, kind: 'Transação', title: t.description, detail: `${transactionTypeLabels[t.type]} · ${toDateInputValue(t.date)}`, amountCents: t.amountCents }));

    const bills = finance.bills
      .filter((b) => b.description.toLocaleLowerCase('pt-BR').includes(normalizedQuery))
      .map((b) => ({ id: b.id, kind: 'Conta a pagar', title: b.description, detail: `${billStatusLabels[b.status]} · ${toDateInputValue(b.dueDate)}`, amountCents: b.amountCents }));

    const accounts = finance.accounts
      .filter((a) => a.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery))
      .map((a) => ({ id: a.id, kind: 'Conta', title: a.name, detail: 'Conta financeira', amountCents: a.openingBalanceCents }));

    return [...transactions, ...bills, ...accounts].slice(0, 25);
  }, [finance.accounts, finance.bills, finance.transactions, normalizedQuery]);

  const selectedCat = selectedCatIndex !== null ? spendingByCategory[selectedCatIndex] : null;
  const topCat = spendingByCategory[0] ?? null;

  return (
    <section className="page-content page-content--narrow">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Análise</p>
          <h1 className="page-title page-title--compact">Seus gastos</h1>
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
        <KpiCard
          accent
          label="Gasto no mês"
          value={totalSpent > 0 ? formatMoney(totalSpent) : 'R$ 0'}
        />
        <KpiCard
          label="Maior categoria"
          value={topCat?.name ?? '—'}
          sub={topCat ? formatMoney(topCat.amountCents) : undefined}
        />
        <KpiCard
          label="vs. mês anterior"
          value={variation !== null ? `${variation > 0 ? '+' : ''}${variation}%` : '—'}
          sub={variation !== null ? (variation > 0 ? 'gastou mais' : variation < 0 ? 'gastou menos' : 'igual') : 'sem dados'}
          icon={
            variation === null ? undefined :
            variation > 0 ? <TrendingUp size={15} /> :
            variation < 0 ? <TrendingDown size={15} /> :
            <Minus size={15} />
          }
        />
      </div>

      {/* ── Donut + legenda ─────────────────────────────────────────────────── */}
      <article className="surface surface-pad" style={{ marginTop: '0.75rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>Por categoria</p>
          <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {totalSpent > 0 ? `Este mês · ${formatMoney(totalSpent)} total` : 'Nenhum gasto registrado este mês.'}
          </p>
        </div>

        {totalSpent > 0 && (
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

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
                        style={{ outline: 'none', transition: 'opacity 200ms ease' }}
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
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {spendingByCategory.slice(0, 6).map((cat, i) => {
                const pct = Math.round((cat.amountCents / totalSpent) * 100);
                const isSelected = selectedCatIndex === i;
                const isDimmed = selectedCatIndex !== null && !isSelected;
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => setSelectedCatIndex(i === selectedCatIndex ? null : i)}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      opacity: isDimmed ? 0.35 : 1,
                      transition: 'opacity 200ms ease',
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
                      </span>
                    </div>
                    {/* barra de progresso */}
                    <div style={{ height: 4, borderRadius: 999, background: 'var(--border-subtle)', overflow: 'hidden' }}>
                      <div style={{
                        height: 4, borderRadius: 999,
                        background: cat.color,
                        width: `${pct}%`,
                        transition: 'width 400ms ease',
                      }} />
                    </div>
                  </button>
                );
              })}

              {spendingByCategory.length > 6 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0' }}>
                  +{spendingByCategory.length - 6} categorias menores
                </p>
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
        )}
      </article>

      {/* ── Barras: histórico 6 meses ──────────────────────────────────────── */}
      <article className="surface surface-pad" style={{ marginTop: '0.75rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>Histórico mensal</p>
          <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Entradas e saídas · últimos 6 meses
          </p>
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthlyData} barGap={4} barCategoryGap="32%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
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
            <Bar dataKey="expenseCents" name="Saídas" fill="var(--action-primary)" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        {/* legenda própria */}
        <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.75rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--success)', display: 'block' }} />
            Entradas
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--action-primary)', display: 'block' }} />
            Saídas
          </div>
        </div>
      </article>

      {/* ── Busca por texto ────────────────────────────────────────────────── */}
      <div style={{ marginTop: '0.75rem' }}>
        <p style={{ margin: '0 0 0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>Buscar</p>
        <label className="field search-field">
          <span>Termo</span>
          <div className="input-with-icon">
            <Search size={17} aria-hidden="true" />
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Mercado, aluguel, salário…"
            />
          </div>
        </label>
      </div>

      {(normalizedQuery || results.length > 0) && (
        <article className="surface surface-pad" style={{ marginTop: '0.5rem' }}>
          {results.length > 0 ? (
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
          )}
        </article>
      )}
    </section>
  );
}
