import React from 'react';
import styles from './ConfirmModal.module.css';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Delete',
  cancelText = 'Cancel',
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{title}</h2>
          <button className={styles.cancelButton} onClick={onCancel} style={{ border: 'none', background: 'transparent', padding: 0, fontSize: '1.5rem', lineHeight: 1 }}>×</button>
        </div>
        <div className={styles.modalBody}>
          {message}
        </div>
        <div className={styles.modalActions}>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
            {cancelText}
          </button>
          <button type="button" className={styles.confirmButton} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
