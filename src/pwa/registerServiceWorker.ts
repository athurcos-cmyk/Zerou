import { registerSW } from 'virtual:pwa-register';

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

function reloadOnce() {
  if (window.__zerouSwRefreshing) {
    return;
  }

  window.__zerouSwRefreshing = true;
  window.location.reload();
}

declare global {
  interface Window {
    __zerouSwRefreshing?: boolean;
  }
}

export function registerServiceWorkerUpdates() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }

    reloadOnce();
  });

  const checkForUpdates = (registration?: ServiceWorkerRegistration) => {
    if (!registration || navigator.onLine === false) {
      return;
    }

    registration.update().catch(() => {
      // Update checks are best-effort; the next focus/online/interval will retry.
    });
  };

  const applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      applyUpdate?.(true).catch(() => reloadOnce());
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) {
        return;
      }

      checkForUpdates(registration);

      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          checkForUpdates(registration);
        }
      });

      window.addEventListener('focus', () => checkForUpdates(registration));
      window.addEventListener('online', () => checkForUpdates(registration));
      window.setInterval(() => checkForUpdates(registration), UPDATE_CHECK_INTERVAL_MS);
    }
  });
}
