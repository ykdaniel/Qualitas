import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useITPStore } from '../../store/itpStore';
import type { ITPItem } from '../../store/itpStore';
import { useNOIStore } from '../../store/noiStore';
import { useChecklistStore } from '../../store/checklistStore';
import { checkITPReferences, checkITPChecklistReferences, generateDeleteMessage } from '../../utils/cascadeDelete';
import { uploadFiles, deleteFile } from '../../services/api';
import { getErrorMessage } from '../../utils/errorUtils';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './ITP.module.css';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { ITPDetailModal } from './ITPModals';
import { BackButton } from '@/components/ui/BackButton';
import { useDebounce } from '../../hooks/useDebounce';
import { useITPStats } from '../../hooks/useITPStats';
import { StatItem } from '../Shared/StatItem';
import statStyles from '../Shared/StatItem.module.css';

const ITP: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { getActiveContractors } = useContractorsStore();
  const { itpList, loading, error, refetch, addITP, updateITP, updateITPDetail, deleteITP } = useITPStore();
  const noiList = useNOIStore(state => state.noiList);
  const checklistList = useChecklistStore(state => state.records);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const debouncedSearch = useDebounce(searchQuery, 500);

  // Trigger server-side refetch when debounced search changes
  React.useEffect(() => {
    refetch({ search: debouncedSearch });
  }, [debouncedSearch, refetch]);


  // Data is now primarily filtered by backend.
  const processedData = useMemo(() => {
    return itpList;
  }, [itpList]);

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentItpId, setCurrentItpId] = useState<string | null>(null);

  // Delete Confirmation State
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
    isOpen: false,
    id: null,
    message: '',
  });

  const statistics = useITPStats(itpList);

  const handleEdit = React.useCallback((id: string) => {
    setCurrentItpId(id);
    setIsEditModalOpen(true);
  }, []);

  const handleAddNew = async () => {
    const activeContractors = getActiveContractors();
    const defaultVendor = activeContractors.length > 0 ? activeContractors[0].name : 'N/A';
    try {
      const newItem = await addITP({
        vendor: defaultVendor,
        description: '',
        rev: '',
        submit: '',
        status: 'Pending',
        remark: '',
        submissionDate: new Date().toISOString().split('T')[0],
      } as Omit<ITPItem, 'id'>);
      setCurrentItpId(newItem.id);
      setIsEditModalOpen(true);
    } catch (err: any) {
      if (err?.response?.status === 401) return;
      const msg = getErrorMessage(err, t('itp.addError'));
      alert(t('itp.addError') + '：' + msg);
    }
  };

  const confirmDelete = React.useCallback((id: string) => {
    const itp = itpList.find(item => item.id === id);
    if (!itp) return;

    // Check for references in NOI and Checklist
    const noiReferences = checkITPReferences(id, noiList);
    const checklistReferences = checkITPChecklistReferences(id, checklistList);

    // Combine all references
    const allReferences = [
      ...noiReferences.references,
      ...checklistReferences.references
    ];

    const message = generateDeleteMessage('ITP', itp.referenceNo || itp.id, allReferences, t);

    setDeleteModal({
      isOpen: true,
      id,
      message,
    });
  }, [itpList, noiList, checklistList, t]);

  const handleDelete = async () => {
    if (deleteModal.id) {
      try {
        await deleteITP(deleteModal.id);
        setDeleteModal({ isOpen: false, id: null, message: '' });
      } catch (error: any) {
        if (error?.response?.status === 401) return;
        alert(t('itp.deleteError'));
      }
    }
  };

  // Memoize columns to prevent DataTable from unnecessarily re-rendering
  const columns = useMemo(() => createColumns(
    handleEdit,
    confirmDelete,
    navigate,
    t,
    getActiveContractors(),
    noiList
  ), [t, getActiveContractors, noiList, navigate, handleEdit, confirmDelete]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BackButton />
          <h1>{t('itp.title')}</h1>
        </div>
        <div className={styles.headerRight}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('itp.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.summarySection}>
        <h2 className={styles.summaryTitle}>{t('itp.statsTitle')}</h2>
        <div className={styles.statsContainer}>
          <div className={styles.statusStatsGrid}>
            <StatItem 
              label={t('itp.status.approved')} 
              value={statistics.approved} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.greenIcon} 
            />
            <StatItem 
              label={t('itp.status.approvedWithComments')} 
              value={statistics.approvedWithComments} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /><path d="M16 17h6" strokeLinecap="round" /></svg>} 
              iconColorClass={statStyles.greenIcon} 
            />
            <StatItem 
              label={t('itp.status.pending')} 
              value={statistics.pending} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.yellowIcon} 
            />
            <StatItem 
              label={t('itp.status.noSubmit')} 
              value={statistics.noSubmit} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.yellowIcon} 
            />
            <StatItem 
              label={t('itp.status.reviseResubmit')} 
              value={statistics.reviseResubmit} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" strokeLinecap="round" strokeLinejoin="round" /><path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.pinkIcon} 
            />
            <StatItem 
              label={t('itp.status.rejected')} 
              value={statistics.rejected} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.pinkIcon} 
            />
            <StatItem 
              label={t('itp.status.void')} 
              value={statistics.void} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 9v4M12 17h.01" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.orangeIcon} 
            />
          </div>
          <div className={styles.summaryStatsGrid}>
            <StatItem 
              label={t('pqp.total')} 
              value={statistics.total} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" /><path d="M18 17V9M12 17V5M6 17v-3" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.grayIcon} 
            />
            <StatItem 
              label={t('itp.stats.submission')} 
              value={statistics.submission} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" /><polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" /><line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.grayIcon} 
            />
            <StatItem 
              label={t('itp.stats.submissionMaturity')} 
              value={`${statistics.submissionMaturity}%`} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.blueIcon} 
            />
            <StatItem 
              label={t('itp.stats.approvalMaturity')} 
              value={`${statistics.approvalMaturity}%`} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.blueIcon} 
            />
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {loading && <p className={styles.loadingMessage}>{t('common.loading')}</p>}
        {error && (
          <div className={styles.loadingError}>
            <p>{error}</p>
            <button type="button" className={styles.retryButton} onClick={() => refetch()}>{t('common.retry')}</button>
          </div>
        )}
        {!loading && !error && (
          <>
            <DataTable
              title={t('itp.title')}
              actions={
                <div className="flex items-center gap-2">
                  <button
                    className={styles.addNewButton}
                    onClick={handleAddNew}
                  >
                    {t('itp.addNew')}
                  </button>
                </div>
              }
              columns={columns}
              data={processedData}
              searchKey=""
              getRowClassName={(row) =>
                row.status.toLowerCase() === 'void' ? styles.voidRow : ''
              }
              getRowId={(row) => row.id}
              onRowClick={(row) => handleEdit(row.id)}
            />
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={t('common.confirmDeleteTitle')}
        message={deleteModal.message || t('itp.confirmDelete')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal({ isOpen: false, id: null, message: '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />

      {isEditModalOpen && currentItpId && (
        <ITPDetailModal
          itpId={currentItpId}
          existingItem={itpList.find(item => item.id === currentItpId)}
          onSave={async (updates, details, pendingUploads, deletedFileIds) => {
            try {
              await updateITP(currentItpId, updates);
              if (details) {
                await updateITPDetail(currentItpId, details);
              }

              if (deletedFileIds && deletedFileIds.length > 0) {
                 await Promise.all(deletedFileIds.map(id => deleteFile(id).catch(e => console.error("Del Err", e))));
              }
              if (pendingUploads && pendingUploads.length > 0 && currentItpId) {
                 await uploadFiles('itp', currentItpId, pendingUploads, 'attachment');
              }

              setIsEditModalOpen(false);
              setCurrentItpId(null);
              refetch();
            } catch (error: any) {
              if (error?.response?.status === 401) return;
              const detail = error?.response?.data?.detail || t('itp.updateError');
              alert(detail);
            }
          }}
          onClose={() => {
            setIsEditModalOpen(false);
            setCurrentItpId(null);
          }}
        />
      )}


    </div>
  );
};

export default ITP;
