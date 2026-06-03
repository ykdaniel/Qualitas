import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';

interface ImagePreviewOverlayProps {
    /** 圖片 / PDF 的來源 URL（已是可直接載入的同源相對路徑或 data:URL） */
    url: string;
    /** 顯示於底部的名稱 */
    name?: string;
    /** 關閉預覽 */
    onClose: () => void;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.15;

const isPdf = (u: string): boolean =>
    u.startsWith('data:application/pdf') || u.toLowerCase().split('?')[0].endsWith('.pdf');

interface Transform {
    scale: number;
    tx: number;
    ty: number;
}

const IDENTITY: Transform = { scale: 1, tx: 0, ty: 0 };

/**
 * 全螢幕圖片預覽，支援：
 *  - 滑鼠滾輪縮放（以游標為錨點）
 *  - 拖曳平移
 *  - 雙擊重置
 *  - 點擊背景 / × / Esc 關閉
 * PDF 則以 iframe 內嵌（不縮放）。
 */
const ImagePreviewOverlay: React.FC<ImagePreviewOverlayProps> = ({ url, name, onClose }) => {
    const { t } = useLanguage();
    const overlayRef = useRef<HTMLDivElement>(null);
    const [tf, setTf] = useState<Transform>(IDENTITY);
    // Mirror the latest transform into a ref so the wheel handler can read the
    // current value without being re-created on every transform change.
    const tfRef = useRef<Transform>(tf);
    useEffect(() => { tfRef.current = tf; }, [tf]);

    const [dragging, setDragging] = useState(false);
    const dragStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

    const pdf = isPdf(url);
    // Reset of zoom/pan when the image changes is handled by remounting via a
    // `key={url}` at the call site, so no url-change effect is needed here.

    // Esc 關閉
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // 滾輪縮放（以游標位置為錨點，縮放後該點維持在原處）
    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (pdf) return;
        e.preventDefault();
        const rect = overlayRef.current?.getBoundingClientRect();
        if (!rect) return;
        const px = e.clientX - (rect.left + rect.width / 2);
        const py = e.clientY - (rect.top + rect.height / 2);
        const cur = tfRef.current;
        const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cur.scale * factor));
        const ratio = next / cur.scale;
        setTf({
            scale: next,
            tx: px - ratio * (px - cur.tx),
            ty: py - ratio * (py - cur.ty),
        });
    }, [pdf]);

    // 拖曳平移
    const handleMouseDown = (e: React.MouseEvent) => {
        if (pdf) return;
        e.preventDefault();
        const cur = tfRef.current;
        dragStart.current = { x: e.clientX, y: e.clientY, tx: cur.tx, ty: cur.ty };
        setDragging(true);
    };

    useEffect(() => {
        if (!dragging) return;
        const onMove = (e: MouseEvent) => {
            const d = dragStart.current;
            if (!d) return;
            setTf(prev => ({ ...prev, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) }));
        };
        const onUp = () => setDragging(false);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [dragging]);

    const styles: Record<string, React.CSSProperties> = {
        overlay: {
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2000, padding: 40, overflow: 'hidden',
        },
        image: {
            maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain',
            borderRadius: 4, boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            transform: `translate(${tf.tx}px, ${tf.ty}px) scale(${tf.scale})`,
            transformOrigin: 'center center',
            cursor: dragging ? 'grabbing' : 'grab',
            userSelect: 'none', willChange: 'transform',
        },
        iframe: {
            width: '85vw', height: '85vh', border: 'none',
            background: 'white', borderRadius: 8,
        },
        closeButton: {
            position: 'fixed', top: 16, right: 16,
            background: 'white', color: '#1f2937', border: 'none',
            width: 40, height: 40, borderRadius: '50%', fontSize: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 2001,
        },
        label: {
            position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(255,255,255,0.2)', color: 'white',
            padding: '6px 16px', borderRadius: 20, fontSize: 14,
            display: 'flex', gap: 12, alignItems: 'center', maxWidth: '90vw',
            zIndex: 2001, pointerEvents: 'none',
        },
        hint: { opacity: 0.7, fontSize: 12 },
    };

    return (
        <div
            ref={overlayRef}
            style={styles.overlay}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            onWheel={handleWheel}
        >
            <button style={styles.closeButton} onClick={onClose} aria-label={t('common.close')}>×</button>
            {pdf ? (
                <iframe src={url} style={styles.iframe} title="PDF Preview" />
            ) : (
                <img
                    src={url}
                    alt={name || 'Preview'}
                    style={styles.image}
                    draggable={false}
                    onMouseDown={handleMouseDown}
                    onDoubleClick={() => setTf(IDENTITY)}
                />
            )}
            <div style={styles.label}>
                <span>{name || t('common.preview')}</span>
                {!pdf && <span style={styles.hint}>{t('common.previewHint') || '滾輪縮放 · 拖曳平移 · 雙擊重置'}</span>}
            </div>
        </div>
    );
};

export default ImagePreviewOverlay;
