const CACHE_KEY_PREFIX = 'zerou.dashboardSummaryCache.v1.';

export interface CachedDashboardSummary {
  totalBalanceCents: number;
  freeToSpendCents: number;
  committedCents: number;
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function readCachedDashboardSummary(workspaceId?: string | null): CachedDashboardSummary | null {
  if (!canUseStorage() || !workspaceId) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(CACHE_KEY_PREFIX + workspaceId);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<CachedDashboardSummary>;
    if (
      typeof parsed.totalBalanceCents !== 'number' ||
      typeof parsed.freeToSpendCents !== 'number' ||
      typeof parsed.committedCents !== 'number'
    ) {
      return null;
    }

    return {
      totalBalanceCents: parsed.totalBalanceCents,
      freeToSpendCents: parsed.freeToSpendCents,
      committedCents: parsed.committedCents
    };
  } catch {
    return null;
  }
}

export function saveCachedDashboardSummary(workspaceId: string | undefined | null, summary: CachedDashboardSummary) {
  if (!canUseStorage() || !workspaceId) {
    return;
  }

  try {
    window.localStorage.setItem(CACHE_KEY_PREFIX + workspaceId, JSON.stringify(summary));
  } catch {
    // Cache local é apenas um acelerador de exibição. Se falhar, o cálculo real continua sendo a fonte.
  }
}
