import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { dateCell, fieldIssues, issueMessageKey, issuesOf } from '../../utils/dateIssues';

/** A table cell for a stored date: the value exactly as stored; a warning mark (with the reason) when the API reported an issue. */
export const DateCell: React.FC<{ item: unknown; field: string; format?: (raw: string) => string }> = ({ item, field, format }) => {
    const { t } = useLanguage();
    const { text, warn } = dateCell(item, field, format);
    if (!warn) return <>{text}</>;
    const reason = fieldIssues(item, field).map(i => t(issueMessageKey(i.code))).join('；');
    return (
        <span data-date-issue={field} title={reason} style={{ color: '#b45309', fontWeight: 600, whiteSpace: 'nowrap' }}>
            <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: '-1px' }} aria-hidden="true" />
            {text}
        </span>
    );
};

/**
 * Shown at the top of an edit form when the record being edited has stored dates a new write would not accept. It lists the ORIGINAL
 * values and says what happens on save: an untouched field keeps its stored value; a corrected date must be a valid YYYY-MM-DD.
 */
export const DateIssueBanner: React.FC<{ item: unknown }> = ({ item }) => {
    const { t } = useLanguage();
    const issues = issuesOf(item);
    if (issues.length === 0) return null;
    return (
        <div data-date-issue-banner role="alert" style={{ margin: '0 0 12px', padding: '10px 14px', borderRadius: 8, border: '1px solid #f59e0b', background: '#fffbeb', color: '#92400e', fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
                <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} aria-hidden="true" />
                {t('dateIssue.bannerTitle')}
            </div>
            <ul style={{ margin: '0 0 4px 18px', padding: 0 }}>
                {issues.map((i, n) => (
                    <li key={`${i.field}-${i.code}-${n}`} data-date-issue-item={i.field}>
                        <b>{i.field}</b>：{i.value === null || i.value === '' ? t('dateIssue.emptyValue') : <code>{i.value}</code>} — {t(issueMessageKey(i.code))}
                    </li>
                ))}
            </ul>
            <div>{t('dateIssue.keepHint')}</div>
        </div>
    );
};
