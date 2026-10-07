// Runs tests-unit/*.test.ts under plain `node --test`, on any Node >= 20.
//
// Node 20 (what CI uses) cannot execute .ts files, and native type stripping
// only exists from Node 22.6 — so tests are first bundled to plain ESM with
// esbuild (already the engine vite uses), into a temp dir, then run by the
// Node that is running this script. Same command locally and in CI:
//   npm test
import { build } from 'esbuild';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const testDir = fileURLToPath(new URL('../tests-unit/', import.meta.url));
const entries = readdirSync(testDir).filter((f) => f.endsWith('.test.ts')).map((f) => join(testDir, f));
if (entries.length === 0) {
    console.error('No tests found in tests-unit/');
    process.exit(1);
}

const outDir = mkdtempSync(join(tmpdir(), 'qualitas-unit-'));
try {
    await build({
        entryPoints: entries,
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node20',
        alias: { axios: fileURLToPath(new URL('../node_modules/axios/dist/esm/axios.js', import.meta.url)) },        // the browser build of axios (what the app ships); its node build cannot be bundled to ESM
        define: { 'import.meta.env': '{}' },              // services/api.ts reads import.meta.env (Vite injects it; plain node has none)
        outdir: outDir,
        outExtension: { '.js': '.mjs' },
        logLevel: 'warning',
    });
    const compiled = readdirSync(outDir).filter((f) => f.endsWith('.mjs')).map((f) => join(outDir, f));
    const result = spawnSync(process.execPath, ['--test', ...compiled], { stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
} finally {
    rmSync(outDir, { recursive: true, force: true });
}
