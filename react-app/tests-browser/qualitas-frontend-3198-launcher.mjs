// Restart helper for the persistent frontend dev server on port 3198 (this file's own
// directory, react-app/, is passed explicitly as `root` since this script may be spawned from
// the repo root rather than react-app/ — unlike project-create-vite.mjs, which assumes its
// caller's cwd is already react-app/).
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const reactAppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root: reactAppRoot, server: { host: '127.0.0.1', port: 3198, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8198' } } } });
await server.listen();
console.log('vite up');
