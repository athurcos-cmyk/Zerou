import { describe, expect, it } from 'vitest';
import {
  anticipatedAwayEntryIds,
  groupAnticipatablePurchases,
  invoiceHasVisibleActivity,
  type AnticipatableInvoice
} from './anticipation';

const current = { id: 'card-1_2026-07', cardId: 'card-1', referenceMonth: '2026-07' };

function purchase(
  id: string,
  amountCents: number,
  opts: { sourceTransactionId?: string; installmentNumber?: number; installmentTotal?: number } = {}
) {
  return {
    id,
    type: 'purchase',
    amountCents,
    sourceTransactionId: opts.sourceTransactionId ?? 'txn-1',
    installmentNumber: opts.installmentNumber,
    installmentTotal: opts.installmentTotal
  };
}

function anticipationCredit(id: string, amountCents: number, sourceTransactionId = 'txn-1') {
  return { id, type: 'installment_anticipation_credit', amountCents, sourceTransactionId };
}

function purchaseReversal(id: string, amountCents: number, sourceTransactionId = 'txn-1') {
  return { id, type: 'purchase_reversal', amountCents, sourceTransactionId };
}

function invoice(overrides: Partial<AnticipatableInvoice>): AnticipatableInvoice {
  return {
    id: overrides.id ?? 'card-1_2026-08',
    cardId: overrides.cardId ?? 'card-1',
    referenceMonth: overrides.referenceMonth ?? '2026-08',
    status: overrides.status ?? 'open',
    ledgerEntries: overrides.ledgerEntries ?? []
  };
}

describe('groupAnticipatablePurchases', () => {
  // A regra central (Nubank): antecipação é da ÚLTIMA parcela pra trás. Cada grupo traz as
  // parcelas futuras ordenadas da última pra primeira, e a UI antecipa `slice(0, N)` = as
  // últimas N. Nunca dá pra antecipar uma do meio deixando as posteriores.
  it('orders each purchase from the last installment to the first', () => {
    const groups = groupAnticipatablePurchases(
      [
        invoice({ id: 'inv-08', referenceMonth: '2026-08', ledgerEntries: [purchase('e-3', 10000, { installmentNumber: 3, installmentTotal: 5 })] }),
        invoice({ id: 'inv-10', referenceMonth: '2026-10', ledgerEntries: [purchase('e-5', 10000, { installmentNumber: 5, installmentTotal: 5 })] }),
        invoice({ id: 'inv-09', referenceMonth: '2026-09', ledgerEntries: [purchase('e-4', 10000, { installmentNumber: 4, installmentTotal: 5 })] })
      ],
      current
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].sourceTransactionId).toBe('txn-1');
    expect(groups[0].installmentTotal).toBe(5);
    // Última (#5) primeiro.
    expect(groups[0].installments.map((i) => i.installmentNumber)).toEqual([5, 4, 3]);
    // "Antecipar as últimas 2" = #5 e #4.
    expect(groups[0].installments.slice(0, 2).map((i) => i.installmentNumber)).toEqual([5, 4]);
  });

  // Sem installmentNumber (compras antigas, anteriores ao campo): ordena pelo mês, mais
  // recente primeiro — mesmo efeito de "última pra trás".
  it('falls back to reference month when the installment number is unknown', () => {
    const groups = groupAnticipatablePurchases(
      [
        invoice({ id: 'inv-08', referenceMonth: '2026-08', ledgerEntries: [purchase('e-08', 10000)] }),
        invoice({ id: 'inv-12', referenceMonth: '2026-12', ledgerEntries: [purchase('e-12', 10000)] }),
        invoice({ id: 'inv-10', referenceMonth: '2026-10', ledgerEntries: [purchase('e-10', 10000)] })
      ],
      current
    );

    expect(groups[0].installments.map((i) => i.referenceMonth)).toEqual(['2026-12', '2026-10', '2026-08']);
  });

  it('separates installments of different purchases into different groups', () => {
    const groups = groupAnticipatablePurchases(
      [
        invoice({
          id: 'inv-08',
          referenceMonth: '2026-08',
          ledgerEntries: [
            purchase('a-8', 10000, { sourceTransactionId: 'txn-A', installmentNumber: 2, installmentTotal: 3 }),
            purchase('b-8', 5000, { sourceTransactionId: 'txn-B', installmentNumber: 6, installmentTotal: 10 })
          ]
        })
      ],
      current
    );

    expect(groups.map((g) => g.sourceTransactionId).sort()).toEqual(['txn-A', 'txn-B']);
  });

  // Regressão: faturas passadas ainda em aberto não são antecipáveis.
  it('never offers a past invoice, even when still unpaid', () => {
    const groups = groupAnticipatablePurchases(
      [
        invoice({ id: 'inv-05', referenceMonth: '2026-05', status: 'closed', ledgerEntries: [purchase('e-05', 10000)] }),
        invoice({ id: 'inv-08', referenceMonth: '2026-08', ledgerEntries: [purchase('e-08', 10000)] })
      ],
      current
    );

    expect(groups[0].installments.map((i) => i.entryId)).toEqual(['e-08']);
  });

  it('never offers the current invoice, other cards, or paid/overpaid invoices', () => {
    expect(
      groupAnticipatablePurchases([invoice({ id: current.id, referenceMonth: '2026-07', ledgerEntries: [purchase('e-07', 10000)] })], current)
    ).toEqual([]);
    expect(
      groupAnticipatablePurchases([invoice({ id: 'other', cardId: 'card-2', referenceMonth: '2026-09', ledgerEntries: [purchase('e-x', 10000)] })], current)
    ).toEqual([]);
    expect(
      groupAnticipatablePurchases(
        [invoice({ id: 'inv-08', referenceMonth: '2026-08', status: 'paid', ledgerEntries: [purchase('e-08', 10000)] })],
        current
      )
    ).toEqual([]);
  });

  it('hides exactly one sibling installment per anticipation credit, not all of them', () => {
    const groups = groupAnticipatablePurchases(
      [
        invoice({
          id: 'inv-08',
          referenceMonth: '2026-08',
          ledgerEntries: [purchase('e-08a', 10000), purchase('e-08b', 10000), anticipationCredit('c-08', 10000)]
        })
      ],
      current
    );

    expect(groups[0].installments.map((i) => i.entryId)).toEqual(['e-08b']);
  });

  // Regressão: compra à vista (sem installmentTotal, ocorre uma única vez no ledger todo)
  // que só caiu numa fatura futura porque a atual já fechou não é "parcela antecipável".
  it('ignores a single-shot purchase that just rolled into a future invoice', () => {
    const groups = groupAnticipatablePurchases(
      [invoice({ id: 'inv-08', referenceMonth: '2026-08', ledgerEntries: [purchase('e-08', 5000, { sourceTransactionId: 'txn-avista' })] })],
      current
    );

    expect(groups).toEqual([]);
  });

  it('ignores ledger entries that are not purchases', () => {
    const groups = groupAnticipatablePurchases(
      [
        invoice({
          id: 'inv-08',
          referenceMonth: '2026-08',
          ledgerEntries: [
            { id: 'fee', type: 'fee', amountCents: 500, sourceTransactionId: 'txn-fee' },
            { id: 'pay', type: 'payment', amountCents: 500, sourceTransactionId: 'txn-pay' }
          ]
        })
      ],
      current
    );

    expect(groups).toEqual([]);
  });

  // Bug real (09/08/2026), mesma família do fix de 28/07 em `ongoingInstallmentPurchases`: excluir
  // a compra no Extrato NÃO apaga os `purchase` das faturas futuras — a Cloud Function só grava um
  // estorno ao lado. A lista continuava oferecendo pra antecipar parcelas de uma compra que já não
  // existe (e sem nome, porque a transação excluída não entra no mapa de descrições da tela).
  it('drops purchases deleted in the Extrato, even when only one installment was reversed', () => {
    const groups = groupAnticipatablePurchases(
      [
        invoice({
          id: 'inv-08',
          referenceMonth: '2026-08',
          ledgerEntries: [
            purchase('e-1', 10000, { sourceTransactionId: 'txn-deleted', installmentNumber: 1, installmentTotal: 3 }),
            purchaseReversal('r-1', 10000, 'txn-deleted')
          ]
        }),
        // Estorno só na fatura de agosto: setembro segue com o `purchase` cru. Antes do fix, esta
        // parcela sozinha mantinha o grupo inteiro vivo na lista.
        invoice({
          id: 'inv-09',
          referenceMonth: '2026-09',
          ledgerEntries: [
            purchase('e-2', 10000, { sourceTransactionId: 'txn-deleted', installmentNumber: 2, installmentTotal: 3 }),
            purchase('e-9', 5000, { sourceTransactionId: 'txn-alive', installmentNumber: 2, installmentTotal: 3 })
          ]
        }),
        invoice({
          id: 'inv-10',
          referenceMonth: '2026-10',
          ledgerEntries: [purchase('e-10', 5000, { sourceTransactionId: 'txn-alive', installmentNumber: 3, installmentTotal: 3 })]
        })
      ],
      current
    );

    expect(groups.map((group) => group.sourceTransactionId)).toEqual(['txn-alive']);
  });
});

// Nubank esconde a parcela antecipada da fatura futura — não deixa "compra R$300 / crédito
// -R$300" visível lado a lado. Casa purchase↔credit pela mesma compra e valor.
describe('anticipatedAwayEntryIds', () => {
  it('esconde a parcela e o crédito quando eles se cancelam', () => {
    const entries = [purchase('p1', 30000), anticipationCredit('c1', 30000)];
    expect(anticipatedAwayEntryIds(entries)).toEqual(new Set(['p1', 'c1']));
  });

  it('não esconde uma compra sem crédito correspondente', () => {
    const entries = [purchase('p1', 30000)];
    expect(anticipatedAwayEntryIds(entries)).toEqual(new Set());
  });

  it('não esconde uma compra nova que caiu na mesma fatura (não casa em valor)', () => {
    // A parcela antiga (8/10, R$300) foi antecipada; uma compra nova de R$500 chegou depois.
    const entries = [purchase('p-old', 30000, { sourceTransactionId: 'txn-old' }), anticipationCredit('c1', 30000, 'txn-old'), purchase('p-new', 50000, { sourceTransactionId: 'txn-new' })];
    expect(anticipatedAwayEntryIds(entries)).toEqual(new Set(['p-old', 'c1']));
  });

  it('casa um crédito por parcela quando há mais de uma da mesma compra', () => {
    const entries = [
      purchase('p1', 30000),
      purchase('p2', 30000),
      anticipationCredit('c1', 30000)
    ];
    const hidden = anticipatedAwayEntryIds(entries);
    expect(hidden.size).toBe(2);
    expect(hidden.has('c1')).toBe(true);
    // Só uma das duas parcelas é anulada — a outra continua visível.
    expect(hidden.has('p1') !== hidden.has('p2')).toBe(true);
  });

  it('não esconde crédito de outro tipo (estorno) que não seja de antecipação', () => {
    const entries = [purchase('p1', 30000), { id: 'r1', type: 'refund_credit', amountCents: 30000, sourceTransactionId: 'txn-1' }];
    expect(anticipatedAwayEntryIds(entries)).toEqual(new Set());
  });

  it('esconde a parcela e o estorno quando a compra no cartão é excluída (purchase_reversal)', () => {
    const entries = [purchase('p1', 30000), purchaseReversal('r1', 30000)];
    const hidden = anticipatedAwayEntryIds(entries);
    expect(hidden.has('p1')).toBe(true);
    expect(hidden.has('r1')).toBe(true);
  });

  // Os dois casos abaixo saíram da conta real do dono (09/08/2026): ele antecipou a parcela 3/3 de
  // uma compra de R$ 10 e depois excluiu a compra. Saldo das duas faturas certo; sobrou ruído.

  // Fatura de DESTINO: o débito da antecipação continuava listado como se fosse uma compra viva.
  it('esconde o débito da antecipação quando a compra foi excluída depois', () => {
    const entries = [
      { id: 'a1', type: 'installment_anticipation', amountCents: 1000, sourceTransactionId: 'txn-1' },
      purchaseReversal('r1', 1000)
    ];
    expect(anticipatedAwayEntryIds(entries)).toEqual(new Set(['a1', 'r1']));
  });

  // ⚠️ O inverso, e é o que separa "compra excluída" de "antecipação normal": numa antecipação
  // legítima o crédito que anularia o débito está na OUTRA fatura. Sem par aqui, o débito TEM que
  // continuar visível — é dinheiro pesando nesta fatura agora.
  it('NÃO esconde o débito de uma antecipação normal (crédito mora na outra fatura)', () => {
    const entries = [{ id: 'a1', type: 'installment_anticipation', amountCents: 1000, sourceTransactionId: 'txn-1' }];
    expect(anticipatedAwayEntryIds(entries)).toEqual(new Set());
  });

  // Fatura de ORIGEM: os 4 lançamentos se anulam, mas `anticipation_credit_reversal` somava em
  // "Compras" sem nunca virar linha — o cabeçalho ficava R$ 10 acima da soma da lista.
  it('zera a fatura de origem de uma parcela antecipada cuja compra foi excluída', () => {
    const entries = [
      purchase('p1', 1000),
      anticipationCredit('c1', 1000),
      { id: 'cr1', type: 'anticipation_credit_reversal', amountCents: 1000, sourceTransactionId: 'txn-1' },
      purchaseReversal('r1', 1000)
    ];
    expect(anticipatedAwayEntryIds(entries)).toEqual(new Set(['p1', 'c1', 'cr1', 'r1']));
    expect(invoiceHasVisibleActivity(entries)).toBe(false);
  });
});

describe('invoiceHasVisibleActivity', () => {
  it('fatura só com o par antecipado fica vazia', () => {
    const entries = [purchase('p1', 30000), anticipationCredit('c1', 30000)];
    expect(invoiceHasVisibleActivity(entries)).toBe(false);
  });

  it('fatura sem nenhum lançamento fica vazia', () => {
    expect(invoiceHasVisibleActivity([])).toBe(false);
  });

  it('fatura só com o par compra excluída + estorno fica vazia', () => {
    const entries = [purchase('p1', 30000), purchaseReversal('r1', 30000)];
    expect(invoiceHasVisibleActivity(entries)).toBe(false);
  });

  it('fatura com uma compra nova (não casada) continua visível', () => {
    const entries = [purchase('p-old', 30000, { sourceTransactionId: 'txn-old' }), anticipationCredit('c1', 30000, 'txn-old'), purchase('p-new', 50000, { sourceTransactionId: 'txn-new' })];
    expect(invoiceHasVisibleActivity(entries)).toBe(true);
  });

  it('fatura com pagamento continua visível mesmo com saldo zero', () => {
    const entries = [purchase('p1', 30000), { id: 'pay1', type: 'payment', amountCents: 30000, sourceTransactionId: 'txn-1' }];
    expect(invoiceHasVisibleActivity(entries)).toBe(true);
  });
});
