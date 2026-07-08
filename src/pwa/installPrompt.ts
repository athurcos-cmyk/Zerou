const DISMISSED_KEY = 'zerou.pwaInstallDismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

/** The captured Chrome/Edge/Android install event, if the browser fired one. Consumed once. */
export function getDeferredInstallPrompt() {
  return deferredPrompt;
}

export function consumeDeferredInstallPrompt() {
  deferredPrompt = null;
}

/** Subscribe to changes (event captured or app installed). Returns an unsubscribe function. */
export function onInstallPromptChange(callback: () => void) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((listener) => listener !== callback);
  };
}

/** True when the app is already running installed (standalone) — Android/desktop and iOS each have their own signal. */
export function isRunningStandalone() {
  if (typeof window === 'undefined') {
    return false;
  }

  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone === true;
}

/** iPhone/iPad Safari has no `beforeinstallprompt` — those need the manual "Adicionar à Tela de Início" steps. */
export function isIOSDevice() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const isAppleTouchDevice = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isIPadOS13Plus = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isAppleTouchDevice || isIPadOS13Plus;
}

export function isInstallPromptDismissed() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }

  return window.localStorage.getItem(DISMISSED_KEY) === '1';
}

export function dismissInstallPromptPermanently() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Best-effort — pior caso o aviso reaparece.
  }
}
