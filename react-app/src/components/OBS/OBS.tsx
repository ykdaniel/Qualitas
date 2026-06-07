import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Clock, CheckCircle2, BarChart3, Zap, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useOBSStore } from '../../store/obsStore';
import type { OBSItem as ContextOBSItem } from '../../store/obsStore';
import shellStyles from '../Shared/ModuleShell.module.css';
import ConfirmModal from '../Shared/ConfirmModal';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { OBSDetailModal, OBSDetailData, PendingUploads } from './OBSModals';
import { useDebounce } from '../../hooks/useDebounce';
import { uploadFiles, deleteFile } from '../../services/api';
import { useOBSStats } from '../../hooks/useOBSStats';
import { getErrorMessage } from '../../utils/errorUtils';

type StatusFilter = 'all' | 'open' | 'closed';

const OBS: React.FC = () => {
  const { t } = useLanguage();
  const { getActiveContractors } = useContractorsStore();
  const { obsList, loading, error, refetch, addOBS, updateOBS, deleteOBS } = useOBSStore();


  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 500);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Trigger server-side refetch when debounced search changes
  React.useEffect(() => {
    refetch({ search: debouncedSearch });
  }, [debouncedSearch, refetch]);

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentObsId, setCurrentObsId] = useState<string | null>(null);

  // Delete Confirmation State
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
    isOpen: false,
    id: null,
    message: '',
  });

  // Search hits the server via the debounced effect; the status chip is a
  // client-side slice over whatever the server returned.
  const filteredList = useMemo(() => {
    if (statusFilter === 'all') return obsList;
    return obsList.filter((item) => {
      const s = (item.status || '').toLowerCase();
      return statusFilter === 'closed' ? s === 'closed' : s !== 'closed';
    });
  }, [obsList, statusFilter]);

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
      dueDate: details.dueDate || undefined,
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

      const fileErrors: string[] = [];
      if (deletedFileIds.length > 0) {
        const deleteResults = await Promise.allSettled(
          [...new Set(deletedFileIds)].map((fileId) => deleteFile(fileId))
        );
        deleteResults.forEach((result) => {
          if (result.status === 'rejected') {
            const detail = (result.reason as any)?.response?.data?.detail || (result.reason as Error)?.message;
            fileErrors.push(detail || 'Failed to delete one or more files');
          }
        });
      }

      if (targetId) {
        for (const { category, files } of pendingUploads) {
          if (files.length > 0) {
            try {
              await uploadFiles('obs', targetId, files, category);
            } catch (err: any) {
              const detail = err?.response?.data?.detail || err?.message;
              fileErrors.push(detail || `Failed to upload ${category}`);
            }
          }
        }
      }

      if (fileErrors.length > 0) {
        throw new Error(fileErrors[0]);
      }

      setIsEditModalOpen(false);
      setCurrentObsId(null);
    } catch (error: any) {
      const detail = getErrorMessage(error, t('common.saveFailed'));
      toast.error(detail);
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
  const columns = useMemo(() => createColumns(confirmDelete, t, getActiveContractors), [t, getActiveContractors, confirmDelete]);

  const handleDelete = async () => {
    if (deleteModal.id) {
      try {
        await deleteOBS(deleteModal.id);
      } catch (err) {
        console.error('Failed to delete OBS:', err);
        toast.error((err as Error)?.message || t('common.deleteFailed'));
      }
      setDeleteModal({ isOpen: false, id: null, message: '' });
    }
  };


  const chips: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: t('common.all') || 'All', count: statistics.total },
    { id: 'open', label: t('obs.statOpen') || 'Open', count: statistics.opening },
    { id: 'closed', label: t('obs.statClosed') || 'Closed', count: statistics.closed },
  ];

  const summary = [
    {
      key: 'open',
      label: t('obs.statOpen'),
      value: statistics.opening,
      icon: <Clock size={18} strokeWidth={1.8} />,
      accent: '#c8753f',
    },
    {
      key: 'closed',
      label: t('obs.statClosed'),
      value: statistics.closed,
      icon: <CheckCircle2 size={18} strokeWidth={1.8} />,
      accent: '#7a8f5a',
    },
    {
      key: 'total',
      label: t('obs.statTotal'),
      value: statistics.total,
      icon: <BarChart3 size={18} strokeWidth={1.8} />,
      accent: '#8a6a3a',
    },
    {
      key: 'rate',
      label: t('obs.statOpenRate'),
      value: `${statistics.openRate}%`,
      icon: <Zap size={18} strokeWidth={1.8} />,
      accent: '#b8945a',
    },
  ];

  return (
    <div className={shellStyles.container}>
      {error && (
        <div className={shellStyles.errorBanner}>{error}</div>
      )}

      <section className={shellStyles.summaryGrid}>
        {summary.map((card) => (
          <div key={card.key} className={shellStyles.summaryCard} style={{ '--accent': card.accent } as React.CSSProperties}>
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
              placeholder={t('obs.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className={shellStyles.addNewButton} onClick={handleAddNew}>
            {t('obs.addNew')}
          </button>
        </div>
      </div>

      {loading && (
        <div className={shellStyles.loadingNote}>{t('common.loading') || 'Loading OBS list...'}</div>
      )}

      <div className={shellStyles.content}>
        <DataTable
          columns={columns}
          data={filteredList}
          searchKey=""
          getRowClassName={(row) =>
            (row.status || '').toLowerCase() === 'closed' ? shellStyles.rowDim : ''
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
          existingItem={currentObsId === 'new' ? undefined : obsList.find(item => item.id === currentObsId)}
          onSave={handleSaveOBSDetails}
          onClose={() => {
            setIsEditModalOpen(false);
            setCurrentObsId(null);
          }}
        />
      )}
    </div>
  );
};

export default OBS;
