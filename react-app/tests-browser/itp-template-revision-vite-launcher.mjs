// Isolated comparison preview for ITP-TEMPLATE-REVISION-2026-001 (2026-10-17), on its own ports (8393/3393)
// with its own Vite cache — never the user's 8198/3198 or the preserved 8240/3240.
import { createServer } from 'vite';
const server = await createServer({ cacheDir: 'node_modules/.vite-itp-template-revision',
    server: { host: '127.0.0.1', port: 3393, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8393' } } } });
await server.listen();
console.log('vite up');
