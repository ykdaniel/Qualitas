// ITP inspection-item required fields (DECISIONS.md, 2026-10-07): Activity and Standard each need English OR Chinese
// filled in — the other language is optional. Judged after trim(), so whitespace-only text does not count.

export type BilingualValue = { en?: string | null; ch?: string | null } | string | null | undefined;

export const hasEitherLanguage = (value: BilingualValue): boolean => {
    if (typeof value === 'string') return value.trim() !== '';
    if (!value) return false;
    return (value.en ?? '').trim() !== '' || (value.ch ?? '').trim() !== '';
};

// Display / Generate-Checklist text (ITP-LANG-FALLBACK-2026-001): English first; Chinese only when English is blank after trim().
// trim() only decides whether a language has content — the ORIGINAL string is returned, nothing is translated or copied back.
// With no content in either language the English value is returned unchanged, so existing output stays as it was.
export const preferEnglishText = (value: BilingualValue): string => {
    if (typeof value === 'string') return value;
    if (!value) return '';
    const en = value.en ?? '';
    if (en.trim() !== '') return en;
    const ch = value.ch ?? '';
    if (ch.trim() !== '') return ch;
    return en;
};

export type RequiredItemField = 'activity' | 'standard';

export const missingRequiredItemFields = (item: { activity?: BilingualValue; standard?: BilingualValue }): RequiredItemField[] => {
    const missing: RequiredItemField[] = [];
    if (!hasEitherLanguage(item.activity)) missing.push('activity');
    if (!hasEitherLanguage(item.standard)) missing.push('standard');
    return missing;
};
