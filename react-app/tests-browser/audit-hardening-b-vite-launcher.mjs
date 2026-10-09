// Vite dev server for AUDIT-HARDENING-B-2026-001 browser review: port 3320 → isolated backend 8320 (never 3240/8240 or 3198/8198).
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const reactAppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root: reactAppRoot, server: { host: '127.0.0.1', port: 3320, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8320' } } } });
await server.listen();
console.log('vite up');
