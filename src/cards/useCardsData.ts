import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveInvoiceStatus } from '../domain/invoices/calculateInvoice';
import { monthKeyFromDate } from '../finance/financeDates';
import { subscribeWithTransientRetry } from '../firebase/firestoreRetry';
import { markClosedInvoices, subscribeCards, subscribeInvoicesWindow, type LocalCardSynced } from './cardService';
import type { CreditCard, Invoice } from '../types/contracts';

interface CardsState {
  cards: Array<LocalCardSynced<CreditCard>>;
  /**
   * Faturas por (cartão, janela) — `${cardId}|past` e `${cardId}|future`.
   *
   * ⚠️ Não é uma lista só de propósito: são DUAS assinaturas por cartão, em direções opostas (ver
   * `subscribeInvoicesWindow`), e cada snapshot só pode substituir a própria metade. Guardar tudo
   * numa lista e trocá-la inteira a cada snapshot faria as duas se apagarem mutuamente.
   */
  invoicesByWindow: Record<string, Array<LocalCardSynced<Invoice>>>;
  loading: boolean;
  error: string | null;
}

const initialState: CardsState = {
  cards: [],
  invoicesByWindow: {},
  loading: true,
  error: null
};

/** Quanto esperar pela primeira entrega (sucesso OU erro) da fatura de UM cartão antes de
 * considerá-la "resolvida" pro agregado `invoicesLoading` — evita que a fatura de um cartão
 * travado prenda o `loading` de TODOS os cartões pra sempre. Não injeta array vazio em
 * `state.invoices` (diferente do que os hooks de assunto único faziam antes de 2026-07-24):
 * só destrava o agregado; o dado real desse cartão específico ainda aparece se/quando chegar,
 * via o mesmo listener que continua rodando em segundo plano. */
const INVOICE_BOOT_TIMEOUT_MS = 2500;

export function useCardsData(workspaceId?: string) {
  const [state, setState] = useState<CardsState>(initialState);
  // Quais cartões já tiveram a fatura resolvida (sucesso, erro ou timeout) pelo menos
  // uma vez — usado só pra saber quando `loading` pode virar false, não guarda dado.
  const [loadedInvoiceCardIds, setLoadedInvoiceCardIds] = useState<ReadonlySet<string>>(new Set());

  // `deleteCard` é soft-delete (isActive: false) — o listener continua trazendo o doc.
  // Filtrar aqui, e não em cada tela, garante que um cartão excluído suma da lista E
  // pare de comprometer saldo/limite: as faturas dele nunca chegam ao Dashboard porque
  // o effect abaixo só assina faturas dos cartões ativos.
  const activeCards = useMemo(() => state.cards.filter((card) => card.isActive !== false), [state.cards]);

  // Refs: effects read current data without triggering re-subscription on data-only changes.
  const cardsRef = useRef(activeCards);
  cardsRef.current = activeCards;

  const cardIds = useMemo(
    () => activeCards.map((c) => c.id).sort().join(','),
    [activeCards]
  );

  useEffect(() => {
    if (!workspaceId) {
      setState({ ...initialState, loading: false });
      return undefined;
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    const unsub = subscribeWithTransientRetry({
      subscribe: (onError, markLoaded) =>
        subscribeCards(
          workspaceId,
          (cards) => {
            markLoaded();
            setState((current) => ({ ...current, cards, loading: false, error: null }));
          },
          onError
        ),
      onRetrying: () => setState((current) => ({ ...current, loading: true, error: null })),
      onError: () =>
        setState((current) => ({
          ...current,
          loading: false,
          error: 'Não foi possível carregar os cartões.'
        }))
    });

    return () => {
      unsub();
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !cardIds) {
      setState((current) => ({ ...current, invoicesByWindow: {} }));
      return undefined;
    }

    const cards = cardsRef.current;
    const timers: number[] = [];

    // Chave composta `${cardId}|${janela}`: são duas assinaturas por cartão e o cartão só está
    // resolvido quando as DUAS responderam (ou estouraram o timeout).
    function markInvoiceLoaded(key: string) {
      setLoadedInvoiceCardIds((current) => (current.has(key) ? current : new Set(current).add(key)));
    }

    // Mês de referência das duas janelas, congelado na assinatura. Se o app ficar aberto virando o
    // mês, a fronteira só se move na próxima reassinatura — a fatura do mês novo já está do lado
    // "futuro" (era `>= mês anterior`), então nada desaparece nesse meio-tempo.
    const currentMonth = monthKeyFromDate(new Date());
    const windows: Array<'past' | 'future'> = ['future', 'past'];

    const unsubscribers = cards.flatMap((card) =>
      windows.map((invoiceWindow) => {
        const key = `${card.id}|${invoiceWindow}`;
        let resolved = false;
        const bootTimer = window.setTimeout(() => {
          resolved = true;
          markInvoiceLoaded(key);
        }, INVOICE_BOOT_TIMEOUT_MS);
        timers.push(bootTimer);

        return subscribeWithTransientRetry({
          subscribe: (onError, markLoaded) =>
            subscribeInvoicesWindow(
              workspaceId,
              card.id,
              invoiceWindow,
              currentMonth,
              (items) => {
                resolved = true;
                window.clearTimeout(bootTimer);
                markInvoiceLoaded(key);
                markLoaded();
                markClosedInvoices(workspaceId, items, card.closingDay);
                setState((current) => ({
                  ...current,
                  invoicesByWindow: { ...current.invoicesByWindow, [key]: items }
                }));
              },
              onError
            ),
          onError: () => {
            if (!resolved) {
              resolved = true;
              window.clearTimeout(bootTimer);
              markInvoiceLoaded(key);
            }
            setState((current) => ({ ...current, error: 'Não foi possível carregar faturas.' }));
          }
        });
      })
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [cardIds, workspaceId]);

  // "Comprometido"/"Disponível" no Dashboard descontam o saldo das faturas — reportar
  // loading=false antes delas chegarem mostraria um valor inflado por um instante
  // (a fatura ainda não foi subtraída) até a fatura chegar e corrigir, um "piscar"
  // visível pro usuário. Só considera resolvido quando toda conta ativa já tiver
  // resposta (sucesso, erro ou timeout) da própria fatura.
  const invoicesLoading = activeCards.some(
    (card) => !loadedInvoiceCardIds.has(`${card.id}|future`) || !loadedInvoiceCardIds.has(`${card.id}|past`)
  );

  const calculatedInvoices = useMemo(() => {
    // Faturas de um cartão que acabou de ser excluído continuam em `state.invoices`
    // (o effect desassina o listener, mas não limpa o que já chegou) — sem este filtro
    // elas seguiriam contando no "Comprometido" do Dashboard.
    const activeCardIds = new Set(activeCards.map((card) => card.id));

    // União das duas janelas, deduplicada por id e ORDENADA por `referenceMonth asc`.
    //
    // ⚠️ A ordenação é responsabilidade daqui, num lugar só. `CardDetailPage` renderiza na ordem de
    // chegada, e antes das duas janelas a direção da query ERA a ordem da lista — foi assim que
    // fatura futura acabou no topo até o commit `b9cd0e6` (24/07). Com duas assinaturas, ordem de
    // chegada não significa nada, então a garantia tem que ser explícita.
    const byId = new Map<string, LocalCardSynced<Invoice>>();
    for (const items of Object.values(state.invoicesByWindow)) {
      for (const invoice of items) byId.set(invoice.id, invoice);
    }
    const merged = [...byId.values()].sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth));

    return merged.filter((invoice) => activeCardIds.has(invoice.cardId)).map((invoice) => {
      // Totais (purchasesTotalCents, outstandingBalanceCents, etc.) já vêm certos do
      // documento — mantidos incrementalmente por invoiceLedgerEntryTrigger.ts. Só o status
      // fino ('paid'/'partial'/'overdue'/'overpaid') continua calculado no client, porque
      // nunca foi persistido — ver comentário em invoiceLedgerEntryTrigger.ts.
      const lifecycle = invoice.status === 'open' ? 'open' : 'closed';
      const status = resolveInvoiceStatus({
        lifecycle,
        outstandingBalanceCents: invoice.outstandingBalanceCents ?? 0,
        overpaidCreditCents: invoice.overpaidCreditCents ?? 0,
        paymentsTotalCents: invoice.paymentsTotalCents ?? 0,
        purchasesTotalCents: invoice.purchasesTotalCents ?? 0,
        feesTotalCents: invoice.feesTotalCents ?? 0,
        dueDate: invoice.dueDate?.toDate()
      });

      return { ...invoice, status };
    });
  }, [state.invoicesByWindow, activeCards]);

  const pendingWrites = useMemo(
    () =>
      [...state.cards, ...Object.values(state.invoicesByWindow).flat()].some(
        (item) => item.localSyncStatus === 'pending'
      ),
    [state.cards, state.invoicesByWindow]
  );

  return {
    ...state,
    cards: activeCards,
    invoices: calculatedInvoices,
    loading: state.loading || invoicesLoading,
    pendingWrites
  };
}
