import { deleteDoc, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb, getFirebaseServices } from '../firebase/config';
import { readCachedPushToken, saveCachedPushToken } from './pushTokenCache';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

// ⚠️ Escopo PRÓPRIO pro service worker do Firebase Messaging — o mesmo que o SDK
// usa por padrão. Precisa ser diferente de '/' porque o VitePWA já ocupa a raiz
// com o /sw.js do precaching: dois service workers NÃO coexistem no mesmo escopo,
// registrar um substituiria o outro (e aí o app perderia o offline).
//
// Foi exatamente aqui que o push ficou morto de 14/07 a 30/07/2026: o código
// procurava a registration com `getRegistration('/firebase-messaging-sw.js')`,
// mas essa API casa por ESCOPO, não por script — devolvia a registration do
// VitePWA (/sw.js, escopo '/'), nunca `undefined`. O registro do SW do FCM
// portanto nunca acontecia, e o `getToken` amarrava a inscrição de push ao SW do
// Workbox, que não tem listener de `push`. Resultado: o FCM aceitava 100% dos
// envios (nenhum token virava stale) e nenhuma notificação aparecia no aparelho.
const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

// Só registra push no modo PWA instalado (standalone) — nunca numa aba comum do navegador.
// Decisão do dono (2026-07-31): abrir pelo navegador e aceitar notificação, depois instalar o
// PWA e aceitar de novo, registrava DOIS tokens pro mesmo usuário — toda notificação chegava
// duas vezes. Restringir o pedido de permissão a um único caminho (o PWA instalado) elimina a
// causa: nunca existem dois contextos concorrendo por token no mesmo aparelho. Efeito
// colateral aceito: quem só usa pelo navegador nunca recebe push — o app funciona normalmente,
// só sem notificação.
function isStandalonePwa(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari não suporta a media query `display-mode` — usa a propriedade legada
  // `navigator.standalone`, `true` só quando aberto pela tela de início.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// ⚠️ TEMPORÁRIO (2026-07-31): grava um retrato do que aconteceu em cada etapa do registro
// em `users/{uid}/pushDebug/latest` — só existe pra diagnosticar, sem acesso ao aparelho, por
// que o dono não conseguia registrar um token mesmo confirmando que abre um PWA de verdade
// (tela cheia, sem UI de navegador). Remover depois de confirmado (ver docs/planning/TODOS.md).
function writePushDebug(info: Record<string, unknown>): void {
  const user = getFirebaseAuth().currentUser;
  if (!user) return;
  setDoc(doc(getFirebaseDb(), 'users', user.uid, 'pushDebug', 'latest'), {
    ...info,
    updatedAt: serverTimestamp(),
  }).catch(() => {});
}

// Pede permissão de notificação e salva o token FCM do dispositivo no Firestore.
// É chamado uma vez após o usuário autenticar, em toda sessão. Falha
// silenciosamente — nunca quebra o app se o usuário recusar ou o browser não
// suportar.
export async function requestAndRegisterPushToken(): Promise<void> {
  const debug: Record<string, unknown> = {
    vapidKeyPresent: Boolean(VAPID_KEY),
    notificationSupported: 'Notification' in window,
    serviceWorkerSupported: 'serviceWorker' in navigator,
  };

  try {
    if (!VAPID_KEY) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    debug.displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
    debug.navigatorStandalone = (navigator as Navigator & { standalone?: boolean }).standalone ?? null;
    debug.isStandalone = isStandalonePwa();
    if (!isStandalonePwa()) return;

    debug.permissionBefore = Notification.permission;
    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
    debug.permissionAfter = permission;
    if (permission !== 'granted') return;

    // `register` é idempotente: com o mesmo par (script, escopo) devolve a
    // registration que já existe e só dispara uma checagem de atualização.
    const swRegistration = await navigator.serviceWorker.register(
      '/firebase-messaging-sw.js',
      { scope: FCM_SW_SCOPE }
    );
    debug.swScope = swRegistration.scope;
    debug.swActiveScript = swRegistration.active?.scriptURL ?? null;

    const { getMessaging, getToken } = await import('firebase/messaging');
    const messaging = getMessaging(getFirebaseServices().app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });
    debug.tokenObtained = Boolean(token);
    if (!token) return;

    const user = getFirebaseAuth().currentUser;
    debug.hasUser = Boolean(user);
    if (!user) return;

    const tokenDocRef = doc(getFirebaseDb(), 'users', user.uid, 'fcmTokens', token);

    // O token FCM praticamente não muda entre sessões — sem esse cache local, toda
    // abertura do app regravava o mesmo token no Firestore só pra atualizar updatedAt.
    const previousToken = readCachedPushToken(user.uid);
    debug.previousToken = previousToken ? 'cached' : null;

    if (previousToken === token) {
      // ⚠️ O cache local só reflete o que ESTE aparelho já escreveu antes — não o estado
      // real do Firestore. Achado ao vivo em 2026-07-31: uma limpeza manual de tokens
      // mortos apagou o doc direto no servidor, mas o cache do dono continuou dizendo
      // "nada mudou" — o app pulava a escrita achando que já estava registrado, e o
      // usuário ficava sem token nenhum até fechar o app (o que nunca limpa o
      // localStorage sozinho). Confirma que o doc realmente existe antes de pular.
      const existing = await getDoc(tokenDocRef);
      debug.tokenDocExistedInFirestore = existing.exists();
      if (existing.exists()) {
        debug.result = 'unchanged';
        return;
      }
    }

    await setDoc(tokenDocRef, {
      token,
      platform: 'web',
      updatedAt: serverTimestamp(),
    });
    saveCachedPushToken(user.uid, token);
    debug.firestoreWriteSucceeded = true;

    // O token anterior DESTE aparelho ficou órfão. Trocar de service worker gera uma
    // inscrição nova, com endpoint novo — e `isTokenValid` (SDK do Messaging) compara
    // endpoint/auth/p256dh, então o SDK descarta o token velho e emite outro.
    // O `sendPushToUser` acabaria limpando o doc órfão sozinho (o SDK revoga o token
    // antigo no FCM, então o envio pra ele passa a falhar e cai na limpeza de stale),
    // mas só no próximo disparo — apagar aqui evita mandar push pra um token morto no
    // meio tempo. DEPOIS de gravar o novo, pra que uma falha no meio nunca deixe o
    // usuário sem token nenhum. `previousToken !== token` evita apagar o doc que
    // acabamos de escrever no caso "cache desatualizado" acima.
    if (previousToken && previousToken !== token) {
      await deleteDoc(
        doc(getFirebaseDb(), 'users', user.uid, 'fcmTokens', previousToken)
      ).catch(() => {});
    }
    debug.result = 'registered';
  } catch (err) {
    // Push é opcional — nunca impede o uso do app. Erro só entra no diagnóstico.
    debug.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  } finally {
    writePushDebug(debug);
  }
}

// Dedup entre este handler e o service worker (public/firebase-messaging-sw.js, gerado por
// vite.config.ts) — achado ao vivo em 2026-07-31, em duas rodadas: primeiro que `tag` igual
// no `showNotification()` não bastava sozinho (o navegador às vezes mostra duas entradas
// mesmo com tag idêntica); depois que `document.visibilityState` TAMBÉM não é confiável — a
// página pode reportar 'visible' mesmo em segundo plano em algum Android/WebView, então essa
// trava não impediu uma segunda duplicação real. Cache Storage é a única forma de estado que
// os dois lados — este handler e o SW — realmente compartilham (`caches` existe nos dois
// contextos, ao contrário de `localStorage`, que o SW não enxerga).
const PUSH_DEDUP_CACHE = 'push-dedup-v1';
const PUSH_DEDUP_WINDOW_MS = 8000;

async function shouldDisplayPush(tag: string): Promise<boolean> {
  try {
    const cache = await caches.open(PUSH_DEDUP_CACHE);
    const key = `https://push-dedup.internal/${encodeURIComponent(tag)}`;
    const existing = await cache.match(key);
    if (existing) {
      const shownAt = Number(await existing.text());
      if (Date.now() - shownAt < PUSH_DEDUP_WINDOW_MS) return false;
    }
    await cache.put(key, new Response(String(Date.now())));
    return true;
  } catch {
    return true; // Cache Storage falhou: não bloqueia a notificação
  }
}

// Documentação do SDK diz que, com o app ABERTO e visível, o FCM não mostra notificação
// nenhuma sozinho: entrega a mensagem aqui, na página, e espera que o app decida o que
// fazer. Sem este handler, push chegando com o app na frente some em silêncio.
export async function listenForForegroundPush(): Promise<void> {
  if (!VAPID_KEY) return;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (!isStandalonePwa()) return;
  if (Notification.permission !== 'granted') return;

  try {
    const { getMessaging, onMessage } = await import('firebase/messaging');
    const messaging = getMessaging(getFirebaseServices().app);

    onMessage(messaging, (payload) => {
      const notification = payload.notification;
      if (!notification) return;

      const title = notification.title || 'Granativa';
      const body = notification.body || '';
      const tag = `${title}|${body}`;

      shouldDisplayPush(tag)
        .then((should) => {
          if (!should) return;
          return navigator.serviceWorker.getRegistration(FCM_SW_SCOPE).then((registration) => {
            registration?.showNotification(title, {
              body,
              icon: '/brand/granativa-app-icon-192.png',
              badge: '/brand/granativa-app-icon-192.png',
              tag,
              data: { link: payload.fcmOptions?.link || '/app' },
            });
          });
        })
        .catch(() => {});
    });
  } catch {
    // Push é opcional — nunca impede o uso do app
  }
}
