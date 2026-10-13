import React, { useEffect, useRef } from 'react';
import { getAuthenticatedFileUrl } from '../../services/api';
import type { OrderedPhoto, PhotoCategory } from '../../utils/obsPhotoOrder';
import styles from './OBSPhotoPairs.module.css';

/**
 * OBS Photos tab (OBS-PRINT-PHOTOS-2026-001): Before / After side by side in pairs — the same layout as the print.
 * Row n holds Before photo n and After photo n; a missing partner says 無對應照片. Each column keeps its own upload
 * button. ↑ / ↓ move a photo within its own column, which changes the pairs; the order is saved with the record.
 * Photos chosen in this edit (NEW) are not uploaded yet and so cannot be moved until the record is saved.
 */
export interface PhotoColumn {
    photos: OrderedPhoto[];
    pending: File[];
}

interface OBSPhotoPairsProps {
    before: PhotoColumn;
    after: PhotoColumn;
    /** Upload / remove allowed (permission and not Closed / Void). */
    canChangeFiles: boolean;
    /** ↑ / ↓ shown (the form is editable and the record is not Closed / Void). */
    canReorder: boolean;
    onAddFiles: (category: PhotoCategory, files: File[]) => void;
    onRemovePending: (category: PhotoCategory, index: number) => void;
    onRemove: (category: PhotoCategory, photo: OrderedPhoto) => void;
    onMove: (category: PhotoCategory, key: string, delta: -1 | 1) => void;
    onPreview: (src: string, name?: string) => void;
}

/** Preview of a file that is not uploaded yet. The object URL is made and revoked by the same effect run (StrictMode-safe). */
const PendingThumb: React.FC<{ file: File }> = ({ file }) => {
    const ref = useRef<HTMLImageElement>(null);
    useEffect(() => {
        const url = URL.createObjectURL(file);
        if (ref.current) ref.current.src = url;
        return () => URL.revokeObjectURL(url);
    }, [file]);
    return <img ref={ref} alt={file.name} />;
};

const COLUMNS: { category: PhotoCategory; side: 'before' | 'after'; zh: string; en: string }[] = [
    { category: 'defectPhoto', side: 'before', zh: '改善前', en: 'Before' },
    { category: 'improvementPhoto', side: 'after', zh: '改善後', en: 'After' },
];

export default function OBSPhotoPairs({ before, after, canChangeFiles, canReorder, onAddFiles, onRemovePending, onRemove, onMove, onPreview }: OBSPhotoPairsProps) {
    const columns = { before, after };
    const pairCount = Math.max(before.photos.length + before.pending.length, after.photos.length + after.pending.length);
    const hasPending = before.pending.length > 0 || after.pending.length > 0;

    const handleSelect = (category: PhotoCategory) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';                                    // the same file can be chosen again after removing it
        if (files.length) onAddFiles(category, files);
    };

    const renderCell = (category: PhotoCategory, column: PhotoColumn, n: number) => {
        const stored = column.photos[n];
        if (stored) {
            const src = getAuthenticatedFileUrl(stored.src);
            const last = column.photos.length - 1;
            return (
                <div className={styles.cell} data-photo-key={stored.key}>
                    <img src={src} alt={stored.name} className={styles.clickable} onClick={() => onPreview(src, stored.name)} />
                    {stored.stored && <div className={styles.fileName} title={stored.name}>{stored.name}</div>}
                    {(canReorder || canChangeFiles) && (
                        <div className={styles.tools}>
                            {canReorder && <>
                                <button type="button" className={styles.tool} disabled={n === 0} onClick={() => onMove(category, stored.key, -1)} aria-label="上移 / Move up" title="上移 / Move up">↑</button>
                                <button type="button" className={styles.tool} disabled={n === last} onClick={() => onMove(category, stored.key, 1)} aria-label="下移 / Move down" title="下移 / Move down">↓</button>
                            </>}
                            {canChangeFiles && (
                                <button type="button" className={styles.tool} onClick={() => onRemove(category, stored)} aria-label="刪除 / Delete" title="刪除 / Delete">×</button>
                            )}
                        </div>
                    )}
                </div>
            );
        }
        const pendingIndex = n - column.photos.length;
        const file = column.pending[pendingIndex];
        if (file) {
            return (
                <div className={styles.cell} data-photo-pending>
                    <PendingThumb file={file} />
                    <div className={styles.badge}>NEW</div>
                    <div className={styles.fileName} title={file.name}>{file.name}</div>
                    {canChangeFiles && (
                        <div className={styles.tools}>
                            <button type="button" className={styles.tool} onClick={() => onRemovePending(category, pendingIndex)} aria-label="移除 / Remove" title="移除 / Remove">×</button>
                        </div>
                    )}
                </div>
            );
        }
        return <div className={`${styles.cell} ${styles.missing}`} data-photo-missing>無對應照片 / No corresponding photo</div>;
    };

    return (
        <div className={styles.pairs} data-obs-photo-pairs>
            <div className={styles.columns}>
                {COLUMNS.map(({ category, side, zh, en }) => (
                    <div key={category} className={styles.colHead}>
                        <span className={styles.colTitle}><span className={styles.colBar} />{zh} <small>{en}</small></span>
                        {canChangeFiles && <>
                            <input type="file" accept="image/*" multiple id={`obs-upload-${side}`} className={styles.uploadInput} onChange={handleSelect(category)} />
                            <label htmlFor={`obs-upload-${side}`} className={styles.uploadButton}>+ 上傳照片 / Upload</label>
                        </>}
                    </div>
                ))}
            </div>
            {hasPending && canChangeFiles && <p className={styles.hint}>新選的照片（NEW）存檔後可調整順序 / Save first to reorder new photos</p>}
            {pairCount === 0 && <p className={styles.empty}>（尚無照片 No photos）</p>}
            {Array.from({ length: pairCount }, (_, n) => (
                <div key={n} className={styles.pair} data-photo-pair={n + 1}>
                    <div className={styles.pairLabel}>第 {n + 1} 組 / Pair {n + 1}</div>
                    <div className={styles.columns}>
                        {COLUMNS.map(({ category, side }) => (
                            <React.Fragment key={category}>{renderCell(category, columns[side], n)}</React.Fragment>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
