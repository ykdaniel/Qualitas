// Shared isolation-target verification for every forms-leave-guard-review*.mjs script.
//
// FORMS-2026-002's version only checked the `state.root` STRING for a "qualitas-manual-"
// substring and excluded three known ports — both are just trusting whatever fields happen
// to be in the JSON the caller passed as argv[2]. That JSON could be stale, hand-edited, or
// simply wrong; nothing forced it to actually correspond to a live, tool-created stack.
//
// This version instead cross-checks the handed-in state against isolated_stack.py's OWN
// on-disk records for that root (see scripts/verification/isolated_stack.py: MARKER =
// ".qualitas-isolated-run", STATE = "stack-state.json") — the same files that tool itself
// validates before it will act on a root. A script only proceeds once:
//   1. the ports are not 8198/3198/5173 (the user's trial env / everyday dev server),
//   2. `${root}/.qualitas-isolated-run` exists and is a valid marker for this exact tool,
//   3. `${root}/stack-state.json` exists, matches that marker's run_id and this root, and
//      lists processes,
//   4. every PID that stack-state.json claims is running actually IS running right now
//      (process.kill(pid, 0) — signal 0 checks liveness without sending a real signal), and
//   5. the ports in the state the caller handed us (argv[2]) match the ports the on-disk
//      stack-state.json itself records — the caller's JSON cannot silently disagree with
//      what the tool actually wrote.
// FORMS-2026-003's version stopped at "the pid is alive" — that is not the same as "the pid is
// actually the isolated backend/vite listening on the claimed port", and it never looked at the
// DB file at all. The FORMS-2026-003 REVIEW (archived at
// docs/workflow/FORMS-2026-003-archive.md) demonstrated this directly: its selftest's own
// "positive control" just wrote two JSON files with the test runner's OWN pid in them — no DB,
// no real server — and verifyIsolatedTarget() still accepted it.
//
// This version (FORMS-2026-004) adds two more checks against isolated_stack.py's own records
// (see scripts/verification/isolated_stack.py's `_up`: `state["db"] = str(root / "stack.db")`):
//   6. `diskState.db` must exist on disk, must sit inside `state.root`, and must be a file (not
//      a directory or a dangling path) — the DB the caller claims to be using must actually be
//      the isolated stack's own DB file, not merely a string that happens to be present in JSON.
//   7. For each named process with a port (`backend_port`/`vite_port`), the PID that is actually
//      LISTENING on that port (via `lsof -nP -iTCP:<port> -sTCP:LISTEN -t`) must match the PID
//      stack-state.json recorded for that process — being alive is not enough; it must be the
//      thing bound to the claimed port right now.
// Any failure throws and refuses to proceed; there is no fallback that lets a script run
// anyway. verifyIsolatedTarget() is used only against this batch's own self-created stacks —
// see forms-leave-guard-review-isolation-guard-selftest.mjs for the negative-path proof, which
// only ever constructs fake/broken targets of its own, never the user's 8198/3198 or dev 5173.

import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Isolated so a test can substitute a fake lsof lookup without touching the real process table.
export function _listeningPid(port) {
    try {
        const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).trim();
        if (!out) return null;
        const pid = parseInt(out.split('\n')[0], 10);
        return Number.isFinite(pid) ? pid : null;
    } catch {
        return null; // lsof exits non-zero when nothing is listening — that is a valid "no one" answer, not a tool error
    }
}

const FORBIDDEN_PORTS = new Set([8198, 3198, 5173]);

export function verifyIsolatedTarget(state, deps = {}) {
    const listeningPid = deps.listeningPid || _listeningPid;
    if (!state || typeof state !== 'object') {
        throw new Error('Refusing: no state object given.');
    }
    if (FORBIDDEN_PORTS.has(state.backend_port) || FORBIDDEN_PORTS.has(state.vite_port)) {
        throw new Error(`Refusing to run against port ${state.backend_port}/${state.vite_port} — looks like the user's own environment, not a self-created isolated stack.`);
    }
    if (!state.root || typeof state.root !== 'string') {
        throw new Error('Refusing: state.root is missing or not a string.');
    }

    const markerPath = path.join(state.root, '.qualitas-isolated-run');
    const statePath = path.join(state.root, 'stack-state.json');

    if (!existsSync(markerPath)) {
        throw new Error(`Refusing: no isolated_stack.py marker at "${markerPath}" — this root was not created by that tool (or no longer exists).`);
    }
    if (!existsSync(statePath)) {
        throw new Error(`Refusing: no stack-state.json at "${statePath}".`);
    }

    let marker, diskState;
    try {
        marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    } catch {
        throw new Error(`Refusing: "${markerPath}" is not valid JSON.`);
    }
    try {
        diskState = JSON.parse(readFileSync(statePath, 'utf8'));
    } catch {
        throw new Error(`Refusing: "${statePath}" is not valid JSON.`);
    }

    if (marker.tool !== 'isolated_stack' || typeof marker.run_id !== 'string' || marker.run_id.length !== 32) {
        throw new Error('Refusing: marker file does not match the isolated_stack.py schema (wrong tool or malformed run_id).');
    }
    if (diskState.run_id !== marker.run_id || diskState.root !== state.root) {
        throw new Error('Refusing: stack-state.json does not match this root/run_id — possibly stale or from a different run.');
    }
    if (!diskState.processes || typeof diskState.processes !== 'object' || Object.keys(diskState.processes).length === 0) {
        throw new Error('Refusing: stack-state.json lists no processes.');
    }
    for (const [name, rec] of Object.entries(diskState.processes)) {
        const pid = rec && typeof rec === 'object' ? rec.pid : undefined;
        if (typeof pid !== 'number') {
            throw new Error(`Refusing: stack-state.json's "${name}" entry has no numeric pid.`);
        }
        try {
            process.kill(pid, 0); // throws if the process is not actually running
        } catch {
            throw new Error(`Refusing: process "${name}" (pid ${pid}) recorded in stack-state.json is not actually running right now — stale or fabricated state.`);
        }
    }
    if (state.backend_port !== diskState.backend_port || state.vite_port !== diskState.vite_port) {
        throw new Error('Refusing: ports in the supplied stack.json do not match the on-disk stack-state.json for this root.');
    }

    // R5 (FORMS-2026-004): the DB file itself must exist, and must actually live inside this root.
    if (!diskState.db || typeof diskState.db !== 'string') {
        throw new Error('Refusing: stack-state.json has no db path recorded.');
    }
    const resolvedDb = path.resolve(diskState.db);
    const resolvedRoot = path.resolve(state.root);
    if (!resolvedDb.startsWith(resolvedRoot + path.sep) && resolvedDb !== resolvedRoot) {
        throw new Error(`Refusing: recorded db path "${diskState.db}" is not inside this root "${state.root}".`);
    }
    let dbStat;
    try {
        dbStat = statSync(resolvedDb);
    } catch {
        throw new Error(`Refusing: db file "${diskState.db}" does not exist on disk — stale or fabricated state.`);
    }
    if (!dbStat.isFile()) {
        throw new Error(`Refusing: db path "${diskState.db}" exists but is not a regular file.`);
    }

    // R5 (FORMS-2026-004): a recorded PID being alive is not enough — it must actually be the
    // thing listening on the port this run claims, not merely some unrelated live process whose
    // PID happens to match a stale/fabricated record.
    for (const portName of ['backend_port', 'vite_port']) {
        const port = diskState[portName];
        if (port == null) continue; // vite_port is legitimately null when no vite script was given
        const procName = portName === 'backend_port' ? 'backend' : 'vite';
        const rec = diskState.processes[procName];
        if (!rec) {
            throw new Error(`Refusing: stack-state.json has a ${portName} but no matching "${procName}" process entry.`);
        }
        const actualPid = listeningPid(port);
        if (actualPid == null) {
            throw new Error(`Refusing: nothing is currently listening on port ${port} (expected the isolated ${procName}) — stale state.`);
        }
        if (actualPid !== rec.pid) {
            throw new Error(`Refusing: port ${port} is listening under pid ${actualPid}, not the recorded ${procName} pid ${rec.pid} — this port now belongs to something else.`);
        }
    }

    return true;
}
