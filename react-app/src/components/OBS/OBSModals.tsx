import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useITRStore } from '../../store/itrStore';
import { useNOIStore } from '../../store/noiStore';
import { getUsers, type User as ApiUser } from '../../services/api';
import type { OBSItem } from '../../store/obsStore';
import FileAttachment from '../Shared/FileAttachment';
import formStyles from '../Shared/FormShell.module.css';
import { obsFormSchema, emptyOBSForm, toFormValues, OBS_ERROR_FALLBACKS } from './obsFormSchema';
import type { OBSDetailData } from './obsFormSchema';

// OBSDetailData lives with the zod schema (single source of truth). Re-export so
// OBS.tsx keeps importing it from here.
export type { OBSDetailData };

export interface PendingUploads {
    category: string;
    files: File[];
}

export interface OBSDetailModalProps {
    obsId: string | null;
    existingItem?: OBSItem;
    onSave: (details: OBSDetailData, pendingUploads: PendingUploads[], deletedFileIds: string[]) => void | Promise<void>;
    onClose: () => void;
}

export const OBSDetailModal: React.FC<OBSDetailModalProps> = ({ obsId: _obsId, existingItem, onSave, onClose }) => {
    const { t } = useLanguage();
    const { getActiveContractors } = useContractorsStore();
    const itrList = useITRStore(s => s.itrList);
    const fetchITRs = useITRStore(s => s.fetchITRs);
    const noiList = useNOIStore(s => s.noiList);
    const fetchNOIs = useNOIStore(s => s.fetchNOIs);
    useEffect(() => { fetchITRs(); fetchNOIs(); }, [fetchITRs, fetchNOIs]);

    const {
        register, handleSubmit, watch, setValue, getValues,
        formState: { errors },
    } = useForm<OBSDetailData>({
        resolver: zodResolver(obsFormSchema),
        defaultValues: existingItem ? toFormValues(existingItem) : emptyOBSForm,
    });

    // File handling
    const [pendingDefectPhotos, setPendingDefectPhotos] = useState<File[]>([]);
    const [pendingImprovementPhotos, setPendingImprovementPhotos] = useState<File[]>([]);
    const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
    const [deletedFileIds, setDeletedFileIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    // People autocomplete: system users + active contractors. Stays free text
    // (site/contractor staff aren't always system users) — datalist just helps.
    const [users, setUsers] = useState<ApiUser[]>([]);
    useEffect(() => {
        let alive = true;
        getUsers().then(u => { if (alive) setUsers(u); }).catch(() => {/* non-fatal */});
        return () => { alive = false; };
    }, []);
    const peopleSuggestions = Array.from(new Set([
        ...users.map(u => u.full_name || u.username),
        ...getActiveContractors().map(c => c.name),
    ].filter(Boolean)));

    const errText = (field: keyof OBSDetailData) => {
        const msg = errors[field]?.message as string | undefined;
        if (!msg) return null;
        return (
            <p style={{ color: '#dc2626', fontSize: 12, margin: '4px 0 0', lineHeight: 1.4 }}>
                {t(msg) || OBS_ERROR_FALLBACKS[msg] || msg}
            </p>
        );
    };

    const removeLegacy = (key: 'defectPhotos' | 'improvementPhotos' | 'attachments', index: number) => {
        const next = (getValues(key) || []).filter((_, i) => i !== index);
        setValue(key, next, { shouldDirty: true });
    };
    const deleteExisting = (key: 'defectPhotos' | 'improvementPhotos' | 'attachments', id: string) => {
        setDeletedFileIds(prev => [...prev, id]);
        setValue(key, (getValues(key) || []).filter((a: any) => typeof a === 'string' || a?.id !== id), { shouldDirty: true });
    };

    const onValid = async (values: OBSDetailData) => {
        setSaving(true);
        try {
            await onSave(values, [
                { category: 'defectPhoto', files: pendingDefectPhotos },
                { category: 'improvementPhoto', files: pendingImprovementPhotos },
                { category: 'attachment', files: pendingAttachments },
            ], deletedFileIds);
            onClose();
        } catch (err) {
            toast.error((err as Error)?.message || t('common.saveFailed'));
        } finally {
            setSaving(false);
        }
    };
    const onInvalid = (errs: typeof errors) => {
        const first = Object.values(errs).map((e: any) => e?.message).filter(Boolean)[0] as string | undefined;
        if (first) toast.warning(t(first) || OBS_ERROR_FALLBACKS[first] || first);
    };

    const dateInput = (field: keyof OBSDetailData) => (
        <input
            {...register(field)}
            type={watch(field) ? 'date' : 'text'}
            placeholder="mm/dd/yyyy"
            lang="en"
            onFocus={(e) => (e.target.type = 'date')}
            onBlur={(e) => { if (!e.target.value) e.target.type = 'text'; }}
            className={formStyles.formInput}
        />
    );

    return (
        <div className={formStyles.modalOverlay}>
            <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={formStyles.modalHeader}>
                    <h2>{existingItem ? t('obs.editTitle') : t('obs.addTitle')}</h2>
                    <button className={formStyles.closeButton} onClick={onClose} disabled={saving}>×</button>
                </div>
                <div className={formStyles.modalBody}>
                    <p className={formStyles.formRequiredHint}>{t('form.requiredHint')}</p>
                    <datalist id="obs-people">
                        {peopleSuggestions.map(name => <option key={name} value={name} />)}
                    </datalist>
                    <div className={formStyles.formSections}>
                        {/* ===== 1. 觀察資訊 / Observation ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>觀察資訊 / Observation</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.refNo')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={watch('obsNumber') || t('form.autoGenerated')}
                                        readOnly
                                        style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: watch('obsNumber') ? '#000000' : '#666666' }}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.status')}</label>
                                    <select className={formStyles.formSelect} {...register('status')}>
                                        <option value="Open">{t('status.open')}</option>
                                        <option value="In Progress">{t('status.inProgress')}</option>
                                        <option value="Resolved">{t('status.resolved')}</option>
                                        <option value="Closed">{t('status.closed')}</option>
                                        <option value="Void">{t('status.void')}</option>
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.subject')} <span style={{ color: '#dc2626' }}>*</span></label>
                                    <input type="text" className={formStyles.formInput} {...register('subject')} />
                                    {errText('subject')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.type')}</label>
                                    <select className={formStyles.formSelect} {...register('type')}>
                                        <option value="">{t('obs.typePlaceholder')}</option>
                                        <option value="Design">{t('ncr.type.design')}</option>
                                        <option value="Material">{t('ncr.type.material')}</option>
                                        <option value="Workmanship">{t('ncr.type.workmanship')}</option>
                                        <option value="Document">{t('ncr.type.document')}</option>
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.contractor')}</label>
                                    <select className={formStyles.formSelect} {...register('contractor')}>
                                        <option value="">{t('obs.contractorPlaceholder')}</option>
                                        {getActiveContractors().map((c) => (
                                            <option key={c.id} value={c.name}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.foundLocation')}</label>
                                    <input type="text" className={formStyles.formInput} {...register('foundLocation')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.foundBy')}</label>
                                    <input type="text" className={formStyles.formInput} list="obs-people" {...register('foundBy')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.raisedBy')}</label>
                                    <input type="text" className={formStyles.formInput} list="obs-people" {...register('raisedBy')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.raiseDate')}</label>
                                    {dateInput('raiseDate')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('common.dueDate')}</label>
                                    {dateInput('dueDate')}
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('obs.detailsDescription')} <span style={{ color: '#dc2626' }}>*</span></label>
                                    <textarea className={formStyles.formTextarea} rows={4} {...register('detailsDescription')} />
                                    {errText('detailsDescription')}
                                </div>
                            </div>
                        </div>

                        {/* ===== 2. 處理 / Response ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>處理 / Response</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('obs.recommendedAction') || 'Recommended Action'}</label>
                                    <textarea className={formStyles.formTextarea} rows={2} {...register('productDisposition')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('obs.closeoutDate')}</label>
                                    {dateInput('closeoutDate')}
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label className={formStyles.optionalLabel}>{t('common.remark')}</label>
                                    <textarea className={formStyles.formTextarea} rows={3} {...register('remark')} />
                                </div>
                            </div>
                        </div>

                        {/* ===== 3. 連結 / Links (optional) ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>連結 / Links（選填）</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.noiNo')}</label>
                                    <select className={formStyles.formSelect} {...register('noiNumber')}>
                                        <option value="">{t('ncr.noiNoPlaceholder') || '—'}</option>
                                        {noiList.map((noi) => (
                                            <option key={noi.id} value={noi.referenceNo}>{noi.referenceNo}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.itrNo')}</label>
                                    <select className={formStyles.formSelect} {...register('itrNumber')}>
                                        <option value="">—</option>
                                        {itrList.map((itr) => (
                                            <option key={itr.id} value={itr.documentNumber}>{itr.documentNumber}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* ===== 4. 照片與附件 / Photos & Attachments ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>照片與附件 / Photos &amp; Attachments</h3>
                            <FileAttachment
                                id="obs-defect-photos"
                                category="defectPhoto"
                                entityType={existingItem ? 'obs' : undefined}
                                entityId={existingItem?.id}
                                title={t('obs.defectPhotos')}
                                legacyAttachments={watch('defectPhotos')}
                                onPendingFilesChange={setPendingDefectPhotos}
                                onDeleteExistingFile={(id) => deleteExisting('defectPhotos', id)}
                                onRemoveLegacy={(index) => removeLegacy('defectPhotos', index)}
                                accept="image/*"
                            />
                            <FileAttachment
                                id="obs-improvement-photos"
                                category="improvementPhoto"
                                entityType={existingItem ? 'obs' : undefined}
                                entityId={existingItem?.id}
                                title={t('obs.improvementPhotos')}
                                legacyAttachments={watch('improvementPhotos')}
                                onPendingFilesChange={setPendingImprovementPhotos}
                                onDeleteExistingFile={(id) => deleteExisting('improvementPhotos', id)}
                                onRemoveLegacy={(index) => removeLegacy('improvementPhotos', index)}
                                accept="image/*"
                            />
                            <FileAttachment
                                id="obs-attachments"
                                category="attachment"
                                entityType={existingItem ? 'obs' : undefined}
                                entityId={existingItem?.id}
                                title={t('obs.attachments')}
                                legacyAttachments={watch('attachments')}
                                onPendingFilesChange={setPendingAttachments}
                                onDeleteExistingFile={(id) => deleteExisting('attachments', id)}
                                onRemoveLegacy={(index) => removeLegacy('attachments', index)}
                            />
                        </div>
                    </div>
                </div>
                <div className={formStyles.modalActions}>
                    <button type="button" className={formStyles.saveButton} onClick={handleSubmit(onValid, onInvalid)} disabled={saving}>
                        {saving ? t('obs.saving') : t('common.save')}
                    </button>
                    <button type="button" className={formStyles.cancelButton} onClick={onClose} disabled={saving}>
                        {t('common.cancel')}
                    </button>
                </div>
            </div>
        </div>
    );
};
