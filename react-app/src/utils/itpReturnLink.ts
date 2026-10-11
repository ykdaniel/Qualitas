// Round trip ITP edit window -> Checklist -> back to the SAME ITP edit window.
//
// The ITP edit window on /itp is modal state, not part of the URL, so a plain history back
// from the Checklist page lands on the ITP list with nothing open. To return to the window the
// user came from, the link into the Checklist carries the source ITP id, and the Checklist's
// Back sends the user to /itp with a "reopen" parameter that the ITP page consumes once.
//
// "reopen" is deliberately a different parameter from the ITP page's `openId` deep link:
// a window opened via `openId` closes with navigate(-1) (back to the module that linked to it),
// which here would bounce the user straight back into the Checklist they just left.

export const RETURN_ITP_PARAM = 'returnItp';
export const REOPEN_ITP_PARAM = 'reopenItp';

/** Checklist URL opened from an ITP edit window; `itpId` omitted keeps the old link shape. */
export function checklistFromItpPath(recordsNo: string, itpId?: string | null): string {
    const params = new URLSearchParams({ openId: recordsNo, from: 'itp' });
    if (itpId) params.set(RETURN_ITP_PARAM, itpId);
    return `/checklist?${params.toString()}`;
}

/** ITP page URL that reopens the given ITP's edit window. */
export function itpReopenPath(itpId: string): string {
    const params = new URLSearchParams({ [REOPEN_ITP_PARAM]: itpId });
    return `/itp?${params.toString()}`;
}
