import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'sw-push.js',
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'assets/aistudio/image_16e1a4c9.png',
          'assets/aistudio/MEC-GOV-2025-Positivo-Horizontal_0f35c2cb.png',
          'assets/aistudio/MEC-GOV-205-Box-Horizontal_8384b2a7.png',
        ],
        manifest: {
          id: '/',
          name: 'estuda.gov.br · Portal do Estudante',
          short_name: 'estuda.gov',
          description:
            'Portal Único do Estudante Federal: treino diário, simulados fechados com quadro branco, monitor de desempenho, cronograma semanal, lei seca e caderno de erros.',
          theme_color: '#1351B4',
          background_color: '#F8F9FA',
          display: 'standalone',
          orientation: 'any',
          lang: 'pt-BR',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          importScripts: ['/sw-push.js'],
          globPatterns: [
            '**/*.{js,mjs,css,html,ico,svg,woff,woff2}',
            'pwa-*.png',
            'apple-touch-icon.png',
          ],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/__/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.cdnfonts\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'cdnfonts-rawline-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /\/assets\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'local-assets-cache',
                expiration: {
                  maxEntries: 40,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/(?:onnxruntime-web|@diffusionstudio\/piper-wasm).*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'piper-wasm-runtime-cache',
                expiration: {
                  maxEntries: 12,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    worker: {
      format: 'es' as const,
    },
    optimizeDeps: {
      exclude: ['onnxruntime-web'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            if (id.includes('/d3') || id.includes('internmap') || id.includes('delaunator') || id.includes('robust-predicates')) {
              return 'vendor-d3';
            }
            if (id.includes('pdfjs-dist')) {
              return 'vendor-pdfjs';
            }
            if (id.includes('jspdf') || id.includes('pdf-lib') || id.includes('html2canvas') || id.includes('canvg')) {
              return 'vendor-pdf-export';
            }
            if (id.includes('jszip')) {
              return 'vendor-docx';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
