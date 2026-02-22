import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useContractors } from '../../context/ContractorsContext';
import { useITP, ITPItem } from '../../context/ITPContext';
import { useNOI } from '../../context/NOIContext';
import { checkITPReferences, generateDeleteMessage } from '../../utils/cascadeDelete';
import { getErrorMessage } from '../../utils/errorUtils';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './ITP.module.css';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { ITPDetailModal } from './ITPModals';
import { BackButton } from '@/components/ui/BackButton';
import { useDebounce } from '../../hooks/useDebounce';

const ITP: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { getActiveContractors } = useContractors();
  const { itpList, loading, error, refetch, addITP, updateITP, updateITPDetail, deleteITP } = useITP();
  const { noiList } = useNOI();

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

  const statistics = useMemo(() => {
    const statusCounts = {
      approved: 0,
      approvedWithComments: 0,
      reviseResubmit: 0,
      rejected: 0,
      pending: 0,
      noSubmit: 0,
      void: 0,
    };

    itpList.forEach((item) => {
      const status = item.status.toLowerCase();
      if (status === 'void') {
        statusCounts.void++;
      } else if (status === 'approved') {
        statusCounts.approved++;
      } else if (status === 'approved with comments') {
        statusCounts.approvedWithComments++;
      } else if (status === 'revise & resubmit' || status === 'revise and resubmit') {
        statusCounts.reviseResubmit++;
      } else if (status === 'rejected') {
        statusCounts.rejected++;
      } else if (status === 'pending') {
        statusCounts.pending++;
      } else if (status === 'no submit' || status === 'nosubmit') {
        statusCounts.noSubmit++;
      }
    });

    const total = itpList.filter(item => item.status.toLowerCase() !== 'void').length;
    const submission = itpList.filter(item => {
      const status = item.status.toLowerCase();
      return status !== 'void' && status !== 'no submit' && status !== 'nosubmit';
    }).length;
    const submissionMaturity = total > 0 ? Math.round((submission / total) * 100) : 0;
    const approvalMaturity = total > 0 ? Math.round(((statusCounts.approved + statusCounts.approvedWithComments) / total) * 100) : 0;

    return {
      ...statusCounts,
      total,
      submission,
      submissionMaturity,
      approvalMaturity,
    };
  }, [itpList]);

  const handleEdit = (id: string) => {
    setCurrentItpId(id);
    setIsEditModalOpen(true);
  };

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
    } catch (err: unknown) {
      const msg = getErrorMessage(err, t('itp.addError'));
      alert(t('itp.addError') + '：' + msg);
    }
  };

  const confirmDelete = (id: string) => {
    const itp = itpList.find(item => item.id === id);
    if (!itp) return;

    // Check for references
    const references = checkITPReferences(id, noiList);
    const message = generateDeleteMessage('ITP', itp.referenceNo || itp.id, references.references, t);

    setDeleteModal({
      isOpen: true,
      id,
      message,
    });
  };

  const handleDelete = async () => {
    if (deleteModal.id) {
      try {
        await deleteITP(deleteModal.id);
        setDeleteModal({ isOpen: false, id: null, message: '' });
      } catch (error) {
        alert(t('itp.deleteError'));
      }
    }
  };

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
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.greenIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('itp.status.approved')}</div>
                <div className={styles.statValue}>{statistics.approved}</div>
              </div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.greenIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M16 17h6" strokeLinecap="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('itp.status.approvedWithComments')}</div>
                <div className={styles.statValue}>{statistics.approvedWithComments}</div>
              </div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.yellowIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('itp.status.pending')}</div>
                <div className={styles.statValue}>{statistics.pending}</div>
              </div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.yellowIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('itp.status.noSubmit')}</div>
                <div className={styles.statValue}>{statistics.noSubmit}</div>
              </div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.pinkIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('itp.status.reviseResubmit')}</div>
                <div className={styles.statValue}>{statistics.reviseResubmit}</div>
              </div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.pinkIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m15 9-6 6M9 9l6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('itp.status.rejected')}</div>
                <div className={styles.statValue}>{statistics.rejected}</div>
              </div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.orangeIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 9v4M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('itp.status.void')}</div>
                <div className={styles.statValue}>{statistics.void}</div>
              </div>
            </div>
          </div>
          <div className={styles.summaryStatsGrid}>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.grayIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M18 17V9M12 17V5M6 17v-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('pqp.total')}</div>
                <div className={styles.statValue}>{statistics.total}</div>
              </div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.grayIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('itp.stats.submission')}</div>
                <div className={styles.statValue}>{statistics.submission}</div>
              </div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.blueIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('itp.stats.submissionMaturity')}</div>
                <div className={styles.statValue}>{statistics.submissionMaturity}%</div>
              </div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.blueIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('itp.stats.approvalMaturity')}</div>
                <div className={styles.statValue}>{statistics.approvalMaturity}%</div>
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
              columns={createColumns(handleEdit, confirmDelete, navigate, t, getActiveContractors(), noiList)}
              data={processedData}
              searchKey=""
              getRowClassName={(row) =>
                row.status.toLowerCase() === 'void' ? styles.voidRow : ''
              }
              getRowId={(row) => row.id}
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
          onSave={async (updates, details) => {
            try {
              await updateITP(currentItpId, updates);
              if (details) {
                await updateITPDetail(currentItpId, details);
              }
              setIsEditModalOpen(false);
              setCurrentItpId(null);
            } catch (error: any) {
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
