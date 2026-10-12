// Isolated acceptance server for REFUSAL-DIALOG-2026-001, on this round's own ports (8371/3371)
// — never the preserved 8240/3240 preview, the user's 8198/3198, or other sessions' 3293/3341/3380.
// Own dependency cache: sharing node_modules/.vite with another running dev server breaks each other's pages.
import { createServer } from 'vite';
const VITE_PORT = Number(process.env.RFD_VITE_PORT || 3371);
const API_PORT = Number(process.env.RFD_API_PORT || 8371);
const server = await createServer({ cacheDir: process.env.RFD_VITE_CACHE || 'node_modules/.vite-refusal-dialog', server: { host: '127.0.0.1', port: VITE_PORT, strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${API_PORT}` } } } });
await server.listen();
console.log('vite up');
