/** Small shared pieces of the material screens: the result badge, notices and read-only field frames. */
import React from 'react';
import formStyles from '../Shared/FormShell.module.css';
import type { RevisionStatus } from '../../services/materialApi';
import { useMaterialText } from './materialText';

const TONE: Record<RevisionStatus, { bg: string; fg: string; border: string }> = {
    Draft: { bg: '#f3f1ec', fg: '#5f594d', border: '#d9d3c4' },
    Submitted: { bg: '#e8f1fb', fg: '#1d4f86', border: '#b9d2ee' },
    Approved: { bg: '#e7f5ec', fg: '#1d6b3a', border: '#b6dfc4' },
    ApprovedWithComments: { bg: '#fff6e0', fg: '#7a5300', border: '#efd48f' },     // deliberately not the plain-approval green
    ReviseAndResubmit: { bg: '#fdeee6', fg: '#8a3b12', border: '#f1c3a8' },
    Rejected: { bg: '#fbe9ea', fg: '#8c1d26', border: '#efb9be' },
};

export const StatusBadge: React.FC<{ status: RevisionStatus; testId?: string }> = ({ status, testId }) => {
    const mt = useMaterialText();
    const tone = TONE[status] ?? TONE.Draft;
    return (
        <span data-testid={testId} data-status={status}
              style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                       background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}>
            {mt(`status.${status}` as const)}
        </span>
    );
};

export const Notice: React.FC<{ tone: 'info' | 'warn' | 'error' | 'ok'; children: React.ReactNode; testId?: string }> = ({ tone, children, testId }) => {
    const c = { info: ['#eef4fb', '#1d4f86'], warn: ['#fff6e0', '#7a5300'], error: ['#fbe9ea', '#8c1d26'], ok: ['#e7f5ec', '#1d6b3a'] }[tone];
    return <div role="status" data-testid={testId} data-tone={tone}
                style={{ background: c[0], color: c[1], borderRadius: 8, padding: '8px 12px', fontSize: 13, margin: '8px 0', lineHeight: 1.5 }}>{children}</div>;
};

export const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode; full?: boolean }> = ({ label, required, children, full }) => (
    <div className={full ? formStyles.formGroupFull : formStyles.formGroup}>
        <label className={required ? formStyles.requiredLabel : undefined}>{label}</label>
        {children}
    </div>
);
