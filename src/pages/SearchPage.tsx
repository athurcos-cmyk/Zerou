import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
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

// ─── custom tooltip do donut ──────────────────────────────────────────────────

function DonutTooltip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; amountCents: number } }[] }) {
  if (!active || !payload?.length) return null;
  const { name, amountCents } = payload[0].payload;
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '0.65rem', padding: '0.5rem 0.85rem', boxShadow: 'var(--shadow-md)' }}>
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{name}</p>
      <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>{formatMoney(amountCents)}</p>
    </div>
  );
}

// ─── custom tooltip das barras ────────────────────────────────────────────────

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '0.65rem', padding: '0.6rem 0.9rem', boxShadow: 'var(--shadow-md)', minWidth: '9rem' }}>
      <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.85rem' }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <strong>{formatMoney(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}

// ─── componente principal ─────────────────────────────────────────────────────

export function SearchPage() {
  const finance = useFinanceContext();
  const [query, setQuery] = useState('');
  const [selectedCatIndex, setSelectedCatIndex] = useState<number | null>(null);

  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const currentMonth = new Date().toISOString().slice(0, 7);
  const last6Months = getLastNMonths(6);

  const categoryMap = new Map(finance.categories.map((c) => [c.id, c]));
  const categoryNames = new Map(finance.categories.map((c) => [c.id, c.name]));

  // ── gastos do mês atual por categoria ──────────────────────────────────────
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

  return (
    <section className="page-content page-content--narrow">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Análise</p>
          <h1 className="page-title page-title--compact">Seus gastos</h1>
        </div>
      </div>

      {/* ── Donut: gastos por categoria ── */}
      <article className="surface surface-pad">
        <p className="eyebrow" style={{ marginBottom: '0.25rem' }}>Este mês · por categoria</p>
        <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          {totalSpent > 0 ? `Total: ${formatMoney(totalSpent)}` : 'Nenhum gasto registrado este mês.'}
        </p>

        {totalSpent > 0 && (
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* gráfico */}
            <div style={{ position: 'relative', flexShrink: 0, width: 180, height: 180 }}>
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={spendingByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={76}
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
                        opacity={selectedCatIndex === null || selectedCatIndex === i ? 1 : 0.25}
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
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                {selectedCat ? (
                  <>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 70, lineHeight: 1.2 }}>{selectedCat.name}</span>
                    <strong style={{ fontSize: '0.88rem', marginTop: '0.2rem' }}>{formatMoney(selectedCat.amountCents)}</strong>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Total</span>
                    <strong style={{ fontSize: '0.88rem', marginTop: '0.2rem' }}>{formatMoney(totalSpent)}</strong>
                  </>
                )}
              </div>
            </div>

            {/* legenda */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {spendingByCategory.slice(0, 7).map((cat, i) => {
                const pct = Math.round((cat.amountCents / totalSpent) * 100);
                const isSelected = selectedCatIndex === i;
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => setSelectedCatIndex(i === selectedCatIndex ? null : i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.55rem',
                      background: 'none', border: 'none', padding: '0.15rem 0',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      opacity: selectedCatIndex !== null && !isSelected ? 0.4 : 1,
                      transition: 'opacity 200ms ease',
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem', fontWeight: isSelected ? 700 : 400 }}>
                      {cat.name}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{pct}%</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, flexShrink: 0, minWidth: '4.5rem', textAlign: 'right' }}>
                      {formatMoney(cat.amountCents)}
                    </span>
                  </button>
                );
              })}
              {selectedCatIndex !== null && (
                <button
                  type="button"
                  onClick={() => setSelectedCatIndex(null)}
                  style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'none', border: 'none', padding: '0.2rem 0 0', cursor: 'pointer', textAlign: 'left' }}
                >
                  Limpar seleção
                </button>
              )}
            </div>
          </div>
        )}
      </article>

      {/* ── Barras: histórico 6 meses ── */}
      <article className="surface surface-pad">
        <p className="eyebrow" style={{ marginBottom: '0.25rem' }}>Histórico · últimos 6 meses</p>
        <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Entradas vs saídas por mês.
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthlyData} barGap={3} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => `${(v / 100).toFixed(0)}`}
              tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <ReTooltip content={<BarTooltip />} cursor={{ fill: 'var(--bg-surface-subtle)', radius: 6 }} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '0.78rem', paddingTop: '0.5rem' }}
            />
            <Bar dataKey="incomeCents" name="Entradas" fill="#5FA052" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenseCents" name="Saídas" fill="#EE5524" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </article>

      {/* ── Busca por texto ── */}
      <div style={{ marginTop: '0.5rem' }}>
        <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>Buscar</p>
      </div>

      <label className="field search-field">
        <span>Termo</span>
        <div className="input-with-icon">
          <Search size={18} aria-hidden="true" />
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Mercado, aluguel, salário…"
          />
        </div>
      </label>

      <article className="surface surface-pad">
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
          <p className="text-secondary">{normalizedQuery ? 'Nenhum resultado.' : 'Digite algo para buscar.'}</p>
        )}
      </article>
    </section>
  );
}
