import React, { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BackButton } from '@/components/ui/BackButton';
import { useDebounce } from '../../hooks/useDebounce';
import { useLanguage } from '../../context/LanguageContext';
import { useITRStats, isITROverdue } from '../../hooks/useITRStats';
import { StatItem } from '../Shared/StatItem';
import statStyles from '../Shared/StatItem.module.css';
import { useITRStore } from '../../store/itrStore';
import type { ITRItem } from '../../store/itrStore';

import { useChecklistStore } from '../../store/checklistStore';
import { checkITRChecklistReferences, generateDeleteMessage } from '../../utils/cascadeDelete';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { ITRDetailModal, ITRDetailData, PendingUploads } from './ITRModals';
import ConfirmModal from '../Shared/ConfirmModal';
import { uploadFiles, deleteFile } from '../../services/api';
import styles from './ITR.module.css';

const ITR: React.FC = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { itrList, loading, error, refetch, addITR, updateITR, deleteITR } = useITRStore();
    const checklistList = useChecklistStore(state => state.records);

    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 500);
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Trigger server-side refetch when debounced search changes
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

    // Apply client-side status/overdue filter on top of backend results.
    const filteredList = useMemo(() => {
        if (statusFilter === 'all') return itrList;
        if (statusFilter === 'overdue') return itrList.filter(isITROverdue);
        return itrList.filter(item => {
            const s = (item.status || '').toLowerCase();
            return s === statusFilter.toLowerCase();
        });
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

    // ── Deep-link support: /itr?openId=<id> opens that ITR's detail
    // modal on mount. Same pattern as NCR and NOI pages.
    const [searchParams, setSearchParams] = useSearchParams();
    const deepLinkAppliedRef = useRef(false);
    useEffect(() => {
        if (deepLinkAppliedRef.current) return;
        const openId = searchParams.get('openId');
        if (!openId) return;
        if (itrList.length === 0) return;
        const match = itrList.find(item => item.id === openId);
        if (!match) return;
        handleEdit(openId);
        deepLinkAppliedRef.current = true;
        const next = new URLSearchParams(searchParams);
        next.delete('openId');
        setSearchParams(next, { replace: true });
    }, [searchParams, itrList, handleEdit, setSearchParams]);

    const handleDeleteClick = React.useCallback((id: string) => {
        const itr = itrList.find(item => item.id === id);
        if (!itr) return;

        // Check for checklist references
        const checklistReferences = checkITRChecklistReferences(id, checklistList);
        const message = generateDeleteMessage('ITR', itr.documentNumber || itr.id, checklistReferences.references, t);

        setDeleteModal({ isOpen: true, id, message });
    }, [itrList, checklistList, t]);

    const columns = useMemo(() => createColumns(handleEdit, handleDeleteClick, navigate, t), [handleEdit, handleDeleteClick, navigate, t]);

    const handleDelete = async () => {
        if (deleteModal.id) {
            await deleteITR(deleteModal.id);
            setDeleteModal({ isOpen: false, id: null, message: '' });
        }
    };

    const handleSaveITRDetails = async (details: ITRDetailData, pendingUploads: PendingUploads[], deletedFileIds: string[]) => {
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
            defectPhotos: details.defectPhotos,
            improvementPhotos: details.improvementPhotos,
            attachments: details.attachments,
            linkedChecklists: details.linkedChecklists,
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
                certificates: details.certificates
            })
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
                            const moduleStr = 'itr';
                            await uploadFiles(moduleStr, targetId as string, uploadGroup.files, uploadGroup.category);
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
            const raw = error?.response?.data?.detail;
            const detail = typeof raw === 'string' ? raw
                : Array.isArray(raw) ? raw.map((e: any) => e.msg || JSON.stringify(e)).join('; ')
                : t('common.saveFailed') || 'Save failed';
            toast.error(detail);
        }
    };


    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <BackButton />
                    <h1>{t('itr.title') || t('home.itr.description') || 'ITR'}</h1>
                </div>
                <div className={styles.headerRight}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder={t('itr.searchPlaceholder') || 'Search ITR...'}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className={styles.summarySection}>
                <h2 className={styles.summaryTitle}>{t('obs.statsTitle') || 'Statistics'}</h2>
                <div className={styles.statsContainer}>
                    <div className={styles.statusStatsGrid}>
                        <StatItem 
                            label={t('itr.status.inProgress')} 
                            value={statistics.inProgress} 
                            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
                            iconColorClass={statStyles.blueIcon} 
                        />
                        <StatItem 
                            label={t('itr.status.approved')} 
                            value={statistics.approved} 
                            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
                            iconColorClass={statStyles.greenIcon} 
                        />
                        <StatItem 
                            label={t('itr.status.reject')} 
                            value={statistics.reject} 
                            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>} 
                            iconColorClass={statStyles.pinkIcon} 
                        />
                        <StatItem
                            label={t('itr.overdue')}
                            value={statistics.overdue}
                            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            iconColorClass={statStyles.orangeIcon}
                        />
                        <StatItem
                            label={t('obs.statTotal')}
                            value={statistics.total}
                            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" /><path d="M18 17V9M12 17V5M6 17v-3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            iconColorClass={statStyles.grayIcon}
                        />
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {([
                    { key: 'all', label: t('common.all') || 'All' },
                    { key: 'In Progress', label: t('itr.status.inProgress') },
                    { key: 'Approved', label: t('itr.status.approved') },
                    { key: 'Reject', label: t('itr.status.reject') },
                    { key: 'overdue', label: t('itr.overdue') },
                ] as const).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setStatusFilter(tab.key)}
                        style={{
                            padding: '6px 16px',
                            borderRadius: 9999,
                            border: statusFilter === tab.key ? '2px solid #2563eb' : '1px solid #d1d5db',
                            background: statusFilter === tab.key ? '#eff6ff' : '#fff',
                            color: statusFilter === tab.key ? '#2563eb' : '#374151',
                            fontWeight: statusFilter === tab.key ? 600 : 400,
                            fontSize: 14,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className={styles.content}>
                {loading && <p>{t('common.loading')}</p>}
                {error && (
                    <div className={styles.error}>
                        <p>{error}</p>
                        <button onClick={() => refetch()}>{t('common.retry')}</button>
                    </div>
                )}
                {!loading && !error && (
                    <DataTable
                        title={t('itr.listTitle') || 'ITR List'}
                        actions={
                            <button className={styles.addNewButton} onClick={handleAddNew}>
                                {t('itr.addNew') || '+ New ITR'}
                            </button>
                        }
                        columns={columns}
                        data={filteredList}
                        searchKey=""
                        searchPlaceholder={t('itr.searchPlaceholder')}
                        getRowId={(row) => row.id}
                        onRowClick={(row) => handleEdit(row.id)}
                    />
                )}
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
                    onClose={() => setIsEditModalOpen(false)}
                />
            )}
        </div>
    );
};

export default ITR;
