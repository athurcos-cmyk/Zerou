import type { InvoiceLedgerInput, InvoiceCalculation, InvoiceMutationResult } from './invoiceTypes';
import type { InvoiceStatus } from '../../types/contracts';

const debitTypes = new Set(['purchase', 'manual_debit']);
const feeTypes = new Set(['interest', 'fine', 'iof', 'fee']);
const paymentTypes = new Set(['payment', 'advance_payment']);
const creditTypes = new Set(['refund_credit', 'chargeback_credit', 'manual_credit', 'purchase_reversal']);

function uniqueEntries(entries: InvoiceLedgerInput[]) {
  const seen = new Set<string>();
  const result: InvoiceLedgerInput[] = [];

  entries.forEach((entry) => {
    if (seen.has(entry.idempotencyKey)) {
      return;
    }

    seen.add(entry.idempotencyKey);
    result.push(entry);
  });

  return result;
}

export function appendLedgerEntry(entries: InvoiceLedgerInput[], entry: InvoiceLedgerInput): InvoiceMutationResult {
  if (entries.some((existing) => existing.idempotencyKey === entry.idempotencyKey)) {
    return { entries, created: false };
  }

  return { entries: [...entries, entry], created: true };
}

export function calculateInvoice(entries: InvoiceLedgerInput[], lifecycle: 'open' | 'closed' = 'open', dueDate?: Date): InvoiceCalculation {
  const appliedEntries = uniqueEntries(entries);
  let purchasesTotalCents = 0;
  let paymentsTotalCents = 0;
  let creditsTotalCents = 0;
  let feesTotalCents = 0;

  appliedEntries.forEach((entry) => {
    if (debitTypes.has(entry.type)) {
      purchasesTotalCents += entry.amountCents;
      return;
    }

    // Antecipação (débito na fatura atual) e o estorno de um crédito de antecipação
    // (`anticipation_credit_reversal`, gerado ao excluir uma compra com parcela antecipada)
    // entram como débito. Sincronizado com invoiceTotals.ts (Cloud Function) e signedCharge
    // (Análise) — os três precisam concordar, senão o total da fatura diverge em silêncio.
    if (entry.type === 'installment_anticipation' || entry.type === 'anticipation_credit_reversal') {
      purchasesTotalCents += entry.amountCents;
      return;
    }

    if (entry.type === 'installment_anticipation_credit') {
      creditsTotalCents += entry.amountCents;
      return;
    }

    if (feeTypes.has(entry.type)) {
      feesTotalCents += entry.amountCents;
      return;
    }

    if (paymentTypes.has(entry.type)) {
      paymentsTotalCents += entry.amountCents;
      return;
    }

    if (creditTypes.has(entry.type)) {
      creditsTotalCents += entry.amountCents;
    }
  });

  const rawBalance = purchasesTotalCents + feesTotalCents - paymentsTotalCents - creditsTotalCents;
  const outstandingBalanceCents = Math.max(rawBalance, 0);
  const overpaidCreditCents = Math.max(-rawBalance, 0);
  const status = resolveInvoiceStatus({
    lifecycle,
    outstandingBalanceCents,
    overpaidCreditCents,
    paymentsTotalCents,
    purchasesTotalCents,
    feesTotalCents,
    dueDate
  });

  return {
    purchasesTotalCents,
    paymentsTotalCents,
    creditsTotalCents,
    feesTotalCents,
    outstandingBalanceCents,
    overpaidCreditCents,
    status,
    recognizedExpenseCents: invoiceValueCents({ purchasesTotalCents, feesTotalCents, creditsTotalCents }),
    appliedEntries
  };
}

/**
 * Quanto a fatura VALE — o que foi gasto nela, independente de já ter sido pago.
 *
 * Existe porque "valor da fatura" e "saldo a pagar" são coisas diferentes que o app precisava
 * mostrar nos dois sentidos, e confundi-las esconde exatamente a metade que interessa:
 *
 * - **Saldo a pagar** (`outstandingBalanceCents`) responde *"quanto ainda devo?"*. Numa fatura
 *   quitada é zero — e zero é a resposta certa pra essa pergunta.
 * - **Valor da fatura** (esta função) responde *"quanto gastei nesse mês?"*. Continua o mesmo
 *   depois de pagar, e é o que a coluna do gráfico mede e o que o hero mostra numa fatura paga.
 *
 * ⚠️ **Não use `outstanding + payments` como atalho** — parece equivalente e não é: numa fatura
 * paga a MAIOR, `outstanding` é travado em 0 (o excedente vai pra `overpaidCreditCents`), então a
 * soma devolve o que foi *pago*, não o que foi *gasto* — pagar R$ 150 numa fatura de R$ 100 daria
 * "R$ 150 de gasto". Foi assim que a faixa nasceu em 08/08/2026, e a coluna de uma fatura paga a
 * maior sairia mais alta do que o mês realmente foi.
 *
 * Mesma fórmula do `recognizedExpenseCents` acima — de propósito, e daqui, pra não existirem duas.
 *
 * ⚠️ **Pode ser negativo, e não clampe aqui.** Crédito maior que as compras (estorno de um mês
 * anterior caindo neste) é um mês que andou pra trás, e a Análise depende desse sinal —
 * `recognizedExpenseCents` tem teste próprio afirmando que ele chega a −20000. Quem desenha barra
 * clampa na hora de desenhar (a altura mínima da coluna já faz isso), porque o piso é uma restrição
 * do pixel, não do dinheiro.
 */
export function invoiceValueCents(totals: {
  purchasesTotalCents: number;
  feesTotalCents: number;
  creditsTotalCents: number;
}) {
  return totals.purchasesTotalCents + totals.feesTotalCents - totals.creditsTotalCents;
}

/** Exportado à parte: `useCardsData` calcula o status a partir dos totais já persistidos, sem recomputar o ledger inteiro. */
export function resolveInvoiceStatus(input: {
  lifecycle: 'open' | 'closed';
  outstandingBalanceCents: number;
  overpaidCreditCents: number;
  paymentsTotalCents: number;
  purchasesTotalCents: number;
  feesTotalCents: number;
  dueDate?: Date;
}): InvoiceStatus {
  if (input.overpaidCreditCents > 0) {
    return 'overpaid';
  }

  // Fatura aberta permanece aberta até o fechamento, independente de pagamentos antecipados.
  if (input.lifecycle === 'open') {
    return 'open';
  }

  // Lifecycle fechada: resolve pelo estado dos pagamentos.
  if (input.outstandingBalanceCents === 0 && input.paymentsTotalCents > 0) {
    return 'paid';
  }

  if (input.paymentsTotalCents > 0) {
    return 'partial';
  }

  if (input.dueDate && input.dueDate < new Date() && input.outstandingBalanceCents > 0) {
    return 'overdue';
  }

  return 'closed';
}

export function expenseRecognizedWithoutInvoicePayments(entries: InvoiceLedgerInput[]) {
  return calculateInvoice(entries).recognizedExpenseCents;
}
