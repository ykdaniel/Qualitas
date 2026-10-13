// Isolated preview server for REF-PROJECT-SEQ-2026-001 batch 1 (project isolation + sign-in project), on this round's own
// ports (8294/3294) — never the user's own dev ports (8198/3198). Own dependency cache (see meeting-fix launcher).
import { createServer } from 'vite';
const server = await createServer({ cacheDir: 'node_modules/.vite-ref-project-seq-b1', server: { host: '127.0.0.1', port: 3294, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8294' } } } });
await server.listen();
console.log('vite up');
