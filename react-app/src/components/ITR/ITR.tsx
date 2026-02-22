import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '@/components/ui/BackButton';
import { useDebounce } from '../../hooks/useDebounce';
import { useLanguage } from '../../context/LanguageContext';
import { useITRStore } from '../../store/itrStore';
import type { ITRItem } from '../../store/itrStore';
import { useContractorsStore } from '../../store/contractorsStore';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { ITRDetailModal, ITRDetailData } from './ITRModals';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './ITR.module.css';

const ITR: React.FC = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { itrList, loading, error, refetch, addITR, updateITR, deleteITR } = useITRStore();
    const { getActiveContractors } = useContractorsStore();

    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 500);

    // Trigger server-side refetch when debounced search changes
    React.useEffect(() => {
        refetch({ search: debouncedSearch });
    }, [debouncedSearch, refetch]);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentItrId, setCurrentItrId] = useState<string | null>(null);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null }>({
        isOpen: false,
        id: null,
    });

    // Data is now primarily filtered by backend.
    const filteredList = useMemo(() => {
        return itrList;
    }, [itrList]);

    const statistics = useMemo(() => {
        const total = itrList.length;
        const approved = itrList.filter(item => (item.status || '').toLowerCase() === 'approved').length;
        const reject = itrList.filter(item => (item.status || '').toLowerCase() === 'reject').length;
        const inProgress = itrList.filter(item => (item.status || '').toLowerCase() === 'in progress').length;
        return {
            total,
            approved,
            reject,
            inProgress,
            approvedRate: total > 0 ? Math.round((approved / total) * 100) : 0
        };
    }, [itrList]);

    const handleAddNew = () => {
        setCurrentItrId(null);
        setIsEditModalOpen(true);
    };

    const handleEdit = (id: string) => {
        setCurrentItrId(id);
        setIsEditModalOpen(true);
    };

    const handleDeleteClick = (id: string) => {
        setDeleteModal({ isOpen: true, id });
    };

    const handleDelete = async () => {
        if (deleteModal.id) {
            await deleteITR(deleteModal.id);
            setDeleteModal({ isOpen: false, id: null });
        }
    };

    const handleSaveITRDetails = async (details: ITRDetailData) => {
        console.log("handleSaveITRDetails incoming", details.linkedChecklists);
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
            if (currentItrId) {
                await updateITR(currentItrId, itemData);
            } else {
                await addITR(itemData);
            }
            setIsEditModalOpen(false);
            setCurrentItrId(null);
        } catch (error: any) {
            const detail = error?.response?.data?.detail || t('common.saveFailed') || 'Save failed';
            alert(detail);
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
                        <div className={styles.statItem}>
                            <div className={`${styles.statIcon} ${styles.blueIcon}`}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            <div className={styles.statContent}>
                                <div className={styles.statLabel}>{t('itr.status.inProgress')}</div>
                                <div className={styles.statValue}>{statistics.inProgress}</div>
                            </div>
                        </div>
                        <div className={styles.statItem}>
                            <div className={`${styles.statIcon} ${styles.greenIcon}`}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            <div className={styles.statContent}>
                                <div className={styles.statLabel}>{t('itr.status.approved')}</div>
                                <div className={styles.statValue}>{statistics.approved}</div>
                            </div>
                        </div>
                        <div className={styles.statItem}>
                            <div className={`${styles.statIcon} ${styles.pinkIcon}`}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                            </div>
                            <div className={styles.statContent}>
                                <div className={styles.statLabel}>{t('itr.status.reject')}</div>
                                <div className={styles.statValue}>{statistics.reject}</div>
                            </div>
                        </div>
                        <div className={styles.statItem}>
                            <div className={`${styles.statIcon} ${styles.grayIcon}`}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M18 17V9M12 17V5M6 17v-3" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            <div className={styles.statContent}>
                                <div className={styles.statLabel}>{t('obs.statTotal')}</div>
                                <div className={styles.statValue}>{statistics.total}</div>
                            </div>
                        </div>
                    </div>
                </div>
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
                        columns={createColumns(handleEdit, handleDeleteClick, navigate, t)}
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
                message={t('common.confirmDeleteMsg')}
                onConfirm={handleDelete}
                onCancel={() => setDeleteModal({ isOpen: false, id: null })}
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
