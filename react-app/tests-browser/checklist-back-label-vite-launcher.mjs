// Isolated acceptance server for CHECKLIST-BACK-LABEL-2026-001, on this round's own ports (8374/3374) and its own Vite
// cacheDir — never the preserved previews (3293, 3341, 3240), the user's own dev ports (8198/3198) or other rounds'
// caches. In a worktree whose node_modules is a link to the main checkout, that real path is allowed too.
import { createServer, searchForWorkspaceRoot } from 'vite';
import { realpathSync } from 'node:fs';
const server = await createServer({ cacheDir: '.vite-chkback-3374', server: { host: '127.0.0.1', port: 3374, strictPort: true,
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync('node_modules')] },
    proxy: { '/api': { target: 'http://127.0.0.1:8374' } } } });
await server.listen();
console.log('vite up');
