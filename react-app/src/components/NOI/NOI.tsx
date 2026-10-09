import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactDOM from 'react-dom';
import { toast } from 'sonner';
import { Clock, CheckCircle2, BarChart3, Zap, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useNOIStore } from '../../store/noiStore';
import type { NOIItem } from '../../store/noiStore';

import { useNCRStore } from '../../store/ncrStore';
import { useITRStore } from '../../store/itrStore';
import { uploadFiles, deleteFile } from '../../services/api';
import { checkNOIReferences, generateDeleteMessage } from '../../utils/cascadeDelete';
import ConfirmModal from '../Shared/ConfirmModal';
import shellStyles from '../Shared/ModuleShell.module.css';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { RowSelectionState } from '@tanstack/react-table';
import { useDebounce } from '../../hooks/useDebounce';
import { runSaveFlow, sameWrite, SaveOutcome } from '../../utils/saveFlow';
import { describeSaveError } from '../../utils/saveErrors';

import {
  NOIDetailModal,
  NOIBulkAddModal,
  NOIDetailData,
} from './NOIModals';
import NOIPrintTemplate from './NOIPrintTemplate';
import { useNOIStats } from '../../hooks/useNOIStats';

type StatusFilter = 'all' | 'open' | 'closed' | 'reject';

const NOI: React.FC = () => {
  const { t } = useLanguage();
  const { hasPermission } = useAuth();
  const { noiList, loading, error, refetch, addNOI, addBulkNOI, updateNOI, deleteNOI } = useNOIStore();
  // The last successful record write of the open modal (id + serialized payload) — see runSaveFlow / sameWrite.
  const lastWriteRef = useRef<{ id: string; key: string } | null>(null);
  const ncrList = useNCRStore(state => state.ncrList);
  const itrList = useITRStore(state => state.itrList);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const debouncedSearch = useDebounce(searchQuery, 500);

  useEffect(() => {
    refetch({
      search: debouncedSearch,
      status: statusFilter === 'all' ? undefined : statusFilter,
    });
  }, [debouncedSearch, statusFilter, refetch]);

  const filteredData = useMemo(() => noiList, [noiList]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [currentNoiId, setCurrentNoiId] = useState<string | null>(null);
  const [noiDetails] = useState<{ [key: string]: NOIDetailData }>({});
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
    isOpen: false,
    id: null,
    message: '',
  });

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const [batchPrintData, setBatchPrintData] = useState<NOIItem[] | null>(null);

  const selectedItems = useMemo(() => {
    return Object.keys(rowSelection)
      .filter((id) => rowSelection[id])
      .map((id) => noiList.find((item) => item.id === id))
      .filter((item): item is NOIItem => item !== undefined);
  }, [rowSelection, noiList]);

  const handleBatchPrint = () => {
    const items = selectedItems.map(item => {
      const details = noiDetails[item.id];
      if (details) {
        return { ...item, attachments: details.attachments || [] };
      }
      return item;
    });
    if (items.length === 0) return;
    setBatchPrintData(items);
  };

  const handleSinglePrint = (item: NOIItem) => {
    const details = noiDetails[item.id];
    const itemToPrint = details
      ? { ...item, attachments: details.attachments || [] }
      : item;
    setBatchPrintData([itemToPrint]);
  };

  const groupedByContractor = useMemo(() => {
    if (!batchPrintData) return {};
    return batchPrintData.reduce((acc, noi) => {
      const key = noi.contractor || '未指定';
      if (!acc[key]) acc[key] = [];
      acc[key].push(noi);
      return acc;
    }, {} as Record<string, NOIItem[]>);
  }, [batchPrintData]);

  useEffect(() => {
    if (!batchPrintData) return;
    const timer = setTimeout(() => {
      window.print();
    }, 1000);
    const onAfterPrint = () => setBatchPrintData(null);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, [batchPrintData]);

  const statistics = useNOIStats(noiList);

  const handleEdit = React.useCallback((id: string) => {
    lastWriteRef.current = null;
    setCurrentNoiId(id);
    setIsModalOpen(true);
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
    if (noiList.length === 0) return;
    const match = noiList.find(item => item.id === openId || item.referenceNo === openId);
    if (!match) return;
    handleEdit(match.id);
    openedViaDeepLinkRef.current = true;
    deepLinkAppliedRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('openId');
    setSearchParams(next, { replace: true });
  }, [searchParams, noiList, handleEdit, setSearchParams]);

  const handleAddNew = () => {
    lastWriteRef.current = null;
    setCurrentNoiId('new');
    setIsModalOpen(true);
  };

  const fileSteps = {
    upload: (id: string, group: { category: string; files: File[] }) => uploadFiles('noi', id, group.files, group.category),
    remove: deleteFile,
    reload: async () => { await refetch(); return !useNOIStore.getState().error; },
    describe: (e: unknown) => describeSaveError(e, t),
  };

  // Retry of the unfinished file steps only. The record is stored already; it is NOT written again (an account with create but
  // without update permission could not do that anyway, and the retry must never create it a second time).
  const handleRetryNOIFiles = async (pendingUploads: File[], deletedFileIds: string[]): Promise<SaveOutcome> => {
    const id = lastWriteRef.current?.id;
    if (!id) return { status: 'failed', message: t('common.saveFailed') };
    return runSaveFlow({
      writeRecord: async () => { throw new Error('a file retry never writes the record'); },
      reuseId: id,
      uploads: pendingUploads.length > 0 ? [{ category: 'attachment', files: pendingUploads }] : [],
      deletedFileIds,
      ...fileSteps,
    });
  };

  const handleSaveNOIDetails = async (details: NOIDetailData, pendingUploads: File[], deletedFileIds: string[]): Promise<SaveOutcome> => {
    if (currentNoiId) {
      const isNew = currentNoiId === 'new';
      const existingItem = isNew ? undefined : noiList.find(item => item.id === currentNoiId);

      const updatedItem: NOIItem = {
        id: isNew ? '' : currentNoiId,
        package: details.package || '',
        referenceNo: details.referenceNo || '',
        issueDate: details.issueDate || '',
        inspectionDate: details.inspectionDate || '',
        inspectionTime: details.inspectionTime || '',
        itpNo: details.itpNo || '',
        eventNumber: details.eventNumber || '',
        checkpoint: details.checkpoint || '',
        type: details.type || '',
        contractor: details.contractor || '',
        contacts: details.contacts || '',
        phone: details.phone || '',
        email: details.email || '',
        status: details.status || 'Open',
        attachments: details.attachments || [],
        ncrNumber: details.ncrNumber || '',
        remark: details.remark || '',
        closeoutDate: details.closeoutDate || '',
        dueDate: details.dueDate || '',
      };

      // A retry after "saved, but a file step failed" with unchanged content must not write the record again.
      const currentId = currentNoiId;
      const outcome = await runSaveFlow({
        writeRecord: async () => {
          if (existingItem) {
            await updateNOI(currentId, updatedItem);
            return currentId;
          }
          return (await addNOI(updatedItem))?.id ?? '';
        },
        reuseId: sameWrite(lastWriteRef.current, currentId, { ...updatedItem, id: '' }) ? currentId : null,
        uploads: pendingUploads && pendingUploads.length > 0 ? [{ category: 'attachment', files: pendingUploads }] : [],
        deletedFileIds,
        ...fileSteps,
        // (the id is left out of the key: it is '' while creating and the real id afterwards, but the content is the same)
        // (the id is left out of the key: it is '' while creating and the real id afterwards, but the content is the same)
        onRecordSaved: (id) => { lastWriteRef.current = { id, key: JSON.stringify({ ...updatedItem, id: '' }) }; },
      });
      // The record exists now: a retry must update it, never create it again.
      if (outcome.status === 'saved-incomplete' && isNew && outcome.id) setCurrentNoiId(outcome.id);
      return outcome;
    }
    return { status: 'failed', message: t('common.saveFailed') };
  };

  const handleDeleteClick = React.useCallback((id: string) => {
    const noi = noiList.find(item => item.id === id);
    if (!noi) return;
    const references = checkNOIReferences(id, noi.referenceNo, itrList, ncrList);
    const message = generateDeleteMessage('NOI', noi.referenceNo, references.references, t);
    setDeleteModal({ isOpen: true, id, message });
  }, [noiList, itrList, ncrList, t]);

  const handleDeleteConfirm = async () => {
    if (deleteModal.id) {
      await deleteNOI(deleteModal.id);
      setDeleteModal({ isOpen: false, id: null, message: '' });
    }
  };

  const columns = useMemo(() => createColumns(handleDeleteClick, t), [t, handleDeleteClick]);

  // A failed load is not "zero records": with an error and nothing loaded the counts are unknown and are shown as "—".
  const loadFailed = !!error && noiList.length === 0;
  const shown = <T,>(v: T): T | string => (loadFailed ? '—' : v);

  const chips: { id: StatusFilter; label: string; count: number | string }[] = [
    { id: 'all', label: t('common.all') || 'All', count: shown(statistics.total) },
    { id: 'open', label: t('noi.stats.open') || 'Open', count: shown(statistics.opening) },
    { id: 'closed', label: t('noi.stats.closed') || 'Closed', count: shown(statistics.closed) },
    { id: 'reject', label: t('noi.status.reject') || 'Reject', count: shown(statistics.reject) },
  ];

  const summary = [
    {
      key: 'open',
      label: t('noi.stats.open') || 'Open',
      value: shown(statistics.opening),
      icon: <Clock size={18} strokeWidth={1.8} />,
      accent: '#c8753f',
    },
    {
      key: 'closed',
      label: t('noi.stats.closed') || 'Closed',
      value: shown(statistics.closed),
      icon: <CheckCircle2 size={18} strokeWidth={1.8} />,
      accent: '#7a8f5a',
    },
    {
      key: 'total',
      label: t('noi.stats.total') || 'Total',
      value: shown(statistics.total),
      icon: <BarChart3 size={18} strokeWidth={1.8} />,
      accent: '#8a6a3a',
    },
    {
      key: 'rate',
      label: t('noi.stats.openRate') || 'Open Rate',
      value: shown(`${statistics.openRate}%`),
      icon: <Zap size={18} strokeWidth={1.8} />,
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
              placeholder={t('noi.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {hasPermission('noi:create:all') && (
            <button type="button" className={shellStyles.addNewButton} onClick={handleAddNew}>
              {t('noi.addNew')}
            </button>
          )}
          {hasPermission('noi:create:all') && (
            <button type="button" className={shellStyles.addNewButtonAlt} onClick={() => setIsBulkModalOpen(true)}>
              {t('noi.bulkAdd')}
            </button>
          )}
          <button
            type="button"
            className={shellStyles.addNewButtonAlt}
            onClick={handleBatchPrint}
            disabled={selectedItems.length === 0}
            title={selectedItems.length === 0
              ? t('noi.tooltip.print')
              : t('noi.tooltip.printCount', { count: selectedItems.length })}
          >
            {t('noi.batchPrint')}
          </button>
        </div>
      </div>

      {loading && (
        <div className={shellStyles.loadingNote}>{t('common.loading')}</div>
      )}

      <div className={shellStyles.content}>
        <DataTable
          columns={columns}
          data={filteredData}
          searchKey=""
          getRowClassName={(row) =>
            (row.status || 'Open').toLowerCase() === 'closed' ? shellStyles.rowDim : ''
          }
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          getRowId={(row) => row.id}
          onRowClick={(row) => handleEdit(row.id)}
        />
      </div>

      {isModalOpen && (() => {
        const editingItem = currentNoiId && currentNoiId !== 'new'
          ? noiList.find(item => item.id === currentNoiId)
          : undefined;
        // Read-only when the user lacks edit rights, or the record is locked
        // (Closed/Reject) and they lack the higher approve permission.
        // Closed is a true dead end (backend rejects any field change
        // unconditionally, no permission bypass — see noi_service.py
        // update_noi), so it's always read-only here too; Reject still has
        // a real reopen path, so it stays permission-gated as before.
        const status = (editingItem?.status || '').toLowerCase();
        const locked = status === 'closed' || status === 'reject';
        const canEdit = currentNoiId === 'new'
          ? hasPermission('noi:create:all')
          : status === 'closed' ? false
          : locked ? hasPermission('noi:approve:all') : hasPermission('noi:update:all');
        return (
        <NOIDetailModal
          noiId={currentNoiId}
          readOnly={!canEdit}
          existingData={currentNoiId ? noiDetails[currentNoiId] : undefined}
          existingItem={currentNoiId ? noiList.find(item => item.id === currentNoiId) : undefined}
          noiList={noiList}
          onSave={handleSaveNOIDetails}
          onRetryFiles={handleRetryNOIFiles}
          attachmentsAllowed={hasPermission('noi:update:all')}
          onClose={() => {
            lastWriteRef.current = null;
            if (openedViaDeepLinkRef.current) {
              openedViaDeepLinkRef.current = false;
              navigate(-1);
              return;
            }
            setIsModalOpen(false);
            setCurrentNoiId(null);
          }}
          onPrint={(data) => {
            if (currentNoiId) {
              const item = noiList.find(i => i.id === currentNoiId);
              const printItem: NOIItem = {
                ...item,
                ...data,
                id: currentNoiId,
              } as NOIItem;
              handleSinglePrint(printItem);
            }
          }}
        />
        );
      })()}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={t('common.deleteConfirmTitle')}
        message={deleteModal.message || t('common.deleteConfirmMessage', { item: 'NOI' })}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteModal({ isOpen: false, id: null, message: '' })}
        confirmText="Delete"
        cancelText="Cancel"
      />

      {batchPrintData &&
        ReactDOM.createPortal(
          <NOIPrintTemplate groupedByContractor={groupedByContractor} />,
          document.body
        )}

      {isBulkModalOpen && (
        <NOIBulkAddModal
          onSave={async (nois) => {
            try {
              await addBulkNOI(nois);
              setIsBulkModalOpen(false);
            } catch (err: any) {
              const msg = err instanceof Error ? err.message : (t('common.unknownError') || 'Unknown Error');
              toast.error(`${t('noi.bulkAddFailed') || 'Bulk add failed'}: ${msg}`);
            }
          }}
          onClose={() => setIsBulkModalOpen(false)}
        />
      )}
    </div>
  );
};

export default NOI;
