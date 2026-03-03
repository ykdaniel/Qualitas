import React, { useState, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useOBSStore } from '../../store/obsStore';
import type { OBSItem as ContextOBSItem } from '../../store/obsStore';
import styles from './OBS.module.css';
import ConfirmModal from '../Shared/ConfirmModal';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { BackButton } from '@/components/ui/BackButton';
import { OBSDetailModal, OBSDetailsViewModal, OBSDetailData, PendingUploads } from './OBSModals';
import { useDebounce } from '../../hooks/useDebounce';
import { uploadFiles, deleteFile } from '../../services/api';
import { useOBSStats } from '../../hooks/useOBSStats';
import { StatItem } from '../Shared/StatItem';
import statStyles from '../Shared/StatItem.module.css';

const OBS: React.FC = () => {
  const { t } = useLanguage();
  const { getActiveContractors } = useContractorsStore();
  const { obsList, loading, error, refetch, addOBS, updateOBS, deleteOBS } = useOBSStore();


  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 500);

  // Trigger server-side refetch when debounced search changes
  React.useEffect(() => {
    refetch({ search: debouncedSearch });
  }, [debouncedSearch, refetch]);

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [currentObsId, setCurrentObsId] = useState<string | null>(null);
  const [viewingObsId, setViewingObsId] = useState<string | null>(null);

  // Delete Confirmation State
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
    isOpen: false,
    id: null,
    message: '',
  });

  // Data is now primarily filtered by backend.
  const filteredList = useMemo(() => {
    return obsList;
  }, [obsList]);

  const statistics = useOBSStats(obsList);





  const handleEdit = React.useCallback((id: string) => {
    setCurrentObsId(id);
    setIsEditModalOpen(true);
  }, []);

  const handleAddNew = () => {
    setCurrentObsId('new');
    setIsEditModalOpen(true);
  };

  const handleSaveOBSDetails = async (details: OBSDetailData, pendingUploads: PendingUploads[], deletedFileIds: string[]) => {
    if (!currentObsId) return;
    const isNew = currentObsId === 'new';
    // documentNumber 由後端自動產生，新建時不送
    const payload: Record<string, unknown> = {
      vendor: details.contractor || '',
      description: details.detailsDescription || details.subject || '',
      rev: '',
      submit: 'v',
      status: details.status || 'Open',
      remark: details.remark || '',
      hasDetails: true,
      raiseDate: details.raiseDate || undefined,
      closeoutDate: details.closeoutDate || undefined,
      aconex: details.aconex || undefined,
      type: details.type || undefined,
      subject: details.subject || undefined,
      foundBy: details.foundBy || undefined,
      raisedBy: details.raisedBy || undefined,
      foundLocation: details.foundLocation || undefined,
      productDisposition: details.productDisposition || undefined,
      defectPhotos: details.defectPhotos,
      improvementPhotos: details.improvementPhotos,
      attachments: details.attachments,
    };
    try {
      let targetId = '';
      if (isNew) {
        const createdObs = await addOBS(payload as Omit<ContextOBSItem, 'id'>);
        targetId = createdObs.id;
      } else {
        await updateOBS(currentObsId, payload);
        targetId = currentObsId;
      }

      if (deletedFileIds.length > 0) {
        await Promise.all(deletedFileIds.map(fileId => deleteFile(fileId).catch(e => console.error("Failed to delete", e))));
      }

      if (targetId) {
        for (const { category, files } of pendingUploads) {
          if (files.length > 0) {
            await uploadFiles('obs', targetId, files, category).catch(e => console.error(`Failed to upload ${category}`, e));
          }
        }
      }

      setIsEditModalOpen(false);
      setCurrentObsId(null);
    } catch (error: any) {
      const detail = error?.response?.data?.detail || t('common.saveFailed') || 'Save failed';
      alert(detail);
    }
  };

  const confirmDelete = React.useCallback((id: string) => {
    setDeleteModal({
      isOpen: true,
      id,
      message: t('common.deleteConfirmMessage', { item: 'OBS' }),
    });
  }, [t]);

  // Columns memoization
  const columns = useMemo(() => createColumns(handleEdit, confirmDelete, t, getActiveContractors), [t, getActiveContractors, handleEdit, confirmDelete]);

  const handleDelete = async () => {
    if (deleteModal.id) {
      try {
        await deleteOBS(deleteModal.id);
      } catch (err) {
        console.error('Failed to delete OBS:', err);
      }
      setDeleteModal({ isOpen: false, id: null, message: '' });
    }
  };


  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BackButton />
          <h1>{t('home.obs.description') || 'OBS'}</h1>
        </div>
        <div className={styles.headerRight}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('obs.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '12px 16px', borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {loading && (
        <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>{t('common.loading') || 'Loading OBS list...'}</div>
      )}

      <div className={styles.summarySection}>
        <h2 className={styles.summaryTitle}>{t('obs.statsTitle')}</h2>
        <div className={styles.statsContainer}>
          <div className={styles.statusStatsGrid}>
            <StatItem 
              label={t('obs.statOpen')} 
              value={statistics.opening} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.blueIcon} 
            />
            <StatItem 
              label={t('obs.statClosed')} 
              value={statistics.closed} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.greenIcon} 
            />
            <StatItem 
              label={t('obs.statTotal')} 
              value={statistics.total} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" /><path d="M18 17V9M12 17V5M6 17v-3" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.grayIcon} 
            />
            <StatItem 
              label={t('obs.statOpenRate')} 
              value={`${statistics.opening} (${statistics.openRate}%)`} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.blueIcon} 
            />
          </div>
        </div>
      </div>

      <div className={styles.content}>
        <DataTable
          title={t('obs.listTitle')}
          actions={
            <button
              className={styles.addNewButton}
              onClick={handleAddNew}
            >
              {t('obs.addNew')}
            </button>
          }
          columns={columns}
          data={filteredList}
          searchKey=""
          searchPlaceholder={t('obs.searchPlaceholder')}
          getRowClassName={(row) =>
            (row.status || '').toLowerCase() === 'closed'
              ? 'bg-emerald-100/50 text-gray-500 hover:bg-emerald-200/50'
              : ''
          }
          onRowClick={(row) => handleEdit(row.id)}
        />
      </div>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={t('common.confirmDelete')}
        message={deleteModal.message}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal({ isOpen: false, id: null, message: '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />

      {isEditModalOpen && currentObsId && (
        <OBSDetailModal
          obsId={currentObsId}
          existingData={undefined}
          existingItem={currentObsId === 'new' ? undefined : obsList.find(item => item.id === currentObsId)}
          onSave={handleSaveOBSDetails}
          onClose={() => {
            setIsEditModalOpen(false);
            setCurrentObsId(null);
          }}
        />
      )}

      {isDetailsModalOpen && viewingObsId && (
        <OBSDetailsViewModal
          obsId={viewingObsId}
          obsItem={obsList.find(item => item.id === viewingObsId)}
          obsDetailData={undefined}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setViewingObsId(null);
          }}
        />
      )}
    </div>
  );
};

export default OBS;
