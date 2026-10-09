import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveModuleStatus } from '../src/hooks/useDashboardModuleStatus';

// BACKLOG #37 (2026-09-29): loading vs failed-with-nothing vs failed-but-showing-old-data vs a
// genuine zero, for every module the Dashboard renders a "current total"/trend for.

test('loading: always "loading", regardless of any other input', () => {
    assert.equal(deriveModuleStatus(true, null, false, false, false), 'loading');
    assert.equal(deriveModuleStatus(true, 'boom', true, true, true), 'loading');
});

test('first load for a scope, not yet observed loading and not yet confirmed: "loading" even if not currently loading (the scope-switch race)', () => {
    // This is the exact race caught live while building this batch: `currentScopeId` has changed
    // but the caller has not yet seen `loading` flip true for the NEW scope (AppProviders'
    // effect hasn't run yet) — the store's loading/error/hasData still describe the OLD scope.
    assert.equal(deriveModuleStatus(false, null, true, false, false), 'loading');
    assert.equal(deriveModuleStatus(false, 'old scope error', true, false, false), 'loading');
});

test('failed, nothing usable for this scope (never confirmed, or confirmed for a DIFFERENT scope): "error-empty"', () => {
    assert.equal(deriveModuleStatus(false, 'network error', false, true, false), 'error-empty');
    // hasData is true, but it belongs to a scope we've since moved away from (not confirmedThisScope)
    // — must NOT be shown as this scope's stale data.
    assert.equal(deriveModuleStatus(false, 'network error', true, true, false), 'error-empty');
});

test('failed, but a previous successful load for THIS SAME scope is still held: "error-stale" (keep showing the data, flag it)', () => {
    assert.equal(deriveModuleStatus(false, 'network error', true, true, true), 'error-stale');
});

test('failed with confirmedThisScope=true but hasData=false: still "error-empty" (nothing to keep showing)', () => {
    assert.equal(deriveModuleStatus(false, 'network error', false, true, true), 'error-empty');
});

test('no error, sawLoadingThisScope or confirmedThisScope true: "ok" — list.length may legitimately be 0 (a real "no records")', () => {
    assert.equal(deriveModuleStatus(false, null, false, true, false), 'ok'); // real zero for a freshly-loaded scope
    assert.equal(deriveModuleStatus(false, null, true, false, true), 'ok'); // already-confirmed scope, has data
});
