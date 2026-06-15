import { CheckCircle2, CloudOff, Loader2 } from 'lucide-react';
import { syncStatusLabels } from './financeLabels';
import type { SyncStatus } from '../types/contracts';

interface SyncStatusBadgeProps {
  status: SyncStatus;
}

export function SyncStatusBadge({ status }: SyncStatusBadgeProps) {
  const Icon = status === 'synced' ? CheckCircle2 : status === 'failed' ? CloudOff : Loader2;

  return (
    <span className={`sync-badge sync-badge--${status}`}>
      <Icon size={14} aria-hidden="true" />
      {syncStatusLabels[status]}
    </span>
  );
}
