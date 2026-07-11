import { describe, expect, it } from 'vitest';
import { planOngoingInstallments } from './cardService';

// Cartão que fecha dia 10 e vence dia 20 (vencimento no próprio mês de referência).
const card = { closingDay: 10, dueDay: 20 };

describe('planOngoingInstallments', () => {
  // O caso do dono: óculos em 10x de R$125, já pagou até a 6ª, a próxima (7/10) cai na
  // fatura de setembro. O app cria só 7,8,9,10 — não recria as 6 já pagas.
  it('cria só as parcelas que faltam, a partir da atual, com o número real', () => {
    const plan = planOngoingInstallments(card, {
      installmentValueCents: 12500,
      currentInstallment: 7,
      totalInstallments: 10,
      nextDueMonth: new Date(2026, 8, 1) // setembro/2026
    });

    expect(plan.map((p) => p.installmentNumber)).toEqual([7, 8, 9, 10]);
    expect(plan.map((p) => p.referenceMonth)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
    expect(plan.every((p) => p.amountCents === 12500)).toBe(true);
    expect(plan[0].dueDate.toISOString().slice(0, 10)).toBe('2026-09-20');
    expect(plan[3].dueDate.toISOString().slice(0, 10)).toBe('2026-12-20');
  });

  it('uma parcela só quando é a última', () => {
    const plan = planOngoingInstallments(card, {
      installmentValueCents: 12500,
      currentInstallment: 10,
      totalInstallments: 10,
      nextDueMonth: new Date(2026, 8, 1)
    });

    expect(plan).toHaveLength(1);
    expect(plan[0].installmentNumber).toBe(10);
  });

  it('respeita cartão que vence antes de fechar (vencimento rola pro mês seguinte)', () => {
    const lateCard = { closingDay: 25, dueDay: 5 };
    const plan = planOngoingInstallments(lateCard, {
      installmentValueCents: 20000,
      currentInstallment: 2,
      totalInstallments: 4,
      nextDueMonth: new Date(2026, 8, 1) // fatura de setembro
    });

    expect(plan.map((p) => p.referenceMonth)).toEqual(['2026-09', '2026-10', '2026-11']);
    // Fatura de setembro vence em 05/out.
    expect(plan[0].dueDate.toISOString().slice(0, 10)).toBe('2026-10-05');
  });

  it('atravessa a virada de ano sem perder mês', () => {
    const plan = planOngoingInstallments(card, {
      installmentValueCents: 10000,
      currentInstallment: 9,
      totalInstallments: 12,
      nextDueMonth: new Date(2026, 10, 1) // novembro/2026
    });

    expect(plan.map((p) => p.referenceMonth)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
});
