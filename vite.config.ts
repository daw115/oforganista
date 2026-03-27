import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'pwa-icon-192.png', 'pwa-icon-512.png'],
      manifest: {
        name: 'Organista - Panel organisty',
        short_name: 'Organista',
        description: 'Panel zarządzania harmonogramem organisty',
        theme_color: '#050a14',
        background_color: '#050a14',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          {
            src: '/pwa-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/~oauth/],
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
      globIgnores: ['**/piesni-siedlecki.json'],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Supabase Storage: songbook images, songs.json, musicxml files
            urlPattern: /\/storage\/v1\/object\/public\/(songbook|songs|musicxml)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: {
                maxEntries: 5000,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Supabase REST API: liturgy_cache, songs tables
            urlPattern: /\/rest\/v1\/(liturgy_cache|songs|songbook_songs|songbook_pages|devotions|melodies|cantor_melodies|projector_presets|projector_rooms)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-api-data',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Edge functions (liturgy proxies etc.)
            urlPattern: /\/functions\/v1\/(brewiarz-proxy|musicam-proxy|parish-announcements)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'edge-functions',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 3 * 24 * 60 * 60, // 3 days
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Siedlecki PDF pages (external or local)
            urlPattern: /piesni-siedlecki|siedlecki/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'siedlecki-assets',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 90 * 24 * 60 * 60, // 90 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Google Fonts and other CDN assets
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 365 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Split heavy dependencies into separate chunks for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React — cached long-term, rarely changes
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI framework — shadcn/radix components
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-popover',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-accordion',
          ],
          // Data layer
          'vendor-data': ['@tanstack/react-query', '@supabase/supabase-js'],
          // Heavy libs — only loaded when needed
          'vendor-charts': ['recharts'],
          'vendor-pdf': ['pdfjs-dist'],
          // Date utilities
          'vendor-date': ['date-fns'],
        },
      },
    },
    // Increase chunk size warning to reduce noise
    chunkSizeWarningLimit: 800,
  },
}));
