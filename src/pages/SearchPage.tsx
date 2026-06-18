import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { toDateInputValue } from '../finance/financeDates';
import { billStatusLabels, transactionTypeLabels } from '../finance/financeLabels';
import { formatMoney } from '../finance/money';
import { categoryColors, defaultCategoryColor, defaultCategoryColors } from '../theme/palette';

const RADIUS = 40;
const CX = 50;
const CY = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GRAY = '#e5e7eb';

function DonutChart({ segments }: { segments: { color: string; fraction: number }[] }) {
  if (segments.length === 0) {
    return (
      <svg viewBox="0 0 100 100" width={120} height={120} aria-hidden="true">
        <circle cx={CX} cy={CY} r={RADIUS} fill="none" stroke={GRAY} strokeWidth={16} />
      </svg>
    );
  }
  let cumulative = 0;
  return (
    <svg viewBox="0 0 100 100" width={120} height={120} aria-hidden="true">
      {segments.map((seg, i) => {
        const dashLen = seg.fraction * CIRCUMFERENCE;
        const offset = cumulative * CIRCUMFERENCE;
        cumulative += seg.fraction;
        return (
          <circle
            key={i}
            cx={CX} cy={CY} r={RADIUS}
            fill="none"
            stroke={seg.color}
            strokeWidth={16}
            strokeDasharray={`${dashLen} ${CIRCUMFERENCE}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${CX} ${CY})`}
          />
        );
      })}
    </svg>
  );
}

function resolveCategoryColor(category: { id: string; color?: string }) {
  if (category.color) return category.color;
  if (defaultCategoryColors[category.id]) return defaultCategoryColors[category.id];
  let hash = 0;
  for (let i = 0; i < category.id.length; i += 1) {
    hash = (hash * 31 + category.id.charCodeAt(i)) >>> 0;
  }
  return categoryColors[hash % categoryColors.length];
}

export function SearchPage() {
  const finance = useFinanceContext();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const currentMonth = new Date().toISOString().slice(0, 7);

  const categoryMap = new Map(finance.categories.map((c) => [c.id, c]));
  const categoryNames = new Map(finance.categories.map((c) => [c.id, c.name]));

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

  const segments = totalSpent > 0
    ? spendingByCategory.map((c) => ({ color: c.color, fraction: c.amountCents / totalSpent }))
    : [];

  const results = useMemo(() => {
    if (!normalizedQuery) return [];

    const transactions = finance.transactions
      .filter((t) => !t.deletedAt)
      .filter((t) =>
        [t.description, t.merchant, t.notes, t.tags.join(' ')]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('pt-BR')
          .includes(normalizedQuery)
      )
      .map((t) => ({
        id: t.id,
        kind: 'Transação' as const,
        title: t.description,
        detail: `${transactionTypeLabels[t.type]} · ${toDateInputValue(t.date)}`,
        amountCents: t.amountCents,
      }));

    const bills = finance.bills
      .filter((b) => b.description.toLocaleLowerCase('pt-BR').includes(normalizedQuery))
      .map((b) => ({
        id: b.id,
        kind: 'Conta a pagar' as const,
        title: b.description,
        detail: `${billStatusLabels[b.status]} · ${toDateInputValue(b.dueDate)}`,
        amountCents: b.amountCents,
      }));

    const accounts = finance.accounts
      .filter((a) => a.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery))
      .map((a) => ({
        id: a.id,
        kind: 'Conta' as const,
        title: a.name,
        detail: 'Conta financeira',
        amountCents: a.openingBalanceCents,
      }));

    return [...transactions, ...bills, ...accounts].slice(0, 25);
  }, [finance.accounts, finance.bills, finance.transactions, normalizedQuery]);

  return (
    <section className="page-content page-content--narrow">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Este mês</p>
          <h1 className="page-title page-title--compact">Resumo de gastos</h1>
        </div>
      </div>

      {/* Donut chart */}
      <article className="surface surface-pad">
        {totalSpent > 0 ? (
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flexShrink: 0 }}>
              <DonutChart segments={segments} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {spendingByCategory.slice(0, 8).map((cat) => (
                <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.88rem' }}>
                    {cat.name}
                  </span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, flexShrink: 0 }}>
                    {Math.round((cat.amountCents / totalSpent) * 100)}%
                  </span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', flexShrink: 0, minWidth: '5rem', textAlign: 'right' }}>
                    {formatMoney(cat.amountCents)}
                  </span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total gasto</span>
                <strong>{formatMoney(totalSpent)}</strong>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-secondary" style={{ margin: 0 }}>Nenhum gasto registrado este mês ainda.</p>
        )}
      </article>

      {/* Busca */}
      <div style={{ marginTop: '1.5rem' }}>
        <p className="eyebrow">Buscar</p>
        <h2 style={{ margin: '0.2rem 0 0.75rem', fontSize: '1.1rem', fontWeight: 700 }}>Encontrar no Zerou</h2>
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
          <p className="text-secondary">{normalizedQuery ? 'Nenhum resultado encontrado.' : 'Digite algo para buscar.'}</p>
        )}
      </article>
    </section>
  );
}
