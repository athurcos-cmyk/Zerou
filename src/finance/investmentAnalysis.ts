import type { InvestmentValueUpdate } from '../types/contracts';

export interface InvestmentPointValue {
  balanceCents: number;
  contributedCents: number;
  /** Rendimento acumulado até este ponto, em % sobre o aportado (`balanceCents/contributedCents
   * − 1) × 100`). É o que o gráfico desenha no eixo Y — nunca o valor absoluto, porque
   * investimentos de tamanhos muito diferentes (R$500 vs. R$50.000) compartilhando o mesmo eixo
   * fariam o menor parecer sempre reto, mesmo rendendo bastante em termos relativos (achado ao
   * vivo, 01/08/2026: um CDB de R$1.000 que rendeu 2,4% ficava visualmente esmagado perto do
   * zero num eixo de R$0 a R$10.000). Em %, todo investimento é comparável no mesmo gráfico
   * não importa o tamanho. */
  returnPct: number;
}

/**
 * Um ponto no tempo do gráfico "Evolução do portfólio" — um dia com pelo menos um evento em
 * QUALQUER investimento. `perInvestment` tem uma entrada por investimento que já existia até
 * aquela data (chave = `investmentId`); `null` antes da primeira atualização daquele
 * investimento — o gráfico não pode fingir que ele já existia.
 */
export interface InvestmentSeriesPoint {
  date: string;
  perInvestment: Record<string, InvestmentPointValue | null>;
}

function toDateKey(recordedAt: { toDate: () => Date }): string {
  const d = recordedAt.toDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Monta a série de cada investimento com **avanço de ponteiro** (forward-fill): num dia em que
 * só o investimento A foi atualizado, o investimento B mantém o último valor real que já tinha —
 * nunca "some" nem cai a zero por falta de update naquele dia específico.
 *
 * Bug real que isto corrige (achado em 01/08/2026): a versão anterior somava só quem tinha um
 * evento NAQUELE dia exato — um investimento sem atualização há alguns dias sumia
 * silenciosamente do total do portfólio em qualquer dia em que não fosse mexido, subcontando o
 * valor real sem aviso nenhum. Mesma classe de bug que o projeto mais se preocupa em evitar.
 */
export function buildInvestmentValueHistory(updates: InvestmentValueUpdate[]): InvestmentSeriesPoint[] {
  if (updates.length === 0) return [];

  // 1 update por investimento por dia — o mais recente daquele dia vence.
  const perInvestmentByDate = new Map<string, Map<string, InvestmentValueUpdate>>();
  for (const u of updates) {
    const dateKey = toDateKey(u.recordedAt);
    let byDate = perInvestmentByDate.get(u.investmentId);
    if (!byDate) {
      byDate = new Map();
      perInvestmentByDate.set(u.investmentId, byDate);
    }
    const existing = byDate.get(dateKey);
    if (!existing || u.recordedAt.toDate() >= existing.recordedAt.toDate()) {
      byDate.set(dateKey, u);
    }
  }

  const investmentIds = Array.from(perInvestmentByDate.keys());
  const allDates = Array.from(new Set(updates.map((u) => toDateKey(u.recordedAt)))).sort();

  const lastKnown = new Map<string, { balanceCents: number; contributedCents: number }>();
  const points: InvestmentSeriesPoint[] = [];

  for (const date of allDates) {
    for (const investmentId of investmentIds) {
      const todays = perInvestmentByDate.get(investmentId)?.get(date);
      if (todays) {
        lastKnown.set(investmentId, { balanceCents: todays.balanceCents, contributedCents: todays.contributedCentsAtTime });
      }
    }

    const perInvestment: Record<string, InvestmentPointValue | null> = {};
    for (const investmentId of investmentIds) {
      const known = lastKnown.get(investmentId);
      if (!known) {
        perInvestment[investmentId] = null;
        continue;
      }
      const returnPct = known.contributedCents > 0 ? ((known.balanceCents / known.contributedCents) - 1) * 100 : 0;
      perInvestment[investmentId] = { balanceCents: known.balanceCents, contributedCents: known.contributedCents, returnPct };
    }
    points.push({ date, perInvestment });
  }

  return points;
}
