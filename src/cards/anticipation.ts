export interface AnticipatableLedgerEntry {
  id: string;
  type: string;
  amountCents: number;
  sourceTransactionId?: string;
  installmentNumber?: number;
  installmentTotal?: number;
}

export interface AnticipatableInvoice {
  id: string;
  cardId: string;
  referenceMonth: string;
  status: string;
  ledgerEntries: AnticipatableLedgerEntry[];
}

export interface AnticipatableInstallment {
  entryId: string;
  invoiceId: string;
  referenceMonth: string;
  amountCents: number;
  sourceTransactionId: string;
  installmentNumber?: number;
}

export interface AnticipatablePurchaseGroup {
  sourceTransactionId: string;
  /** Total de parcelas da compra, quando conhecido (compras novas gravam isso). */
  installmentTotal?: number;
  /**
   * Parcelas futuras ainda não antecipadas, ordenadas da ÚLTIMA para a primeira.
   * Antecipar é contíguo a partir do fim (regra do Nubank / cartão brasileiro): pegar as
   * primeiras `k` desta lista = antecipar as últimas `k` parcelas. Você nunca antecipa uma
   * parcela do meio deixando as posteriores pra trás.
   */
  installments: AnticipatableInstallment[];
}

/**
 * Parcelas de faturas FUTURAS que ainda podem ser antecipadas para a fatura atual.
 *
 * Duas armadilhas que esta função fecha:
 *
 * 1. "Futura" é `referenceMonth` maior que o da fatura atual — não "qualquer fatura com id
 *    diferente". Faturas passadas ainda em aberto não são antecipáveis: creditá-las jogaria
 *    dívida vencida pra frente.
 *
 * 2. Todas as parcelas de uma compra compartilham o mesmo `sourceTransactionId` (uma
 *    transação `card_purchase` só). O "já antecipado" é contado por ocorrência, não num
 *    Set: se duas parcelas irmãs caírem na mesma fatura, antecipar uma não pode esconder a
 *    outra.
 */
function collectFutureInstallments(
  invoices: AnticipatableInvoice[],
  currentInvoice: { id: string; cardId: string; referenceMonth: string }
): AnticipatableInstallment[] {
  return invoices
    .filter(
      (invoice) =>
        invoice.cardId === currentInvoice.cardId &&
        invoice.referenceMonth > currentInvoice.referenceMonth &&
        invoice.status !== 'paid' &&
        invoice.status !== 'overpaid' &&
        invoice.status !== 'partial'
    )
    .flatMap((invoice) => {
      const alreadyAnticipated = new Map<string, number>();
      invoice.ledgerEntries
        .filter((entry) => entry.type === 'installment_anticipation_credit' && entry.sourceTransactionId)
        .forEach((entry) => {
          const key = entry.sourceTransactionId as string;
          alreadyAnticipated.set(key, (alreadyAnticipated.get(key) ?? 0) + 1);
        });

      return invoice.ledgerEntries
        .filter((entry) => {
          if (entry.type !== 'purchase' || !entry.sourceTransactionId) return false;
          const pending = alreadyAnticipated.get(entry.sourceTransactionId) ?? 0;
          if (pending > 0) {
            alreadyAnticipated.set(entry.sourceTransactionId, pending - 1);
            return false;
          }
          return true;
        })
        .map((entry) => ({
          entryId: entry.id,
          invoiceId: invoice.id,
          referenceMonth: invoice.referenceMonth,
          amountCents: entry.amountCents,
          sourceTransactionId: entry.sourceTransactionId as string,
          installmentNumber: entry.installmentNumber
        }));
    });
}

/** Última parcela primeiro: por número quando existe, senão pelo mês (mais recente primeiro). */
function orderLastFirst(a: AnticipatableInstallment, b: AnticipatableInstallment) {
  if (a.installmentNumber != null && b.installmentNumber != null) {
    return b.installmentNumber - a.installmentNumber;
  }
  return b.referenceMonth.localeCompare(a.referenceMonth);
}

/**
 * Compras com parcelas futuras antecipáveis, agrupadas — uma entrada por compra, cada uma
 * com suas parcelas futuras ordenadas da última para a primeira. A UI oferece "antecipar as
 * últimas N" por compra; `installments.slice(0, N)` são exatamente essas.
 */
export function groupAnticipatablePurchases(
  invoices: AnticipatableInvoice[],
  currentInvoice: { id: string; cardId: string; referenceMonth: string }
): AnticipatablePurchaseGroup[] {
  const byPurchase = new Map<string, AnticipatableInstallment[]>();
  const totals = new Map<string, number>();

  for (const installment of collectFutureInstallments(invoices, currentInvoice)) {
    const list = byPurchase.get(installment.sourceTransactionId) ?? [];
    list.push(installment);
    byPurchase.set(installment.sourceTransactionId, list);
  }

  // Total de parcelas da compra (do ledger), pra UI mostrar "parcela 8/12".
  for (const invoice of invoices) {
    for (const entry of invoice.ledgerEntries) {
      if (entry.type === 'purchase' && entry.sourceTransactionId && entry.installmentTotal) {
        totals.set(entry.sourceTransactionId, entry.installmentTotal);
      }
    }
  }

  return [...byPurchase.entries()]
    .map(([sourceTransactionId, installments]) => ({
      sourceTransactionId,
      installmentTotal: totals.get(sourceTransactionId),
      installments: installments.slice().sort(orderLastFirst)
    }))
    // Ordem estável entre compras: a que tem a parcela mais próxima de vencer primeiro.
    .sort((left, right) => {
      const leftNearest = left.installments[left.installments.length - 1]?.referenceMonth ?? '';
      const rightNearest = right.installments[right.installments.length - 1]?.referenceMonth ?? '';
      return leftNearest.localeCompare(rightNearest);
    });
}

export interface NettableLedgerEntry {
  id: string;
  type: string;
  amountCents: number;
  sourceTransactionId?: string;
}

/**
 * IDs de lançamentos que devem ficar invisíveis nesta fatura: uma parcela `purchase` que foi
 * antecipada pra fatura atual tem, na fatura ONDE ELA CAÍA ORIGINALMENTE, um crédito
 * `installment_anticipation_credit` que a anula por completo (mesma compra, mesmo valor).
 * Mostrar os dois lado a lado ("Compra R$300" + "Crédito −R$300") é ruído contábil sem
 * significado pra quem usa o app — no cartão de verdade (Nubank), a parcela antecipada
 * simplesmente SOME da fatura futura, não fica lá riscada. Casa por (sourceTransactionId,
 * amountCents); cada crédito anula exatamente uma parcela.
 *
 * Mesmo tratamento pra `purchase_reversal` — o estorno gerado quando uma compra no cartão é
 * excluída no Extrato (ver `reverseCardPurchaseOnDelete`) anula a parcela original do mesmo
 * jeito; esconder o par evita o mesmo ruído contábil de uma compra que já não existe mais.
 *
 * Não confundir com `installment_anticipation` (o débito que pousa na fatura ATUAL/origem
 * quando se antecipa): esse é visível de propósito — é dinheiro pesando agora, correto.
 */
export function anticipatedAwayEntryIds(entries: NettableLedgerEntry[]): Set<string> {
  const availableCredits = new Map<string, string[]>();
  for (const entry of entries) {
    const isCancellingCredit = entry.type === 'installment_anticipation_credit' || entry.type === 'purchase_reversal';
    if (!isCancellingCredit || !entry.sourceTransactionId) continue;
    const key = `${entry.sourceTransactionId}_${entry.amountCents}`;
    const list = availableCredits.get(key) ?? [];
    list.push(entry.id);
    availableCredits.set(key, list);
  }

  const hidden = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== 'purchase' || !entry.sourceTransactionId) continue;
    const key = `${entry.sourceTransactionId}_${entry.amountCents}`;
    const list = availableCredits.get(key);
    if (list && list.length > 0) {
      hidden.add(entry.id);
      hidden.add(list.shift() as string);
    }
  }
  return hidden;
}

/**
 * Se a fatura tem algo pra mostrar de verdade, depois de esconder os pares parcela↔crédito
 * antecipados. Uma fatura só com esse par (sem outra compra, tarifa ou pagamento) fica vazia
 * do ponto de vista de quem usa o app — a parcela que existia ali já foi embora — então some
 * do histórico de faturas, exatamente como sumiu da própria tela dela. Se um dia uma compra
 * nova cair nessa mesma fatura, ela deixa de ficar vazia e volta a aparecer sozinha.
 */
export function invoiceHasVisibleActivity(entries: NettableLedgerEntry[]): boolean {
  if (entries.length === 0) return false;
  const hidden = anticipatedAwayEntryIds(entries);
  return entries.some((entry) => !hidden.has(entry.id));
}
