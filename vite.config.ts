import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import http from "http";
import { WebSocketServer } from "ws";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

/** Auto-detect OpenLP songs.sqlite on local disk */
function findOpenLpDb(): string | null {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [
    path.join(home, 'AppData', 'Roaming', 'openlp', 'data', 'songs', 'songs.sqlite'),
    path.join(home, 'AppData', 'Roaming', 'openlp', 'songs', 'songs.sqlite'),
    path.join(home, '.local', 'share', 'openlp', 'songs', 'songs.sqlite'),
    path.join(home, '.openlp', 'data', 'songs', 'songs.sqlite'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/** Vite plugin: proxy + local DB serving */
function openLpPlugin(): PluginOption {
  const localDbPath = findOpenLpDb();
  if (localDbPath) {
    console.log(`[openlp] Found local DB: ${localDbPath}`);
  }

  return {
    name: 'openlp-local',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // ─── /local-db-info ───
        if (req.url === '/local-db-info') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            available: !!localDbPath && fs.existsSync(localDbPath),
            path: localDbPath,
          }));
          return;
        }

        // ─── /local-db → serve SQLite file ───
        if (req.url === '/local-db') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          if (!localDbPath || !fs.existsSync(localDbPath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Nie znaleziono bazy OpenLP na dysku' }));
            return;
          }
          const data = fs.readFileSync(localDbPath);
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': data.length,
            'X-DB-Path': localDbPath,
          });
          res.end(data);
          return;
        }

        // ─── /openlp-proxy/<ip>/<port>/... ───
        if (!req.url || !req.url.startsWith('/openlp-proxy/')) return next();

        const parts = req.url.replace('/openlp-proxy/', '').split('/');
        const targetIp = parts[0] || '127.0.0.1';
        const targetPort = parseInt(parts[1], 10) || 4316;
        const targetPath = '/' + parts.slice(2).join('/');

        const options: http.RequestOptions = {
          hostname: targetIp,
          port: targetPort,
          path: targetPath,
          method: req.method || 'GET',
          headers: { 'Accept': 'application/json' },
          timeout: 5000,
        };

        const proxyReq = http.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 502, {
            'Content-Type': proxyRes.headers['content-type'] || 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
          });
          proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
          res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: err.message }));
        });

        proxyReq.on('timeout', () => {
          proxyReq.destroy();
          res.writeHead(504, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'Timeout' }));
        });

        if (req.method === 'POST' || req.method === 'PUT') {
          req.pipe(proxyReq);
        } else {
          proxyReq.end();
        }
      });

      // ─── WebSocket for projector sync ───
      const wss = new WebSocketServer({ noServer: true });
      let latestState: string | null = null;
      const wsClients = new Set<import("ws").WebSocket>();

      wss.on('connection', (ws) => {
        wsClients.add(ws);
        if (latestState) ws.send(latestState);

        ws.on('message', (data) => {
          const msg = typeof data === 'string' ? data : data.toString();
          latestState = msg;
          for (const client of wsClients) {
            if (client !== ws && client.readyState === 1) {
              client.send(msg);
            }
          }
        });

        ws.on('close', () => wsClients.delete(ws));
      });

      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (req.url === '/ws-projector') {
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
          });
        }
      });

      console.log('[openlp] WebSocket projector sync: active on /ws-projector');
    },
  };
}

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
    openLpPlugin(),
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
}));
