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
const fkUser = z.number().nullable();
const fileArr = z.array(z.any());

export const ncrFormSchema = z
    .object({
        ncrNumber: str,
        itrNumber: str,
        rev: str,
        status: str,
        raiseDate: str,
        closeoutDate: str,
        aconex: str,
        type: str,
        contractor: str,
        remark: str,
        subject: str,
        referenceStandards: str,
        detailsDescription: str,
        foundLocation: str,
        foundBy: str,
        raisedBy: str,
        serialNumbers: str,
        productDisposition: str,
        repairMethodStatement: str,
        immediateCorrectionAction: str,
        rootCauseAnalysis: str,
        correctiveActions: str,
        preventiveAction: str,
        finalProductIntegrityStatement: str,
        reInspectionNumber: str,
        noiNumber: str,
        productIntegrityRelated: str,
        permanentProductDeviation: str,
        impactToOM: str,
        projectQualityManager: str,
        defectPhotos: fileArr,
        improvementPhotos: fileArr,
        attachments: fileArr,
        dueDate: str,
        // NCR field-model improvements (BACKLOG #13)
        severity: str,
        discipline: str,
        assignedTo: fkUser,
        closedBy: fkUser,
        verifiedBy: fkUser,
        effectivenessVerified: str,
        effectivenessVerifiedBy: fkUser,
        effectivenessVerifiedDate: str,
        effectivenessNotes: str,
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
        qtyAffected: str,
        extent: str,
        costScheduleImpact: str,
        requirement: str,
        asFound: str,
        deviation: str,
        concessionNo: str,
        rcaMethod: str,
        directCause: str,
        recurrence: str,
        recurrenceRef: str,
        correctiveActionOwner: str,
        correctiveActionTargetDate: str,
        preventiveActionOwner: str,
        preventiveActionTargetDate: str,
    })
    // Strict QC closure gate (was handleSave's toast warnings). Messages are
    // i18n keys resolved by the form with English fallbacks.
    .superRefine((v, ctx) => {
        if (v.status !== 'Closed') return;
        const req = (field: keyof typeof v, message: string) => {
            if (!v[field]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
        };
        // Core closure gate
        req('productDisposition', 'ncr.closeNeedsDisposition');
        req('reInspectionNumber', 'ncr.closeNeedsReinspection');
        if (v.effectivenessVerified !== 'Yes') {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effectivenessVerified'], message: 'ncr.closeNeedsEffectiveness' });
        }
        // Traceability/impact must be complete before closing (item 1)
        req('drawingNo', 'ncr.fieldRequired');
        req('specNo', 'ncr.fieldRequired');
        req('qtyAffected', 'ncr.fieldRequired');
        req('extent', 'ncr.fieldRequired');
        // Field coupling (item 3)
        if (v.productDisposition === 'Repair' && !v.repairMethodStatement) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['repairMethodStatement'], message: 'ncr.repairNeedsMethod' });
        }
        if (v.recurrence === 'Yes' && !v.recurrenceRef) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recurrenceRef'], message: 'ncr.recurrenceNeedsRef' });
        }
    });

export type NCRDetailData = z.infer<typeof ncrFormSchema>;

/** Blank form for a new NCR — backend assigns the number; status starts Open. */
export const emptyNCRForm: NCRDetailData = {
    ncrNumber: '', itrNumber: '', rev: '', status: 'Open', raiseDate: '', closeoutDate: '',
    aconex: '', type: '', contractor: '', remark: '', subject: '', referenceStandards: '',
    detailsDescription: '', foundLocation: '', foundBy: '', raisedBy: '', serialNumbers: '',
    productDisposition: '', repairMethodStatement: '', immediateCorrectionAction: '',
    rootCauseAnalysis: '', correctiveActions: '', preventiveAction: '',
    finalProductIntegrityStatement: '', reInspectionNumber: '', noiNumber: '',
    productIntegrityRelated: '', permanentProductDeviation: '', impactToOM: '',
    projectQualityManager: '', defectPhotos: [], improvementPhotos: [], attachments: [],
    dueDate: '', severity: '', discipline: '', assignedTo: null, closedBy: null,
    verifiedBy: null, effectivenessVerified: 'Pending', effectivenessVerifiedBy: null,
    effectivenessVerifiedDate: '', effectivenessNotes: '', drawingNo: '', specNo: '',
    poContract: '', wbs: '', lineNo: '', weldJointNo: '', heatBatchNo: '', qtyAffected: '',
    extent: '', costScheduleImpact: '', requirement: '', asFound: '', deviation: '',
    concessionNo: '', rcaMethod: '', directCause: '', recurrence: '', recurrenceRef: '',
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
        immediateCorrectionAction: item.immediateCorrectionAction || '',
        rootCauseAnalysis: item.rootCauseAnalysis || '',
        correctiveActions: item.correctiveActions || '',
        preventiveAction: item.preventiveAction || '',
        finalProductIntegrityStatement: item.finalProductIntegrityStatement || '',
        reInspectionNumber: item.reInspectionNumber || '',
        noiNumber: item.noiNumber || '',
        productIntegrityRelated: item.productIntegrityRelated || '',
        permanentProductDeviation: item.permanentProductDeviation || '',
        impactToOM: item.impactToOM || '',
        projectQualityManager: item.projectQualityManager || '',
        defectPhotos: item.defectPhotos || [],
        improvementPhotos: item.improvementPhotos || [],
        attachments: item.attachments || [],
        dueDate: item.dueDate || '',
        severity: item.severity || '',
        discipline: item.discipline || '',
        assignedTo: item.assignedTo ?? null,
        closedBy: item.closedBy ?? null,
        verifiedBy: item.verifiedBy ?? null,
        effectivenessVerified: item.effectivenessVerified || '',
        effectivenessVerifiedBy: item.effectivenessVerifiedBy ?? null,
        effectivenessVerifiedDate: item.effectivenessVerifiedDate || '',
        effectivenessNotes: item.effectivenessNotes || '',
        drawingNo: item.drawingNo || '',
        specNo: item.specNo || '',
        poContract: item.poContract || '',
        wbs: item.wbs || '',
        lineNo: item.lineNo || '',
        weldJointNo: item.weldJointNo || '',
        heatBatchNo: item.heatBatchNo || '',
        qtyAffected: item.qtyAffected || '',
        extent: item.extent || '',
        costScheduleImpact: item.costScheduleImpact || '',
        requirement: item.requirement || '',
        asFound: item.asFound || '',
        deviation: item.deviation || '',
        concessionNo: item.concessionNo || '',
        rcaMethod: item.rcaMethod || '',
        directCause: item.directCause || '',
        recurrence: item.recurrence || '',
        recurrenceRef: item.recurrenceRef || '',
        correctiveActionOwner: item.correctiveActionOwner || '',
        correctiveActionTargetDate: item.correctiveActionTargetDate || '',
        preventiveActionOwner: item.preventiveActionOwner || '',
        preventiveActionTargetDate: item.preventiveActionTargetDate || '',
    };
}

/** English fallbacks for the closure-gate error keys, matching the old toasts. */
export const NCR_ERROR_FALLBACKS: Record<string, string> = {
    'ncr.closeNeedsDisposition': 'Cannot close NCR without Product Disposition.',
    'ncr.closeNeedsReinspection': 'Cannot close NCR without Re-Inspection / Verification Reference (Strict QC Process).',
    'ncr.closeNeedsEffectiveness': "Cannot close NCR until corrective-action effectiveness is verified (set Effectiveness Verified = 'Yes').",
    'ncr.fieldRequired': 'This field is required.',
    'ncr.repairNeedsMethod': 'Disposition is "Repair" — a Repair Method Statement is required.',
    'ncr.recurrenceNeedsRef': 'Recurrence is "Yes" — reference the previous NCR.',
};
