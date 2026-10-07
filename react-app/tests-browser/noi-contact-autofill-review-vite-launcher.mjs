// Isolated acceptance server for NOI-CONTACT-AUTOFILL-2026-002, bound to this round's own
// isolated ports (8220/3220) — never the user's own dev ports (8198/3198).
import { createServer } from 'vite';
const server = await createServer({ server: { host: '127.0.0.1', port: 3220, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8220' } } } });
await server.listen();
console.log('vite up');
