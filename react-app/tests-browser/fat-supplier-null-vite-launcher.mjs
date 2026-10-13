// Isolated preview server for FAT-SUPPLIER-NULL-2026-001, on this round's own ports (8263/3263)
// — never the preserved 8240/3240 preview or the user's own dev ports (8198/3198). Own cacheDir (git-ignored .vite/)
// so it cannot break another vite server sharing node_modules.
import { createServer } from 'vite';
const server = await createServer({ cacheDir: '.vite/fat-supplier-null',
    server: { host: '127.0.0.1', port: 3263, strictPort: true,
        proxy: { '/api': { target: 'http://127.0.0.1:8263' } } } });
await server.listen();
console.log('vite up');
