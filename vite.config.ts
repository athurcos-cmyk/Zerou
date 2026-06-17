import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'brand/zerou-app-icon-180.png'],
      manifest: {
        name: 'Zerou',
        short_name: 'Zerou',
        description: 'Controle individual. Organização a dois.',
        theme_color: '#5B5BD6',
        background_color: '#F6F7F9',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/brand/zerou-app-icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/brand/zerou-app-icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/brand/zerou-maskable-512.png',
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
        navigateFallback: '/index.html'
      }
    })
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['node_modules', 'dist', 'functions']
  }
});
