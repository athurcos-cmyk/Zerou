import { describe, expect, it } from 'vitest';
import { pickCurrentInvoice, resolveInvoiceCycle } from './cardDates';

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
