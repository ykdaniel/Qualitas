// Negative-path proof for verifyIsolatedTarget() (R4/R5/R6): every case here constructs its OWN
// throwaway fake target under $TMPDIR — never the user's 8198/3198, never dev 5173, never any
// directory isolated_stack.py actually manages. Confirms the guard genuinely refuses before any
// script would act, rather than asserting that by inspection alone.
//
// FORMS-2026-004 adds cases 9-11 (DB missing, DB outside root, live-but-unrelated pid) because the
// FORMS-2026-003 REVIEW found that the previous positive control proved nothing about the DB or
// about port ownership — it only ever supplied a bare pid, never a db file or a real port check.
// Every fixture below now also supplies a `db` file inside its own root, and every call passes a
// `listeningPid` stub via `deps` instead of touching real OS ports — the ports 8200/3200 used in
// these fixtures are NOT necessarily listening on this machine while this script runs, so the
// stub is what keeps the test deterministic and still strictly offline/self-contained.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';

let checks = 0;
const log = (...a) => console.log(new Date().toISOString(), ...a);
const expectRefusal = (fn, label) => {
    try {
        fn();
        throw new Error(`FAILED: ${label} — expected a refusal (throw), but it did not throw`);
    } catch (e) {
        if (e.message.startsWith('FAILED:')) throw e;
        if (!/^Refusing/.test(e.message)) throw new Error(`FAILED: ${label} — threw, but not a "Refusing:" guard error: ${e.message}`);
        checks++;
        log('PASS', label, '->', e.message);
    }
};
const expectPass = (fn, label) => {
    fn();
    checks++;
    log('PASS', label);
};

// A stub that says "the backend's own recorded pid is listening on the backend port, and the
// vite's own recorded pid is listening on the vite port" — i.e. a fully honest world. Individual
// negative tests override this to lie about one port.
const honestListeningPid = (state) => (port) => {
    if (port === state.backend_port) return state.processes.backend?.pid ?? null;
    if (port === state.vite_port) return state.processes.vite?.pid ?? null;
    return null;
};

function makeConsistentFixture(label, { withDb = true } = {}) {
    const root = mkdtempSync(path.join(tmpdir(), `forms-guard-selftest-${label}-`));
    const runId = Buffer.from(label.padEnd(16, 'x')).toString('hex').slice(0, 32);
    writeFileSync(path.join(root, '.qualitas-isolated-run'), JSON.stringify({ tool: 'isolated_stack', run_id: runId }));
    const dbPath = path.join(root, 'stack.db');
    if (withDb) writeFileSync(dbPath, 'not a real sqlite file, just needs to exist for this test');
    const state = {
        run_id: runId, root, db: withDb ? dbPath : undefined,
        processes: { backend: { pid: process.pid }, vite: { pid: process.pid } }, backend_port: 8200, vite_port: 3200,
    };
    writeFileSync(path.join(root, 'stack-state.json'), JSON.stringify(state));
    return { root, state };
}

// 1. Forbidden port, otherwise well-formed.
expectRefusal(() => verifyIsolatedTarget({ root: '/tmp/whatever', backend_port: 8198, vite_port: 3198 }), 'rejects the user\'s own 8198/3198 ports');
expectRefusal(() => verifyIsolatedTarget({ root: '/tmp/whatever', backend_port: 8200, vite_port: 5173 }), 'rejects the everyday dev 5173 port');

// 2. No root at all.
expectRefusal(() => verifyIsolatedTarget({ backend_port: 8200, vite_port: 3200 }), 'rejects a missing root');

// 3. A root that exists but was never created by isolated_stack.py (no marker file).
const fakeRoot1 = mkdtempSync(path.join(tmpdir(), 'forms-guard-selftest-nomark-'));
expectRefusal(() => verifyIsolatedTarget({ root: fakeRoot1, backend_port: 8200, vite_port: 3200 }), 'rejects a root with no .qualitas-isolated-run marker');
rmSync(fakeRoot1, { recursive: true, force: true });

// 4. A root with a marker but no stack-state.json.
const fakeRoot2 = mkdtempSync(path.join(tmpdir(), 'forms-guard-selftest-nostate-'));
writeFileSync(path.join(fakeRoot2, '.qualitas-isolated-run'), JSON.stringify({ tool: 'isolated_stack', run_id: 'a'.repeat(32) }));
expectRefusal(() => verifyIsolatedTarget({ root: fakeRoot2, backend_port: 8200, vite_port: 3200 }), 'rejects a root with a marker but no stack-state.json');
rmSync(fakeRoot2, { recursive: true, force: true });

// 5. Marker + state present, but state's run_id does not match the marker's (fabricated/stale).
const fakeRoot3 = mkdtempSync(path.join(tmpdir(), 'forms-guard-selftest-mismatch-'));
writeFileSync(path.join(fakeRoot3, '.qualitas-isolated-run'), JSON.stringify({ tool: 'isolated_stack', run_id: 'a'.repeat(32) }));
writeFileSync(path.join(fakeRoot3, 'stack-state.json'), JSON.stringify({ run_id: 'b'.repeat(32), root: fakeRoot3, processes: { backend: { pid: process.pid } }, backend_port: 8200, vite_port: 3200 }));
expectRefusal(() => verifyIsolatedTarget({ root: fakeRoot3, backend_port: 8200, vite_port: 3200 }), 'rejects a stack-state.json whose run_id does not match the marker');
rmSync(fakeRoot3, { recursive: true, force: true });

// 6. Consistent marker/state, but the recorded pid is not actually running.
const fakeRoot4 = mkdtempSync(path.join(tmpdir(), 'forms-guard-selftest-deadpid-'));
const runId4 = 'c'.repeat(32);
writeFileSync(path.join(fakeRoot4, '.qualitas-isolated-run'), JSON.stringify({ tool: 'isolated_stack', run_id: runId4 }));
// A pid astronomically unlikely to be alive (well past any real process table size).
writeFileSync(path.join(fakeRoot4, 'stack-state.json'), JSON.stringify({ run_id: runId4, root: fakeRoot4, processes: { backend: { pid: 4194300 } }, backend_port: 8200, vite_port: 3200 }));
expectRefusal(() => verifyIsolatedTarget({ root: fakeRoot4, backend_port: 8200, vite_port: 3200 }), 'rejects a recorded pid that is not actually alive');
rmSync(fakeRoot4, { recursive: true, force: true });

// 7. Consistent marker/state/live-pid, but the CALLER's JSON disagrees with the on-disk ports.
const fakeRoot5 = mkdtempSync(path.join(tmpdir(), 'forms-guard-selftest-portmismatch-'));
const runId5 = 'd'.repeat(32);
writeFileSync(path.join(fakeRoot5, '.qualitas-isolated-run'), JSON.stringify({ tool: 'isolated_stack', run_id: runId5 }));
writeFileSync(path.join(fakeRoot5, 'stack-state.json'), JSON.stringify({ run_id: runId5, root: fakeRoot5, processes: { backend: { pid: process.pid } }, backend_port: 8200, vite_port: 3200 }));
expectRefusal(() => verifyIsolatedTarget({ root: fakeRoot5, backend_port: 9999, vite_port: 3200 }), 'rejects when the caller-supplied port disagrees with on-disk stack-state.json');
rmSync(fakeRoot5, { recursive: true, force: true });

// 8. Positive control: a fully consistent, self-created fake target (marker + state + a real db
// file + an honest listeningPid stub) must PASS — otherwise the guard would just be refusing
// everything, which is not a real check.
{
    const { root, state } = makeConsistentFixture('ok');
    expectPass(() => verifyIsolatedTarget({ root, backend_port: 8200, vite_port: 3200 }, { listeningPid: honestListeningPid(state) }),
        'accepts a fully consistent, self-created target with a real db file and honest port ownership (positive control)');
    rmSync(root, { recursive: true, force: true });
}

// 9. (R5) Marker/state/pid all consistent, but no db file was ever written — a fabricated or
// stale state.json claiming a db that was never created (or was deleted) must be refused.
{
    const { root, state } = makeConsistentFixture('nodb', { withDb: false });
    // Overwrite state.json to still claim a db path, even though the file was never written.
    const fakeDbPath = path.join(root, 'stack.db');
    writeFileSync(path.join(root, 'stack-state.json'), JSON.stringify({ ...state, db: fakeDbPath }));
    expectRefusal(() => verifyIsolatedTarget({ root, backend_port: 8200, vite_port: 3200 }, { listeningPid: () => process.pid }),
        'rejects a stack-state.json claiming a db file that does not actually exist on disk');
    rmSync(root, { recursive: true, force: true });
}

// 10. (R5) db path exists but points OUTSIDE this root (e.g. a stale record from a different,
// possibly shared/real, directory) — must be refused even though the file itself is real.
{
    const { root, state } = makeConsistentFixture('dboutside');
    const outsideDb = mkdtempSync(path.join(tmpdir(), 'forms-guard-selftest-outsidedb-'));
    const outsideDbFile = path.join(outsideDb, 'stack.db');
    writeFileSync(outsideDbFile, 'a real file, just not inside this root');
    writeFileSync(path.join(root, 'stack-state.json'), JSON.stringify({ ...state, db: outsideDbFile }));
    expectRefusal(() => verifyIsolatedTarget({ root, backend_port: 8200, vite_port: 3200 }, { listeningPid: honestListeningPid(state) }),
        'rejects a db path that resolves outside the claimed root');
    rmSync(root, { recursive: true, force: true });
    rmSync(outsideDb, { recursive: true, force: true });
}

// 11. (R5) This is the exact gap the FORMS-2026-003 REVIEW called out: a live, consistent pid is
// NOT the same as that pid actually listening on the claimed port. Here the recorded backend pid
// is alive (it is this very test process) and the db file is real, but nothing is listening on
// the claimed backend port — the previous guard would have passed this; it must now be refused.
{
    const { root, state } = makeConsistentFixture('deadport');
    expectRefusal(() => verifyIsolatedTarget({ root, backend_port: 8200, vite_port: 3200 }, { listeningPid: () => null }),
        'rejects when nothing is actually listening on the claimed backend port, even with a live pid');
    rmSync(root, { recursive: true, force: true });
}

// 12. (R5) Same shape as #11, but something IS listening on the port — just not the pid that
// stack-state.json recorded. This proves ownership is checked, not just presence.
{
    const { root, state } = makeConsistentFixture('wrongowner');
    const unrelatedPid = process.pid === 1 ? 2 : 1; // guaranteed to differ from process.pid
    expectRefusal(() => verifyIsolatedTarget({ root, backend_port: 8200, vite_port: 3200 }, { listeningPid: () => unrelatedPid }),
        'rejects when the port is listening under an unrelated pid, not the one stack-state.json recorded');
    rmSync(root, { recursive: true, force: true });
}

log(`===== ISOLATION GUARD SELFTEST DONE: ${checks} checks passed =====`);
