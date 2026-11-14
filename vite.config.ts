import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

/**
 * SEC-04 · Content-Security-Policy. GitHub Pages no permite cabeceras HTTP, así que va en un
 * <meta> (sin frame-ancestors ni report-uri, que el navegador ignora en meta).
 * Solo en el build: el servidor de desarrollo de Vite inyecta scripts en línea.
 * Orígenes de Google Identity Services según la guía oficial de GIS (accounts.google.com/gsi/…).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  // 'unsafe-inline' en estilos: el botón de Google aplica estilos en línea. No habilita scripts.
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "connect-src 'self' https://accounts.google.com/gsi/ https://script.google.com https://script.googleusercontent.com",
  "frame-src https://accounts.google.com/gsi/",
  // Fotos de producto (miniaturas de Drive → googleusercontent) y foto de perfil de Google.
  "img-src 'self' data: blob: https://drive.google.com https://*.googleusercontent.com",
  "font-src 'self' data:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'fertrac-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    contentSecurityPolicy(),
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
