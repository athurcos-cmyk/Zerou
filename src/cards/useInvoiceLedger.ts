import { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeWithTransientRetry } from '../firebase/firestoreRetry';
import { fetchDeletedTransactionIds, subscribeInvoiceLedger, type LocalCardSynced } from './cardService';
import type { TransactionDeletionIndex } from '../finance/useFinanceData';
import type { Invoice, InvoiceLedgerEntry } from '../types/contracts';

export interface InvoiceLedgerRef {
  id: string;
  cardId: string;
}

const emptyIds: ReadonlySet<string> = new Set();
const emptyEntries: Array<LocalCardSynced<InvoiceLedgerEntry>> = [];

/**
 * Carrega o ledger só das faturas pedidas — ao contrário do boot global (`useCardsData`, que
 * não assina ledger nenhum), esta assinatura é sob demanda: uma tela de cartão/fatura/busca
 * paga o custo de leitura só quando efetivamente aberta, não em todo boot do app.
 */
export function useInvoiceLedger(
  workspaceId: string | undefined,
  invoiceRefs: InvoiceLedgerRef[],
  transactionIndex?: TransactionDeletionIndex
): Array<LocalCardSynced<InvoiceLedgerEntry>> {
  const [ledgerEntries, setLedgerEntries] = useState<Array<LocalCardSynced<InvoiceLedgerEntry>>>(emptyEntries);
  // Excluídas descobertas fora da janela de 300 (ver `fetchDeletedTransactionIds`).
  const [remoteDeletedIds, setRemoteDeletedIds] = useState<ReadonlySet<string>>(emptyIds);
  const resolvedIds = useRef(new Set<string>());

  const refsKey = useMemo(
    () => invoiceRefs.map((ref) => `${ref.cardId}:${ref.id}`).sort().join(','),
    [invoiceRefs]
  );

  useEffect(() => {
    if (!workspaceId || !refsKey) {
      setLedgerEntries(emptyEntries);
      return undefined;
    }

    const refs = refsKey.split(',').map((pair) => {
      const [cardId, id] = pair.split(':');
      return { cardId, id };
    });

    const unsubscribers = refs.map((ref) =>
      subscribeWithTransientRetry({
        subscribe: (onError) =>
          subscribeInvoiceLedger(
            workspaceId,
            ref.cardId,
            ref.id,
            (items) =>
              setLedgerEntries((current) => [
                ...current.filter((entry) => entry.invoiceId !== ref.id || entry.cardId !== ref.cardId),
                ...items
              ]),
            onError
          ),
        onError: () => undefined
      })
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [workspaceId, refsKey]);

  // Transações citadas pelo ledger que a janela de `subscribeTransactions` não cobre.
  // Normalmente vazio; só aparece em conta com muito histórico, e é exatamente aí que o
  // filtro de lançamento órfão silenciosamente falhava.
  const unresolvedIdsKey = useMemo(() => {
    if (!transactionIndex) return '';

    const referenced = new Set<string>();
    ledgerEntries.forEach((entry) => {
      if (entry.sourceTransactionId && !transactionIndex.knownIds.has(entry.sourceTransactionId)) {
        referenced.add(entry.sourceTransactionId);
      }
    });

    return [...referenced].sort().join(',');
  }, [ledgerEntries, transactionIndex]);

  useEffect(() => {
    resolvedIds.current = new Set();
    setRemoteDeletedIds(emptyIds);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !unresolvedIdsKey) return undefined;

    const pending = unresolvedIdsKey.split(',').filter((id) => !resolvedIds.current.has(id));
    if (pending.length === 0) return undefined;

    let cancelled = false;
    fetchDeletedTransactionIds(workspaceId, pending)
      .then((deleted) => {
        if (cancelled) return;
        // Marca como resolvido mesmo quando nada foi excluído: senão o effect refaz a
        // leitura a cada snapshot de ledger.
        pending.forEach((id) => resolvedIds.current.add(id));
        if (deleted.length > 0) {
          setRemoteDeletedIds((current) => new Set([...current, ...deleted]));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [workspaceId, unresolvedIdsKey]);

  const deletedTransactionIds = useMemo(() => {
    const fromWindow = transactionIndex?.deletedIds ?? emptyIds;
    if (remoteDeletedIds.size === 0) return fromWindow;
    return new Set([...fromWindow, ...remoteDeletedIds]);
  }, [transactionIndex, remoteDeletedIds]);

  return useMemo(() => {
    // Ledger entries de uma compra no cartão excluída no Extrato (softDeleteTransaction
    // marca deletedAt na transação, mas as regras do Firestore não permitem que um
    // membro comum apague/edite o ledger da fatura) ficam órfãs para sempre — filtradas
    // aqui em vez de removidas, para não depender de regra nova.
    if (deletedTransactionIds.size === 0) return ledgerEntries;
    return ledgerEntries.filter(
      (entry) => !entry.sourceTransactionId || !deletedTransactionIds.has(entry.sourceTransactionId)
    );
  }, [ledgerEntries, deletedTransactionIds]);
}

/** Anexa `ledgerEntries` a cada fatura pedida. Totais/status já vêm certos de `useCardsData`. */
export function mergeInvoicesWithLedger<T extends Invoice>(
  invoices: T[],
  ledgerEntries: Array<LocalCardSynced<InvoiceLedgerEntry>>
): Array<T & { ledgerEntries: InvoiceLedgerEntry[] }> {
  return invoices.map((invoice) => ({
    ...invoice,
    ledgerEntries: ledgerEntries.filter((entry) => entry.cardId === invoice.cardId && entry.invoiceId === invoice.id)
  }));
}
