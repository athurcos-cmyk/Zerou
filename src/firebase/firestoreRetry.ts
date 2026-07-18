import type { Unsubscribe } from 'firebase/firestore';

export const TRANSIENT_FIRESTORE_RETRY_DELAYS_MS = [600, 1200, 2400, 4000];

/**
 * Depois de esgotar o backoff acima (~8.2s), continua tentando neste intervalo pra
 * sempre em vez de desistir de vez. Existe pra cobrir a escrita fundacional do
 * onboarding (`ensurePersonalFoundation`, `workspaceService.ts`) que dispara o batch
 * e libera a UI de propósito depois de só 700ms em rede fraca — se o batch ainda não
 * tiver chegado no servidor quando o primeiro listener assinar `workspaces/{id}/...`,
 * a regra `isActiveMember` nega com `permission-denied` até o member doc aparecer.
 * Em rede ruim isso pode levar mais que 8.2s, e sem retry sustentado o usuário ficava
 * preso numa mensagem de erro permanente que só um reload manual resolvia.
 */
export const SUSTAINED_FIRESTORE_RETRY_DELAY_MS = 10000;

export function getFirestoreErrorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
}

export function isTransientFirestoreError(error: unknown) {
  return ['permission-denied', 'unavailable', 'deadline-exceeded'].includes(getFirestoreErrorCode(error));
}

interface SubscribeWithTransientRetryOptions {
  subscribe: (onError: (error: Error) => void, markLoaded: () => void) => Unsubscribe;
  onRetrying?: () => void;
  onError: (error: Error) => void;
  retryDelaysMs?: number[];
}

export function subscribeWithTransientRetry({
  subscribe,
  onRetrying,
  onError,
  retryDelaysMs = TRANSIENT_FIRESTORE_RETRY_DELAYS_MS
}: SubscribeWithTransientRetryOptions): Unsubscribe {
  let cancelled = false;
  let unsubscribe: Unsubscribe = () => undefined;
  const timers: number[] = [];
  let hasReportedError = false;
  // Ja entregamos dado bom pelo menos uma vez neste listener ao vivo? Um erro depois
  // disso e reconexao de rede (troca de torre, sinal fraco), nao falha de carga inicial —
  // ignorar em vez de reabrir loading/erro evita "piscar" a UI com dado bom ja na tela a
  // cada soluco de conexao. Mesmo padrao ja usado em `useFinanceData.ts` (`resolved`).
  let resolved = false;

  function start(attempt = 0) {
    unsubscribe = subscribe((error) => {
      if (cancelled) return;

      const code = getFirestoreErrorCode(error);

      // unavailable = offline. Se ja recebeu dados, ignora. O SDK retenta sozinho.
      if (code === 'unavailable') return;

      if (resolved) return;

      unsubscribe();

      if (!isTransientFirestoreError(error)) {
        onError(error);
        return;
      }

      const withinSchedule = attempt < retryDelaysMs.length;

      if (withinSchedule) {
        onRetrying?.();
      } else if (!hasReportedError) {
        // Backoff rapido esgotado sem resolver — avisa a UI uma vez, mas continua
        // tentando em segundo plano no intervalo sustentado. Se resolver depois, o
        // proximo sucesso do consumidor limpa o erro sozinho (self-heal).
        hasReportedError = true;
        onError(error);
      }

      const delay = withinSchedule ? retryDelaysMs[attempt] : SUSTAINED_FIRESTORE_RETRY_DELAY_MS;
      const timer = window.setTimeout(() => {
        if (!cancelled) {
          start(withinSchedule ? attempt + 1 : attempt);
        }
      }, delay);
      timers.push(timer);
    }, () => {
      resolved = true;
    });
  }

  start();

  return () => {
    cancelled = true;
    unsubscribe();
    timers.forEach((timer) => window.clearTimeout(timer));
  };
}
