// Isolated preview so the user can try CONTRACTOR-PERSONNEL-2026-001 before it is deployed (2026-10-11), on its own ports
// (8370/3370) and its own Vite cache — never the preserved 8240/3240 preview or the user's own dev ports (8198/3198).
import { createServer } from 'vite';
const server = await createServer({ cacheDir: 'node_modules/.vite-personnel-preview', server: { host: '127.0.0.1', port: 3370, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8370' } } } });
await server.listen();
console.log('vite up');
