/**
 * One approved material (MATERIAL-SUBMITTAL M6, DECISIONS 材料：只作為核准材料登錄簿): photos on the LEFT (main photo + thumbnail
 * strip, click to view full screen); on the RIGHT an "approval" section and a "material" section (stacked on a narrow screen).
 * Read-only: photos are added and removed only in the edit form (one place, one Save — user's choice). Print uses the shared
 * report look (MaterialPrintTemplate + Material.print.css), like the other modules.
 */
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import formStyles from '../Shared/FormShell.module.css';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import { useLanguage } from '../../context/LanguageContext';
import { getAuthenticatedFileUrl, getEntityFiles, type AttachmentInfo } from '../../services/api';
import { MATERIAL_ENTITY, PHOTO_CATEGORY, type ApprovedMaterial } from '../../services/materialApi';
import { useMaterialText, type MaterialTextKey } from './materialText';
import { Field, Notice, StatusBadge } from './parts';
import PhotoGrid from './Photos';
import MaterialPrintTemplate from './MaterialPrintTemplate';
import './Material.print.css';

const MATERIAL_FIELDS: [keyof ApprovedMaterial, MaterialTextKey][] = [
    ['name', 'materialName'], ['category', 'category'], ['brand', 'brand'], ['model', 'model'], ['specification', 'specification'],
    ['manufacturer', 'manufacturer'], ['supplier', 'supplier'],
];
const VALUE: React.CSSProperties = { background: '#f7f4ee', minHeight: 38, display: 'flex', alignItems: 'center', overflowWrap: 'anywhere' };
const SECTION_TITLE: React.CSSProperties = { gridColumn: '1 / -1', margin: '0 0 2px', fontSize: 15, paddingLeft: 8, borderLeft: '3px solid #b8945a' };

const ApprovedMaterialModal: React.FC<{ item: ApprovedMaterial; canManage: boolean; onClose: () => void; onEdit: () => void }>
    = ({ item, canManage, onClose, onEdit }) => {
    const mt = useMaterialText();
    const { t } = useLanguage();
    const [photos, setPhotos] = useState<AttachmentInfo[] | null>(null);
    const [error, setError] = useState(false);
    const [printing, setPrinting] = useState(false);

    useEffect(() => {
        let alive = true;
        getEntityFiles(MATERIAL_ENTITY, item.revisionId, PHOTO_CATEGORY)
            .then((list) => { if (alive) { setPhotos(list.filter((f) => f.category === PHOTO_CATEGORY)); setError(false); } })
            .catch(() => { if (alive) setError(true); });
        return () => { alive = false; };
    }, [item.revisionId]);

    // same print sequence as OSD / OBS / NCR: mount the report portal, print, unmount after the print dialog closes
    useEffect(() => {
        if (!printing) return;
        const timer = setTimeout(() => window.print(), 300);
        const onAfterPrint = () => setPrinting(false);
        window.addEventListener('afterprint', onAfterPrint);
        return () => { clearTimeout(timer); window.removeEventListener('afterprint', onAfterPrint); };
    }, [printing]);

    return (
        <div className={formStyles.modalOverlay} data-testid="approved-material-modal">
            <div className={formStyles.modalContent} style={{ maxWidth: 1400 }} onClick={(e) => e.stopPropagation()}>
                <div className={formStyles.modalHeader}>
                    <h2>{`${mt('approvedMaterial')} — ${item.name ?? ''}`}</h2>
                    <button className={formStyles.closeButton} aria-label={t('common.close')} title={t('common.close')} onClick={onClose}>×</button>
                </div>
                <div className={formStyles.modalBody}>
                    {/* photos on the left, details on the right; the two columns stack on a narrow screen */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
                        <section style={{ flex: '0 1 640px', minWidth: 300 }} data-testid="approved-photos-col">
                            <h4 style={{ margin: '4px 0 8px' }}>{mt('photos')}</h4>
                            {error && <Notice tone="error">{mt('loadFailed')}</Notice>}
                            {photos === null && !error && <div style={{ fontSize: 13, color: '#8a8273' }}>{mt('loading')}</div>}
                            {photos !== null && (photos.length === 0
                                ? <div style={{ fontSize: 13, color: '#8a8273' }} data-testid="no-photos">{mt('noPhotos')}</div>
                                : <PhotoGrid photos={photos} mainHeight={440} />)}
                        </section>
                        <section style={{ flex: '1 1 420px', minWidth: 280, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px 14px' }}
                                 data-testid="approved-details-col">
                            <h4 style={SECTION_TITLE} data-testid="approved-summary">{mt('approvalInfo')}</h4>
                            <Field label={mt('recordNo')}>
                                <div className={formStyles.formInput} style={{ ...VALUE, fontWeight: 600 }} data-testid="approved-documentNumber">{item.documentNumber}</div>
                            </Field>
                            <Field label={mt('approvalResult')}>
                                <div className={formStyles.formInput} style={VALUE} data-testid="approved-result"><StatusBadge status={item.result} /></div>
                            </Field>
                            <Field label={mt('approvedDate')}>
                                <div className={formStyles.formInput} style={VALUE} data-testid="approved-approvedDate">{item.approvedDate || '—'}</div>
                            </Field>
                            <Field label={mt('approvedBy')}>
                                <div className={formStyles.formInput} style={VALUE} data-testid="approved-decisionMaker">{item.decisionMaker || '—'}</div>
                            </Field>
                            <Field label={mt('externalApprovalNo')}>
                                <div className={formStyles.formInput} style={VALUE} data-testid="approved-externalDocNo">{item.externalDocNo || '—'}</div>
                            </Field>
                            <Field label={mt('vendor')}>
                                <div className={formStyles.formInput} style={VALUE} data-testid="approved-vendorName">{item.vendorName || '—'}</div>
                            </Field>
                            <h4 style={{ ...SECTION_TITLE, marginTop: 10 }}>{mt('materialInfo')}</h4>
                            {MATERIAL_FIELDS.map(([k, label]) => (
                                <Field key={k} label={mt(label)}>
                                    <div className={formStyles.formInput} style={VALUE} data-testid={`approved-${k}`}>{(item[k] as string) || '—'}</div>
                                </Field>
                            ))}
                            <div style={{ gridColumn: '1 / -1' }}>
                                <Field label={mt('specReference')}>
                                    <div className={formStyles.formInput} style={{ ...VALUE, whiteSpace: 'pre-wrap' }}>{item.specReference || '—'}</div>
                                </Field>
                            </div>
                        </section>
                    </div>
                </div>
                <FormActions
                    tools={<button className={actionStyles.secondary} type="button" onClick={() => setPrinting(true)} disabled={photos === null && !error}
                                   data-testid="approved-print">{t('common.print') || 'Print'}</button>}
                    cancel={<button className={actionStyles.secondary} type="button" onClick={onClose}>{t('common.close')}</button>}
                    primary={canManage ? <button className={actionStyles.primary} type="button" onClick={onEdit} data-testid="approved-edit">{mt('edit')}</button> : undefined}
                />
            </div>
            {printing && ReactDOM.createPortal(
                <MaterialPrintTemplate item={item}
                                       photos={(photos ?? []).map((p) => ({ url: getAuthenticatedFileUrl(p.file_url), name: p.file_name }))} />,
                document.body,
            )}
        </div>
    );
};

export default ApprovedMaterialModal;
