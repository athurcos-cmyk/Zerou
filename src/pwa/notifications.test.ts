import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface DocRef {
  path: string;
}
interface SwRegistration {
  scope: string;
  __sw: string;
  showNotification?: ReturnType<typeof vi.fn>;
}
interface ForegroundPayload {
  notification?: { title?: string; body?: string };
  fcmOptions?: { link?: string };
}

// Mocks precisam existir antes do import dinâmico do módulo sob teste.
const setDocMock = vi.fn<(ref: DocRef, data: unknown) => Promise<void>>(async () => undefined);
const deleteDocMock = vi.fn<(ref: DocRef) => Promise<void>>(async () => undefined);
const getTokenMock = vi.fn<
  (
    messaging: unknown,
    options: { vapidKey: string; serviceWorkerRegistration: SwRegistration }
  ) => Promise<string>
>(async () => 'token-novo');
const onMessageMock = vi.fn<(messaging: unknown, handler: (p: ForegroundPayload) => void) => void>();

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  setDoc: setDocMock,
  deleteDoc: deleteDocMock,
  serverTimestamp: () => 'ts',
}));

vi.mock('firebase/messaging', () => ({
  getMessaging: () => ({}),
  getToken: getTokenMock,
  onMessage: onMessageMock,
}));

vi.mock('../firebase/config', () => ({
  getFirebaseAuth: () => ({ currentUser: { uid: 'uid-1' } }),
  getFirebaseDb: () => ({}),
  getFirebaseServices: () => ({ app: {} }),
}));

const cache = new Map<string, string>();
vi.mock('./pushTokenCache', () => ({
  readCachedPushToken: (uid: string) => cache.get(uid) ?? null,
  saveCachedPushToken: (uid: string, token: string) => {
    cache.set(uid, token);
  },
}));

const registerMock =
  vi.fn<(script: string, options?: { scope?: string }) => Promise<SwRegistration>>();
const getRegistrationMock = vi.fn<(clientUrl?: string) => Promise<SwRegistration>>();

async function loadModule() {
  vi.resetModules();
  vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'vapid-de-teste');
  return import('./notifications');
}

beforeEach(() => {
  cache.clear();
  setDocMock.mockClear();
  deleteDocMock.mockClear();
  getTokenMock.mockClear();
  onMessageMock.mockClear();
  registerMock.mockReset();
  getRegistrationMock.mockReset();

  // A registration do VitePWA: script /sw.js no escopo raiz. É ela que
  // `getRegistration()` devolve pra QUALQUER URL do site — inclusive
  // '/firebase-messaging-sw.js', porque a API casa por escopo, não por script.
  const vitePwaRegistration: SwRegistration = { scope: 'https://app.test/', __sw: '/sw.js' };
  const fcmRegistration: SwRegistration = {
    scope: 'https://app.test/firebase-cloud-messaging-push-scope',
    __sw: '/firebase-messaging-sw.js',
    showNotification: vi.fn(),
  };

  registerMock.mockImplementation(async (script, options) => {
    if (script === '/firebase-messaging-sw.js' && options?.scope) return fcmRegistration;
    return vitePwaRegistration;
  });
  getRegistrationMock.mockImplementation(async (clientUrl) => {
    if (clientUrl === '/firebase-cloud-messaging-push-scope') return fcmRegistration;
    return vitePwaRegistration;
  });

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register: registerMock, getRegistration: getRegistrationMock },
  });

  vi.stubGlobal(
    'Notification',
    Object.assign(vi.fn(), { permission: 'granted', requestPermission: async () => 'granted' })
  );

  // Por padrão os testes rodam como se estivessem no PWA instalado (standalone) — é o único
  // contexto em que o registro de push acontece de verdade (ver isStandalonePwa). Os testes
  // que verificam o gate sobrescrevem isso.
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: undefined });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('requestAndRegisterPushToken', () => {
  it('registra o SW do FCM num escopo próprio, fora do escopo raiz do VitePWA', async () => {
    const { requestAndRegisterPushToken } = await loadModule();
    await requestAndRegisterPushToken();

    expect(registerMock).toHaveBeenCalledTimes(1);
    const [script, options] = registerMock.mock.calls[0];
    expect(script).toBe('/firebase-messaging-sw.js');

    // O escopo NÃO pode ser a raiz: dois service workers não coexistem no mesmo
    // escopo — registrar o do FCM em '/' substituiria o /sw.js do precaching.
    expect(options?.scope).toBeTruthy();
    expect(options?.scope).not.toBe('/');
  });

  it('entrega ao getToken a registration do FCM, nunca a do VitePWA', async () => {
    const { requestAndRegisterPushToken } = await loadModule();
    await requestAndRegisterPushToken();

    // Este é o bug real de 14/07–30/07/2026: o token era emitido sobre a
    // registration do Workbox (/sw.js), que não tem listener de `push`. O FCM
    // aceitava o envio e nenhuma notificação chegava a aparecer no aparelho.
    const [, options] = getTokenMock.mock.calls[0];
    expect(options.serviceWorkerRegistration.__sw).toBe('/firebase-messaging-sw.js');
  });

  it('grava o token novo e apaga o anterior deste aparelho', async () => {
    cache.set('uid-1', 'token-antigo');

    const { requestAndRegisterPushToken } = await loadModule();
    await requestAndRegisterPushToken();

    // setDoc também é chamado pro diagnóstico temporário (pushDebug) — filtra pelo
    // caminho de fcmTokens especificamente.
    const tokenWrites = setDocMock.mock.calls.filter((call) => call[0].path.includes('fcmTokens'));
    expect(tokenWrites).toHaveLength(1);
    expect(tokenWrites[0][0].path).toContain('token-novo');

    // Sem isso o token velho fica no Firestore pra sempre: o FCM aceita o envio
    // pra ele, nada aparece, e a limpeza de token stale nunca o remove.
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
    expect(deleteDocMock.mock.calls[0][0].path).toContain('token-antigo');
  });

  it('não regrava o token FCM quando ele não mudou', async () => {
    cache.set('uid-1', 'token-novo');

    const { requestAndRegisterPushToken } = await loadModule();
    await requestAndRegisterPushToken();

    // O diagnóstico temporário (pushDebug) sempre grava — só o doc de fcmTokens não deve.
    const tokenWrites = setDocMock.mock.calls.filter((call) => call[0].path.includes('fcmTokens'));
    expect(tokenWrites).toHaveLength(0);
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  // Decisão do dono (2026-07-31): abrir pelo navegador e aceitar notificação, depois instalar
  // o PWA e aceitar de novo, registrava DOIS tokens pro mesmo usuário — toda notificação
  // chegava duas vezes. A partir de agora só o PWA instalado (standalone) pede permissão.
  it('nunca pede permissão nem registra o SW numa aba comum do navegador (display-mode != standalone)', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));

    const { requestAndRegisterPushToken } = await loadModule();
    await requestAndRegisterPushToken();

    expect(registerMock).not.toHaveBeenCalled();
    expect(getTokenMock).not.toHaveBeenCalled();
    // O diagnóstico temporário (pushDebug) ainda grava, pra registrar QUE foi bloqueado aqui —
    // só o doc de fcmTokens não deve existir.
    const tokenWrites = setDocMock.mock.calls.filter((call) => call[0].path.includes('fcmTokens'));
    expect(tokenWrites).toHaveLength(0);
  });

  it('reconhece o PWA instalado no iOS via navigator.standalone, mesmo sem display-mode', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });

    const { requestAndRegisterPushToken } = await loadModule();
    await requestAndRegisterPushToken();

    expect(registerMock).toHaveBeenCalledTimes(1);
  });

  // Diagnóstico temporário (pushDebug, ver comentário em notifications.ts) — prova que ele
  // captura o suficiente pra diagnosticar sem acesso ao aparelho.
  it('grava um retrato de diagnóstico com as decisões-chave, mesmo quando tudo dá certo', async () => {
    const { requestAndRegisterPushToken } = await loadModule();
    await requestAndRegisterPushToken();

    const debugWrite = setDocMock.mock.calls.find((call) => call[0].path.includes('pushDebug'));
    expect(debugWrite).toBeDefined();
    expect(debugWrite![1]).toMatchObject({
      isStandalone: true,
      permissionAfter: 'granted',
      tokenObtained: true,
      firestoreWriteSucceeded: true,
      result: 'registered',
    });
  });

  it('o diagnóstico registra o motivo quando bloqueado por não estar no PWA instalado', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));

    const { requestAndRegisterPushToken } = await loadModule();
    await requestAndRegisterPushToken();

    const debugWrite = setDocMock.mock.calls.find((call) => call[0].path.includes('pushDebug'));
    expect(debugWrite![1]).toMatchObject({
      isStandalone: false,
      displayModeStandalone: false,
      navigatorStandalone: null,
    });
    // Não deve ter chegado a checar permissão/token — parou no gate do PWA.
    expect(debugWrite![1]).not.toHaveProperty('permissionAfter');
  });
});

describe('listenForForegroundPush', () => {
  it('mostra a notificação quando o push chega com o app aberto', async () => {
    const { listenForForegroundPush } = await loadModule();
    await listenForForegroundPush();

    expect(onMessageMock).toHaveBeenCalledTimes(1);
    const handler = onMessageMock.mock.calls[0][1];

    handler({
      notification: { title: 'Conta vence em breve', body: 'Luz: R$ 120,00 vence em 02/08' },
      fcmOptions: { link: 'https://granativa.com.br/app/bills' },
    });
    await Promise.resolve();
    await Promise.resolve();

    const fcmRegistration = await getRegistrationMock('/firebase-cloud-messaging-push-scope');
    expect(fcmRegistration.showNotification).toHaveBeenCalledWith(
      'Conta vence em breve',
      expect.objectContaining({
        body: 'Luz: R$ 120,00 vence em 02/08',
        // Mesma tag do SW — a mesma mensagem nunca aparece duas vezes.
        tag: 'Conta vence em breve|Luz: R$ 120,00 vence em 02/08',
      })
    );
  });

  it('não escuta push numa aba comum do navegador, mesmo com permissão já concedida antes', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));

    const { listenForForegroundPush } = await loadModule();
    await listenForForegroundPush();

    expect(onMessageMock).not.toHaveBeenCalled();
  });
});
