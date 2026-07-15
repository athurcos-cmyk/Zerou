import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { formatMoney } from '../finance/money';
import type { DailyProjection } from '../finance/cashFlowProjection';

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: DailyProjection }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '0.65rem', padding: '0.6rem 0.9rem', boxShadow: 'var(--shadow-md)', minWidth: '10rem' }}>
      <p style={{ margin: '0 0 0.3rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{d.dayLabel}</p>
      <strong style={{ fontSize: '1rem' }}>{formatMoney(d.balanceCents)}</strong>
      {d.events.length > 0 && (
        <div style={{ marginTop: '0.35rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.35rem' }}>
          {d.events.slice(0, 3).map((e) => (
            <div key={e.id} style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.1rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{e.description}</span>
              <span style={{ color: e.kind === 'income' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                {e.kind === 'income' ? '+' : '−'}{formatMoney(e.amountCents)}
              </span>
            </div>
          ))}
          {d.events.length > 3 && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>+{d.events.length - 3} mais</p>
          )}
        </div>
      )}
    </div>
  );
}

export function CashFlowChart({ projections }: { projections: DailyProjection[] }) {
  const chartData = useMemo(
    () =>
      projections.map((d) => ({
        dayLabel: d.dayLabel,
        balanceCents: d.balanceCents,
        date: d.date,
        events: d.events,
      })),
    [projections],
  );

  // Show ~6 labels evenly spaced
  const step = Math.max(1, Math.floor(projections.length / 6));
  const ticks = projections.filter((_, i) => i % step === 0).map((d) => d.dayLabel);

  if (projections.length === 0) return null;

  const minBalance = Math.min(...projections.map((d) => d.balanceCents));
  const hasNegative = minBalance < 0;

  return (
    <div style={{ height: '220px', marginTop: '0.5rem' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis
            dataKey="dayLabel"
            ticks={ticks}
            tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
            axisLine={{ stroke: 'var(--border-subtle)' }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tickFormatter={(val: number) => formatMoney(val)}
            tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
            axisLine={false}
            tickLine={false}
            width={68}
          />
          <ReTooltip content={<ChartTooltip />} />
          {hasNegative && <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="4 4" strokeWidth={1} />}
          <Line
            type="monotone"
            dataKey="balanceCents"
            stroke="var(--action-primary)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: 'var(--action-primary)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
