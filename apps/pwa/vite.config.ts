import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'auto' -- suntik <script> registrasi service worker ke index.html
      // sendiri, TANPA perlu sentuh main.tsx/App.tsx (bootstrap auth &
      // offline outbox di sana TIDAK disentuh sama sekali).
      injectRegister: 'auto',
      // 'autoUpdate' -- SW baru langsung dipakai begitu ke-detect, TANPA
      // nunggu semua tab lama ditutup dulu -- hindari kasus "app shell
      // ke-stuck di versi lama" pas demo/reload.
      registerType: 'autoUpdate',
      workbox: {
        // Precache CUMA app shell + static assets hasil build (JS/CSS/HTML/
        // icon) -- SENGAJA TIDAK ada `runtimeCaching` sama sekali di sini,
        // jadi request ke backend API (origin/port beda, lihat CORS_ORIGIN)
        // TIDAK PERNAH lewat cache Workbox -- tidak ada risiko response API
        // basi, auth rusak, transaksi ketahan, atau flow IndexedDB (Dexie
        // outbox, terpisah total dari Workbox) berubah.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // SPA client-side routing (react-router) -- biar buka langsung
        // /kasir, /orders, dst (mis. dari home-screen icon) tetap kebuka ke
        // index.html, bukan 404. Endpoint API (origin beda) TIDAK match
        // pattern navigasi ini sama sekali, cuma jaga-jaga.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'BOZZ - Sistem POS Multi-Platform',
        short_name: 'BOZZ POS',
        description: 'Sistem POS multi-platform offline-first untuk kasir, pengepak, dan owner.',
        start_url: '/',
        display: 'standalone',
        theme_color: '#d00000',
        background_color: '#ffffff',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
