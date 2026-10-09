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

export function describeSaveError(error: unknown, t: Translate): string {
    const fallback = t('common.saveFailed');
    if (!isAxiosError(error)) return fallback;

    const status = error.response?.status;
    if (status === undefined) return t('saveFlow.network');
    if (status >= 500) return t('saveFlow.server', { status });

    const detail: unknown = error.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;

    if (Array.isArray(detail)) {
        const lines = detail.map((e: { msg?: string; loc?: unknown[]; code?: string }) => {
            const field = Array.isArray(e?.loc) && e.loc.length > 0 ? String(e.loc[e.loc.length - 1]) : '';
            if (e?.code && field) return `${fieldLabel(t, field)}：${t(issueMessageKey(e.code))}`;
            if (field && e?.msg) return `${fieldLabel(t, field)}：${e.msg}`;
            return e?.msg || '';
        }).filter(Boolean);
        const unique = [...new Set(lines)];
        if (unique.length > 0) return unique.join('；');
    }

    if (status === 403) return t('saveFlow.forbidden');
    if (status === 409) return t('saveFlow.conflict');
    return fallback;
}

export interface OutcomeNotice {
    /** whether the modal may close */
    close: boolean;
    /** toast to show (absent for clean success and banner-owned file failures) */
    notice?: { level: 'error' | 'warning'; text: string };
}

/** Turns a SaveOutcome into "close or stay" plus an optional toast; incomplete file work is explained in the banner. */
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
            return { close: false, notice: { level: 'error', text: t('saveFlow.failedKeep', { message: outcome.message }) } };
    }
}
