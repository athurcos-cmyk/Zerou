import { useEffect, useState } from 'react';
import { subscribeGoals, type LocalSynced } from './financeService';
import { subscribeWithTransientRetry } from '../firebase/firestoreRetry';
import type { Goal } from '../types/contracts';

interface GoalsState {
  goals: Array<LocalSynced<Goal>>;
  loading: boolean;
  error: string | null;
}

const initialState: GoalsState = { goals: [], loading: true, error: null };

export function useGoalsData(workspaceId?: string) {
  const [state, setState] = useState<GoalsState>(initialState);

  useEffect(() => {
    if (!workspaceId) {
      setState({ ...initialState, loading: false });
      return undefined;
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    return subscribeWithTransientRetry({
      subscribe: (onError) =>
        subscribeGoals(
          workspaceId,
          (goals) => {
            const active = goals
              .filter((goal) => goal.isActive !== false)
              // Mais recentes primeiro; itens pendentes (createdAt nulo offline) vêm no topo.
              .sort((a, b) => (b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER) - (a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER));
            setState({ goals: active, loading: false, error: null });
          },
          onError
        ),
      onRetrying: () => setState((current) => ({ ...current, loading: true, error: null })),
      onError: () => setState({ goals: [], loading: false, error: 'Não foi possível carregar suas metas.' })
    });
  }, [workspaceId]);

  const pendingWrites = state.goals.some((goal) => goal.localSyncStatus === 'pending');

  return { ...state, pendingWrites };
}
