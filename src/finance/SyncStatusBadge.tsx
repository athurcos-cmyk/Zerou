import { memo, type ReactNode } from 'react';
import { CloudOff, AlertCircle } from 'lucide-react';
import type { SyncStatus } from '../types/contracts';

interface SyncStatusBadgeProps {
  status: SyncStatus;
}

const label: Record<string, string> = {
  pending: 'Salvando…',
  failed: 'Falha ao salvar',
};

const icons: Record<string, ReactNode> = {
  pending: <CloudOff size={12} aria-hidden="true" />,
  failed: <AlertCircle size={12} aria-hidden="true" />,
};

export const SyncStatusBadge = memo(function SyncStatusBadge({ status }: SyncStatusBadgeProps) {
  if (status === 'synced') return null;

  return (
    <span className={`sync-badge sync-badge--${status}`} role="status">
      {icons[status]}
      {label[status]}
    </span>
  );
});
