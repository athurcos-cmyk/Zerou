import { deleteDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
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

// Pede permissão de notificação e salva o token FCM do dispositivo no Firestore.
// É chamado uma vez após o usuário autenticar, em toda sessão. Falha
// silenciosamente — nunca quebra o app se o usuário recusar ou o browser não
// suportar.
export async function requestAndRegisterPushToken(): Promise<void> {
  if (!VAPID_KEY) return;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

  if (permission !== 'granted') return;

  try {
    // `register` é idempotente: com o mesmo par (script, escopo) devolve a
    // registration que já existe e só dispara uma checagem de atualização.
    const swRegistration = await navigator.serviceWorker.register(
      '/firebase-messaging-sw.js',
      { scope: FCM_SW_SCOPE }
    );

    const { getMessaging, getToken } = await import('firebase/messaging');
    const messaging = getMessaging(getFirebaseServices().app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });
    if (!token) return;

    const user = getFirebaseAuth().currentUser;
    if (!user) return;

    // O token FCM praticamente não muda entre sessões — sem esse cache local,
    // toda abertura do app regravava o mesmo token no Firestore só pra atualizar
    // updatedAt. Só toca o Firestore quando o token realmente muda.
    const previousToken = readCachedPushToken(user.uid);
    if (previousToken === token) return;

    await setDoc(doc(getFirebaseDb(), 'users', user.uid, 'fcmTokens', token), {
      token,
      platform: 'web',
      updatedAt: serverTimestamp(),
    });
    saveCachedPushToken(user.uid, token);

    // O token anterior DESTE aparelho ficou órfão (mudou de service worker, ou o
    // browser renovou a inscrição). Sem apagar, ele fica no Firestore pra sempre:
    // o FCM aceita o envio pra ele e nada aparece, então a limpeza de token stale
    // do `sendPushToUser` nunca chega a removê-lo. Apagado DEPOIS de gravar o novo,
    // pra que uma falha no meio nunca deixe o usuário sem token nenhum.
    if (previousToken) {
      await deleteDoc(
        doc(getFirebaseDb(), 'users', user.uid, 'fcmTokens', previousToken)
      ).catch(() => {});
    }
  } catch {
    // Push é opcional — nunca impede o uso do app
  }
}

// Com o app ABERTO e visível, o SDK do FCM não mostra notificação nenhuma: ele
// entrega a mensagem aqui, na página, e espera que o app decida o que fazer.
// Sem este handler, todo push que chega com o app na frente some em silêncio.
// Usa o mesmo `showNotification` do SW (mesma aparência) e a mesma `tag` que o
// SW usa, então nunca dá pra ver a mesma mensagem duas vezes.
export async function listenForForegroundPush(): Promise<void> {
  if (!VAPID_KEY) return;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const { getMessaging, onMessage } = await import('firebase/messaging');
    const messaging = getMessaging(getFirebaseServices().app);

    onMessage(messaging, (payload) => {
      const notification = payload.notification;
      if (!notification) return;

      const title = notification.title || 'Granativa';
      const body = notification.body || '';

      navigator.serviceWorker
        .getRegistration(FCM_SW_SCOPE)
        .then((registration) => {
          registration?.showNotification(title, {
            body,
            icon: '/brand/granativa-app-icon-192.png',
            badge: '/brand/granativa-app-icon-192.png',
            tag: `${title}|${body}`,
            data: { link: payload.fcmOptions?.link || '/app' },
          });
        })
        .catch(() => {});
    });
  } catch {
    // Push é opcional — nunca impede o uso do app
  }
}
