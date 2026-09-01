import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Clock, CheckCircle2, BarChart3, Zap, Search, Ban } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
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

type StatusFilter = 'all' | 'open' | 'closed' | 'void';

const OBS: React.FC = () => {
  const { t } = useLanguage();
  const { hasPermission } = useAuth();
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
      if (statusFilter === 'closed') return s === 'closed';
      if (statusFilter === 'void') return s === 'void';
      // 'open' = active (not closed, not void)
      return s !== 'closed' && s !== 'void';
    });
  }, [obsList, statusFilter]);

  const statistics = useOBSStats(obsList);





  const handleEdit = React.useCallback((id: string) => {
    setCurrentObsId(id);
    setIsEditModalOpen(true);
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const deepLinkAppliedRef = useRef(false);
  // Set true only when the currently-open modal was reached via ?openId=
  // (e.g. from Follow Up Issues) — lets onClose send the user back where
  // they came from via browser history instead of just landing on this
  // page's plain list, which is otherwise indistinguishable from having
  // navigated here directly from the sidebar.
  const openedViaDeepLinkRef = useRef(false);
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    const openId = searchParams.get('openId');
    if (!openId) return;
    if (obsList.length === 0) return;
    const match = obsList.find(item => item.id === openId || item.documentNumber === openId);
    if (!match) return;
    handleEdit(match.id);
    openedViaDeepLinkRef.current = true;
    deepLinkAppliedRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('openId');
    setSearchParams(next, { replace: true });
  }, [searchParams, obsList, handleEdit, setSearchParams]);

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
      qualityEngineerApproval: details.qualityEngineerApproval || undefined,
      qualityEngineerApprovalBy: details.qualityEngineerApprovalBy || undefined,
      qualityEngineerApprovalDate: details.qualityEngineerApprovalDate || undefined,
      constructionEngineerApproval: details.constructionEngineerApproval || undefined,
      constructionEngineerApprovalBy: details.constructionEngineerApprovalBy || undefined,
      constructionEngineerApprovalDate: details.constructionEngineerApprovalDate || undefined,
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
    { id: 'void', label: t('itp.status.void') || 'Void', count: statistics.void },
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
      key: 'void',
      label: t('itp.status.void') || 'Void',
      value: statistics.void,
      icon: <Ban size={18} strokeWidth={1.8} />,
      accent: '#9aa0a8',
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
          {hasPermission('obs:create:all') && (
            <button className={shellStyles.addNewButton} onClick={handleAddNew}>
              {t('obs.addNew')}
            </button>
          )}
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

      {isEditModalOpen && currentObsId && (() => {
        const editingItem = currentObsId === 'new' ? undefined : obsList.find(item => item.id === currentObsId);
        // Read-only when the user lacks edit rights, or the record is locked
        // (Closed/Void) and they lack the higher approve permission.
        const status = (editingItem?.status || '').toLowerCase();
        const locked = status === 'closed' || status === 'void';
        const canEdit = currentObsId === 'new'
          ? hasPermission('obs:create:all')
          : locked ? hasPermission('obs:approve:all') : hasPermission('obs:update:all');
        return (
          <OBSDetailModal
            obsId={currentObsId}
            existingItem={editingItem}
            readOnly={!canEdit}
            onSave={handleSaveOBSDetails}
            onClose={() => {
              if (openedViaDeepLinkRef.current) {
                openedViaDeepLinkRef.current = false;
                navigate(-1);
                return;
              }
              setIsEditModalOpen(false);
              setCurrentObsId(null);
            }}
          />
        );
      })()}
    </div>
  );
};

export default OBS;
