import React, { useState, useCallback, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { getEntityFiles, deleteFile, AttachmentInfo } from '../../services/api';

export interface FileAttachmentProps {
    /** 已存在於伺服器的檔案資訊 (由上層傳入或由內部抓取) */
    attachments?: AttachmentInfo[];
    /** 舊格式：base64 字串陣列（僅作向下相容渲染，不再用於上傳） */
    legacyAttachments?: string[];
    /** 當上層選擇了實體檔案時觸發，回傳待上傳的 File 陣列 */
    onPendingFilesChange?: (files: File[]) => void;
    /** 當刪除已存在伺服器檔案時觸發（傳遞 file_id） */
    onDeleteExistingFile?: (fileId: string) => void;
    /** 單純刪除 Legacy Base64 的回呼 (視需要保留) */
    onRemoveLegacy?: (index: number) => void;
    
    /** 若提供此資訊，元件將自動嘗試抓取並於上傳時「自動儲存」。但在各模組 Modal 實作中，建議由上層手動處理儲存。 */
    entityType?: string;
    entityId?: string;
    category?: string;
    
    id: string;
    title?: string;
    buttonText?: string;
    readOnly?: boolean;
    accept?: string;
    onPreview?: (src: string, name?: string) => void;
}

const FileAttachment: React.FC<FileAttachmentProps> = ({
    attachments: propsAttachments,
    legacyAttachments,
    onPendingFilesChange,
    onDeleteExistingFile,
    onRemoveLegacy,
    entityType,
    entityId,
    category = 'attachment',
    id,
    title,
    buttonText,
    readOnly = false,
    accept = "image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    onPreview
}) => {
    const { t } = useLanguage();
    // 儲存已從 Server 拿回來的檔案
    const [apiAttachments, setApiAttachments] = useState<AttachmentInfo[]>([]);
    // 儲存使用者剛選取但尚未上傳至 Server 的實體 File 物件
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    // 儲存待上傳 File 所產生出的預覽用 URL (blob UI)
    const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
    const uploading = false;

    // 如果提供了實體 ID，嘗試自動抓取遠端檔案 (如果外部沒傳 propsAttachments 的話)
    useEffect(() => {
        if (entityType && entityId && !propsAttachments) {
            getEntityFiles(entityType, entityId, category)
                .then(setApiAttachments)
                .catch(err => console.error('Failed to load attachments', err));
        }
    }, [entityType, entityId, category, propsAttachments]);

    const displayedApiAttachments = propsAttachments ?? apiAttachments;

    // 清理 ObjectURL 防止記憶體洩漏
    useEffect(() => {
        return () => {
            pendingPreviews.forEach(url => URL.revokeObjectURL(url));
        };
    }, [pendingPreviews]);

    // 處理新選擇的檔案
    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const newFilesArray = Array.from(files);
        
        // 如果有傳入 entity_id 且我們採「立即上傳」策略 (但建議都由上層統一處理以避免孤兒檔案)
        // 為了支援現有的大部分架構需求（Modal 先持有檔案，按下 Save 才建 DB+Upload）
        // 我們將 File 存入 Pending 陣列，並拋給上層。
        
        const updatedPendingFiles = [...pendingFiles, ...newFilesArray];
        setPendingFiles(updatedPendingFiles);
        
        // 建立 Blob URL 用於本地預覽
        const newPreviews = newFilesArray.map(f => URL.createObjectURL(f));
        setPendingPreviews(prev => [...prev, ...newPreviews]);
        
        onPendingFilesChange?.(updatedPendingFiles);
        
        // 清除 input 值以允許重新選擇相同檔案
        e.target.value = '';
    }, [pendingFiles, onPendingFilesChange]);

    // 移除等待上傳的檔案
    const handleRemovePendingFile = (index: number) => {
        const urlToRevoke = pendingPreviews[index];
        URL.revokeObjectURL(urlToRevoke);

        const newPendingFiles = pendingFiles.filter((_, i) => i !== index);
        const newPreviews = pendingPreviews.filter((_, i) => i !== index);
        
        setPendingFiles(newPendingFiles);
        setPendingPreviews(newPreviews);
        onPendingFilesChange?.(newPendingFiles);
    };

    // 移除伺服器上的檔案
    const handleRemoveApiFile = useCallback(async (fileId: string) => {
        // 如果外部有接 onDeleteExistingFile，則單純通知外部
        if (onDeleteExistingFile) {
            onDeleteExistingFile(fileId);
            // 由於外部控制，這裡就先 Optimistic Delete 畫面顯示
            setApiAttachments(prev => prev.filter(a => a.id !== fileId));
        } else {
            // 否則嘗試自己呼叫 API 刪除 (舊邏輯)
            try {
                await deleteFile(fileId);
                const updated = apiAttachments.filter(a => a.id !== fileId);
                setApiAttachments(updated);
            } catch (err) {
                console.error('Delete failed', err);
            }
        }
    }, [apiAttachments, onDeleteExistingFile]);

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
        pendingBadge: {
            position: 'absolute' as const, top: '4px', left: '4px',
            background: '#f59e0b', color: '#fff', fontSize: '10px',
            padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold'
        },
        labelSpan: { fontSize: '14px', fontWeight: 500 },
        filePlaceholder: {
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column' as const, gap: '4px',
            color: '#6b7280', fontSize: '12px', padding: '8px',
            textAlign: 'center' as const
        },
    };

    const isImageSrc = (src: string, mime?: string): boolean => {
        if (mime?.startsWith('image/')) return true;
        if (src.startsWith('data:image/') || src.startsWith('blob:')) return true;
        return /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(src.split('?')[0]);
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
                            onChange={handleFileSelect}
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

                {(displayedApiAttachments.length > 0 || pendingFiles.length > 0 || (legacyAttachments && legacyAttachments.length > 0)) && (
                    <div style={styles.photoPreviewGrid}>
                        {/* 1. 顯示已存在伺服器上的檔案 */}
                        {displayedApiAttachments.map((a) => {
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
                                    <div style={styles.fileName} title={a.file_name}>{a.file_name}</div>
                                    {!readOnly && (
                                        <button
                                            type="button"
                                            style={styles.photoRemoveButton}
                                            onClick={() => handleRemoveApiFile(a.id)}
                                            aria-label={t('common.delete')}
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                            );
                        })}

                        {/* 2. 顯示剛剛選擇、尚未上傳的實體檔案 (Pending) */}
                        {pendingFiles.map((file, idx) => {
                            const isImage = file.type.startsWith('image/');
                            const previewUrl = pendingPreviews[idx];
                            return (
                                <div key={`pending-${idx}`} style={styles.photoPreviewItem}>
                                    <div style={styles.pendingBadge}>NEW</div>
                                    {isImage ? (
                                        <img
                                            src={previewUrl}
                                            alt={file.name}
                                            style={styles.photoPreview}
                                        />
                                    ) : (
                                        <div style={styles.filePlaceholder}>
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                <polyline points="14 2 14 8 20 8" />
                                            </svg>
                                            <span>{file.name}</span>
                                        </div>
                                    )}
                                    <div style={styles.fileName} title={file.name}>{file.name}</div>
                                    {!readOnly && (
                                        <button
                                            type="button"
                                            style={styles.photoRemoveButton}
                                            onClick={() => handleRemovePendingFile(idx)}
                                            aria-label={t('common.delete')}
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                            );
                        })}

                        {/* 3. 顯示向下相容的舊資料 Base64 (Legacy) */}
                        {legacyAttachments?.map((src, idx) => (
                            <div key={`legacy-${idx}`} style={styles.photoPreviewItem}>
                                <img
                                    src={src}
                                    alt={`Legacy Attachment ${idx + 1}`}
                                    style={{ ...styles.photoPreview, cursor: onPreview ? 'pointer' : 'default' }}
                                    onClick={() => onPreview && onPreview(src, `Legacy Attachment ${idx + 1}`)}
                                />
                                {!readOnly && onRemoveLegacy && (
                                    <button
                                        type="button"
                                        style={styles.photoRemoveButton}
                                        onClick={() => onRemoveLegacy(idx)}
                                        aria-label={t('common.delete')}
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default FileAttachment;
