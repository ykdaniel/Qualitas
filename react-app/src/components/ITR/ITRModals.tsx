import { useDraftGuard } from '../Shared/LeaveGuard';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ChecklistSnapshotModal } from './ChecklistSnapshotModal';
import { useChecklistStore } from '../../store/checklistStore';
import { ShieldCheck, ClipboardCheck, ArrowRight, AlertCircle, Info } from 'lucide-react';
import { getNextRevision } from '../../utils/revision';
import { useLanguage } from '../../context/LanguageContext';
import ITRApprovalHistoryModal from './ITRApprovalHistoryModal';
import { useAuth } from '../../context/AuthContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useNOIStore } from '../../store/noiStore';
import { useNCRStore } from '../../store/ncrStore';
import { useOBSStore } from '../../store/obsStore';
import { useITRStore } from '../../store/itrStore';
import type { ITRItem } from '../../store/itrStore';
import { useITPStore } from '../../store/itpStore';
import { validateStatusTransition, ITRStatusTransitions } from '../../utils/statusValidation';
import { addSevenWorkingDays } from '../../utils/dateUtils';
import { formatDateISO } from '../../utils/formatters';
import {
    AttachmentInfo,
    getChecklists,
    updateChecklist,
    linkChecklistToITR,
    unlinkChecklistFromITR,
    createNcrFromItr,
    createReinspectionItr,
    revokeItrApproval,
    exportItrDocx,
    type ChecklistRecordApi,
} from '../../services/api';
import FileAttachment from '../Shared/FileAttachment';
import ImagePreviewOverlay from '../Shared/ImagePreviewOverlay';
import { CollapsibleSection } from '../Shared/CollapsibleSection';
import RelatedDocuments from '../ui/RelatedDocuments';
import ConfirmModal from '../Shared/ConfirmModal';
import { itemCounts, summarizeItems, ongoingProgress, isNaPending, failuresSoFar, classifyResult } from '../../utils/checklistResult';
import styles from './ITR.module.css';

import formStyles from '../Shared/FormShell.module.css';
export interface PendingUploads {
    category: string;
    files: File[];
}

export interface ITRDetailData {
    itrNumber: string;
    status: string;
    raiseDate: string;
    closeoutDate: string;
    aconex: string;
    type: string;
    contractor: string;
    remark: string;
    subject: string;
    referenceStandards: string;
    detailsDescription: string;
    foundLocation: string;
    ncrNumber: string;  // 若檢驗失敗，連結到產生的 NCR
    raisedBy: string;
    serialNumbers: string;
    repairMethodStatement: string;
    immediateCorrectionAction: string;
    rootCauseAnalysis: string;
    correctiveActions: string;
    preventiveAction: string;
    finalProductIntegrityStatement: string;
    reInspectionNumber: string;
    noiNumber: string;  // 連結到產生此 ITR 的 NOI
    projectQualityManager: string;
    defectPhotos: (string | AttachmentInfo)[];
    improvementPhotos: (string | AttachmentInfo)[];
    attachments: (string | AttachmentInfo)[];
    eventNumber: string;
    checkpoint: string;
    dueDate?: string;
    itpNo: string;
    drawings: (string | AttachmentInfo)[];
    certificates: (string | AttachmentInfo)[];
    linkedChecklists: any[]; // Snapshot
    inspectionResult: string; // Pass / Fail / Conditional — drives Q-Workflow checkpoints 3 & 7
}

export interface ITRDetailModalProps {
    itrId: string | null;
    existingData?: ITRDetailData;
    existingItem?: ITRItem;
    itrList: ITRItem[];
    onSave: (details: ITRDetailData, pendingUploads: PendingUploads[], deletedFileIds: string[], publishOnly?: boolean) => void | Promise<void>;
    onClose: () => void;
    // Plain "close the modal, don't run onClose's deep-link back-navigation" —
    // used when this modal is about to navigate elsewhere itself (Raise
    // NCR / Re-inspect), so it doesn't fight with onClose's own navigate(-1)
    // when this modal happened to be opened via ?openId=.
    onDismiss?: () => void;
    // Called after a revoke-approval succeeds, so the parent can reload the
    // backend state (refetch) and close/reopen this modal against it.
    onRevoked?: () => void | Promise<void>;
    readOnly?: boolean;
}

export const ITRDetailModal: React.FC<ITRDetailModalProps> = ({ itrId, existingData, existingItem, itrList: _propItrList, onSave, onClose, onDismiss, onRevoked, readOnly = false }) => {
    const { t } = useLanguage();
    const { hasPermission } = useAuth();
    const { getActiveContractors } = useContractorsStore();
    const navigate = useNavigate();

    const noiList = useNOIStore(state => state.noiList);
    const getNOIList = () => noiList;
    const ncrList = useNCRStore(state => state.ncrList);
    const obsList = useOBSStore(state => state.obsList);
    


    const allChecklists = useChecklistStore(state => state.records);
    // Lookup for the "source template" display on each linked instance —
    // allChecklists only ever holds templates (see checklistStore.ts /
    // backend's default itrId=NULL list filter), so this never resolves to
    // another instance.
    const templateById = useMemo(
        () => new Map(allChecklists.map(c => [c.id, c])),
        [allChecklists]
    );
    const itpList = useITPStore(state => state.itpList);

    // Initialize form data from existing data or existing item
    const getInitialData = (): ITRDetailData => {
        if (existingData) {
            return { ...existingData };
        }
        if (existingItem) {
            const dd = (existingItem.detail_data && typeof existingItem.detail_data === 'object')
                ? existingItem.detail_data as Record<string, any>
                : {};
            return {
                itrNumber: existingItem.documentNumber || '',  // 既有編號，顯示用
                status: existingItem.status || 'In Progress',
                raiseDate: existingItem.raiseDate || '',
                closeoutDate: existingItem.closeoutDate || '',
                aconex: existingItem.aconex || '',
                type: existingItem.type || '',
                contractor: existingItem.vendor || '',
                remark: existingItem.remark || '',
                subject: existingItem.subject || existingItem.description || '',
                referenceStandards: dd.referenceStandards || '',
                detailsDescription: existingItem.description || '',
                foundLocation: existingItem.foundLocation || '',
                ncrNumber: existingItem.ncrNumber || '',
                raisedBy: existingItem.raisedBy || '',
                serialNumbers: dd.serialNumbers || '',
                repairMethodStatement: dd.repairMethodStatement || '',
                immediateCorrectionAction: dd.immediateCorrectionAction || '',
                rootCauseAnalysis: dd.rootCauseAnalysis || '',
                correctiveActions: dd.correctiveActions || '',
                preventiveAction: dd.preventiveAction || '',
                finalProductIntegrityStatement: dd.finalProductIntegrityStatement || '',
                reInspectionNumber: dd.reInspectionNumber || '',
                noiNumber: existingItem.noiNumber || '',  // 連結到產生此 ITR 的 NOI
                eventNumber: existingItem.eventNumber || '',
                checkpoint: existingItem.checkpoint || '',
                projectQualityManager: dd.projectQualityManager || '',
                defectPhotos: existingItem.defectPhotos || [],
                improvementPhotos: existingItem.improvementPhotos || [],
                attachments: existingItem.attachments || [],
                dueDate: existingItem.dueDate || (existingItem.raiseDate ? addSevenWorkingDays(formatDateISO(existingItem.raiseDate)) : ''),
                itpNo: existingItem.itpNo || dd.itpNo || '',
                drawings: dd.drawings || existingItem.drawings || [],
                certificates: dd.certificates || existingItem.certificates || [],
                linkedChecklists: existingItem.linkedChecklists || dd.linkedChecklists || [],
                inspectionResult: existingItem.inspectionResult || '',
            };
        }
        // 新項目：itrNumber 留空，由後端自動產生
        return {
            itrNumber: '',  // 由後端產生
            status: 'In Progress',
            raiseDate: '',
            closeoutDate: '',
            aconex: '',
            type: '',
            contractor: '',
            remark: '',
            subject: '',
            referenceStandards: '',
            detailsDescription: '',
            foundLocation: '',
            ncrNumber: '',
            raisedBy: '',
            serialNumbers: '',
            repairMethodStatement: '',
            immediateCorrectionAction: '',
            rootCauseAnalysis: '',
            correctiveActions: '',
            preventiveAction: '',
            finalProductIntegrityStatement: '',
            reInspectionNumber: '',
            noiNumber: '',  // 連結到產生此 ITR 的 NOI
            eventNumber: '',
            checkpoint: '',
            projectQualityManager: '',
            defectPhotos: [],
            improvementPhotos: [],
            attachments: [],
            dueDate: '',
            itpNo: '',
            drawings: [],
            certificates: [],
            linkedChecklists: [],
            inspectionResult: '',

        };
    };

    const [formData, setFormData] = useState<ITRDetailData>(getInitialData());

    // Related ITP is derived live from the linked NOI (noi.itpNo -> itp.referenceNo), not stored
    // on the ITR itself — confirmed by reading backend/models.py and backend/schemas.py that ITR
    // has no persisted itpNo column; the old <select> here let a user pick a value that was
    // silently discarded on save (ITR-INPUT-UX-2026-001 finding). Deriving it fresh on every
    // render, from data already loaded for the NOI select above, is correct both right after
    // picking a NOI and after reopening a saved record — there is nothing to desync.
    const relatedItp = useMemo(() => {
        if (!formData.noiNumber) return null;
        const linkedNoi = noiList.find(n => n.referenceNo === formData.noiNumber);
        if (!linkedNoi?.itpNo) return null;
        return itpList.find(i => i.referenceNo === linkedNoi.itpNo) || null;
    }, [formData.noiNumber, noiList, itpList]);
    const [showPrintPreview, setShowPrintPreview] = useState(false);

    // Attachment preview (BACKLOG #23, 2026-10-05): FileAttachment's thumbnail click only
    // fires if the parent supplies onPreview — ITR's 5 FileAttachment blocks below never did,
    // so clicking any photo silently did nothing. Same handlePreview/ImagePreviewOverlay
    // pattern already used by OBS/NCR/OSD/NOI.
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState<string>('');
    const handlePreview = (url: string, name?: string) => {
        setPreviewUrl(url);
        setPreviewName(name || '');
    };

    const [pendingUploads, setPendingUploads] = useState<PendingUploads[]>([
        { category: 'defectPhoto', files: [] },
        { category: 'improvementPhoto', files: [] },
        { category: 'attachment', files: [] },
        { category: 'drawing', files: [] },
        { category: 'certificate', files: [] },
    ]);
    const [deletedFileIds, setDeletedFileIds] = useState<string[]>([]);

    // §17: linked checklists are now standalone INSTANCE rows fetched from the
    // backend (Checklist with itrId = this ITR), not snapshots in detail_data.
    const persistedItrId = existingItem?.id || null;
    const [instances, setInstances] = useState<ChecklistRecordApi[]>([]);
    const [expandedInstanceId, setExpandedInstanceId] = useState<string | null>(null);

    const refreshInstances = useCallback(async () => {
        if (!persistedItrId) { setInstances([]); return; }
        try {
            setInstances(await getChecklists({ itrId: persistedItrId } as any));
        } catch { /* non-fatal: list just stays as-is */ }
    }, [persistedItrId]);

    useEffect(() => { refreshInstances(); }, [refreshInstances]);

    // Parse an instance's stored items (detail_data JSON) for the editor.
    const parseInstance = (inst: ChecklistRecordApi) => {
        let dd: any = {};
        try {
            dd = inst.detail_data
                ? (typeof inst.detail_data === 'string' ? JSON.parse(inst.detail_data) : inst.detail_data)
                : {};
        } catch { dd = {}; }
        return { ...inst, ...dd, data: dd, items: dd.items || dd.data?.items || [] };
    };

    // Link a template → backend creates an ITR-owned instance copy.
    const linkTemplate = async (templateId: string) => {
        if (!persistedItrId) {
            toast.warning(t('itr.saveBeforeChecklist') || '請先儲存 ITR，再加入檢查表。');
            return;
        }
        try {
            await linkChecklistToITR(persistedItrId, templateId);
            await refreshInstances();
        } catch (e: any) {
            toast.error(e?.response?.data?.detail || (e as Error)?.message || 'Failed to link checklist');
        }
    };

    // Persist edits to an instance (the inspection results live on this row).
    const saveInstance = async (instanceId: string, snap: any) => {
        const items = snap.data?.items || snap.items || [];
        // Counts are exactly the number of O / X items — the backend rejects
        // any other value, and never trusts these for a Pass on their own.
        const { passCount, failCount } = itemCounts(items);
        try {
            await updateChecklist(instanceId, {
                status: snap.status,
                location: snap.location,
                date: snap.date,
                detail_data: JSON.stringify({ ...(snap.data || {}), items }),
                passCount,
                failCount,
            });
            setExpandedInstanceId(null);
            await refreshInstances();
        } catch (e: any) {
            toast.error(e?.response?.data?.detail || (e as Error)?.message || 'Failed to save checklist');
            // Rethrow so the snapshot panel stays open with every entry
            // (including any N/A reasons) intact instead of closing on failure.
            throw e;
        }
    };

    // Reopen a closed (Pass/Fail) instance. Sends ONLY the status change — the
    // results, observations and N/A reasons stay exactly as saved, nothing is
    // cleared or rewritten. The backend's own Reopen path enforces
    // checklist:close:all, the parent-ITR lock and the audit entry. A failed
    // request rejects (the panel stays locked and shows why); the panel only
    // unlocks once the reloaded backend state actually says Ongoing.
    const reopenInstance = async (instanceId: string): Promise<{ reloaded: boolean }> => {
        await updateChecklist(instanceId, { status: 'Ongoing' });
        try {
            setInstances(await getChecklists({ itrId: persistedItrId } as any));
        } catch {
            toast.warning(t('checklist.reopen.reloadFailed'));
            return { reloaded: false };
        }
        toast.success(t('checklist.reopen.success'));
        return { reloaded: true };
    };

    // Backward-compat alias for the few read-only references below.
    const linkedChecklists = instances;
    // Ongoing checklists that are Ongoing for a reason the user must see (same rule/wording as the snapshot and the
    // list rows): "contains N/A, pending, cannot be approved", and failures already found while items are unfilled.
    const ongoingSummaries = linkedChecklists.filter(c => c.status === 'Ongoing').map(c => summarizeItems(parseInstance(c).items));
    const naPendingCount = ongoingSummaries.filter(isNaPending).length;
    const failSoFarTotal = ongoingSummaries.reduce((n, s) => n + failuresSoFar(s), 0);

    const VERSION_OPTIONS = ['Rev1.0', 'Rev2.0', 'Rev3.0', 'Rev4.0'];
    const [versionMode, setVersionMode] = useState<'select' | 'custom'>(() => {
        const currentVersion = formData.type;
        if (currentVersion && !VERSION_OPTIONS.includes(currentVersion)) {
            return 'custom';
        }
        return 'select';
    });
    const [approvalWarning, setApprovalWarning] = useState<{ show: boolean; pendingStatus: string }>({ show: false, pendingStatus: '' });
    const [publishConfirm, setPublishConfirm] = useState<{ show: boolean; nextRev: string }>({ show: false, nextRev: '' });
    const [unlinkConfirm, setUnlinkConfirm] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });
    // Tracks the in-flight "Raise NCR" / "Re-inspect" action (both hit backend
    // endpoints that pre-populate the new record from this ITR).
    const [spawning, setSpawning] = useState<'ncr' | 'reinspect' | null>(null);

    // Revoke-approval dialog. The reason is kept in state across a failed
    // attempt so the user doesn't have to retype it.
    const [revokeOpen, setRevokeOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);       // read-only approval history
    const [revokeReason, setRevokeReason] = useState('');
    const [revokeError, setRevokeError] = useState<string | null>(null);
    const [revoking, setRevoking] = useState(false);
    const [saving, setSaving] = useState(false);
    const leaveGuard = useDraftGuard({ formData, pendingUploads, deletedFileIds }, saving || revoking || !!spawning, !readOnly);
    const requestClose = () => leaveGuard.requestClose(onClose, true);

    // 勾稽鎖定：Approved/Void 後全欄鎖定，防止已批准 ITR 被竄改。
    //
    // Deliberately keyed on the PERSISTED status (existingItem?.status, as
    // last fetched from the backend) — NOT formData.status. formData.status
    // changes the instant the user picks a new option in the dropdown,
    // before anything is saved; keying isLocked on it meant selecting
    // "Approved" locked the form (and hid the Save button) immediately,
    // making it impossible to ever submit the approval at all (2026-09-19
    // browser-verified bug). Once the save actually succeeds, the parent
    // refetches and this modal is reopened with a fresh existingItem whose
    // .status now reflects the persisted Approved state — isLocked only
    // becomes true then.
    const persistedStatus = existingItem?.status;
    const isLocked = persistedStatus === 'Approved' || persistedStatus === 'Void';
    // NOI 一旦儲存後不可再更換（避免勾稽關聯斷裂）
    const noiSaved = !!(existingItem?.noiNumber);
    // FORMS-CONSISTENCY-2026-001: the `readOnly` prop only reflects permission
    // (ITR.tsx: `readOnly={!hasPermission('itr:update:all')}`) — it does not
    // account for isLocked (Approved/Void), unlike NOI/NCR's own readOnly
    // computation which already folds their own lock state in. That made the
    // title stay "Edit ITR" and the Cancel button stay "Cancel" even when the
    // record is Approved and nothing can actually be saved (Save itself is
    // already correctly hidden via `!isLocked && !readOnly` below — only the
    // title/button label failed to follow). Used ONLY for display text here;
    // does not change what fields are disabled (those already check isLocked
    // individually) or any save/permission behaviour.
    const displayAsReadOnly = readOnly || isLocked;

    if (!itrId) {
        return null;
    }

    // Use context list if available, otherwise use prop
    // const itrList = contextItrList.length > 0 ? contextItrList : propItrList;

    // Reference No 由後端自動產生，不再於前端自動更新

    const handleFieldChange = (field: keyof ITRDetailData, value: string) => {
        if (field === 'status') {
            // ITR-STATUS-2026-001: transition validation must be judged against the PERSISTED
            // status (existingItem?.status — same basis as `isLocked` above, and for the same
            // reason), never formData.status. formData.status flips the instant the user picks
            // an option, before anything is saved — so picking "Approved" and then having the
            // save REJECTED by the backend (e.g. no linked checklist yet) left formData.status
            // sitting on "Approved" with nothing actually persisted. The next status change then
            // ran validateStatusTransition('Approved', ...), hit the "Approved can only change
            // via Revoke Approval" rule, and permanently trapped the user in a modal that claimed
            // to be Approved while the server still said In Progress (2026-10-03, reproduced in
            // isolation, confirmed via a raw GET that the backend was untouched).
            // New-item mode has no persisted status at all (existingItem is undefined) — nothing
            // has been saved yet, so there is no "from" state to transition away from; any first
            // choice is free, not a transition, and must not self-lock the form either.
            if (persistedStatus) {
                const validation = validateStatusTransition(persistedStatus, value, ITRStatusTransitions);
                if (!validation.allowed) {
                    toast.warning(validation.message || t('common.invalidStatusTransition'));
                    return;
                }
            }
            if (value === 'Approved' && linkedChecklists.some(c => c.status === 'Fail')) {
                setApprovalWarning({ show: true, pendingStatus: value });
                return;
            }
        }
        setFormData(prev => {
            const updated = { ...prev, [field]: value };
            if (field === 'raiseDate') {
                updated.dueDate = addSevenWorkingDays(value);
            }
            return updated;
        });
    };

    const handleDateButton = (field: keyof ITRDetailData) => {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}_`;
        setFormData(prev => ({
            ...prev,
            [field]: prev[field] ? `${prev[field]}\n${dateStr}` : dateStr
        }));
    };



    const handlePendingFilesChange = (category: string, files: File[]) => {
        setPendingUploads(prev => prev.map(p => p.category === category ? { ...p, files } : p));
    };

    const handleDeleteExistingFile = (fileId: string) => {
        setDeletedFileIds(prev => [...prev, fileId]);
        const filterOut = (arr: any[] | undefined) =>
            (arr || []).filter((a: any) => typeof a === 'string' || a?.id !== fileId);
        setFormData(prev => ({
            ...prev,
            defectPhotos: filterOut(prev.defectPhotos),
            improvementPhotos: filterOut(prev.improvementPhotos),
            drawings: filterOut((prev as any).drawings),
            certificates: filterOut((prev as any).certificates),
            attachments: filterOut(prev.attachments),
        }));
    };

    const handleRemoveLegacyPhoto = (index: number, photoType: 'defect' | 'improvement') => {
        if (photoType === 'defect') {
            setFormData(prev => ({
                ...prev,
                defectPhotos: prev.defectPhotos.filter((_, i) => i !== index)
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                improvementPhotos: prev.improvementPhotos.filter((_, i) => i !== index)
            }));
        }
    };

    const handleRemoveLegacyAttachment = (index: number) => {
        setFormData(prev => ({
            ...prev,
            attachments: prev.attachments.filter((_, i) => i !== index)
        }));
    };

    const handleUnlinkChecklist = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setUnlinkConfirm({ show: true, id });
    };

    const handleRemoveLegacyGeneric = (index: number, field: 'drawings' | 'certificates') => {
        setFormData(prev => ({
            ...prev,
            [field]: (prev[field] || []).filter((_, i) => i !== index)
        }));
    };

    const handleSave = async () => {
        if (saving) return;
        if (!formData.noiNumber) {
            toast.warning(t('itr.validation.noiRequired') || 'Please select an NOI Number.');
            return;
        }

        try {
            setSaving(true);
            await onSave(formData, pendingUploads, deletedFileIds);
            leaveGuard.release();
            onClose();
        } catch (_) { // eslint-disable-line @typescript-eslint/no-unused-vars
            // 錯誤已在父層 handleSaveITRDetails 以 toast 顯示，保持 modal 開啟
        } finally { setSaving(false); }
    };

    const handlePublish = () => {
        const nextRev = getNextRevision(formData.type || 'Rev0.0');
        setPublishConfirm({ show: true, nextRev });
    };

    const doPublish = async (nextRev: string) => {
        if (saving) return;
        setSaving(true);
        try {
            // publishOnly=true tells the parent to send ONLY type/status —
            // the backend rejects any other field on a locked (Approved)
            // ITR, so the rest of formData must not be included here.
            await onSave({
                ...formData,
                type: nextRev,
                status: 'Approved'
            }, [], [], true);
            // onClose is handled by parent (handleSaveITRDetails sets isEditModalOpen=false)
        } catch (_) { // eslint-disable-line @typescript-eslint/no-unused-vars
            // Error already shown by parent handleSaveITRDetails toast
        } finally { setSaving(false); }
    };

    // Only an already-PERSISTED Approved ITR can be revoked, and only by an
    // ITR_APPROVE holder (the backend enforces both regardless of this UI).
    // Goes through the dedicated endpoint — never a normal status update,
    // which the backend rejects for any change away from Approved.
    const canRevokeApproval = !!existingItem?.id && persistedStatus === 'Approved' && hasPermission('itr:approve:all');

    const openRevokeDialog = () => {
        setRevokeError(null);
        setRevokeOpen(true);
    };

    const handleRevoke = async () => {
        if (!existingItem?.id || revoking) return;
        const reason = revokeReason.trim();
        if (!reason) {
            setRevokeError(t('itr.revokeReasonRequired'));
            return;
        }
        setRevoking(true);
        setRevokeError(null);
        try {
            await revokeItrApproval(existingItem.id, 'In Progress', reason);
        } catch (e: any) {
            const raw = e?.response?.data?.detail;
            setRevokeError(typeof raw === 'string' ? raw : (e?.message || t('itr.revokeFailed')));
            setRevoking(false);
            return; // dialog stays open with the reason intact
        }
        // The revoke itself succeeded from here on — a failure reloading the
        // list must not be reported as a failed revoke.
        toast.success(t('itr.revokeSuccess'));
        setRevokeOpen(false);
        setRevokeReason('');
        setRevoking(false);
        try {
            await onRevoked?.();
        } catch {
            toast.warning(t('itr.revokeReloadFailed'));
        }
    };

    const handleRaiseNcr = async () => {
        if (!existingItem?.id || spawning) return;
        setSpawning('ncr');
        try {
            const ncr = await createNcrFromItr(existingItem.id);
            toast.success(t('itr.ncrCreated') || `NCR ${ncr.documentNumber} created`);
            await useNCRStore.getState().refetch();
            // Use onDismiss (plain close), not onClose — onClose runs a
            // navigate(-1) when this modal was reached via ?openId=, which
            // would race with the navigate() below and land somewhere
            // unrelated to the NCR just created.
            leaveGuard.release();
            (onDismiss || onClose)();
            navigate(`/ncr?openId=${ncr.id}`);
        } catch (err: any) {
            toast.error(err?.response?.data?.detail || t('common.saveFailed'));
        } finally {
            setSpawning(null);
        }
    };

    // Re-inspect Approved/Void boundary (2026-09-29 business decision): Void is terminal and can
    // never be re-inspected; Approved must first go back to In Progress via Revoke Approval —
    // there is no "re-inspect straight off an Approved record" path. Keyed on persistedStatus
    // (not live formData.status) for the same reason isLocked is — see its own comment above.
    // Backend enforces this regardless (services/itr_service.py::create_reinspection); this is
    // purely a friendly, proactive hint so the user isn't left guessing after a rejected request.
    const reinspectBlockedReason = persistedStatus === 'Void'
        ? (t('itr.reinspectBlockedVoid') || 'Void records cannot be re-inspected.')
        : persistedStatus === 'Approved'
            ? (t('itr.reinspectBlockedApproved') || 'Revoke the approval first, then re-inspect if it still meets the usual conditions.')
            : '';

    const handleReinspect = async () => {
        if (!existingItem?.id || spawning || reinspectBlockedReason) return;
        setSpawning('reinspect');
        try {
            const newItr = await createReinspectionItr(existingItem.id);
            toast.success(t('itr.reinspectionCreated') || `Re-inspection ${newItr.documentNumber} created`);
            await useITRStore.getState().refetch();
            leaveGuard.release();
            (onDismiss || onClose)();
            navigate(`/itr?openId=${newItr.id}`);
        } catch (err: any) {
            toast.error(err?.response?.data?.detail || t('common.saveFailed'));
        } finally {
            setSpawning(null);
        }
    };

    const handlePrint = async () => {
        // Re-fetch linked checklists before printing (ITR-PRINT-STALE-FIX-2026-001):
        // `instances` is only refreshed on modal open / save / link / reopen, so a
        // checklist edited elsewhere while this modal stayed open would print stale
        // data even though Export Word (which always queries the DB fresh) shows the
        // current content. Printing now matches export's always-live behavior.
        await refreshInstances();
        setShowPrintPreview(true);
    };

    if (showPrintPreview) {
        return (
            <ITRPrintPreview
                // itpNo overridden with the same live NOI-derived value shown on screen
                // (ITR-INPUT-UX-IMPLEMENT-2026-005) — ITRPrintPreview has no access to
                // noiList/itpList itself, so the already-computed `relatedItp` is passed through
                // via the one field name it already reads, instead of plumbing two more lists
                // into an otherwise self-contained print component.
                data={{ ...formData, linkedChecklists: instances, itpNo: relatedItp ? (relatedItp.referenceNo || relatedItp.description || '') : '' }}
                onClose={() => setShowPrintPreview(false)}
            />
        );
    }

    return (
        <>
        <div className={formStyles.modalOverlay}>
            <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={formStyles.modalHeader}>
                    <h2>{displayAsReadOnly ? t('itr.viewTitle') : existingData || existingItem ? t('itr.editTitle') : t('itr.addTitle')}</h2>
                    <button className={formStyles.closeButton} aria-label={t('common.close')} title={t('common.close')} onClick={requestClose}>×</button>
                </div>
                <div className={formStyles.modalBody}>
                <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }}>
                    {isLocked && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fef9c3', border: '1px solid #fde047', borderRadius: '6px', padding: '8px 14px', marginBottom: '12px', color: '#854d0e', fontSize: '13px', fontWeight: 600 }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            {persistedStatus === 'Void' ? t('itr.lockedMsgVoid') : t('itr.lockedMsg')}
                        </div>
                    )}
                    <p className={formStyles.formRequiredHint}>{t('form.requiredHint')}</p>
                    <div className={formStyles.formSections}>
                        {/* {t('common.baseInfo') || '基本資訊'} */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('common.baseInfo') || '基本資訊'}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('common.referenceNo')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={formData.itrNumber || t('form.autoGenerated')}
                                        readOnly
                                        style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed' }}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('itr.noiNo')} ({t('form.source')})</label>
                                    <select
                                        className={formStyles.formSelect}
                                        value={formData.noiNumber}
                                        disabled={isLocked || noiSaved}
                                        style={(isLocked || noiSaved) ? { backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: '#000' } : {}}
                                        onChange={(e) => {
                                            const selectedRef = e.target.value;
                                            handleFieldChange('noiNumber', selectedRef);

                                            // Auto-fill Inspection Date from selected NOI
                                            if (selectedRef) {
                                                const selectedNOI = getNOIList().find(n => n.referenceNo === selectedRef);
                                                if (selectedNOI) {
                                                    if (selectedNOI.inspectionDate) {
                                                        handleFieldChange('raiseDate', selectedNOI.inspectionDate);
                                                    }
                                                    if (selectedNOI.package) {
                                                        handleFieldChange('subject', `ITR-${selectedNOI.package}`);
                                                    }
                                                    if (selectedNOI.contractor) {
                                                        handleFieldChange('contractor', selectedNOI.contractor);
                                                    }
        }
                                            }
                                        }}
                                    >
                                        <option value="">{t('itr.selectNOI')}</option>
                                        {getNOIList().map((noi) => (
                                            <option key={noi.id} value={noi.referenceNo || ''}>
                                                {noi.referenceNo || `(${t('common.notGenerated')})`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formData.noiNumber ? formStyles.optionalLabel : ''}>{t('common.contractor')}</label>
                                    {(formData.noiNumber || isLocked) ? (
                                        <input
                                            type="text"
                                            className={formStyles.formInput}
                                            value={formData.contractor}
                                            readOnly
                                            style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed' }}
                                        />
                                    ) : (
                                        <select
                                            className={formStyles.formSelect}
                                            value={formData.contractor}
                                            onChange={(e) => handleFieldChange('contractor', e.target.value)}
                                        >
                                            <option value="">{t('common.selectContractor')}</option>
                                            {getActiveContractors().map((contractor) => (
                                                <option key={contractor.id} value={contractor.name}>
                                                    {contractor.name}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {!!formData.noiNumber && <small className={formStyles.fieldHint}>{t('itr.fieldFromNoi') || 'From NOI'}</small>}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formData.noiNumber ? formStyles.optionalLabel : ''}>{t('noi.package')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={formData.subject}
                                        onChange={(e) => handleFieldChange('subject', e.target.value)}
                                        readOnly={isLocked || !!formData.noiNumber}
                                        style={(isLocked || !!formData.noiNumber) ? { backgroundColor: '#D9D9D9', cursor: 'not-allowed' } : {}}
                                    />
                                    {!!formData.noiNumber && <small className={formStyles.fieldHint}>{t('itr.fieldFromNoi') || 'From NOI'}</small>}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('itr.relatedITP') || 'Related ITP'}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={relatedItp ? (relatedItp.referenceNo || relatedItp.description || '') : (t('itr.noRelatedItp') || 'No ITP linked via NOI')}
                                        readOnly
                                        style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed' }}
                                    />
                                    {relatedItp && <small className={formStyles.fieldHint}>{t('itr.fieldFromNoi') || 'From NOI'}</small>}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formData.noiNumber ? formStyles.optionalLabel : ''}>{t('itr.inspectionDate')}</label>
                                    <input
                                        type={formData.raiseDate ? 'date' : 'text'}
                                        placeholder="mm/dd/yyyy"
                                        lang="en"
                                        onFocus={(e) => (e.target.type = 'date')}
                                        onBlur={(e) => {
                                            if (!e.target.value) e.target.type = 'text';
                                        }}
                                        className={formStyles.formInput}
                                        value={formatDateISO(formData.raiseDate)}
                                        onChange={(e) => handleFieldChange('raiseDate', e.target.value)}
                                        readOnly={isLocked || !!formData.noiNumber}
                                        style={(isLocked || !!formData.noiNumber) ? { backgroundColor: '#D9D9D9', cursor: 'not-allowed' } : {}}
                                    />
                                    {!!formData.noiNumber && <small className={formStyles.fieldHint}>{t('itr.fieldFromNoi') || 'From NOI'}</small>}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('common.dueDate')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={formData.dueDate || ''}
                                        readOnly
                                        style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed' }}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('common.version')}</label>
                                    {versionMode === 'select' && (
                                        <select
                                            className={formStyles.formSelect}
                                            value={VERSION_OPTIONS.includes(formData.type || '') ? formData.type : 'Rev1.0'}
                                            disabled={isLocked}
                                            style={isLocked ? { backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: '#000' } : {}}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                if (value === 'custom') {
                                                    setVersionMode('custom');
                                                    handleFieldChange('type', '');
                                                } else {
                                                    setVersionMode('select');
                                                    handleFieldChange('type', value);
                                                }
                                            }}
                                        >
                                            {VERSION_OPTIONS.map((v) => (
                                                <option key={v} value={v}>{v}</option>
                                            ))}
                                            <option value="custom">{t('itr.revCustom')}</option>
                                        </select>
                                    )}
                                    {versionMode === 'custom' && (
                                        <input
                                            type="text"
                                            className={formStyles.formInput}
                                            value={formData.type || ''}
                                            onChange={(e) => handleFieldChange('type', e.target.value)}
                                            readOnly={isLocked}
                                            style={isLocked ? { backgroundColor: '#D9D9D9', cursor: 'not-allowed' } : {}}
                                            placeholder={t('itr.revCustomPlaceholder')}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Linked Checklists Section */}
                        <p className="text-sm text-slate-600">{t('itr.checklistInstanceHint')}</p>
                        <div className={formStyles.formSection}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 border-b border-slate-100 pb-2">
                                <h3 className={formStyles.sectionTitle} style={{ margin: 0 }}>
                                    <ClipboardCheck size={18} className="inline-block mr-2" />
                                    {t('itr.sectionLinkedChecklists') || 'Linked Checklists'}
                                </h3>
                                <div className="flex min-w-0 max-w-full flex-col items-start sm:items-end">
                                    <span className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200 mb-2">
                                        {t('itr.checklistInstanceNote') || '從範本引用會建立此 ITR 專屬的檢驗紀錄；範本不受影響。'}
                                    </span>
                                    <select
                                        className="h-8 max-w-full pl-2 pr-8 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-400 transition-colors cursor-pointer"
                                        disabled={isLocked || !persistedItrId}
                                        style={(isLocked || !persistedItrId) ? { backgroundColor: '#D9D9D9', cursor: 'not-allowed', opacity: 0.6 } : {}}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            e.target.value = "";   // reset selection
                                            if (!value) return;
                                            // §17: linking creates an ITR-owned instance copy server-side
                                            // (the template is never mutated). "new" opens the Checklist
                                            // module to author a new standard template.
                                            if (value === 'new') {
                                                navigate(`/checklist?from=itr`);
                                            } else {
                                                linkTemplate(value);
                                            }
                                        }}
                                        value=""
                                    >
                                        <option value="" disabled hidden>+ {t('checklist.addOrLink') || 'Checklist'}</option>
                                        <option value="new" className="font-bold text-blue-600 bg-blue-50">
                                            + {t('checklist.createNew') || 'Create New Template...'}
                                        </option>
                                        <optgroup label={t('checklist.available') || 'Available Templates'}>
                                            {allChecklists.map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.recordsNo} - {c.activity}
                                                </option>
                                            ))}
                                        </optgroup>
                                    </select>
                                    {!persistedItrId && (
                                        <span className="text-[11px] text-amber-600 mt-1">
                                            {t('itr.saveBeforeChecklist') || '請先儲存 ITR，再加入檢查表。'}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* §17: instance list — each row is an ITR-owned checklist
                                instance; click to expand and fill inline. */}
                            {instances.length > 0 ? (
                                <div className="space-y-3">
                                    {instances.map((record) => {
                                        const expanded = expandedInstanceId === record.id;
                                        return (
                                            <div key={record.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                                                <div
                                                    className="group flex items-center justify-between p-3 hover:bg-slate-50 transition-all cursor-pointer"
                                                    onClick={() => setExpandedInstanceId(expanded ? null : record.id)}
                                                >
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider">{record.recordsNo}</span>
                                                            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${record.status === 'Pass' ? 'bg-green-100 text-green-700' :
                                                                record.status === 'Fail' ? 'bg-red-100 text-red-700' :
                                                                    'bg-amber-100 text-amber-700'
                                                                }`}>
                                                                {record.status === 'Ongoing' && <AlertCircle size={10} />}
                                                                {record.status === 'Ongoing'
                                                                    ? (() => {
                                                                        // "Not filled" only when nothing has been judged yet;
                                                                        // once some items are, show real progress instead.
                                                                        const sm = summarizeItems(parseInstance(record).items);
                                                                        if (sm.judged === 0) return (t('checklist.notYetFilled') || 'Not filled');
                                                                        const op = ongoingProgress(sm);
                                                                        return t(op.key, op.params);
                                                                    })()
                                                                    : (t(`checklist.status.${record.status.toLowerCase()}`) || record.status)}
                                                            </span>
                                                        </div>
                                                        <span className="text-sm font-bold text-slate-800">{record.activity}</span>
                                                        <span className="text-[11px] text-slate-400">
                                                            {t('checklist.sourceTemplate') || 'Source Template'}:{' '}
                                                            {record.template_id ? (templateById.get(record.template_id)?.recordsNo || record.template_id) : (t('checklist.versionUnknown') || 'Unknown')}
                                                            {' · '}
                                                            {t('checklist.sourceVersion') || 'Linked Version'}:{' '}
                                                            {record.source_template_version ?? (t('checklist.versionUnknown') || 'Unknown')}
                                                        </span>
                                                        {record.location && (
                                                            <span className="text-xs text-slate-500 flex items-center gap-1">
                                                                <ArrowRight size={10} /> {record.location}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-[10px] text-slate-400 font-bold uppercase">{t('itr.inspectionDate')}</span>
                                                            <span className="text-xs font-medium text-slate-600">{record.date}</span>
                                                        </div>

                                                        {/* Unlink Button — hidden when ITR is locked */}
                                                        {!isLocked && <button className={actionStyles.iconDanger}
                                                            type="button"
                                                            onClick={(e) => handleUnlinkChecklist(record.id, e)}
                                                            title={t('common.delete') || 'Remove'}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M3 6h18"></path>
                                                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                                                <line x1="14" y1="11" x2="14" y2="17"></line>
                                                            </svg>
                                                        </button>}
                                                    </div>
                                                </div>

                                                {expanded && (
                                                    <div className="border-t border-slate-200 p-3 bg-slate-50">
                                                        <ChecklistSnapshotModal
                                                            // Remount when the stored status changes (Reopen) so the
                                                            // panel is rebuilt from the freshly loaded backend data.
                                                            key={`${record.id}:${record.status}`}
                                                            inline
                                                            isOpen={true}
                                                            readOnly={isLocked}
                                                            checklistStatus={record.status}
                                                            canReopen={hasPermission('checklist:close:all')}
                                                            onReopen={() => reopenInstance(record.id)}
                                                            lockReason={persistedStatus === 'Void' ? 'Void' : 'Approved'}
                                                            initialData={parseInstance(record)}
                                                            onClose={() => setExpandedInstanceId(null)}
                                                            onSave={(snap) => saveInstance(record.id, snap)}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                    <p className="text-sm text-slate-400 font-medium">
                                        {persistedItrId
                                            ? (t('itr.noLinkedChecklists') || 'No checklists linked to this ITR yet.')
                                            : (t('itr.saveBeforeChecklist') || '請先儲存 ITR，再加入檢查表。')}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* 品質評估 — moved here (right after Linked Checklists, before the
                            photo/attachment sections) per ITR-INPUT-UX-IMPLEMENT-2026-003: filling
                            in the inspection result/remark reads more naturally right after judging
                            the checklist, instead of after scrolling past four upload sections. */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('itr.sectionQuality')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('itr.inspectionResult')}</label>
                                    <select
                                        className={formStyles.formSelect}
                                        value={formData.inspectionResult || ''}
                                        onChange={(e) => handleFieldChange('inspectionResult', e.target.value)}
                                        disabled={isLocked}
                                        style={isLocked ? { backgroundColor: '#D9D9D9', cursor: 'not-allowed' } : {}}
                                    >
                                        <option value="">{t('itr.inspectionResult.unset')}</option>
                                        <option value="Pass">{t('itr.inspectionResult.pass')}</option>
                                        <option value="Fail">{t('itr.inspectionResult.fail')}</option>
                                        <option value="Conditional">{t('itr.inspectionResult.conditional')}</option>
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('common.status')}</label>
                                    <div className="flex flex-col gap-2">
                                        <select
                                            className={formStyles.formSelect}
                                            value={formData.status}
                                            onChange={(e) => handleFieldChange('status', e.target.value)}
                                            // Once persisted Approved/Void, status can ONLY be changed
                                            // via the dedicated revoke-approval flow — the backend
                                            // rejects any other status change away from Approved
                                            // unconditionally (2026-09-19). Previously this only
                                            // checked formData.status === 'Void', leaving the dropdown
                                            // open (and silently doomed to a backend 400) on a
                                            // persisted-Approved record.
                                            disabled={isLocked}
                                            style={isLocked ? { backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: '#000' } : {}}
                                        >
                                            <option value="Approved">{t('itr.status.approved')}</option>
                                            <option value="Reject">{t('itr.status.reject')}</option>
                                            <option value="In Progress">{t('itr.status.inProgress')}</option>
                                            <option value="Void">{t('itr.status.void') || 'Void'}</option>
                                        </select>

                                        {linkedChecklists.length > 0 && (
                                            <div className={`mt-1 flex items-center gap-2 p-2 rounded-md text-xs font-bold border transition-all ${linkedChecklists.some(c => c.status === 'Fail')
                                                ? 'bg-red-50 text-red-600 border-red-100 animate-pulse'
                                                : linkedChecklists.every(c => c.status === 'Pass')
                                                    ? 'bg-green-50 text-green-600 border-green-100'
                                                    : 'bg-blue-50 text-blue-600 border-blue-100'
                                                }`}>
                                                {linkedChecklists.some(c => c.status === 'Fail') ? (
                                                    <>
                                                        <AlertCircle size={14} />
                                                        <span>WARNING: {linkedChecklists.filter(c => c.status === 'Fail').length} FAILED CHECKLISTS</span>
                                                    </>
                                                ) : linkedChecklists.every(c => c.status === 'Pass') ? (
                                                    <>
                                                        <ShieldCheck size={14} />
                                                        <span>ALL CHECKLISTS PASSED</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Info size={14} />
                                                        <span>SOME CHECKLISTS ONGOING</span>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        {naPendingCount > 0 && (
                                            <div data-itr-na-pending className="mt-1 flex items-center gap-2 p-2 rounded-md text-xs font-bold border bg-sky-50 text-sky-800 border-sky-200">
                                                <Info size={14} />
                                                <span>{t('checklist.banner.naPending', { n: naPendingCount })}</span>
                                            </div>
                                        )}
                                        {failSoFarTotal > 0 && (
                                            <div data-itr-fail-so-far className="mt-1 flex items-center gap-2 p-2 rounded-md text-xs font-bold border bg-red-50 text-red-700 border-red-100">
                                                <AlertCircle size={14} />
                                                <span>{t('checklist.banner.failSoFar', { n: failSoFarTotal })}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('itr.closeoutDate')}</label>
                                    <input
                                        type={formData.closeoutDate ? 'date' : 'text'}
                                        placeholder="mm/dd/yyyy"
                                        lang="en"
                                        onFocus={(e) => (e.target.type = 'date')}
                                        onBlur={(e) => {
                                            if (!e.target.value) e.target.type = 'text';
                                        }}
                                        className={formStyles.formInput}
                                        value={formData.closeoutDate}
                                        onChange={(e) => handleFieldChange('closeoutDate', e.target.value)}
                                        readOnly={isLocked}
                                        style={isLocked ? { backgroundColor: '#D9D9D9', cursor: 'not-allowed' } : {}}
                                    />
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
                                        value={formData.remark}
                                        onChange={(e) => handleFieldChange('remark', e.target.value)}
                                        rows={3}
                                        readOnly={isLocked}
                                        style={isLocked ? { backgroundColor: '#D9D9D9', cursor: 'not-allowed' } : {}}
                                    />
                                </div>

                            </div>
                        </div>


                        {/* 照片上傳／附件 — collapsible (ITR-INPUT-UX-IMPLEMENT-2026-003): each
                            section starts open only when this ITR already has content in it,
                            closed otherwise, so empty upload sections don't take up permanent
                            vertical space between the Checklist/Quality Assessment the user is
                            actually filling in and the ones below. */}
                        <CollapsibleSection
                            title={<>{t('itr.photo.defect')} / {t('itr.photo.improvement')}</>}
                            defaultExpanded={(formData.defectPhotos?.length || 0) > 0 || (formData.improvementPhotos?.length || 0) > 0}
                        >
                            <div className={styles.photoSectionContainer}>
                                <div className={styles.photoSection}>
                                    <h3 className={formStyles.sectionTitle}>{t('itr.photo.defect')}</h3>
                                    <FileAttachment
                                        attachments={formData.defectPhotos || [] as any[]}
                                        onPendingFilesChange={(files) => handlePendingFilesChange('defectPhoto', files)}
                                        onRemoveLegacy={(index) => handleRemoveLegacyPhoto(index, 'defect')}
                                        onDeleteExistingFile={handleDeleteExistingFile}
                                        entityType="itr"
                                        entityId={existingItem?.id}
                                        category="defectPhoto"
                                        accept="image/*"
                                        id="defectPhoto"
                                        hideTitle
                                        onPreview={handlePreview}
                                    />
                                </div>
                                <div className={styles.photoSection}>
                                    <h3 className={formStyles.sectionTitle}>{t('itr.photo.improvement')}</h3>
                                    <FileAttachment
                                        attachments={formData.improvementPhotos || [] as any[]}
                                        onPendingFilesChange={(files) => handlePendingFilesChange('improvementPhoto', files)}
                                        onRemoveLegacy={(index) => handleRemoveLegacyPhoto(index, 'improvement')}
                                        onDeleteExistingFile={handleDeleteExistingFile}
                                        entityType="itr"
                                        entityId={existingItem?.id}
                                        category="improvementPhoto"
                                        accept="image/*"
                                        id="improvementPhoto"
                                        hideTitle
                                        onPreview={handlePreview}
                                    />
                                </div>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection
                            title={t('itr.sectionDrawings') || 'Latest Drawings'}
                            defaultExpanded={(formData.drawings?.length || 0) > 0}
                        >
                            <FileAttachment
                                attachments={formData.drawings || [] as any[]}
                                onPendingFilesChange={(files) => handlePendingFilesChange('drawing', files)}
                                onRemoveLegacy={(index) => handleRemoveLegacyGeneric(index, 'drawings')}
                                onDeleteExistingFile={handleDeleteExistingFile}
                                entityType="itr"
                                entityId={existingItem?.id}
                                category="drawing"
                                id="drawing"
                                hideTitle
                                onPreview={handlePreview}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title={t('itr.sectionCertificates') || 'Calibration Certificates'}
                            defaultExpanded={(formData.certificates?.length || 0) > 0}
                        >
                            <FileAttachment
                                attachments={formData.certificates || [] as any[]}
                                onPendingFilesChange={(files) => handlePendingFilesChange('certificate', files)}
                                onRemoveLegacy={(index) => handleRemoveLegacyGeneric(index, 'certificates')}
                                onDeleteExistingFile={handleDeleteExistingFile}
                                entityType="itr"
                                entityId={existingItem?.id}
                                category="certificate"
                                id="certificate"
                                hideTitle
                                onPreview={handlePreview}
                            />
                        </CollapsibleSection>

                        <CollapsibleSection
                            title={t('common.attachments')}
                            defaultExpanded={(formData.attachments?.length || 0) > 0}
                        >
                            <FileAttachment
                                attachments={formData.attachments || [] as any[]}
                                onPendingFilesChange={(files) => handlePendingFilesChange('attachment', files)}
                                onRemoveLegacy={handleRemoveLegacyAttachment}
                                onDeleteExistingFile={handleDeleteExistingFile}
                                entityType="itr"
                                entityId={existingItem?.id}
                                category="attachment"
                                id="attachment"
                                hideTitle
                                onPreview={handlePreview}
                            />
                        </CollapsibleSection>
                        {existingItem?.id && (
                            <RelatedDocuments entityType="itr" entityId={existingItem.id} />
                        )}
                    </div>
                </fieldset>
                </div>
                    <FormActions
                        tools={<>
                            <button className={actionStyles.secondary} onClick={handlePrint}>
                                {t('common.print')}
                            </button>
                            {/* Needs a real saved record id to call the export endpoint — unlike
                                Print (which only reads already-loaded formData), there is nothing
                                to export for an unsaved new ITR yet. */}
                            {existingItem?.id && (
                                <button className={actionStyles.secondary} onClick={() => exportItrDocx(existingItem.id, formData.itrNumber || 'ITR')}>
                                    {t('itr.exportWord') || 'Export Word'}
                                </button>
                            )}
                            {existingItem?.id && (formData.inspectionResult === 'Fail' || formData.status === 'Reject') && hasPermission('ncr:create:all') && (
                                <button className={actionStyles.secondary}
                                    onClick={handleRaiseNcr}
                                    disabled={spawning !== null}
                                    title={t('itr.raiseNcrTitle') || 'Create an NCR pre-filled from this failed ITR'}
                                >
                                    {spawning === 'ncr' ? (t('common.saving') || 'Saving...') : (t('itr.raiseNcr') || 'Raise NCR')}
                                </button>
                            )}
                            {existingItem?.id && (formData.inspectionResult === 'Fail' || formData.status === 'Reject') && hasPermission('itr:create:all') && (
                                <div className="flex flex-col items-start gap-1">
                                    <button className={actionStyles.secondary}
                                        onClick={() => leaveGuard.requestAction(handleReinspect)}
                                        disabled={spawning !== null || !!reinspectBlockedReason}
                                        title={reinspectBlockedReason || t('itr.reinspectTitle') || 'Create a re-inspection ITR pre-filled from this one'}
                                    >
                                        {spawning === 'reinspect' ? (t('common.saving') || 'Saving...') : (t('itr.reinspect') || 'Re-inspect')}
                                    </button>
                                    {reinspectBlockedReason && (
                                        <span className="text-xs text-slate-500">{reinspectBlockedReason}</span>
                                    )}
                                </div>
                            )}
                            {!!existingItem?.id && (
                                <button className={actionStyles.secondary}
                                    onClick={() => setHistoryOpen(true)}
                                    title={t('itr.approvalHistoryTitle')}
                                    data-approval-history-button
                                >
                                    {t('itr.approvalHistory')}
                                </button>
                            )}
                        </>}
                        secondary={<>
                            {canRevokeApproval && (
                                <button className={actionStyles.danger}
                                    onClick={openRevokeDialog}
                                    title={t('itr.revokeApprovalTitle')}
                                >
                                    {t('itr.revokeApproval')}
                                </button>
                            )}
                            {!readOnly && (
                                <button className={actionStyles.workflow}
                                    onClick={handlePublish} disabled={saving}
                                    title="Publish as next revision"
                                >
                                    Publish
                                </button>
                            )}
                        </>}
                        cancel={<>
                            <button className={actionStyles.secondary} onClick={requestClose} disabled={saving}>
                                {displayAsReadOnly ? t('common.close') : t('common.cancel')}
                            </button>
                        </>}
                        primary={<>
                            {!isLocked && !readOnly && (
                                <button className={actionStyles.primary} onClick={handleSave} disabled={saving}>
                                    {saving ? t('common.saving') || 'Saving...' : t('common.save')}
                                </button>
                            )}
                        </>}
                    />
            </div>
        </div>
        {historyOpen && existingItem?.id && (
            <ITRApprovalHistoryModal
                itrId={existingItem.id}
                documentNumber={existingItem.documentNumber}
                onClose={() => setHistoryOpen(false)}
            />
        )}
        {revokeOpen && (
            <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50">
                <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
                    <h3 className="text-lg font-bold text-slate-800">{t('itr.revokeApproval')}</h3>
                    <p className="mt-2 text-sm text-slate-600">{t('itr.revokeDialogNote')}</p>
                    <label className="mt-4 block text-sm font-semibold text-slate-700">
                        {t('itr.revokeReasonLabel')} <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                        rows={4}
                        value={revokeReason}
                        onChange={(e) => setRevokeReason(e.target.value)}
                        placeholder={t('itr.revokeReasonPlaceholder')}
                        disabled={revoking}
                    />
                    {revokeError && (
                        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{revokeError}</div>
                    )}
                        <FormActions cancel={<><button
                            className={actionStyles.secondary}
                            onClick={() => { setRevokeOpen(false); setRevokeError(null); }}
                            disabled={revoking}
                        >
                            {t('common.cancel')}
                        </button></>} primary={<><button
                            className={actionStyles.danger}
                            onClick={handleRevoke}
                            disabled={revoking || !revokeReason.trim()}
                        >
                            {revoking ? t('common.saving') : t('itr.revokeConfirm')}
                        </button></>} />
                </div>
            </div>
        )}
        <ConfirmModal
            intent="primary"
            isOpen={approvalWarning.show}
            title={t('common.warning') || 'Warning'}
            message={t('itr.approvalWarningMsg') || 'WARNING: There are failed checklists associated with this ITR. Are you sure you want to approve it?'}
            confirmText={t('common.confirm') || 'Confirm'}
            cancelText={t('common.cancel')}
            onConfirm={() => {
                setFormData(prev => ({ ...prev, status: approvalWarning.pendingStatus }));
                setApprovalWarning({ show: false, pendingStatus: '' });
            }}
            onCancel={() => setApprovalWarning({ show: false, pendingStatus: '' })}
        />
        <ConfirmModal
            intent="primary"
            isOpen={publishConfirm.show}
            title={t('itr.publishTitle') || 'Publish Revision'}
            message={`${t('itr.publishConfirm') || 'Are you sure you want to publish as'} ${publishConfirm.nextRev}?`}
            confirmText={t('itr.publish') || 'Publish'}
            cancelText={t('common.cancel')}
            onConfirm={() => {
                const rev = publishConfirm.nextRev;
                setPublishConfirm({ show: false, nextRev: '' });
                doPublish(rev);
            }}
            onCancel={() => setPublishConfirm({ show: false, nextRev: '' })}
        />
        <ConfirmModal
            isOpen={unlinkConfirm.show}
            title={t('common.confirmDeleteTitle')}
            message={t('itr.confirmUnlinkChecklist') || 'Remove this checklist snapshot?'}
            confirmText={t('common.delete')}
            cancelText={t('common.cancel')}
            onConfirm={async () => {
                const id = unlinkConfirm.id;
                setUnlinkConfirm({ show: false, id: null });
                if (id && persistedItrId) {
                    try {
                        await unlinkChecklistFromITR(persistedItrId, id);
                        await refreshInstances();
                    } catch (e: any) {
                        toast.error(e?.response?.data?.detail || (e as Error)?.message || 'Failed to remove checklist');
                    }
                }
            }}
            onCancel={() => setUnlinkConfirm({ show: false, id: null })}
        />
        {previewUrl && (
            <ImagePreviewOverlay key={previewUrl} url={previewUrl} name={previewName} onClose={() => setPreviewUrl(null)} />
        )}
        </>
    );
};

export interface ITRPrintPreviewProps {
    data: ITRDetailData;
    onClose: () => void;
}

export const ITRPrintPreview: React.FC<ITRPrintPreviewProps> = ({ data: displayData, onClose }) => {
    const { t } = useLanguage();
    const printRoot = document.getElementById('itr-single-print-root');

    const handlePrint = () => {
        window.print();
    };

    const printContent = (
        <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '12px', lineHeight: 1.6, color: '#1a1a1a' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 700, textAlign: 'center', marginBottom: '4px' }}>Inspection & Test Record (ITR)</h1>
            <p style={{ textAlign: 'center', fontSize: '11px', color: '#666', marginBottom: '16px' }}>{displayData.itrNumber || '-'}</p>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
                <tbody>
                    {[
                        [t('common.referenceNo'), displayData.itrNumber, t('noi.package'), displayData.subject],
                        [t('itr.inspectionDate'), displayData.raiseDate, t('common.version'), displayData.type],
                        [t('common.dueDate'), displayData.dueDate, t('itr.closeoutDate'), displayData.closeoutDate],
                        [t('itr.noiNo'), displayData.noiNumber, t('common.contractor'), displayData.contractor],
                        [t('itr.relatedITP'), displayData.itpNo, t('itr.ncrNo'), displayData.ncrNumber],
                        [t('common.status'), displayData.status, t('itr.raisedBy'), displayData.raisedBy],
                    ].map((row, i) => (
                        <tr key={i}>
                            <td style={{ border: '1px solid #ccc', padding: '4px 8px', fontWeight: 600, backgroundColor: '#f5f5f5', width: '18%' }}>{row[0]}</td>
                            <td style={{ border: '1px solid #ccc', padding: '4px 8px', width: '32%' }}>{row[1] || '-'}</td>
                            <td style={{ border: '1px solid #ccc', padding: '4px 8px', fontWeight: 600, backgroundColor: '#f5f5f5', width: '18%' }}>{row[2]}</td>
                            <td style={{ border: '1px solid #ccc', padding: '4px 8px', width: '32%' }}>{row[3] || '-'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Linked Checklist results (ITR-INPUT-UX-IMPLEMENT-2026-006): the actual
                inspection item/criteria/situation/result data was previously entirely absent
                from the printed ITR — only the basic-info table and free-text fields were
                printed, never the Checklist data linkedChecklists already carries. */}
            {(displayData.linkedChecklists || []).map((raw: any) => {
                let dd: any = {};
                try {
                    dd = raw.detail_data ? (typeof raw.detail_data === 'string' ? JSON.parse(raw.detail_data) : raw.detail_data) : {};
                } catch { dd = {}; }
                const items: any[] = dd.items || [];
                const resultLabel = (value: unknown) => {
                    const kind = classifyResult(value);
                    if (kind === 'unknown') return String(value ?? '');
                    return t(`checklist.result.${kind}`);
                };
                return (
                    <div key={raw.id} style={{ marginBottom: '14px' }}>
                        <div style={{ fontWeight: 600, fontSize: '12px', color: '#1a1a1a', marginBottom: '4px' }}>
                            {raw.recordsNo} — {raw.activity}
                            {raw.status && <span style={{ fontWeight: 400, color: '#666' }}> ({raw.status})</span>}
                        </div>
                        {items.length > 0 ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ border: '1px solid #ccc', padding: '4px 6px', backgroundColor: '#f5f5f5', fontSize: '11px', textAlign: 'left', width: '5%' }}>#</th>
                                        <th style={{ border: '1px solid #ccc', padding: '4px 6px', backgroundColor: '#f5f5f5', fontSize: '11px', textAlign: 'left', width: '20%' }}>{t('checklist.item')}</th>
                                        <th style={{ border: '1px solid #ccc', padding: '4px 6px', backgroundColor: '#f5f5f5', fontSize: '11px', textAlign: 'left', width: '20%' }}>{t('checklist.criteria')}</th>
                                        <th style={{ border: '1px solid #ccc', padding: '4px 6px', backgroundColor: '#f5f5f5', fontSize: '11px', textAlign: 'left', width: '40%' }}>{t('checklist.situation')}</th>
                                        <th style={{ border: '1px solid #ccc', padding: '4px 6px', backgroundColor: '#f5f5f5', fontSize: '11px', textAlign: 'left', width: '15%' }}>{t('checklist.result')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item: any, idx: number) => (
                                        <tr key={item.id ?? idx}>
                                            <td style={{ border: '1px solid #ccc', padding: '4px 6px', fontSize: '11px', verticalAlign: 'top' }}>{idx + 1}</td>
                                            <td style={{ border: '1px solid #ccc', padding: '4px 6px', fontSize: '11px', verticalAlign: 'top' }}>{item.item}</td>
                                            <td style={{ border: '1px solid #ccc', padding: '4px 6px', fontSize: '11px', verticalAlign: 'top' }}>{item.criteria}</td>
                                            <td style={{ border: '1px solid #ccc', padding: '4px 6px', fontSize: '11px', verticalAlign: 'top', whiteSpace: 'pre-wrap' }}>{item.situation || '-'}</td>
                                            <td style={{ border: '1px solid #ccc', padding: '4px 6px', fontSize: '11px', verticalAlign: 'top' }}>{resultLabel(item.result)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>{t('checklist.noItems')}</div>
                        )}
                    </div>
                );
            })}

            {[
                { label: t('itr.referenceStandards'), value: displayData.referenceStandards },
                { label: t('itr.foundLocation'), value: displayData.foundLocation },
                { label: t('itr.detailsDescription'), value: displayData.detailsDescription },
                { label: t('itr.repairMethodStatement') || 'Repair Method Statement', value: displayData.repairMethodStatement },
                { label: t('itr.immediateCorrectionAction') || 'Immediate Correction Action', value: displayData.immediateCorrectionAction },
                { label: t('itr.rootCauseAnalysis') || 'Root Cause Analysis', value: displayData.rootCauseAnalysis },
                { label: t('itr.correctiveActions') || 'Corrective Actions', value: displayData.correctiveActions },
                { label: t('itr.preventiveAction') || 'Preventive Action', value: displayData.preventiveAction },
                { label: t('itr.finalProductIntegrityStatement') || 'Final Product Integrity Statement', value: displayData.finalProductIntegrityStatement },
            ].filter(item => item.value).map((item, i) => (
                <div key={i} style={{ marginBottom: '10px' }}>
                    <div style={{ fontWeight: 600, fontSize: '11px', color: '#444', borderBottom: '1px solid #ddd', paddingBottom: '2px', marginBottom: '4px' }}>{item.label}</div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>{item.value}</div>
                </div>
            ))}

            {displayData.remark && (
                <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontWeight: 600, fontSize: '11px', color: '#444', borderBottom: '1px solid #ddd', paddingBottom: '2px', marginBottom: '4px' }}>{t('common.remark')}</div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>{displayData.remark}</div>
                </div>
            )}

            <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ borderTop: '1px solid #000', width: '30%', textAlign: 'center', paddingTop: '4px', fontSize: '11px' }}>Prepared By</div>
                <div style={{ borderTop: '1px solid #000', width: '30%', textAlign: 'center', paddingTop: '4px', fontSize: '11px' }}>Reviewed By</div>
                <div style={{ borderTop: '1px solid #000', width: '30%', textAlign: 'center', paddingTop: '4px', fontSize: '11px' }}>Approved By</div>
            </div>
        </div>
    );

    return (
        <>
            {/* Portal: render print content outside #root so @media print can show it */}
            {printRoot && ReactDOM.createPortal(printContent, printRoot)}

            {/* On-screen preview modal */}
            <div className={formStyles.modalOverlay} style={{ zIndex: 1100 }}>
                <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                    <div className={formStyles.modalHeader}>
                        <h2>{t('itr.detailsTitle') || 'ITR Details (Print Preview)'}</h2>
                        <button className={formStyles.closeButton} aria-label={t('common.close')} title={t('common.close')} onClick={onClose}>×</button>
                    </div>
                    <div className={formStyles.modalBody}>
                        {printContent}
                    </div>
                    <FormActions
                        tools={<>
                            <button className={actionStyles.secondary} onClick={handlePrint}>
                                {t('common.print')}
                            </button>
                        </>}
                        cancel={<>
                            <button className={actionStyles.secondary} onClick={onClose}>
                                {t('common.close')}
                            </button>
                        </>}
                    />
                </div>
            </div>
        </>
    );
};
