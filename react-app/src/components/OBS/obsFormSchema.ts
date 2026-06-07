import { z } from 'zod';
import type { OBSItem } from '../../store/obsStore';

/**
 * Lightweight OBS (Observation) form schema. OBS is the informal tier below NCR:
 * a record of a site observation / minor finding, NOT a formal non-conformance.
 * So it deliberately drops NCR's disposition / root-cause / corrective-action /
 * effectiveness / re-inspection machinery — only Subject + Description are
 * required; everything else is optional.
 *
 * NOTE: `productDisposition` is reused as the storage column for the free-text
 * "Recommended Action" field (the backend OBS model has no dedicated column yet).
 * Renaming it to a proper `recommendedAction` column is a backend follow-up.
 */

const str = z.string();
const fileArr = z.array(z.any());

export const obsFormSchema = z.object({
    obsNumber: str,
    status: str,
    subject: z.string().min(1, 'obs.subjectRequired'),
    type: str,
    contractor: str,
    foundLocation: str,
    foundBy: str,
    raisedBy: str,
    raiseDate: str,
    dueDate: str,
    closeoutDate: str,
    detailsDescription: z.string().min(1, 'obs.descriptionRequired'),
    productDisposition: str, // UI label = "Action Taken"
    verified: str,           // Pending / Verified / Rejected (QA closeout)
    verifiedDate: str,
    remark: str,
    aconex: str,
    defectPhotos: fileArr,
    improvementPhotos: fileArr,
    attachments: fileArr,
});

export type OBSDetailData = z.infer<typeof obsFormSchema>;

/** Blank form for a new observation. */
export const emptyOBSForm: OBSDetailData = {
    obsNumber: '', status: 'Open', subject: '', type: '', contractor: '',
    foundLocation: '', foundBy: '', raisedBy: '', raiseDate: '', dueDate: '',
    closeoutDate: '', detailsDescription: '', productDisposition: '',
    verified: 'Pending', verifiedDate: '', remark: '',
    aconex: '',
    defectPhotos: [], improvementPhotos: [], attachments: [],
};

/** Map a stored OBSItem onto form values. */
export function toFormValues(item: OBSItem): OBSDetailData {
    return {
        ...emptyOBSForm,
        obsNumber: item.documentNumber || '',
        status: item.status || 'Open',
        subject: item.subject || item.description || '',
        type: item.type || '',
        contractor: item.vendor || '',
        foundLocation: item.foundLocation || '',
        foundBy: item.foundBy || '',
        raisedBy: item.raisedBy || '',
        raiseDate: item.raiseDate || '',
        dueDate: item.dueDate || '',
        closeoutDate: item.closeoutDate || '',
        detailsDescription: item.description || '',
        productDisposition: item.productDisposition || '',
        verified: item.verified || 'Pending',
        verifiedDate: item.verifiedDate || '',
        remark: item.remark || '',
        aconex: item.aconex || '',
        defectPhotos: item.defectPhotos || [],
        improvementPhotos: item.improvementPhotos || [],
        attachments: item.attachments || [],
    };
}

/** English fallbacks for the required-field message keys. */
export const OBS_ERROR_FALLBACKS: Record<string, string> = {
    'obs.subjectRequired': 'Subject is required.',
    'obs.descriptionRequired': 'Observation description is required.',
};
