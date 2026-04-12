import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useContractorsStore } from '../../store/contractorsStore';
import { usePQPStore } from '../../store/pqpStore';
import type { PQPItem } from '../../store/pqpStore';
import { useLanguage } from '../../context/LanguageContext';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './PQP.module.css';
import { usePQPStats } from '../../hooks/usePQPStats';
import { StatItem } from '../Shared/StatItem';
import statStyles from '../Shared/StatItem.module.css';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { PQPDetailModal } from './PQPModals';
import { BackButton } from '@/components/ui/BackButton';
import { useDebounce } from '../../hooks/useDebounce';
import { uploadFiles, deleteFile } from '../../services/api';
import { getErrorMessage } from '../../utils/errorUtils';

const PQP: React.FC = () => {
  const { t } = useLanguage();
  const { getActiveContractors } = useContractorsStore();
  const { pqpList, loading, error, refetch, addPQP, updatePQP, publishPQP, deletePQP } = usePQPStore();

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 500);

  // Trigger server-side refetch when debounced search changes
  React.useEffect(() => {
    refetch({ search: debouncedSearch });
  }, [debouncedSearch, refetch]);

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentPqpId, setCurrentPqpId] = useState<string | null>(null);

  // Delete Confirmation State
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null }>({
    isOpen: false,
    id: null,
  });

  // Data is now primarily filtered by backend.
  const filteredList = useMemo(() => {
    return pqpList;
  }, [pqpList]);

  const statistics = usePQPStats(pqpList);

  const handleEdit = React.useCallback((id: string) => {
    setCurrentPqpId(id);
    setIsEditModalOpen(true);
  }, []);

  const confirmDelete = React.useCallback((id: string) => {
    setDeleteModal({ isOpen: true, id });
  }, []);

  // Columns memoization
  const columns = useMemo(() => createColumns(handleEdit, confirmDelete, t, getActiveContractors), [t, getActiveContractors, handleEdit, confirmDelete]);


  const handleAddNew = () => {
    setCurrentPqpId('new');
    setIsEditModalOpen(true);
  };

  const handleSavePQPDetails = async (updates: Partial<PQPItem>, pendingFiles: File[], deletedFileIds: string[]) => {
    const existingItem = currentPqpId && currentPqpId !== 'new' ? pqpList.find(item => item.id === currentPqpId) : undefined;
    const today = new Date().toISOString().split('T')[0];
    try {
      let targetId = '';
      if (existingItem) {
        const merged = { ...existingItem, ...updates, updatedAt: today };
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, pqpNo, ...payload } = merged;
        await updatePQP(existingItem.id, payload);
        targetId = existingItem.id;
      } else {
        const createdPqp = await addPQP({
          title: updates.title || '',
          description: updates.description || '',
          vendor: updates.vendor || '',
          status: updates.status || 'Not Submit',
          version: updates.version || 'Rev1.0',
          createdAt: today,
          updatedAt: today,
          attachments: updates.attachments || [],
        } as Omit<PQPItem, 'id'>);
        targetId = createdPqp.id;
      }

      // 處理實體檔案上傳與刪除
      const fileErrors: string[] = [];
      if (deletedFileIds.length > 0) {
        const deleteResults = await Promise.allSettled(
          [...new Set(deletedFileIds)].map((fileId) => deleteFile(fileId))
        );
        deleteResults.forEach((result) => {
          if (result.status === 'rejected') {
            const detail = (result.reason as any)?.response?.data?.detail || (result.reason as Error)?.message;
            fileErrors.push(detail || 'Failed to delete one or more attachments');
          }
        });
      }
      if (pendingFiles.length > 0 && targetId) {
        try {
          await uploadFiles('pqp', targetId, pendingFiles);
        } catch (err: any) {
          const detail = err?.response?.data?.detail || err?.message;
          fileErrors.push(detail || 'Failed to upload one or more attachments');
        }
      }

      if (fileErrors.length > 0) {
        throw new Error(fileErrors[0]);
      }

      setIsEditModalOpen(false);
      setCurrentPqpId(null);
    } catch (error: any) {
      const detail = getErrorMessage(error, t('common.saveFailed'));
      toast.error(detail);
    }
  };


  const handleDelete = async () => {
    if (!deleteModal.id) return;
    try {
      await deletePQP(deleteModal.id);
      setDeleteModal({ isOpen: false, id: null });
    } catch (err) {
      console.error('Delete PQP failed:', err);
      toast.error((err as Error)?.message || t('common.deleteFailed'));
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BackButton />
          <h1>{t('pqp.title') || t('pqp.titleShort')}</h1>
        </div>
        <div className={styles.headerRight}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('pqp.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.summarySection}>
        <h2 className={styles.summaryTitle}>{t('pqp.statusStats')}</h2>
        <div className={styles.statsContainer}>
          <div className={styles.statusStatsGrid}>
            <StatItem
              label={t('pqp.status.approved') || 'Approved'}
              value={statistics.approved}
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              iconColorClass={statStyles.blueIcon}
            />
            <StatItem
              label={t('pqp.status.reject') || 'Reject'}
              value={statistics.reject}
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              iconColorClass={statStyles.redIcon}
              style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
            />
            <StatItem
              label={t('pqp.total') || 'Total'}
              value={statistics.total}
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" /><path d="M18 17V9M12 17V5M6 17v-3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              iconColorClass={statStyles.grayIcon}
            />
            <StatItem
              label={t('pqp.approvedRate') || 'Approved Rate'}
              value={`${statistics.approved} (${statistics.activeRate}%)`}
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
          <DataTable
            title={t('pqp.title')}
            actions={
              <button
                type="button"
                className={styles.addNewButton}
                onClick={handleAddNew}
              >
                {t('pqp.addNew')}
              </button>
            }
            columns={columns}
            data={filteredList}
            searchKey=""
            searchPlaceholder={t('pqp.searchPlaceholder')}
            getRowClassName={(row) =>
              ['reject', 'revise & resubmit'].includes((row.status || 'Not Submit').toLowerCase())
                ? 'bg-red-100/50 text-red-700 hover:bg-red-200/50'
                : ''
            }
            onRowClick={(row) => handleEdit(row.id)}
          />
        )}
      </div>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={t('common.confirmDelete')}
        message={t('pqp.confirmDeleteMessage') || t('common.confirmDelete')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal({ isOpen: false, id: null })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />

      {
        isEditModalOpen && currentPqpId && (
          <PQPDetailModal
            pqpId={currentPqpId}
            existingItem={currentPqpId !== 'new' ? pqpList.find(item => item.id === currentPqpId) : undefined}
            onSave={handleSavePQPDetails}
            onPublish={async (id, changeSummary) => {
              await publishPQP(id, changeSummary);
              setIsEditModalOpen(false);
              setCurrentPqpId(null);
            }}
            onClose={() => {
              setIsEditModalOpen(false);
              setCurrentPqpId(null);
            }}
          />
        )
      }

    </div >
  );
};

export default PQP;
