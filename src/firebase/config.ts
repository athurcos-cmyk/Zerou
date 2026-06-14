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
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
  storage: FirebaseStorage;
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
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

function shouldUseEmulators() {
  return import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
}

const app = initializeApp(firebaseConfig);

let dbInstance: Firestore;

try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch {
  dbInstance = getFirestore(app);
}

export const firebaseServices: FirebaseServices = {
  app,
  auth: getAuth(app),
  db: dbInstance,
  functions: getFunctions(app, 'southamerica-east1'),
  storage: getStorage(app)
};

let emulatorsConnected = false;

export function connectFirebaseEmulators() {
  if (!shouldUseEmulators() || emulatorsConnected) {
    return;
  }

  connectAuthEmulator(firebaseServices.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firebaseServices.db, '127.0.0.1', 8080);
  connectFunctionsEmulator(firebaseServices.functions, '127.0.0.1', 5001);
  connectStorageEmulator(firebaseServices.storage, '127.0.0.1', 9199);
  emulatorsConnected = true;
}

export async function initializeOptionalAnalytics() {
  if (typeof window === 'undefined' || !hasMinimumFirebaseConfig() || !firebaseConfig.measurementId) {
    return;
  }

  try {
    const { getAnalytics, isSupported } = await import('firebase/analytics');
    if (await isSupported()) {
      getAnalytics(app);
    }
  } catch {
    // Analytics is optional in this phase and must not break local dev or build.
  }
}

export const auth = firebaseServices.auth;
export const db = firebaseServices.db;
export const functions = firebaseServices.functions;
export const storage = firebaseServices.storage;
export const isFirebaseConfigured = hasMinimumFirebaseConfig();
