// Fresh disposable isolated demo stack for the user to browse — bound to its own ports
// (8299/3299), never the user's own dev ports (8198/3198) or any other session's stack.
import { createServer } from 'vite';
const server = await createServer({ server: { host: '127.0.0.1', port: 3299, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8299' } } } });
await server.listen();
console.log('vite up');
