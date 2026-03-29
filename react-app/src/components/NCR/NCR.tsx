import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '../../context/LanguageContext';

import { useNCRStore } from '../../store/ncrStore';
import type { NCRItem } from '../../store/ncrStore';
import { useITRStore } from '../../store/itrStore';
import { checkNCRReferences, generateDeleteMessage } from '../../utils/cascadeDelete';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './NCR.module.css';
import { NCRDetailModal, NCRDetailsViewModal, NCRDetailData, PendingUploads } from './NCRModals';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { BackButton } from '@/components/ui/BackButton';
import { useDebounce } from '../../hooks/useDebounce';
import { uploadFiles, deleteFile } from '../../services/api';
import { useNCRStats } from '../../hooks/useNCRStats';
import { StatItem } from '../Shared/StatItem';
import statStyles from '../Shared/StatItem.module.css';

const NCR: React.FC = () => {
  const { t } = useLanguage();

  const { ncrList, loading, error, refetch, addNCR, updateNCR, deleteNCR } = useNCRStore();
  const itrList = useITRStore(state => state.itrList);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 500);

  // Trigger server-side refetch when debounced search changes
  React.useEffect(() => {
    refetch({ search: debouncedSearch });
  }, [debouncedSearch, refetch]);

  // Data is now primarily filtered by backend.
  const filteredList = useMemo(() => {
    return ncrList;
  }, [ncrList]);

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [currentNcrId, setCurrentNcrId] = useState<string | null>(null);
  const [viewingNcrId, setViewingNcrId] = useState<string | null>(null);
  const [ncrDetails, setNcrDetails] = useState<{ [key: string]: NCRDetailData }>({});

  // Delete Confirmation State
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
    isOpen: false,
    id: null,
    message: '',
  });

  const statistics = useNCRStats(ncrList);



  const handleEdit = React.useCallback((id: string) => {
    setCurrentNcrId(id);
    setIsEditModalOpen(true);
  }, []);

  const handleAddNew = () => {
    const newId = String(Date.now());
    setCurrentNcrId(newId);
    setIsEditModalOpen(true);
  };

  const handleSaveNCRDetails = async (details: NCRDetailData, pendingUploads: PendingUploads[], deletedFileIds: string[]) => {
    if (currentNcrId) {
      setNcrDetails(prev => ({ ...prev, [currentNcrId]: details }));
      const existingItem = ncrList.find(item => item.id === currentNcrId);

      // documentNumber 由後端自動產生，新建時不送；更新時也不覆蓋
      const updatedItem: Record<string, unknown> = {
        vendor: details.contractor || '',
        description: details.subject || details.detailsDescription || '',
        rev: '',
        submit: 'v',
        status: details.status || 'Open',
        remark: details.remark || '',
        hasDetails: true,
        raiseDate: details.raiseDate,
        closeoutDate: details.closeoutDate,
        aconex: details.aconex,
        type: details.type,
        subject: details.subject,
        foundBy: details.foundBy,
        raisedBy: details.raisedBy,
        foundLocation: details.foundLocation,
        productDisposition: details.productDisposition,
        productIntegrityRelated: details.productIntegrityRelated,
        permanentProductDeviation: details.permanentProductDeviation,
        impactToOM: details.impactToOM,
        noiNumber: details.noiNumber,  // 連結到觸發此 NCR 的 NOI
        defectPhotos: details.defectPhotos,
        improvementPhotos: details.improvementPhotos,
        attachments: details.attachments,
        referenceStandards: details.referenceStandards,
        serialNumbers: details.serialNumbers,
        repairMethodStatement: details.repairMethodStatement,
        immediateCorrectionAction: details.immediateCorrectionAction,
        rootCauseAnalysis: details.rootCauseAnalysis,
        correctiveActions: details.correctiveActions,
        preventiveAction: details.preventiveAction,
        finalProductIntegrityStatement: details.finalProductIntegrityStatement,
        reInspectionNumber: details.reInspectionNumber,
        projectQualityManager: details.projectQualityManager,
      };

      try {
        let targetId = currentNcrId;
        if (existingItem) {
          await updateNCR(currentNcrId, updatedItem);
        } else {
          const newNCR = await addNCR(updatedItem as Omit<NCRItem, 'id'>);
          targetId = newNCR.id;
          setNcrDetails(prev => {
            const newDetails = { ...prev };
            newDetails[newNCR.id] = details;
            return newDetails;
          });
        }

        // Process file API operations
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
                        const moduleStr = 'ncr';
                        await uploadFiles(moduleStr, targetId, uploadGroup.files, uploadGroup.category);
                    } catch (error) {
                        console.error(`Error uploading files for category ${uploadGroup.category}:`, error);
                        toast.error(`Failed to upload some files for ${uploadGroup.category}.`);
                    }
                }
            }
        }

        await refetch();

        setIsEditModalOpen(false);
        setCurrentNcrId(null);
      } catch (error: any) {
        const detail = error?.response?.data?.detail || t('common.saveFailed') || 'Save failed';
        toast.error(detail);
      }
    }
  };

  const confirmDelete = React.useCallback((id: string) => {
    const ncr = ncrList.find(item => item.id === id);
    if (!ncr) return;

    const references = checkNCRReferences(id, ncr.documentNumber, itrList);
    const message = generateDeleteMessage('NCR', ncr.documentNumber, references.references, t);

    setDeleteModal({
      isOpen: true,
      id,
      message,
    });
  }, [ncrList, itrList, t]);

  const handleDelete = async () => {
    if (deleteModal.id) {
      await deleteNCR(deleteModal.id);
      setDeleteModal({ isOpen: false, id: null, message: '' });
    }
  };

  // Columns memoization
  const columns = useMemo(() => createColumns(handleEdit, confirmDelete, t), [t, handleEdit, confirmDelete]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BackButton />
          <h1>{t('ncr.title') || t('home.ncr.description') || 'NCR'}</h1>
        </div>
        <div className={styles.headerRight}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('ncr.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

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
              title={t('ncr.title')}
              actions={
                <button
                  className={styles.addNewButton}
                  onClick={handleAddNew}
                >
                  {t('ncr.addNew')}
                </button>
              }
              columns={columns}
              data={filteredList}
              searchKey=""
              searchPlaceholder={t('ncr.searchPlaceholder')}
              getRowClassName={(row) =>
                (row.status || '').toLowerCase() === 'closed'
                  ? 'bg-emerald-100/50 text-gray-500 hover:bg-emerald-200/50'
                  : ''
              }
              onRowClick={(row) => handleEdit(row.id)}
            />
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={t('common.confirmDeleteTitle')}
        message={deleteModal.message || t('ncr.confirmDelete')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal({ isOpen: false, id: null, message: '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />

      {isEditModalOpen && currentNcrId && (
        <NCRDetailModal
          ncrId={currentNcrId}
          existingData={ncrDetails[currentNcrId]}
          existingItem={ncrList.find(item => item.id === currentNcrId)}
          ncrList={ncrList}
          onSave={handleSaveNCRDetails}
          onClose={() => {
            setIsEditModalOpen(false);
            setCurrentNcrId(null);
          }}
        />
      )}

      {isDetailsModalOpen && viewingNcrId && (
        <NCRDetailsViewModal
          ncrId={viewingNcrId}
          ncrItem={ncrList.find(item => item.id === viewingNcrId)}
          ncrDetailData={ncrDetails[viewingNcrId]}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setViewingNcrId(null);
          }}
        />
      )}
    </div>
  );
};

export default NCR;
