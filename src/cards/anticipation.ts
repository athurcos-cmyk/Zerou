export interface AnticipatableLedgerEntry {
  id: string;
  type: string;
  amountCents: number;
  sourceTransactionId?: string;
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
}

/**
 * Parcelas de faturas FUTURAS que ainda podem ser antecipadas para a fatura atual.
 *
 * Duas armadilhas que esta função existe pra fechar:
 *
 * 1. "Futura" é `referenceMonth` maior que o da fatura atual — não "qualquer fatura com
 *    id diferente". Faturas passadas ainda em aberto (fechadas e não pagas) não são
 *    antecipáveis: creditá-las jogaria uma dívida vencida pra frente.
 *
 * 2. Todas as parcelas de uma compra parcelada compartilham o mesmo `sourceTransactionId`
 *    (uma transação `card_purchase` só). Por isso o "já antecipado" é contado por
 *    ocorrência, não guardado num Set: se duas parcelas irmãs caírem na mesma fatura,
 *    antecipar uma não pode esconder a outra.
 */
export function selectAnticipatableInstallments(
  invoices: AnticipatableInvoice[],
  currentInvoice: { id: string; cardId: string; referenceMonth: string }
): AnticipatableInstallment[] {
  return invoices
    .filter(
      (invoice) =>
        invoice.cardId === currentInvoice.cardId &&
        invoice.referenceMonth > currentInvoice.referenceMonth &&
        invoice.status !== 'paid' &&
        invoice.status !== 'overpaid'
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
          sourceTransactionId: entry.sourceTransactionId as string
        }));
    })
    .sort((left, right) => left.referenceMonth.localeCompare(right.referenceMonth));
}
