/**
 * Separa as faturas de um cartão em "a pagar" e "pagas", pra tela do Cartão não misturar o que
 * ainda importa com o que já acabou.
 *
 * Motivação (pedido do dono, 07/08/2026): a lista mostrava tudo em ordem cronológica, sem corte —
 * então em 2027 ela abriria em jan/2026 (paga) com a fatura atual enterrada no meio e as futuras
 * depois dela. *"Ela é a mais recente mas não vai ser a vigente."*
 *
 * ## ⚠️ Por que o mês sozinho não serve — o bug de 07/08/2026, à noite
 *
 * A primeira versão usava só `outstandingBalanceCents > 0 || referenceMonth >= mês corrente`. O dono
 * pagou a fatura de agosto **em agosto** (ela fecha antes do fim do mês) e nada mudou de grupo:
 * `'2026-08' >= '2026-08'` mantinha ela em "a pagar", e como nenhuma outra fatura era passada+zerada,
 * o grupo "pagas" ficava vazio e nem aparecia na tela. *"Depois de cinco faturas pagas eu já vou ter
 * que ficar arrastando a tela pra baixo pra ver as que eu preciso pagar."* Fatura fecha e é paga
 * **dentro** do próprio mês de referência — o mês nunca ia dar conta disso.
 *
 * Então o que tira a fatura da lista principal é ter **sido paga** (`paymentsTotalCents > 0` com
 * saldo zerado), e o mês virou só o critério secundário, pro histórico velho já quitado por outro
 * caminho (crédito, estorno, dado legado sem pagamento registrado).
 *
 * ## ⚠️ O critério NÃO é `status === 'paid'`, e isso continua deliberado
 *
 * `'paid'` não existe no banco: o documento guarda só `'open'`/`'closed'` e o status fino nasce
 * derivado (`useCardsData` a partir dos totais persistidos, `mergeInvoicesWithLedger` recalculando do
 * ledger ao vivo). Depender dele aqui acopla o agrupamento a duas derivações diferentes; os totais
 * (`outstandingBalanceCents`, `paymentsTotalCents`) são os mesmos campos nas duas e é o que
 * `selectCurrentCycleInvoices` (`financeCalculations.ts`) já usa pra decidir o que ainda é dívida.
 */
export interface GroupableInvoice {
  referenceMonth: string;
  outstandingBalanceCents: number;
  /** Quanto já foi pago desta fatura. É o campo que faz a fatura do MÊS CORRENTE poder sair da
   *  lista principal — ver o bug de 07/08/2026 no topo do arquivo. */
  paymentsTotalCents?: number;
}

export interface InvoiceGroups<T> {
  /** Tudo que ainda cobra algo: mês corrente e futuros ainda não pagos, e qualquer dívida atrasada.
   *  Ordem cronológica. */
  toPay: T[];
  /** Fatura paga (saldo zero e pagamento registrado) ou passado já zerado. Ordem cronológica. */
  settled: T[];
}

/**
 * `settled` = saldo zerado **e** (foi paga **ou** é de mês passado).
 *
 * O "ou" no segundo termo é o que mantém uma fatura **vencida e não paga** na lista principal, por
 * antiga que seja: ela é dívida, não histórico. E o `paymentsTotalCents` é o que faz a fatura sair da
 * lista **no instante em que é paga**, mesmo sendo do mês corrente — sem estado gravado, só
 * recalculando.
 *
 * Fatura FUTURA vazia (nenhuma parcela caiu nela ainda, ou a única foi antecipada) não é "paga":
 * saldo zero sem pagamento e mês futuro ⇒ continua em `toPay`. Quem esconde fatura futura que ficou
 * vazia é `invoiceHasVisibleActivity`, não este agrupamento.
 */
export function groupInvoicesForDisplay<T extends GroupableInvoice>(
  invoices: T[],
  currentMonth: string
): InvoiceGroups<T> {
  const toPay: T[] = [];
  const settled: T[] = [];

  for (const invoice of invoices) {
    const zeroed = invoice.outstandingBalanceCents <= 0;
    const paid = (invoice.paymentsTotalCents ?? 0) > 0;
    if (zeroed && (paid || invoice.referenceMonth < currentMonth)) settled.push(invoice);
    else toPay.push(invoice);
  }

  return { toPay, settled };
}
