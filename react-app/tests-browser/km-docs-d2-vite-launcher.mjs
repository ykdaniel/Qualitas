// Vite dev server for the KM-DOCS-2026-001 D2 preview: port 3390 → isolated backend 8390 (never 3240/8240 or 3198/8198).
// Own cacheDir so a parallel dev server sharing node_modules/.vite cannot break this one ("504 Outdated Optimize Dep").
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const reactAppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root: reactAppRoot, cacheDir: path.join(reactAppRoot, 'node_modules', '.vite-km-d2'),
    server: { host: '127.0.0.1', port: 3390, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:8390' } } } });
await server.listen();
console.log('vite up');
