import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { buildInvestmentValueHistory } from './investmentAnalysis';
import type { InvestmentValueUpdate } from '../types/contracts';

function update(overrides: Partial<InvestmentValueUpdate> & Pick<InvestmentValueUpdate, 'investmentId' | 'balanceCents' | 'contributedCentsAtTime' | 'recordedAt'>): InvestmentValueUpdate {
  return {
    id: `upd-${Math.random()}`,
    workspaceId: 'ws1',
    createdBy: 'alice',
    ...overrides
  };
}

const day = (iso: string) => Timestamp.fromDate(new Date(iso));

describe('buildInvestmentValueHistory', () => {
  it('devolve vazio sem nenhum update', () => {
    expect(buildInvestmentValueHistory([])).toEqual([]);
  });

  // O bug real de 01/08/2026: um investimento sem update no dia não pode sumir — precisa manter
  // o último valor conhecido (forward-fill), não cair a zero.
  it('mantém o último valor conhecido de um investimento em dias sem update dele (forward-fill)', () => {
    const updates = [
      update({ investmentId: 'a', balanceCents: 10000, contributedCentsAtTime: 10000, recordedAt: day('2026-08-01T10:00:00') }),
      update({ investmentId: 'b', balanceCents: 5000, contributedCentsAtTime: 5000, recordedAt: day('2026-08-02T10:00:00') }),
      update({ investmentId: 'a', balanceCents: 10500, contributedCentsAtTime: 10000, recordedAt: day('2026-08-03T10:00:00') })
    ];

    const points = buildInvestmentValueHistory(updates);

    expect(points.map((p) => p.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    // Dia 3: só "a" foi atualizado, mas "b" continua valendo 5000 — não some.
    const day3 = points[2];
    expect(day3.perInvestment.a?.balanceCents).toBe(10500);
    expect(day3.perInvestment.b?.balanceCents).toBe(5000);
  });

  it('investimento fica null antes da primeira atualização dele — não finge que já existia', () => {
    const updates = [
      update({ investmentId: 'a', balanceCents: 10000, contributedCentsAtTime: 10000, recordedAt: day('2026-08-01T10:00:00') }),
      update({ investmentId: 'b', balanceCents: 5000, contributedCentsAtTime: 5000, recordedAt: day('2026-08-03T10:00:00') })
    ];

    const points = buildInvestmentValueHistory(updates);

    expect(points[0].perInvestment.b).toBeNull();
    expect(points[1].perInvestment.b?.balanceCents).toBe(5000);
  });

  it('duas atualizações do mesmo investimento no mesmo dia: só a mais recente conta', () => {
    const updates = [
      update({ investmentId: 'a', balanceCents: 10000, contributedCentsAtTime: 10000, recordedAt: day('2026-08-01T08:00:00') }),
      update({ investmentId: 'a', balanceCents: 10200, contributedCentsAtTime: 10000, recordedAt: day('2026-08-01T20:00:00') })
    ];

    const points = buildInvestmentValueHistory(updates);

    expect(points).toHaveLength(1);
    expect(points[0].perInvestment.a?.balanceCents).toBe(10200);
  });

  // O motivo da mudança pra %: investimentos de tamanhos muito diferentes compartilhando o
  // mesmo eixo em R$ faziam o menor parecer sempre reto mesmo rendendo bem em termos relativos.
  it('calcula rendimento em % sobre o aportado, comparável entre investimentos de tamanhos diferentes', () => {
    const updates = [
      // "a" é grande (R$100.000) e rendeu pouco em %; "b" é pequeno (R$1.000) e rendeu bastante em %.
      update({ investmentId: 'a', balanceCents: 10000000, contributedCentsAtTime: 10000000, recordedAt: day('2026-08-01T10:00:00') }),
      update({ investmentId: 'b', balanceCents: 100000, contributedCentsAtTime: 100000, recordedAt: day('2026-08-01T10:00:00') }),
      update({ investmentId: 'a', balanceCents: 10050000, contributedCentsAtTime: 10000000, recordedAt: day('2026-08-05T10:00:00') }), // +0.5%
      update({ investmentId: 'b', balanceCents: 108000, contributedCentsAtTime: 100000, recordedAt: day('2026-08-05T10:00:00') }) // +8%
    ];

    const points = buildInvestmentValueHistory(updates);
    const last = points[points.length - 1];

    expect(last.perInvestment.a?.returnPct).toBeCloseTo(0.5, 5);
    expect(last.perInvestment.b?.returnPct).toBeCloseTo(8, 5);
  });
});
