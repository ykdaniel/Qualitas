// Isolated acceptance server for MEETING-FIX / MEETING-TABS, on this round's own ports (8344/3344)
// — never the preserved 8240/3240 preview or the user's own dev ports (8198/3198).
// Own dependency cache: sharing node_modules/.vite with another running dev server (the coordination center's
// 3360 preview) makes each re-optimisation break the other's pages ("504 Outdated Optimize Dep").
import { createServer } from 'vite';
// MTG_VITE_PORT / MTG_API_PORT / MTG_VITE_CACHE move it, so a test run can sit beside a preview left open for the user.
const VITE_PORT = Number(process.env.MTG_VITE_PORT || 3344);
const API_PORT = Number(process.env.MTG_API_PORT || 8344);
const server = await createServer({ cacheDir: process.env.MTG_VITE_CACHE || 'node_modules/.vite-meeting-review', server: { host: '127.0.0.1', port: VITE_PORT, strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${API_PORT}` } } } });
await server.listen();
console.log('vite up');
