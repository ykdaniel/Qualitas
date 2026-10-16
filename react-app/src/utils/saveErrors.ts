/**
 * User-facing text for a failed save. Pure (the translate function is passed in) so it can be unit-tested.
 *
 * Rules: known date error codes + field names get a friendly line ("Raise date: not a real calendar date"); a plain-text
 * `detail` from the API (403 / 409 / 400 ...) is shown as written; a missing response means a network failure; 5xx never shows
 * the response body (it can carry a validation dump); anything unrecognised falls back to a generic line.
 */
import { isAxiosError } from './errorUtils';
import { issueMessageKey } from './dateIssues';
import type { SaveOutcome } from './saveFlow';

export type Translate = (key: string, params?: Record<string, string | number>) => string;

const translated = (t: Translate, key: string): string | null => {
    const v = t(key);
    return v && v !== key ? v : null;
};

const fieldLabel = (t: Translate, field: string): string => translated(t, `dateField.${field}`) ?? field;

/** One line per field of a FastAPI 422 list: "Raise date: not a real calendar date" (de-duplicated). */
export function fieldErrorLines(detail: unknown[], t: Translate): string[] {
    const lines = detail.map((e) => {
        const item = (e ?? {}) as { msg?: string; loc?: unknown[]; code?: string };
        const field = Array.isArray(item.loc) && item.loc.length > 0 ? String(item.loc[item.loc.length - 1]) : '';
        if (item.code && field) return `${fieldLabel(t, field)}：${t(issueMessageKey(item.code))}`;
        if (field && item.msg) return `${fieldLabel(t, field)}：${item.msg}`;
        return item.msg || '';
    }).filter(Boolean);
    return [...new Set(lines)];
}

export function describeSaveError(error: unknown, t: Translate): string {
    const fallback = t('common.saveFailed');
    if (!isAxiosError(error)) return fallback;

    const status = error.response?.status;
    if (status === undefined) return t('saveFlow.network');
    if (status >= 500) return t('saveFlow.server', { status });

    const detail: unknown = error.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;

    if (Array.isArray(detail)) {
        const unique = fieldErrorLines(detail, t);
        if (unique.length > 0) return unique.join('；');
    }

    if (status === 403) return t('saveFlow.forbidden');
    if (status === 409) return t('saveFlow.conflict');
    return fallback;
}

export interface OutcomeNotice {
    /** whether the modal may close */
    close: boolean;
    /** toast to show (absent for clean success, banner-owned file failures and refusals) */
    notice?: { level: 'error' | 'warning'; text: string };
    /** the record was not saved: show this error in the refusal dialog (REFUSAL-DIALOG-2026-002), the modal keeps everything */
    refusal?: { error: unknown };
}

/** Turns a SaveOutcome into "close or stay" plus an optional toast or refusal; incomplete file work is explained in the banner. */
export function presentOutcome(outcome: SaveOutcome, t: Translate): OutcomeNotice {
    switch (outcome.status) {
        case 'saved':
            return { close: true };
        case 'saved-reload-failed':
            return { close: true, notice: { level: 'warning', text: t('saveFlow.savedReloadFailed') } };
        // The persistent SaveFollowUpBanner owns this message and the retry action.
        case 'saved-incomplete':
            return { close: false };
        case 'failed':
            return { close: false, refusal: { error: outcome.error } };
    }
}
