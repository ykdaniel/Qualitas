import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, BarChart3, TrendingUp, Search } from 'lucide-react';
import { useContractorsStore } from '../../store/contractorsStore';
import { usePQPStore } from '../../store/pqpStore';
import type { PQPItem } from '../../store/pqpStore';
import { useLanguage } from '../../context/LanguageContext';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './PQP.module.css';
import shellStyles from '../Shared/ModuleShell.module.css';
import { usePQPStats } from '../../hooks/usePQPStats';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { PQPDetailModal } from './PQPModals';
import { useDebounce } from '../../hooks/useDebounce';
import { uploadFiles, deleteFile } from '../../services/api';
import { getErrorMessage } from '../../utils/errorUtils';

type StatusFilter = 'all' | 'notSubmit' | 'underReview' | 'approved' | 'reject' | 'reviseResubmit';

const PQP: React.FC = () => {
  const { t } = useLanguage();
  const { getActiveContractors } = useContractorsStore();
  const { pqpList, loading, error, refetch, addPQP, updatePQP, publishPQP, deletePQP } = usePQPStore();

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 500);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  React.useEffect(() => {
    refetch({ search: debouncedSearch });
  }, [debouncedSearch, refetch]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentPqpId, setCurrentPqpId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null }>({
    isOpen: false,
    id: null,
  });

  const filteredList = useMemo(() => {
    if (statusFilter === 'all') return pqpList;
    const target = ({
      notSubmit: 'not submit',
      underReview: 'under review',
      approved: 'approved',
      reject: 'reject',
      reviseResubmit: 'revise & resubmit',
    } as const)[statusFilter];
    return pqpList.filter((item) => (item.status || 'Not Submit').toLowerCase() === target);
  }, [pqpList, statusFilter]);

  const statistics = usePQPStats(pqpList);

  const handleEdit = React.useCallback((id: string) => {
    setCurrentPqpId(id);
    setIsEditModalOpen(true);
  }, []);

  const confirmDelete = React.useCallback((id: string) => {
    setDeleteModal({ isOpen: true, id });
  }, []);

  const columns = useMemo(
    () => createColumns(handleEdit, confirmDelete, t, getActiveContractors),
    [t, getActiveContractors, handleEdit, confirmDelete],
  );

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

  const chips: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: t('common.all') || 'All', count: statistics.total },
    { id: 'notSubmit', label: t('pqp.status.notSubmit'), count: statistics.notSubmit },
    { id: 'underReview', label: t('pqp.status.underReview'), count: statistics.underReview },
    { id: 'approved', label: t('pqp.status.approved'), count: statistics.approved },
    { id: 'reject', label: t('pqp.status.reject'), count: statistics.reject },
    { id: 'reviseResubmit', label: t('pqp.status.reviseResubmit'), count: statistics.reviseResubmit },
  ];

  const summary = [
    {
      key: 'approved',
      label: t('pqp.status.approved'),
      value: statistics.approved,
      icon: <CheckCircle2 size={18} strokeWidth={1.8} />,
      accent: '#7a8f5a',
    },
    {
      key: 'reject',
      label: t('pqp.status.reject'),
      value: statistics.reject,
      icon: <XCircle size={18} strokeWidth={1.8} />,
      accent: '#c8753f',
    },
    {
      key: 'total',
      label: t('pqp.total'),
      value: statistics.total,
      icon: <BarChart3 size={18} strokeWidth={1.8} />,
      accent: '#8a6a3a',
    },
    {
      key: 'rate',
      label: t('pqp.approvedRate'),
      value: `${statistics.activeRate}%`,
      icon: <TrendingUp size={18} strokeWidth={1.8} />,
      accent: '#b8945a',
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
              placeholder={t('pqp.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button type="button" className={shellStyles.addNewButton} onClick={handleAddNew}>
            {t('pqp.addNew')}
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
            const s = (row.status || 'Not Submit').toLowerCase();
            if (s === 'reject' || s === 'revise & resubmit') return shellStyles.rowAlert;
            return '';
          }}
          onRowClick={(row) => handleEdit(row.id)}
        />
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

      {isEditModalOpen && currentPqpId && (
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
      )}
    </div>
  );
};

export default PQP;
