import React, { useState, useEffect } from 'react';
import styles from './ContractorModal.module.css';

interface ContractorModalProps {
  existingId: string | null;
  initialData: {
    package: string;
    name: string;
    abbreviation: string;
    scope: string;
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    status: 'active' | 'inactive';
  };
  onSave: (id: string | null, data: any) => Promise<void>;
  onClose: () => void;
  t: (key: string) => string;
}

const ContractorModal: React.FC<ContractorModalProps> = ({ existingId, initialData, onSave, onClose, t }) => {
  const [formData, setFormData] = useState(initialData);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    setFormData(initialData);
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(existingId, formData);
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 250);
  };

  return (
    <div className={`${styles.modalOverlay} ${isClosing ? styles.closing : ''}`} onMouseDown={handleClose}>
      <div 
        className={`${styles.modalContent} ${isClosing ? styles.closingCard : ''}`} 
        onMouseDown={e => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2>{existingId ? t('contractors.editContractor') : t('contractors.addContractor')}</h2>
          <button type="button" className={styles.closeIconBtn} onClick={handleClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>{t('contractors.package')} <span className={styles.required}>*</span></label>
              <input type="text" value={formData.package} onChange={e => setFormData({ ...formData, package: e.target.value })} required />
            </div>
            <div className={styles.formGroup}>
              <label>{t('contractors.name')} <span className={styles.required}>*</span></label>
              <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            </div>
          </div>
          
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>{t('contractors.abbreviation')} <span className={styles.required}>*</span></label>
              <input type="text" value={formData.abbreviation} onChange={e => setFormData({ ...formData, abbreviation: e.target.value })} required />
            </div>
            <div className={styles.formGroup}>
              <label>{t('contractors.scope')} <span className={styles.required}>*</span></label>
              <input type="text" value={formData.scope} onChange={e => setFormData({ ...formData, scope: e.target.value })} required />
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>{t('contractors.contactPerson')} <span className={styles.required}>*</span></label>
              <input type="text" value={formData.contactPerson} onChange={e => setFormData({ ...formData, contactPerson: e.target.value })} required />
            </div>
            <div className={styles.formGroup}>
              <label>{t('contractors.email')} <span className={styles.required}>*</span></label>
              <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} required />
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>{t('contractors.phone')} <span className={styles.required}>*</span></label>
              <input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} required />
            </div>
            <div className={styles.formGroup}>
              <label>{t('contractors.status')}</label>
              <div className={styles.selectWrapper}>
                <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}>
                  <option value="active">{t('contractors.status.active')}</option>
                  <option value="inactive">{t('contractors.status.inactive')}</option>
                </select>
                <div className={styles.selectArrow}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
              </div>
            </div>
          </div>

          <div className={`${styles.formGroup} ${styles.fullWidth}`}>
            <label>{t('contractors.address')} <span className={styles.required}>*</span></label>
            <textarea value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} required rows={2} />
          </div>

          <div className={styles.formActions}>
            <button type="button" className={styles.cancelButton} onClick={handleClose}>{t('common.cancel')}</button>
            <button type="submit" className={styles.submitButton}>{existingId ? t('common.save') : t('common.add')}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ContractorModal;
