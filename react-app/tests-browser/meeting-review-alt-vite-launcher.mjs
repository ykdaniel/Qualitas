// Second isolated acceptance server for the meeting / contractor-personnel suites (8346/3346): lets a test run sit beside
// a preview left open for the user on 8344/3344. Own dependency cache (sharing one breaks the other's pages).
// Run the suites with MTG_BASE=http://127.0.0.1:3346.
import { createServer } from 'vite';
const server = await createServer({ cacheDir: 'node_modules/.vite-meeting-review-2', server: { host: '127.0.0.1', port: 3346, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8346' } } } });
await server.listen();
console.log('vite up');
