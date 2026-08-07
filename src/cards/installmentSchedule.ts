import { Timestamp } from 'firebase/firestore';
import { referenceMonthFromInvoiceId } from './cardDates';
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
 * Dois casos que exigiram **espelho na transação** porque só existiam no ledger — os dois
 * fechados em 06/08/2026, com campo novo e regra atualizada no mesmo commit:
 *
 * - **`installmentStart`**: o número real da primeira parcela de uma compra já em andamento (o
 *   "7" de "7 de 10"). Sem ele, numerar de 1 criava uma "parcela 1" falsa e disparava o
 *   deslocamento de `installmentShiftBySource`, que a Análise nunca aplica nessas compras.
 * - **`anticipatedInstallments`**: `mês da fatura da parcela` → `mês em que se antecipou`.
 *   Move a parcela antecipada pro mês da antecipação, igual à Análise.
 *
 * ## ⚠️ Onde ela ainda pode divergir da Análise (enumerado de propósito)
 *
 * 1. **Dado antigo, gravado antes de 06/08/2026**, nos dois casos acima: sem
 *    `installmentStart`, uma compra já em andamento cuja próxima parcela caia exatamente 1 mês
 *    depois da data da compra continua 1 mês adiantada; sem `anticipatedInstallments`, uma
 *    antecipação feita antes desta data continua no cronograma original. Antecipar de novo
 *    grava o espelho e conserta a compra dali pra frente.
 * 2. **Transação fora da janela carregada.** A Análise conta a parcela mesmo sem a
 *    transação-mãe (cai em "Sem categoria"); aqui, sem a transação não há cronograma, e a
 *    parcela não aparece. Hoje inofensivo (a janela de 300 + mês completo cobre uso realista),
 *    cresce com o histórico da conta.
 * 3. **Tarifa, juros e estorno de fatura** (`fee`/`interest`/`purchase_reversal` sem
 *    transação): só existem no ledger. Já era assim antes desta função — o Dashboard nunca os
 *    mostrou.
 *
 * A Análise, que tem o ledger, segue sendo a tela exata. Esta é a melhor aproximação possível
 * com custo zero de leitura.
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

    const firstMonth = referenceMonthFromInvoiceId(transaction.invoiceId);
    // Sem o mês da primeira fatura não há cronograma: a compra fica de fora do conjunto de
    // parceladas e cai no comportamento antigo (valor cheio no mês da compra). Pior que o
    // ideal, melhor que inventar um cronograma — e não deve acontecer em dado gravado pelo app.
    if (!firstMonth) continue;

    const cardId = transaction.cardId;
    if (!cardId) continue;

    // Compra já em andamento começa na parcela 7, 8, 11… Numerar de 1 inventaria uma "parcela 1"
    // que `installmentShiftBySource` usaria pra deslocar a série — o que a Análise, lendo o ledger
    // real (onde essa parcela 1 não existe), nunca faz. Ausente = fluxo normal = começa em 1.
    const firstNumber = transaction.installmentStart ?? 1;
    const anticipated = transaction.anticipatedInstallments;

    const push = (referenceMonth: string, entry: InvoiceLedgerEntry) => {
      const key = `${cardId}|${referenceMonth}`;
      const entries = byMonth.get(key) ?? [];
      entries.push(entry);
      byMonth.set(key, entries);
    };
    const base = {
      cardId,
      workspaceId: transaction.workspaceId,
      sourceTransactionId: transaction.id,
      createdBy: transaction.createdBy
    };

    const amounts = installmentAmounts(transaction.amountCents, installments);
    amounts.forEach((amountCents, index) => {
      const referenceMonth = shiftMonthKey(firstMonth, index);
      const invoiceId = `${cardId}_${referenceMonth}`;
      const number = firstNumber + index;

      push(referenceMonth, {
        ...base,
        id: `${transaction.id}_derived_${number}`,
        invoiceId,
        type: 'purchase',
        amountCents,
        // A data da COMPRA, igual em todas as parcelas — é o que o ledger real grava
        // (`addCardPurchaseToBatch` usa `parsed.purchaseDate` em todas) e o que
        // `installmentShiftBySource` usa como fallback de mês da compra.
        effectiveAt: transaction.date ?? Timestamp.now(),
        idempotencyKey: `${transaction.id}_derived_${number}`,
        installmentNumber: number,
        installmentTotal: installments
      });

      // Parcela antecipada: reproduz **o par que o ledger tem**, em vez de mover a parcela de mês.
      // Mover parecia mais simples e estava errado — a parcela 1 PODE ser antecipada (a fatura dela
      // é futura enquanto a atual ainda está aberta), e movê-la faria `installmentShiftBySource`
      // perder a âncora e deixar de deslocar a série inteira. Com o par, o lançamento `purchase`
      // fica onde sempre esteve (a âncora sobrevive) e a conta fecha pelo mesmo caminho da Análise.
      const anticipatedIn = anticipated?.[referenceMonth];
      if (!anticipatedIn) return;

      // Crédito na MESMA fatura da parcela: herda o mesmo deslocamento e zera o mês certo por
      // construção — igual ao ledger real (ver o comentário de `anchoredMonthOf`).
      push(referenceMonth, {
        ...base,
        id: `${transaction.id}_derived_anticipated_credit_${number}`,
        invoiceId,
        type: 'installment_anticipation_credit',
        amountCents,
        effectiveAt: transaction.date ?? Timestamp.now(),
        idempotencyKey: `${transaction.id}_derived_anticipated_credit_${number}`,
        installmentNumber: number,
        installmentTotal: installments
      });

      // Débito ancorado no mês em que se antecipou — `anchoredMonthOf` tem exceção pra este tipo
      // e olha o `effectiveAt`, não a fatura, então o dia 1º do mês basta.
      const [year, month] = anticipatedIn.split('-').map(Number);
      push(anticipatedIn, {
        ...base,
        id: `${transaction.id}_derived_anticipated_debit_${number}`,
        invoiceId: `${cardId}_${anticipatedIn}`,
        type: 'installment_anticipation',
        amountCents,
        effectiveAt: Timestamp.fromDate(new Date(year, month - 1, 1, 12, 0, 0)),
        idempotencyKey: `${transaction.id}_derived_anticipated_debit_${number}`,
        installmentNumber: number,
        installmentTotal: installments
      });
    });
  }

  return [...byMonth.entries()].map(([key, ledgerEntries]) => ({
    referenceMonth: key.slice(key.indexOf('|') + 1),
    ledgerEntries
  }));
}
