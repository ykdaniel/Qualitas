// Isolated acceptance server for ITP-REQUIRED-POLICY-2026-001, on this round's own ports (8270/3270)
// — never the preserved 8240/3240 preview or the user's own dev ports (8198/3198).
import { createServer } from 'vite';
const server = await createServer({ server: { host: '127.0.0.1', port: 3270, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8270' } } } });
await server.listen();
console.log('vite up');
