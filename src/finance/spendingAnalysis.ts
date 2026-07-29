import type { InvoiceLedgerEntry, InvoiceLedgerEntryType, InvoiceStatus, Transaction } from '../types/contracts';

/**
 * Análise de gastos em **regime de competência** para a compra à vista no cartão.
 *
 * Compra à vista no cartão conta no mês da **COMPRA** (data do lançamento), como uma despesa
 * comum — não no mês da fatura. Reflete "quando você gastou", não "quando a fatura vence":
 * num cartão que fecha cedo (ex.: dia 2), quase tudo cairia na fatura do mês seguinte, e o
 * gasto de julho apareceria em agosto. Decisão do dono (2026-07-28).
 *
 * Compra **parcelada** continua contando 1 parcela por fatura (pelo ledger): uma compra de
 * R$3.000 em 10x não é R$3.000 no mês da compra, é R$300 em cada uma das 10 faturas.
 *
 * Como isso divide as fontes:
 *  - à vista   → pela TRANSAÇÃO `card_purchase` (`installmentGroupId` vazio), no mês da compra;
 *    a parcela única no ledger é IGNORADA aqui pra não contar duas vezes.
 *  - parcelado → pelo LEDGER (parcela `purchase` com `installmentTotal > 1`), no mês da fatura.
 *    Antecipar move o gasto do mês futuro pro atual naturalmente (débito na fatura atual,
 *    crédito na futura).
 *  - tarifa/juros/IOF/estorno/antecipação → pelo ledger, no mês da fatura (eventos da fatura,
 *    sem "data de compra").
 *
 * Consequência aceita de propósito: a Análise **deixa de bater 1:1 com a fatura** no mês
 * corrente (à vista migra pro mês da compra) — a Análise é sobre comportamento de gasto, não
 * sobre o extrato da fatura.
 */

// Débitos: pesam como gasto (+). `anticipation_credit_reversal` também é débito — é o estorno
// de um crédito de antecipação, gerado ao excluir uma compra que teve parcela antecipada
// (ver reverseCardPurchaseOnDelete). Mantido em sincronia com invoiceTotals.ts/calculateInvoice.ts
// (o teste `signedCharge x calculateInvoice concordam nos N tipos` trava essa sincronia).
const cardChargeTypes = new Set<InvoiceLedgerEntryType>([
  'purchase',
  'manual_debit',
  'installment_anticipation',
  'anticipation_credit_reversal',
  'interest',
  'fine',
  'iof',
  'fee'
]);

// Créditos: abatem o gasto (−). `purchase_reversal` é o estorno de uma compra excluída — sem
// ele aqui, uma compra excluída continuava contando na Análise pra sempre (bug real 2026-07-28).
const cardCreditTypes = new Set<InvoiceLedgerEntryType>([
  'installment_anticipation_credit',
  'refund_credit',
  'chargeback_credit',
  'manual_credit',
  'purchase_reversal'
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
  /** Ambos opcionais pra não quebrar quem já montava esse shape sem eles (ex.: testes antigos). */
  status?: InvoiceStatus;
  /** Sinal real de "fatura paga": pagar não muda `status` (só `reconcileInvoice`, manual, muda —
   * fluxo comum de pagar fatura nunca passa por ali), quem reflete pagamento de verdade é esse
   * saldo, mantido incrementalmente pela Cloud Function a cada lançamento do ledger. */
  outstandingBalanceCents?: number;
}

const refundLikeTypes = new Set<Transaction['type']>(['refund', 'reimbursement', 'adjustment']);

/**
 * Ids das transações `card_purchase` que são PARCELADAS — essas contam pela fatura (por
 * parcela, no ledger), não pela data da compra. Uma compra é parcelada se alguma parcela
 * `purchase` sua tem `installmentTotal > 1` OU se o mesmo `sourceTransactionId` aparece em
 * mais de uma fatura (robusto a dado antigo sem o campo, mesma lógica de
 * `collectFutureInstallments`/`anticipation.ts`). Quem NÃO está aqui é compra à vista, contada
 * pela transação no mês da compra.
 */
export function installmentPurchaseIds(invoices: InvoiceForSpending[]): Set<string> {
  const occurrences = new Map<string, number>();
  const parceled = new Set<string>();
  for (const invoice of invoices) {
    for (const entry of invoice.ledgerEntries) {
      if (entry.type !== 'purchase' || !entry.sourceTransactionId) continue;
      occurrences.set(entry.sourceTransactionId, (occurrences.get(entry.sourceTransactionId) ?? 0) + 1);
      if ((entry.installmentTotal ?? 0) > 1) parceled.add(entry.sourceTransactionId);
    }
  }
  for (const [id, count] of occurrences) if (count > 1) parceled.add(id);
  return parceled;
}

/** Compra no cartão à vista (1x): `card_purchase` cujo id NÃO está no conjunto de parcelados.
 * Na Análise por competência conta pela DATA DA COMPRA (via transação), como despesa comum. */
function isSingleCardPurchase(t: Pick<Transaction, 'type' | 'id'>, parceledIds: Set<string>): boolean {
  return t.type === 'card_purchase' && !parceledIds.has(t.id);
}

/**
 * Lançamento de uma compra à vista no ledger — IGNORADO na Análise (a compra já é contada
 * pela transação, no mês da compra). Cobre a compra (`purchase`) E o estorno dela
 * (`purchase_reversal`, gerado ao excluir): os dois somem juntos. Sem incluir o estorno aqui,
 * excluir uma compra à vista deixava um crédito fantasma (−valor) no mês da fatura — porque a
 * compra some pela transação (deletedAt), mas o estorno continuaria pesando no ledger.
 * Parcela de compra parcelada (id em `parceledIds`) nunca é ignorada — conta pela fatura.
 */
function isSinglePurchaseLedgerEntry(
  entry: Pick<InvoiceLedgerEntry, 'type' | 'sourceTransactionId'>,
  parceledIds: Set<string>
): boolean {
  return (entry.type === 'purchase' || entry.type === 'purchase_reversal')
    && !!entry.sourceTransactionId
    && !parceledIds.has(entry.sourceTransactionId);
}

function isCountableExpense(t: Transaction, month: string, parceledIds: Set<string>): boolean {
  if (t.deletedAt) return false;
  // Cartão à vista entra pela transação, no mês da COMPRA (competência). Parcela de cartão
  // continua pelo ledger (por fatura), nunca pela transação (valor cheio no mês da compra).
  // Estorno/reembolso/ajuste entram como crédito negativo na própria categoria (não gasto +).
  if (t.type !== 'expense' && !refundLikeTypes.has(t.type) && !isSingleCardPurchase(t, parceledIds)) return false;
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
  const parceledIds = installmentPurchaseIds(invoices);
  const add = (categoryId: string | undefined, cents: number) => {
    if (cents === 0) return;
    const key = categoryId || NO_CATEGORY;
    totals.set(key, (totals.get(key) ?? 0) + cents);
  };

  for (const t of transactions) {
    if (!isCountableExpense(t, month, parceledIds)) continue;
    add(t.categoryId, refundLikeTypes.has(t.type) ? -t.amountCents : t.amountCents);
  }

  for (const invoice of invoices) {
    if (invoice.referenceMonth !== month) continue;
    for (const entry of invoice.ledgerEntries) {
      if (isSinglePurchaseLedgerEntry(entry, parceledIds)) continue; // à vista → contado pela transação
      const signed = signedCharge(entry);
      if (signed === 0) continue;
      add(categoryOfTransaction(entry.sourceTransactionId), signed);
    }
  }

  return totals;
}

/**
 * Gasto por categoria em VÁRIOS meses: `categoria → (mês → centavos)`. Reusa
 * `spendingByCategoryForMonth` por mês, então os números batem exatamente com o donut da
 * Análise. Só entra valor > 0 (mês só de estorno pode zerar/inverter uma categoria — não é
 * "gasto"). Puro/em memória: quem chama passa as transações e faturas já carregadas, sem leitura
 * nova. Base da tendência por categoria (`CategoryTrendSheet`).
 */
export function spendingByCategoryAcrossMonths(
  months: string[],
  transactions: Transaction[],
  invoices: InvoiceForSpending[],
  categoryOfTransaction: (transactionId: string | undefined) => string | undefined
): Map<string, Map<string, number>> {
  const byCategory = new Map<string, Map<string, number>>();
  for (const month of months) {
    const perCategory = spendingByCategoryForMonth(month, transactions, invoices, categoryOfTransaction);
    for (const [categoryId, cents] of perCategory) {
      if (cents <= 0) continue;
      let byMonth = byCategory.get(categoryId);
      if (!byMonth) {
        byMonth = new Map<string, number>();
        byCategory.set(categoryId, byMonth);
      }
      byMonth.set(month, cents);
    }
  }
  return byCategory;
}

export interface CategoryTrendMonth {
  month: string;
  amountCents: number;
  /** É o mês corrente (ainda em andamento)? A UI marca a barra e sai da média. */
  isCurrent: boolean;
}

export interface CategoryTrend {
  series: CategoryTrendMonth[];
  /** Média dos meses FECHADOS (exclui `currentMonth`). */
  averageCents: number;
  currentCents: number;
  /** % do mês atual vs média dos fechados. `null` quando não há base (nenhum mês fechado com gasto). */
  vsAveragePct: number | null;
  /** Maior/menor mês COM gasto, **só entre os fechados** (exclui o atual parcial). `null` se não houver. */
  maxMonth: { month: string; amountCents: number } | null;
  minMonth: { month: string; amountCents: number } | null;
  totalCents: number;
}

/**
 * Série de gasto de UMA categoria ao longo de `months` (ordem cronológica), com estatísticas.
 *
 * A média usa só os meses FECHADOS (exclui `currentMonth`, que ainda está em andamento): comparar
 * um mês parcial contra uma média que o inclui é circular, e o app não projeta o mês cheio de
 * propósito (postura anti-especulação). O veredito `vsAveragePct` só existe quando há base real
 * (algum mês fechado com gasto), senão vira `null` e a UI esconde o "acima/abaixo".
 */
export function computeCategoryTrend(
  categoryId: string,
  months: string[],
  currentMonth: string,
  byCategory: Map<string, Map<string, number>>
): CategoryTrend {
  const byMonth = byCategory.get(categoryId);
  const series: CategoryTrendMonth[] = months.map((month) => ({
    month,
    amountCents: byMonth?.get(month) ?? 0,
    isCurrent: month === currentMonth
  }));

  const closed = series.filter((m) => !m.isCurrent);
  const closedTotal = closed.reduce((sum, m) => sum + m.amountCents, 0);
  const averageCents = closed.length > 0 ? Math.round(closedTotal / closed.length) : 0;

  const currentCents = series.find((m) => m.isCurrent)?.amountCents ?? 0;

  const hasClosedSpend = closed.some((m) => m.amountCents > 0);
  const vsAveragePct = hasClosedSpend && averageCents > 0
    ? Math.round(((currentCents - averageCents) / averageCents) * 100)
    : null;

  let maxMonth: { month: string; amountCents: number } | null = null;
  let minMonth: { month: string; amountCents: number } | null = null;
  for (const m of series) {
    if (m.isCurrent) continue;      // mês parcial não conta como maior/menor (idem à média)
    if (m.amountCents <= 0) continue; // mês sem gasto não é "menor mês", é ausência de gasto
    if (!maxMonth || m.amountCents > maxMonth.amountCents) maxMonth = { month: m.month, amountCents: m.amountCents };
    if (!minMonth || m.amountCents < minMonth.amountCents) minMonth = { month: m.month, amountCents: m.amountCents };
  }

  const totalCents = series.reduce((sum, m) => sum + m.amountCents, 0);

  return { series, averageCents, currentCents, vsAveragePct, maxMonth, minMonth, totalCents };
}

/**
 * Gasto de uma fatura que a Análise conta PELA FATURA — parcelas + tarifas/juros/estornos/
 * antecipação. Exclui a compra à vista (contada pela data da compra, via transação), pra bater
 * com `spendingByCategoryForMonth`. Não é mais o "recognizedExpenseCents" cru da fatura.
 */
export function invoiceRecognizedExpense(invoice: InvoiceForSpending, parceledIds: Set<string>): number {
  let sum = 0;
  for (const entry of invoice.ledgerEntries) {
    if (isSinglePurchaseLedgerEntry(entry, parceledIds)) continue; // à vista entra pela transação, não pela fatura
    sum += signedCharge(entry);
  }
  return sum;
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
  const parceledIds = installmentPurchaseIds(invoices);
  const cardExpenseByMonth = new Map<string, number>();
  for (const invoice of invoices) {
    const recognized = invoiceRecognizedExpense(invoice, parceledIds);
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
      // Cartão à vista conta como saída no mês da compra (competência); parcelas vêm do ledger acima.
      if (t.type === 'expense' || isSingleCardPurchase(t, parceledIds)) expenseCents += t.amountCents;
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
  /** Parcelas ainda não pagas (fatura no mês atual ou à frente) — antecipar muda QUANDO, não SE. */
  remainingCount: number;
  remainingCents: number;
}

/**
 * Compras parceladas ainda em andamento (têm parcela caindo no mês atual ou à frente),
 * pra dar visibilidade ao valor cheio ("R$3.000 em 10x") que a visão por parcela dilui.
 *
 * "Restante" = dinheiro que ainda não saiu de fato (nenhuma fatura foi paga por ele), não
 * "parcelas ainda não antecipadas". Antecipar só reagenda a cobrança pra fatura atual — não
 * quita nada — então uma parcela antecipada (`installment_anticipation`, na fatura atual)
 * continua contando como restante; só a parcela ORIGINAL futura que ela substitui deixa de
 * contar (o crédito `installment_anticipation_credit` cancela especificamente aquele mês, pra
 * não contar a mesma dívida duas vezes). Parcelas cujo mês já passou são consideradas
 * resolvidas e não entram — e uma fatura já paga (`outstandingBalanceCents <= 0`, ou
 * `status` manualmente reconciliado pra `'paid'`/`'overpaid'`) também sai da conta na hora,
 * mesmo que o mês dela ainda não tenha virado: pagar a fatura é o que realmente resolve a
 * dívida, não só o calendário passar.
 */
export function ongoingInstallmentPurchases(
  currentMonth: string,
  invoices: InvoiceForSpending[],
  descriptionOfTransaction: (transactionId: string) => string | undefined
): OngoingInstallmentPurchase[] {
  interface Group {
    installmentTotal: number;
    installmentValueCents: number;
    // Meses futuros cuja parcela original foi antecipada (crédito cancela — vira débito na
    // fatura atual, contado à parte, sem duplicar).
    canceledMonths: Set<string>;
    remainingCents: number;
    remainingCount: number;
  }
  const groups = new Map<string, Group>();
  const groupFor = (id: string) => {
    let group = groups.get(id);
    if (!group) {
      group = { installmentTotal: 0, installmentValueCents: 0, canceledMonths: new Set(), remainingCents: 0, remainingCount: 0 };
      groups.set(id, group);
    }
    return group;
  };

  // 1ª passada: total/valor da parcela (de qualquer parcela, passada ou futura) e quais meses
  // futuros foram antecipados — precisa ver todo mundo antes de decidir o que conta como restante.
  for (const invoice of invoices) {
    for (const entry of invoice.ledgerEntries) {
      if (!entry.sourceTransactionId) continue;
      if (entry.type === 'purchase' && (entry.installmentTotal ?? 0) > 1) {
        const group = groupFor(entry.sourceTransactionId);
        group.installmentTotal = entry.installmentTotal ?? group.installmentTotal;
        group.installmentValueCents = entry.amountCents;
      } else if (entry.type === 'installment_anticipation_credit') {
        groupFor(entry.sourceTransactionId).canceledMonths.add(invoice.referenceMonth);
      }
    }
  }

  // 2ª passada: soma o que ainda não foi pago. Parcela original só conta se o mês dela não
  // foi antecipado; débito de antecipação sempre conta (é a mesma dívida, só que cobrada agora).
  for (const invoice of invoices) {
    if (invoice.referenceMonth < currentMonth) continue;
    if (invoice.outstandingBalanceCents !== undefined && invoice.outstandingBalanceCents <= 0) continue;
    if (invoice.status === 'paid' || invoice.status === 'overpaid') continue;
    for (const entry of invoice.ledgerEntries) {
      if (!entry.sourceTransactionId) continue;
      const group = groups.get(entry.sourceTransactionId);
      if (!group || group.installmentTotal <= 1) continue;

      if (entry.type === 'purchase' && (entry.installmentTotal ?? 0) > 1) {
        if (group.canceledMonths.has(invoice.referenceMonth)) continue;
        group.remainingCents += entry.amountCents;
        group.remainingCount += 1;
      } else if (entry.type === 'installment_anticipation') {
        group.remainingCents += entry.amountCents;
        group.remainingCount += 1;
      }
    }
  }

  const result: OngoingInstallmentPurchase[] = [];
  for (const [sourceTransactionId, group] of groups) {
    if (group.installmentTotal <= 1 || group.remainingCents <= 0) continue;
    result.push({
      sourceTransactionId,
      description: descriptionOfTransaction(sourceTransactionId) ?? 'Compra parcelada',
      installmentTotal: group.installmentTotal,
      installmentValueCents: group.installmentValueCents,
      fullAmountCents: group.installmentTotal * group.installmentValueCents,
      remainingCount: group.remainingCount,
      remainingCents: group.remainingCents
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
  const parceledIds = installmentPurchaseIds(invoices);
  let max = currentMonth;
  for (const invoice of invoices) {
    if (invoice.referenceMonth > max && invoiceRecognizedExpense(invoice, parceledIds) > 0) max = invoice.referenceMonth;
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

type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'yearly';

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
