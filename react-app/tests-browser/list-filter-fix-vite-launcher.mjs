// Isolated acceptance server for LIST-FILTER-FIX-2026-001, on this round's own ports (8292/3292) and its own
// Vite cacheDir — never the preserved 8240/3240 preview, the user's own dev ports (8198/3198) or other rounds' caches.
import { createServer } from 'vite';
const server = await createServer({ cacheDir: '.vite-listfilter-3292',
    server: { host: '127.0.0.1', port: 3292, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8292' } } } });
await server.listen();
console.log('vite up');
