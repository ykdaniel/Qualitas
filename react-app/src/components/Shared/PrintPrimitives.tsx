import React from 'react';

/**
 * Shared bilingual print-report primitives — used by NCR/OBS/FAT print
 * templates (and any future one). These used to be copy-pasted verbatim into
 * each *PrintTemplate.tsx and had already started drifting (NCR's val() grew
 * a TBC/NA status param and SignCell grew a req-tag that OBS's copies never
 * got). Single source now so a future fix applies everywhere at once.
 */

export const DASH = '—';

// Status label for the TBC/N/A companion fields (BACKLOG item 6) — the print
// template has no i18n context of its own, so these are hardcoded bilingual
// like every other label here.
export const statusLabel = (status?: string) =>
    status === 'TBC' ? '待確認 To Be Confirmed' : status === 'NA' ? '不適用 N/A' : undefined;

export const val = (v?: string, status?: string) => {
    const label = statusLabel(status);
    if (v) return <>{v}</>;
    if (label) return <span className="blank">{label}</span>;
    return <span className="blank">{DASH}</span>;
};

export const SignCell: React.FC<{ num: string; zh: string; en: string; name?: string; date?: string; req?: string }> = ({ num, zh, en, name, date, req }) => (
    <div className="sign-cell">
        <div className="role">{num} {zh} <span className="en">{en}</span> {req && <span className="req-tag">{req}</span>}</div>
        <div className="sign-line" />
        <div className="sign-meta">
            <span>姓名（職稱）：{name || '____________'}</span>
            <span style={{ textAlign: 'right' }}>日期：{date || '____________'}</span>
        </div>
        <div className="sign-meta"><span>單位 Company：____________</span></div>
    </div>
);
