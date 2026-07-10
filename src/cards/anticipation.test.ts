import { describe, expect, it } from 'vitest';
import { selectAnticipatableInstallments, type AnticipatableInvoice } from './anticipation';

const current = { id: 'card-1_2026-07', cardId: 'card-1', referenceMonth: '2026-07' };

function purchase(id: string, amountCents: number, sourceTransactionId = 'txn-1') {
  return { id, type: 'purchase', amountCents, sourceTransactionId };
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

describe('selectAnticipatableInstallments', () => {
  it('lists installments from every future invoice, earliest month first', () => {
    const result = selectAnticipatableInstallments(
      [
        invoice({ id: 'inv-09', referenceMonth: '2026-09', ledgerEntries: [purchase('e-09', 10000)] }),
        invoice({ id: 'inv-08', referenceMonth: '2026-08', ledgerEntries: [purchase('e-08', 10000)] })
      ],
      current
    );

    expect(result.map((item) => item.entryId)).toEqual(['e-08', 'e-09']);
  });

  // O caso que o dono descreveu: antecipar uma parcela de uma fatura de MESES depois,
  // como o Nubank permite — não só a do mês seguinte.
  it('allows anticipating an installment several months ahead', () => {
    const result = selectAnticipatableInstallments(
      [invoice({ id: 'inv-12', referenceMonth: '2026-12', ledgerEntries: [purchase('e-12', 10000)] })],
      current
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ invoiceId: 'inv-12', referenceMonth: '2026-12', amountCents: 10000 });
  });

  // Regressão: o filtro antigo era `inv.id !== invoiceId`, então qualquer fatura passada
  // ainda não paga entrava como "parcela futura". Antecipá-la creditava uma fatura
  // vencida e debitava a atual — jogava a dívida pra frente, o oposto de antecipar.
  it('never offers a past invoice, even when it is still unpaid', () => {
    const result = selectAnticipatableInstallments(
      [
        invoice({ id: 'inv-05', referenceMonth: '2026-05', status: 'closed', ledgerEntries: [purchase('e-05', 10000)] }),
        invoice({ id: 'inv-08', referenceMonth: '2026-08', ledgerEntries: [purchase('e-08', 10000)] })
      ],
      current
    );

    expect(result.map((item) => item.entryId)).toEqual(['e-08']);
  });

  it('never offers the current invoice itself', () => {
    const result = selectAnticipatableInstallments(
      [invoice({ id: current.id, referenceMonth: '2026-07', ledgerEntries: [purchase('e-07', 10000)] })],
      current
    );

    expect(result).toEqual([]);
  });

  it('ignores invoices from other cards', () => {
    const result = selectAnticipatableInstallments(
      [invoice({ id: 'other', cardId: 'card-2', referenceMonth: '2026-09', ledgerEntries: [purchase('e-x', 10000)] })],
      current
    );

    expect(result).toEqual([]);
  });

  it('ignores paid and overpaid future invoices', () => {
    const result = selectAnticipatableInstallments(
      [
        invoice({ id: 'inv-08', referenceMonth: '2026-08', status: 'paid', ledgerEntries: [purchase('e-08', 10000)] }),
        invoice({ id: 'inv-09', referenceMonth: '2026-09', status: 'overpaid', ledgerEntries: [purchase('e-09', 10000)] })
      ],
      current
    );

    expect(result).toEqual([]);
  });

  it('hides an installment that was already anticipated', () => {
    const result = selectAnticipatableInstallments(
      [
        invoice({
          id: 'inv-08',
          referenceMonth: '2026-08',
          ledgerEntries: [purchase('e-08', 10000), anticipationCredit('c-08', 10000)]
        })
      ],
      current
    );

    expect(result).toEqual([]);
  });

  // Todas as parcelas de uma compra parcelada carregam o MESMO sourceTransactionId.
  // Com um Set de ids "já antecipados", antecipar uma parcela escondia todas as irmãs
  // da mesma fatura. Contando por ocorrência, só uma some.
  it('hides exactly one sibling installment per anticipation credit, not all of them', () => {
    const result = selectAnticipatableInstallments(
      [
        invoice({
          id: 'inv-08',
          referenceMonth: '2026-08',
          ledgerEntries: [
            purchase('e-08a', 10000),
            purchase('e-08b', 10000),
            anticipationCredit('c-08', 10000)
          ]
        })
      ],
      current
    );

    expect(result.map((item) => item.entryId)).toEqual(['e-08b']);
  });

  it('keeps a later installment of the same purchase available after an earlier one is anticipated', () => {
    const result = selectAnticipatableInstallments(
      [
        invoice({
          id: 'inv-08',
          referenceMonth: '2026-08',
          ledgerEntries: [purchase('e-08', 10000), anticipationCredit('c-08', 10000)]
        }),
        invoice({ id: 'inv-09', referenceMonth: '2026-09', ledgerEntries: [purchase('e-09', 10000)] })
      ],
      current
    );

    expect(result.map((item) => item.entryId)).toEqual(['e-09']);
  });

  it('ignores ledger entries that are not purchases', () => {
    const result = selectAnticipatableInstallments(
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

    expect(result).toEqual([]);
  });
});
