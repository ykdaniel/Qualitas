import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[Vite Proxy] Error:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] Proxying:', req.method, req.url, '->', 'http://127.0.0.1:8000' + req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('[Vite Proxy] Response:', proxyRes.statusCode, req.url);
            // Rewrite 307/308 redirect Location headers so the browser follows
            // them through the Vite proxy (same origin) instead of hitting
            // the backend directly and losing the Authorization header.
            if ((proxyRes.statusCode === 307 || proxyRes.statusCode === 308) && proxyRes.headers.location) {
              try {
                const url = new URL(proxyRes.headers.location);
                proxyRes.headers.location = url.pathname + (url.search || '');
              } catch {
                // Already a relative path, leave as-is
              }
            }
          });
        },
      },
      '/uploads': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  }
})
