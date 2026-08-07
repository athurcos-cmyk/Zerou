// Porta de src/cards/installmentSchedule.ts (`invoicesForSpendingFromTransactions` +
// `installmentAmounts`) e da parte de ancoragem de src/finance/spendingAnalysis.ts
// (`installmentShiftBySource` + `anchoredMonthOf`). Cloud Functions não importa `src/` do app
// cliente — **mantenha em sincronia manualmente se a lógica original mudar.**
//
// Por que existe: a Vic (`buildFinancialContext.ts`) contava compra parcelada no cartão pelo
// VALOR CHEIO no mês da compra, então respondia número diferente do que a Análise e o Dashboard
// mostram — R$ 588,00 de um Airbnb em 4x contra R$ 147,00 em tela. Aqui, como no cliente, o
// cronograma é reconstruído a partir da PRÓPRIA TRANSAÇÃO, sem ler o ledger da fatura.
//
// Diferença de forma em relação ao cliente, de propósito: lá o par crédito+débito da antecipação é
// sintetizado (porque `installmentShiftBySource` deriva o deslocamento da posição da parcela 1 no
// ledger, e mover a parcela apagaria essa âncora); aqui o deslocamento é calculado direto de
// `installmentStart` + meses, então mover a parcela pro mês da antecipação é equivalente e mais
// simples. O resultado por mês é idêntico — é o que os testes comparam.

/** Divisão do valor entre as parcelas: 1 centavo a mais nas primeiras `resto`. */
export function installmentAmounts(totalCents: number, installments: number): number[] {
  const base = Math.floor(totalCents / installments);
  const remainder = totalCents % installments;
  return Array.from({ length: installments }, (_, index) => base + (index < remainder ? 1 : 0));
}

/** 'yyyy-MM' + n meses. */
function shiftMonthKey(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  if (!year || !m) return month;
  const shifted = new Date(year, m - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

/** Meses de `earlier` até `later`. `NaN` se qualquer um for inválido. */
function monthDiff(later: string, earlier: string): number {
  const [ly, lm] = later.split('-').map(Number);
  const [ey, em] = earlier.split('-').map(Number);
  if (!ly || !lm || !ey || !em) return NaN;
  return (ly - ey) * 12 + (lm - em);
}

/** `invoiceIdFor` (cardDates.ts) monta o id como `${cardId}_${referenceMonth}`. */
function firstInvoiceMonthOf(invoiceId: unknown): string | undefined {
  if (typeof invoiceId !== 'string') return undefined;
  const candidate = invoiceId.slice(invoiceId.lastIndexOf('_') + 1);
  return /^\d{4}-\d{2}$/.test(candidate) ? candidate : undefined;
}

export interface InstallmentTransactionFields {
  type?: unknown;
  amountCents?: unknown;
  installments?: unknown;
  installmentStart?: unknown;
  invoiceId?: unknown;
  cashMonth?: unknown;
  competenceMonth?: unknown;
  anticipatedInstallments?: unknown;
}

/**
 * Em que mês cada parcela desta compra conta, e quanto. Devolve `null` quando a transação **não**
 * é uma compra parcelada reconstruível — nesse caso quem chama mantém o comportamento antigo
 * (contar o valor cheio no mês da transação), que é o certo pra compra à vista.
 *
 * Regras espelhadas do cliente:
 * - parcela `i` (0-based) cai na fatura `primeiraFatura + i`;
 * - **deslocamento de 1 mês** quando a série começa na parcela 1 **e** a primeira fatura é
 *   exatamente 1 mês depois do mês da compra (é o que faz a parcela 1 contar no mês da COMPRA);
 * - compra "já em andamento" (`installmentStart > 1`) **nunca** desloca;
 * - parcela antecipada conta no mês em que se antecipou (`anticipatedInstallments`, chaveado pelo
 *   mês da FATURA da parcela).
 */
export function installmentSpendingMonths(
  txn: InstallmentTransactionFields
): Array<{ month: string; amountCents: number }> | null {
  if (txn.type !== 'card_purchase') return null;

  const installments = typeof txn.installments === 'number' ? txn.installments : 1;
  if (installments <= 1) return null;

  const firstInvoiceMonth = firstInvoiceMonthOf(txn.invoiceId);
  if (!firstInvoiceMonth) return null;

  const amountCents = typeof txn.amountCents === 'number' ? txn.amountCents : 0;
  const purchaseMonth =
    (typeof txn.cashMonth === 'string' && txn.cashMonth) ||
    (typeof txn.competenceMonth === 'string' && txn.competenceMonth) ||
    undefined;
  const start = typeof txn.installmentStart === 'number' ? txn.installmentStart : 1;
  const anticipated =
    txn.anticipatedInstallments && typeof txn.anticipatedInstallments === 'object'
      ? (txn.anticipatedInstallments as Record<string, unknown>)
      : undefined;

  // Mesma fórmula de `installmentShiftOf` em src/finance/spendingAnalysis.ts — mudou lá, muda
  // aqui. As duas travas: série "já em andamento" (`start !== 1`) nunca desloca, e `diff === 1`
  // exato em vez de clamp (qualquer outro valor é dado legado/torto e deslocar seria chute).
  const shift =
    start === 1 && purchaseMonth && monthDiff(firstInvoiceMonth, purchaseMonth) === 1 ? 1 : 0;

  return installmentAmounts(amountCents, installments).map((cents, index) => {
    const invoiceMonth = shiftMonthKey(firstInvoiceMonth, index);
    const anticipatedIn = anticipated?.[invoiceMonth];
    const month =
      typeof anticipatedIn === 'string' && /^\d{4}-\d{2}$/.test(anticipatedIn)
        ? anticipatedIn
        : shiftMonthKey(invoiceMonth, -shift);
    return { month, amountCents: cents };
  });
}
