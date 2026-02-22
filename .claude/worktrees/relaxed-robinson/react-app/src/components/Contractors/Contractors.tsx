import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useContractors, Contractor } from '../../context/ContractorsContext';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './Contractors.module.css';

import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';

import { BackButton } from '@/components/ui/BackButton';

const Contractors: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { contractors, addContractor, updateContractor, deleteContractor } = useContractors();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
    isOpen: false,
    id: null,
    message: '',
  });
  const [formData, setFormData] = useState({
    package: '',
    name: '',
    abbreviation: '',
    scope: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    status: 'active' as 'active' | 'inactive',
  });

  const filteredContractors = React.useMemo(() => {
    if (!searchQuery.trim()) return contractors;
    const query = searchQuery.toLowerCase();
    return contractors.filter(item =>
      (item.name && item.name.toLowerCase().includes(query)) ||
      (item.package && item.package.toLowerCase().includes(query)) ||
      (item.abbreviation && item.abbreviation.toLowerCase().includes(query)) ||
      (item.scope && item.scope.toLowerCase().includes(query)) ||
      (item.contactPerson && item.contactPerson.toLowerCase().includes(query)) ||
      (item.email && item.email.toLowerCase().includes(query)) ||
      (item.phone && item.phone.toLowerCase().includes(query))
    );
  }, [contractors, searchQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await updateContractor(editingId, formData);
    } else {
      await addContractor(formData);
    }
    setIsModalOpen(false);
    resetForm();
  };

  const handleEdit = (contractor: Contractor) => {
    setEditingId(contractor.id);
    setFormData({
      package: contractor.package || '',
      name: contractor.name,
      abbreviation: contractor.abbreviation || '',
      scope: contractor.scope,
      contactPerson: contractor.contactPerson,
      email: contractor.email,
      phone: contractor.phone,
      address: contractor.address,
      status: contractor.status,
    });
    setIsModalOpen(true);
  };

  const handleDeleteClick = (id: string) => { // Changed to string
    setDeleteModal({ isOpen: true, id, message: t('contractors.confirmDelete') });
  };

  const handleDeleteConfirm = async () => {
    if (deleteModal.id) {
      await deleteContractor(deleteModal.id);
      setDeleteModal({ isOpen: false, id: null, message: '' });
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      package: '',
      name: '',
      abbreviation: '',
      scope: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      status: 'active',
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BackButton />
          <h1>{t('contractors.title')}</h1>
        </div>
        <div className={styles.headerRight}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('common.search') || 'Search...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      <div className={styles.content}>
        <DataTable
          title={t('contractors.title')}
          actions={
            <button className={styles.addNewButton} onClick={() => { resetForm(); setIsModalOpen(true); }}>
              {t('contractors.addContractor')}
            </button>
          }
          columns={createColumns(handleEdit, handleDeleteClick, t)}
          data={filteredContractors}
          searchKey=""
          getRowId={(row) => row.id.toString()} // Convert number to string for DataTable row ID if needed
        />
      </div>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={t('common.confirmDeleteTitle')}
        message={deleteModal.message || t('contractors.confirmDelete')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteModal({ isOpen: false, id: null, message: '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />

      {
        isModalOpen && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <h2>{editingId ? t('contractors.editContractor') : t('contractors.addContractor')}</h2>
              <form onSubmit={handleSubmit}>
                <div className={styles.formGroup}>
                  <label>{t('contractors.package')}</label>
                  <input
                    type="text"
                    value={formData.package}
                    onChange={(e) => setFormData({ ...formData, package: e.target.value })}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('contractors.name')}</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('contractors.abbreviation')}</label>
                  <input
                    type="text"
                    value={formData.abbreviation}
                    onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('contractors.scope')}</label>
                  <input
                    type="text"
                    value={formData.scope}
                    onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('contractors.contactPerson')}</label>
                  <input
                    type="text"
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('contractors.email')}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('contractors.phone')}</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('contractors.address')}</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>{t('contractors.status')}</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                  >
                    <option value="active">{t('contractors.status.active')}</option>
                    <option value="inactive">{t('contractors.status.inactive')}</option>
                  </select>
                </div>
                <div className={styles.formActions}>
                  <button type="submit" className={styles.submitButton}>
                    {editingId ? t('common.save') : t('common.add')}
                  </button>
                  <button type="button" className={styles.cancelButton} onClick={() => { setIsModalOpen(false); resetForm(); }}>
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default Contractors;
