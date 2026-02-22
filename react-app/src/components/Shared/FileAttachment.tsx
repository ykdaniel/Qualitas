
import React, { useState, useCallback, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { uploadFiles, getEntityFiles, deleteFile, AttachmentInfo } from '../../services/api';

interface FileAttachmentProps {
    /** 舊格式：base64 字串陣列（向下相容） */
    attachments?: string[];
    /** 新格式回呼：當透過 API 上傳/刪除後，回傳最新的附件清單 */
    onAttachmentsChange?: (attachments: AttachmentInfo[]) => void;
    /** 舊格式回呼：僅用於向下相容的 base64 上傳 */
    onUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    /** 舊格式回呼：僅用於向下相容的 base64 移除 */
    onRemove?: (index: number) => void;
    /** 實體類型，啟用新 API 模式 */
    entityType?: string;
    /** 實體 ID，啟用新 API 模式 */
    entityId?: string;
    /** 檔案分類 */
    category?: string;
    id: string;
    title?: string;
    buttonText?: string;
    readOnly?: boolean;
    accept?: string;
    onPreview?: (src: string, name?: string) => void;
}

/**
 * 通用附件上傳元件
 * - 當提供 entityType + entityId 時，使用新的集中式 API 上傳
 * - 否則回退到舊的 base64 模式（向下相容）
 */
const FileAttachment: React.FC<FileAttachmentProps> = ({
    attachments: legacyAttachments,
    onAttachmentsChange,
    onUpload,
    onRemove,
    entityType,
    entityId,
    category = 'attachment',
    id,
    title,
    buttonText,
    readOnly = false,
    accept = "image/*",
    onPreview
}) => {
    const { t } = useLanguage();
    const [apiAttachments, setApiAttachments] = useState<AttachmentInfo[]>([]);
    const [uploading, setUploading] = useState(false);

    // NOTE: 判斷是否使用新的 API 模式
    const useApiMode = Boolean(entityType && entityId);

    // 載入已有的附件（API 模式）
    useEffect(() => {
        if (useApiMode && entityType && entityId) {
            getEntityFiles(entityType, entityId, category)
                .then(setApiAttachments)
                .catch(err => console.error('Failed to load attachments', err));
        }
    }, [useApiMode, entityType, entityId, category]);

    // API 模式：上傳
    const handleApiUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!entityType || !entityId) return;
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            const newFiles = await uploadFiles(entityType, entityId, Array.from(files), category);
            const updated = [...apiAttachments, ...newFiles];
            setApiAttachments(updated);
            onAttachmentsChange?.(updated);
        } catch (err) {
            console.error('Upload failed', err);
            alert(t('common.saveFailed') || 'Upload failed');
        } finally {
            setUploading(false);
            // 清除 input 值以允許重新選擇相同檔案
            e.target.value = '';
        }
    }, [entityType, entityId, category, apiAttachments, onAttachmentsChange, t]);

    // API 模式：刪除
    const handleApiRemove = useCallback(async (fileId: string) => {
        try {
            await deleteFile(fileId);
            const updated = apiAttachments.filter(a => a.id !== fileId);
            setApiAttachments(updated);
            onAttachmentsChange?.(updated);
        } catch (err) {
            console.error('Delete failed', err);
        }
    }, [apiAttachments, onAttachmentsChange]);

    // 合併顯示清單：API 附件 + 舊 base64 附件
    const displayItems: Array<{ type: 'api'; data: AttachmentInfo } | { type: 'legacy'; src: string; index: number }> = [];

    // API 模式附件
    apiAttachments.forEach(a => displayItems.push({ type: 'api', data: a }));

    // 舊格式 base64 附件
    if (legacyAttachments) {
        legacyAttachments.forEach((src, index) => {
            // 排除已在 API 附件中的項目（避免重複）
            if (!apiAttachments.some(a => a.file_url === src)) {
                displayItems.push({ type: 'legacy', src, index });
            }
        });
    }

    // 樣式定義
    const styles = {
        container: { marginBottom: '0' },
        sectionTitleWrapper: {
            fontSize: '18px', fontWeight: 700, color: '#1e3a8a',
            margin: '0 0 24px 0', paddingBottom: '12px',
            borderBottom: '2px solid #e0e7ff',
            display: 'flex', alignItems: 'center', gap: '10px'
        },
        sectionTitleBar: {
            width: '4px', height: '24px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1e3a8a 100%)',
            borderRadius: '2px', boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)'
        },
        photoUploadContainer: {
            display: 'flex', flexDirection: 'column' as const, gap: '12px'
        },
        photoInput: { display: 'none' },
        photoUploadButton: {
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            padding: '10px 20px', border: '2px dashed #d1d5db', borderRadius: '8px',
            backgroundColor: '#ffffff', color: '#6b7280', cursor: uploading ? 'wait' : 'pointer',
            transition: 'all 0.2s ease', fontSize: '14px', fontWeight: 500,
            width: 'fit-content', opacity: uploading ? 0.6 : 1
        },
        photoPreviewGrid: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '12px', marginTop: '8px'
        },
        photoPreviewItem: {
            position: 'relative' as const, width: '100%', aspectRatio: '1',
            borderRadius: '8px', overflow: 'hidden',
            border: '1px solid #e5e7eb', backgroundColor: '#f9fafb'
        },
        photoPreview: {
            width: '100%', height: '100%',
            objectFit: 'cover' as const, display: 'block'
        },
        photoRemoveButton: {
            position: 'absolute' as const, top: '4px', right: '4px',
            width: '24px', height: '24px', borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.6)', color: 'white',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', lineHeight: 1
        },
        fileName: {
            position: 'absolute' as const, bottom: '0', left: '0', right: '0',
            padding: '4px 6px', background: 'rgba(0,0,0,0.6)',
            color: '#fff', fontSize: '11px', textOverflow: 'ellipsis' as const,
            overflow: 'hidden', whiteSpace: 'nowrap' as const
        },
        labelSpan: { fontSize: '14px', fontWeight: 500 },
        // 非圖片檔案的預覽樣式
        filePlaceholder: {
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column' as const, gap: '4px',
            color: '#6b7280', fontSize: '12px', padding: '8px',
            textAlign: 'center' as const
        },
    };

    /**
     * 判斷 src 是否為圖片（base64 或 URL）
     */
    const isImageSrc = (src: string, mime?: string): boolean => {
        if (mime?.startsWith('image/')) return true;
        if (src.startsWith('data:image/')) return true;
        return /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(src);
    };

    return (
        <div style={styles.container}>
            <h3 style={styles.sectionTitleWrapper}>
                <span style={styles.sectionTitleBar}></span>
                {title || t('common.attachments')}
            </h3>
            <div style={styles.photoUploadContainer}>
                {!readOnly && (
                    <>
                        <input
                            type="file"
                            accept={accept}
                            multiple
                            onChange={useApiMode ? handleApiUpload : onUpload}
                            style={styles.photoInput}
                            id={`attachment-upload-${id}`}
                            disabled={uploading}
                        />
                        <label htmlFor={`attachment-upload-${id}`} style={styles.photoUploadButton}>
                            <span style={styles.labelSpan}>
                                {uploading
                                    ? (t('common.loading') || 'Uploading...')
                                    : (buttonText || t('common.uploadFiles'))
                                }
                            </span>
                        </label>
                    </>
                )}

                {displayItems.length > 0 && (
                    <div style={styles.photoPreviewGrid}>
                        {displayItems.map((item, idx) => {
                            if (item.type === 'api') {
                                const a = item.data;
                                const isImage = isImageSrc(a.file_url, a.mime_type);
                                return (
                                    <div key={a.id} style={styles.photoPreviewItem}>
                                        {isImage ? (
                                            <img
                                                src={a.file_url}
                                                alt={a.file_name}
                                                style={{ ...styles.photoPreview, cursor: onPreview ? 'pointer' : 'default' }}
                                                onClick={() => onPreview && onPreview(a.file_url, a.file_name)}
                                            />
                                        ) : (
                                            <div style={styles.filePlaceholder}>
                                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                    <polyline points="14 2 14 8 20 8" />
                                                </svg>
                                                <span>{a.file_name}</span>
                                            </div>
                                        )}
                                        <div style={styles.fileName}>{a.file_name}</div>
                                        {!readOnly && (
                                            <button
                                                type="button"
                                                style={styles.photoRemoveButton}
                                                onClick={() => handleApiRemove(a.id)}
                                                aria-label={t('common.delete')}
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                );
                            } else {
                                // 舊格式 base64 附件
                                return (
                                    <div key={`legacy-${item.index}`} style={styles.photoPreviewItem}>
                                        <img
                                            src={item.src}
                                            alt={`Attachment ${item.index + 1}`}
                                            style={{ ...styles.photoPreview, cursor: onPreview ? 'pointer' : 'default' }}
                                            onClick={() => onPreview && onPreview(item.src, `Attachment ${item.index + 1}`)}
                                        />
                                        {!readOnly && onRemove && (
                                            <button
                                                type="button"
                                                style={styles.photoRemoveButton}
                                                onClick={() => onRemove(item.index)}
                                                aria-label={t('common.delete')}
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                );
                            }
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default FileAttachment;
