import { z } from 'zod';
import type { OSDItem } from '../../store/osdStore';

/**
 * OSD (Over/Short/Damage Report) form schema — records a quantity or condition
 * discrepancy found when materials/equipment are received on site. Standalone:
 * resolves via its own disposition/correctiveAction fields, does NOT escalate
 * into an NCR (unlike ITR failures).
 */

const str = z.string();
const fileArr = z.array(z.any());

export const osdFormSchema = z.object({
    osdNumber: str,
    status: str,
    contractor: str,
    deliveryNoteNo: str,
    poNumber: str,
    itemDescription: z.string().min(1, 'osd.itemDescriptionRequired'),
    expectedQty: str,
    receivedQty: str,
    unit: str,
    damageDescription: str,
    raisedBy: str,
    raiseDate: str,
    dueDate: str,
    disposition: str,
    correctiveAction: str,
    correctiveActionOwner: str,
    correctiveActionTargetDate: str,
    resolvedBy: str,
    resolvedDate: str,
    closeoutDate: str,
    remark: str,
    defectPhotos: fileArr,
    improvementPhotos: fileArr,
    attachments: fileArr,
});

export type OSDDetailData = z.infer<typeof osdFormSchema>;

/** Blank form for a new OSD report. */
export const emptyOSDForm: OSDDetailData = {
    osdNumber: '', status: 'Open', contractor: '',
    deliveryNoteNo: '', poNumber: '', itemDescription: '',
    expectedQty: '', receivedQty: '', unit: '', damageDescription: '',
    raisedBy: '', raiseDate: '', dueDate: '',
    disposition: '', correctiveAction: '', correctiveActionOwner: '',
    correctiveActionTargetDate: '', resolvedBy: '', resolvedDate: '',
    closeoutDate: '', remark: '',
    defectPhotos: [], improvementPhotos: [], attachments: [],
};

/** Map a stored OSDItem onto form values. */
export function toFormValues(item: OSDItem): OSDDetailData {
    return {
        ...emptyOSDForm,
        osdNumber: item.documentNumber || '',
        status: item.status || 'Open',
        contractor: item.vendor || '',
        deliveryNoteNo: item.deliveryNoteNo || '',
        poNumber: item.poNumber || '',
        itemDescription: item.itemDescription || '',
        expectedQty: item.expectedQty || '',
        receivedQty: item.receivedQty || '',
        unit: item.unit || '',
        damageDescription: item.damageDescription || '',
        raisedBy: item.raisedBy || '',
        raiseDate: item.raiseDate || '',
        dueDate: item.dueDate || '',
        disposition: item.disposition || '',
        correctiveAction: item.correctiveAction || '',
        correctiveActionOwner: item.correctiveActionOwner || '',
        correctiveActionTargetDate: item.correctiveActionTargetDate || '',
        resolvedBy: item.resolvedBy || '',
        resolvedDate: item.resolvedDate || '',
        closeoutDate: item.closeoutDate || '',
        remark: item.remark || '',
        defectPhotos: item.defectPhotos || [],
        improvementPhotos: item.improvementPhotos || [],
        attachments: item.attachments || [],
    };
}

/** English fallbacks for the required-field message keys. */
export const OSD_ERROR_FALLBACKS: Record<string, string> = {
    'osd.itemDescriptionRequired': 'Item description is required.',
};
