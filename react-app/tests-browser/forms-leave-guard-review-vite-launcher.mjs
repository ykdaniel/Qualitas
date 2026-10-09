// Isolated-stack vite launcher for FORMS-2026-001/002 reruns.
// tests-browser/project-create-vite.mjs is hardcoded to 8198/3198 (the user's own
// trial environment) so it cannot be reused here — this proxies /api to whatever
// backend port isolated_stack.py assigned instead.
//
// Usage: python scripts/verification/isolated_stack.py up --port <p> --vite-port <v> \
//   --vite-script react-app/tests-browser/forms-leave-guard-review-vite-launcher.mjs
// Reads QUALITAS_BACKEND_PORT / QUALITAS_VITE_PORT from the environment (default
// 8200/3200, this batch's convention) — set both if isolated_stack.py is given
// different --port/--vite-port values, so the proxy target actually matches.
import { createServer } from 'vite';
const vitePort = Number(process.env.QUALITAS_VITE_PORT || 3200);
const backendPort = Number(process.env.QUALITAS_BACKEND_PORT || 8200);
const server = await createServer({
  server: {
    host: '127.0.0.1',
    port: vitePort,
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${backendPort}` } },
  },
});
await server.listen();
console.log(`vite up on ${vitePort}, proxying /api -> ${backendPort}`);
