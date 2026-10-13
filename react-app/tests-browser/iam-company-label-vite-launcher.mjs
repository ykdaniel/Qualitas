// Isolated acceptance server for IAM-USER-COMPANY-LABEL-2026-001 on its own ports (8361/3361) and its own Vite cache
// — never the preserved 8240/3240 preview or the user's own dev ports (8198/3198).
import { createServer } from 'vite';
const server = await createServer({ cacheDir: 'node_modules/.vite-iam-company-label', server: { host: '127.0.0.1', port: 3361, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8361' } } } });
await server.listen();
console.log('vite up');
