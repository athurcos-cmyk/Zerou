import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb, getFirebaseServices } from '../firebase/config';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

// Pede permissão de notificação e salva o token FCM do dispositivo no Firestore.
// É chamado uma vez após o usuário autenticar. Falha silenciosamente — nunca
// quebra o app se o usuário recusar ou o browser não suportar.
export async function requestAndRegisterPushToken(): Promise<void> {
  if (!VAPID_KEY) return;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

  if (permission !== 'granted') return;

  try {
    const { getMessaging, getToken } = await import('firebase/messaging');
    const messaging = getMessaging(getFirebaseServices().app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) return;

    const user = getFirebaseAuth().currentUser;
    if (!user) return;

    await setDoc(doc(getFirebaseDb(), 'users', user.uid, 'fcmTokens', token), {
      token,
      platform: 'web',
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Push é opcional — nunca impede o uso do app
  }
}
