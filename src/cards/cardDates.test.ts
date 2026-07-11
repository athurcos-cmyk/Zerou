import { describe, expect, it } from 'vitest';
import { invoiceDueDateForReferenceMonth, pickCurrentInvoice, resolveInstallmentCycle, resolveInvoiceCycle } from './cardDates';

describe('resolveInvoiceCycle', () => {
  it('keeps the due date in the same month as closing when dueDay is after closingDay', () => {
    const cycle = resolveInvoiceCycle(new Date('2026-07-09T12:00:00'), 10, 20);

    expect(cycle.referenceMonth).toBe('2026-07');
    expect(cycle.dueDate.toISOString().slice(0, 10)).toBe('2026-07-20');
  });

  // Regressão: cartão real muito comum no Brasil fecha tarde no mês (ex. dia 25) e
  // vence cedo no mês seguinte (ex. dia 5). Sem tratar esse caso, o vencimento
  // calculado ficava no MESMO mês do fechamento — antes até da própria compra que
  // gerou a fatura (compra dia 9, "vencimento" calculado dia 5, antes da compra e
  // antes do fechamento dia 25). Isso também fazia essa compra contar como
  // "Comprometido" já no mês corrente, quando na vida real só fica devida no mês
  // seguinte (por isso a percepção do dono de que "vou pagar mês que vem" não batia
  // com o app).
  it('rolls the due date to the following month when dueDay is before closingDay', () => {
    const cycle = resolveInvoiceCycle(new Date('2026-07-09T12:00:00'), 25, 5);

    expect(cycle.referenceMonth).toBe('2026-07');
    expect(cycle.dueDate.toISOString().slice(0, 10)).toBe('2026-08-05');
  });

  it('rolls both the reference month and due date forward for a purchase made after closing', () => {
    const cycle = resolveInvoiceCycle(new Date('2026-07-26T12:00:00'), 25, 5);

    expect(cycle.referenceMonth).toBe('2026-08');
    expect(cycle.dueDate.toISOString().slice(0, 10)).toBe('2026-09-05');
  });
});

describe('resolveInstallmentCycle', () => {
  function monthsFor(purchase: Date, closingDay: number, dueDay: number, count: number) {
    return Array.from({ length: count }, (_, index) =>
      resolveInstallmentCycle(purchase, closingDay, dueDay, index).referenceMonth
    );
  }

  it('spreads installments over consecutive invoices in the common case', () => {
    expect(monthsFor(new Date(2026, 6, 5, 12), 10, 20, 4)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
  });

  // Regressão: as parcelas eram calculadas com addMonths(purchaseDate, index), que
  // clampa 31/jan em 28/fev. Num cartão que fecha dia 28 (o máximo permitido pela UI),
  // o dia clampado deixa de ser "> closingDay": a 2ª parcela caía na MESMA fatura de
  // fevereiro que a 1ª, e março ficava sem parcela nenhuma. O cliente pagava duas
  // parcelas juntas num mês e nenhuma no seguinte.
  it('does not collide two installments in one invoice when February clamps the purchase day', () => {
    expect(monthsFor(new Date(2026, 0, 31, 12), 28, 10, 4)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05']);
  });

  it('keeps consecutive invoices for a purchase on the 30th of a 31-day month', () => {
    expect(monthsFor(new Date(2026, 0, 30, 12), 28, 10, 3)).toEqual(['2026-02', '2026-03', '2026-04']);
  });

  it('rolls the first invoice forward when the purchase happens after closing', () => {
    expect(monthsFor(new Date(2026, 6, 26, 12), 25, 5, 3)).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('advances the due date with each installment on a card that closes late and is due next month', () => {
    const third = resolveInstallmentCycle(new Date(2026, 6, 9, 12), 25, 5, 2);

    expect(third.referenceMonth).toBe('2026-09');
    expect(third.dueDate.toISOString().slice(0, 10)).toBe('2026-10-05');
  });

  it('crosses the year boundary without losing a month', () => {
    expect(monthsFor(new Date(2026, 10, 15, 12), 20, 28, 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
});

describe('invoiceDueDateForReferenceMonth', () => {
  // Usado ao lançar uma compra parcelada já em andamento: a pessoa diz o mês da fatura,
  // e daí sai o vencimento pela mesma regra de `resolveInvoiceCycle`.
  it('vence no próprio mês de referência quando vence depois de fechar', () => {
    // fecha dia 10, vence dia 20 → vencimento no próprio mês.
    expect(invoiceDueDateForReferenceMonth('2026-09', 10, 20).toISOString().slice(0, 10)).toBe('2026-09-20');
  });

  it('rola pro mês seguinte quando o cartão vence antes de fechar', () => {
    // fecha dia 25, vence dia 5 → a fatura de setembro vence em outubro.
    expect(invoiceDueDateForReferenceMonth('2026-09', 25, 5).toISOString().slice(0, 10)).toBe('2026-10-05');
  });

  it('clampa o dia de vencimento em meses curtos', () => {
    // vence dia 31, fatura de fevereiro → 28 (2026 não é bissexto).
    expect(invoiceDueDateForReferenceMonth('2026-02', 10, 31).toISOString().slice(0, 10)).toBe('2026-02-28');
  });
});

describe('pickCurrentInvoice', () => {
  // Regressão: uma compra parcelada cria faturas abertas em vários meses futuros ao
  // mesmo tempo. A fatura "atual" (que acumula compras novas e fecha em breve) é
  // sempre a de referenceMonth mais próximo, não a que aparece primeiro no array
  // (subscribeInvoices ordena por referenceMonth desc, então a mais distante vinha
  // primeiro e o antigo `.find(status === 'open')` escolhia ela por engano).
  it('picks the open invoice with the earliest referenceMonth, not array order', () => {
    const invoices = [
      { id: 'inv-09', status: 'open', referenceMonth: '2026-09' },
      { id: 'inv-08', status: 'open', referenceMonth: '2026-08' },
      { id: 'inv-07', status: 'open', referenceMonth: '2026-07' }
    ];

    expect(pickCurrentInvoice(invoices)?.id).toBe('inv-07');
  });

  it('falls back to the first invoice when none are open', () => {
    const invoices = [
      { id: 'inv-paid', status: 'paid', referenceMonth: '2026-06' },
      { id: 'inv-closed', status: 'closed', referenceMonth: '2026-07' }
    ];

    expect(pickCurrentInvoice(invoices)?.id).toBe('inv-paid');
  });

  it('returns null for an empty list', () => {
    expect(pickCurrentInvoice([])).toBeNull();
  });
});
