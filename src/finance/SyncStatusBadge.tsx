import type { SyncStatus } from '../types/contracts';

interface SyncStatusBadgeProps {
  status: SyncStatus;
}

export function SyncStatusBadge({ status }: SyncStatusBadgeProps) {
  void status;
  return null;
}
