// Isolated preview server for REF-PROJECT-SEQ-2026-001 batch 3 (numbering per project, project codes, naming rules, original document number),
// on this round's own ports (8296/3296) — never the user's own dev ports (8198/3198). Own dependency cache.
import { createServer } from 'vite';
const server = await createServer({ cacheDir: 'node_modules/.vite-ref-project-seq-b3', server: { host: '127.0.0.1', port: 3296, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8296' } } } });
await server.listen();
console.log('vite up');
