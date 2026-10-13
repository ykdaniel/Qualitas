// Isolated preview for the ITP item-panel card backgrounds (2026-10-11), on its own ports (8391/3391)
// with its own Vite cache — never the user's 8198/3198 or the preserved 8240/3240.
import { createServer } from 'vite';
const server = await createServer({ cacheDir: 'node_modules/.vite-itp-cards',
    server: { host: '127.0.0.1', port: 3391, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8391' } } } });
await server.listen();
console.log('vite up');
