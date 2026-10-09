/**
 * Material photos (MATERIAL-SUBMITTAL M6). Any number of photos, the same layout (user's choice "主圖＋縮圖列"):
 *  - one large MAIN photo filling the column (fixed height, whole photo visible), file name, "n / total";
 *  - a THUMBNAIL strip under it (hidden for a single photo, scrolls sideways when there are many); a click swaps the main photo;
 *  - a click on the main photo opens the full-screen viewer: fills the screen, ‹ › and ← → between photos, ＋／－ zoom up to 4×,
 *    double-click toggles 2×, the zoomed photo scrolls; Esc closes the viewer only.
 * Read-only: photos are added and removed in the edit form (FileAttachment). Images come from the authenticated download route, so <img> works with the session cookie.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { getAuthenticatedFileUrl, type AttachmentInfo } from '../../services/api';
import { useMaterialText } from './materialText';

interface Props {
    photos: AttachmentInfo[];
    /** height of the main photo box in px (capped at 48% of the screen height so the thumbnails stay in view) */
    mainHeight?: number;
}

const LB_BTN: React.CSSProperties = { color: '#faf7f1', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(250,247,241,.6)',
                                       borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 13 };
const ARROW: React.CSSProperties = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 1, width: 48, height: 72,
                                      fontSize: 34, lineHeight: '72px', color: '#faf7f1', background: 'rgba(20,18,15,.55)',
                                      border: '1px solid rgba(250,247,241,.4)', borderRadius: 8, cursor: 'pointer', padding: 0 };

const PhotoViewer: React.FC<{ photos: AttachmentInfo[]; index: number; onIndex: (i: number) => void; onClose: () => void }>
    = ({ photos, index, onIndex, onClose }) => {
    const mt = useMaterialText();
    const [zoom, setZoom] = useState(1);              // 1 = fill the screen (small photos are enlarged too); up to 4×
    const n = photos.length;
    const photo = photos[index];
    const go = useCallback((step: number) => { if (n > 1) { setZoom(1); onIndex((index + step + n) % n); } }, [index, n, onIndex]);
    const zoomBy = (step: number) => setZoom((z) => Math.min(4, Math.max(1, Math.round((z + step) * 2) / 2)));

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowLeft') go(-1);
            else if (e.key === 'ArrowRight') go(1);
            else if (e.key === '+' || e.key === '=') zoomBy(0.5);
            else if (e.key === '-') zoomBy(-0.5);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [go, onClose]);

    if (!photo) return null;
    return (
        <div role="dialog" aria-label={mt('enlargedPhoto')} data-testid="photo-lightbox" data-zoom={zoom} data-index={index}
             style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,15,.92)', zIndex: 2000, display: 'flex',
                      flexDirection: 'column', alignItems: 'center', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#faf7f1', fontSize: 13, marginBottom: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <span style={{ maxWidth: '36vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{photo.file_name}</span>
                {n > 1 && <span data-testid="photo-viewer-counter">{index + 1} / {n}</span>}
                <button type="button" onClick={() => zoomBy(-0.5)} disabled={zoom <= 1} data-testid="photo-zoom-out" style={LB_BTN}>－</button>
                <span data-testid="photo-zoom-level" style={{ minWidth: 48, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => zoomBy(0.5)} disabled={zoom >= 4} data-testid="photo-zoom-in" style={LB_BTN}>＋</button>
                <button type="button" onClick={() => setZoom(1)} disabled={zoom === 1} data-testid="photo-zoom-fit" style={LB_BTN}>{mt('fitScreen')}</button>
                <a href={getAuthenticatedFileUrl(photo.file_url)} target="_blank" rel="noreferrer" style={{ ...LB_BTN, textDecoration: 'none' }}>{mt('openOriginal')}</a>
                <button type="button" onClick={onClose} data-testid="photo-lightbox-close" style={LB_BTN}>{mt('close')}</button>
            </div>
            <div style={{ position: 'relative', flex: 1, width: '100%', minHeight: 0 }}>
                {n > 1 && <button type="button" aria-label="previous" onClick={() => go(-1)} data-testid="photo-prev" style={{ ...ARROW, left: 4 }}>‹</button>}
                {n > 1 && <button type="button" aria-label="next" onClick={() => go(1)} data-testid="photo-next" style={{ ...ARROW, right: 4 }}>›</button>}
                {/* at 100% the photo fills this box (leaving room for the arrows); zoomed in, the box scrolls */}
                <div style={{ position: 'absolute', inset: 0, overflow: 'auto', display: 'flex' }} data-testid="photo-lightbox-scroll"
                     onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
                    <img key={photo.id} src={getAuthenticatedFileUrl(photo.file_url)} alt={photo.file_name} title={mt('zoomHint')}
                         onDoubleClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
                         style={{ margin: 'auto', width: zoom === 1 ? 'calc(100% - 120px)' : `${100 * zoom}%`, height: `${100 * zoom}%`,
                                  maxWidth: 'none', objectFit: 'contain', flexShrink: 0, cursor: zoom === 1 ? 'zoom-in' : 'zoom-out' }} />
                </div>
            </div>
        </div>
    );
};

const PhotoGallery: React.FC<Props> = ({ photos, mainHeight = 440 }) => {
    const mt = useMaterialText();
    const [index, setIndex] = useState(0);
    const [viewing, setViewing] = useState(false);
    const n = photos.length;
    const current = Math.min(index, Math.max(0, n - 1));   // a deleted photo never leaves the index out of range
    const main = photos[current];
    if (!main) return null;

    return (
        <div data-testid="photo-grid" data-count={n}>
            <button type="button" onClick={() => setViewing(true)} title={mt('enlargedPhoto')} data-testid="photo-main" data-file-id={main.id}
                    style={{ display: 'block', width: '100%', height: `min(${mainHeight}px, 48vh)`, padding: 0, border: '1px solid #e6dfcf', borderRadius: 10,
                             background: '#f7f4ee', cursor: 'zoom-in', overflow: 'hidden' }}>
                <img src={getAuthenticatedFileUrl(main.file_url)} alt={main.file_name}
                     style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6b6457', margin: '6px 0 8px' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={main.file_name}>{main.file_name}</span>
                {n > 1 && <span data-testid="photo-counter">{current + 1} / {n}</span>}
            </div>
            {n > 1 && (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }} data-testid="photo-thumbs">
                    {photos.map((p, i) => (
                        <button key={p.id} type="button" onClick={() => setIndex(i)} title={p.file_name} data-testid={`photo-${p.id}`}
                                aria-current={i === current}
                                style={{ flex: '0 0 84px', width: 84, height: 84, padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                                         background: '#f7f4ee', border: i === current ? '3px solid #b8945a' : '1px solid #e6dfcf' }}>
                            <img src={getAuthenticatedFileUrl(p.file_url)} alt={p.file_name} loading="lazy"
                                 style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        </button>
                    ))}
                </div>
            )}
            {viewing && <PhotoViewer photos={photos} index={current} onIndex={setIndex} onClose={() => setViewing(false)} />}
        </div>
    );
};

export default PhotoGallery;
