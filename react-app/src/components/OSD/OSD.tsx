import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Clock, CheckCircle2, BarChart3, Zap, Search, Ban } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useOSDStore } from '../../store/osdStore';
import type { OSDItem as ContextOSDItem } from '../../store/osdStore';
import shellStyles from '../Shared/ModuleShell.module.css';
import ConfirmModal from '../Shared/ConfirmModal';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { OSDDetailModal, OSDDetailData, PendingUploads } from './OSDModals';
import { useDebounce } from '../../hooks/useDebounce';
import { uploadFiles, deleteFile } from '../../services/api';
import { useOSDStats } from '../../hooks/useOSDStats';
import { getErrorMessage } from '../../utils/errorUtils';

type StatusFilter = 'all' | 'open' | 'closed' | 'void';

const OSD: React.FC = () => {
  const { t } = useLanguage();
  const { hasPermission } = useAuth();
  const { getActiveContractors } = useContractorsStore();
  const { osdList, loading, error, refetch, addOSD, updateOSD, deleteOSD } = useOSDStore();

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
  const [currentOsdId, setCurrentOsdId] = useState<string | null>(null);

  // Delete Confirmation State
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
    isOpen: false,
    id: null,
    message: '',
  });

  // Search hits the server via the debounced effect; the status chip is a
  // client-side slice over whatever the server returned.
  const filteredList = useMemo(() => {
    if (statusFilter === 'all') return osdList;
    return osdList.filter((item) => {
      const s = (item.status || '').toLowerCase();
      if (statusFilter === 'closed') return s === 'closed';
      if (statusFilter === 'void') return s === 'void';
      // 'open' = active (not closed, not void)
      return s !== 'closed' && s !== 'void';
    });
  }, [osdList, statusFilter]);

  const statistics = useOSDStats(osdList);

  const handleEdit = React.useCallback((id: string) => {
    setCurrentOsdId(id);
    setIsEditModalOpen(true);
  }, []);

  const handleAddNew = () => {
    setCurrentOsdId('new');
    setIsEditModalOpen(true);
  };

  const handleSaveOSDDetails = async (details: OSDDetailData, pendingUploads: PendingUploads[], deletedFileIds: string[]) => {
    if (!currentOsdId) return;
    const isNew = currentOsdId === 'new';
    // documentNumber 由後端自動產生，新建時不送
    const payload: Record<string, unknown> = {
      vendor: details.contractor || '',
      status: details.status || 'Open',
      remark: details.remark || '',
      raiseDate: details.raiseDate || undefined,
      closeoutDate: details.closeoutDate || undefined,
      raisedBy: details.raisedBy || undefined,
      deliveryNoteNo: details.deliveryNoteNo || undefined,
      poNumber: details.poNumber || undefined,
      itemDescription: details.itemDescription || undefined,
      expectedQty: details.expectedQty || undefined,
      receivedQty: details.receivedQty || undefined,
      unit: details.unit || undefined,
      damageDescription: details.damageDescription || undefined,
      disposition: details.disposition || undefined,
      correctiveAction: details.correctiveAction || undefined,
      correctiveActionOwner: details.correctiveActionOwner || undefined,
      correctiveActionTargetDate: details.correctiveActionTargetDate || undefined,
      resolvedBy: details.resolvedBy || undefined,
      resolvedDate: details.resolvedDate || undefined,
      defectPhotos: details.defectPhotos,
      attachments: details.attachments,
      dueDate: details.dueDate || undefined,
    };
    try {
      let targetId = '';
      if (isNew) {
        const createdOsd = await addOSD(payload as Omit<ContextOSDItem, 'id'>);
        targetId = createdOsd.id;
      } else {
        await updateOSD(currentOsdId, payload);
        targetId = currentOsdId;
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
              await uploadFiles('osd', targetId, files, category);
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
      setCurrentOsdId(null);
    } catch (error: any) {
      const detail = getErrorMessage(error, t('common.saveFailed'));
      toast.error(detail);
    }
  };

  const confirmDelete = React.useCallback((id: string) => {
    setDeleteModal({
      isOpen: true,
      id,
      message: t('common.deleteConfirmMessage', { item: 'OSD' }),
    });
  }, [t]);

  // Columns memoization
  const columns = useMemo(() => createColumns(confirmDelete, t, getActiveContractors), [t, getActiveContractors, confirmDelete]);

  const handleDelete = async () => {
    if (deleteModal.id) {
      try {
        await deleteOSD(deleteModal.id);
      } catch (err) {
        console.error('Failed to delete OSD:', err);
        toast.error((err as Error)?.message || t('common.deleteFailed'));
      }
      setDeleteModal({ isOpen: false, id: null, message: '' });
    }
  };

  const chips: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: t('common.all') || 'All', count: statistics.total },
    { id: 'open', label: t('osd.statOpen') || 'Open', count: statistics.opening },
    { id: 'closed', label: t('osd.statClosed') || 'Closed', count: statistics.closed },
    { id: 'void', label: t('itp.status.void') || 'Void', count: statistics.void },
  ];

  const summary = [
    {
      key: 'open',
      label: t('osd.statOpen'),
      value: statistics.opening,
      icon: <Clock size={18} strokeWidth={1.8} />,
      accent: '#c8753f',
    },
    {
      key: 'closed',
      label: t('osd.statClosed'),
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
      label: t('osd.statTotal'),
      value: statistics.total,
      icon: <BarChart3 size={18} strokeWidth={1.8} />,
      accent: '#8a6a3a',
    },
    {
      key: 'rate',
      label: t('osd.statOpenRate'),
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
              placeholder={t('osd.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className={shellStyles.addNewButton} onClick={handleAddNew}>
            {t('osd.addNew')}
          </button>
        </div>
      </div>

      {loading && (
        <div className={shellStyles.loadingNote}>{t('common.loading') || 'Loading OSD list...'}</div>
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

      {isEditModalOpen && currentOsdId && (() => {
        const editingItem = currentOsdId === 'new' ? undefined : osdList.find(item => item.id === currentOsdId);
        // Read-only when the user lacks edit rights, or the record is locked
        // (Closed/Void) and they lack the create permission (no separate
        // approve tier for OSD).
        const status = (editingItem?.status || '').toLowerCase();
        const locked = status === 'closed' || status === 'void';
        const canEdit = currentOsdId === 'new'
          ? true
          : locked ? hasPermission('osd:create:all') : hasPermission('osd:update:all');
        return (
          <OSDDetailModal
            osdId={currentOsdId}
            existingItem={editingItem}
            readOnly={!canEdit}
            onSave={handleSaveOSDDetails}
            onClose={() => {
              setIsEditModalOpen(false);
              setCurrentOsdId(null);
            }}
          />
        );
      })()}
    </div>
  );
};

export default OSD;
