import type { InvestmentValueUpdate } from '../types/contracts';

export interface InvestmentValuePoint {
  date: string;
  balanceCents: number;
  contributedCents: number;
}

function toDateKey(recordedAt: { toDate: () => Date }): string {
  const d = recordedAt.toDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function buildInvestmentValueHistory(updates: InvestmentValueUpdate[]): InvestmentValuePoint[] {
  if (updates.length === 0) return [];

  const byDate = new Map<string, Map<string, InvestmentValueUpdate>>();

  for (const u of updates) {
    const dateKey = toDateKey(u.recordedAt);
    let dayMap = byDate.get(dateKey);
    if (!dayMap) {
      dayMap = new Map();
      byDate.set(dateKey, dayMap);
    }
    const existing = dayMap.get(u.investmentId);
    // Último update do mesmo investimento no mesmo dia vence.
    if (!existing || u.recordedAt.toDate() >= existing.recordedAt.toDate()) {
      dayMap.set(u.investmentId, u);
    }
  }

  const points: InvestmentValuePoint[] = [];
  for (const [date, dayMap] of byDate) {
    let balanceCents = 0;
    let contributedCents = 0;
    for (const u of dayMap.values()) {
      balanceCents += u.balanceCents;
      contributedCents += u.contributedCentsAtTime;
    }
    points.push({ date, balanceCents, contributedCents });
  }

  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}
