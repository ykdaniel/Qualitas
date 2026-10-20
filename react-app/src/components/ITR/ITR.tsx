import React, { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Hammer, CheckCircle2, XCircle, AlertTriangle, BarChart3, Search } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import { useCreateGate } from '../../hooks/useCreateGate';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useITRStats, isITROverdue } from '../../hooks/useITRStats';
import { useITRStore } from '../../store/itrStore';
import type { ITRItem } from '../../store/itrStore';
import { showRefusal } from '../../store/refusalStore';

import { useChecklistStore } from '../../store/checklistStore';
import { checkITRChecklistReferences, generateDeleteMessage } from '../../utils/cascadeDelete';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { ITRDetailModal, ITRDetailData, PendingUploads, type ITRSaveOutcome } from './ITRModals';
import ConfirmModal from '../Shared/ConfirmModal';
import { uploadFiles, deleteFile } from '../../services/api';
import { describeSaveError } from '../../utils/saveErrors';
import { runSaveFlow, sameWrite, type SaveOutcome } from '../../utils/saveFlow';
import { reloadAndReopen, useOpenSession, useRecordVersion } from '../../hooks/useRecordVersion';
import shellStyles from '../Shared/ModuleShell.module.css';

type StatusFilter = 'all' | 'inProgress' | 'approved' | 'reject' | 'void' | 'overdue';

const ITR: React.FC = () => {
    const { t } = useLanguage();
    const createGate = useCreateGate();
    const { hasPermission } = useAuth();
    const canEdit = hasPermission('itr:update:all');
    const navigate = useNavigate();
    const { itrList, loading, error, refetch, addITR, updateITR, deleteITR } = useITRStore();
    const checklistList = useChecklistStore(state => state.records);

    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 500);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    React.useEffect(() => {
        refetch({ search: debouncedSearch });
    }, [debouncedSearch, refetch]);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentItrId, setCurrentItrId] = useState<string | null>(null);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
        isOpen: false,
        id: null,
        message: '',
    });

    const filteredList = useMemo(() => {
        if (statusFilter === 'all') return itrList;
        if (statusFilter === 'overdue') return itrList.filter(isITROverdue);
        const target = ({
            inProgress: 'in progress',
            approved: 'approved',
            reject: 'reject',
            void: 'void',
        } as const)[statusFilter];
        return itrList.filter(item => (item.status || '').toLowerCase() === target);
    }, [itrList, statusFilter]);

    const statistics = useITRStats(itrList);

    // The last successful record write of the open modal (id + serialized payload) — see runSaveFlow / sameWrite.
    const lastWriteRef = useRef<{ id: string; key: string } | null>(null);
    // OPTIMISTIC-LOCK-2026-001 B4: the version the open form saves against (taken when it opens, moved on by every write that
    // went through — a new ITR stays open on the record it created) and which opening is current (keys the form with the id;
    // guards a reload's late reopen and an answer that comes back after its window).
    const recordVersion = useRecordVersion();
    const openSession = useOpenSession();
    const nextOpenSession = openSession.next;

    const handleAddNew = () => {
        lastWriteRef.current = null;
        recordVersion.open(null);
        nextOpenSession();
        setCurrentItrId(null);
        setIsEditModalOpen(true);
    };

    const handleEdit = React.useCallback((id: string) => {
        lastWriteRef.current = null;
        recordVersion.open(useITRStore.getState().itrList.find(item => item.id === id)?.row_version);
        nextOpenSession();
        setCurrentItrId(id);
        setIsEditModalOpen(true);
    }, [recordVersion, nextOpenSession]);

    // "Reload this record" after a 409 VERSION_CONFLICT (the refusal dialog has already confirmed that the form's changes are
    // discarded): close the form, reload the list, open the ITR again with what is saved now.
    const reloadRecord = (id: string) => reloadAndReopen(openSession, {
        close: () => setIsEditModalOpen(false),
        reload: () => refetch({ search: debouncedSearch }),
        failed: () => !!useITRStore.getState().error,
        found: () => useITRStore.getState().itrList.some(item => item.id === id),
        reopen: () => handleEdit(id),
        forget: () => { setCurrentItrId(null); openedViaDeepLinkRef.current = false; },
        notify: (notice) => toast.warning(t(notice)),
    });

    const [searchParams, setSearchParams] = useSearchParams();
    const deepLinkAppliedRef = useRef(false);
    // Set true only when the currently-open modal was reached via ?openId=
    // (e.g. from Follow Up Issues) — lets onClose send the user back where
    // they came from via browser history instead of just landing on this
    // page's plain list, which is otherwise indistinguishable from having
    // navigated here directly from the sidebar.
    const openedViaDeepLinkRef = useRef(false);
    useEffect(() => {
        if (deepLinkAppliedRef.current) return;
        const openId = searchParams.get('openId');
        if (!openId) return;
        if (itrList.length === 0) return;
        const match = itrList.find(item => item.id === openId);
        if (!match) return;
        handleEdit(openId);
        openedViaDeepLinkRef.current = true;
        deepLinkAppliedRef.current = true;
        const next = new URLSearchParams(searchParams);
        next.delete('openId');
        setSearchParams(next, { replace: true });
    }, [searchParams, itrList, handleEdit, setSearchParams]);

    const handleDeleteClick = React.useCallback((id: string) => {
        const itr = itrList.find(item => item.id === id);
        if (!itr) return;

        const checklistReferences = checkITRChecklistReferences(id, checklistList);
        const message = generateDeleteMessage('ITR', itr.documentNumber || itr.id, checklistReferences.references, t);

        setDeleteModal({ isOpen: true, id, message });
    }, [itrList, checklistList, t]);

    const columns = useMemo(() => createColumns(handleDeleteClick, navigate, t), [handleDeleteClick, navigate, t]);

    const handleDelete = async () => {
        if (!deleteModal.id) return;
        try {
            await deleteITR(deleteModal.id);
        } catch (err) {
            // locked / has approval history / cited / has evidence: shown in the refusal dialog (the page banner is for list loads only)
            console.error('Failed to delete ITR:', err);
            showRefusal(err, 'delete');
        } finally {
            setDeleteModal({ isOpen: false, id: null, message: '' });
        }
    };

    const fileSteps = {
        upload: (id: string, group: { category: string; files: File[] }) => uploadFiles('itr', id, group.files, group.category),
        remove: deleteFile,
        reload: async () => { await refetch(); return !useITRStore.getState().error; },
        describe: (e: unknown) => describeSaveError(e, t),
    };

    // Once everything is stored: a new ITR stays open on the record just created (2026-10-10: checklists can only be linked to a
    // saved ITR); the modal is keyed on the id, so it reopens fresh from the stored record. Existing ITRs close.
    const settle = (outcome: SaveOutcome): ITRSaveOutcome => {
        if (outcome.status !== 'saved' && outcome.status !== 'saved-reload-failed') return outcome;
        const id = lastWriteRef.current?.id;
        if (!currentItrId && id && useITRStore.getState().itrList.some(i => i.id === id)) {
            const number = useITRStore.getState().itrList.find(i => i.id === id)?.documentNumber || '';
            setCurrentItrId(id);
            toast.success(t('itr.createdKeepOpen', { number }));
            return { ...outcome, keptOpen: true };
        }
        setIsEditModalOpen(false);
        setCurrentItrId(null);
        return outcome;
    };

    // Retry of the unfinished file steps only: the record is stored already and is NOT written again.
    const handleRetryITRFiles = async (pendingUploads: PendingUploads[], deletedFileIds: string[]): Promise<ITRSaveOutcome> => {
        const id = lastWriteRef.current?.id;
        if (!id) return { status: 'failed', message: t('common.saveFailed') };
        return settle(await runSaveFlow({
            writeRecord: async () => { throw new Error('a file retry never writes the record'); },
            reuseId: id,
            uploads: pendingUploads,
            deletedFileIds,
            ...fileSteps,
        }));
    };

    const handleSaveITRDetails = async (details: ITRDetailData, pendingUploads: PendingUploads[], deletedFileIds: string[], publishOnly?: boolean): Promise<ITRSaveOutcome | void> => {
        // Publish behaves differently depending on whether the ITR is ALREADY Approved:
        // - Already Approved (re-Publish to bump the revision): the backend locks every field but
        //   type/status/detail_data on a locked record and rejects anything else outright, so only
        //   type/status may be sent here.
        // - NOT yet Approved (the first real approval): the backend has no such restriction, and
        //   `details` already carries the full current form state (ITRModals.tsx's doPublish sends
        //   `{...formData, status: 'Approved'}`). Restricting to type/status here as well silently
        //   discarded any field the user had changed but not yet saved with a plain Save click —
        //   e.g. picking Inspection Result then clicking Publish directly — because Publish never
        //   sent it at all (2026-09-29 fix, found via real Publish-without-Save on
        //   QTS-CWC-ITR-000001: reopening afterward showed "Not yet assessed" despite Pass having
        //   been selected). Falling through to the normal save path below sends the full form,
        //   exactly like a plain Save immediately followed by Publish would.
        const currentPersistedStatus = currentItrId ? itrList.find(i => i.id === currentItrId)?.status : undefined;
        if (publishOnly && currentPersistedStatus === 'Approved') {
            if (!currentItrId) return;
            try {
                await updateITR(currentItrId, { type: details.type, status: details.status }, recordVersion.current());
                setIsEditModalOpen(false);
            } catch (error) {
                console.error('Error publishing ITR:', error);
                const id = currentItrId;
                showRefusal(error, 'save', { onReload: () => { void reloadRecord(id); } });
            }
            return;
        }

        const itemData: Omit<ITRItem, 'id'> = {
            vendor: details.contractor || '',
            documentNumber: details.itrNumber || '',
            description: details.detailsDescription || details.subject || '',
            status: details.status || 'In Progress',
            remark: details.remark || '',
            rev: details.type || 'Rev1.0',
            submit: details.raiseDate || new Date().toISOString().split('T')[0],
            raiseDate: details.raiseDate,
            closeoutDate: details.closeoutDate,
            aconex: details.aconex,
            type: details.type,
            subject: details.subject,
            ncrNumber: details.ncrNumber,
            raisedBy: details.raisedBy,
            foundLocation: details.foundLocation,
            noiNumber: details.noiNumber,
            eventNumber: details.eventNumber,
            checkpoint: details.checkpoint,
            inspectionResult: details.inspectionResult,
            defectPhotos: details.defectPhotos,
            improvementPhotos: details.improvementPhotos,
            attachments: details.attachments,
            // §17: checklists are now standalone instance rows (linked via the
            // link/unlink endpoints), not packed into the ITR payload.
            detail_data: JSON.stringify({
                referenceStandards: details.referenceStandards,
                repairMethodStatement: details.repairMethodStatement,
                immediateCorrectionAction: details.immediateCorrectionAction,
                rootCauseAnalysis: details.rootCauseAnalysis,
                correctiveActions: details.correctiveActions,
                preventiveAction: details.preventiveAction,
                finalProductIntegrityStatement: details.finalProductIntegrityStatement,
                serialNumbers: details.serialNumbers,
                reInspectionNumber: details.reInspectionNumber,
                projectQualityManager: details.projectQualityManager,
                drawings: details.drawings,
                certificates: details.certificates,
            }),
        };

        // REFUSAL-DIALOG-2026-003 (user's decision 2026-10-17): the same save chain as NCR / OBS / NOI. A record that is stored while a
        // file step failed keeps the modal open with the amber follow-up banner and a retry of only the leftover files; a refused or
        // failed record write goes to the refusal dialog (the modal shows it). A new ITR whose record exists but whose files are not
        // done yet stays on this (unkeyed-by-id) form so the pending files survive; the retry then targets the stored record.
        const targetId = currentItrId ?? lastWriteRef.current?.id ?? null;
        const mine = openSession.key;             // the answer's version belongs to this window only
        const outcome = await runSaveFlow({
            writeRecord: async () => {
                if (targetId) {
                    const saved = await updateITR(targetId, itemData, recordVersion.current());
                    if (openSession.isCurrent(mine)) recordVersion.saved(saved.row_version);
                    return targetId;
                }
                const created = await addITR(itemData);
                if (openSession.isCurrent(mine)) recordVersion.saved(created.row_version);
                return created.id;
            },
            reuseId: sameWrite(lastWriteRef.current, targetId, itemData) ? targetId : null,
            uploads: pendingUploads,
            deletedFileIds,
            ...fileSteps,
            onRecordSaved: (id) => { lastWriteRef.current = { id, key: JSON.stringify(itemData) }; },
        });
        return settle(outcome);
    };

    const chips: { id: StatusFilter; label: string; count: number }[] = [
        { id: 'all', label: t('common.all') || 'All', count: statistics.total },
        { id: 'inProgress', label: t('itr.status.inProgress'), count: statistics.inProgress },
        { id: 'approved', label: t('itr.status.approved'), count: statistics.approved },
        { id: 'reject', label: t('itr.status.reject'), count: statistics.reject },
        { id: 'overdue', label: t('itr.overdue'), count: statistics.overdue },
        { id: 'void', label: t('itp.status.void') || 'Void', count: statistics.void },
    ];

    const summary = [
        {
            key: 'inProgress',
            label: t('itr.status.inProgress'),
            value: statistics.inProgress,
            icon: <Hammer size={18} strokeWidth={1.8} />,
            accent: '#c8753f',
        },
        {
            key: 'approved',
            label: t('itr.status.approved'),
            value: statistics.approved,
            icon: <CheckCircle2 size={18} strokeWidth={1.8} />,
            accent: '#7a8f5a',
        },
        {
            key: 'reject',
            label: t('itr.status.reject'),
            value: statistics.reject,
            icon: <XCircle size={18} strokeWidth={1.8} />,
            accent: '#b86060',
        },
        {
            key: 'overdue',
            label: t('itr.overdue'),
            value: statistics.overdue,
            icon: <AlertTriangle size={18} strokeWidth={1.8} />,
            accent: '#b8945a',
        },
        {
            key: 'total',
            label: t('obs.statTotal') || 'Total',
            value: statistics.total,
            icon: <BarChart3 size={18} strokeWidth={1.8} />,
            accent: '#8a6a3a',
        },
    ];

    return (
        <div className={shellStyles.container}>
            {error && (
                <div className={shellStyles.errorBanner}>
                    <span>{error}</span>
                    <button type="button" className={shellStyles.retryButton} onClick={() => refetch()}>
                        {t('common.retry')}
                    </button>
                </div>
            )}

            <section className={shellStyles.summaryGrid}>
                {summary.map((card) => (
                    <div
                        key={card.key}
                        className={shellStyles.summaryCard}
                        style={{ '--accent': card.accent } as React.CSSProperties}
                    >
                        <div className={shellStyles.summaryIcon}>{card.icon}</div>
                        <div className={shellStyles.summaryBody}>
                            <div className={shellStyles.summaryLabel}>{card.label}</div>
                            <div className={shellStyles.summaryValue}>{card.value}</div>
                        </div>
                    </div>
                ))}
            </section>

            <div className={shellStyles.toolbar}>
                <div className={shellStyles.chipGroup}>
                    {chips.map((chip) => (
                        <button
                            key={chip.id}
                            type="button"
                            className={`${shellStyles.chip} ${statusFilter === chip.id ? shellStyles.chipActive : ''}`}
                            onClick={() => setStatusFilter(chip.id)}
                        >
                            {chip.label}
                            <span className={shellStyles.chipCount}>{chip.count}</span>
                        </button>
                    ))}
                </div>
                <div className={shellStyles.toolbarRight}>
                    <div className={shellStyles.searchWrap}>
                        <Search size={15} className={shellStyles.searchIcon} strokeWidth={2} />
                        <input
                            type="text"
                            className={shellStyles.searchInput}
                            placeholder={t('itr.searchPlaceholder') || 'Search ITR...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button type="button" className={shellStyles.addNewButton} onClick={handleAddNew}
                        disabled={createGate.disabled} title={createGate.title}>
                        {t('itr.addNew') || '+ New ITR'}
                    </button>
                </div>
            </div>

            {loading && (
                <div className={shellStyles.loadingNote}>{t('common.loading')}</div>
            )}

            <div className={shellStyles.content}>
                <DataTable
                    columns={columns}
                    data={filteredList}
                    searchKey=""
                    getRowClassName={(row) => {
                        const s = (row.status || '').toLowerCase();
                        if (s === 'void') return shellStyles.rowDim;
                        if (isITROverdue(row)) return shellStyles.rowAlert;
                        return '';
                    }}
                    getRowId={(row) => row.id}
                    onRowClick={(row) => handleEdit(row.id)}
                />
            </div>

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={t('common.confirmDeleteTitle')}
                message={deleteModal.message || t('common.confirmDeleteMsg')}
                onConfirm={handleDelete}
                onCancel={() => setDeleteModal({ isOpen: false, id: null, message: '' })}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
            />

            {isEditModalOpen && (
                <ITRDetailModal
                    key={`${currentItrId || 'new'}:${openSession.key}`}
                    recordVersion={recordVersion}
                    onReloadRecord={currentItrId ? () => { void reloadRecord(currentItrId); } : undefined}
                    itrId={currentItrId || 'new'}
                    existingItem={currentItrId ? itrList.find(i => i.id === currentItrId) : undefined}
                    itrList={itrList}
                    onSave={handleSaveITRDetails}
                    onRetryFiles={handleRetryITRFiles}
                    onRevoked={async () => {
                        // Reload backend state, then close — reopening shows the
                        // fresh (no longer Approved) status, same as after a save.
                        await refetch();
                        setIsEditModalOpen(false);
                        setCurrentItrId(null);
                    }}
                    onClose={() => {
                        if (openedViaDeepLinkRef.current) {
                            openedViaDeepLinkRef.current = false;
                            navigate(-1);
                            return;
                        }
                        setIsEditModalOpen(false);
                        setCurrentItrId(null);
                    }}
                    onDismiss={() => {
                        // Plain close, used right before this modal navigates
                        // itself elsewhere (Raise NCR / Re-inspect) — skip
                        // onClose's deep-link navigate(-1), and reset the
                        // deep-link guard so a follow-up ?openId= (e.g. the
                        // just-created re-inspection ITR) can still be picked
                        // up by the effect above instead of being ignored as
                        // "already applied this page load".
                        openedViaDeepLinkRef.current = false;
                        deepLinkAppliedRef.current = false;
                        setIsEditModalOpen(false);
                        setCurrentItrId(null);
                    }}
                    readOnly={!canEdit}
                />
            )}
        </div>
    );
};

export default ITR;
