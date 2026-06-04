import React from 'react';
import type { NCRDetailData } from './NCRModals';

/**
 * Formal NCR print report (BACKLOG #15, Stage B).
 *
 * Rendered into document.body via a portal only while printing. Visibility is
 * controlled by NCR.print.css (`.ncr-print-root` is hidden on screen, and in
 * @media print everything except this subtree is hidden). A4 portrait.
 *
 * The company header is a PLACEHOLDER for now — Stage A (configurable branding
 * setting: company name + logo) will feed it later.
 */
interface NCRPrintTemplateProps {
    data: NCRDetailData;
    /** Resolve a user id (assignedTo / effectivenessVerifiedBy) to a display name. */
    resolveUser: (id: number | null) => string;
    /** Already-resolved (same-origin) image URLs for the photo report page. */
    defectPhotos?: string[];
    improvementPhotos?: string[];
}

const s: Record<string, React.CSSProperties> = {
    page: { fontFamily: "'Helvetica Neue', Arial, sans-serif", color: '#111', fontSize: 12, lineHeight: 1.5 },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: 10, marginBottom: 12 },
    logoBox: { width: 120, height: 48, border: '1px dashed #9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 10 },
    company: { textAlign: 'center', flex: 1 },
    companyName: { fontSize: 16, fontWeight: 800, letterSpacing: 0.5 },
    companySub: { fontSize: 10, color: '#6b7280' },
    docMeta: { textAlign: 'right', fontSize: 11 },
    title: { textAlign: 'center', fontSize: 18, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, margin: '6px 0 14px' },
    table: { width: '100%', borderCollapse: 'collapse', marginBottom: 12 },
    th: { border: '1px solid #111', padding: '5px 8px', background: '#f3f4f6', textAlign: 'left', fontWeight: 700, width: '16%', whiteSpace: 'nowrap', verticalAlign: 'top' },
    td: { border: '1px solid #111', padding: '5px 8px', verticalAlign: 'top' },
    sectionBar: { fontWeight: 800, fontSize: 12, textTransform: 'uppercase', background: '#e5e7eb', color: '#111', padding: '5px 8px', border: '1px solid #111', marginTop: 14, letterSpacing: 0.5 },
    blockLabel: { fontWeight: 700, fontSize: 10.5, color: '#374151', textTransform: 'uppercase', margin: '8px 0 2px' },
    block: { border: '1px solid #111', padding: '6px 8px', minHeight: 38, whiteSpace: 'pre-wrap' },
    sigGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginTop: 16 },
    sigCell: { border: '1px solid #111', padding: '8px 10px', minHeight: 70 },
    sigLabel: { fontWeight: 700, fontSize: 11, marginBottom: 6 },
    sigLine: { borderBottom: '1px solid #111', height: 26, marginBottom: 4 },
    sigMeta: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#374151' },
    // Running header repeated on every printed page (consistency)
    runningHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #111', paddingBottom: 4, fontSize: 10, fontWeight: 700, color: '#111' },
    photoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 },
    photoItem: { border: '1px solid #111', padding: 4, textAlign: 'center' },
    photoImg: { width: '100%', height: 'auto', maxHeight: 300, objectFit: 'contain' },
    photoEmpty: { fontSize: 11, color: '#6b7280', padding: '12px 0' },
};

const sevBadge = (major: boolean): React.CSSProperties => ({
    display: 'inline-block', padding: '1px 8px', borderRadius: 3, fontWeight: 700,
    border: '1px solid #111', background: major ? '#fde2e1' : '#e5e7eb',
});

// A single label/value cell pair (used to build a 2-column identity grid).
const Cell: React.FC<{ label: string; value?: React.ReactNode; span?: number }> = ({ label, value, span }) => (
    <>
        <th style={s.th}>{label}</th>
        <td style={s.td} colSpan={span}>{value || '-'}</td>
    </>
);

// Numbered major-section header (light grey bar — print-friendly, not solid black)
const SectionBar: React.FC<{ n: number; title: string }> = ({ n, title }) => (
    <div className="ncr-section-bar" style={s.sectionBar}>{n}. {title}</div>
);

// A narrative field: label + bordered box. Empty → a blank writable box (so a
// freshly-issued NCR prints as a form to be completed, not a wall of "-").
const Block: React.FC<{ title: string; value?: string }> = ({ title, value }) => (
    <div className="ncr-block">
        <div style={s.blockLabel}>{title}</div>
        <div style={s.block}>{value || ''}</div>
    </div>
);

const Sig: React.FC<{ label: string; name?: string; date?: string }> = ({ label, name, date }) => (
    <div style={s.sigCell}>
        <div style={s.sigLabel}>{label}</div>
        <div style={s.sigLine} />
        <div style={s.sigMeta}>
            <span>Name: {name || '________________'}</span>
            <span>Date: {date || '____________'}</span>
        </div>
    </div>
);

const PhotoColumn: React.FC<{ title: string; urls: string[] }> = ({ title, urls }) => (
    <div>
        <div style={s.blockLabel}>{title}</div>
        {urls.length === 0
            ? <div style={s.photoEmpty}>(No photos)</div>
            : urls.map((u, i) => (
                <div key={i} style={{ ...s.photoItem, marginBottom: 8 }}>
                    <img src={u} style={s.photoImg} alt={`${title} ${i + 1}`} />
                </div>
            ))}
    </div>
);

const NCRPrintTemplate: React.FC<NCRPrintTemplateProps> = ({ data, resolveUser, defectPhotos = [], improvementPhotos = [] }) => {
    const isMajor = data.severity === 'Major';
    const hasPhotos = defectPhotos.length > 0 || improvementPhotos.length > 0;
    return (
        <div className="ncr-print-root">
            {/* Repeats on every printed page (sits in the reserved @page top margin) */}
            <div className="ncr-running-header" style={s.runningHeader}>
                <span>[ Company Name ] — Non-Conformance Report</span>
                <span>{data.ncrNumber || '(auto)'} · Rev {data.rev || '-'}</span>
            </div>
            <div style={s.page}>
                {/* Company header — placeholder until Stage A branding lands */}
                <div style={s.header}>
                    <div style={s.logoBox}>LOGO</div>
                    <div style={s.company}>
                        <div style={s.companyName}>[ Company Name ]</div>
                        <div style={s.companySub}>Quality Management — Non-Conformance Report</div>
                    </div>
                    <div style={s.docMeta}>
                        <div><strong>{data.ncrNumber || '(auto)'}</strong></div>
                        <div>Rev: {data.rev || '-'}</div>
                        <div>Status: {data.status || '-'}</div>
                    </div>
                </div>

                <div style={s.title}>Non-Conformance Report</div>

                {/* 1 — Non-conformance details */}
                <SectionBar n={1} title="Non-Conformance Details" />
                <table style={s.table}>
                    <tbody>
                        <tr>
                            <Cell label="NCR No." value={data.ncrNumber} />
                            <Cell label="Severity" value={data.severity ? <span style={sevBadge(isMajor)}>{data.severity}</span> : '-'} />
                        </tr>
                        <tr>
                            <Cell label="Subject" value={data.subject} span={3} />
                        </tr>
                        <tr>
                            <Cell label="Contractor" value={data.contractor} />
                            <Cell label="Discipline" value={data.discipline} />
                        </tr>
                        <tr>
                            <Cell label="Type" value={data.type} />
                            <Cell label="Found Location" value={data.foundLocation} />
                        </tr>
                        <tr>
                            <Cell label="Raise Date" value={data.raiseDate} />
                            <Cell label="Due Date" value={data.dueDate} />
                        </tr>
                        <tr>
                            <Cell label="Ref. Standards" value={data.referenceStandards} span={3} />
                        </tr>
                        <tr>
                            <Cell label="ITR / NOI" value={[data.itrNumber, data.noiNumber].filter(Boolean).join(' / ')} span={3} />
                        </tr>
                    </tbody>
                </table>
                <Block title="1.1 Description of Non-Conformance" value={data.detailsDescription} />

                {/* 2 — Disposition */}
                <SectionBar n={2} title="Disposition" />
                <Block title="2.1 Product Disposition" value={data.productDisposition} />
                <Block title="2.2 Repair Method Statement" value={data.repairMethodStatement} />

                {/* 3 — Root cause & corrective action */}
                <SectionBar n={3} title="Root Cause & Corrective Action" />
                <Block title="3.1 Immediate Correction Action" value={data.immediateCorrectionAction} />
                <Block title="3.2 Root Cause Analysis" value={data.rootCauseAnalysis} />
                <Block title="3.3 Corrective Actions" value={data.correctiveActions} />
                <Block title="3.4 Preventive Action" value={data.preventiveAction} />

                {/* 4 — Verification & closure */}
                <SectionBar n={4} title="Verification & Closure" />
                <Block title="4.1 Final Product Integrity Statement" value={data.finalProductIntegrityStatement} />
                <table style={{ ...s.table, marginTop: 8 }}>
                    <tbody>
                        <tr>
                            <Cell label="Effectiveness Verified" value={`${data.effectivenessVerified || '-'}${data.effectivenessVerifiedDate ? `  (${data.effectivenessVerifiedDate})` : ''}`} />
                            <Cell label="Closeout Date" value={data.closeoutDate} />
                        </tr>
                        <tr>
                            <Cell label="Re-Inspection No." value={data.reInspectionNumber} span={3} />
                        </tr>
                        <tr>
                            <Cell label="Effectiveness Notes" value={data.effectivenessNotes} span={3} />
                        </tr>
                    </tbody>
                </table>

                {/* 5 — Approvals / signatures */}
                <SectionBar n={5} title="Approvals" />
                <div style={s.sigGrid}>
                    <Sig label="5.1 Raised by" name={data.raisedBy || data.foundBy} date={data.raiseDate} />
                    <Sig label="5.2 Contractor response (Assigned)" name={resolveUser(data.assignedTo)} />
                    <Sig label="5.3 Disposition approved by (PQM)" name={data.projectQualityManager} />
                    <Sig label="5.4 Effectiveness verified by" name={resolveUser(data.effectivenessVerifiedBy)} date={data.effectivenessVerifiedDate} />
                </div>

                {/* 6 — Photographic record on its own page */}
                {hasPhotos && (
                    <div style={{ pageBreakBefore: 'always', breakBefore: 'page' }}>
                        <div style={s.title}>Photographic Record</div>
                        <SectionBar n={6} title="Before / After Photos" />
                        <div style={s.photoGrid}>
                            <PhotoColumn title="Defect (Before)" urls={defectPhotos} />
                            <PhotoColumn title="Improvement (After)" urls={improvementPhotos} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NCRPrintTemplate;
