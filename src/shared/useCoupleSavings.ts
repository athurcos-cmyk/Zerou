import { useEffect, useMemo, useState } from 'react';
import { subscribeWithTransientRetry } from '../firebase/firestoreRetry';
import { subscribeGoalContributions, subscribeGoals, type LocalSynced } from '../finance/financeService';
import { calculateCoupleGoalStats, type CoupleGoalStats } from '../domain/shared/calculateCoupleGoalStats';
import type { Goal, GoalContribution } from '../types/contracts';

interface CoupleSavingsState {
  goals: Array<LocalSynced<Goal>>;
  contributions: Array<LocalSynced<GoalContribution>>;
  loading: boolean;
  error: string | null;
}

const initial: CoupleSavingsState = { goals: [], contributions: [], loading: true, error: null };

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

export type { CoupleGoalStats };

export function useCoupleSavings(workspaceId?: string) {
  const [state, setState] = useState<CoupleSavingsState>(initial);

  useEffect(() => {
    if (!workspaceId) {
      setState({ ...initial, loading: false });
      return undefined;
    }
    setState((current) => ({ ...current, loading: true, error: null }));

    const bootTimer = window.setTimeout(() => {
      setState((current) => current.loading ? { ...current, loading: false } : current);
    }, 2500);

    const unsubGoals = subscribeWithTransientRetry({
      subscribe: (onError) =>
        subscribeGoals(
          workspaceId,
          (items) => {
            const goals = items.filter((goal) => goal.isActive !== false);
            setState((current) => ({ ...current, goals, loading: false, error: null }));
          },
          onError
        ),
      onRetrying: () => setState((current) => ({ ...current, loading: true, error: null })),
      onError: () => setState((current) => ({ ...current, loading: false, error: 'Não foi possível carregar os cofrinhos.' }))
    });

    const unsubContribs = subscribeWithTransientRetry({
      subscribe: (onError) =>
        subscribeGoalContributions(
          workspaceId,
          (items) => setState((current) => ({ ...current, contributions: items })),
          onError
        ),
      onError: () => setState((current) => ({ ...current, error: 'Não foi possível carregar as contribuições dos cofrinhos.' }))
    });

    return () => {
      window.clearTimeout(bootTimer);
      unsubGoals();
      unsubContribs();
    };
  }, [workspaceId]);

  const stats = useMemo(
    () => calculateCoupleGoalStats(state.goals, state.contributions, currentMonthKey()),
    [state.goals, state.contributions]
  );

  const pendingWrites = state.goals.some((goal) => goal.localSyncStatus === 'pending');

  return { ...state, stats, pendingWrites };
}
