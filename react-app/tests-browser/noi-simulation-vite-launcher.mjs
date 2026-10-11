// Isolated acceptance server for the NOI full-feature simulation (2026-10-11), on its own ports (8340/3340)
// — never the preserved 8240/3240 preview or the user's own dev ports (8198/3198).
import { createServer } from 'vite';
const server = await createServer({ server: { host: '127.0.0.1', port: 3340, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8340' } } } });
await server.listen();
console.log('vite up');
