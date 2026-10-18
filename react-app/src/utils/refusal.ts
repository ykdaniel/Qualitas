/**
 * What the refusal dialog says about a failed or refused delete / save (REFUSAL-DIALOG-2026-001).
 * Pure (the translate function and language are passed in) so it can be unit-tested.
 *
 * Rules:
 * - the backend's coded refusal (`{detail, code, params}`, backend/core/refusals.py) is translated from `refusal.code.<CODE>`;
 * - a refusal without a code: the Chinese UI shows a short Chinese line plus the server's English text, the English UI that text;
 * - 404 always gets the "no longer exists" line; 422 field errors are listed one per line (describeSaveError's field labels); 403 / 409 without a usable text get a generic line;
 * - 5xx and network failures are "failed" (not "refused"): a generic line, never the response body;
 * - 401 returns null: the API client is already logging the user out;
 * - a failed save whose form stayed open (`keepsInput`, REFUSAL-DIALOG-2026-002 D3) adds a line saying the input is kept: for a refusal
 *   "correct it and save again" (a locked record: only "kept"; a 404 or a version conflict: no line), for a 5xx / network failure
 *   "could not confirm whether it was saved" (the server may have stored it).
 */
import { isAxiosError } from './errorUtils';
import { fieldErrorLines, type Translate } from './saveErrors';

export type RefusalAction = 'delete' | 'save';

export interface RefusalOptions {
    /** the form the user was filling in is still open with everything they typed (failed saves only) */
    keepsInput?: boolean;
    /** OPTIMISTIC-LOCK-2026-001: how to reopen the record with its latest content. With a VERSION_CONFLICT the dialog then
     *  offers "Reload this record" (after confirming that the changes in the form are discarded). */
    onReload?: () => void;
    /** false when nothing typed is lost by reloading (a list row's action): the reload then needs no confirmation. Default true. */
    reloadDiscardsInput?: boolean;
}

export interface RefusalView {
    title: string;
    message: string;
    /** bullet lines under the message (e.g. the documents that still cite the record) */
    items?: string[];
    /** the server's own text, shown under the message when there is no translation for it */
    original?: string;
    /** the last line: what happened to the user's input (a failed save with `keepsInput`) */
    note?: string;
}

type Params = Record<string, unknown>;

const translated = (t: Translate, key: string, params?: Record<string, string | number>): string | null => {
    const v = t(key, params);
    return v && v !== key ? v : null;
};

export const docTypeLabel = (t: Translate, docType: unknown): string => {
    const raw = String(docType ?? '');
    return translated(t, `refusal.docType.${raw.toLowerCase().replace(/[^a-z]/g, '')}`) ?? raw;
};

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

/** The variant key for codes whose wording depends on a parameter. */
function variantOf(code: string, params: Params): string {
    if (code === 'DELETE_NOT_VOID' && asList(params.allowed).includes('Draft')) return `${code}.draft`;
    if (code === 'ATTACHMENT_LOCKED' && typeof params.kind === 'string') return `${code}.${params.kind}`;
    // REFUSAL-DIALOG-2026-002: which scope rule refused, and what kind of lock (a whole locked record is the plain code)
    if (code === 'SCOPE_FORBIDDEN' && typeof params.reason === 'string') return `${code}.${params.reason}`;
    if (code === 'RECORD_LOCKED' && typeof params.kind === 'string' && params.kind !== 'record') return `${code}.${params.kind}`;
    // REFUSAL-DIALOG-2026-003: which account field clashed; why an NCR cannot be closed yet
    if (code === 'DUPLICATE_NAME' && typeof params.field === 'string') return `${code}.${params.field}`;
    if (code === 'NCR_CLOSE_MISSING_FIELDS' && typeof params.reason === 'string' && params.reason !== 'none') return `${code}.${params.reason}`;
    // AnyPermissionChecker: any ONE of the listed permissions would do
    if (code === 'PERMISSION_DENIED' && asList(params.permissions).length > 1) return `${code}.anyOf`;
    return code;
}

/** Flattens the refusal params into the strings the translation placeholders take. */
function flatParams(t: Translate, params: Params): Record<string, string | number> {
    const sep = t('refusal.listSep');
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(params)) {
        if (k === 'references') continue;
        if (k === 'docType') out[k] = docTypeLabel(t, v);
        else if (Array.isArray(v)) out[k] = v.map((x) => String(x)).join(sep);
        else if (typeof v === 'number' || (typeof v === 'string' && v.trim())) out[k] = v;
        else if (v == null || v === '') out[k] = '—';                    // a legacy record without a number: never leave "{number}"
        else out[k] = String(v);
    }
    // ITR_DELETE_SOURCE_CITED: the citing records the caller may not see are counted, never named
    const hidden = Number(params.hiddenCount ?? 0);
    if (hidden > 0) {
        out.refs = [...asList(params.refs), t('refusal.hiddenRecords', { count: hidden })].join(sep);
    }
    return out;
}

function referenceItems(t: Translate, params: Params): string[] | undefined {
    if (!Array.isArray(params.references)) return undefined;
    const items = (params.references as Array<{ type?: unknown; count?: unknown }>).map((r) =>
        t('refusal.refItem', { count: Number(r?.count ?? 0), type: docTypeLabel(t, r?.type) }));
    return items.length > 0 ? items : undefined;
}

/** A coded refusal known before any request fails (e.g. NOI's delete-check); null when the code has no translation. */
export function describeCoded(code: string, rawParams: unknown, t: Translate, action: RefusalAction): RefusalView | null {
    const params: Params = rawParams && typeof rawParams === 'object' ? (rawParams as Params) : {};
    const flat = flatParams(t, params);
    const message = translated(t, `refusal.code.${variantOf(code, params)}`, flat) ?? translated(t, `refusal.code.${code}`, flat);
    if (!message) return null;
    return { title: t(action === 'delete' ? 'refusal.title.delete' : 'refusal.title.save'), message, items: referenceItems(t, params) };
}

/** 5xx, network or a non-HTTP error: the request may or may not have been carried out ("failed", not "refused"). */
const isFailure = (error: unknown): boolean => {
    if (!isAxiosError(error)) return true;
    const status = error.response?.status;
    return status === undefined || status >= 500;
};

const codeOf = (error: unknown): unknown => (isAxiosError(error) ? (error.response?.data as { code?: unknown } | undefined)?.code : undefined);

/** Someone else saved the record first (409 VERSION_CONFLICT, OPTIMISTIC-LOCK-2026-001). */
export const isVersionConflict = (error: unknown): boolean => codeOf(error) === 'VERSION_CONFLICT';

/** Locks: the record (or its results) cannot take the change at all — the note says the input is kept, but not "correct it and save
 *  again" (user's choice 2026-10-14; Checklist results locked counts as a lock, REFUSAL-DIALOG-2026-003). */
const LOCK_CODES = new Set(['RECORD_LOCKED', 'CHECKLIST_RESULTS_LOCKED']);

/** "Correct it and save again" would be wrong advice: the record is gone (404), or it changed meanwhile (VERSION_CONFLICT, which
 *  says to reload first) — saving the kept input again cannot succeed, so no note (review R1 P2). */
const correctable = (error: unknown): boolean => {
    if (!isAxiosError(error)) return true;
    if (error.response?.status === 404) return false;
    return codeOf(error) !== 'VERSION_CONFLICT';
};

export function describeRefusal(error: unknown, t: Translate, action: RefusalAction, language: 'en' | 'zh', options: RefusalOptions = {}): RefusalView | null {
    const view = refusalView(error, t, action, language);
    if (!view || action !== 'save' || !options.keepsInput || !correctable(error)) return view;
    if (isFailure(error)) return { ...view, note: t('refusal.keptInputUnconfirmed') };
    return { ...view, note: t(LOCK_CODES.has(String(codeOf(error))) ? 'refusal.keptInputOnly' : 'refusal.keptInput') };
}

function refusalView(error: unknown, t: Translate, action: RefusalAction, language: 'en' | 'zh'): RefusalView | null {
    const refusedTitle = t(action === 'delete' ? 'refusal.title.delete' : 'refusal.title.save');
    const failedTitle = t(action === 'delete' ? 'refusal.title.deleteFailed' : 'refusal.title.saveFailed');

    if (!isAxiosError(error)) return { title: failedTitle, message: t('refusal.unexpected') };

    const status = error.response?.status;
    if (status === undefined) return { title: failedTitle, message: t('refusal.network') };
    if (status === 401) return null;
    if (status >= 500) return { title: failedTitle, message: t('refusal.server', { status }) };

    const data = (error.response?.data ?? {}) as { detail?: unknown; code?: unknown; params?: unknown };
    const detail = typeof data.detail === 'string' ? data.detail.trim() : '';

    if (typeof data.code === 'string' && data.code) {
        const coded = describeCoded(data.code, data.params, t, action);
        if (coded) return coded;
    }

    // the record is gone (deleted elsewhere, or no longer in this account's scope): the server's "X not found" adds nothing
    if (status === 404) return { title: refusedTitle, message: t('refusal.notFound') };
    if (Array.isArray(data.detail)) {
        const items = fieldErrorLines(data.detail, t);
        return items.length > 0
            ? { title: refusedTitle, message: t('refusal.fieldErrors'), items }
            : { title: refusedTitle, message: t('refusal.unexpected') };
    }

    if (detail) {
        return language === 'zh'
            ? { title: refusedTitle, message: t('refusal.uncoded'), original: detail }
            : { title: refusedTitle, message: detail };
    }

    if (status === 403) return { title: refusedTitle, message: t('refusal.forbidden') };
    if (status === 409) return { title: refusedTitle, message: t('refusal.conflict') };
    return { title: refusedTitle, message: t('refusal.unexpected') };
}
