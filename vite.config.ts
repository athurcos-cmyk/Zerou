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
// Dedup entre este SW e o handler de foreground (src/pwa/notifications.ts) — achado ao vivo
// em 2026-07-31: 'tag' igual no showNotification() NÃO bastou (o navegador às vezes mostra
// duas entradas mesmo com tag idêntica) nem document.visibilityState foi confiável (a página
// pode reportar 'visible' mesmo em segundo plano em algum Android/WebView). O Cache Storage é
// a única forma de estado que os dois lados — este SW e a página — realmente compartilham.
var PUSH_DEDUP_CACHE = 'push-dedup-v1';
var PUSH_DEDUP_WINDOW_MS = 8000;
function shouldDisplayPush(tag) {
  return caches.open(PUSH_DEDUP_CACHE).then(function(cache) {
    var key = 'https://push-dedup.internal/' + encodeURIComponent(tag);
    return cache.match(key).then(function(existing) {
      if (existing) {
        return existing.text().then(function(text) {
          if (Date.now() - Number(text) < PUSH_DEDUP_WINDOW_MS) return false;
          return cache.put(key, new Response(String(Date.now()))).then(function() { return true; });
        });
      }
      return cache.put(key, new Response(String(Date.now()))).then(function() { return true; });
    });
  }).catch(function() { return true; }); // Cache Storage falhou: não bloqueia a notificação
}
// Notificações recebidas com o app fechado ou em background
messaging.onBackgroundMessage(function(payload) {
  var n = payload.notification || {};
  var title = n.title || 'Granativa';
  var body = n.body || '';
  var tag = title + '|' + body;
  return shouldDisplayPush(tag).then(function(should) {
    if (!should) return;
    return self.registration.showNotification(title, {
      body: body,
      icon: '/brand/granativa-app-icon-192.png',
      badge: '/brand/granativa-app-icon-192.png',
      tag: tag,
      data: { link: (payload.fcmOptions || {}).link || '/app' }
    });
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
        includeAssets: ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'brand/granativa-app-icon-180.png'],
        manifest: {
          name: 'Granativa',
          short_name: 'Granativa',
          description: 'Veja pra onde vai seu dinheiro. Sozinho ou a dois.',
          lang: 'pt-BR',
          theme_color: '#EE5524',
          // Branco, não o Paper (#FAF8F5): os ícones do manifest passaram a ter fundo BRANCO
          // opaco (2026-08-03). Eles eram transparentes, e como o desenho tem um círculo que é
          // só um contorno preto vazado, em tema escuro o vazado virava a cor do sistema e o
          // contorno sumia — a marca aparecia como um borrão preto ao abrir o PWA. Com o ícone
          // branco sobre um fundo creme, sobraria um quadrado visível atrás dele na splash;
          // igualando as duas cores o ícone se funde ao fundo e some a emenda.
          background_color: '#FFFFFF',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/brand/granativa-app-icon-192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/brand/granativa-app-icon-512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: '/brand/granativa-maskable-512.png',
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
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,jpg,jpeg,webp}'],
          // O SW do Firebase Messaging tem que vir sempre da rede: precachear o
          // script de um service worker é pedir pra fixar uma versão velha dele.
          globIgnores: ['firebase-messaging-sw.js'],
          maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
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
    build: {
      // Sem isso, o Lightning CSS (minificador de CSS do Vite) assume um baseline
      // moderno e compila os breakpoints do Tailwind v4 com a sintaxe de media query
      // "width <= Npx", que Safari < 16.4 descarta como inválida (quebra toda a
      // responsividade em silêncio). cssTarget força o downlevel pro min/max-width clássico.
      cssTarget: ['safari13', 'ios13'],
      cssMinify: 'lightningcss',
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      exclude: ['node_modules', 'dist', 'functions']
    }
  };
});
