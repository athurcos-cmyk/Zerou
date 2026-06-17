import type { Unsubscribe } from 'firebase/firestore';

export const TRANSIENT_FIRESTORE_RETRY_DELAYS_MS = [600, 1200, 2400, 4000];

export function getFirestoreErrorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
}

export function isTransientFirestoreError(error: unknown) {
  return ['permission-denied', 'unavailable', 'deadline-exceeded'].includes(getFirestoreErrorCode(error));
}

interface SubscribeWithTransientRetryOptions {
  subscribe: (onError: (error: Error) => void) => Unsubscribe;
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

  function start(attempt = 0) {
    unsubscribe = subscribe((error) => {
      unsubscribe();

      if (cancelled) {
        return;
      }

      if (attempt < retryDelaysMs.length && isTransientFirestoreError(error)) {
        onRetrying?.();
        const timer = window.setTimeout(() => {
          if (!cancelled) {
            start(attempt + 1);
          }
        }, retryDelaysMs[attempt]);
        timers.push(timer);
        return;
      }

      onError(error);
    });
  }

  start();

  return () => {
    cancelled = true;
    unsubscribe();
    timers.forEach((timer) => window.clearTimeout(timer));
  };
}
