import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { hasAnalyticsConsent } from '../privacy/cookieConsent';

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
}

export class FirebaseConfigurationError extends Error {
  constructor(message = 'Firebase não configurado para este ambiente.') {
    super(message);
    this.name = 'FirebaseConfigurationError';
  }
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

function hasMinimumFirebaseConfig() {
  const requiredValues = [
    firebaseConfig.apiKey,
    firebaseConfig.authDomain,
    firebaseConfig.projectId,
    firebaseConfig.storageBucket,
    firebaseConfig.messagingSenderId,
    firebaseConfig.appId
  ];

  return requiredValues.every((value) => typeof value === 'string' && value.trim().length > 0);
}

function shouldUseEmulators() {
  return import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
}

let firebaseServices: FirebaseServices | null = null;

export const isFirebaseConfigured = hasMinimumFirebaseConfig();

export function getFirebaseServices() {
  if (!isFirebaseConfigured) {
    throw new FirebaseConfigurationError(
      'Firebase não está configurado neste deploy. Confira as variáveis VITE_FIREBASE_* na Vercel.'
    );
  }

  if (firebaseServices) {
    return firebaseServices;
  }

  try {
    const app = initializeApp(firebaseConfig);
    let dbInstance: Firestore;

    try {
      dbInstance = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        }),
        // Some networks/proxies/browsers break Firestore's WebChannel streaming,
        // making writes hang on "pending" until a full reload. Auto-detecting long
        // polling falls back to a compatible transport and keeps the app responsive.
        experimentalAutoDetectLongPolling: true
      });
    } catch {
      dbInstance = getFirestore(app);
    }

    firebaseServices = {
      app,
      auth: getAuth(app),
      db: dbInstance,
      storage: getStorage(app),
      functions: getFunctions(app, 'southamerica-east1')
    };

    return firebaseServices;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const isInvalidApiKey = message.includes('invalid-api-key');

    throw new FirebaseConfigurationError(
      isInvalidApiKey
        ? 'A chave Firebase do deploy está inválida. Revise VITE_FIREBASE_API_KEY na Vercel.'
        : 'Não foi possível inicializar o Firebase neste ambiente.'
    );
  }
}

let emulatorsConnected = false;

export function connectFirebaseEmulators() {
  if (!shouldUseEmulators() || emulatorsConnected) {
    return;
  }

  const services = getFirebaseServices();
  connectAuthEmulator(services.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(services.db, '127.0.0.1', 8080);
  connectStorageEmulator(services.storage, '127.0.0.1', 9199);
  connectFunctionsEmulator(services.functions, '127.0.0.1', 5001);
  emulatorsConnected = true;
}

export async function initializeOptionalAnalytics() {
  const analyticsEnabled = import.meta.env.VITE_ENABLE_ANALYTICS === 'true';

  if (
    typeof window === 'undefined' ||
    !analyticsEnabled ||
    !hasMinimumFirebaseConfig() ||
    !firebaseConfig.measurementId ||
    !hasAnalyticsConsent()
  ) {
    return;
  }

  try {
    const { getAnalytics, isSupported } = await import('firebase/analytics');
    if (await isSupported()) {
      getAnalytics(getFirebaseServices().app);
    }
  } catch {
    // Analytics is optional in this phase and must not break local dev or build.
  }
}

export function getFirebaseApp() {
  return getFirebaseServices().app;
}

export function getFirebaseAuth() {
  return getFirebaseServices().auth;
}

export function getFirebaseDb() {
  return getFirebaseServices().db;
}

export function getFirebaseStorage() {
  return getFirebaseServices().storage;
}

export function getFirebaseFunctions() {
  return getFirebaseServices().functions;
}
