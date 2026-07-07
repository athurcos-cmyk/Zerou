import type { Goal, GoalContribution } from '../../types/contracts';

export interface CoupleGoalStats<G extends Goal = Goal> {
  goal: G;
  totalCents: number;
  thisMonthCents: number;
  byUser: Record<string, number>;
  percent: number;
}

/**
 * Estatísticas de um cofrinho do casal a partir do total já persistido (goal.savedCents)
 * e do log de contribuições (goalContributions), usado só pra quebrar o total por
 * pessoa e por mês. `type` de cada contribuição decide o sinal: 'withdrawal' subtrai,
 * 'deposit' (ou ausente — registro legado anterior ao campo) soma.
 */
export function calculateCoupleGoalStats<G extends Goal>(
  goals: G[],
  contributions: GoalContribution[],
  monthKey: string
): CoupleGoalStats<G>[] {
  return goals.map((goal) => {
    const goalContribs = contributions.filter((contrib) => contrib.goalId === goal.id);
    const byUser: Record<string, number> = {};
    let thisMonthCents = 0;

    for (const contrib of goalContribs) {
      const sign = contrib.type === 'withdrawal' ? -1 : 1;
      const signedAmount = sign * contrib.amountCents;
      byUser[contrib.userId] = (byUser[contrib.userId] ?? 0) + signedAmount;
      if (contrib.monthKey === monthKey) {
        thisMonthCents += signedAmount;
      }
    }

    const totalCents = goal.savedCents;
    const percent = goal.targetCents > 0 ? Math.min(100, Math.round((totalCents / goal.targetCents) * 100)) : 0;

    return { goal, totalCents, thisMonthCents, byUser, percent };
  });
}
