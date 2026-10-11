// Isolated acceptance server for CHECKLIST-TEMPLATE-CLEAN-2026-001, on this round's own ports (8330/3330)
// — never the preserved 8240/3240 preview or the user's own dev ports (8198/3198).
import { createServer } from 'vite';
const server = await createServer({ server: { host: '127.0.0.1', port: 3330, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8330' } } } });
await server.listen();
console.log('vite up');
