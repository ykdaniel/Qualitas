import React, { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { BarChart3, FileCheck, TrendingUp, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { checkFATReferences, generateDeleteMessage } from '../../utils/cascadeDelete';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { useFATStore, deriveFATResult } from '../../store/fatStore';
import type { FATItem, FATDetailItem } from '../../store/fatStore';
import ReactDOM from 'react-dom';
import FATPrintTemplate from './FATPrintTemplate';
import './FAT.print.css';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './FAT.module.css';
import formStyles from '../Shared/FormShell.module.css';
import shellStyles from '../Shared/ModuleShell.module.css';
import { useFATStats } from '../../hooks/useFATStats';
import { checkDateOrder } from '../../utils/dateValidation';

type StatusFilter = 'all' | 'scheduled' | 'inProgress' | 'completed' | 'cancelled';

// ... (keep constants and interfaces that are NOT FATItem if any, or move them)
// FATDetailItem is used in FAT.tsx. Keep it.

const FAT: React.FC = () => {
  const { t } = useLanguage();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('fat:update:all');
  const { getActiveContractors } = useContractorsStore();
  const { fatList, addFAT, updateFAT, deleteFAT, saveFATDetails, fatDetails, fetchFATs } = useFATStore();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    fetchFATs();
  }, [fetchFATs]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isDetailsEditModalOpen, setIsDetailsEditModalOpen] = useState(false);
  const [currentFatId, setCurrentFatId] = useState<string | null>(null);
  const [viewingFatId, setViewingFatId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
    isOpen: false,
    id: null,
    message: '',
  });

  const filteredFatList = useMemo(() => {
    let filtered = fatList;

    if (statusFilter !== 'all') {
      const target = ({
        scheduled: 'scheduled',
        inProgress: 'in progress',
        completed: 'completed',
        cancelled: 'cancelled',
      } as const)[statusFilter];
      filtered = filtered.filter(item => (item.status || '').toLowerCase() === target);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.equipment.toLowerCase().includes(query) ||
        item.supplier.toLowerCase().includes(query) ||
        item.procedure.toLowerCase().includes(query) ||
        item.location.toLowerCase().includes(query) ||
        item.deliveryFrom.toLowerCase().includes(query) ||
        item.deliveryTo.toLowerCase().includes(query) ||
        item.siteReadiness.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [fatList, searchQuery, statusFilter]);

  const statusCounts = useMemo(() => {
    return fatList.reduce((acc, item) => {
      const s = (item.status || '').toLowerCase();
      if (s === 'scheduled') acc.scheduled++;
      else if (s === 'in progress') acc.inProgress++;
      else if (s === 'completed') acc.completed++;
      else if (s === 'cancelled') acc.cancelled++;
      return acc;
    }, { scheduled: 0, inProgress: 0, completed: 0, cancelled: 0 });
  }, [fatList]);

  const statistics = useFATStats(filteredFatList);

  const handleAddNew = () => {
    setCurrentFatId(null);
    setIsEditModalOpen(true);
  };

  const handleSaveFATDetails = async (updates: Partial<FATItem>) => {
    try {
      if (currentFatId) {
        await updateFAT(currentFatId, updates);
      } else {
        const activeContractors = getActiveContractors();
        const defaultSupplier = activeContractors.length > 0 ? activeContractors[0].name : '';
        const newItem: Omit<FATItem, 'id'> = {
          equipment: updates.equipment || '',
          supplier: updates.supplier || defaultSupplier,
          procedure: updates.procedure || '',
          location: updates.location || '',
          startDate: updates.startDate || '',
          endDate: updates.endDate || '',
          deliveryFrom: updates.deliveryFrom || '',
          deliveryTo: updates.deliveryTo || '',
          siteReadiness: updates.siteReadiness || '',
          moveInDate: updates.moveInDate || '',
          status: updates.status || 'Scheduled',
          hasDetails: false,
        } as any; // safe cast for omit id
        await addFAT(newItem);
      }
      setIsEditModalOpen(false);
      setCurrentFatId(null);
    } catch (_) { // eslint-disable-line @typescript-eslint/no-unused-vars
      // Error handled in context
    }
  };

  const handleAddDetails = (id: string) => {
    setCurrentFatId(id);
    setIsDetailsEditModalOpen(true);
  };

  const handleSaveDetails = async (details: FATDetailItem[]) => {
    if (currentFatId) {
      try {
        await saveFATDetails(currentFatId, details);
        setIsDetailsEditModalOpen(false);
        setCurrentFatId(null);
      } catch (_) { // eslint-disable-line @typescript-eslint/no-unused-vars
        // Error handled in context
      }
    }
  };

  const handleEdit = (id: string) => {
    setCurrentFatId(id);
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    const fat = fatList.find(item => item.id === id);
    if (!fat) return;
    const fatIdentifier = fat.equipment || fat.id;
    const references = checkFATReferences(id, fatIdentifier);
    const message = generateDeleteMessage('FAT', fatIdentifier, references.references, t);
    setDeleteModal({ isOpen: true, id, message });
  };

  const handleDeleteConfirm = async () => {
    if (deleteModal.id) {
      try {
        await deleteFAT(deleteModal.id);
        setDeleteModal({ isOpen: false, id: null, message: '' });
      } catch (_) { // eslint-disable-line @typescript-eslint/no-unused-vars
        // Error handled in context
      }
    }
  };

  const chips: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: t('common.all') || 'All', count: statistics.total },
    { id: 'scheduled', label: t('fat.status.scheduled') || 'Scheduled', count: statusCounts.scheduled },
    { id: 'inProgress', label: t('fat.status.inProgress') || 'In Progress', count: statusCounts.inProgress },
    { id: 'completed', label: t('fat.status.completed') || 'Completed', count: statusCounts.completed },
    { id: 'cancelled', label: t('fat.status.cancelled') || 'Cancelled', count: statusCounts.cancelled },
  ];

  const summary = [
    {
      key: 'total',
      label: t('fat.stats.total'),
      value: statistics.total,
      icon: <BarChart3 size={18} strokeWidth={1.8} />,
      accent: '#8a6a3a',
    },
    {
      key: 'withDetails',
      label: t('fat.stats.withDetails'),
      value: statistics.withDetails,
      icon: <FileCheck size={18} strokeWidth={1.8} />,
      accent: '#7a8f5a',
    },
    {
      key: 'detailsRate',
      label: t('fat.stats.detailsRate'),
      value: `${statistics.detailsRate}%`,
      icon: <TrendingUp size={18} strokeWidth={1.8} />,
      accent: '#b8945a',
    },
  ];

  return (
    <div className={shellStyles.container}>
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
              placeholder={t('fat.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {hasPermission('fat:create:all') && (
            <button type="button" className={shellStyles.addNewButton} onClick={handleAddNew}>
              {t('fat.addNew')}
            </button>
          )}
        </div>
      </div>

      <div className={shellStyles.content}>
        <DataTable
          columns={createColumns(handleAddDetails, handleDeleteClick, t, getActiveContractors(), (id) => deriveFATResult(fatDetails[id]))}
          data={filteredFatList}
          searchKey=""
          getRowClassName={(row) =>
            (row.status || '').toLowerCase() === 'cancelled' ? shellStyles.rowDim : ''
          }
          getRowId={(row) => row.id}
          onRowClick={(row) => handleEdit(row.id)}
        />
      </div>

      {isEditModalOpen && (
        <FATEditModal
          fatId={currentFatId || 'new'}
          existingItem={currentFatId ? fatList.find(item => item.id === currentFatId) : undefined}
          onSave={handleSaveFATDetails}
          onClose={() => {
            setIsEditModalOpen(false);
            setCurrentFatId(null);
          }}
          readOnly={!canEdit}
        />
      )}

      {isDetailsEditModalOpen && currentFatId && (
        <FATDetailModal
          fatId={currentFatId}
          details={fatDetails[currentFatId] || []}
          onSave={handleSaveDetails}
          onClose={() => {
            setIsDetailsEditModalOpen(false);
            setCurrentFatId(null);
          }}
          readOnly={!canEdit}
        />
      )}

      {isDetailsModalOpen && viewingFatId && (
        <FATDetailsViewModal
          fatId={viewingFatId}
          fatItem={fatList.find(item => item.id === viewingFatId)}
          fatDetails={fatDetails[viewingFatId] || []}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setViewingFatId(null);
          }}
        />
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={t('common.confirmDeleteTitle')}
        message={deleteModal.message || t('fat.confirmDelete')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteModal({ isOpen: false, id: null, message: '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />
    </div>
  );
};

interface FATDetailModalProps {
  fatId: string;
  details: FATDetailItem[];
  onSave: (details: FATDetailItem[]) => void;
  onClose: () => void;
  readOnly?: boolean;
}

const FATDetailModal: React.FC<FATDetailModalProps> = ({ fatId, details, onSave, onClose, readOnly = false }) => {
  const { t } = useLanguage();
  const [detailList, setDetailList] = useState<FATDetailItem[]>(details.length > 0 ? details : [{
    id: '1',
    sNo: '1',
    itemName: '',
    specification: '',
    qty: '',
    unit: '',
    acceptanceCriteria: '',
    fatActualValue: '',
    fatJudgment: '',
    remarks: '',
  }]);

  const handleAddRow = () => {
    const newId = `${fatId}-${Date.now()}`;
    const newSNo = String(detailList.length + 1);
    setDetailList([
      ...detailList,
      {
        id: newId,
        sNo: newSNo,
        itemName: '',
        specification: '',
        qty: '',
        unit: '',
        acceptanceCriteria: '',
        fatActualValue: '',
        fatJudgment: '',
        remarks: '',
      },
    ]);
  };

  const handleDeleteRow = (id: string) => {
    if (detailList.length <= 1) {
      return;
    }
    const newList = detailList.filter(item => item.id !== id);
    // 重新編號
    const renumberedList = newList.map((item, index) => ({
      ...item,
      sNo: String(index + 1),
    }));
    setDetailList(renumberedList);
  };

  const handleFieldChange = (id: string, field: keyof FATDetailItem, value: string) => {
    setDetailList(prevList =>
      prevList.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const handleSave = async () => {
    try {
      await onSave(detailList);
      onClose();
    } catch (err) {
      toast.error((err as Error)?.message || 'Save failed');
    }
  };

  return (
    <div className={formStyles.modalOverlay}>
      <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={formStyles.modalHeader}>
          <h2>{t('fat.detailModalTitle')}</h2>
          <button className={formStyles.closeButton} onClick={onClose}>×</button>
        </div>
        <div className={formStyles.modalBody}>
        <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }}>
          {(() => {
            const r = deriveFATResult(detailList);
            const color = r === 'Pass' ? '#15803d' : r === 'Fail' ? '#b91c1c' : '#a16207';
            const label = ({ Pass: t('fat.result.pass'), Fail: t('fat.result.fail'), Pending: t('fat.result.pending') } as Record<string, string>)[r] || r;
            return (
              <div style={{ marginBottom: 10, fontSize: 13 }}>
                {t('fat.overallResult') || 'Overall Result'}：
                <span style={{ color, fontWeight: 700 }}>{label}</span>
                <span style={{ color: '#6b7280', marginLeft: 8, fontSize: 11 }}>（由各項判定自動計算 / auto from item judgments）</span>
              </div>
            );
          })()}
          <div className={styles.tableContainer}>
            <table className={styles.detailTable}>
              <thead>
                <tr>
                  <th>{t('fat.colSNo')}<br />({t('fat.colSNo')})</th>
                  <th>{t('fat.colItemName')}<br />(Item Name)</th>
                  <th>{t('fat.colSpecification')}<br />(Specification)</th>
                  <th>{t('fat.colQty')}<br />(Qty)</th>
                  <th>{t('fat.colUnit')}<br />(Unit)</th>
                  <th>{t('fat.colAcceptanceCriteria')}<br />(Acceptance Criteria)</th>
                  <th>{t('fat.colActualValue')}<br />(FAT Actual Measured Value)</th>
                  <th>{t('fat.colJudgment')}<br />(FAT Judgment)</th>
                  <th>{t('fat.colRemarks')}<br />(Remarks)</th>
                  <th>{t('fat.colOperation')}<br />(Operation)</th>
                </tr>
              </thead>
              <tbody>
                {detailList.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        type="text"
                        className={styles.detailInput}
                        value={item.sNo}
                        onChange={(e) => handleFieldChange(item.id, 'sNo', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className={styles.detailInput}
                        value={item.itemName}
                        onChange={(e) => handleFieldChange(item.id, 'itemName', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className={styles.detailInput}
                        value={item.specification}
                        onChange={(e) => handleFieldChange(item.id, 'specification', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className={styles.detailInput}
                        value={item.qty}
                        onChange={(e) => handleFieldChange(item.id, 'qty', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className={styles.detailInput}
                        value={item.unit}
                        onChange={(e) => handleFieldChange(item.id, 'unit', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className={styles.detailInput}
                        value={item.acceptanceCriteria}
                        onChange={(e) => handleFieldChange(item.id, 'acceptanceCriteria', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className={styles.detailInput}
                        value={item.fatActualValue}
                        onChange={(e) => handleFieldChange(item.id, 'fatActualValue', e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className={styles.detailSelect}
                        value={item.fatJudgment}
                        onChange={(e) => handleFieldChange(item.id, 'fatJudgment', e.target.value)}
                      >
                        <option value="">{t('common.selectPlaceholder')}</option>
                        <option value="Pass">Pass</option>
                        <option value="Fail">Fail</option>
                        <option value="Pending">Pending</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        className={styles.detailInput}
                        value={item.remarks}
                        onChange={(e) => handleFieldChange(item.id, 'remarks', e.target.value)}
                      />
                    </td>
                    <td>
                      <button
                        className={styles.deleteRowButton}
                        onClick={() => handleDeleteRow(item.id)}
                        disabled={detailList.length <= 1}
                      >
                        {t('common.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readOnly && (
            <div className={formStyles.modalActions}>
              <button className={styles.addRowButton} onClick={handleAddRow}>
                {t('fat.addRow')}
              </button>
            </div>
          )}
        </fieldset>
          <div className={formStyles.modalActions}>
            {!readOnly && (
              <button className={formStyles.saveButton} onClick={handleSave}>
                {t('common.save')}
              </button>
            )}
            <button className={formStyles.cancelButton} onClick={onClose}>
              {readOnly ? t('common.close') : t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface FATEditModalProps {
  fatId: string;
  existingItem?: FATItem;
  onSave: (updates: Partial<FATItem>) => void;
  onClose: () => void;
  readOnly?: boolean;
}
const FATEditModal: React.FC<FATEditModalProps> = ({ fatId: _fatId, existingItem, onSave, onClose, readOnly = false }) => {
  const { t } = useLanguage();
  const { getActiveContractors } = useContractorsStore();
  const [formData, setFormData] = useState<Partial<FATItem>>({
    equipment: existingItem?.equipment || '',
    supplier: existingItem?.supplier || '',
    procedure: existingItem?.procedure || '',
    location: existingItem?.location || '',
    startDate: existingItem?.startDate || '',
    endDate: existingItem?.endDate || '',
    deliveryFrom: existingItem?.deliveryFrom || '',
    deliveryTo: existingItem?.deliveryTo || '',
    siteReadiness: existingItem?.siteReadiness || '',
    moveInDate: existingItem?.moveInDate || '',
    status: existingItem?.status || 'Scheduled',
  });

  const handleFieldChange = (field: keyof FATItem, value: string) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'startDate' || field === 'endDate') {
        const check = checkDateOrder(updated.startDate, updated.endDate, t('fat.startDate') || 'Start Date', t('fat.endDate') || 'End Date');
        if (!check.valid) toast.warning(check.message);
      }
      if (field === 'endDate' || field === 'moveInDate') {
        const check = checkDateOrder(updated.endDate, updated.moveInDate, t('fat.endDate') || 'End Date', t('fat.moveInDate') || 'Move-in Date');
        if (!check.valid) toast.warning(check.message);
      }
      return updated;
    });
  };

  const handleSave = async () => {
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      toast.error((err as Error)?.message || 'Save failed');
    }
  };

  return (
    <div className={formStyles.modalOverlay}>
      <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={formStyles.modalHeader}>
          <h2>{existingItem ? t('fat.editTitle') : t('fat.addTitle')}</h2>
          <button className={formStyles.closeButton} onClick={onClose}>×</button>
        </div>
        <div className={formStyles.modalBody}>
        <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }}>
          <div className={formStyles.formSections}>
            <div className={formStyles.formSection}>
              <h3 className={formStyles.sectionTitle}>{t('fat.sectionInfo')}</h3>
              <div className={formStyles.formGrid}>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.equipment')}</label>
                  <input
                    type="text"
                    className={formStyles.formInput}
                    value={formData.equipment || ''}
                    onChange={(e) => handleFieldChange('equipment', e.target.value)}
                  />
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.supplier')}</label>
                  <select
                    className={formStyles.formSelect}
                    value={formData.supplier || ''}
                    onChange={(e) => handleFieldChange('supplier', e.target.value)}
                  >
                    <option value="">{t('common.selectContractor')}</option>
                    {getActiveContractors().map((contractor) => (
                      <option key={contractor.id} value={contractor.name}>
                        {contractor.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.procedure')}</label>
                  <input
                    type="text"
                    className={formStyles.formInput}
                    value={formData.procedure || ''}
                    onChange={(e) => handleFieldChange('procedure', e.target.value)}
                  />
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.location')}</label>
                  <input
                    type="text"
                    className={formStyles.formInput}
                    value={formData.location || ''}
                    onChange={(e) => handleFieldChange('location', e.target.value)}
                  />
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.startDate')}</label>
                  <input
                    type={formData.startDate ? 'date' : 'text'}
                    placeholder="mm/dd/yyyy"
                    lang="en"
                    onFocus={(e) => (e.target.type = 'date')}
                    onBlur={(e) => {
                      if (!e.target.value) e.target.type = 'text';
                    }}
                    className={formStyles.formInput}
                    value={formData.startDate || ''}
                    onChange={(e) => handleFieldChange('startDate', e.target.value)}
                  />
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.endDate')}</label>
                  <input
                    type={formData.endDate ? 'date' : 'text'}
                    placeholder="mm/dd/yyyy"
                    lang="en"
                    onFocus={(e) => (e.target.type = 'date')}
                    onBlur={(e) => {
                      if (!e.target.value) e.target.type = 'text';
                    }}
                    className={formStyles.formInput}
                    value={formData.endDate || ''}
                    onChange={(e) => handleFieldChange('endDate', e.target.value)}
                  />
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.deliveryFrom')}</label>
                  <input
                    type="text"
                    className={formStyles.formInput}
                    value={formData.deliveryFrom || ''}
                    onChange={(e) => handleFieldChange('deliveryFrom', e.target.value)}
                  />
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.deliveryTo')}</label>
                  <input
                    type="text"
                    className={formStyles.formInput}
                    value={formData.deliveryTo || ''}
                    onChange={(e) => handleFieldChange('deliveryTo', e.target.value)}
                  />
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.siteReadiness')}</label>
                  <input
                    type="text"
                    className={formStyles.formInput}
                    value={formData.siteReadiness || ''}
                    onChange={(e) => handleFieldChange('siteReadiness', e.target.value)}
                  />
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.moveInDate')}</label>
                  <input
                    type={formData.moveInDate ? 'date' : 'text'}
                    placeholder="mm/dd/yyyy"
                    lang="en"
                    onFocus={(e) => (e.target.type = 'date')}
                    onBlur={(e) => {
                      if (!e.target.value) e.target.type = 'text';
                    }}
                    className={formStyles.formInput}
                    value={formData.moveInDate || ''}
                    onChange={(e) => handleFieldChange('moveInDate', e.target.value)}
                  />
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('common.status')}</label>
                  <select
                    className={formStyles.formSelect}
                    value={formData.status || 'Scheduled'}
                    onChange={(e) => handleFieldChange('status', e.target.value)}
                  >
                    <option value="Scheduled">{t('fat.status.scheduled')}</option>
                    <option value="In Progress">{t('fat.status.inProgress')}</option>
                    <option value="Completed">{t('fat.status.completed')}</option>
                    <option value="Cancelled">{t('fat.status.cancelled')}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </fieldset>
        </div>
        <div className={formStyles.modalActions}>
          {!readOnly && (
            <button className={formStyles.saveButton} onClick={handleSave}>
              {t('common.save')}
            </button>
          )}
          <button className={formStyles.cancelButton} onClick={onClose}>
            {readOnly ? t('common.close') : t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

interface FATDetailsViewModalProps {
  fatId: string;
  fatItem?: FATItem;
  fatDetails: FATDetailItem[];
  onClose: () => void;
}
const FATDetailsViewModal: React.FC<FATDetailsViewModalProps> = ({ fatId: _fatId, fatItem, fatDetails, onClose }) => {
  const { t } = useLanguage();
  const [isPrinting, setIsPrinting] = useState(false);
  useEffect(() => {
    if (!isPrinting) return;
    const timer = setTimeout(() => window.print(), 200);
    const onAfterPrint = () => setIsPrinting(false);
    window.addEventListener('afterprint', onAfterPrint);
    return () => { clearTimeout(timer); window.removeEventListener('afterprint', onAfterPrint); };
  }, [isPrinting]);

  if (!fatItem) {
    return null;
  }
  const overallResult = deriveFATResult(fatDetails);
  const resultColor = overallResult === 'Pass' ? '#15803d' : overallResult === 'Fail' ? '#b91c1c' : '#a16207';
  const resultLabel = ({ Pass: t('fat.result.pass'), Fail: t('fat.result.fail'), Pending: t('fat.result.pending') } as Record<string, string>)[overallResult] || overallResult;

  return (
    <div className={formStyles.modalOverlay}>
      <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={formStyles.modalHeader}>
          <h2>{t('fat.detailsTitle')}</h2>
          <button className={formStyles.closeButton} onClick={onClose}>×</button>
        </div>
        <div className={formStyles.modalBody}>
          <div className={formStyles.formSections}>
            <div className={formStyles.formSection}>
              <h3 className={formStyles.sectionTitle}>{t('fat.sectionBaseInfo')}</h3>
              <div className={formStyles.formGrid}>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.overallResult') || 'Overall Result'}</label>
                  <div className={formStyles.readOnlyField} style={{ color: resultColor, fontWeight: 700 }}>{resultLabel}</div>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.equipment')}</label>
                  <div className={formStyles.readOnlyField}>{fatItem.equipment || '-'}</div>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.supplier')}</label>
                  <div className={formStyles.readOnlyField}>{fatItem.supplier || '-'}</div>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.procedure')}</label>
                  <div className={formStyles.readOnlyField}>{fatItem.procedure || '-'}</div>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.location')}</label>
                  <div className={formStyles.readOnlyField}>{fatItem.location || '-'}</div>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.startDate')}</label>
                  <div className={formStyles.readOnlyField}>{fatItem.startDate || '-'}</div>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.endDate')}</label>
                  <div className={formStyles.readOnlyField}>{fatItem.endDate || '-'}</div>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.deliveryFrom')}</label>
                  <div className={formStyles.readOnlyField}>{fatItem.deliveryFrom || '-'}</div>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.deliveryTo')}</label>
                  <div className={formStyles.readOnlyField}>{fatItem.deliveryTo || '-'}</div>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.siteReadiness')}</label>
                  <div className={formStyles.readOnlyField}>{fatItem.siteReadiness || '-'}</div>
                </div>
                <div className={formStyles.formGroup}>
                  <label>{t('fat.moveInDate')}</label>
                  <div className={formStyles.readOnlyField}>{fatItem.moveInDate || '-'}</div>
                </div>
              </div>
            </div>

            {fatDetails.length > 0 && (
              <div className={formStyles.formSection}>
                <h3 className={formStyles.sectionTitle}>{t('fat.sectionDetails')}</h3>
                <table className={styles.detailTable}>
                  <thead>
                    <tr>
                      <th>{t('fat.colSNo')}</th>
                      <th>{t('fat.colItemName')}</th>
                      <th>{t('fat.colSpecification')}</th>
                      <th>{t('fat.colQty')}</th>
                      <th>{t('fat.colUnit')}</th>
                      <th>{t('fat.colAcceptanceCriteria')}</th>
                      <th>{t('fat.colActualValue')}</th>
                      <th>{t('fat.colJudgment')}</th>
                      <th>{t('fat.colRemarks')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fatDetails.map((detail) => (
                      <tr key={detail.id}>
                        <td>{detail.sNo}</td>
                        <td>{detail.itemName}</td>
                        <td>{detail.specification}</td>
                        <td>{detail.qty}</td>
                        <td>{detail.unit}</td>
                        <td>{detail.acceptanceCriteria}</td>
                        <td>{detail.fatActualValue}</td>
                        <td>{detail.fatJudgment}</td>
                        <td>{detail.remarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div className={formStyles.modalActions}>
          <button className={formStyles.printButton} onClick={() => setIsPrinting(true)}>
            {t('common.print')}
          </button>
          <button className={formStyles.cancelButton} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
      {isPrinting && ReactDOM.createPortal(
        <FATPrintTemplate fat={fatItem} details={fatDetails} result={overallResult} />,
        document.body
      )}
    </div>
  );
};

export default FAT;
