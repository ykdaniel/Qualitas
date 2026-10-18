import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * The version a record form works against (OPTIMISTIC-LOCK-2026-001, DECISIONS 存檔的樂觀鎖：row_version).
 *
 * Taken ONCE, when the form opens, from the record it shows; a save sends it, and a save that went through replaces it with
 * the version the server answered — so a form that stays open (a draft saved twice, a second write in the same save) never
 * refuses itself. It is never refreshed from the list while the form is open: a list reloaded in the background would hand
 * an old form a new version and its save would overwrite someone else's change unnoticed.
 */
export interface RecordVersion {
    /** the form opened this record (null / undefined: a new record, or one read without a version) */
    open: (rowVersion?: number | null) => void;
    /** the version to send with the next save (null: send none) */
    current: () => number | null;
    /** a save went through and the server answered this version (ignored when it carries none) */
    saved: (rowVersion?: number | null) => void;
}

export function createRecordVersion(): RecordVersion {
    let value: number | null = null;
    return {
        open: (rowVersion) => { value = typeof rowVersion === 'number' ? rowVersion : null; },
        current: () => value,
        saved: (rowVersion) => { if (typeof rowVersion === 'number') value = rowVersion; },
    };
}

/** One RecordVersion for the life of the component: the page that owns the form (it calls `open`), or a form that owns its
 * own version and passes the record's version once, as `initial`, when it mounts. */
export function useRecordVersion(initial?: number | null): RecordVersion {
    const [version] = useState(() => {
        const created = createRecordVersion();
        created.open(initial);
        return created;
    });
    return version;
}

/**
 * Which opening of a page's form is current (OPTIMISTIC-LOCK-2026-001 B2 R1 P1). `next()` starts a new one — every open,
 * and a reload before its list fetch — and its number keys the form, so each open mounts a fresh form with the version it
 * opened. A reload that comes back after the user has opened something else (`isCurrent` false) must not touch the form.
 */
export interface OpenSession {
    /** for the form's `key`: changes with every `next()` */
    key: number;
    next: () => number;
    isCurrent: (session: number) => boolean;
}

export function useOpenSession(): OpenSession {
    const counter = useRef(0);                 // read and written only in the callbacks, never while rendering
    const [key, setKey] = useState(0);
    const next = useCallback(() => {
        counter.current += 1;
        setKey(counter.current);
        return counter.current;
    }, []);
    const isCurrent = useCallback((session: number) => counter.current === session, []);
    return useMemo(() => ({ key, next, isCurrent }), [key, next, isCurrent]);
}

export type ReloadNotice = 'refusal.reloadFailed' | 'refusal.reloadGone';

/**
 * "Reload this record" after a 409 VERSION_CONFLICT (the refusal dialog has already confirmed that the form's changes are
 * discarded): close the form, reload the list, open the record again with what is saved now. If the user opened another
 * form while the list was loading, that form is left alone; a failed reload, or a record the reloaded list no longer
 * holds (deleted, or outside the page's filter), closes the form and says why.
 */
export async function reloadAndReopen(session: OpenSession, steps: {
    close: () => void;
    reload: () => Promise<unknown>;
    failed: () => boolean;
    found: () => boolean;
    reopen: () => void;
    /** the record is not shown any more: clear the page's selection (and its deep-link flag) */
    forget: () => void;
    notify: (notice: ReloadNotice) => void;
}): Promise<void> {
    steps.close();
    const mine = session.next();
    await steps.reload();
    if (!session.isCurrent(mine)) return;
    if (steps.failed() || !steps.found()) {
        const notice: ReloadNotice = steps.failed() ? 'refusal.reloadFailed' : 'refusal.reloadGone';
        steps.forget();
        steps.notify(notice);
        return;
    }
    steps.reopen();
}
