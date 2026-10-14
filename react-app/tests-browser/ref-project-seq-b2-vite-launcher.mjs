// Isolated preview server for REF-PROJECT-SEQ-2026-001 batch 2 (create in a project, shared templates, same-project links),
// on this round's own ports (8295/3295) — never the user's own dev ports (8198/3198). Own dependency cache.
import { createServer } from 'vite';
const server = await createServer({ cacheDir: 'node_modules/.vite-ref-project-seq-b2', server: { host: '127.0.0.1', port: 3295, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8295' } } } });
await server.listen();
console.log('vite up');
