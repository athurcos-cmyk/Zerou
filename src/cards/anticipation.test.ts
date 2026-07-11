import { describe, expect, it } from 'vitest';
import { groupAnticipatablePurchases, type AnticipatableInvoice } from './anticipation';

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
});
