import { describe, expect, it } from 'vitest';
import { groupInvoicesForDisplay } from './invoiceGroups';

function inv(referenceMonth: string, outstandingBalanceCents: number) {
  return { referenceMonth, outstandingBalanceCents };
}

const AGORA = '2026-08';

describe('groupInvoicesForDisplay', () => {
  it('mês corrente e futuros ficam em "a pagar", mesmo já quitados', () => {
    // Antecipar a fatura do mês zera o saldo dela, mas ela continua sendo o ciclo vigente —
    // mandá-la pro histórico faria a tela do cartão parecer que não há fatura atual.
    const { toPay, settled } = groupInvoicesForDisplay(
      [inv('2026-08', 0), inv('2026-09', 10000), inv('2027-09', 5000)],
      AGORA
    );

    expect(toPay.map((i) => i.referenceMonth)).toEqual(['2026-08', '2026-09', '2027-09']);
    expect(settled).toEqual([]);
  });

  it('passado sem saldo vai pra "quitadas"', () => {
    const { toPay, settled } = groupInvoicesForDisplay([inv('2026-06', 0), inv('2026-07', 0)], AGORA);

    expect(toPay).toEqual([]);
    expect(settled.map((i) => i.referenceMonth)).toEqual(['2026-06', '2026-07']);
  });

  // ⚠️ A razão do "ou" no critério: dívida velha é dívida, não histórico.
  it('fatura VENCIDA e não paga fica em "a pagar", por antiga que seja', () => {
    const { toPay, settled } = groupInvoicesForDisplay([inv('2024-01', 45000), inv('2026-07', 0)], AGORA);

    expect(toPay.map((i) => i.referenceMonth)).toEqual(['2024-01']);
    expect(settled.map((i) => i.referenceMonth)).toEqual(['2026-07']);
  });

  it('preserva a ordem cronológica recebida dentro de cada grupo', () => {
    const { toPay, settled } = groupInvoicesForDisplay(
      [inv('2026-05', 0), inv('2026-06', 100), inv('2026-07', 0), inv('2026-08', 900), inv('2026-09', 100)],
      AGORA
    );

    expect(toPay.map((i) => i.referenceMonth)).toEqual(['2026-06', '2026-08', '2026-09']);
    expect(settled.map((i) => i.referenceMonth)).toEqual(['2026-05', '2026-07']);
  });

  it('a fatura do mês passado sai de "a pagar" sozinha quando é paga', () => {
    const antes = groupInvoicesForDisplay([inv('2026-07', 123898)], AGORA);
    const depois = groupInvoicesForDisplay([inv('2026-07', 0)], AGORA);

    expect(antes.toPay).toHaveLength(1);
    expect(antes.settled).toHaveLength(0);
    expect(depois.toPay).toHaveLength(0);
    expect(depois.settled).toHaveLength(1);
  });
});
