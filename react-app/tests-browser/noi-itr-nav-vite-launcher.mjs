// Isolated acceptance server for NOI-ITR-NAV-2026-001, bound to this round's own
// isolated ports (8200/3200) — never the user's own dev ports (8198/3198).
import { createServer } from 'vite';
const server = await createServer({ server: { host: '127.0.0.1', port: 3200, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8200' } } } });
await server.listen();
console.log('vite up');
