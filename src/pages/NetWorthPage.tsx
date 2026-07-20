import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer,
} from 'recharts';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { calculateNetWorth, netWorthHistory, type NetWorthBreakdown, type NetWorthSnapshot } from '../finance/netWorthCalculations';
import { formatMoney } from '../finance/money';
import { EmptyState } from '../components/EmptyState';

const FULL_MONTH_NAMES: Record<string, string> = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro',
};

function shortMonthLabel(key: string) {
  const [, mm] = key.split('-');
  const map: Record<string, string> = {
    '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
    '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
    '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
  };
  return map[mm] ?? mm;
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

function HistoryTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  const [yyyy, mm] = label.split('-');
  const monthName = FULL_MONTH_NAMES[mm] ?? mm;
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '0.65rem', padding: '0.6rem 0.9rem', boxShadow: 'var(--shadow-md)', minWidth: '10rem' }}>
      <p style={{ margin: '0 0 0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{monthName} de {yyyy}</p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.85rem', marginBottom: '0.15rem' }}>
          <span style={{ color: p.color, fontWeight: 500 }}>{p.name}</span>
          <strong>{formatMoney(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function AssetBar({ label, amountCents, totalCents }: { label: string; amountCents: number; totalCents: number }) {
  const pct = totalCents > 0 ? Math.round((amountCents / totalCents) * 100) : 0;
  return (
    <div className="list-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
      <div style={{ flex: 1, minWidth: '8rem' }}>
        <span className="text-secondary" style={{ fontSize: '0.85rem' }}>{label}</span>
        <div className="progress-bar" style={{ marginTop: '0.3rem', height: '0.45rem' }}>
          <div className="progress-bar__fill" style={{ width: `${Math.min(pct, 100)}%`, background: 'var(--success)' }} />
        </div>
      </div>
      <strong style={{ fontSize: '0.9rem' }}>{formatMoney(amountCents)}</strong>
    </div>
  );
}

export function NetWorthPage() {
  const finance = useFinanceContext();
  const cardsData = useCardsContext();
  const accounts = finance.accounts;
  const invoices = cardsData.invoices;

  const breakdown = useMemo<NetWorthBreakdown | null>(() => {
    if (accounts.length === 0) return null;
    return calculateNetWorth(accounts, invoices, finance.bills);
  }, [accounts, finance.bills, invoices]);

  const last12Months = useMemo(() => getLastNMonths(12), []);

  const invoicesByMonth = useMemo(() => {
    const map = new Map<string, typeof invoices>();
    for (const inv of invoices) {
      const existing = map.get(inv.referenceMonth) ?? [];
      existing.push(inv);
      map.set(inv.referenceMonth, existing);
    }
    return map;
  }, [invoices]);

  const history = useMemo<NetWorthSnapshot[]>(() => {
    return netWorthHistory(last12Months, accounts, finance.transactions, invoicesByMonth, finance.bills);
  }, [last12Months, accounts, finance.transactions, invoicesByMonth, finance.bills]);

  const assetsCents = breakdown?.totalAssetsCents ?? 0;
  const liabilitiesCents = breakdown?.totalLiabilitiesCents ?? 0;

  if (finance.loading || cardsData.loading) {
    return (
      <div className="page-content page-content--narrow">
        <div className="surface surface-pad" style={{ textAlign: 'center', padding: '3rem 1.25rem' }}>
          <p className="text-secondary">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!breakdown) {
    return (
      <div className="page-content page-content--narrow">
        <EmptyState illustration="wallet" title="Nenhuma conta" description="Cadastre uma conta para ver seu patrimônio líquido." />
      </div>
    );
  }

  return (
    <div className="page-content page-content--narrow">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Visão geral</p>
          <h1 className="page-title page-title--compact">Patrimônio Líquido</h1>
        </div>
      </div>

      {/* Hero card */}
      <article className={`surface surface-pad metric-card metric-card--accent`} style={{ marginBottom: '1rem' }}>
        <p className="eyebrow">Patrimônio atual</p>
        <strong className="display-number" style={{ color: 'var(--on-accent-95)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {formatMoney(breakdown.netWorthCents)}
        </strong>
        <span className="metric-card-sub" style={{ color: 'var(--on-accent-55)' }}>
          {formatMoney(assetsCents)} ativos − {formatMoney(liabilitiesCents)} passivos
        </span>
      </article>

      {/* KPI strip */}
      <div className="metric-strip" style={{ marginBottom: '1.5rem' }}>
        <article className="surface surface-pad metric-card">
          <p className="eyebrow">Ativos</p>
          <strong style={{ color: 'var(--success)' }}>{formatMoney(assetsCents)}</strong>
          <span className="metric-card-sub">{breakdown.assetsByType.length} {breakdown.assetsByType.length === 1 ? 'conta' : 'contas'}</span>
        </article>
        <article className="surface surface-pad metric-card">
          <p className="eyebrow">Passivos</p>
          <strong style={{ color: 'var(--danger)' }}>{formatMoney(liabilitiesCents)}</strong>
          <span className="metric-card-sub">Faturas + contas a pagar</span>
        </article>
      </div>

      {/* Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        {breakdown.assetsByType.length > 0 && (
          <article className="surface surface-pad">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Ativos</p>
                <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Por tipo de conta</h2>
              </div>
            </div>
            <div className="item-list" style={{ marginTop: '0.5rem' }}>
              {breakdown.assetsByType.map((entry) => (
                <AssetBar key={entry.type} label={entry.label} amountCents={entry.amountCents} totalCents={assetsCents} />
              ))}
            </div>
          </article>
        )}

        {liabilitiesCents > 0 && (
          <article className="surface surface-pad">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Passivos</p>
                <h2 style={{ fontSize: '1.05rem', margin: 0 }}>O que você deve</h2>
              </div>
            </div>
            <div className="item-list" style={{ marginTop: '0.5rem' }}>
              {breakdown.liabilitiesByKind.invoices > 0 && (
                <div className="list-row" style={{ justifyContent: 'space-between' }}>
                  <span className="text-secondary" style={{ fontSize: '0.85rem' }}>Faturas de cartão</span>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--danger)' }}>{formatMoney(breakdown.liabilitiesByKind.invoices)}</strong>
                </div>
              )}
              {breakdown.liabilitiesByKind.bills > 0 && (
                <div className="list-row" style={{ justifyContent: 'space-between' }}>
                  <span className="text-secondary" style={{ fontSize: '0.85rem' }}>Contas a pagar</span>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--danger)' }}>{formatMoney(breakdown.liabilitiesByKind.bills)}</strong>
                </div>
              )}
            </div>
          </article>
        )}
      </div>

      {/* History chart */}
      <article className="surface surface-pad">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Histórico</p>
            <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Evolução do patrimônio</h2>
          </div>
        </div>
        {history.length > 0 ? (
          <div style={{ marginTop: '1rem', height: '260px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history.map((s) => ({ month: s.month, 'Patrimônio': s.netWorthCents, 'Ativos': s.assetsCents, 'Passivos': s.liabilitiesCents }))} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis
                  dataKey="month"
                  tickFormatter={(val: string) => shortMonthLabel(val)}
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(val: number) => formatMoney(val)}
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <ReTooltip content={<HistoryTooltip />} />
                <Line type="monotone" dataKey="Ativos" stroke="var(--success)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="Passivos" stroke="var(--danger)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="Patrimônio" stroke="var(--action-primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-secondary" style={{ textAlign: 'center', padding: '2rem 0' }}>Dados insuficientes para mostrar o histórico.</p>
        )}
      </article>
    </div>
  );
}
