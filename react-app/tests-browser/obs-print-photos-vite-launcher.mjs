// Isolated acceptance server for OBS-PRINT-PHOTOS-2026-001, on this round's own ports (8392/3392)
// — never the hub's OBS demo (8380/3380), other rounds' previews or the user's own dev ports (8198/3198).
// Own cacheDir: parallel vite servers sharing node_modules/.vite break each other.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
const server = await createServer({ cacheDir: join(tmpdir(), 'vite-obs-print-photos'),
    server: { host: '127.0.0.1', port: 3392, strictPort: true,
        proxy: { '/api': { target: 'http://127.0.0.1:8392' } } } });
await server.listen();
console.log('vite up');
