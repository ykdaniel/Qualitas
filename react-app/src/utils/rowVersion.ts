/**
 * Optimistic lock (OPTIMISTIC-LOCK-2026-001, DECISIONS 存檔的樂觀鎖：row_version).
 *
 * Every editable record is read with its `row_version`. A save that sends the version it was read at is refused with
 * 409 VERSION_CONFLICT when someone else saved first. A save without one is accepted and logged by the server while its
 * setting ROW_VERSION_REQUIRED is off, and refused with 400 VERSION_REQUIRED ("refresh the page") once it is on (B5) —
 * every form sends the version it was opened with.
 *
 * The version is sent ONLY when the caller passes it explicitly. A form that resends its whole record would otherwise
 * also resend the version it was opened with — stale after its own first save — so any `row_version` inside the payload
 * is dropped here and replaced by the explicit one.
 */
export interface RowVersioned {
    /** The record's optimistic-lock version, as last read from the server. */
    row_version?: number | null;
}

/** `payload` without any row_version of its own, plus `rowVersion` when the caller gives one. */
export function withRowVersion<T extends object>(payload: T, rowVersion?: number | null): Omit<T, 'row_version'> & RowVersioned {
    const rest = { ...payload } as Record<string, unknown>;
    delete rest.row_version;
    if (typeof rowVersion === 'number') rest.row_version = rowVersion;
    return rest as Omit<T, 'row_version'> & RowVersioned;
}

/** Query parameters for a save whose body is not an object (FAT details) or that has no body (ITR create-NCR). */
export function rowVersionParams(rowVersion?: number | null): { row_version: number } | undefined {
    return typeof rowVersion === 'number' ? { row_version: rowVersion } : undefined;
}
