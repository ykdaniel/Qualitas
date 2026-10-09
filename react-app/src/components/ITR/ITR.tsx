import React, { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Hammer, CheckCircle2, XCircle, AlertTriangle, BarChart3, Search } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useITRStats, isITROverdue } from '../../hooks/useITRStats';
import { useITRStore } from '../../store/itrStore';
import type { ITRItem } from '../../store/itrStore';

import { useChecklistStore } from '../../store/checklistStore';
import { checkITRChecklistReferences, generateDeleteMessage } from '../../utils/cascadeDelete';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { ITRDetailModal, ITRDetailData, PendingUploads } from './ITRModals';
import ConfirmModal from '../Shared/ConfirmModal';
import { uploadFiles, deleteFile } from '../../services/api';
import { describeSaveError } from '../../utils/saveErrors';
import shellStyles from '../Shared/ModuleShell.module.css';

type StatusFilter = 'all' | 'inProgress' | 'approved' | 'reject' | 'void' | 'overdue';

const ITR: React.FC = () => {
    const { t } = useLanguage();
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

    const handleAddNew = () => {
        setCurrentItrId(null);
        setIsEditModalOpen(true);
    };

    const handleEdit = React.useCallback((id: string) => {
        setCurrentItrId(id);
        setIsEditModalOpen(true);
    }, []);

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
        if (deleteModal.id) {
            await deleteITR(deleteModal.id);
            setDeleteModal({ isOpen: false, id: null, message: '' });
        }
    };

    const handleSaveITRDetails = async (details: ITRDetailData, pendingUploads: PendingUploads[], deletedFileIds: string[], publishOnly?: boolean) => {
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
                await updateITR(currentItrId, { type: details.type, status: details.status });
                setIsEditModalOpen(false);
            } catch (error) {
                console.error('Error publishing ITR:', error);
                toast.error('Failed to publish ITR.');
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

        try {
            let targetId = currentItrId;
            if (currentItrId) {
                await updateITR(currentItrId, itemData);
            } else {
                const newITR = await addITR(itemData);
                targetId = newITR.id;
            }

            if (deletedFileIds && deletedFileIds.length > 0) {
                for (const fileId of deletedFileIds) {
                    try {
                        await deleteFile(fileId);
                    } catch (error) {
                        console.error('Error deleting file:', fileId, error);
                    }
                }
            }

            if (pendingUploads && pendingUploads.length > 0) {
                for (const uploadGroup of pendingUploads) {
                    if (uploadGroup.files.length > 0) {
                        try {
                            await uploadFiles('itr', targetId as string, uploadGroup.files, uploadGroup.category);
                        } catch (error) {
                            console.error(`Error uploading files for category ${uploadGroup.category}:`, error);
                            toast.error(`Failed to upload some files for ${uploadGroup.category}.`);
                        }
                    }
                }
            }

            await refetch();

            setIsEditModalOpen(false);
            setCurrentItrId(null);
        } catch (error: any) {
            // FORMS-CONSISTENCY-2026-003: this used to show error.response.data.detail
            // verbatim, including for 5xx — the raw backend detail text (e.g. a stack
            // trace or validation dump) went straight to the user. Routed through
            // describeSaveError (never exposes the raw body for 5xx) so the message text
            // stays friendly, same as NOI/NCR.
            //
            // FORMS-CONSISTENCY-2026-004: the wrapper itself is deliberately NOT the
            // shared saveFlow.failedKeep ("Not saved — ..."). This catch also covers a
            // 5xx or a network error with no response at all — those do not prove the
            // write never reached the server, only that this client never got
            // confirmation. Asserting "Not saved" here would be a guess dressed up as
            // fact. ITR gets its own itr.saveNotConfirmed wording instead; NOI/NCR keep
            // saveFlow.failedKeep as-is (not touched by this round).
            toast.error(t('itr.saveNotConfirmed', { message: describeSaveError(error, t) }), { duration: 10000 });
            // Re-throw (2026-09-19 fix): the modal's own handleSave awaits
            // this onSave call and only closes on success — swallowing the
            // error here made every failed save (e.g. approving without
            // ITR_APPROVE, or a backend validation rejection) look
            // successful to the modal, which then closed anyway and
            // discarded the user's in-progress edits. Re-throwing lets the
            // modal correctly keep itself open with the content intact.
            throw error;
        }
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
                    <button type="button" className={shellStyles.addNewButton} onClick={handleAddNew}>
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
                    itrId={currentItrId || 'new'}
                    existingItem={currentItrId ? itrList.find(i => i.id === currentItrId) : undefined}
                    itrList={itrList}
                    onSave={handleSaveITRDetails}
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
