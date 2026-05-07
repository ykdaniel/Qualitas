import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Send, TrendingUp, ShieldCheck, Search } from 'lucide-react';
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
import shellStyles from '../Shared/ModuleShell.module.css';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { ITPDetailModal } from './ITPModals';
import { useDebounce } from '../../hooks/useDebounce';
import { useITPStats } from '../../hooks/useITPStats';

type StatusFilter =
  | 'all'
  | 'approved'
  | 'approvedWithComments'
  | 'pending'
  | 'noSubmit'
  | 'reviseResubmit'
  | 'rejected'
  | 'void';

const ITP: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { getActiveContractors } = useContractorsStore();
  const { itpList, loading, error, refetch, addITP, updateITP, updateITPDetail, deleteITP } = useITPStore();
  const noiList = useNOIStore(state => state.noiList);
  const checklistList = useChecklistStore(state => state.records);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const debouncedSearch = useDebounce(searchQuery, 500);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  React.useEffect(() => {
    refetch({ search: debouncedSearch });
  }, [debouncedSearch, refetch]);

  const filteredList = useMemo(() => {
    if (statusFilter === 'all') return itpList;
    return itpList.filter((item) => {
      const s = (item.status || '').toLowerCase();
      switch (statusFilter) {
        case 'approved': return s === 'approved';
        case 'approvedWithComments': return s === 'approved with comments';
        case 'pending': return s === 'pending';
        case 'noSubmit': return s === 'no submit' || s === 'nosubmit';
        case 'reviseResubmit': return s === 'revise & resubmit' || s === 'revise and resubmit';
        case 'rejected': return s === 'rejected';
        case 'void': return s === 'void';
        default: return true;
      }
    });
  }, [itpList, statusFilter]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentItpId, setCurrentItpId] = useState<string | null>(null);
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
      toast.error(t('itp.addError') + '：' + msg);
    }
  };

  const confirmDelete = React.useCallback((id: string) => {
    const itp = itpList.find(item => item.id === id);
    if (!itp) return;

    const noiReferences = checkITPReferences(id, noiList);
    const checklistReferences = checkITPChecklistReferences(id, checklistList);
    const allReferences = [
      ...noiReferences.references,
      ...checklistReferences.references,
    ];
    const message = generateDeleteMessage('ITP', itp.referenceNo || itp.id, allReferences, t);

    setDeleteModal({ isOpen: true, id, message });
  }, [itpList, noiList, checklistList, t]);

  const handleDelete = async () => {
    if (deleteModal.id) {
      try {
        await deleteITP(deleteModal.id);
        setDeleteModal({ isOpen: false, id: null, message: '' });
      } catch (error: any) {
        if (error?.response?.status === 401) return;
        toast.error(t('itp.deleteError'));
      }
    }
  };

  const columns = useMemo(() => createColumns(
    confirmDelete,
    navigate,
    t,
    getActiveContractors(),
    noiList,
  ), [t, getActiveContractors, noiList, navigate, confirmDelete]);

  const chips: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: t('common.all') || 'All', count: itpList.length },
    { id: 'approved', label: t('itp.status.approved'), count: statistics.approved },
    { id: 'approvedWithComments', label: t('itp.status.approvedWithComments'), count: statistics.approvedWithComments },
    { id: 'pending', label: t('itp.status.pending'), count: statistics.pending },
    { id: 'noSubmit', label: t('itp.status.noSubmit'), count: statistics.noSubmit },
    { id: 'reviseResubmit', label: t('itp.status.reviseResubmit'), count: statistics.reviseResubmit },
    { id: 'rejected', label: t('itp.status.rejected'), count: statistics.rejected },
    { id: 'void', label: t('itp.status.void'), count: statistics.void },
  ];

  const summary = [
    {
      key: 'total',
      label: t('pqp.total') || 'Total',
      value: statistics.total,
      icon: <BarChart3 size={18} strokeWidth={1.8} />,
      accent: '#8a6a3a',
    },
    {
      key: 'submission',
      label: t('itp.stats.submission'),
      value: statistics.submission,
      icon: <Send size={18} strokeWidth={1.8} />,
      accent: '#7a8f5a',
    },
    {
      key: 'submissionMaturity',
      label: t('itp.stats.submissionMaturity'),
      value: `${statistics.submissionMaturity}%`,
      icon: <TrendingUp size={18} strokeWidth={1.8} />,
      accent: '#b8945a',
    },
    {
      key: 'approvalMaturity',
      label: t('itp.stats.approvalMaturity'),
      value: `${statistics.approvalMaturity}%`,
      icon: <ShieldCheck size={18} strokeWidth={1.8} />,
      accent: '#c8753f',
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
              placeholder={t('itp.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button type="button" className={shellStyles.addNewButton} onClick={handleAddNew}>
            {t('itp.addNew')}
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
          getRowClassName={(row) =>
            (row.status || '').toLowerCase() === 'void' ? shellStyles.rowDim : ''
          }
          getRowId={(row) => row.id}
          onRowClick={(row) => handleEdit(row.id)}
        />
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
          onApplyItems={async (detailPayload) => {
            try {
              await updateITPDetail(currentItpId, detailPayload);
              refetch();
            } catch (error: any) {
              if (error?.response?.status === 401) return;
              toast.error(getErrorMessage(error, t('itp.updateError')));
            }
          }}
          onSave={async (updates, details, pendingUploads, deletedFileIds) => {
            try {
              await updateITP(currentItpId, updates);
              if (details) {
                await updateITPDetail(currentItpId, details);
              }

              if (deletedFileIds && deletedFileIds.length > 0) {
                await Promise.all(deletedFileIds.map(id => deleteFile(id).catch(e => console.error('Del Err', e))));
              }
              if (pendingUploads && pendingUploads.length > 0 && currentItpId) {
                await uploadFiles('itp', currentItpId, pendingUploads, 'attachment');
              }

              setIsEditModalOpen(false);
              setCurrentItpId(null);
              refetch();
            } catch (error: any) {
              if (error?.response?.status === 401) return;
              const detail = getErrorMessage(error, t('itp.updateError'));
              toast.error(detail);
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
