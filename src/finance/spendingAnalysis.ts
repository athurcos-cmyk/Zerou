import { referenceMonthFromInvoiceId } from '../cards/cardDates';
import type { Category, InvoiceLedgerEntry, InvoiceLedgerEntryType, InvoiceStatus, Transaction } from '../types/contracts';

/**
 * Análise de gastos em **regime de competência** para a compra à vista no cartão.
 *
 * Compra à vista no cartão conta no mês da **COMPRA** (data do lançamento), como uma despesa
 * comum — não no mês da fatura. Reflete "quando você gastou", não "quando a fatura vence":
 * num cartão que fecha cedo (ex.: dia 2), quase tudo cairia na fatura do mês seguinte, e o
 * gasto de julho apareceria em agosto. Decisão do dono (2026-07-28).
 *
 * Compra **parcelada** conta 1 parcela por mês, **começando no mês da COMPRA**: uma compra de
 * R$3.000 em 10x não é R$3.000 no mês da compra, é R$300 por mês durante 10 meses.
 *
 * A parcela 1 no mês da compra é a correção de 2026-08-05 (caso real do dono): antes ela
 * contava pelo `referenceMonth` da FATURA, o que colocava duas compras feitas no mesmo dia, no
 * mesmo cartão, caindo na MESMA fatura, em meses diferentes na Análise — a à vista no mês da
 * compra, a parcelada um mês à frente. O culpado era o dia do fechamento
 * (`resolveInstallmentCycle`), não o modelo; quem corrige o deslocamento é
 * `installmentShiftBySource`.
 *
 * Como isso divide as fontes:
 *  - à vista   → pela TRANSAÇÃO `card_purchase` (`installmentGroupId` vazio), no mês da compra;
 *    a parcela única no ledger é IGNORADA aqui pra não contar duas vezes.
 *  - parcelado → pelo LEDGER (parcela `purchase` com `installmentTotal > 1`), no mês ANCORADO
 *    (`anchoredMonthOf` = mês da fatura menos o deslocamento da compra).
 *  - antecipação → o DÉBITO conta no mês em que se antecipou (`effectiveAt`), o CRÉDITO anula a
 *    parcela original no mês ancorado dela. Antecipar move o gasto pro mês da antecipação —
 *    decisão do dono, 2026-08-05: "se eu antecipei, gastei naquele mês".
 *  - tarifa/juros/IOF/estorno → pelo ledger, no mês da fatura (eventos da fatura, sem "data de
 *    compra" e sem `sourceTransactionId` pra ancorar).
 *
 * Consequência aceita de propósito: a Análise **não bate 1:1 com a fatura** — a Análise é sobre
 * comportamento de gasto, não sobre o extrato da fatura. Quem responde "o que vem na fatura" é
 * a tela da fatura; quem responde "quanto ainda devo" é `ongoingInstallmentPurchases`, e as
 * duas continuam contando pelo `referenceMonth`, sem ancoragem.
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

/**
 * Mês ('yyyy-MM') em que a COMPRA aconteceu, por id da transação `card_purchase`.
 * `undefined` = transação fora da janela carregada — a compra não é reancorada (cai no
 * comportamento antigo, pelo mês da fatura). Obrigatório nas assinaturas que o usam, pelo
 * mesmo motivo de `excludedAccountIds`: uma tela nova tem que DECIDIR o que passar.
 */
export type PurchaseMonthOf = (transactionId: string) => string | undefined;

/** Meses de `earlier` até `later` ('yyyy-MM'). Negativo se `later` vier antes. `NaN` se inválido. */
function monthDiff(later: string, earlier: string): number {
  const [ly, lm] = later.split('-').map(Number);
  const [ey, em] = earlier.split('-').map(Number);
  if (!ly || !lm || !ey || !em) return NaN;
  return (ly - ey) * 12 + (lm - em);
}

/** 'yyyy-MM' ± n meses (usa `Date` pra virar o ano sozinho). */
function shiftMonthKey(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  if (!year || !m) return month;
  return monthKeyOf(new Date(year, m - 1 + delta, 1));
}

/** `effectiveAt` pode ser `Timestamp` (produção) ou `Date` (teste/dado montado à mão). */
function monthKeyOfEffectiveAt(value: InvoiceLedgerEntry['effectiveAt'] | undefined): string | undefined {
  if (!value) return undefined;
  const maybe = value as unknown as { toDate?: () => Date };
  const date = typeof maybe.toDate === 'function' ? maybe.toDate() : (value as unknown as Date);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return undefined;
  return monthKeyOf(date);
}

/**
 * Deslocamento (sempre 1) entre o mês da FATURA da parcela 1 e o mês da COMPRA, por
 * `sourceTransactionId`. Ausente do mapa = 0 = não desloca.
 *
 * É isto que faz a parcela 1 contar no mês da COMPRA em vez do mês da fatura. Sem isso,
 * duas compras feitas no mesmo dia, no mesmo cartão, caindo na MESMA fatura, apareciam em
 * meses diferentes na Análise: a à vista no mês da compra (desde 2026-07-28) e a parcelada
 * no mês da fatura — um mês à frente sempre que o dia da compra >= dia do fechamento
 * (`resolveInstallmentCycle`). Caso real do dono, 2026-08-05, cartão que fecha dia 2.
 *
 * **Duas travas independentes, ambas de propósito:**
 *
 * 1. **A âncora é `installmentNumber === 1`, não "a menor parcela presente".** Compra
 *    cadastrada por `registerOngoingInstallments` (a que já estava rolando quando a pessoa
 *    começou a usar o app) começa na parcela 7, 8, 11… — nunca tem parcela 1, então nunca
 *    desloca. Elegê-la pela "menor presente" moveria essas compras um mês sem motivo.
 * 2. **Lista branca `diff === 1`, não `clamp(diff, 0, 1)`.** `resolveInstallmentCycle` só
 *    produz offset 0 ou 1; qualquer outro valor significa que a compra veio por outro
 *    caminho (ou que o dado é legado/torto) e deslocar seria chute. `clamp` devolveria 1
 *    pra um diff de 8 — exatamente o caso do `registerOngoingInstallments`.
 *
 * Consequência das duas juntas: **nenhum gasto se move mais de 1 mês, e nenhum se move sem
 * que a parcela 1 tenha sido identificada.** Dado antigo cai no comportamento de hoje.
 */
/**
 * O que a TRANSAÇÃO sabe sobre uma série parcelada — suficiente pra decidir o deslocamento sem
 * depender de a fatura da parcela 1 estar carregada.
 */
export interface InstallmentSeries {
  /** Mês da fatura da PRIMEIRA parcela criada, lido do `invoiceId` da transação. */
  firstInvoiceMonth: string;
  /** Número real da primeira parcela: 1 no fluxo normal, 7 em "7 de 10" já em andamento. */
  installmentStart: number;
  purchaseMonth: string | undefined;
}

/** `undefined` = esta compra não tem transação carregada; cai no fallback pelo ledger. */
export type InstallmentSeriesOf = (transactionId: string) => InstallmentSeries | undefined;

/**
 * A FÓRMULA do deslocamento, num lugar só.
 *
 * As duas travas seguem sendo as mesmas de 2026-08-05, só que agora expressas em dados da
 * transação em vez da posição da parcela 1 no ledger:
 * 1. `installmentStart === 1` — compra "já em andamento" nunca desloca (é a trava que antes vinha
 *    de exigir `installmentNumber === 1` no ledger).
 * 2. `diff === 1` exato, não `clamp` — qualquer outro valor significa que a compra veio por outro
 *    caminho, ou que o dado é legado/torto, e deslocar seria chute.
 *
 * ⚠️ Porta manual em `functions/src/shared/installmentSchedule.ts` (a Vic). Mudou aqui, muda lá.
 */
export function installmentShiftOf(series: InstallmentSeries): number {
  if (series.installmentStart !== 1 || !series.purchaseMonth) return 0;
  return monthDiff(series.firstInvoiceMonth, series.purchaseMonth) === 1 ? 1 : 0;
}

/**
 * Constrói o resolvedor a partir das transações que a tela já tem em mão. Só compra parcelada
 * (`installments > 1`) entra — à vista não desloca nada.
 */
export function installmentSeriesFromTransactions(transactions: Transaction[]): InstallmentSeriesOf {
  const byId = new Map<string, InstallmentSeries>();
  for (const transaction of transactions) {
    if (transaction.type !== 'card_purchase' || transaction.deletedAt) continue;
    if ((transaction.installments ?? 1) <= 1) continue;
    const firstInvoiceMonth = referenceMonthFromInvoiceId(transaction.invoiceId);
    if (!firstInvoiceMonth) continue;
    byId.set(transaction.id, {
      firstInvoiceMonth,
      installmentStart: transaction.installmentStart ?? 1,
      purchaseMonth: transaction.cashMonth ?? transaction.competenceMonth
    });
  }
  return (transactionId: string) => byId.get(transactionId);
}

export function installmentShiftBySource(
  invoices: InvoiceForSpending[],
  purchaseMonthOf: PurchaseMonthOf,
  seriesOf: InstallmentSeriesOf
): Map<string, number> {
  const shifts = new Map<string, number>();

  // Primeiro o que a TRANSAÇÃO sabe: não depende de a fatura da parcela 1 estar carregada.
  for (const invoice of invoices) {
    for (const entry of invoice.ledgerEntries) {
      if (!entry.sourceTransactionId || shifts.has(entry.sourceTransactionId)) continue;
      const series = seriesOf(entry.sourceTransactionId);
      if (!series) continue;
      const shift = installmentShiftOf(series);
      if (shift > 0) shifts.set(entry.sourceTransactionId, shift);
      else shifts.set(entry.sourceTransactionId, 0); // decidido: não olhar o ledger pra esta compra
    }
  }

  // Fallback pelo ledger, só pra compra que o resolvedor não conhece (transação fora da janela
  // carregada, ou tela que não tem transação nenhuma em mão — `committedByCategoryForMonth`).
  for (const invoice of invoices) {
    for (const entry of invoice.ledgerEntries) {
      if (entry.type !== 'purchase' || entry.installmentNumber !== 1 || !entry.sourceTransactionId) continue;
      if (shifts.has(entry.sourceTransactionId)) continue;
      // `cashMonth` da transação é a fonte boa; o `effectiveAt` da própria parcela 1 é o
      // fallback (em dado novo ele É a data da compra, copiada igual em todas as parcelas —
      // ver `addCardPurchaseToBatch`). Sem nenhum dos dois, não desloca.
      const purchaseMonth = purchaseMonthOf(entry.sourceTransactionId) ?? monthKeyOfEffectiveAt(entry.effectiveAt);
      if (!purchaseMonth) continue;
      if (monthDiff(invoice.referenceMonth, purchaseMonth) === 1) shifts.set(entry.sourceTransactionId, 1);
    }
  }

  // Zeros não precisam ficar no mapa (`anchoredMonthOf` já trata ausência como 0) e mantê-los
  // faria `shifts.size` mentir nos testes que contam entradas.
  for (const [id, shift] of shifts) if (shift === 0) shifts.delete(id);

  return shifts;
}

/**
 * Compras EXCLUÍDAS: `reverseCardPurchaseOnDelete` estorna todo lançamento de uma compra
 * excluída, e `purchase_reversal`/`anticipation_credit_reversal` só existem por exclusão —
 * então qualquer estorno marca a compra INTEIRA como removida.
 *
 * Quem consome isso descarta **todos** os lançamentos daquele `sourceTransactionId`, em vez
 * de tentar casar cada estorno com o que ele anula. Não é preferência de estilo: o estorno é
 * gravado sem `installmentNumber` e com `effectiveAt` da hora da EXCLUSÃO
 * (`functions/src/cards/reverseCardPurchaseOnDelete.ts`), então não há como ancorá-lo no mesmo
 * mês do lançamento que ele cancela. Casando por compra, some tudo junto e a conta fecha.
 */
export function reversedSourceIds(invoices: InvoiceForSpending[]): Set<string> {
  const reversed = new Set<string>();
  for (const invoice of invoices) {
    for (const entry of invoice.ledgerEntries) {
      if (!entry.sourceTransactionId) continue;
      if (entry.type === 'purchase_reversal' || entry.type === 'anticipation_credit_reversal') {
        reversed.add(entry.sourceTransactionId);
      }
    }
  }
  return reversed;
}

/**
 * Mês em que UM lançamento do ledger conta na Análise. Único lugar que conhece a exceção
 * abaixo — as duas funções de agregação chamam esta, nunca reimplementam a regra.
 *
 * Regra geral: `referenceMonth` da fatura menos o deslocamento da compra.
 *
 * **Exceção: `installment_anticipation` (o débito da antecipação) conta pelo mês em que a
 * pessoa ANTECIPOU** (`effectiveAt`), não pelo mês da fatura em que ele caiu. Decisão do dono
 * (2026-08-05): *"se eu antecipei, gastei naquele mês"*. A compra cria um cronograma;
 * antecipar é um ato novo, tomado depois, que consome dinheiro no mês em que foi feito.
 * Sem esta exceção, antecipar depois do fechamento jogaria o débito pro mês seguinte — o
 * mesmo erro de 1 mês que `installmentShiftBySource` existe pra corrigir.
 *
 * O CRÉDITO da antecipação (`installment_anticipation_credit`) não precisa de exceção: ele
 * mora na mesma fatura da parcela que anula, então herda o mesmo deslocamento e zera o mês
 * certo por construção — inclusive em dado legado sem `installmentNumber` no crédito.
 */
function anchoredMonthOf(
  entry: Pick<InvoiceLedgerEntry, 'type' | 'effectiveAt' | 'sourceTransactionId'>,
  invoiceReferenceMonth: string,
  shiftBySource: ReadonlyMap<string, number>
): string {
  if (entry.type === 'installment_anticipation') {
    return monthKeyOfEffectiveAt(entry.effectiveAt) ?? invoiceReferenceMonth;
  }
  const shift = (entry.sourceTransactionId && shiftBySource.get(entry.sourceTransactionId)) || 0;
  return shift === 0 ? invoiceReferenceMonth : shiftMonthKey(invoiceReferenceMonth, -shift);
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

/**
 * A transação saiu de uma conta marcada como "fora do saldo" (`Account.excludeFromTotals` —
 * vale-refeição e afins)? Se sim, ela não entra em agregado NENHUM da Análise.
 *
 * Só olha `accountId`, e isso basta: `card_purchase` sequer grava esse campo (ver
 * `cardService.ts` — compra no cartão tem `cardId`, não conta), então gasto de cartão nunca é
 * descartado por acidente por causa de um vale-refeição existir no workspace.
 *
 * `destinationAccountId` (transferência) fica de fora de propósito: transferência já não conta
 * como gasto nem como receita em nenhuma dessas funções.
 */
function isOnExcludedAccount(t: Pick<Transaction, 'accountId'>, excludedAccountIds: ReadonlySet<string>): boolean {
  return excludedAccountIds.size > 0 && !!t.accountId && excludedAccountIds.has(t.accountId);
}

function isCountableExpense(
  t: Transaction,
  month: string,
  parceledIds: Set<string>,
  excludedAccountIds: ReadonlySet<string>
): boolean {
  if (t.deletedAt) return false;
  if (isOnExcludedAccount(t, excludedAccountIds)) return false;
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
 *
 * `excludedAccountIds` é **obrigatório de propósito** (passe `new Set()` quando não houver):
 * esta função tem quatro consumidores, e um parâmetro opcional aqui significaria que esquecer
 * de passá-lo numa tela nova faria o gasto do vale-refeição voltar a contar, sem erro nenhum e
 * sem ninguém perceber. Obrigatório, o TypeScript força cada call site a decidir.
 */
export function spendingByCategoryForMonth(
  month: string,
  transactions: Transaction[],
  invoices: InvoiceForSpending[],
  categoryOfTransaction: (transactionId: string | undefined) => string | undefined,
  excludedAccountIds: ReadonlySet<string>,
  purchaseMonthOf: PurchaseMonthOf
): Map<string, number> {
  const totals = new Map<string, number>();
  const parceledIds = installmentPurchaseIds(invoices);
  const shifts = installmentShiftBySource(invoices, purchaseMonthOf, installmentSeriesFromTransactions(transactions));
  const reversed = reversedSourceIds(invoices);
  const add = (categoryId: string | undefined, cents: number) => {
    if (cents === 0) return;
    const key = categoryId || NO_CATEGORY;
    totals.set(key, (totals.get(key) ?? 0) + cents);
  };

  for (const t of transactions) {
    if (!isCountableExpense(t, month, parceledIds, excludedAccountIds)) continue;
    add(t.categoryId, refundLikeTypes.has(t.type) ? -t.amountCents : t.amountCents);
  }

  // Varre TODAS as faturas (não só as do mês): com a ancoragem, o mês em que um lançamento
  // conta não é mais o `referenceMonth` da fatura que o contém — a parcela pode recuar um mês.
  for (const invoice of invoices) {
    for (const entry of invoice.ledgerEntries) {
      if (entry.sourceTransactionId && reversed.has(entry.sourceTransactionId)) continue; // compra excluída
      if (isSinglePurchaseLedgerEntry(entry, parceledIds)) continue; // à vista → contado pela transação
      if (anchoredMonthOf(entry, invoice.referenceMonth, shifts) !== month) continue;
      const signed = signedCharge(entry);
      if (signed === 0) continue;
      add(categoryOfTransaction(entry.sourceTransactionId), signed);
    }
  }

  return totals;
}

export interface CategoryRollUp {
  /** Gasto próprio + o de todas as subcategorias. Pode vir **zero ou negativo** (mês de estorno). */
  totalCents: number;
  /**
   * Subcategorias com movimento no período, `id → centavos`.
   *
   * Uma chave é especial: **o id do próprio pai** representa a linha "· geral" — lançamentos
   * feitos na categoria antes de ela virar agrupamento. Sem ela os percentuais da expansão não
   * fechariam 100%. Só existe quando há pelo menos uma subcategoria de verdade.
   *
   * Vazio = categoria folha (não agrupa nada). É o que a lista usa pra decidir se a linha expande.
   */
  children: Map<string, number>;
}

/**
 * Agrupa o gasto das subcategorias no pai — **só pra exibição no donut/lista da Análise**.
 *
 * ⚠️ **Não mova isto pra dentro de `spendingByCategoryForMonth`.** Aquela função tem mais de um
 * consumidor e só um quer roll-up:
 *
 * ```
 * spendingByCategoryForMonth
 *   ├── SearchPage (donut + lista)   → roll-up SÓ aqui
 *   └── annualSummaryCalculations    → NÃO: mudaria número que hoje está certo
 * ```
 *
 * E o roll-up daqui não pode vazar pro **orçamento**: a barra de limite da Análise só aparece em
 * categoria FOLHA (`leafBudget`, `SearchPage.tsx`) porque na linha do pai o valor já é o
 * roll-up, enquanto o limite significa gasto **direto** naquela categoria. Somar filha no pai
 * dentro do orçamento é uma decisão de produto ainda **em aberto** — fazer isso de lambuja, por
 * efeito colateral, é o modo de falha silencioso que este projeto já pagou caro. Travado pelos
 * testes de regressão `[D9]`.
 *
 * (O `BudgetAlertBanner` do Dashboard aparecia nesta lista como terceiro consumidor. Foi
 * removido em 06/08/2026 — contava compra parcelada pelo valor cheio no mês da compra, contra a
 * parcela que esta função ancora desde 05/08. Ver `docs/history/2026-08.md`.)
 *
 * Filha órfã (pai excluído por caminho não previsto) vira linha de primeiro nível com o próprio
 * valor: perder o agrupamento é aceitável, sumir com o gasto não é.
 */
export function rollUpByParent(
  totals: ReadonlyMap<string, number>,
  categoriesById: ReadonlyMap<string, Pick<Category, 'parentCategoryId'>>
): Map<string, CategoryRollUp> {
  const rolled = new Map<string, CategoryRollUp>();
  const bucketOf = (categoryId: string): CategoryRollUp => {
    let bucket = rolled.get(categoryId);
    if (!bucket) {
      bucket = { totalCents: 0, children: new Map() };
      rolled.set(categoryId, bucket);
    }
    return bucket;
  };

  for (const [categoryId, cents] of totals) {
    const parentId = categoriesById.get(categoryId)?.parentCategoryId;
    if (parentId && parentId !== categoryId && categoriesById.has(parentId)) {
      const bucket = bucketOf(parentId);
      bucket.totalCents += cents;
      bucket.children.set(categoryId, cents);
    } else {
      bucketOf(categoryId).totalCents += cents;
    }
  }

  // A linha "· geral": só faz sentido quando existe subcategoria pra contrastar. Categoria folha
  // com gasto próprio continua com `children` vazio — uma linha "geral" solitária dentro dela
  // mesma seria ruído.
  for (const [categoryId, cents] of totals) {
    const bucket = rolled.get(categoryId);
    if (bucket && bucket.children.size > 0 && !bucket.children.has(categoryId)) {
      bucket.children.set(categoryId, cents);
    }
  }

  return rolled;
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
  categoryOfTransaction: (transactionId: string | undefined) => string | undefined,
  excludedAccountIds: ReadonlySet<string>,
  purchaseMonthOf: PurchaseMonthOf
): Map<string, Map<string, number>> {
  const byCategory = new Map<string, Map<string, number>>();
  for (const month of months) {
    const perCategory = spendingByCategoryForMonth(month, transactions, invoices, categoryOfTransaction, excludedAccountIds, purchaseMonthOf);
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
 * Gasto que a Análise conta PELO LEDGER — parcelas + tarifas/juros/estornos/antecipação —
 * somado por MÊS ANCORADO (ver `anchoredMonthOf`). Exclui a compra à vista (contada pela data
 * da compra, via transação) e as compras excluídas, pra bater com `spendingByCategoryForMonth`.
 *
 * Substituiu `invoiceRecognizedExpense`, que devolvia um número POR FATURA: com a ancoragem,
 * uma mesma fatura pode contribuir pra dois meses diferentes (a parcela recua pro mês da
 * compra, mas uma tarifa da fatura fica onde está), então "uma fatura → um número" deixou de
 * ser representável.
 */
export function recognizedExpenseByMonth(
  invoices: InvoiceForSpending[],
  parceledIds: Set<string>,
  shiftBySource: ReadonlyMap<string, number>,
  reversedSources: ReadonlySet<string>
): Map<string, number> {
  const byMonth = new Map<string, number>();
  for (const invoice of invoices) {
    for (const entry of invoice.ledgerEntries) {
      if (entry.sourceTransactionId && reversedSources.has(entry.sourceTransactionId)) continue;
      if (isSinglePurchaseLedgerEntry(entry, parceledIds)) continue; // à vista entra pela transação
      const signed = signedCharge(entry);
      if (signed === 0) continue;
      const month = anchoredMonthOf(entry, invoice.referenceMonth, shiftBySource);
      byMonth.set(month, (byMonth.get(month) ?? 0) + signed);
    }
  }
  return byMonth;
}

export interface MonthlyTotals {
  month: string;
  incomeCents: number;
  expenseCents: number;
}

/**
 * Entradas e saídas por mês (barras dos últimos meses). Saída = despesas fora do cartão +
 * gasto reconhecido das faturas daquele mês. Entrada = receitas do mês.
 *
 * `excludedAccountIds` obrigatório pelo mesmo motivo de `spendingByCategoryForMonth`. Vale tanto
 * pra saída quanto pra ENTRADA: o crédito mensal do vale-refeição, lançado como receita naquela
 * conta, inflaria a barra de entradas e a taxa de poupança do Resumo Anual.
 */
export function monthlyTotals(
  months: string[],
  transactions: Transaction[],
  invoices: InvoiceForSpending[],
  excludedAccountIds: ReadonlySet<string>,
  purchaseMonthOf: PurchaseMonthOf
): MonthlyTotals[] {
  const parceledIds = installmentPurchaseIds(invoices);
  const cardExpenseByMonth = recognizedExpenseByMonth(
    invoices,
    parceledIds,
    installmentShiftBySource(invoices, purchaseMonthOf, installmentSeriesFromTransactions(transactions)),
    reversedSourceIds(invoices)
  );

  return months.map((month) => {
    let incomeCents = 0;
    let expenseCents = cardExpenseByMonth.get(month) ?? 0;
    for (const t of transactions) {
      if (t.deletedAt) continue;
      if (isOnExcludedAccount(t, excludedAccountIds)) continue;
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
 *
 * Compra EXCLUÍDA some por completo, via `reversedSourceIds` (o mesmo conjunto que a Análise
 * usa pra descartar compra excluída — extraído daqui justamente pra as duas leituras nunca
 * divergirem). Sem isso, uma parcelada errada excluída continuava "em andamento" enquanto a
 * fatura tivesse outra parcela mantendo o saldo devedor > 0.
 *
 * ⚠️ **Esta função continua contando pelo `referenceMonth` da fatura, sem a ancoragem no mês
 * da compra** (`installmentShiftBySource`) — de propósito. Ela responde "quanto ainda devo",
 * que é uma pergunta de CAIXA: o que importa é em qual fatura a parcela vai ser cobrada, não
 * em que mês o gasto é reconhecido. Quem reancora é a Análise, que responde outra pergunta.
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

  // Compras EXCLUÍDAS: `reverseCardPurchaseOnDelete` estorna todo lançamento de uma compra
  // excluída, e `purchase_reversal`/`anticipation_credit_reversal` só existem por exclusão.
  // Então qualquer estorno marca a compra inteira como removida — ela não deve mais aparecer
  // como "em andamento" (a recadastrada certa tem outro sourceTransactionId, sem estorno).
  const reversedSources = reversedSourceIds(invoices);

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
    if (reversedSources.has(sourceTransactionId)) continue; // compra excluída não aparece
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
  categoryOfTransaction: (transactionId: string | undefined) => string | undefined,
  purchaseMonthOf: PurchaseMonthOf
): Map<string, number> {
  // Sem transações: num mês futuro não há gasto realizado, só o comprometido. Por isso o
  // conjunto de contas excluídas é provavelmente irrelevante aqui (não há transação pra
  // filtrar) — quem cuida de tirar conta a pagar/recorrência de conta excluída é o caller,
  // filtrando `bills`/`rules` antes de montar essas listas.
  const totals = spendingByCategoryForMonth(month, [], invoices, categoryOfTransaction, new Set<string>(), purchaseMonthOf);
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
  bills: BillForCommitment[],
  purchaseMonthOf: PurchaseMonthOf
): string {
  const parceledIds = installmentPurchaseIds(invoices);
  let max = currentMonth;
  // Pelo mês ANCORADO, não pelo `referenceMonth`: a última parcela recua junto com as outras,
  // e sem isto o seletor de mês ofereceria um mês futuro vazio no fim da lista. Somar por mês
  // antes de testar `> 0` também faz duas faturas que caem no mesmo mês ancorado se compensarem.
  const recognized = recognizedExpenseByMonth(
    invoices,
    parceledIds,
    // Sem transações em mão nesta função: só o fallback pelo ledger. Declarado, não esquecido.
    installmentShiftBySource(invoices, purchaseMonthOf, () => undefined),
    reversedSourceIds(invoices)
  );
  for (const [month, cents] of recognized) {
    if (month > max && cents > 0) max = month;
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
