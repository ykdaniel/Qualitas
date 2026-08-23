import { z } from 'zod';
import type { NCRItem } from '../../store/ncrStore';

/**
 * Single source of truth for the NCR form: field types, defaults, the
 * NCRItem -> form mapping, and the closure-gate validation that used to live as
 * scattered toast warnings in NCRModals.handleSave.
 *
 * - Text fields default to '' so inputs stay controlled.
 * - FK actor fields are number | null.
 * - Photo/attachment arrays are loose (z.any()) — at runtime they may hold
 *   either legacy URL strings or file objects, so we must not reject them on save.
 */

// All fields are required in the schema so z.input === z.infer (no optional
// keys); defaults are supplied via emptyNCRForm / toFormValues instead. Using
// .default() here would make the resolver's input type optional and mismatch
// useForm<NCRDetailData>.
const str = z.string();
const reqStr = z.string().min(1, 'ncr.fieldRequired'); // required at raise (always)
const fkUser = z.number().nullable();
const fileArr = z.array(z.any());
// qtyAffected used to be free text ("1 joint") — the unit now lives in its
// own qtyAffectedUnit field, so this must be a bare number for aggregate
// stats (BACKLOG #12). Mirrors the backend's validate_numeric_string.
const numericStr = z.string().refine((v) => !v || /^\d+(\.\d+)?$/.test(v), {
    message: 'ncr.qtyAffectedMustBeNumeric',
});

export const ncrFormSchema = z
    .object({
        ncrNumber: str,
        itrNumber: str,
        rev: str,
        status: str,
        raiseDate: reqStr,        // open-required
        closeoutDate: str,
        aconex: str,
        type: reqStr,             // open-required
        contractor: reqStr,       // open-required
        remark: str,
        subject: reqStr,          // open-required
        referenceStandards: reqStr, // open-required
        detailsDescription: str,  // legacy column; deviation is the description now
        foundLocation: reqStr,    // open-required
        foundBy: reqStr,          // open-required
        raisedBy: reqStr,         // open-required
        serialNumbers: str,
        productDisposition: str,
        repairMethodStatement: str,
        repairMethodStatementStatus: str, // '' | TBC | NA — companion to the text field (BACKLOG item 6)
        immediateCorrectionAction: str,
        immediateCorrectionActionStatus: str,
        rootCauseAnalysis: str,
        rootCauseAnalysisStatus: str,
        correctiveActions: str,
        correctiveActionsStatus: str,
        preventiveAction: str,
        preventiveActionStatus: str,
        finalProductIntegrityStatement: str,
        reInspectionNumber: str,
        noiNumber: str,
        productIntegrityRelated: str,
        permanentProductDeviation: str,
        impactToOM: str,
        projectQualityManager: str,
        defectPhotos: fileArr,
        progressPhotos: fileArr,
        improvementPhotos: fileArr,
        attachments: fileArr,
        dueDate: str,
        // NCR field-model improvements (BACKLOG #13)
        severity: reqStr,         // open-required
        discipline: reqStr,       // open-required
        assignedTo: fkUser,       // open-required (enforced in superRefine — number|null)
        closedBy: fkUser,
        verifiedBy: fkUser,
        effectivenessVerified: str,
        effectivenessVerifiedBy: fkUser,
        effectivenessVerifiedDate: str,
        effectivenessNotes: str,
        effectivenessNotesStatus: str,
        // NCR formal-report fields (BACKLOG #15). drawingNo / specNo /
        // qtyAffected / extent are required only at closure (see superRefine),
        // so an open NCR can still be drafted/saved without them.
        drawingNo: str,
        specNo: str,
        poContract: str,
        wbs: str,
        lineNo: str,
        weldJointNo: str,
        heatBatchNo: str,
        qtyAffected: numericStr,
        qtyAffectedUnit: str,
        extent: str,
        costScheduleImpact: str,
        requirement: str,
        asFound: str,
        deviation: reqStr,        // open-required (the non-conformance description)
        concessionNo: str,
        // Owner / Engineering-Design authority sign-off on the proposed
        // disposition. Required (Approved) before closing when disposition is
        // "Use As Is" or "Repair" — see superRefine below.
        ownerApproval: str,        // '' | Pending | Approved | Rejected
        ownerApprovalBy: str,
        ownerApprovalDate: str,
        ownerApprovalNotes: str,
        rcaMethod: str,
        directCause: str,
        directCauseStatus: str,
        recurrence: str,
        recurrenceRef: str,
        correctiveActionOwner: str,
        correctiveActionTargetDate: str,
        preventiveActionOwner: str,
        preventiveActionTargetDate: str,
    })
    // Strict QC closure gate. Status is derived (see deriveNCRStatus), so the
    // gate triggers on the closure intent — effectivenessVerified === 'Yes' —
    // and guarantees the prerequisites are present before status becomes Closed.
    .superRefine((v, ctx) => {
        // assignedTo is open-required but is number|null (not a string), so it
        // can't use reqStr — enforce it here, always (not just at closure).
        if (v.assignedTo == null) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['assignedTo'], message: 'ncr.fieldRequired' });
        }
        // effectivenessVerified === 'Yes' normally means "about to close", but
        // an owner rejection overrides that (see deriveNCRStatus) and sends the
        // NCR back to In Progress instead — the closure-required fields below
        // must not block that save, matching the backend's is_transitioning_to_closed
        // gate (which only fires when status is actually becoming Closed).
        if (v.effectivenessVerified !== 'Yes' || v.ownerApproval === 'Rejected') return;
        const req = (field: keyof typeof v, message: string) => {
            if (!v[field]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
        };
        // Core closure gate — kept in lockstep with the backend gate in
        // ncr_service.py (the two used to disagree on repairMethodStatement /
        // drawingNo / specNo / qtyAffected / extent / improvementPhotos).
        req('productDisposition', 'ncr.closeNeedsDisposition');
        req('reInspectionNumber', 'ncr.closeNeedsReinspection');
        if (!v.improvementPhotos || v.improvementPhotos.length === 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['improvementPhotos'], message: 'ncr.closeNeedsImprovementPhotos' });
        }
        // Traceability/impact must be complete before closing (item 1)
        req('drawingNo', 'ncr.fieldRequired');
        req('specNo', 'ncr.fieldRequired');
        req('qtyAffected', 'ncr.fieldRequired');
        req('extent', 'ncr.fieldRequired');
        // Field coupling (item 3). A TBC/NA status counts as "addressed" here,
        // same as the old magic-string text did — it's an explicit answer, not
        // a blank field.
        if (v.productDisposition === 'Repair' && !v.repairMethodStatement && !v.repairMethodStatementStatus) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['repairMethodStatement'], message: 'ncr.repairNeedsMethod' });
        }
        if (v.recurrence === 'Yes' && !v.recurrenceRef) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recurrenceRef'], message: 'ncr.recurrenceNeedsRef' });
        }
        // Use As Is / Repair are technical changes to the accepted product —
        // owner/engineering authority approval is required before closing
        // (mirrors the backend gate in ncr_service.py).
        if ((v.productDisposition === 'Use As Is' || v.productDisposition === 'Repair') && v.ownerApproval !== 'Approved') {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ownerApproval'], message: 'ncr.closeNeedsOwnerApproval' });
        }
    });

export type NCRDetailData = z.infer<typeof ncrFormSchema>;
// (deriveNCRStatus is defined below, after the type.)

/** Blank form for a new NCR — backend assigns the number; status starts Open. */
export const emptyNCRForm: NCRDetailData = {
    ncrNumber: '', itrNumber: '', rev: '', status: 'Open', raiseDate: '', closeoutDate: '',
    aconex: '', type: '', contractor: '', remark: '', subject: '', referenceStandards: '',
    detailsDescription: '', foundLocation: '', foundBy: '', raisedBy: '', serialNumbers: '',
    productDisposition: '', repairMethodStatement: '', repairMethodStatementStatus: '',
    immediateCorrectionAction: '', immediateCorrectionActionStatus: '',
    rootCauseAnalysis: '', rootCauseAnalysisStatus: '',
    correctiveActions: '', correctiveActionsStatus: '',
    preventiveAction: '', preventiveActionStatus: '',
    finalProductIntegrityStatement: '', reInspectionNumber: '', noiNumber: '',
    productIntegrityRelated: '', permanentProductDeviation: '', impactToOM: '',
    projectQualityManager: '', defectPhotos: [], progressPhotos: [], improvementPhotos: [], attachments: [],
    dueDate: '', severity: '', discipline: '', assignedTo: null, closedBy: null,
    verifiedBy: null, effectivenessVerified: 'Pending', effectivenessVerifiedBy: null,
    effectivenessVerifiedDate: '', effectivenessNotes: '', effectivenessNotesStatus: '', drawingNo: '', specNo: '',
    poContract: '', wbs: '', lineNo: '', weldJointNo: '', heatBatchNo: '', qtyAffected: '',
    qtyAffectedUnit: '',
    extent: '', costScheduleImpact: '', requirement: '', asFound: '', deviation: '',
    concessionNo: 'Not Applicable',
    ownerApproval: '', ownerApprovalBy: '', ownerApprovalDate: '', ownerApprovalNotes: '',
    rcaMethod: '', directCause: '', directCauseStatus: '', recurrence: '', recurrenceRef: '',
    correctiveActionOwner: '', correctiveActionTargetDate: '', preventiveActionOwner: '',
    preventiveActionTargetDate: '',
};

/** Map a stored NCRItem onto form values. Shared by the edit and view modals. */
export function toFormValues(item: NCRItem): NCRDetailData {
    return {
        ...emptyNCRForm,
        ncrNumber: item.documentNumber || '',
        itrNumber: item.itrNumber || '',
        rev: item.rev || '',
        status: item.status || 'Open',
        raiseDate: item.raiseDate || '',
        closeoutDate: item.closeoutDate || '',
        aconex: item.aconex || '',
        type: item.type || '',
        contractor: item.vendor || '',
        remark: item.remark || '',
        subject: item.subject || item.description || '',
        referenceStandards: item.referenceStandards || '',
        detailsDescription: item.description || '',
        foundLocation: item.foundLocation || '',
        foundBy: item.foundBy || '',
        raisedBy: item.raisedBy || '',
        serialNumbers: item.serialNumbers || '',
        productDisposition: item.productDisposition || '',
        repairMethodStatement: item.repairMethodStatement || '',
        repairMethodStatementStatus: item.repairMethodStatementStatus || '',
        immediateCorrectionAction: item.immediateCorrectionAction || '',
        immediateCorrectionActionStatus: item.immediateCorrectionActionStatus || '',
        rootCauseAnalysis: item.rootCauseAnalysis || '',
        rootCauseAnalysisStatus: item.rootCauseAnalysisStatus || '',
        correctiveActions: item.correctiveActions || '',
        correctiveActionsStatus: item.correctiveActionsStatus || '',
        preventiveAction: item.preventiveAction || '',
        preventiveActionStatus: item.preventiveActionStatus || '',
        finalProductIntegrityStatement: item.finalProductIntegrityStatement || '',
        reInspectionNumber: item.reInspectionNumber || '',
        noiNumber: item.noiNumber || '',
        productIntegrityRelated: item.productIntegrityRelated || '',
        permanentProductDeviation: item.permanentProductDeviation || '',
        impactToOM: item.impactToOM || '',
        projectQualityManager: item.projectQualityManager || '',
        defectPhotos: item.defectPhotos || [],
        progressPhotos: item.progressPhotos || [],
        improvementPhotos: item.improvementPhotos || [],
        attachments: item.attachments || [],
        dueDate: item.dueDate || '',
        severity: item.severity || '',
        discipline: item.discipline || '',
        assignedTo: item.assignedTo ?? null,
        closedBy: item.closedBy ?? null,
        verifiedBy: item.verifiedBy ?? null,
        effectivenessVerified: item.effectivenessVerified || 'Pending',
        effectivenessVerifiedBy: item.effectivenessVerifiedBy ?? null,
        effectivenessVerifiedDate: item.effectivenessVerifiedDate || '',
        effectivenessNotes: item.effectivenessNotes || '',
        effectivenessNotesStatus: item.effectivenessNotesStatus || '',
        drawingNo: item.drawingNo || '',
        specNo: item.specNo || '',
        poContract: item.poContract || '',
        wbs: item.wbs || '',
        lineNo: item.lineNo || '',
        weldJointNo: item.weldJointNo || '',
        heatBatchNo: item.heatBatchNo || '',
        qtyAffected: item.qtyAffected || '',
        qtyAffectedUnit: item.qtyAffectedUnit || '',
        extent: item.extent || '',
        costScheduleImpact: item.costScheduleImpact || '',
        requirement: item.requirement || '',
        asFound: item.asFound || '',
        deviation: item.deviation || '',
        concessionNo: item.concessionNo || 'Not Applicable',
        ownerApproval: item.ownerApproval || '',
        ownerApprovalBy: item.ownerApprovalBy || '',
        ownerApprovalDate: item.ownerApprovalDate || '',
        ownerApprovalNotes: item.ownerApprovalNotes || '',
        rcaMethod: item.rcaMethod || '',
        directCause: item.directCause || '',
        directCauseStatus: item.directCauseStatus || '',
        recurrence: item.recurrence || '',
        recurrenceRef: item.recurrenceRef || '',
        correctiveActionOwner: item.correctiveActionOwner || '',
        correctiveActionTargetDate: item.correctiveActionTargetDate || '',
        preventiveActionOwner: item.preventiveActionOwner || '',
        preventiveActionTargetDate: item.preventiveActionTargetDate || '',
    };
}

/**
 * Derive NCR status from the Verification & Closure state instead of letting it
 * be picked manually. Void is a manual override handled in the form (not here).
 * The closure gate (superRefine, triggered by effectivenessVerified==='Yes')
 * guarantees disposition + reInspection are present, so 'Yes' → Closed is valid.
 */
/**
 * Auto-derive the response Due Date from the raise date + severity SLA:
 * Major = +7 days, Minor (or anything else) = +14 days. Returns '' until both
 * raiseDate (YYYY-MM-DD) and severity are present. Uses UTC to avoid the
 * off-by-one that local-time Date math causes on date-only strings.
 */
export function computeDueDate(raiseDate: string, severity: string): string {
    if (!raiseDate || !severity) return '';
    const parts = raiseDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return '';
    const [y, m, d] = parts;
    const base = new Date(Date.UTC(y, m - 1, d));
    if (Number.isNaN(base.getTime())) return '';
    base.setUTCDate(base.getUTCDate() + (severity === 'Major' ? 7 : 14));
    return base.toISOString().slice(0, 10);
}

export function deriveNCRStatus(v: Pick<NCRDetailData, 'effectivenessVerified' | 'ownerApproval' | 'status'>): string {
    // Owner/engineering rejection of the proposed disposition overrides QC's
    // effectiveness review — even an already-verified NCR must go back to the
    // contractor if the owner then rejects it.
    if (v.ownerApproval === 'Rejected') return 'In Progress';
    // Driven only by the explicit QC review (effectivenessVerified), not by
    // whether data fields happen to be filled.
    if (v.effectivenessVerified === 'Yes') return 'Closed';   // reviewed & passed
    if (v.effectivenessVerified === 'No') return 'In Progress'; // reviewed & sent back
    // 'Resolved' predates this derive-only status model (still a valid backend
    // value) — a record left in that state must not be silently downgraded to
    // Open by an unrelated edit; it only moves once effectivenessVerified/
    // ownerApproval is explicitly set, same as any other transition above.
    if (v.status === 'Resolved') return 'Resolved';
    return 'Open';                                             // not yet verified
}

/** English fallbacks for the closure-gate error keys, matching the old toasts. */
export const NCR_ERROR_FALLBACKS: Record<string, string> = {
    'ncr.closeNeedsDisposition': 'Cannot close NCR without Product Disposition.',
    'ncr.closeNeedsReinspection': 'Cannot close NCR without Re-Inspection / Verification Reference (Strict QC Process).',
    'ncr.closeNeedsImprovementPhotos': 'Cannot close NCR without at least one Improvement Photo as evidence of the fix.',
    'ncr.closeNeedsEffectiveness': "Cannot close NCR until corrective-action effectiveness is verified (set Effectiveness Verified = 'Yes').",
    'ncr.fieldRequired': 'This field is required.',
    'ncr.repairNeedsMethod': 'Disposition is "Repair" — a Repair Method Statement is required.',
    'ncr.recurrenceNeedsRef': 'Recurrence is "Yes" — reference the previous NCR.',
    'ncr.closeNeedsOwnerApproval': 'Disposition is "Use As Is" or "Repair" — owner/engineering authority approval is required before closing.',
    'ncr.qtyAffectedMustBeNumeric': 'Qty Affected must be a plain number — put the unit in the field next to it.',
};
