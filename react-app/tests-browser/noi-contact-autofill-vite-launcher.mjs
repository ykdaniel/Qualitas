// Isolated acceptance server for NOI-CONTACT-AUTOFILL-2026-001, bound to this round's own
// isolated ports (8210/3210) — never the user's own dev ports (8198/3198).
import { createServer } from 'vite';
const server = await createServer({ server: { host: '127.0.0.1', port: 3210, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8210' } } } });
await server.listen();
console.log('vite up');
