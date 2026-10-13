// Isolated preview server for NCR-DELETE-AUDIT-2026-001 (a refused NCR delete shows its reason), on this round's own ports (8341/3341)
// — never the preserved 8240/3240 preview, the user's own dev ports (8198/3198) or another round's (8293/3293, 3291). Own dependency cache (git-ignored .vite/, since node_modules may be a read-only link to the main checkout's).
import { createServer } from 'vite';
const server = await createServer({ cacheDir: '.vite/ncr-delete-audit', server: { host: '127.0.0.1', port: 3341, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8341' } } } });
await server.listen();
console.log('vite up');
