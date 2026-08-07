import { describe, expect, it } from 'vitest';
import { groupInvoicesForDisplay } from './invoiceGroups';

function inv(referenceMonth: string, outstandingBalanceCents: number, paymentsTotalCents = 0) {
  return { referenceMonth, outstandingBalanceCents, paymentsTotalCents };
}

const AGORA = '2026-08';

describe('groupInvoicesForDisplay', () => {
  it('mês corrente e futuros SEM pagamento ficam em "a pagar", mesmo com saldo zero', () => {
    // Saldo zero sem pagamento registrado é fatura vazia, não fatura paga: futura que ainda não
    // recebeu parcela, ou o ciclo corrente antes da primeira compra. Ela não é histórico.
    const { toPay, settled } = groupInvoicesForDisplay(
      [inv('2026-08', 0), inv('2026-09', 10000), inv('2027-09', 5000)],
      AGORA
    );

    expect(toPay.map((i) => i.referenceMonth)).toEqual(['2026-08', '2026-09', '2027-09']);
    expect(settled).toEqual([]);
  });

  // ⚠️ ESTE é o teste de regressão do bug de 07/08/2026 à noite: o dono pagou a fatura de agosto
  // EM agosto (ela fecha antes do fim do mês) e ela não saiu da lista, porque o critério de então
  // era só `referenceMonth >= mês corrente`. Falha se alguém voltar a decidir isso pelo mês.
  it('fatura do MÊS CORRENTE já paga sai da lista principal', () => {
    const { toPay, settled } = groupInvoicesForDisplay(
      [inv('2026-08', 0, 123898), inv('2026-09', 10000)],
      AGORA
    );

    expect(settled.map((i) => i.referenceMonth)).toEqual(['2026-08']);
    expect(toPay.map((i) => i.referenceMonth)).toEqual(['2026-09']);
  });

  it('fatura corrente ANTECIPADA conta como paga (antecipar é pagar antes de fechar)', () => {
    // `recordInvoicePayment(..., advance: true)` grava pagamento de verdade no ledger, então
    // `paymentsTotalCents > 0`. A fatura continua aparecendo no topo da tela como "Fatura atual"
    // (`pickCurrentInvoice`, que olha o ciclo, não este agrupamento) — só sai da LISTA.
    const { toPay, settled } = groupInvoicesForDisplay([inv('2026-08', 0, 50000)], AGORA);

    expect(toPay).toEqual([]);
    expect(settled).toHaveLength(1);
  });

  it('pagamento PARCIAL não tira a fatura da lista — ainda tem saldo', () => {
    const { toPay, settled } = groupInvoicesForDisplay([inv('2026-08', 40000, 10000)], AGORA);

    expect(toPay).toHaveLength(1);
    expect(settled).toEqual([]);
  });

  it('passado sem saldo vai pra "pagas" mesmo sem pagamento registrado (dado legado)', () => {
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
