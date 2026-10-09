import FormActions from './FormActions';
import actionStyles from './FormActions.module.css';
import React from 'react';
import styles from './ConfirmModal.module.css';
import { useLanguage } from '../../context/LanguageContext';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  intent?: 'primary' | 'danger';
  pending?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  intent = 'danger',
  pending = false,
}) => {
  const { t } = useLanguage();
  const resolvedConfirmText = confirmText ?? t('common.delete');
  const resolvedCancelText = cancelText ?? t('common.cancel');
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={pending ? undefined : onCancel}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{title}</h2>
          <button disabled={pending} className={styles.cancelButton} onClick={pending ? undefined : onCancel} style={{ border: 'none', background: 'transparent', padding: 0, fontSize: '1.5rem', lineHeight: 1 }}>×</button>
        </div>
        <div className={styles.modalBody}>
          {message}
        </div>
              <FormActions
                  cancel={<>
                      <button className={actionStyles.secondary} disabled={pending} type="button" onClick={pending ? undefined : onCancel}>
                          {resolvedCancelText}
                      </button>
                  </>}
                  primary={<>
                      <button className={intent === 'primary' ? actionStyles.primary : actionStyles.danger} type="button" disabled={pending} onClick={onConfirm}>
                          {resolvedConfirmText}
                      </button>
                  </>}
              />
      </div>
    </div>
  );
};

export default ConfirmModal;
