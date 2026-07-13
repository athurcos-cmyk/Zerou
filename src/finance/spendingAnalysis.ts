import type { InvoiceLedgerEntry, InvoiceLedgerEntryType, Transaction } from '../types/contracts';

/**
 * Análise de gastos em **regime de caixa (por parcela)**.
 *
 * Uma compra parcelada de R$3.000 em 10x NÃO é gasto de R$3.000 no mês da compra: é
 * R$300 em cada uma das 10 faturas. Quem sabe disso é o ledger da fatura (uma parcela
 * `purchase` por mês), não a transação `card_purchase` (que guarda o valor cheio no mês
 * da compra, pra outros fins). Por isso a Análise conta o cartão pela parcela que cai na
 * fatura de cada mês — e não pela transação.
 *
 * Bônus de graça: como antecipar parcela grava um débito na fatura atual
 * (`installment_anticipation`) e um crédito na futura (`installment_anticipation_credit`),
 * antecipar naturalmente move o gasto do mês futuro pro mês atual aqui também.
 *
 * Os sinais abaixo espelham `calculateInvoice` (`recognizedExpenseCents`): se divergirem,
 * a Análise deixa de bater com a fatura.
 */

const cardChargeTypes = new Set<InvoiceLedgerEntryType>([
  'purchase',
  'manual_debit',
  'installment_anticipation',
  'interest',
  'fine',
  'iof',
  'fee'
]);

const cardCreditTypes = new Set<InvoiceLedgerEntryType>([
  'installment_anticipation_credit',
  'refund_credit',
  'chargeback_credit',
  'manual_credit'
]);

// 'payment' e 'advance_payment' são liquidação da fatura, não gasto — ignorados de propósito.

/** Categoria "vazia" (compra no cartão sem categoria grava `categoryId: ''`). */
export const NO_CATEGORY = '__none__';

/** O que uma entrada do ledger vale como gasto reconhecido, com sinal. 0 = não é gasto. */
export function signedCharge(entry: Pick<InvoiceLedgerEntry, 'type' | 'amountCents'>): number {
  if (cardChargeTypes.has(entry.type)) return entry.amountCents;
  if (cardCreditTypes.has(entry.type)) return -entry.amountCents;
  return 0;
}

/** Fatura reduzida ao que a Análise precisa. `cardsData.invoices` já entrega esse shape. */
export interface InvoiceForSpending {
  referenceMonth: string;
  ledgerEntries: InvoiceLedgerEntry[];
}

const refundLikeTypes = new Set<Transaction['type']>(['refund', 'reimbursement', 'adjustment']);

function isCountableExpense(t: Transaction, month: string): boolean {
  if (t.deletedAt) return false;
  // Cartão entra pelo ledger (por parcela), nunca pela transação (valor cheio no mês da compra).
  // Estorno/reembolso/ajuste também entram — como crédito negativo na própria categoria, igual
  // ao crédito de cartão logo abaixo (signedCharge) — não como "gasto" positivo.
  if (t.type !== 'expense' && !refundLikeTypes.has(t.type)) return false;
  if ((t.cashMonth ?? t.competenceMonth) !== month) return false;
  // Aporte a meta/cofrinho não é "gasto".
  if (t.tags?.includes('meta') || t.tags?.includes('cofrinho')) return false;
  return true;
}

/**
 * Gasto por categoria num mês: despesas fora do cartão (pela competência da transação) +
 * parcelas de cartão que caem na fatura desse mês (pelo ledger). Retorna centavos por
 * `categoryId` (`NO_CATEGORY` quando sem categoria). Categorias podem vir negativas em mês
 * só de estorno — cabe a quem exibe filtrar.
 */
export function spendingByCategoryForMonth(
  month: string,
  transactions: Transaction[],
  invoices: InvoiceForSpending[],
  categoryOfTransaction: (transactionId: string | undefined) => string | undefined
): Map<string, number> {
  const totals = new Map<string, number>();
  const add = (categoryId: string | undefined, cents: number) => {
    if (cents === 0) return;
    const key = categoryId || NO_CATEGORY;
    totals.set(key, (totals.get(key) ?? 0) + cents);
  };

  for (const t of transactions) {
    if (!isCountableExpense(t, month)) continue;
    add(t.categoryId, refundLikeTypes.has(t.type) ? -t.amountCents : t.amountCents);
  }

  for (const invoice of invoices) {
    if (invoice.referenceMonth !== month) continue;
    for (const entry of invoice.ledgerEntries) {
      const signed = signedCharge(entry);
      if (signed === 0) continue;
      add(categoryOfTransaction(entry.sourceTransactionId), signed);
    }
  }

  return totals;
}

/** Soma dos sinais de todas as parcelas de uma fatura = gasto reconhecido dela. */
export function invoiceRecognizedExpense(invoice: InvoiceForSpending): number {
  return invoice.ledgerEntries.reduce((sum, entry) => sum + signedCharge(entry), 0);
}

export interface MonthlyTotals {
  month: string;
  incomeCents: number;
  expenseCents: number;
}

/**
 * Entradas e saídas por mês (barras dos últimos meses). Saída = despesas fora do cartão +
 * gasto reconhecido das faturas daquele mês. Entrada = receitas do mês.
 */
export function monthlyTotals(
  months: string[],
  transactions: Transaction[],
  invoices: InvoiceForSpending[]
): MonthlyTotals[] {
  const cardExpenseByMonth = new Map<string, number>();
  for (const invoice of invoices) {
    const recognized = invoiceRecognizedExpense(invoice);
    if (recognized === 0) continue;
    cardExpenseByMonth.set(invoice.referenceMonth, (cardExpenseByMonth.get(invoice.referenceMonth) ?? 0) + recognized);
  }

  return months.map((month) => {
    let incomeCents = 0;
    let expenseCents = cardExpenseByMonth.get(month) ?? 0;
    for (const t of transactions) {
      if (t.deletedAt) continue;
      const m = t.cashMonth ?? t.competenceMonth;
      if (m !== month) continue;
      if (t.tags?.includes('meta') || t.tags?.includes('cofrinho')) continue;
      if (t.type === 'expense') expenseCents += t.amountCents;
      else if (t.type === 'income' || t.type === 'refund' || t.type === 'reimbursement' || t.type === 'adjustment') incomeCents += t.amountCents;
    }
    return { month, incomeCents, expenseCents };
  });
}

export interface OngoingInstallmentPurchase {
  sourceTransactionId: string;
  description: string;
  installmentTotal: number;
  installmentValueCents: number;
  /** Valor cheio da compra = total de parcelas × valor da parcela (vale mesmo pra compra em andamento). */
  fullAmountCents: number;
  /** Parcelas que ainda vão cair (fatura no mês atual ou à frente), já líquidas de antecipação. */
  remainingCount: number;
  remainingCents: number;
}

/**
 * Compras parceladas ainda em andamento (têm parcela caindo no mês atual ou à frente),
 * pra dar visibilidade ao valor cheio ("R$3.000 em 10x") que a visão por parcela dilui.
 *
 * "Restante" olha só faturas de `referenceMonth >= currentMonth` e soma o líquido do ledger
 * por mês (parcela `purchase` positiva, crédito de antecipação negativo). Uma parcela já
 * antecipada some do mês de origem (o crédito zera o líquido daquele mês), então ela deixa
 * de contar como restante — igual ao cartão de verdade, onde antecipar reduz as parcelas
 * que faltam. Parcelas cujo mês já passou são consideradas pagas e não entram.
 */
export function ongoingInstallmentPurchases(
  currentMonth: string,
  invoices: InvoiceForSpending[],
  descriptionOfTransaction: (transactionId: string) => string | undefined
): OngoingInstallmentPurchase[] {
  interface Group {
    installmentTotal: number;
    installmentValueCents: number;
    // Líquido restante por mês futuro (>= currentMonth): parcela soma, crédito de antecipação abate.
    remainingByMonth: Map<string, number>;
  }
  const groups = new Map<string, Group>();
  const groupFor = (id: string) => {
    let group = groups.get(id);
    if (!group) {
      group = { installmentTotal: 0, installmentValueCents: 0, remainingByMonth: new Map() };
      groups.set(id, group);
    }
    return group;
  };

  for (const invoice of invoices) {
    const isFuture = invoice.referenceMonth >= currentMonth;
    for (const entry of invoice.ledgerEntries) {
      if (!entry.sourceTransactionId) continue;
      const isParcel = entry.type === 'purchase' && (entry.installmentTotal ?? 0) > 1;
      const isAnticipationCredit = entry.type === 'installment_anticipation_credit';
      if (!isParcel && !isAnticipationCredit) continue;

      const group = groupFor(entry.sourceTransactionId);
      if (isParcel) {
        group.installmentTotal = entry.installmentTotal ?? group.installmentTotal;
        group.installmentValueCents = entry.amountCents;
      }
      if (isFuture) {
        const month = invoice.referenceMonth;
        group.remainingByMonth.set(month, (group.remainingByMonth.get(month) ?? 0) + signedCharge(entry));
      }
    }
  }

  const result: OngoingInstallmentPurchase[] = [];
  for (const [sourceTransactionId, group] of groups) {
    if (group.installmentTotal <= 1) continue;
    let remainingCents = 0;
    let remainingCount = 0;
    for (const monthNet of group.remainingByMonth.values()) {
      if (monthNet <= 0) continue; // mês antecipado (líquido 0) ou sem cobrança não conta
      remainingCents += monthNet;
      remainingCount += 1;
    }
    if (remainingCents <= 0) continue;
    result.push({
      sourceTransactionId,
      description: descriptionOfTransaction(sourceTransactionId) ?? 'Compra parcelada',
      installmentTotal: group.installmentTotal,
      installmentValueCents: group.installmentValueCents,
      fullAmountCents: group.installmentTotal * group.installmentValueCents,
      remainingCount,
      remainingCents
    });
  }

  return result.sort((a, b) => b.remainingCents - a.remainingCents);
}

// ─── Projeção de meses futuros: o que já está COMPROMETIDO ────────────────────
//
// Num mês que ainda não chegou não existe "gasto realizado" — o que existe é o que a
// pessoa já assumiu: parcela de cartão caindo naquele mês (dado real do ledger) e conta
// a pagar vencendo naquele mês. NÃO projetamos recorrências aqui de propósito: elas
// seriam estimativa (valor/cancelamento incertos), e misturar previsão especulativa com
// obrigação real numa tela de Análise engana. Recorrência é uma camada "Previsto" à parte.

/** Conta a pagar reduzida ao que a projeção precisa (o caller resolve o mês do vencimento). */
export interface BillForCommitment {
  categoryId?: string;
  amountCents: number;
  status: string;
  dueMonth: string;
}

function isOpenBill(bill: BillForCommitment): boolean {
  return bill.status === 'pending' || bill.status === 'overdue';
}

/** Contas a pagar em aberto (pendente/atrasada) que vencem no mês, por categoria. */
export function billsByCategoryForMonth(month: string, bills: BillForCommitment[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const bill of bills) {
    if (bill.dueMonth !== month || !isOpenBill(bill)) continue;
    const key = bill.categoryId || NO_CATEGORY;
    totals.set(key, (totals.get(key) ?? 0) + bill.amountCents);
  }
  return totals;
}

/**
 * O que está comprometido num mês futuro, por categoria: parcelas de cartão que caem na
 * fatura daquele mês + contas a pagar em aberto que vencem nele. Reaproveita
 * `spendingByCategoryForMonth` pro cartão (que já lida com antecipação) e soma as contas.
 */
export function committedByCategoryForMonth(
  month: string,
  invoices: InvoiceForSpending[],
  bills: BillForCommitment[],
  categoryOfTransaction: (transactionId: string | undefined) => string | undefined
): Map<string, number> {
  // Sem transações: num mês futuro não há gasto realizado, só o comprometido.
  const totals = spendingByCategoryForMonth(month, [], invoices, categoryOfTransaction);
  for (const [categoryId, cents] of billsByCategoryForMonth(month, bills)) {
    totals.set(categoryId, (totals.get(categoryId) ?? 0) + cents);
  }
  return totals;
}

/**
 * Mês mais distante (>= currentMonth) que já tem algo comprometido — parcela de cartão
 * caindo na fatura ou conta a pagar vencendo. Define até onde o avançar-mês vai na Análise;
 * sem nada comprometido à frente, devolve o próprio mês atual (não navega pro futuro).
 */
export function lastCommittedMonth(
  currentMonth: string,
  invoices: InvoiceForSpending[],
  bills: BillForCommitment[]
): string {
  let max = currentMonth;
  for (const invoice of invoices) {
    if (invoice.referenceMonth > max && invoiceRecognizedExpense(invoice) > 0) max = invoice.referenceMonth;
  }
  for (const bill of bills) {
    if (bill.dueMonth > max && isOpenBill(bill)) max = bill.dueMonth;
  }
  return max;
}

// ─── Camada "Previsto": recorrências projetadas ───────────────────────────────
//
// Separada do "comprometido" (cartão + contas), que é obrigação real já cadastrada.
// Recorrência é sempre despesa (recordRecurringPayment cria type:'expense') e é uma
// ESTIMATIVA pro futuro (valor/continuidade incertos) — por isso entra rotulada como
// previsão, não como dado firme. Só faz sentido pra meses futuros: no mês corrente e nos
// passados a Análise usa transações reais, e projetar duplicaria o que a automação lançou.

type Frequency = 'weekly' | 'monthly' | 'yearly';

/** Regra de recorrência reduzida ao que a projeção precisa (nextOccurrenceAt já como Date). */
export interface RecurringForProjection {
  id: string;
  description: string;
  categoryId?: string;
  amountCents: number;
  frequency: Frequency;
  nextOccurrenceAt: Date;
  anchorDay?: number;
  isActive: boolean;
}

/** Uma recorrência projetada num mês, com o total do mês (soma das ocorrências). */
export interface ProjectedRecurring {
  id: string;
  description: string;
  categoryId?: string;
  amountCents: number;
}

/** Passos máximos ao avançar ocorrências — trava contra loop infinito (semanal por décadas). */
const RECURRING_STEP_CAP = 600;

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Recorrências (despesa) que caem num mês, com o total do mês por regra. `step` é o
 * avançador de ocorrência injetado (`nextOccurrenceDate` de financeService) — passado por
 * parâmetro pra manter este módulo puro e sem dependência de firebase.
 */
export function projectedRecurringForMonth(
  month: string,
  rules: RecurringForProjection[],
  step: (date: Date, frequency: Frequency, anchorDay?: number) => Date
): ProjectedRecurring[] {
  const result: ProjectedRecurring[] = [];
  for (const rule of rules) {
    if (!rule.isActive || rule.amountCents <= 0) continue;
    let occ = rule.nextOccurrenceAt;
    let guard = 0;
    while (monthKeyOf(occ) < month && guard < RECURRING_STEP_CAP) {
      occ = step(occ, rule.frequency, rule.anchorDay);
      guard += 1;
    }
    let amountCents = 0;
    while (monthKeyOf(occ) === month && guard < RECURRING_STEP_CAP) {
      amountCents += rule.amountCents;
      occ = step(occ, rule.frequency, rule.anchorDay);
      guard += 1;
    }
    if (amountCents > 0) {
      result.push({ id: rule.id, description: rule.description, categoryId: rule.categoryId, amountCents });
    }
  }
  return result.sort((a, b) => b.amountCents - a.amountCents);
}

/** Recorrências projetadas de um mês somadas por categoria (pra entrar no donut do previsto). */
export function recurringByCategoryForMonth(
  month: string,
  rules: RecurringForProjection[],
  step: (date: Date, frequency: Frequency, anchorDay?: number) => Date
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of projectedRecurringForMonth(month, rules, step)) {
    const key = item.categoryId || NO_CATEGORY;
    totals.set(key, (totals.get(key) ?? 0) + item.amountCents);
  }
  return totals;
}
