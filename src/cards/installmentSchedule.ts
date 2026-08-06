import { Timestamp } from 'firebase/firestore';
import type { InvoiceForSpending } from '../finance/spendingAnalysis';
import type { InvoiceLedgerEntry, Transaction } from '../types/contracts';

/**
 * Como o valor de uma compra é repartido entre as parcelas: divisão inteira e **1 centavo a
 * mais nas primeiras** `resto` parcelas. Ex.: R$ 100,00 em 3x → 33,34 / 33,33 / 33,33.
 *
 * Mora aqui (módulo puro, sem Firestore) porque tem DOIS consumidores que precisam do mesmo
 * resultado exato: `addCardPurchaseToBatch` (que grava as parcelas no ledger) e
 * `invoicesForSpendingFromTransactions` (que reconstrói essas mesmas parcelas sem lê-las).
 * Se um dos dois arredondasse diferente, o Dashboard e a Análise divergiriam por centavos —
 * do tipo que ninguém investiga e todo mundo desconfia.
 */
export function installmentAmounts(totalCents: number, installments: number) {
  const base = Math.floor(totalCents / installments);
  const remainder = totalCents % installments;

  return Array.from({ length: installments }, (_, index) => base + (index < remainder ? 1 : 0));
}

/** 'yyyy-MM' + n meses (usa `Date` pra virar o ano sozinho). */
function shiftMonthKey(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  if (!year || !m) return month;
  const shifted = new Date(year, m - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Mês da PRIMEIRA fatura da série, lido do próprio `invoiceId` gravado na transação.
 *
 * Não é palpite: `invoiceIdFor` (`cardDates.ts`) monta o id como `${cardId}_${referenceMonth}`,
 * e a transação de uma compra parcelada guarda `invoiceId` = a fatura da **primeira parcela
 * criada** (`addCardPurchaseToBatch` e `registerOngoingInstallments` fazem os dois isso). É por
 * isso que esta função não precisa dos documentos de fatura — e o "Resumo de gastos" do
 * Dashboard não volta a esperar o cartão sincronizar (correção de 2026-07-25).
 */
function firstInvoiceMonthOf(invoiceId: string | undefined): string | undefined {
  if (!invoiceId) return undefined;
  const candidate = invoiceId.slice(invoiceId.lastIndexOf('_') + 1);
  return /^\d{4}-\d{2}$/.test(candidate) ? candidate : undefined;
}

/**
 * Reconstrói as parcelas de cartão **a partir das transações**, no formato que
 * `spendingByCategoryForMonth` já consome — pra uma tela conseguir o número certo **sem
 * assinar o ledger da fatura**.
 *
 * ## Por que isto existe
 *
 * O ledger é a verdade, mas custa leitura: são listeners por fatura, e um listener
 * reconectado depois de 30 min desconectado é cobrado como query nova — num PWA aberto
 * algumas vezes por dia, isso é custo **por abertura**. Por isso o ledger é carregado só sob
 * demanda (Cartão/Fatura/Análise), nunca no boot (`docs/COSTS.md`). O Dashboard não pode
 * pagar isso, mas também não pode mostrar número diferente da Análise — era o que fazia até
 * 2026-08-06, contando a compra parcelada pelo **valor cheio no mês da compra** (R$ 588 de um
 * Airbnb em 4x pesando de uma vez, contra R$ 147 na Análise).
 *
 * ## Isto NÃO reimplementa a regra de gasto
 *
 * Nenhuma decisão sobre "em que mês esta parcela conta" acontece aqui. Esta função só
 * reconstrói o **cronograma** — quais parcelas existem, de quanto, e em qual fatura cada uma
 * caiu — e entrega isso pra `spendingByCategoryForMonth`, que continua sendo o único lugar que
 * sabe ancorar, excluir conta "fora do saldo", tratar estorno e antecipação. Inclusive o
 * deslocamento da parcela 1 (`installmentShiftBySource`) é calculado **lá**, a partir da
 * parcela 1 que sintetizamos aqui — não recalculado aqui.
 *
 * Os três dados que tornam a reconstrução exata, todos já na transação:
 * - `installments` — quantas parcelas o ledger tem pra essa compra. Em compra já em andamento
 *   (`registerOngoingInstallments`) é quantas **faltam**, e `amountCents` é o que **falta** —
 *   então `installmentAmounts(amountCents, installments)` acerta os dois tipos de compra.
 * - `invoiceId` — a fatura da primeira parcela, com o mês embutido no id.
 * - `resolveInstallmentCycle(..., index)` põe a parcela `n` em `primeiraFatura + (n-1)`, meses
 *   consecutivos — por isso basta somar o índice.
 *
 * ## ⚠️ Onde ela ainda pode divergir da Análise (enumerado de propósito)
 *
 * 1. **Antecipação de parcela.** A Análise move o gasto pro mês em que a pessoa antecipou
 *    (decisão do dono, 2026-08-05); aqui o cronograma original continua valendo, porque
 *    antecipar só existe no ledger. Divergência real em quem antecipa.
 * 2. **Transação fora da janela carregada.** A Análise conta a parcela mesmo sem a
 *    transação-mãe (cai em "Sem categoria"); aqui, sem a transação não há cronograma, e a
 *    parcela não aparece. Hoje inofensivo (a janela de 300 + mês completo cobre uso realista),
 *    cresce com o histórico da conta.
 * 3. **Tarifa, juros e estorno de fatura** (`fee`/`interest`/`purchase_reversal` sem
 *    transação): só existem no ledger. Já era assim antes desta função — o Dashboard nunca os
 *    mostrou.
 * 4. **Compra "já em andamento" cadastrada com a próxima parcela caindo exatamente 1 mês
 *    depois da data da compra.** A transação guarda quantas parcelas faltam, não o número real
 *    da parcela (7/10), então sintetizamos 1..k. Quando o intervalo dá exatamente 1 mês, o
 *    deslocamento da parcela 1 é aplicado aqui e não é na Análise (que exige
 *    `installmentNumber === 1` de verdade no ledger) — a série toda fica 1 mês adiantada.
 *    Fechar isso de vez exige gravar o número inicial na transação (campo novo ⇒ atualizar
 *    `firestore.rules` no mesmo commit, ver a REGRA PRINCIPAL do `CLAUDE.md`).
 *
 * A Análise, que tem o ledger, segue sendo a tela exata. Esta é a melhor aproximação possível
 * com custo zero de leitura — e as quatro divergências acima são de casos específicos, não do
 * caso comum, que era o que estava errado antes.
 */
export function invoicesForSpendingFromTransactions(transactions: Transaction[]): InvoiceForSpending[] {
  const byMonth = new Map<string, InvoiceLedgerEntry[]>();

  for (const transaction of transactions) {
    if (transaction.type !== 'card_purchase') continue;
    // Compra excluída não gera cronograma nenhum. No ledger real, a exclusão vira estorno e
    // `reversedSourceIds` descarta a compra inteira; aqui basta não sintetizar.
    if (transaction.deletedAt) continue;

    const installments = transaction.installments ?? 1;
    // À vista não entra: `spendingByCategoryForMonth` conta compra 1x pela TRANSAÇÃO, no mês da
    // compra, e ignora o lançamento dela no ledger (`isSinglePurchaseLedgerEntry`). Sintetizar
    // aqui seria trabalho jogado fora — e um `installmentTotal: 1` acidental faria a compra
    // parecer parcelada pra `installmentPurchaseIds`, que testa `> 1`.
    if (installments <= 1) continue;

    const firstMonth = firstInvoiceMonthOf(transaction.invoiceId);
    // Sem o mês da primeira fatura não há cronograma: a compra fica de fora do conjunto de
    // parceladas e cai no comportamento antigo (valor cheio no mês da compra). Pior que o
    // ideal, melhor que inventar um cronograma — e não deve acontecer em dado gravado pelo app.
    if (!firstMonth) continue;

    const cardId = transaction.cardId;
    if (!cardId) continue;

    const amounts = installmentAmounts(transaction.amountCents, installments);
    amounts.forEach((amountCents, index) => {
      const referenceMonth = shiftMonthKey(firstMonth, index);
      const invoiceId = `${cardId}_${referenceMonth}`;
      const key = `${cardId}|${referenceMonth}`;
      const entries = byMonth.get(key) ?? [];
      entries.push({
        id: `${transaction.id}_derived_${index + 1}`,
        invoiceId,
        cardId,
        workspaceId: transaction.workspaceId,
        type: 'purchase',
        amountCents,
        // A data da COMPRA, igual em todas as parcelas — é o que o ledger real grava
        // (`addCardPurchaseToBatch` usa `parsed.purchaseDate` em todas) e o que
        // `installmentShiftBySource` usa como fallback de mês da compra.
        effectiveAt: transaction.date ?? Timestamp.now(),
        sourceTransactionId: transaction.id,
        idempotencyKey: `${transaction.id}_derived_${index + 1}`,
        createdBy: transaction.createdBy,
        installmentNumber: index + 1,
        installmentTotal: installments
      });
      byMonth.set(key, entries);
    });
  }

  return [...byMonth.entries()].map(([key, ledgerEntries]) => ({
    referenceMonth: key.slice(key.indexOf('|') + 1),
    ledgerEntries
  }));
}
