// Isolated preview server for NOI-DEFECTS-2026-001 (expected reference number, delete prompt), on this round's own ports (8293/3293)
// — never the preserved 8240/3240 preview or the user's own dev ports (8198/3198). Own dependency cache (see meeting-fix launcher).
import { createServer } from 'vite';
const server = await createServer({ cacheDir: 'node_modules/.vite-noi-defects', server: { host: '127.0.0.1', port: 3293, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8293' } } } });
await server.listen();
console.log('vite up');
