import { useEffect, useMemo, useState } from 'react';
import { subscribeGoalContributions, subscribeGoals, type LocalSynced } from '../finance/financeService';
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

export interface CoupleGoalStats {
  goal: LocalSynced<Goal>;
  totalCents: number;
  thisMonthCents: number;
  byUser: Record<string, number>;
  percent: number;
}

export function useCoupleSavings(workspaceId?: string) {
  const [state, setState] = useState<CoupleSavingsState>(initial);

  useEffect(() => {
    if (!workspaceId) {
      setState({ ...initial, loading: false });
      return undefined;
    }
    setState((current) => ({ ...current, loading: true, error: null }));

    let goals: Array<LocalSynced<Goal>> = [];
    let contributions: Array<LocalSynced<GoalContribution>> = [];

    const unsubGoals = subscribeGoals(
      workspaceId,
      (items) => {
        goals = items.filter((goal) => goal.isActive !== false);
        setState((current) => ({ ...current, goals, loading: false, error: null }));
      },
      (error) => setState((current) => ({ ...current, loading: false, error: error.message }))
    );

    const unsubContribs = subscribeGoalContributions(
      workspaceId,
      (items) => {
        contributions = items;
        setState((current) => ({ ...current, contributions }));
      },
      () => undefined
    );

    return () => {
      unsubGoals();
      unsubContribs();
    };
  }, [workspaceId]);

  const stats = useMemo<CoupleGoalStats[]>(() => {
    const month = currentMonthKey();
    return state.goals.map((goal) => {
      const goalContribs = state.contributions.filter((contrib) => contrib.goalId === goal.id);
      const byUser: Record<string, number> = {};
      let thisMonthCents = 0;
      for (const contrib of goalContribs) {
        byUser[contrib.userId] = (byUser[contrib.userId] ?? 0) + contrib.amountCents;
        if (contrib.monthKey === month) thisMonthCents += contrib.amountCents;
      }
      const totalCents = goal.savedCents;
      const percent = goal.targetCents > 0 ? Math.min(100, Math.round((totalCents / goal.targetCents) * 100)) : 0;
      return { goal, totalCents, thisMonthCents, byUser, percent };
    });
  }, [state.goals, state.contributions]);

  const pendingWrites = state.goals.some((goal) => goal.localSyncStatus === 'pending');

  return { ...state, stats, pendingWrites };
}
