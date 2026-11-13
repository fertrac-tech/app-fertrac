import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Lista de Precios Fertrac',
        short_name: 'Precios Fertrac',
        lang: 'es-CO',
        display: 'standalone',
        start_url: '.',
        theme_color: '#f47920',
        background_color: '#f5f6f7',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: { globIgnores: ['**/inter-{cyrillic,greek,vietnamese}*'], globPatterns: ['**/*.{js,css,html,png,svg,woff2}'], navigateFallback: 'index.html' },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: { include: ['src/domain/**', 'src/adapters/**', 'src/app/**'] },
  },
});
