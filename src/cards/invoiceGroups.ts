/**
 * Separa as faturas de um cartão em "a pagar" e "quitadas", pra tela do Cartão não misturar o que
 * ainda importa com o que já acabou.
 *
 * Motivação (pedido do dono, 07/08/2026): a lista mostrava tudo em ordem cronológica, sem corte —
 * então em 2027 ela abriria em jan/2026 (paga) com a fatura atual enterrada no meio e as futuras
 * depois dela. *"Ela é a mais recente mas não vai ser a vigente."*
 *
 * ## ⚠️ O critério NÃO é `status === 'paid'`, e isso é deliberado
 *
 * "Paga" não existe no banco: o documento guarda só `'open'`/`'closed'` e `'paid'` nasce em memória
 * quando o ledger da fatura chega (`useCardsData` deriva dos totais persistidos, e
 * `mergeInvoicesWithLedger` recalcula do ledger ao vivo). Agrupar por status faria a fatura
 * **piscar** de um grupo pro outro durante o boot.
 *
 * O par `referenceMonth` + `outstandingBalanceCents` é estável desde o primeiro render e é o mesmo
 * critério que `selectCurrentCycleInvoices` (`financeCalculations.ts`) e `ongoingInstallmentPurchases`
 * (`spendingAnalysis.ts`) já usam pra decidir o que ainda é dívida.
 */
export interface GroupableInvoice {
  referenceMonth: string;
  outstandingBalanceCents: number;
}

export interface InvoiceGroups<T> {
  /** Tudo que ainda cobra algo, mais o mês corrente e os futuros. Ordem cronológica. */
  toPay: T[];
  /** Passado e sem saldo. Ordem cronológica (o mais antigo primeiro, como o resto da tela). */
  settled: T[];
}

/**
 * `toPay` = tem saldo em aberto **ou** é do mês corrente/futuro.
 *
 * O "ou" é o que mantém uma fatura **vencida e não paga** no topo, mesmo que seja de dois anos
 * atrás: ela é dívida, não histórico. E é o que faz a fatura do mês passado sair do grupo sozinha
 * no instante em que é paga — sem estado gravado, só recalculando.
 */
export function groupInvoicesForDisplay<T extends GroupableInvoice>(
  invoices: T[],
  currentMonth: string
): InvoiceGroups<T> {
  const toPay: T[] = [];
  const settled: T[] = [];

  for (const invoice of invoices) {
    if (invoice.outstandingBalanceCents > 0 || invoice.referenceMonth >= currentMonth) toPay.push(invoice);
    else settled.push(invoice);
  }

  return { toPay, settled };
}
