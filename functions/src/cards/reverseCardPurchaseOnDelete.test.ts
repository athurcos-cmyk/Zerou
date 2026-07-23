import { describe, expect, it } from 'vitest';
import { reversalIdFor, reversalTypeFor } from './reverseCardPurchaseOnDelete.js';
import { invoiceTotalsDeltaForEntry, outstandingFromTotals, type InvoiceLedgerEntryType } from './invoiceTotals.js';

/**
 * Regressão de um bug real encontrado ao vivo (2026-07-23): o id do reversal era
 * `${transactionId}_reversal_${entryDoc.id}` truncado em 140 caracteres. Um entry de
 * antecipação (`anticipation_credit_${sourceTransactionId}_${invoiceId}`, de
 * `anticipateInstallments` em `cardService.ts`) já tem ~103 caracteres sozinho — concatenado
 * com o prefixo do reversal, ultrapassa 140, e o corte remove a parte final do `invoiceId`
 * (o mês), que é exatamente o que diferenciava uma parcela antecipada da outra. Antecipar 4
 * parcelas de meses diferentes e depois excluir a compra fazia os 4 reversals colidirem no
 * MESMO id truncado — `batch.set` sobrescrevia silenciosamente, sobrando só 1 dos 4 no
 * Firestore. Reproduzido ao vivo: compra de R$350 (7 parcelas de R$50) com 4 antecipadas,
 * excluir deixava R$150 de limite usado fantasma (3 reversals "perdidos" por colisão).
 */
describe('reversalIdFor', () => {
  // Mesmo formato exato que `anticipateInstallments` usa (`cardService.ts`) — sourceTransactionId
  // de 36 chars (`txn_` + 32 hex) e invoiceId de 45 chars (`card_` + 32 hex + `_yyyy-MM`).
  function anticipationCreditEntryId(month: string): string {
    const sourceTransactionId = `txn_${'a'.repeat(32)}`;
    const invoiceId = `card_${'b'.repeat(32)}_${month}`;
    return `anticipation_credit_${sourceTransactionId}_${invoiceId}`;
  }

  it('gera ids diferentes para entries de antecipação de meses diferentes (não colide)', () => {
    const months = ['2026-12', '2027-01', '2027-02', '2027-03'];
    const entryIds = months.map(anticipationCreditEntryId);

    // Confirma o cenário real: os entryIds só diferem na parte final (o mês) — é exatamente
    // essa parte que o esquema antigo (concatenar + truncar em 140) cortava.
    entryIds.forEach((id) => expect(id.length).toBeGreaterThan(100));

    const reversalIds = entryIds.map(reversalIdFor);
    expect(new Set(reversalIds).size).toBe(4);
  });

  it('é determinístico — o mesmo entryId sempre produz o mesmo reversalId (idempotência)', () => {
    const entryId = anticipationCreditEntryId('2026-12');
    expect(reversalIdFor(entryId)).toBe(reversalIdFor(entryId));
  });

  it('produz um id bem abaixo do limite de 140 caracteres do Firestore, mesmo pro entryId mais longo', () => {
    const entryId = anticipationCreditEntryId('2026-12');
    expect(reversalIdFor(entryId).length).toBeLessThan(50);
  });
});

describe('reversalTypeFor', () => {
  it('reverte installment_anticipation_credit (crédito) com anticipation_credit_reversal (débito)', () => {
    expect(reversalTypeFor('installment_anticipation_credit')).toBe('anticipation_credit_reversal');
  });

  it('reverte purchase e installment_anticipation (débitos) com purchase_reversal (crédito) — sem mudança', () => {
    expect(reversalTypeFor('purchase')).toBe('purchase_reversal');
    expect(reversalTypeFor('installment_anticipation')).toBe('purchase_reversal');
    expect(reversalTypeFor(undefined)).toBe('purchase_reversal');
  });
});

/**
 * Regressão do achado #14/#16 da auditoria (2026-07-22): editar/excluir uma compra parcelada
 * que já teve alguma parcela antecipada corrompia o total da fatura futura, porque a reversão
 * tratava um `installment_anticipation_credit` (que já é crédito) como se fosse um débito a
 * cancelar — dobrando o crédito em vez de zerá-lo. Este teste simula a matemática completa
 * (sem mockar Firestore/Cloud Functions — mesmo estilo dos outros testes desta pasta, que
 * testam a lógica pura, não o trigger em si) pro cenário relatado: compra em 10x, parcela 8
 * antecipada pra fatura atual, depois a compra inteira é editada (soft-delete + recreate).
 */
describe('reversão completa de uma compra com parcela antecipada (simulação de totais)', () => {
  interface LedgerEntry {
    invoiceId: string;
    type: InvoiceLedgerEntryType;
    amountCents: number;
  }

  function applyEntries(entries: LedgerEntry[]) {
    const totals = new Map<string, { purchasesTotalCents: number; paymentsTotalCents: number; creditsTotalCents: number; feesTotalCents: number }>();
    for (const entry of entries) {
      const current = totals.get(entry.invoiceId) ?? { purchasesTotalCents: 0, paymentsTotalCents: 0, creditsTotalCents: 0, feesTotalCents: 0 };
      const delta = invoiceTotalsDeltaForEntry(entry.type, entry.amountCents);
      totals.set(entry.invoiceId, {
        purchasesTotalCents: current.purchasesTotalCents + delta.purchasesTotalCents,
        paymentsTotalCents: current.paymentsTotalCents + delta.paymentsTotalCents,
        creditsTotalCents: current.creditsTotalCents + delta.creditsTotalCents,
        feesTotalCents: current.feesTotalCents + delta.feesTotalCents,
      });
    }
    return totals;
  }

  it('zera os totais das faturas envolvidas depois de reverter compra + antecipação (débito e crédito)', () => {
    const installmentCents = 30000; // R$300 cada uma das 10 parcelas

    // Estado ANTES da edição: 10 parcelas `purchase` (uma por fatura, invoice-1..invoice-10),
    // parcela 8 antecipada pra invoice-1 (débito `installment_anticipation` em invoice-1 +
    // crédito `installment_anticipation_credit` em invoice-8, cancelando a purchase original ali).
    const originalEntries: LedgerEntry[] = [
      ...Array.from({ length: 10 }, (_, i) => ({ invoiceId: `invoice-${i + 1}`, type: 'purchase' as const, amountCents: installmentCents })),
      { invoiceId: 'invoice-1', type: 'installment_anticipation', amountCents: installmentCents },
      { invoiceId: 'invoice-8', type: 'installment_anticipation_credit', amountCents: installmentCents },
    ];

    const beforeTotals = applyEntries(originalEntries);
    // Confirma o setup do cenário: invoice-1 tem a compra + o débito de antecipação (2×);
    // invoice-8 tem a compra cancelada pelo crédito de antecipação (líquido 0, "some" da fatura).
    expect(beforeTotals.get('invoice-1')!.purchasesTotalCents).toBe(installmentCents * 2);
    const invoice8Before = beforeTotals.get('invoice-8')!;
    expect(outstandingFromTotals(invoice8Before).outstandingBalanceCents).toBe(0);

    // Reversão: cada entry original vira uma entrada de reversão, na MESMA fatura, com o tipo
    // escolhido por `reversalTypeFor` (é exatamente o que `reverseCardPurchaseOnDelete` faz).
    const reversalEntries: LedgerEntry[] = originalEntries.map((entry) => ({
      invoiceId: entry.invoiceId,
      type: reversalTypeFor(entry.type),
      amountCents: entry.amountCents,
    }));

    const finalTotals = applyEntries([...originalEntries, ...reversalEntries]);

    // Toda fatura tocada pela compra original (incluindo a que só tinha o crédito de
    // antecipação) precisa voltar a outstanding = 0 — como se a compra nunca tivesse existido.
    for (const invoiceId of new Set(originalEntries.map((e) => e.invoiceId))) {
      const totals = finalTotals.get(invoiceId)!;
      const outstanding = outstandingFromTotals(totals);
      expect({ invoiceId, ...outstanding }).toEqual({ invoiceId, outstandingBalanceCents: 0, overpaidCreditCents: 0 });
    }
  });

  it('sem a correção (revertendo tudo como crédito), a fatura da parcela antecipada ficaria com crédito fantasma', () => {
    // Mesma simulação, mas usando o comportamento ANTIGO (bugado): tudo vira `purchase_reversal`,
    // independente do tipo original. Este teste documenta o bug que existia — não é o
    // comportamento correto, serve só de contraste pra provar que a correção era necessária.
    const installmentCents = 30000;
    const originalEntries: LedgerEntry[] = [
      { invoiceId: 'invoice-8', type: 'purchase', amountCents: installmentCents },
      { invoiceId: 'invoice-8', type: 'installment_anticipation_credit', amountCents: installmentCents },
    ];
    const buggyReversals: LedgerEntry[] = originalEntries.map((entry) => ({
      invoiceId: entry.invoiceId,
      type: 'purchase_reversal', // comportamento antigo: sempre crédito, ignora o tipo original
      amountCents: entry.amountCents,
    }));

    const totals = applyEntries([...originalEntries, ...buggyReversals]);
    const outstanding = outstandingFromTotals(totals.get('invoice-8')!);

    // Bug: purchasesTotal fica em 1×parcela (só a compra original) e creditsTotal em 3×
    // (o crédito de antecipação original + a reversão-crédito da compra, corretas, MAIS a
    // reversão-crédito do próprio crédito de antecipação, que deveria ter sido um débito).
    // outstanding = 1× − 3× = −2×, ou seja, 2 parcelas de crédito fantasma — não outstanding=0.
    expect(outstanding.overpaidCreditCents).toBe(installmentCents * 2);
  });
});
