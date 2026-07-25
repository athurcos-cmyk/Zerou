import { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeWithTransientRetry } from '../firebase/firestoreRetry';
import { fetchDeletedTransactionIds, subscribeInvoiceLedger, type LocalCardSynced } from './cardService';
import { calculateInvoice } from '../domain/invoices/calculateInvoice';
import type { TransactionDeletionIndex } from '../finance/useFinanceData';
import type { Invoice, InvoiceLedgerEntry } from '../types/contracts';

export interface InvoiceLedgerRef {
  id: string;
  cardId: string;
}

export interface InvoiceLedgerState {
  entries: Array<LocalCardSynced<InvoiceLedgerEntry>>;
  loading: boolean;
  error: string | null;
}

const emptyIds: ReadonlySet<string> = new Set();
const emptyEntries: Array<LocalCardSynced<InvoiceLedgerEntry>> = [];

/** Quanto esperar pela primeira entrega (sucesso OU erro) do ledger de UMA fatura antes de
 * considerá-la "resolvida" pro agregado `loading` — evita que uma fatura travada prenda o
 * `loading` de TODAS as outras pra sempre. Não injeta array vazio em `entries` (mesmo padrão
 * de `INVOICE_BOOT_TIMEOUT_MS` em `useCardsData.ts`, ver comentário lá) — só destrava o
 * agregado; o dado real dessa fatura específica ainda aparece se/quando chegar. */
const LEDGER_BOOT_TIMEOUT_MS = 2500;

/**
 * Carrega o ledger só das faturas pedidas — ao contrário do boot global (`useCardsData`, que
 * não assina ledger nenhum), esta assinatura é sob demanda: uma tela de cartão/fatura/busca
 * paga o custo de leitura só quando efetivamente aberta, não em todo boot do app.
 */
export function useInvoiceLedger(
  workspaceId: string | undefined,
  invoiceRefs: InvoiceLedgerRef[],
  transactionIndex?: TransactionDeletionIndex
): InvoiceLedgerState {
  const [ledgerEntries, setLedgerEntries] = useState<Array<LocalCardSynced<InvoiceLedgerEntry>>>(emptyEntries);
  // Excluídas descobertas fora da janela de 300 (ver `fetchDeletedTransactionIds`).
  const [remoteDeletedIds, setRemoteDeletedIds] = useState<ReadonlySet<string>>(emptyIds);
  const resolvedIds = useRef(new Set<string>());
  // Quais faturas já tiveram o ledger resolvido (sucesso, erro ou timeout) pelo menos uma vez —
  // usado só pra saber quando `loading` pode virar false, não guarda dado.
  const [resolvedRefKeys, setResolvedRefKeys] = useState<ReadonlySet<string>>(emptyIds);
  const [error, setError] = useState<string | null>(null);

  const refsKey = useMemo(
    () => invoiceRefs.map((ref) => `${ref.cardId}:${ref.id}`).sort().join(','),
    [invoiceRefs]
  );

  useEffect(() => {
    if (!workspaceId || !refsKey) {
      setLedgerEntries(emptyEntries);
      setResolvedRefKeys(emptyIds);
      setError(null);
      return undefined;
    }

    const refs = refsKey.split(',').map((pair) => {
      const [cardId, id] = pair.split(':');
      return { cardId, id };
    });

    setResolvedRefKeys(emptyIds);
    setError(null);
    const timers: number[] = [];

    function markRefResolved(refKey: string) {
      setResolvedRefKeys((current) => (current.has(refKey) ? current : new Set(current).add(refKey)));
    }

    const unsubscribers = refs.map((ref) => {
      const refKey = `${ref.cardId}:${ref.id}`;
      let resolved = false;
      const bootTimer = window.setTimeout(() => {
        resolved = true;
        markRefResolved(refKey);
      }, LEDGER_BOOT_TIMEOUT_MS);
      timers.push(bootTimer);

      return subscribeWithTransientRetry({
        subscribe: (onError, markLoaded) =>
          subscribeInvoiceLedger(
            workspaceId,
            ref.cardId,
            ref.id,
            (items) => {
              resolved = true;
              window.clearTimeout(bootTimer);
              markLoaded();
              markRefResolved(refKey);
              setLedgerEntries((current) => [
                ...current.filter((entry) => entry.invoiceId !== ref.id || entry.cardId !== ref.cardId),
                ...items
              ]);
            },
            onError
          ),
        onError: () => {
          if (!resolved) {
            resolved = true;
            window.clearTimeout(bootTimer);
            markRefResolved(refKey);
          }
          setError('Não foi possível carregar os lançamentos da fatura.');
        }
      });
    });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
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

  const entries = useMemo(() => {
    // Ledger entries de uma compra no cartão excluída no Extrato (softDeleteTransaction
    // marca deletedAt na transação, mas as regras do Firestore não permitem que um
    // membro comum apague/edite o ledger da fatura) ficam órfãs para sempre — filtradas
    // aqui em vez de removidas, para não depender de regra nova.
    if (deletedTransactionIds.size === 0) return ledgerEntries;

    // Exceção: se a Cloud Function `reverseCardPurchaseOnDelete` já criou um estorno
    // (`purchase_reversal`/`anticipation_credit_reversal`) pra essa transação, o lançamento
    // original e o estorno ficam VISÍVEIS aqui — pra `anticipatedAwayEntryIds` (InvoicePage)
    // esconder o PAR certinho (linha da lista + números de "Compras"/"Créditos" do resumo).
    // Escondendo os dois aqui, como antes, o estorno nunca chegava a ser pareado: a linha
    // sumia da lista, mas "Compras"/"Créditos" ficavam inflados pra sempre com o par excluído.
    // Sem estorno (dado antigo, de antes dessa Cloud Function existir), continua escondido.
    const reversalTypes = new Set(['purchase_reversal', 'anticipation_credit_reversal']);
    const reversedTransactionIds = new Set(
      ledgerEntries
        .filter((entry) => reversalTypes.has(entry.type) && entry.sourceTransactionId)
        .map((entry) => entry.sourceTransactionId as string)
    );

    return ledgerEntries.filter((entry) => {
      if (!entry.sourceTransactionId || !deletedTransactionIds.has(entry.sourceTransactionId)) return true;
      return reversedTransactionIds.has(entry.sourceTransactionId);
    });
  }, [ledgerEntries, deletedTransactionIds]);

  const loading = useMemo(() => {
    if (!refsKey) return false;
    return refsKey.split(',').some((refKey) => !resolvedRefKeys.has(refKey));
  }, [refsKey, resolvedRefKeys]);

  return { entries, loading, error };
}

/**
 * Anexa `ledgerEntries` a cada fatura pedida e RECALCULA os totais (`outstandingBalanceCents`
 * e cia + `status`) a partir desse ledger, em vez de confiar só no campo persistido pela Cloud
 * Function (`invoiceLedgerEntryTrigger.ts`). A Function só roda quando a escrita chega ao
 * servidor — offline, ou nos poucos segundos antes dela processar, o campo persistido fica
 * desatualizado (2026-07-24, achado ao vivo pelo dono: "Limite disponível" demorava a
 * atualizar depois de lançar uma compra).
 *
 * `calculateInvoice()` é a MESMA função pura que `functions/src/cards/invoiceTotals.ts` porta
 * manualmente (comentário lá: "mantenha em sincronia manualmente se a lógica original
 * mudar") — nenhuma lógica nova sendo duplicada aqui, só reaproveitando o que já existe e já
 * é tratado como fonte da verdade. Zero leitura nova: as três telas que chamam esta função
 * (Cartão, Fatura, Análise) já carregam esse ledger via `useInvoiceLedger` de qualquer jeito.
 *
 * Usa o ledger já FILTRADO (sem lançamentos órfãos de transação excluída sem estorno) — o
 * mesmo conjunto que a lista "Compras" já mostra. Um lançamento órfão legado (dado anterior à
 * Cloud Function de estorno, ver `docs/history/2026-07.md`) faria o total ao vivo divergir do
 * persistido se usasse o ledger cru; com o filtrado, o total bate com o que a tela realmente
 * exibe — mais correto que o campo persistido nesse caso raro, não menos.
 */
export function mergeInvoicesWithLedger<T extends Invoice>(
  invoices: T[],
  ledgerEntries: Array<LocalCardSynced<InvoiceLedgerEntry>>
): Array<T & { ledgerEntries: InvoiceLedgerEntry[] }> {
  return invoices.map((invoice) => {
    const invoiceLedgerEntries = ledgerEntries.filter(
      (entry) => entry.cardId === invoice.cardId && entry.invoiceId === invoice.id
    );
    const live = calculateInvoice(
      invoiceLedgerEntries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        amountCents: entry.amountCents,
        effectiveAt: entry.effectiveAt.toDate(),
        idempotencyKey: entry.idempotencyKey
      })),
      invoice.status === 'open' ? 'open' : 'closed',
      invoice.dueDate?.toDate()
    );

    return {
      ...invoice,
      ledgerEntries: invoiceLedgerEntries,
      purchasesTotalCents: live.purchasesTotalCents,
      paymentsTotalCents: live.paymentsTotalCents,
      creditsTotalCents: live.creditsTotalCents,
      feesTotalCents: live.feesTotalCents,
      outstandingBalanceCents: live.outstandingBalanceCents,
      overpaidCreditCents: live.overpaidCreditCents,
      status: live.status
    };
  });
}
