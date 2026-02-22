import React, { useState } from 'react';
import styles from './IAM.module.css';

interface DeleteAuditModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: (reason: string) => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
}

const DeleteAuditModal: React.FC<DeleteAuditModalProps> = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = 'Delete',
    cancelText = 'Cancel',
}) => {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (reason.length < 5) {
            setError('Please provide a reason (min 5 characters)');
            return;
        }
        onConfirm(reason);
        setReason('');
        setError('');
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} style={{ maxWidth: '400px' }}>
                <div className={styles.modalHeader}>
                    <h2>{title}</h2>
                </div>
                <div className={styles.modalBody}>
                    <p>{message}</p>
                    <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
                        <label style={{ fontWeight: 600 }}>Audit Reason <span style={{ color: 'red' }}>*</span></label>
                        <textarea
                            className={styles.textarea}
                            value={reason}
                            onChange={(e) => {
                                setReason(e.target.value);
                                if (e.target.value.length >= 5) setError('');
                            }}
                            placeholder="Why are you deleting this? (required for audit)"
                            rows={3}
                            style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem' }}
                        />
                        {error && <span style={{ color: 'red', fontSize: '12px' }}>{error}</span>}
                    </div>
                </div>
                <div className={styles.formActions} style={{ marginTop: '1.5rem' }}>
                    <button type="button" className={styles.saveButton} onClick={handleConfirm} style={{ backgroundColor: '#ef4444' }}>
                        {confirmText}
                    </button>
                    <button type="button" className={styles.cancelButton} onClick={onCancel}>
                        {cancelText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteAuditModal;
