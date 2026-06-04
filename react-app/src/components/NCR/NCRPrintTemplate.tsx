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
    sectionTitle: { fontWeight: 800, fontSize: 12, textTransform: 'uppercase', background: '#111', color: '#fff', padding: '4px 8px', marginTop: 10 },
    block: { border: '1px solid #111', borderTop: 'none', padding: '6px 8px', minHeight: 22, whiteSpace: 'pre-wrap' },
    sigGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginTop: 16 },
    sigCell: { border: '1px solid #111', padding: '8px 10px', minHeight: 70 },
    sigLabel: { fontWeight: 700, fontSize: 11, marginBottom: 6 },
    sigLine: { borderBottom: '1px solid #111', height: 26, marginBottom: 4 },
    sigMeta: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#374151' },
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

const Block: React.FC<{ title: string; value?: string }> = ({ title, value }) => (
    <>
        <div style={s.sectionTitle}>{title}</div>
        <div style={s.block}>{value || '-'}</div>
    </>
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

const NCRPrintTemplate: React.FC<NCRPrintTemplateProps> = ({ data, resolveUser }) => {
    const isMajor = data.severity === 'Major';
    return (
        <div className="ncr-print-root">
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

                <Block title="Description of Non-Conformance" value={data.detailsDescription} />
                <Block title="Product Disposition" value={data.productDisposition} />
                <Block title="Repair Method Statement" value={data.repairMethodStatement} />
                <Block title="Immediate Correction Action" value={data.immediateCorrectionAction} />
                <Block title="Root Cause Analysis" value={data.rootCauseAnalysis} />
                <Block title="Corrective Actions" value={data.correctiveActions} />
                <Block title="Preventive Action" value={data.preventiveAction} />
                <Block title="Final Product Integrity Statement" value={data.finalProductIntegrityStatement} />

                <table style={{ ...s.table, marginTop: 12 }}>
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

                {/* Signature blocks (BACKLOG #15) */}
                <div style={s.sigGrid}>
                    <Sig label="Raised by" name={data.raisedBy || data.foundBy} date={data.raiseDate} />
                    <Sig label="Contractor response (Assigned)" name={resolveUser(data.assignedTo)} />
                    <Sig label="Disposition approved by (PQM)" name={data.projectQualityManager} />
                    <Sig label="Effectiveness verified by" name={resolveUser(data.effectivenessVerifiedBy)} date={data.effectivenessVerifiedDate} />
                </div>
            </div>
        </div>
    );
};

export default NCRPrintTemplate;
