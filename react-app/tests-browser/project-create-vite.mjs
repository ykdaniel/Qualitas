// Isolated acceptance server; retain the project's real Vite configuration.
import { createServer } from 'vite';
const server = await createServer({ server: { host: '127.0.0.1', port: 3198, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8198' } } } });
await server.listen();
console.log('vite up');
