import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { checkFATReferences, generateDeleteMessage } from '../../utils/cascadeDelete';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { useFATStore } from '../../store/fatStore';
import type { FATItem, FATDetailItem } from '../../store/fatStore';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './FAT.module.css';
import { BackButton } from '@/components/ui/BackButton';

// ... (keep constants and interfaces that are NOT FATItem if any, or move them)
// FATDetailItem is used in FAT.tsx. Keep it.



const FAT: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { getActiveContractors } = useContractorsStore();
  const { fatList, loading, addFAT, updateFAT, deleteFAT, saveFATDetails, fatDetails } = useFATStore();
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Vendor filter removed (handled by DataTable)

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

  // Only handle Global Search here. Column filters are handled by DataTable.
  const filteredFatList = useMemo(() => {
    let filtered = fatList;

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
  }, [fatList, searchQuery]);

  const statistics = useMemo(() => {
    const total = fatList.length;
    const withDetails = fatList.filter(item => item.hasDetails).length;
    const detailsRate = total > 0 ? Math.round((withDetails / total) * 100) : 0;

    return {
      total,
      withDetails,
      detailsRate,
    };
  }, [fatList]);

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
          hasDetails: false,
        } as any; // safe cast for omit id
        await addFAT(newItem);
      }
      setIsEditModalOpen(false);
      setCurrentFatId(null);
    } catch (e) {
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
      } catch (e) {
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
      } catch (e) {
        // Error handled in context
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BackButton />
          <h1>{t('fat.title') || t('home.fat.description') || 'FAT'}</h1>
        </div>
        <div className={styles.headerRight}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('fat.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.summarySection}>
        <h2 className={styles.summaryTitle}>{t('fat.statsTitle') || '統計'}</h2>
        <div className={styles.statsContainer}>
          <div className={styles.statusStatsGrid}>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.grayIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M18 17V9M12 17V5M6 17v-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('fat.stats.total')}</div>
                <div className={styles.statValue}>{statistics.total}</div>
              </div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.blueIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('fat.stats.withDetails')}</div>
                <div className={styles.statValue}>{statistics.withDetails}</div>
              </div>
            </div>
            <div className={styles.statItem}>
              <div className={`${styles.statIcon} ${styles.blueIcon}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>{t('fat.stats.detailsRate')}</div>
                <div className={styles.statValue}>{statistics.detailsRate}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        <DataTable
          title={t('fat.listTitle')}
          actions={
            <button
              className={styles.addNewButton}
              onClick={handleAddNew}
            >
              {t('fat.addNew')}
            </button>
          }
          columns={createColumns(handleEdit, handleAddDetails, handleDeleteClick, t, getActiveContractors())}
          data={filteredFatList}
          searchKey=""
          searchPlaceholder={t('fat.searchPlaceholder')}
          getRowId={(row) => row.id}
          onRowClick={(row) => handleEdit(row.id)}
        />
      </div>

      {isEditModalOpen && currentFatId && (
        <FATEditModal
          fatId={currentFatId}
          existingItem={fatList.find(item => item.id === currentFatId)}
          onSave={handleSaveFATDetails}
          onClose={() => {
            setIsEditModalOpen(false);
            setCurrentFatId(null);
          }}
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
}

const FATDetailModal: React.FC<FATDetailModalProps> = ({ fatId, details, onSave, onClose }) => {
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

  const handleSave = () => {
    onSave(detailList);
    onClose();
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{t('fat.detailModalTitle')}</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        <div className={styles.modalBody}>
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
          <div className={styles.modalActions}>
            <button className={styles.addRowButton} onClick={handleAddRow}>
              {t('fat.addRow')}
            </button>
            <div className={styles.actionButtons}>
              <button className={styles.saveButton} onClick={handleSave}>
                {t('common.save')}
              </button>
              <button className={styles.cancelButton} onClick={onClose}>
                {t('common.cancel')}
              </button>
            </div>
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
}

const FATEditModal: React.FC<FATEditModalProps> = ({ fatId, existingItem, onSave, onClose }) => {
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
  });

  const handleFieldChange = (field: keyof FATItem, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{existingItem ? t('fat.editTitle') : t('fat.addTitle')}</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formSections}>
            <div className={styles.formSection}>
              <h3 className={styles.sectionTitle}>{t('fat.sectionInfo')}</h3>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>{t('fat.equipment')}</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.equipment || ''}
                    onChange={(e) => handleFieldChange('equipment', e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.supplier')}</label>
                  <select
                    className={styles.formSelect}
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
                <div className={styles.formGroup}>
                  <label>{t('fat.procedure')}</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.procedure || ''}
                    onChange={(e) => handleFieldChange('procedure', e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.location')}</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.location || ''}
                    onChange={(e) => handleFieldChange('location', e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.startDate')}</label>
                  <input
                    type={formData.startDate ? 'date' : 'text'}
                    placeholder="mm/dd/yyyy"
                    lang="en"
                    onFocus={(e) => (e.target.type = 'date')}
                    onBlur={(e) => {
                      if (!e.target.value) e.target.type = 'text';
                    }}
                    className={styles.formInput}
                    value={formData.startDate || ''}
                    onChange={(e) => handleFieldChange('startDate', e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.endDate')}</label>
                  <input
                    type={formData.endDate ? 'date' : 'text'}
                    placeholder="mm/dd/yyyy"
                    lang="en"
                    onFocus={(e) => (e.target.type = 'date')}
                    onBlur={(e) => {
                      if (!e.target.value) e.target.type = 'text';
                    }}
                    className={styles.formInput}
                    value={formData.endDate || ''}
                    onChange={(e) => handleFieldChange('endDate', e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.deliveryFrom')}</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.deliveryFrom || ''}
                    onChange={(e) => handleFieldChange('deliveryFrom', e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.deliveryTo')}</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.deliveryTo || ''}
                    onChange={(e) => handleFieldChange('deliveryTo', e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.siteReadiness')}</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.siteReadiness || ''}
                    onChange={(e) => handleFieldChange('siteReadiness', e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.moveInDate')}</label>
                  <input
                    type={formData.moveInDate ? 'date' : 'text'}
                    placeholder="mm/dd/yyyy"
                    lang="en"
                    onFocus={(e) => (e.target.type = 'date')}
                    onBlur={(e) => {
                      if (!e.target.value) e.target.type = 'text';
                    }}
                    className={styles.formInput}
                    value={formData.moveInDate || ''}
                    onChange={(e) => handleFieldChange('moveInDate', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.modalActions}>
          <button className={styles.saveButton} onClick={handleSave}>
            {t('common.save')}
          </button>
          <button className={styles.cancelButton} onClick={onClose}>
            {t('common.cancel')}
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

const FATDetailsViewModal: React.FC<FATDetailsViewModalProps> = ({ fatId, fatItem, fatDetails, onClose }) => {
  const { t } = useLanguage();
  const handlePrint = () => {
    window.print();
  };

  if (!fatItem) {
    return null;
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{t('fat.detailsTitle')}</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formSections}>
            <div className={styles.formSection}>
              <h3 className={styles.sectionTitle}>{t('fat.sectionBaseInfo')}</h3>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>{t('fat.equipment')}</label>
                  <div className={styles.readOnlyField}>{fatItem.equipment || '-'}</div>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.supplier')}</label>
                  <div className={styles.readOnlyField}>{fatItem.supplier || '-'}</div>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.procedure')}</label>
                  <div className={styles.readOnlyField}>{fatItem.procedure || '-'}</div>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.location')}</label>
                  <div className={styles.readOnlyField}>{fatItem.location || '-'}</div>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.startDate')}</label>
                  <div className={styles.readOnlyField}>{fatItem.startDate || '-'}</div>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.endDate')}</label>
                  <div className={styles.readOnlyField}>{fatItem.endDate || '-'}</div>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.deliveryFrom')}</label>
                  <div className={styles.readOnlyField}>{fatItem.deliveryFrom || '-'}</div>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.deliveryTo')}</label>
                  <div className={styles.readOnlyField}>{fatItem.deliveryTo || '-'}</div>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.siteReadiness')}</label>
                  <div className={styles.readOnlyField}>{fatItem.siteReadiness || '-'}</div>
                </div>
                <div className={styles.formGroup}>
                  <label>{t('fat.moveInDate')}</label>
                  <div className={styles.readOnlyField}>{fatItem.moveInDate || '-'}</div>
                </div>
              </div>
            </div>

            {fatDetails.length > 0 && (
              <div className={styles.formSection}>
                <h3 className={styles.sectionTitle}>{t('fat.sectionDetails')}</h3>
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
        <div className={styles.modalActions}>
          <button className={styles.printButton} onClick={handlePrint}>
            {t('common.print')}
          </button>
          <button className={styles.cancelButton} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FAT;
