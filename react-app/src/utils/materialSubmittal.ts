/**
 * Pure helpers for the material register screens (MATERIAL-SUBMITTAL M6). No React components, no I/O — unit-tested in
 * tests-unit/materialSubmittal.test.ts.
 *
 * A write whose outcome is UNKNOWN (no response, timeout, 5xx — the server may have committed before failing) is never shown as
 * "not saved" and never re-sent automatically; only a 4xx is a definite refusal ('rejected'). After an unknown outcome the
 * register form re-reads the list; a retry carries the same request id, so the server returns the record if the first attempt
 * did create it (R2). (The submittal-workflow helpers — reconcile,
 * version summary, reply-date preview, allowed actions, board columns, reply-days input — were removed with that workflow.)
 */

import { createTable, getCoreRowModel, getFilteredRowModel, type ColumnDef, type ColumnFiltersState } from '@tanstack/react-table';

export type WriteFailure =
    | { kind: 'rejected'; status: number; detail: string | null }
    | { kind: 'unknown'; status: number | null };

interface MaybeAxiosError {
    response?: { status?: number; data?: { detail?: unknown } };
}

export function classifyWriteFailure(error: unknown): WriteFailure {
    const resp = (error as MaybeAxiosError | null)?.response;
    const status = resp?.status;
    if (status === undefined || status === null) return { kind: 'unknown', status: null };       // network error, timeout, aborted
    if (status >= 500) return { kind: 'unknown', status };                                     // may have committed before failing
    const detail = resp?.data?.detail;
    return { kind: 'rejected', status, detail: typeof detail === 'string' && detail.trim() ? detail : null };
}

// ── M6 R2: list helpers (still no React / I/O) ──────────────────────────────────────────────────────────────────────

/**
 * The rows the DataTable would show for these column-header filters — computed by the SAME table engine (TanStack) with the
 * same column definitions, so the Excel export follows exactly what the header filters do on screen, but over every record
 * fetched for the export instead of only the loaded page (review R5).
 */
export function filterRowsLikeTable<T>(rows: T[], columns: ColumnDef<T, unknown>[], columnFilters: ColumnFiltersState): T[] {
    if (columnFilters.length === 0) return rows;
    const table = createTable<T>({
        data: rows,
        columns,
        state: { columnFilters },
        onStateChange: () => {},
        renderFallbackValue: null,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
    });
    table.setOptions((prev) => ({ ...prev, state: { ...table.initialState, columnFilters } }));
    return table.getFilteredRowModel().rows.map((r) => r.original);
}

/**
 * Generation guard for a paged list (review R6). `restart()` starts a new list (filters / project / reload changed) and makes
 * every answer of an older request stale; `beginMore()` lets only ONE "load more" run at a time (null = one is running);
 * `isCurrent(g)` tells whether an answer still belongs to the list on screen.
 */
export function createListGuard() {
    let generation = 0;
    let moreRunning = false;
    return {
        restart(): number { generation += 1; moreRunning = false; return generation; },
        current(): number { return generation; },
        isCurrent(g: number): boolean { return g === generation; },
        beginMore(): number | null { if (moreRunning) return null; moreRunning = true; return generation; },
        endMore(g: number): void { if (g === generation) moreRunning = false; },
    };
}

/** Appends a page, skipping records already listed (same id) — a page boundary that moved never shows a row twice. */
export function appendUnique<T>(current: T[], page: T[], id: (row: T) => string): T[] {
    const seen = new Set(current.map(id));
    return [...current, ...page.filter((row) => !seen.has(id(row)))];
}

// ── shelf view (user's choice 2026-10-09) ──
/** shelf levels: categories in name order, "uncategorised" last; records keep the list's order inside a level */
export function shelfLevels<T extends { category?: string | null }>(rows: T[]): { category: string | null; items: T[] }[] {
    const byCategory = new Map<string | null, T[]>();
    for (const r of rows) {
        const key = r.category && r.category.trim() ? r.category.trim() : null;
        const level = byCategory.get(key);
        if (level) level.push(r); else byCategory.set(key, [r]);
    }
    return [...byCategory.entries()]
        .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
        .map(([category, items]) => ({ category, items }));
}
