import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactDOM from 'react-dom';
import { toast } from 'sonner';
import { Clock, CheckCircle2, BarChart3, Zap, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useNOIStore } from '../../store/noiStore';
import type { NOIItem } from '../../store/noiStore';

import { useNCRStore } from '../../store/ncrStore';
import { useITRStore } from '../../store/itrStore';
import { uploadFiles, deleteFile, getAuthenticatedFileUrl } from '../../services/api';
import { checkNOIReferences, generateDeleteMessage } from '../../utils/cascadeDelete';
import { formatTime24h } from '../../utils/formatters';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './NOI.module.css';
import shellStyles from '../Shared/ModuleShell.module.css';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { RowSelectionState } from '@tanstack/react-table';
import { useDebounce } from '../../hooks/useDebounce';
import { getErrorMessage } from '../../utils/errorUtils';

import {
  NOIDetailModal,
  NOIBulkAddModal,
  NOIDetailData,
} from './NOIModals';
import { useNOIStats } from '../../hooks/useNOIStats';

type StatusFilter = 'all' | 'open' | 'closed' | 'reject';

const NOI: React.FC = () => {
  const { t } = useLanguage();
  const { noiList, loading, error, refetch, addNOI, addBulkNOI, updateNOI, deleteNOI } = useNOIStore();
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
    setCurrentNoiId('new');
    setIsModalOpen(true);
  };

  const handleSaveNOIDetails = async (details: NOIDetailData, pendingUploads: File[], deletedFileIds: string[]) => {
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

      try {
        let savedNOI;
        if (existingItem) {
          await updateNOI(currentNoiId, updatedItem);
          savedNOI = updatedItem;
        } else {
          savedNOI = await addNOI(updatedItem);
        }

        const finalId = savedNOI?.id || currentNoiId;

        if (deletedFileIds && deletedFileIds.length > 0) {
          await Promise.all(deletedFileIds.map(id => deleteFile(id).catch(e => console.error('Failed to delete file', e))));
        }
        if (pendingUploads && pendingUploads.length > 0 && finalId) {
          await uploadFiles('noi', finalId, pendingUploads, 'attachment');
        }

        setIsModalOpen(false);
        setCurrentNoiId(null);
        refetch();
      } catch (error: any) {
        const detail = getErrorMessage(error, t('common.saveFailed'));
        toast.error(detail);
      }
    }
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

  const chips: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: t('common.all') || 'All', count: statistics.total },
    { id: 'open', label: t('noi.stats.open') || 'Open', count: statistics.opening },
    { id: 'closed', label: t('noi.stats.closed') || 'Closed', count: statistics.closed },
    { id: 'reject', label: t('noi.status.reject') || 'Reject', count: statistics.reject },
  ];

  const summary = [
    {
      key: 'open',
      label: t('noi.stats.open') || 'Open',
      value: statistics.opening,
      icon: <Clock size={18} strokeWidth={1.8} />,
      accent: '#c8753f',
    },
    {
      key: 'closed',
      label: t('noi.stats.closed') || 'Closed',
      value: statistics.closed,
      icon: <CheckCircle2 size={18} strokeWidth={1.8} />,
      accent: '#7a8f5a',
    },
    {
      key: 'total',
      label: t('noi.stats.total') || 'Total',
      value: statistics.total,
      icon: <BarChart3 size={18} strokeWidth={1.8} />,
      accent: '#8a6a3a',
    },
    {
      key: 'rate',
      label: t('noi.stats.openRate') || 'Open Rate',
      value: `${statistics.openRate}%`,
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
          <button type="button" className={shellStyles.addNewButton} onClick={handleAddNew}>
            {t('noi.addNew')}
          </button>
          <button type="button" className={shellStyles.addNewButtonAlt} onClick={() => setIsBulkModalOpen(true)}>
            {t('noi.bulkAdd')}
          </button>
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

      {isModalOpen && (
        <NOIDetailModal
          noiId={currentNoiId}
          existingData={currentNoiId ? noiDetails[currentNoiId] : undefined}
          existingItem={currentNoiId ? noiList.find(item => item.id === currentNoiId) : undefined}
          noiList={noiList}
          onSave={handleSaveNOIDetails}
          onClose={() => {
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
      )}

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
          <div id="noi-batch-print-root" className={styles.noiBatchPrintRoot}>
            {Object.entries(groupedByContractor).map(([contractor, items], pageIndex) => (
              <div
                key={contractor}
                className={styles.noiBatchPrintPage}
                style={pageIndex > 0 ? { pageBreakBefore: 'always' } : undefined}
              >
                <div className={styles.noiBatchPrintTitle}>
                  <h1>批次檢驗通知 (NOI)</h1>
                  <p>列印日期：{new Date().toLocaleDateString('zh-TW')}</p>
                </div>

                <div className={styles.noiBatchPrintCommon}>
                  <div className={styles.noiBatchPrintGrid}>
                    <div className={styles.noiBatchPrintField}>
                      <label>承包商</label>
                      <div className={styles.noiBatchPrintValue}>{contractor}</div>
                    </div>
                    <div className={styles.noiBatchPrintField}>
                      <label>發出日期 (Issue Date)</label>
                      <div className={styles.noiBatchPrintValue}>{items[0]?.issueDate ?? '-'}</div>
                    </div>
                    <div className={styles.noiBatchPrintField}>
                      <label>檢驗日期 (Inspection Date)</label>
                      <div className={styles.noiBatchPrintValue}>{items[0]?.inspectionDate ?? '-'}</div>
                    </div>
                    <div className={styles.noiBatchPrintField}>
                      <label>聯絡人</label>
                      <div className={styles.noiBatchPrintValue}>{items[0]?.contacts ?? '-'}</div>
                    </div>
                    <div className={styles.noiBatchPrintField}>
                      <label>電話</label>
                      <div className={styles.noiBatchPrintValue}>{items[0]?.phone ?? '-'}</div>
                    </div>
                    <div className={styles.noiBatchPrintField}>
                      <label>Email</label>
                      <div className={styles.noiBatchPrintValue}>{items[0]?.email ?? '-'}</div>
                    </div>
                  </div>
                </div>

                <div className={styles.noiBatchPrintList}>
                  <h3>各筆 NOI 資料</h3>
                  <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>共 {items.length} 筆</p>
                  <table className={styles.noiBatchPrintListTable}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Subject</th>
                        <th>ITP no.</th>
                        <th>Event #</th>
                        <th>Checkpoint</th>
                        <th>檢驗時間</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((noi, index) => (
                        <tr key={noi.id}>
                          <td>{index + 1}</td>
                          <td>{noi.package}</td>
                          <td>{noi.itpNo}</td>
                          <td>{noi.eventNumber ?? '-'}</td>
                          <td>{noi.checkpoint ?? '-'}</td>
                          <td>{formatTime24h(noi.inspectionTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {items.some(n => n.attachments && n.attachments.length > 0) && (
                  <div className={styles.noiBatchPrintPhotoSection}>
                    <h3>{t('itp.selfInspection.attachments')} (Photo Record)</h3>
                    <div className={styles.noiBatchPrintPhotoGrid}>
                      {items.flatMap(n =>
                        (n.attachments || []).map((img, imgIdx) => ({
                          img,
                          label: `${n.package} - #${imgIdx + 1}`,
                        }))
                      ).map((item, idx) => (
                        <div key={idx} className={styles.noiBatchPrintPhotoItem}>
                          <img src={getAuthenticatedFileUrl(typeof item.img === 'string' ? item.img : item.img.file_url)} alt={item.label} className={styles.noiBatchPrintPhoto} />
                          <div className={styles.noiBatchPrintPhotoLabel}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>,
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
