import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useNOIStore } from '../../store/noiStore';
import { useNCRStore } from '../../store/ncrStore';
import type { NCRItem } from '../../store/ncrStore';
import { useITRStore } from '../../store/itrStore';
import { checkNCRReferences, generateDeleteMessage } from '../../utils/cascadeDelete';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './NCR.module.css';
import { NCRDetailModal, NCRDetailsViewModal, NCRDetailData } from './NCRModals';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { BackButton } from '@/components/ui/BackButton';
import { useDebounce } from '../../hooks/useDebounce';

const NCR: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { getActiveContractors } = useContractorsStore();
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

  const statistics = useMemo(() => {
    const statusCounts = {
      opening: 0,
      closed: 0,
    };

    ncrList.forEach((item) => {
      const status = (item.status || '').toLowerCase();
      if (status === 'open' || status === 'opening') {
        statusCounts.opening++;
      } else if (status === 'closed') {
        statusCounts.closed++;
      }
    });

    const total = ncrList.length;
    const openRate = total > 0 ? Math.round((statusCounts.opening / total) * 100) : 0;

    return {
      ...statusCounts,
      total,
      openRate,
    };
  }, [ncrList]);

  const handleAdd = (id: string) => {
    navigate(`/ncr/${id}`);
  };

  const handleEdit = (id: string) => {
    setCurrentNcrId(id);
    setIsEditModalOpen(true);
  };

  const handleAddNew = () => {
    const newId = String(Date.now());
    setCurrentNcrId(newId);
    setIsEditModalOpen(true);
  };

  const handleSaveNCRDetails = async (details: NCRDetailData) => {
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
      };

      try {
        if (existingItem) {
          await updateNCR(currentNcrId, updatedItem);
        } else {
          const newNCR = await addNCR(updatedItem as Omit<NCRItem, 'id'>);
          setNcrDetails(prev => {
            const newDetails = { ...prev };
            newDetails[newNCR.id] = details;
            return newDetails;
          });
        }
        setIsEditModalOpen(false);
        setCurrentNcrId(null);
      } catch (error: any) {
        const detail = error?.response?.data?.detail || t('common.saveFailed') || 'Save failed';
        alert(detail);
      }
    }
  };

  const confirmDelete = (id: string) => {
    const ncr = ncrList.find(item => item.id === id);
    if (!ncr) return;

    const references = checkNCRReferences(id, ncr.documentNumber, itrList);
    const message = generateDeleteMessage('NCR', ncr.documentNumber, references.references, t);

    setDeleteModal({
      isOpen: true,
      id,
      message,
    });
  };

  const handleDelete = async () => {
    if (deleteModal.id) {
      await deleteNCR(deleteModal.id);
      setDeleteModal({ isOpen: false, id: null, message: '' });
    }
  };

  // Columns memoization
  const columns = useMemo(() => createColumns(handleEdit, confirmDelete, t), [t]);

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
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.blueIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('obs.statOpen')}</div>
                <div className={styles.statValue}>{statistics.opening}</div>
              </div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.greenIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('obs.statClosed')}</div>
                <div className={styles.statValue}>{statistics.closed}</div>
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
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.blueIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('obs.statOpenRate')}</div>
                <div className={styles.statValue}>{statistics.opening} ({statistics.openRate}%)</div>
              </div>
            </div>
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
