import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatMoney } from '../finance/money';
import type { DailyProjection } from '../finance/cashFlowProjection';

function ProjectionDay({ day, isLast, defaultExpanded }: { day: DailyProjection; isLast: boolean; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const hasEvents = day.events.length > 0;

  return (
    <div className={`list-row${isLast ? '' : ' has-divider'}`} style={{ flexDirection: 'column', gap: '0.3rem', border: 'none', borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', cursor: hasEvents ? 'pointer' : 'default' }}
        onClick={() => hasEvents && setExpanded((v) => !v)}
        role={hasEvents ? 'button' : undefined}
        tabIndex={hasEvents ? 0 : undefined}
        aria-expanded={hasEvents ? expanded : undefined}
        onKeyDown={(e) => { if (hasEvents && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setExpanded((v) => !v); } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{day.dayLabel}</span>
          {hasEvents && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--bg-surface-muted)', borderRadius: '999px', padding: '0.1rem 0.45rem' }}>
              {day.events.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <strong style={{ fontSize: '0.88rem', fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatMoney(day.balanceCents)}
          </strong>
          {hasEvents && (expanded ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />)}
        </div>
      </div>

      {expanded && day.events.length > 0 && (
        <div style={{ paddingLeft: '0.2rem', marginTop: '0.2rem' }}>
          {day.events.map((event) => (
            <div key={event.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.2rem 0', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{event.description}</span>
              <span style={{ fontWeight: 600, color: event.kind === 'income' ? 'var(--success)' : 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>
                {event.kind === 'income' ? '+' : '−'}{formatMoney(event.amountCents)}
              </span>
            </div>
          ))}
        </div>
      )}

      {!hasEvents && (
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Nenhum evento</span>
      )}
    </div>
  );
}

export function ProjectionTimeline({ projections }: { projections: DailyProjection[] }) {
  if (projections.length === 0) return null;

  const daysWithEvents = projections.filter((d) => d.events.length > 0);
  const hasEvents = daysWithEvents.length > 0;

  return (
    <div className="item-list" style={{ marginTop: '0.75rem', maxHeight: '360px', overflowY: 'auto' }}>
      {hasEvents ? (
        daysWithEvents.map((day, i) => (
          <ProjectionDay
            key={day.dayLabel}
            day={day}
            isLast={i === daysWithEvents.length - 1}
            defaultExpanded={i === 0}
          />
        ))
      ) : (
        <p className="text-secondary" style={{ textAlign: 'center', padding: '1rem 0', fontSize: '0.85rem' }}>
          Nenhum evento previsto no período.
        </p>
      )}
      {hasEvents && daysWithEvents.length < projections.length && (
        <p className="text-secondary" style={{ textAlign: 'center', padding: '1rem 0 0', fontSize: '0.78rem' }}>
          +{projections.length - daysWithEvents.length} dias sem eventos omitidos
        </p>
      )}
    </div>
  );
}
