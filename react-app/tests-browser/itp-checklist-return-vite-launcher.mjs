// Isolated acceptance server for ITP-CHECKLIST-RETURN-2026-001, on this round's own ports (8291/3291)
// — never the preserved 8240/3240 preview or the user's own dev ports (8198/3198).
import { createServer } from 'vite';
const server = await createServer({ server: { host: '127.0.0.1', port: 3291, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8291' } } } });
await server.listen();
console.log('vite up');
