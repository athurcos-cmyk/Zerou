import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, ComposedChart } from 'recharts';
import { buildInvestmentValueHistory, type InvestmentValuePoint } from './investmentAnalysis';
import { formatMoney } from './money';
import type { InvestmentValueUpdate } from '../types/contracts';
import { EmptyState } from '../components/EmptyState';

interface InvestmentHistoryChartProps {
  updates: InvestmentValueUpdate[];
}

function formatAxisDate(dateKey: string) {
  const [, m, d] = dateKey.split('-');
  return `${d}/${m}`;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload || !label) return null;
  const [, y, m, d] = label.split('-');
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
      borderRadius: 8, padding: '0.6rem 0.85rem', fontSize: '0.82rem',
      boxShadow: 'var(--shadow-sm)'
    }}>
      <p style={{ margin: 0, fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        {d}/{m}/{y}
      </p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ margin: '3px 0', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            {entry.name === 'balanceCents' ? 'Valor atual' : 'Total aportado'}
          </span>
          <strong style={{ marginLeft: 'auto', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            {formatMoney(entry.value)}
          </strong>
        </p>
      ))}
    </div>
  );
}

export function InvestmentHistoryChart({ updates }: InvestmentHistoryChartProps) {
  const points: InvestmentValuePoint[] = useMemo(() => buildInvestmentValueHistory(updates), [updates]);

  if (points.length < 2) {
    return (
      <EmptyState
        illustration="transactions"
        title="Sem dados suficientes"
        description="Registre pelo menos duas atualizações de valor pra ver o gráfico de evolução."
      />
    );
  }

  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <ComposedChart data={points} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="contributedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.1} />
              <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={formatAxisDate}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            axisLine={{ stroke: 'var(--border-subtle)' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v: number) => formatMoney(v)}
            tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
            width={65}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="stepAfter"
            dataKey="contributedCents"
            fill="url(#contributedGradient)"
            stroke="var(--chart-4)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            name="contributedCents"
          />
          <Line
            type="stepAfter"
            dataKey="balanceCents"
            stroke="var(--chart-2)"
            strokeWidth={2.5}
            dot={false}
            name="balanceCents"
            activeDot={{ r: 4, fill: 'var(--chart-2)', stroke: 'var(--bg-surface)', strokeWidth: 2 }}
          />
          <Area
            type="stepAfter"
            dataKey="balanceCents"
            fill="url(#balanceGradient)"
            stroke="none"
            dot={false}
            name="balanceCentsArea"
            legendType="none"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
