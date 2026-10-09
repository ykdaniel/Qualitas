/**
 * Material sample shelf (MATERIAL-SUBMITTAL M6, user's choice 2026-10-09): the same records as the table, shown like the material
 * sample display shelf on a public-works site — one shelf level per category, each approved material a sample card (first photo,
 * name, brand / model, approval result). A card opens the same approved-material view as a table row. No new data: the page
 * passes the rows it already loaded, filtered exactly like the table.
 */
import React, { useMemo } from 'react';
import type { ApprovedMaterial } from '../../services/materialApi';
import { useMaterialText } from './materialText';
import { StatusBadge } from './parts';
import { shelfLevels } from '../../utils/materialSubmittal';
import styles from './MaterialShelf.module.css';

const photoUrl = (path: string) => `/api/files/download/${path.split('/').map(encodeURIComponent).join('/')}`;

const MaterialShelf: React.FC<{ rows: ApprovedMaterial[]; onOpen: (m: ApprovedMaterial) => void }> = ({ rows, onOpen }) => {
    const mt = useMaterialText();
    const levels = useMemo(() => shelfLevels(rows), [rows]);

    if (rows.length === 0) return <div className={styles.empty} data-testid="material-shelf-empty">{mt('shelfEmpty')}</div>;
    return (
        <div className={styles.shelf} data-testid="material-shelf">
            {levels.map(({ category, items }) => (
                <section key={category ?? '__none__'} className={styles.level} data-testid="shelf-level" data-category={category ?? ''}>
                    <h3 className={styles.levelTitle}>
                        {category ?? mt('uncategorised')}
                        <span className={styles.levelCount}>({items.length})</span>
                    </h3>
                    <div className={styles.items}>
                        {items.map((m) => (
                            <button key={m.submittalId} type="button" className={styles.card} onClick={() => onOpen(m)}
                                    title={`${m.documentNumber} — ${m.name ?? ''}`} data-testid={`shelf-card-${m.documentNumber}`}>
                                <div className={styles.photo}>
                                    {m.coverPhotoPath
                                        ? <img src={photoUrl(m.coverPhotoPath)} alt={m.name ?? ''} loading="lazy" />
                                        : <span className={styles.noPhoto}>{mt('noPhotoShort')}</span>}
                                    {(m.photoCount ?? 0) > 1 && <span className={styles.photoCount}>{mt('photoCount', { n: m.photoCount ?? 0 })}</span>}
                                </div>
                                <div className={styles.body}>
                                    <div className={styles.name}>{m.name || '—'}</div>
                                    <div className={styles.meta}>{[m.brand, m.model].filter((x) => x && x.trim()).join(' / ') || '—'}</div>
                                    <div><StatusBadge status={m.result} /></div>
                                </div>
                            </button>
                        ))}
                    </div>
                    <div className={styles.board} aria-hidden="true" />
                </section>
            ))}
        </div>
    );
};

export default MaterialShelf;
