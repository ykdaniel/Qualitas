import React, { useRef, useState, useCallback } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import styles from './FileUpload.module.css';

interface FileUploadProps {
    onFilesSelected: (files: File[]) => void;
    accept?: string;  // e.g., '.pdf,.jpg,.png'
    multiple?: boolean;
    maxSizeMB?: number;
    maxFiles?: number;
    disabled?: boolean;
    label?: string;
}

/**
 * 檔案上傳元件
 * 支援拖放上傳和點擊選擇檔案
 */
const FileUpload: React.FC<FileUploadProps> = ({
    onFilesSelected,
    accept = '*',
    multiple = true,
    maxSizeMB = 10,
    maxFiles = 10,
    disabled = false,
    label
}) => {
    const { t } = useLanguage();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const validateFiles = useCallback((files: File[]): File[] => {
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        const validFiles: File[] = [];
        const errors: string[] = [];

        files.slice(0, maxFiles).forEach(file => {
            if (file.size > maxSizeBytes) {
                errors.push(`${file.name}: ${t('fileUpload.fileTooLarge') || 'File too large'} (max ${maxSizeMB}MB)`);
            } else {
                validFiles.push(file);
            }
        });

        if (files.length > maxFiles) {
            errors.push(`${t('fileUpload.tooManyFiles') || 'Too many files'} (max ${maxFiles})`);
        }

        setError(errors.length > 0 ? errors.join(', ') : null);
        return validFiles;
    }, [maxSizeMB, maxFiles, t]);

    const handleFiles = useCallback((fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return;

        const files = Array.from(fileList);
        const validFiles = validateFiles(files);

        if (validFiles.length > 0) {
            onFilesSelected(validFiles);
        }
    }, [validateFiles, onFilesSelected]);

    const handleClick = () => {
        if (!disabled && fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (!disabled) {
            handleFiles(e.dataTransfer.files);
        }
    };

    return (
        <div className={styles.container}>
            <div
                className={`${styles.dropzone} ${isDragging ? styles.dragging : ''} ${disabled ? styles.disabled : ''}`}
                onClick={handleClick}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={accept}
                    multiple={multiple}
                    onChange={(e) => handleFiles(e.target.files)}
                    className={styles.hiddenInput}
                    disabled={disabled}
                />

                <div className={styles.uploadIcon}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                </div>

                <div className={styles.text}>
                    <span className={styles.mainText}>
                        {label || t('fileUpload.dropHere') || 'Drop files here or click to upload'}
                    </span>
                    <span className={styles.subText}>
                        {t('fileUpload.maxSize') || 'Max size'}: {maxSizeMB}MB
                        {multiple && ` · ${t('fileUpload.maxFiles') || 'Max files'}: ${maxFiles}`}
                    </span>
                </div>
            </div>

            {error && (
                <div className={styles.error}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {error}
                </div>
            )}
        </div>
    );
};

export default FileUpload;
