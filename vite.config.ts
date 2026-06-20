import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Gera public/firebase-messaging-sw.js com a config do Firebase injetada em
// build time. O arquivo fica em public/ para ser servido na raiz (exigência
// do SDK do Firebase Messaging para notificações em background).
// O arquivo é gerado, não commitado (está no .gitignore).
function generateFirebaseMessagingSW(env: Record<string, string>): Plugin {
  function write() {
    const config = JSON.stringify({
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    });

    writeFileSync(
      resolve(process.cwd(), 'public/firebase-messaging-sw.js'),
      `importScripts('https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js');
firebase.initializeApp(${config});
const messaging = firebase.messaging();
// Notificações recebidas com o app fechado ou em background
messaging.onBackgroundMessage(function(payload) {
  var n = payload.notification || {};
  self.registration.showNotification(n.title || 'Granix', {
    body: n.body || '',
    icon: '/brand/granix-app-icon-192.png',
    badge: '/brand/granix-app-icon-192.png',
    data: { link: (payload.fcmOptions || {}).link || '/app' }
  });
});
// Abre o app (ou a aba existente) quando o usuário clica na notificação
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return clients.openWindow(event.notification.data.link || '/app');
    })
  );
});`
    );
  }

  return { name: 'firebase-messaging-sw', buildStart: write };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'favicon.png', 'favicon-16x16.png', 'favicon-32x32.png', 'brand/granix-app-icon-180.png'],
        manifest: {
          name: 'Granix',
          short_name: 'Granix',
          description: 'Controle individual. Organização a dois.',
          theme_color: '#EE5524',
          background_color: '#FAF8F5',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/brand/granix-app-icon-192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/brand/granix-app-icon-512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: '/brand/granix-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
          navigateFallback: '/index.html',
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst' as const,
              options: {
                cacheName: 'google-fonts-stylesheets',
                expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 365 }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst' as const,
              options: {
                cacheName: 'google-fonts-webfonts',
                cacheableResponse: { statuses: [0, 200] },
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }
              }
            }
          ]
        }
      }),
      generateFirebaseMessagingSW(env),
    ],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      exclude: ['node_modules', 'dist', 'functions']
    }
  };
});
