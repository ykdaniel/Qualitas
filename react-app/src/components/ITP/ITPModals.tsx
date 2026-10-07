import { useLeaveGuard } from '../Shared/LeaveGuard';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import { useCreationProjects } from '../../hooks/useCreationProjects';
import { CreationProjectField } from '../Shared/CreationProjectField';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '../ui/BackButton';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { ITPItem } from '../../store/itpStore';
import { ITPAdvancedEditor, ITPAdvancedEditorRef } from './ITPAdvancedEditor';
import ReactDOM from 'react-dom';
import { ITPPrintTemplate } from './ITPPrintTemplate';
import { InspectionItem } from '../../types/itp';
import FileAttachment from '../Shared/FileAttachment';
import RelatedDocuments from '../ui/RelatedDocuments';
import styles from './ITP.module.css';
import formStyles from '../Shared/FormShell.module.css';
import { getNextRevision } from '../../utils/revision';
import { parseInspectionItems } from '../../utils/itpParser';
import ConfirmModal from '../Shared/ConfirmModal';


import { Printer, ShieldCheck, Save, LayoutTemplate, Plus, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage, getErrorStatusCode } from '../../utils/errorUtils';
import { isUnchangedSincePriorWrite } from '../../utils/attachmentOutcome';
import api from '../../services/api';

// Mirrors backend/core/utils.py::WorkflowEngine.TRANSITIONS["ITP"] exactly — the ONLY source of
// truth for which status transitions the backend will actually accept. "Rejected" and "No submit"
// were previously offered here unconditionally despite never appearing anywhere in this backend
// map (neither as a source nor as a target of any transition) — selecting either from any current
// status and saving always got a real 400 "Invalid status transition" from
// WorkflowEngine.validate_transition. Keep this in sync with the backend map if it ever changes;
// this batch does not touch the backend map itself.
const ITP_STATUS_TRANSITIONS: Record<string, string[]> = {
    'Draft': ['Pending', 'Void'],
    'Pending': ['Approved', 'Approved with comments', 'Revise & Resubmit', 'Void'],
    'Approved': ['Approved with comments', 'Void', 'Pending'],
    'Approved with comments': ['Pending', 'Revise & Resubmit', 'Void'],
    'Revise & Resubmit': ['Pending', 'Void'],
    'Void': [],
};
// Every status this UI knows how to LABEL, in the order they should appear in the dropdown when
// legal. A status the backend returned that isn't even in this list (some historical/unrecognized
// value) is handled separately — see the render code — by injecting a synthetic option for it
// rather than silently coercing it to Pending or hiding it.
const ITP_ALL_KNOWN_STATUSES = ['Draft', 'Approved', 'Approved with comments', 'Revise & Resubmit', 'Rejected', 'Pending', 'No submit', 'Void'];

/** Result of ONE save attempt's attachment phase (Phase 2 — the record's own fields, Phase 1,
 * has already succeeded by the time this is built; a Phase 1 failure throws instead). Mirrors
 * PQPModals.tsx's SaveOutcome — never invented to look like a full success/failure, so the
 * modal can prune its own queues per-item instead of clearing or keeping them wholesale. */
export interface SaveOutcome {
    /** Attachment ids this attempt confirmed deleted — safe to drop from the pending-delete
     * queue; anything else (outright failure, 404, or no response) stays queued for retry. */
    deletedIds: string[];
    /** True only if the pending-files upload call itself succeeded (one all-or-nothing backend
     * transaction) — safe to clear the pending-upload queue only when true. */
    uploadedPending: boolean;
    /** Human-readable description of every step that did NOT complete this attempt. Empty means
     * the whole attachment phase succeeded. */
    errors: string[];
}

// Thrown by ITP.tsx's onSave specifically when the main ITP record write succeeded but the
// inspection-plan (detail_data) write's result could not be confirmed — a distinct case (see
// onSave's own comments) from an outright failure where nothing was saved. Lets the persistent
// save-status indicator report "main record saved, plan unconfirmed" instead of collapsing both
// into one generic "save failed" state, which would incorrectly imply the main record write was
// lost too.
export class ItpMainSavedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ItpMainSavedError';
    }
}

export interface ITPDetailModalProps {
    /** null for a brand-new record that has never been written to the backend — nothing is
     * created until the user explicitly clicks Save/Publish (see ITP.tsx's onSave). Becomes the
     * real backend id once the first save succeeds, without the modal remounting. */
    itpId: string | null;
    existingItem?: ITPItem;
    /** Pre-fills the Contractor field for a brand-new record only (existingItem takes priority
     * when present) — preserves the previous convenience of defaulting to the first active
     * contractor, now that the record isn't created immediately on "Add New" to have its own
     * value to default from. */
    defaultVendor?: string;
    /** Holds itp:approve:all — gates the Publish button and the Approved/Approved-with-comments
     * status options here, so a user without it never fills out the form only to be rejected by
     * the backend at the end. The backend (services/itp_service.py) remains the actual
     * enforcement; this is convenience only. */
    canApprove?: boolean;
    /** Holds itp:void:all — same reasoning, for the Void status option. */
    canVoid?: boolean;
    /** Holds itp:create:all — governs whether a BRAND-NEW (unsaved) record's fields and
     * inspection-plan editor are editable. Ignored once existingItem is set (see canUpdate). */
    canCreate?: boolean;
    /** Holds itp:update:all — governs whether an EXISTING record's fields, inspection-plan
     * editor, and attachment controls are editable. Attachment upload/delete is gated on this
     * REGARDLESS of new-vs-existing (routers/file_router.py requires itp:update:all
     * unconditionally for every upload, including to a record the caller just created — a
     * confirmed, real backend behavior, not changed by this batch), so a create-only user filling
     * out a brand-new record still sees the attachment controls disabled. The backend remains the
     * actual enforcement in every case; these props are convenience/UX only. */
    canUpdate?: boolean;
    /** Holds checklist:create:all — the Generate Checklist button (calls POST /checklist/
     * directly, a different permission than any of the four above) is hidden entirely when
     * false so a user without it never sees a control guaranteed to fail. The backend remains
     * the actual enforcement; this is convenience/UX only. */
    canCreateChecklist?: boolean;
    onSave: (updates: Partial<ITPItem>, details?: any, pendingFiles?: File[], deletedFileIds?: string[], skipRecordWrite?: boolean) => Promise<SaveOutcome>;
    /** Returns whether the immediate detail-only write actually succeeded, so the persistent
     * save-status indicator can reflect the real outcome instead of assuming success. */
    onApplyItems?: (detailPayload: any) => Promise<boolean>;
    onClose: () => void;
}

export const ITPDetailModal: React.FC<ITPDetailModalProps> = ({ itpId, existingItem, defaultVendor, canApprove = false, canVoid = false, canCreate = false, canUpdate = false, canCreateChecklist = false, onSave, onApplyItems, onClose }) => {
    // New record (no existingItem yet): editable only with itp:create:all. Existing record:
    // editable only with itp:update:all. Attachment controls are separate (see attachmentReadOnly
    // below) because upload/delete always requires itp:update:all, even for a brand-new record.
    const formReadOnly = existingItem ? !canUpdate : !canCreate;
    const creationProjects = useCreationProjects(!itpId);
    const attachmentReadOnly = !canUpdate;
    const editorRef = useRef<ITPAdvancedEditorRef>(null);
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { getActiveContractors } = useContractorsStore();
    const REV_OPTIONS = ['Rev1.0', 'Rev2.0', 'Rev3.0', 'Rev4.0'];

    const [activeTab, setActiveTab] = useState<'general' | 'plan'>('general');



    const [saving, setSaving] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // Persistent save-status indicator (visible regardless of active tab — see the bar rendered
    // right after the tabs below). Tracks the main record and the inspection plan SEPARATELY,
    // reflecting the actual result of the last save attempt for each — never collapsed into one
    // "saved"/"not saved" flag, since the two can genuinely diverge (see ItpMainSavedError above,
    // and the atomic-create path where they can only succeed or fail together). A brand-new,
    // never-saved record starts 'unsaved'; an existing record starts 'saved' (its loaded fields
    // ARE what the backend has). Does not change when saves are triggered — only what is shown.
    const [mainStatus, setMainStatus] = useState<'saved' | 'unsaved' | 'failed'>(existingItem ? 'saved' : 'unsaved');
    const [planStatus, setPlanStatus] = useState<'saved' | 'unsaved' | 'unconfirmed' | 'failed'>(existingItem ? 'saved' : 'unsaved');
    // Attachments have no separate "dirty" flag to maintain: whether they are fully saved is
    // always exactly "is anything still queued" (pendingFiles/deletedFileIds, declared further
    // below) — derived, not tracked, so it can never drift out of sync with the real queues.
    // Only whether the LAST attempt on that queue errored needs its own flag.
    const [attachmentsFailed, setAttachmentsFailed] = useState(false);

    // Print Handling
    useEffect(() => {
        if (isPrinting) {
            const timer = setTimeout(() => {
                window.print();
            }, 100);
            const onAfterPrint = () => setIsPrinting(false);
            window.addEventListener('afterprint', onAfterPrint);
            return () => {
                clearTimeout(timer);
                window.removeEventListener('afterprint', onAfterPrint);
            };
        }
    }, [isPrinting]);

    const handlePrint = () => {
        setIsPrinting(true);
    };

    const [formData, setFormData] = useState<Partial<ITPItem>>({
        vendor: existingItem?.vendor || defaultVendor || '',
        referenceNo: existingItem?.referenceNo || '',
        description: existingItem?.description || '',
        rev: existingItem?.rev || 'Rev1.0',
        submit: existingItem?.submit || '',
        status: existingItem?.status || 'Pending',
        remark: existingItem?.remark || '',
        submissionDate: existingItem?.submissionDate || new Date().toISOString().split('T')[0],
        attachments: existingItem?.attachments || [],
        dueDate: (existingItem as any)?.dueDate || '',
        detail_data: existingItem?.detail_data || [],
        hasDetails: true
    });

    const [advancedItems, setAdvancedItems] = useState<InspectionItem[]>([]);

    // Header Data for Print/Preview
    const headerData = useMemo(() => ({
        referenceNo: formData.referenceNo || '',
        description: formData.description || '',
        rev: formData.rev || '',
        vendor: formData.vendor || '',
        submissionDate: formData.submissionDate || ''
    }), [formData.referenceNo, formData.description, formData.rev, formData.vendor, formData.submissionDate]);

    useEffect(() => {
        if (existingItem?.detail_data) {
            setAdvancedItems(parseInspectionItems(existingItem.detail_data));
        }
    }, [existingItem]);


    const [errors, setErrors] = useState<{ [key: string]: string }>({});
    const [revMode, setRevMode] = useState<'select' | 'custom'>(() => {
        const currentRev = existingItem?.rev;
        if (currentRev && !REV_OPTIONS.includes(currentRev)) {
            return 'custom';
        }
        return 'select';
    });

    const handleFieldChange = (field: keyof ITPItem, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setIsDirty(true);
        setMainStatus('unsaved');
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
        }
    };

    const handleDateButton = (field: keyof ITPItem) => {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}_`;
        setFormData(prev => ({
            ...prev,
            [field]: prev[field] ? `${prev[field]}\n${dateStr}` : dateStr
        }));
    };

    const validate = () => {
        if (!itpId && (creationProjects.loading || creationProjects.error)) return false;
        const newErrors: { [key: string]: string } = {};
        if (!formData.vendor) newErrors.vendor = 'Contractor is required';

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const prepareDetailPayload = (src: InspectionItem[] = advancedItems) => {
        return {
            a: src.filter(i => i.phase === 'A').map(({ phase: _phase, ...rest }) => rest),
            b: src.filter(i => i.phase === 'B').map(({ phase: _phase, ...rest }) => rest),
            c: src.filter(i => i.phase === 'C').map(({ phase: _phase, ...rest }) => rest),
            checklist: [],
            self_inspection: null
        };
    };

    const handleItemsChange = async (newItems: InspectionItem[]) => {
        setAdvancedItems(newItems);
        setIsDirty(true);
        setPlanStatus('unsaved');
        if (onApplyItems && itpId) {
            // This is an immediate save, separate from the main Save/Publish flow (unchanged,
            // existing behavior) — reflect its real result rather than assuming success, since
            // onApplyItems shows its own error toast and never throws.
            const applied = await onApplyItems(prepareDetailPayload(newItems));
            setPlanStatus(applied ? 'saved' : 'failed');
        }
    };



    const handleClose = () => navigationGuard.requestClose(onClose, true);

    // Shared by handleSave/handlePublish: process ONE attachment-phase outcome. onSave throwing
    // (Phase 1, the record's own fields) is handled by each caller's own catch — this only runs
    // once Phase 1 has already succeeded.
    const applyOutcome = (outcome: SaveOutcome) => {
        // Prune only what THIS attempt actually confirmed — a delete/upload not mentioned here
        // (whether it failed outright or the response was ambiguous, e.g. a 404 or a dropped
        // connection) stays queued so the next Save retries exactly that, and only that.
        if (outcome.deletedIds.length > 0) {
            setDeletedFileIds(prev => prev.filter(id => !outcome.deletedIds.includes(id)));
        }
        if (outcome.uploadedPending) {
            setPendingFiles([]);
        }
        if (outcome.deletedIds.length > 0 || outcome.uploadedPending) {
            // Either changed the real attachment list on the server — re-fetch it so the
            // thumbnails reflect what's actually there now, whether or not the whole attempt
            // fully succeeded.
            setAttachmentSyncToken(t => t + 1);
        }
        setAttachmentsFailed(outcome.errors.length > 0);
        if (outcome.errors.length > 0) {
            // The record's own fields ARE saved at this point — a different situation from
            // Phase 1 failing outright, so this gets a distinctly worded, single notice. isDirty
            // stays true: there is still unfinished attachment work, so closing still confirms.
            toast.error(
                (t('itp.recordSavedPartialFailure') || 'Record saved, but some attachment steps did not complete') +
                '：' + outcome.errors.join('；')
            );
        } else {
            setIsDirty(false);
        }
    };

    const handleSave = async () => {
        if (validate()) {
            setSaving(true);
            try {
                const payload = { ...formData };
                delete payload.detail_data;
                // Computed whenever there's an existing record (itpId) OR the user has entered
                // inspection-plan items locally before the very first save — otherwise a
                // brand-new record's plan, filled in before Save was ever clicked, would be
                // silently dropped on the first save (itpId was still null at that point).
                // Unchanged for every existing record: itpId truthy always computes, exactly as
                // before, so a save that clears the last item still sends the now-empty payload
                // and correctly overwrites stale detail_data server-side.
                const detailPayload = (itpId || advancedItems.length > 0) ? prepareDetailPayload() : undefined;
                const { key: payloadKey, skip: skipRecordWrite } = isUnchangedSincePriorWrite({ payload, detailPayload }, lastWrittenPayloadKey);
                const outcome = await onSave(payload, detailPayload, pendingFiles, deletedFileIds, skipRecordWrite);
                if (!skipRecordWrite) setLastWrittenPayloadKey(payloadKey);
                // onSave resolving without throwing means the main record and the inspection
                // plan both reached a saved state (either just written, or correctly skipped
                // because unchanged since the last successful write — still saved either way).
                setMainStatus('saved');
                setPlanStatus('saved');
                applyOutcome(outcome);
            } catch (err) {
                if (err instanceof ItpMainSavedError) {
                    setMainStatus('saved');
                    setPlanStatus('unconfirmed');
                } else {
                    setMainStatus('failed');
                    setPlanStatus('failed');
                }
                toast.error(getErrorMessage(err, t('common.saveFailed')));
            } finally {
                setSaving(false);
            }
        }
    };

    // Publish now shows a ConfirmModal (built app UI, i18n-aware) instead of window.confirm,
    // and the confirm dialog must display the SAME target rev/status the actual save will use —
    // computed once here via getNextRevision (the exact call the write path already relied on),
    // never a second, possibly-drifting recomputation done later at confirm time. skipRecordWrite
    // (see isUnchangedSincePriorWrite above) is also decided here so the dialog can tell a genuine
    // publish (rev/status will actually change) apart from a retry that is really just finishing a
    // stalled attachment upload (main record already written at this exact rev/status — nothing
    // about it will change again).
    const [publishConfirm, setPublishConfirm] = useState<{
        payload: Partial<ITPItem>;
        detailPayload: any;
        payloadKey: string;
        skipRecordWrite: boolean;
        variant: 'new' | 'existing' | 'attachmentRetry';
        fromRev: string;
        toRev: string;
    } | null>(null);

    const handlePublishClick = () => {
        if (!validate()) return;

        const nextRev = getNextRevision(formData.rev || '');
        const payload = {
            ...formData,
            rev: nextRev,
            status: 'Approved'
        };
        delete payload.detail_data;
        const detailPayload = (itpId || advancedItems.length > 0) ? prepareDetailPayload() : undefined;
        const { key: payloadKey, skip: skipRecordWrite } = isUnchangedSincePriorWrite({ payload, detailPayload }, lastWrittenPayloadKey);

        const variant: 'new' | 'existing' | 'attachmentRetry' = !itpId ? 'new' : (skipRecordWrite ? 'attachmentRetry' : 'existing');

        setPublishConfirm({
            payload,
            detailPayload,
            payloadKey,
            skipRecordWrite,
            variant,
            fromRev: formData.rev || '',
            toRev: nextRev,
        });
    };

    const handlePublishConfirmed = async () => {
        // Closing the dialog before the request starts (rather than after) means the Confirm
        // button is gone from the DOM the instant it's clicked once — a second click has nothing
        // left to hit, so this alone prevents a duplicate submission from the dialog itself. The
        // Publish button's own `disabled={saving || ...}` covers the rest of the async window.
        if (!publishConfirm || saving) return;
        const { payload, detailPayload, payloadKey, skipRecordWrite } = publishConfirm;
        setPublishConfirm(null);
        setSaving(true);
        try {
            const outcome = await onSave(payload, detailPayload, pendingFiles, deletedFileIds, skipRecordWrite);
            if (!skipRecordWrite) setLastWrittenPayloadKey(payloadKey);
            setMainStatus('saved');
            setPlanStatus('saved');
            applyOutcome(outcome);
        } catch (err) {
            // onSave now rethrows real failures (see ITP.tsx) instead of
            // swallowing them — without this catch, a failed Publish would
            // throw uncaught here with no visible message.
            if (err instanceof ItpMainSavedError) {
                setMainStatus('saved');
                setPlanStatus('unconfirmed');
            } else {
                setMainStatus('failed');
                setPlanStatus('failed');
            }
            toast.error(getErrorMessage(err, t('common.saveFailed')));
        } finally {
            setSaving(false);
        }
    };

    const handlePublishCancel = () => {
        // No write request of any kind is sent on cancel.
        setPublishConfirm(null);
    };

    const publishConfirmMessage = publishConfirm
        ? publishConfirm.variant === 'new'
            ? (t('itp.publishConfirmNewRecord') || 'This is a new ITP. Confirming will create it at {rev} with status Approved.').replace('{rev}', publishConfirm.toRev)
            : publishConfirm.variant === 'attachmentRetry'
                ? (t('itp.publishConfirmAttachmentRetry') || 'The main record and revision were already saved by an earlier publish. This retry only re-attempts the pending attachment upload — it will not change the revision or status again.')
                : (t('itp.publishConfirmExisting') || 'Publish this ITP? The revision will change from {fromRev} to {toRev}, and the status will become Approved.')
                    .replace('{fromRev}', publishConfirm.fromRev)
                    .replace('{toRev}', publishConfirm.toRev)
        : '';



    const [generatingChecklist, setGeneratingChecklist] = useState(false);

    // Shown as a title tooltip AND an inline caption next to the (still-visible, permission-gated)
    // button when it's disabled for a reason the user can fix themselves — distinct from a
    // permission problem, which can only be discovered by actually attempting the call (handled
    // in the catch block below).
    const generateChecklistDisabledReason = !itpId
        ? (t('itp.generateChecklistNeedsSaveFirst') || 'Please save the ITP before generating a checklist.')
        : advancedItems.length === 0
            ? (t('itp.generateChecklistNeedsItems') || 'Add at least one inspection item before generating a checklist.')
            : '';

    const handleGenerateChecklist = async () => {
        if (!itpId) {
            toast.error(t('itp.generateChecklistNeedsSaveFirst') || 'Please save the ITP first.');
            return;
        }
        if (advancedItems.length === 0) {
            toast.error(t('itp.generateChecklistNeedsItems') || 'No inspection items to generate checklist from.');
            return;
        }

        const checklistItems = advancedItems.map((item, idx) => {
            const activityText = typeof item.activity === 'string' ? item.activity : (item.activity.en || '');
            const criteriaText = Array.isArray(item.criteria)
                ? item.criteria.map((c: any) => typeof c === 'string' ? c : c.en || '').filter(Boolean).join('; ')
                : typeof item.criteria === 'string' ? item.criteria : '';

            return {
                id: idx + 1,
                item: `[${item.id}] ${activityText}`,
                criteria: criteriaText || activityText,
                situation: '',
                result: ''
            };
        });

        const detailData = JSON.stringify({
            projectTitle: formData.description || '',
            recordsNo: '',
            packageName: '',
            inspectionDate: new Date().toISOString().split('T')[0],
            location: '',
            stage: '',
            items: checklistItems,
            remarks: '',
            signatures: { siteEngineer: '', constructionLeader: '', subcontractorRep: '' }
        });

        setGeneratingChecklist(true);
        try {
            const res = await api.post('/checklist/', {
                date: new Date().toISOString().split('T')[0],
                status: 'Ongoing',
                activity: formData.description || 'ITP Checklist',
                itpId: itpId,
                itpVersion: formData.rev || '',
                contractor: formData.vendor || '',
                detail_data: detailData,
            });

            const newRecordNo = res.data.recordsNo || res.data.records_no;
            toast.success(`Checklist ${newRecordNo} created successfully`);
            navigate(`/checklist?openId=${newRecordNo}&from=itp`);
        } catch (err) {
            // A 403 here means checklist:create:all was revoked between the button rendering and
            // this click — the raw backend detail string names the required permission code
            // verbatim (e.g. "Operation not permitted. Required: checklist:create:all"), which
            // must never be shown to the user. Every other failure (network, 5xx, validation) uses
            // the existing friendly getErrorMessage helper. Nothing in the form is cleared or
            // reset either way — the user's inspection plan input is untouched.
            if (getErrorStatusCode(err) === 403) {
                toast.error(t('itp.generateChecklistPermissionLost') || 'You no longer have permission to create a checklist.');
            } else {
                toast.error(getErrorMessage(err, t('itp.generateChecklistFailed') || 'Failed to generate checklist'));
            }
        } finally {
            setGeneratingChecklist(false);
        }
    };

    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [deletedFileIds, setDeletedFileIds] = useState<string[]>([]);
    const navigationGuard = useLeaveGuard(isDirty || pendingFiles.length > 0 || deletedFileIds.length > 0, saving);
    // Bumped after a successful upload/delete so FileAttachment's entityType/entityId auto-fetch
    // re-queries the live attachment list (the actual source of truth for real attachments —
    // see the FileAttachment usage below) instead of showing stale data from before the save.
    const [attachmentSyncToken, setAttachmentSyncToken] = useState(0);
    // JSON.stringify({payload, detailPayload}) from the last successfully written attempt this
    // session (a serialized-string key, not a semantic/deep-equality snapshot — see
    // utils/attachmentOutcome.ts::isUnchangedSincePriorWrite). A retry after an attachment-only
    // failure whose current {payload, detailPayload} serializes to the SAME string must not
    // re-send that write — confirmed (before this fix) to create a second, identical audit_logs
    // UPDATE/UPDATE_DETAIL pair on every retry, including for Publish (a real duplicate-publish
    // event, not just a harmless idempotent overwrite). Any change to either payload or
    // detailPayload — including a detail-only edit — produces a different string, so it is never
    // skipped; in particular this means a main-record success with a FAILED detail write is never
    // mistaken for "fully written", since the combined key only updates once both succeed.
    const [lastWrittenPayloadKey, setLastWrittenPayloadKey] = useState<string | null>(null);

    const handlePendingFilesChange = (files: File[]) => {
        setPendingFiles(files);
    };

    const handleDeleteExistingFile = (fileId: string) => {
        // Real (Attachment-table) files are sourced live via entityType/entityId (see the
        // FileAttachment usage below) — formData.attachments holds ONLY legacy strings, so there
        // is nothing to remove from it here. (Code-read finding, not reproduced live before this
        // fix: the previous version of this filter — `.filter(a => typeof a !== 'string' &&
        // a.id !== fileId)` — would drop every legacy string whenever this fired, since a string
        // entry always fails `typeof a !== 'string'`. Before this same change, no real "existing"
        // attachment ever rendered a delete button at all — see the entityType/entityId fetch fix
        // below — so this call site was not reachable through the UI to confirm the old behavior
        // directly; it is reported here as a static-analysis finding on the pre-fix code, not as
        // an observed regression.)
        setDeletedFileIds(prev => [...prev, fileId]);
    };

    const handleRemoveLegacyAttachment = (index: number) => {
        // `index` is into the SAME filtered legacy-strings array passed as `legacyAttachments`
        // below — walk formData.attachments in order, counting only string entries, so this
        // removes exactly the Nth legacy string (correct even with duplicate values, and leaves
        // any stray non-string entry from old data untouched rather than mis-targeting it).
        setFormData(prev => {
            let legacyCount = -1;
            const next = (prev.attachments || []).filter((a) => {
                if (typeof a !== 'string') return true;
                legacyCount += 1;
                return legacyCount !== index;
            });
            return { ...prev, attachments: next };
        });
    };

    // Attachments have no independently-tracked dirty flag — see the state declarations above —
    // whether they're fully saved is always exactly "is anything still queued".
    const attachmentsPendingCount = pendingFiles.length + deletedFileIds.length;
    const attachmentsStatus: 'saved' | 'pending' | 'failed' = attachmentsPendingCount === 0
        ? 'saved'
        : (attachmentsFailed ? 'failed' : 'pending');

    const statusBadgeStyle: Record<string, string> = {
        saved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        unsaved: 'bg-amber-50 text-amber-700 border-amber-200',
        pending: 'bg-amber-50 text-amber-700 border-amber-200',
        unconfirmed: 'bg-orange-50 text-orange-700 border-orange-200',
        failed: 'bg-red-50 text-red-700 border-red-200',
    };
    const statusBadgeText = (status: 'saved' | 'unsaved' | 'unconfirmed' | 'failed' | 'pending') => {
        switch (status) {
            case 'saved': return t('itp.saveStatusSaved') || 'Saved';
            case 'unsaved': return t('itp.saveStatusUnsaved') || 'Unsaved';
            case 'unconfirmed': return t('itp.saveStatusUnconfirmed') || 'Unconfirmed';
            case 'failed': return t('itp.saveStatusFailed') || 'Save failed';
            case 'pending': return t('itp.saveStatusPending') || 'Not yet processed';
        }
    };
    const StatusBadge = ({ label, status }: { label: string; status: 'saved' | 'unsaved' | 'unconfirmed' | 'failed' | 'pending' }) => (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusBadgeStyle[status]}`}>
            {label}：{statusBadgeText(status)}
        </span>
    );

    return (
        <>
        <div className={formStyles.modalOverlay} style={{ padding: 0 }}>
            <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '100%', width: '100%', height: '100%', maxHeight: 'none', borderRadius: 0 }}>
                <div className={formStyles.modalHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <BackButton onClick={handleClose} label={t('common.back')} />
                        <h2>{existingItem ? t('itp.editTitle') : t('itp.addTitle')}</h2>
                    </div>
                    <button className={formStyles.closeButton} aria-label={t('common.close')} title={t('common.close')} onClick={handleClose}>×</button>
                </div>

                <div className={formStyles.tabsContainer}>
                    <button
                        className={`${formStyles.tabButton} ${activeTab === 'general' ? formStyles.activeTab : ''}`}
                        onClick={() => setActiveTab('general')}
                    >
                        {t('itp.tab.generalInfo') || 'General Info'}
                    </button>
                    <button
                        className={`${formStyles.tabButton} ${activeTab === 'plan' ? formStyles.activeTab : ''}`}
                        onClick={() => setActiveTab('plan')}
                    >
                        {t('itp.tab.inspectionPlan') || 'Inspection Plan'}
                        {` (${advancedItems.length})`}
                    </button>

                </div>

                {/* Persistent save-status bar — visible regardless of which tab is active, so a
                    change made in one tab is never "invisible" while the user is looking at the
                    other one. Reflects the actual last-save result per area; never collapses all
                    three into a single "saved"/"unsaved" flag. */}
                <div className="flex flex-wrap items-center gap-2 px-6 py-2 bg-slate-50 border-b border-slate-200 print:hidden">
                    <StatusBadge label={t('itp.saveStatusMain') || 'Main Record'} status={mainStatus} />
                    <StatusBadge label={t('itp.saveStatusPlan') || 'Inspection Plan'} status={planStatus} />
                    <StatusBadge label={t('itp.saveStatusAttachments') || 'Attachments'} status={attachmentsStatus} />
                </div>

                <div className={formStyles.modalBody}>
                    <p className={formStyles.formRequiredHint}>{t('form.requiredHint')}</p>

                    {activeTab === 'general' && (
                        <div className={formStyles.formSections}>
                            <fieldset disabled={formReadOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }}>
                            <div className={formStyles.formSection}>
                                <h3 className={formStyles.sectionTitle}>{t('itp.infoSection')}</h3>
                                {!itpId && <CreationProjectField state={creationProjects} value={formData.project_id}
                                    onChange={value => handleFieldChange('project_id', value)} />}

                                <div className={formStyles.formGrid}>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('itp.referenceNo')}</label>
                                        <input
                                            type="text"
                                            className={formStyles.formInput}
                                            value={formData.referenceNo || t('form.autoGenerated')}
                                            readOnly
                                            style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: formData.referenceNo ? '#000000' : '#666666' }}
                                        />
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('itp.description')}</label>
                                        <input
                                            type="text"
                                            className={formStyles.formInput}
                                            value={formData.description || ''}
                                            onChange={(e) => handleFieldChange('description', e.target.value)}
                                        />
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label className={formStyles.requiredLabel}>{t('itp.vendor')}</label>
                                        <select
                                            className={`${formStyles.formSelect} ${errors.vendor ? formStyles.errorInput : ''}`}
                                            value={formData.vendor || ''}
                                            onChange={(e) => handleFieldChange('vendor', e.target.value)}
                                        >
                                            <option value="">{t('itp.selectContractor')}</option>
                                            {getActiveContractors().map((contractor) => (
                                                <option key={contractor.id} value={contractor.name}>
                                                    {contractor.name}
                                                </option>
                                            ))}
                                        </select>
                                        {errors.vendor && <span className={formStyles.errorMessage}>{errors.vendor}</span>}
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('itp.submissionDate')}</label>
                                        <input
                                            type={formData.submissionDate ? 'date' : 'text'}
                                            placeholder="mm/dd/yyyy"
                                            lang="en"
                                            onFocus={(e) => (e.target.type = 'date')}
                                            onBlur={(e) => {
                                                if (!e.target.value) e.target.type = 'text';
                                            }}
                                            className={formStyles.formInput}
                                            value={formData.submissionDate || ''}
                                            onChange={(e) => handleFieldChange('submissionDate', e.target.value)}
                                        />
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('common.dueDate')}</label>
                                        <input
                                            type="date"
                                            lang="en"
                                            className={formStyles.formInput}
                                            value={(formData as any).dueDate || ''}
                                            onChange={(e) => handleFieldChange('dueDate' as any, e.target.value)}
                                        />
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('itp.rev')}</label>
                                        {revMode === 'select' && (
                                            <select
                                                className={formStyles.formSelect}
                                                value={REV_OPTIONS.includes(formData.rev || '') ? formData.rev : 'Rev1.0'}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    if (value === 'custom') {
                                                        setRevMode('custom');
                                                        handleFieldChange('rev', '');
                                                    } else {
                                                        setRevMode('select');
                                                        handleFieldChange('rev', value);
                                                    }
                                                }}
                                            >
                                                {REV_OPTIONS.map((r) => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                                <option value="custom">{t('itp.revSelectCustom')}</option>
                                            </select>
                                        )}
                                        {revMode === 'custom' && (
                                            <input
                                                type="text"
                                                className={formStyles.formInput}
                                                value={formData.rev || ''}
                                                onChange={(e) => handleFieldChange('rev', e.target.value)}
                                                placeholder={t('itp.revPlaceholder')}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                            </fieldset>

                            {/* Attachments — gated on itp:update:all REGARDLESS of new-vs-existing (upload
                                always requires it, even for a record the caller just created — a confirmed
                                backend behavior, not a policy this batch changes). Explained up front so a
                                create-only user never selects files only to hit a 403 after Save. */}
                            <div className={formStyles.formSection}>
                                {attachmentReadOnly && (
                                    <p style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                                        {t('itp.attachmentsNeedUpdatePermission') || 'You can create the main record and inspection plan. Attachments require someone with update permission.'}
                                    </p>
                                )}
                                <FileAttachment
                                    legacyAttachments={(formData.attachments || []).filter((a): a is string => typeof a === 'string')}
                                    syncToken={attachmentSyncToken}
                                    onPendingFilesChange={handlePendingFilesChange}
                                    onDeleteExistingFile={handleDeleteExistingFile}
                                    onRemoveLegacy={handleRemoveLegacyAttachment}
                                    entityType="itp"
                                    entityId={existingItem?.id}
                                    category="attachment"
                                    id="attachment"
                                    readOnly={attachmentReadOnly}
                                />
                            </div>

                            <fieldset disabled={formReadOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }}>
                            {/* Quality Assessment */}
                            <div className={formStyles.formSection}>
                                <h3 className={formStyles.sectionTitle}>{t('pqp.qualityAssessment')}</h3>
                                <div className={formStyles.formGrid}>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('itp.status')}</label>
                                        {(() => {
                                            // Legal targets are computed from the LAST-SAVED status (existingItem.status
                                            // — for a brand-new, not-yet-saved record, the creation flow's own starting
                                            // status, 'Pending', per handleAddNew), NEVER from formData.status (the
                                            // live, possibly-unsaved selection). Using formData.status here would let a
                                            // user pick a legal target, not save, reopen the dropdown, and see options
                                            // computed from THAT unsaved selection — silently unlocking a next step the
                                            // real (saved) current status does not actually allow. formData.status is
                                            // only used below to bind the <select>'s live value, never to decide what
                                            // is offered.
                                            const baselineStatus = existingItem?.status || 'Pending';
                                            const currentStatus = formData.status || 'Pending';
                                            // Unknown baseline status (e.g. legacy data, or a value this UI has never
                                            // labeled) -> zero legal targets, exactly mirroring the backend's own
                                            // `rules.get(current_status, [])` fallback in WorkflowEngine.validate_transition.
                                            const legalTargets = ITP_STATUS_TRANSITIONS[baselineStatus] || [];
                                            const statusLabel = (status: string): string => {
                                                switch (status) {
                                                    case 'Approved': return t('itp.status.approved');
                                                    case 'Approved with comments': return t('itp.status.approvedWithComments');
                                                    case 'Revise & Resubmit': return t('itp.status.reviseResubmit');
                                                    case 'Rejected': return t('itp.status.rejected');
                                                    case 'Pending': return t('itp.status.pending');
                                                    case 'No submit': return t('itp.status.noSubmit');
                                                    case 'Void': return t('itp.status.void');
                                                    default: return status; // e.g. "Draft", or an unrecognized historical value
                                                }
                                            };
                                            // A NEW target (not the current value) is offered only when the backend
                                            // would actually accept it AND, for the approve/void-gated statuses, the
                                            // caller holds that specific permission (unchanged from before this batch
                                            // — see the ITP approve/void authorization batch; not re-decided here).
                                            const requiresPermission = (status: string): boolean => {
                                                if (status === 'Approved' || status === 'Approved with comments') return canApprove;
                                                if (status === 'Void') return canVoid;
                                                return true;
                                            };
                                            const isUnrecognized = !ITP_ALL_KNOWN_STATUSES.includes(baselineStatus);
                                            const options = ITP_ALL_KNOWN_STATUSES.filter(
                                                status => status === baselineStatus || (legalTargets.includes(status) && requiresPermission(status))
                                            );
                                            return (
                                                <>
                                                    <select
                                                        className={formStyles.formSelect}
                                                        value={currentStatus}
                                                        onChange={(e) => handleFieldChange('status', e.target.value)}
                                                    >
                                                        {isUnrecognized && (
                                                            <option value={baselineStatus}>{baselineStatus} ({t('itp.status.unrecognized') || 'unrecognized status'})</option>
                                                        )}
                                                        {options.map(status => (
                                                            <option key={status} value={status}>{statusLabel(status)}</option>
                                                        ))}
                                                    </select>
                                                    {isUnrecognized && (
                                                        <span style={{ display: 'block', fontSize: 11, color: '#92400e', marginTop: 4 }}>
                                                            {t('itp.status.unrecognizedHint') || 'This record has a status this screen does not recognize. It is shown as-is and not converted to any other value.'}
                                                        </span>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                    <div className={formStyles.formGroupFull}>
                                        <div className={formStyles.labelWithButton}>
                                            <label className={formStyles.optionalLabel}>{t('common.remark')}</label>
                                            <button
                                                type="button"
                                                className={formStyles.tbcButton}
                                                onClick={() => handleDateButton('remark')}
                                            >
                                                {t('common.addDate')}
                                            </button>
                                        </div>
                                        <textarea
                                            className={formStyles.formTextarea}
                                            value={formData.remark || ''}
                                            onChange={(e) => handleFieldChange('remark', e.target.value)}
                                            rows={3}
                                        />
                                    </div>
                                </div>
                            </div>
                            </fieldset>

                            {existingItem?.id && (
                                <RelatedDocuments entityType="itp" entityId={existingItem.id} />
                            )}
                        </div>
                    )}

                    {activeTab === 'plan' && (
                        <div className={`${formStyles.formSections} p-0!`}>
                            <ITPAdvancedEditor
                                ref={editorRef}
                                items={advancedItems}
                                onItemsChange={handleItemsChange}
                                readOnly={formReadOnly}
                                onViewRecord={() => {
                                    navigate('/itr');
                                }}
                                headerData={headerData}
                            />
                            {/* <div className="mt-2 text-center text-xs text-slate-500 print:hidden">
                                Note: Changes to the inspection plan are saved when you click "Save" below.
                            </div> */}
                        </div>
                    )}
                </div>

                    <FormActions
                        tools={<>
                            {activeTab === 'plan' && (
                                <button className={actionStyles.secondary}
                                    type="button"
                                    onClick={handlePrint}
                                >
                                    <Printer size={16} /> {t('itp.actionPrint') || 'Print'}
                                </button>
                            )}
                            {canCreateChecklist && activeTab === 'plan' && (
                                <div className="flex flex-col items-start gap-1 print:hidden">
                                    <button className={actionStyles.secondary}
                                        type="button"
                                        onClick={handleGenerateChecklist}
                                        disabled={generatingChecklist || !!generateChecklistDisabledReason}
                                        title={generateChecklistDisabledReason || undefined}
                                    >
                                        <ClipboardList size={16} /> {generatingChecklist ? (t('itp.generatingChecklist') || 'Generating...') : (t('itp.generateChecklist') || 'Generate Checklist')}
                                    </button>
                                    {generateChecklistDisabledReason && (
                                        <span className="text-xs text-slate-500">{generateChecklistDisabledReason}</span>
                                    )}
                                </div>
                            )}
                            {activeTab === 'plan' && !formReadOnly && (
                                <button className={actionStyles.secondary}
                                    onClick={() => editorRef.current?.handleAddNew()}
                                >
                                    <Plus size={16} strokeWidth={3} /> {t('itp.actionAddNewItem') || 'Add New Item'}
                                </button>
                            )}
                        </>}
                        secondary={<>
                            {canApprove && !formReadOnly && (
                                <button className={actionStyles.workflow}
                                    onClick={handlePublishClick}
                                    disabled={saving || !!publishConfirm || (!itpId && (creationProjects.loading || creationProjects.error))}
                                >
                                    <ShieldCheck size={16} /> {t('itp.actionPublish') || 'Publish'}
                                </button>
                            )}
                        </>}
                        cancel={<>
                            <button className={actionStyles.secondary} onClick={handleClose} disabled={saving || (!itpId && (creationProjects.loading || creationProjects.error))}>
                                {formReadOnly ? t('common.close') : t('common.cancel')}
                            </button>
                        </>}
                        primary={<>
                            {!formReadOnly && (
                                <button className={actionStyles.primary} onClick={handleSave} disabled={saving || (!itpId && (creationProjects.loading || creationProjects.error))}>
                                    {saving ? <LayoutTemplate size={16} className="animate-spin" /> : <Save size={16} />}
                                    {t('common.save')}
                                </button>
                            )}
                        </>}
                    />
                {/* Print Portal */}
                {isPrinting && ReactDOM.createPortal(
                    <ITPPrintTemplate
                        items={advancedItems}
                        headerData={headerData}
                    />,
                    document.body
                )}

            </div>




        </div >



        <ConfirmModal
            intent="primary"
            isOpen={!!publishConfirm}
            title={t('itp.publishConfirmTitle') || 'Confirm Publish'}
            message={publishConfirmMessage}
            confirmText={t('itp.publishConfirmAction') || 'Publish'}
            cancelText={t('common.cancel')}
            onConfirm={handlePublishConfirmed}
            onCancel={handlePublishCancel}
        />
        </>
    );
};
