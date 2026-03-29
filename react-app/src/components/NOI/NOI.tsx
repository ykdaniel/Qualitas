import React, { useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { toast } from 'sonner';
import { useLanguage } from '../../context/LanguageContext';
import { useNOIStore } from '../../store/noiStore';
import type { NOIItem } from '../../store/noiStore';

import { useNCRStore } from '../../store/ncrStore';
import { useITRStore } from '../../store/itrStore';
import { uploadFiles, deleteFile } from '../../services/api';
import { checkNOIReferences, generateDeleteMessage } from '../../utils/cascadeDelete';
import { formatTime24h } from '../../utils/formatters';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './NOI.module.css';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { RowSelectionState } from '@tanstack/react-table';
import { BackButton } from '@/components/ui/BackButton';
import { useDebounce } from '../../hooks/useDebounce';

import {
  NOIDetailModal,
  NOIBulkAddModal,
  NOIDetailData
} from './NOIModals';
import { useNOIStats } from '../../hooks/useNOIStats';
import { StatItem } from '../Shared/StatItem';
import statStyles from '../Shared/StatItem.module.css';

const NOI: React.FC = () => {
  const { t } = useLanguage();
  const { noiList, loading, error, refetch, addNOI, addBulkNOI, updateNOI, deleteNOI } = useNOIStore();
  const ncrList = useNCRStore(state => state.ncrList);
  const itrList = useITRStore(state => state.itrList);

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const debouncedSearch = useDebounce(searchQuery, 500);

  // Trigger server-side refetch when debounced search or status filter changes
  useEffect(() => {
    refetch({
      search: debouncedSearch,
      status: statusFilter === 'all' ? undefined : statusFilter
    });
  }, [debouncedSearch, statusFilter, refetch]);


  // Data is now primarily filtered by backend.
  const filteredData = useMemo(() => {
    return noiList;
  }, [noiList]);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [currentNoiId, setCurrentNoiId] = useState<string | null>(null);
  const [noiDetails, setNoiDetails] = useState<{ [key: string]: NOIDetailData }>({});
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
    isOpen: false,
    id: null,
    message: '',
  });

  // DataTable selection state
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const [batchPrintData, setBatchPrintData] = useState<NOIItem[] | null>(null);

  // Derive selected items from rowSelection (keys are IDs)
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

  // 按 Contractor 分組
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

  const handleAddNew = () => {
    const newId = String(Date.now());
    setCurrentNoiId(newId);
    setIsModalOpen(true);
  };

  const handleSaveNOIDetails = async (details: NOIDetailData, pendingUploads: File[], deletedFileIds: string[]) => {
    if (currentNoiId) {
      setNoiDetails(prev => ({ ...prev, [currentNoiId]: details }));

      const existingItem = noiList.find(item => item.id === currentNoiId);

      const updatedItem: NOIItem = {
        id: currentNoiId,
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
          savedNOI = await addNOI(updatedItem, currentNoiId);
        }

        const finalId = savedNOI?.id || currentNoiId;

        // Process file deletions and uploads
        if (deletedFileIds && deletedFileIds.length > 0) {
            await Promise.all(deletedFileIds.map(id => deleteFile(id).catch(e => console.error("Failed to delete file", e))));
        }
        if (pendingUploads && pendingUploads.length > 0 && finalId) {
            await uploadFiles('noi', finalId, pendingUploads, 'attachment');
        }

        setIsModalOpen(false);
        setCurrentNoiId(null);
        refetch(); // Refresh to ensure attachments are updated
      } catch (error: any) {
        const detail = error?.response?.data?.detail || t('common.saveFailed') || 'Save failed';
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

  // Columns memoization
  const columns = useMemo(() => createColumns(handleEdit, handleDeleteClick, t), [t, handleEdit, handleDeleteClick]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BackButton />
          <h1>{t('noi.title')}</h1>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.filterGroup}>
            <select
              className={styles.statusFilter}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">{t('obs.allStatus') || 'All Status'}</option>
              <option value="open">{t('noi.status.open') || 'Open'}</option>
              <option value="closed">{t('noi.status.closed') || 'Closed'}</option>
              <option value="reject">{t('noi.status.reject') || 'Reject'}</option>
            </select>
          </div>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('noi.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.summarySection}>
        <h2 className={styles.summaryTitle}>{t('pqp.statusStats')}</h2>
        <div className={styles.statsContainer}>
          <div className={styles.statusStatsGrid}>
            <StatItem 
              label={t('noi.stats.open')} 
              value={statistics.opening} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.blueIcon} 
            />
            <StatItem 
              label={t('noi.stats.closed')} 
              value={statistics.closed} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.greenIcon} 
            />
            <StatItem 
              label={t('noi.status.reject')} 
              value={statistics.reject} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.redIcon} 
              style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
            />
            <StatItem 
              label={t('noi.stats.total')} 
              value={statistics.total} 
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" /><path d="M18 17V9M12 17V5M6 17v-3" strokeLinecap="round" strokeLinejoin="round" /></svg>} 
              iconColorClass={statStyles.grayIcon} 
            />
            <StatItem 
              label={t('noi.stats.openRate')} 
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
              title={t('noi.listTitle')}
              actions={
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className={styles.addNewButton}
                    onClick={handleAddNew}
                  >
                    {t('noi.addNew')}
                  </button>
                  <button
                    className={styles.addNewButton}
                    onClick={() => setIsBulkModalOpen(true)}
                    style={{ backgroundColor: '#059669' }}
                  >
                    {t('noi.bulkAdd')}
                  </button>
                  <button
                    className={styles.printButton}
                    onClick={handleBatchPrint}
                    disabled={selectedItems.length === 0}
                    title={selectedItems.length === 0 ? t('noi.tooltip.print') : t('noi.tooltip.printCount', { count: selectedItems.length })}
                  >
                    {t('noi.batchPrint')}
                  </button>
                </div>
              }
              columns={columns}
              data={filteredData}
              searchKey=""
              searchPlaceholder={t('noi.searchPlaceholder')}
              getRowClassName={(row) =>
                (row.status || 'Open').toLowerCase() === 'closed'
                  ? 'bg-emerald-100/50 text-gray-500 hover:bg-emerald-200/50'
                  : ''
              }
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              getRowId={(row) => row.id}
              onRowClick={(row) => handleEdit(row.id)}
            />
          </>
        )}
      </div>

      {isModalOpen && (
        <NOIDetailModal
          noiId={currentNoiId}
          existingData={currentNoiId ? noiDetails[currentNoiId] : undefined}
          existingItem={currentNoiId ? noiList.find(item => item.id === currentNoiId) : undefined}
          noiList={noiList}
          onSave={handleSaveNOIDetails}
          onClose={() => {
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
            {/* 每個 Contractor 一頁 */}
            {Object.entries(groupedByContractor).map(([contractor, items], pageIndex) => (
              <div
                key={contractor}
                className={styles.noiBatchPrintPage}
                style={pageIndex > 0 ? { pageBreakBefore: 'always' } : undefined}
              >
                {/* 標題 */}
                <div className={styles.noiBatchPrintTitle}>
                  <h1>批次檢驗通知 (NOI)</h1>
                  <p>列印日期：{new Date().toLocaleDateString('zh-TW')}</p>
                </div>

                {/* 共同欄位區 */}
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

                {/* 多筆資料表格 */}
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

                {/* 附件附錄 (Photo Record) */}
                {items.some(n => n.attachments && n.attachments.length > 0) && (
                  <div className={styles.noiBatchPrintPhotoSection}>
                    <h3>{t('itp.selfInspection.attachments')} (Photo Record)</h3>
                    <div className={styles.noiBatchPrintPhotoGrid}>
                      {items.flatMap(n =>
                        (n.attachments || []).map((img, imgIdx) => ({
                          img,
                          label: `${n.package} - #${imgIdx + 1}`
                        }))
                      ).map((item, idx) => (
                        <div key={idx} className={styles.noiBatchPrintPhotoItem}>
                          <img src={typeof item.img === 'string' ? item.img : item.img.file_url} alt={item.label} className={styles.noiBatchPrintPhoto} />
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
