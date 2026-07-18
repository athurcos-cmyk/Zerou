import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { subscribeWithTransientRetry, SUSTAINED_FIRESTORE_RETRY_DELAY_MS, TRANSIENT_FIRESTORE_RETRY_DELAYS_MS } from './firestoreRetry';

function permissionDenied(): Error {
  return Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
}

/** Dispara o erro pendente e avança o relógio até a próxima tentativa (`start`) rodar. */
function failAndAdvance(getCallback: () => ((error: Error) => void) | undefined, delayMs: number) {
  getCallback()?.(permissionDenied());
  vi.advanceTimersByTime(delayMs);
}

describe('subscribeWithTransientRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Regressão: escrita fundacional do onboarding (ensurePersonalFoundation) libera a UI
  // depois de só 700ms em rede fraca — se o member doc ainda não chegou no servidor quando
  // um listener assina workspaces/{id}/..., a regra nega com permission-denied até o doc
  // aparecer. Sem retry sustentado, esgotar o backoff rápido (~8.2s) deixava a tela presa
  // numa mensagem de erro permanente que só um reload manual resolvia.
  it('continua tentando depois de esgotar o backoff rápido, e não fica preso pra sempre', () => {
    const onError = vi.fn();
    const onRetrying = vi.fn();
    let onErrorCallback: ((error: Error) => void) | undefined;
    const subscribeMock = vi.fn((onErr: (error: Error) => void) => {
      onErrorCallback = onErr;
      return vi.fn();
    });

    subscribeWithTransientRetry({ subscribe: subscribeMock, onRetrying, onError });

    // Consome as 4 tentativas do backoff rápido (attempts 0-3, todas "dentro do schedule").
    for (const delay of TRANSIENT_FIRESTORE_RETRY_DELAYS_MS) {
      failAndAdvance(() => onErrorCallback, delay);
    }
    expect(onError).not.toHaveBeenCalled();

    // A 5ª falha (attempt=4) cai fora do schedule — reporta o erro uma vez, mas agenda
    // mais uma tentativa no intervalo sustentado em vez de desistir de vez.
    onErrorCallback?.(permissionDenied());
    expect(onError).toHaveBeenCalledTimes(1);

    const attemptsBeforeSustained = subscribeMock.mock.calls.length;
    vi.advanceTimersByTime(SUSTAINED_FIRESTORE_RETRY_DELAY_MS);
    expect(subscribeMock.mock.calls.length).toBe(attemptsBeforeSustained + 1);

    // Mais uma rodada sustentada: continua tentando, e não reporta onError de novo.
    onErrorCallback?.(permissionDenied());
    vi.advanceTimersByTime(SUSTAINED_FIRESTORE_RETRY_DELAY_MS);
    expect(subscribeMock.mock.calls.length).toBe(attemptsBeforeSustained + 2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('se resolver depois do backoff esgotado, o próximo sucesso chega ao consumidor (self-heal)', () => {
    const onError = vi.fn();
    let onErrorCallback: ((error: Error) => void) | undefined;
    let attempts = 0;
    const subscribeMock = vi.fn((onErr: (error: Error) => void) => {
      attempts += 1;
      onErrorCallback = onErr;
      return vi.fn();
    });

    subscribeWithTransientRetry({ subscribe: subscribeMock, onError });

    for (const delay of TRANSIENT_FIRESTORE_RETRY_DELAYS_MS) {
      failAndAdvance(() => onErrorCallback, delay);
    }
    onErrorCallback?.(permissionDenied());
    expect(onError).toHaveBeenCalledTimes(1);

    // Servidor finalmente confirmou o member doc — a próxima rodada de `subscribe` é
    // chamada de novo (é o gancho que dá ao consumidor real, ex. subscribeCards, a
    // chance de suceder e limpar o erro sozinho via onNext/setSlice).
    const attemptsBeforeSustained = attempts;
    vi.advanceTimersByTime(SUSTAINED_FIRESTORE_RETRY_DELAY_MS);
    expect(attempts).toBe(attemptsBeforeSustained + 1);
  });

  it('erro não-transiente falha imediatamente, sem retry', () => {
    const onError = vi.fn();
    const onRetrying = vi.fn();
    const notFound = Object.assign(new Error('nope'), { code: 'not-found' });
    const subscribeMock = vi.fn((onErr: (error: Error) => void) => {
      onErr(notFound);
      return vi.fn();
    });

    subscribeWithTransientRetry({ subscribe: subscribeMock, onRetrying, onError });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(notFound);
    expect(onRetrying).not.toHaveBeenCalled();
  });

  it('para de tentar depois que o cleanup é chamado', () => {
    const onError = vi.fn();
    let onErrorCallback: ((error: Error) => void) | undefined;
    const subscribeMock = vi.fn((onErr: (error: Error) => void) => {
      onErrorCallback = onErr;
      return vi.fn();
    });

    const cleanup = subscribeWithTransientRetry({ subscribe: subscribeMock, onError });
    onErrorCallback?.(permissionDenied());
    cleanup();

    const callsAtCleanup = subscribeMock.mock.calls.length;
    vi.advanceTimersByTime(SUSTAINED_FIRESTORE_RETRY_DELAY_MS * 3);
    expect(subscribeMock.mock.calls.length).toBe(callsAtCleanup);
  });
});
