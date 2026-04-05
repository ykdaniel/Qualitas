import React, { useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import styles from './BatchActionBar.module.css';

interface BatchActionBarProps {
    selectedCount: number;
    onDelete?: () => void;
    onStatusChange?: (newStatus: string) => void;
    onClearSelection: () => void;
    statusOptions?: { value: string; label: string }[];
    deleteLabel?: string;
    showStatusChange?: boolean;
}

/**
 * 批次操作工具列元件
 * 當選取多個項目時顯示，提供批次刪除和狀態變更功能
 */
const BatchActionBar: React.FC<BatchActionBarProps> = ({
    selectedCount,
    onDelete,
    onStatusChange,
    onClearSelection,
    statusOptions = [],
    deleteLabel,
    showStatusChange = true
}) => {
    const { t } = useLanguage();
    const [showStatusDropdown, setShowStatusDropdown] = useState(false);

    if (selectedCount === 0) {
        return null;
    }

    const handleStatusSelect = (status: string) => {
        if (onStatusChange) {
            onStatusChange(status);
        }
        setShowStatusDropdown(false);
    };

    return (
        <div className={styles.batchBar}>
            <div className={styles.selectionInfo}>
                <span className={styles.selectedCount}>
                    {t('common.selected') || 'Selected'}: <strong>{selectedCount}</strong>
                </span>
                <button
                    className={styles.clearButton}
                    onClick={onClearSelection}
                    title={t('common.clearSelection') || 'Clear Selection'}
                >
                    ✕
                </button>
            </div>

            <div className={styles.actions}>
                {/* 批次狀態變更 */}
                {showStatusChange && statusOptions.length > 0 && onStatusChange && (
                    <div className={styles.statusDropdownContainer}>
                        <button
                            className={styles.statusButton}
                            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                        >
                            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 11l3 3L22 4" />
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                            </svg>
                            {t('common.changeStatus') || 'Change Status'}
                            <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>
                        {showStatusDropdown && (
                            <div className={styles.dropdown}>
                                {statusOptions.map(option => (
                                    <button
                                        key={option.value}
                                        className={styles.dropdownItem}
                                        onClick={() => handleStatusSelect(option.value)}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 批次刪除 */}
                {onDelete && (
                    <button
                        className={styles.deleteButton}
                        onClick={onDelete}
                    >
                        <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                        {deleteLabel || t('common.batchDelete') || 'Delete Selected'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default BatchActionBar;
