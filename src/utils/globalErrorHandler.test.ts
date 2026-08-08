import { beforeEach, describe, expect, it, vi } from 'vitest';

const recoverMock = vi.fn(() => Promise.resolve());
const hasAttemptedMock = vi.fn(() => false);

vi.mock('../firebase/firestoreRecovery', () => ({
  isFirestoreInternalCorruption: (error: unknown) =>
    error instanceof Error &&
    error.message.includes('FIRESTORE') &&
    error.message.includes('INTERNAL ASSERTION FAILED'),
  hasAttemptedFirestoreRecovery: () => hasAttemptedMock(),
  recoverFromCorruptedFirestorePersistence: () => recoverMock()
}));

async function loadHandler() {
  vi.resetModules();
  return import('./globalErrorHandler');
}

function setRoot(html: string) {
  document.body.innerHTML = `<div id="root">${html}</div>`;
}

function rootHtml() {
  return document.getElementById('root')!.innerHTML;
}

describe('globalErrorHandler', () => {
  beforeEach(() => {
    recoverMock.mockClear();
    hasAttemptedMock.mockClear();
    hasAttemptedMock.mockReturnValue(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('mostra tela de falha quando o boot quebrou e nada foi montado', async () => {
    setRoot('');
    const { reportFatalError } = await loadHandler();

    reportFatalError(new Error('boot explodiu'));

    expect(rootHtml()).toContain('O app não conseguiu abrir');
    expect(rootHtml()).toContain('Limpar cache local');
  });

  it('NÃO cobre a UI quando o app já está montado', async () => {
    setRoot('<main>dashboard funcionando</main>');
    const { reportFatalError } = await loadHandler();

    reportFatalError(new Error('erro tardio qualquer'));

    expect(rootHtml()).toContain('dashboard funcionando');
    expect(rootHtml()).not.toContain('O app não conseguiu abrir');
  });

  it('dispara recuperação automática na corrupção do Firestore, sem pintar tela', async () => {
    setRoot('');
    const { reportFatalError } = await loadHandler();

    reportFatalError(new Error('FIRESTORE (12.14.0) INTERNAL ASSERTION FAILED: Unexpected state'));

    expect(recoverMock).toHaveBeenCalledTimes(1);
    expect(rootHtml()).not.toContain('O app não conseguiu abrir');
  });

  it('não entra em loop: com recuperação já tentada, cai na tela de falha', async () => {
    setRoot('');
    hasAttemptedMock.mockReturnValue(true);
    const { reportFatalError } = await loadHandler();

    reportFatalError(new Error('FIRESTORE (12.14.0) INTERNAL ASSERTION FAILED: Unexpected state'));

    expect(recoverMock).not.toHaveBeenCalled();
    expect(rootHtml()).toContain('O app não conseguiu abrir');
  });

  it('promise rejeitada (escrita offline) nunca cobre a UI', async () => {
    setRoot('<main>dashboard funcionando</main>');
    await loadHandler();

    window.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), { reason: new Error('Failed to get document because the client is offline.') })
    );

    expect(rootHtml()).toContain('dashboard funcionando');
    expect(rootHtml()).not.toContain('O app não conseguiu abrir');
  });

  it('recurso de TERCEIRO falhando (fonte do Google, offline) não é tratado como fatal', async () => {
    setRoot('');
    await loadHandler();

    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans';
    document.head.append(link);
    link.dispatchEvent(new Event('error', { bubbles: false }));

    expect(rootHtml()).not.toContain('O app não conseguiu abrir');
  });
});
