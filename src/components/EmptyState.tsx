import type { ReactNode } from 'react';
import { ACCENT_FOREGROUND } from '../theme/palette';

type Illustration = 'transactions' | 'cards' | 'wallet' | 'shared' | 'goals';

interface EmptyStateProps {
  illustration?: Illustration;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ illustration = 'transactions', title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`empty-state${compact ? ' empty-state--compact' : ''}`}>
      <EmptyArt name={illustration} />
      <strong className="empty-state-title">{title}</strong>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

function EmptyArt({ name }: { name: Illustration }) {
  return (
    <span className="empty-state-art" aria-hidden="true">
      <svg viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg" role="img">
        <ellipse cx="60" cy="84" rx="40" ry="6" fill="var(--action-primary-soft)" />
        {name === 'transactions' && (
          <>
            <rect x="30" y="22" width="60" height="48" rx="8" fill="var(--bg-surface)" stroke="var(--border-default)" strokeWidth="2" />
            <rect x="40" y="34" width="26" height="5" rx="2.5" fill="var(--action-primary)" />
            <rect x="40" y="46" width="40" height="4" rx="2" fill="var(--border-default)" />
            <rect x="40" y="56" width="32" height="4" rx="2" fill="var(--border-default)" />
            <circle cx="84" cy="26" r="11" fill="var(--action-primary)" />
            <path d="M84 21v10M79 26h10" stroke={ACCENT_FOREGROUND} strokeWidth="2.4" strokeLinecap="round" />
          </>
        )}
        {name === 'cards' && (
          <>
            <rect x="24" y="36" width="58" height="38" rx="7" fill="var(--bg-surface)" stroke="var(--border-default)" strokeWidth="2" transform="rotate(-8 24 36)" />
            <rect x="38" y="28" width="58" height="38" rx="7" fill="var(--action-primary)" />
            <rect x="46" y="40" width="16" height="11" rx="2.5" fill={ACCENT_FOREGROUND} opacity="0.85" />
            <rect x="46" y="56" width="40" height="4" rx="2" fill={ACCENT_FOREGROUND} opacity="0.55" />
          </>
        )}
        {name === 'wallet' && (
          <>
            <rect x="28" y="32" width="64" height="42" rx="9" fill="var(--bg-surface)" stroke="var(--border-default)" strokeWidth="2" />
            <path d="M28 44h64" stroke="var(--border-default)" strokeWidth="2" />
            <circle cx="80" cy="55" r="6" fill="var(--action-primary)" />
          </>
        )}
        {name === 'shared' && (
          <>
            <circle cx="46" cy="40" r="13" fill="var(--action-primary)" />
            <circle cx="74" cy="40" r="13" fill="var(--bg-surface)" stroke="var(--border-default)" strokeWidth="2" />
            <path d="M30 72c0-9 7-15 16-15s16 6 16 15" fill="var(--action-primary-soft)" />
            <path d="M58 72c0-9 7-15 16-15s16 6 16 15" fill="var(--bg-surface-muted)" />
          </>
        )}
        {name === 'goals' && (
          <>
            <circle cx="60" cy="46" r="22" fill="var(--bg-surface)" stroke="var(--border-default)" strokeWidth="2" />
            <circle cx="60" cy="46" r="13" fill="var(--action-primary-soft)" />
            <circle cx="60" cy="46" r="5" fill="var(--action-primary)" />
            <path d="M60 24v-8M60 76v-6" stroke="var(--border-default)" strokeWidth="2" strokeLinecap="round" />
          </>
        )}
      </svg>
    </span>
  );
}
