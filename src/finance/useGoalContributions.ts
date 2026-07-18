import { useEffect, useState } from 'react';
import { subscribeGoalContributions, type LocalSynced } from './financeService';
import { subscribeWithTransientRetry } from '../firebase/firestoreRetry';
import type { GoalContribution } from '../types/contracts';

interface GoalContributionsState {
  contributions: Array<LocalSynced<GoalContribution>>;
  loading: boolean;
  error: string | null;
}

const initialState: GoalContributionsState = { contributions: [], loading: true, error: null };

/** Histórico de uma meta específica. `subscribeGoalContributions` assina a coleção
 * inteira do workspace (sem query no servidor); o filtro por `goalId` é client-side,
 * igual `CardDetailPage` filtra as faturas de um cartão a partir da lista já assinada. */
export function useGoalContributions(workspaceId: string | undefined, goalId: string | undefined) {
  const [state, setState] = useState<GoalContributionsState>(initialState);

  useEffect(() => {
    if (!workspaceId || !goalId) {
      setState({ ...initialState, loading: false });
      return undefined;
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    const bootTimer = window.setTimeout(() => {
      setState((current) => (current.loading ? { ...current, loading: false } : current));
    }, 2500);

    const unsub = subscribeWithTransientRetry({
      subscribe: (onError) =>
        subscribeGoalContributions(
          workspaceId,
          (items) => {
            const forGoal = items
              .filter((item) => item.goalId === goalId)
              .sort((a, b) => (b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER) - (a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER));
            setState({ contributions: forGoal, loading: false, error: null });
          },
          onError
        ),
      onRetrying: () => setState((current) => ({ ...current, loading: true, error: null })),
      onError: () => setState({ contributions: [], loading: false, error: 'Não foi possível carregar o histórico desta meta.' })
    });

    return () => {
      window.clearTimeout(bootTimer);
      unsub();
    };
  }, [workspaceId, goalId]);

  return state;
}
