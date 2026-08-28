import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import ReactDOM from 'react-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { getUsers, getEntityFiles, getAuthenticatedFileUrl, type User as ApiUser } from '../../services/api';
import type { OSDItem } from '../../store/osdStore';
import FileAttachment from '../Shared/FileAttachment';
import ImagePreviewOverlay from '../Shared/ImagePreviewOverlay';
import OSDPrintTemplate from './OSDPrintTemplate';
import './OSD.print.css';
import formStyles from '../Shared/FormShell.module.css';
import { osdFormSchema, emptyOSDForm, toFormValues, OSD_ERROR_FALLBACKS } from './osdFormSchema';
import { checkDateOrder } from '../../utils/dateValidation';
import type { OSDDetailData } from './osdFormSchema';

export type { OSDDetailData };

export interface PendingUploads {
    category: string;
    files: File[];
}

export interface OSDDetailModalProps {
    osdId: string | null;
    existingItem?: OSDItem;
    onSave: (details: OSDDetailData, pendingUploads: PendingUploads[], deletedFileIds: string[]) => void | Promise<void>;
    onClose: () => void;
    /** Open the form locked for viewing only — every field disabled, no Save.
     *  Driven by the caller from IAM permission + record status. */
    readOnly?: boolean;
}

export const OSDDetailModal: React.FC<OSDDetailModalProps> = ({ osdId: _osdId, existingItem, onSave, onClose, readOnly = false }) => {
    const { t } = useLanguage();
    const { getActiveContractors } = useContractorsStore();

    const {
        register, handleSubmit, watch, setValue, getValues,
        formState: { errors },
    } = useForm<OSDDetailData>({
        resolver: zodResolver(osdFormSchema),
        defaultValues: existingItem ? toFormValues(existingItem) : emptyOSDForm,
    });

    // "Void" is a manual override on top of the picked status (withdrawn report).
    const [voided, setVoided] = useState(() => existingItem?.status === 'Void');

    // File handling
    const [pendingDefectPhotos, setPendingDefectPhotos] = useState<File[]>([]);
    const [pendingImprovementPhotos, setPendingImprovementPhotos] = useState<File[]>([]);
    const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
    const [deletedFileIds, setDeletedFileIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState<string>('');
    const handlePreview = (url: string, name?: string) => {
        setPreviewUrl(url);
        setPreviewName(name || '');
    };

    // Print: mount the report portal, print, unmount (same pattern as OBS/NCR).
    const [isPrinting, setIsPrinting] = useState(false);
    const [printData, setPrintData] = useState<OSDDetailData | null>(null);
    const [printDefectPhotos, setPrintDefectPhotos] = useState<string[]>([]);
    const [printImprovementPhotos, setPrintImprovementPhotos] = useState<string[]>([]);
    useEffect(() => {
        if (!isPrinting) return;
        const timer = setTimeout(() => window.print(), 200);
        const onAfterPrint = () => setIsPrinting(false);
        window.addEventListener('afterprint', onAfterPrint);
        return () => { clearTimeout(timer); window.removeEventListener('afterprint', onAfterPrint); };
    }, [isPrinting]);

    const handlePrintClick = async () => {
        const current = getValues();
        const legacyDefect = (current.defectPhotos || []).filter((p): p is string => typeof p === 'string');
        const legacyImprove = (current.improvementPhotos || []).filter((p): p is string => typeof p === 'string');
        let defect = legacyDefect;
        let improve = legacyImprove;
        if (existingItem?.id) {
            try {
                const [d, i] = await Promise.all([
                    getEntityFiles('osd', existingItem.id, 'defectPhoto'),
                    getEntityFiles('osd', existingItem.id, 'improvementPhoto'),
                ]);
                defect = [...legacyDefect, ...d.map(f => f.file_url)];
                improve = [...legacyImprove, ...i.map(f => f.file_url)];
            } catch {/* fall back to legacy arrays */}
        }
        setPrintData(current);
        setPrintDefectPhotos(defect.map(getAuthenticatedFileUrl));
        setPrintImprovementPhotos(improve.map(getAuthenticatedFileUrl));
        setIsPrinting(true);
    };

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

    const errText = (field: keyof OSDDetailData) => {
        const msg = errors[field]?.message as string | undefined;
        if (!msg) return null;
        return (
            <p style={{ color: '#dc2626', fontSize: 12, margin: '4px 0 0', lineHeight: 1.4 }}>
                {t(msg) || OSD_ERROR_FALLBACKS[msg] || msg}
            </p>
        );
    };

    const labelStyle = { display: 'inline-flex', alignItems: 'center', gap: 6 } as const;

    const removeLegacy = (key: 'defectPhotos' | 'improvementPhotos' | 'attachments', index: number) => {
        const next = (getValues(key) || []).filter((_, i) => i !== index);
        setValue(key, next, { shouldDirty: true });
    };
    const deleteExisting = (key: 'defectPhotos' | 'improvementPhotos' | 'attachments', id: string) => {
        setDeletedFileIds(prev => [...prev, id]);
        setValue(key, (getValues(key) || []).filter((a: any) => typeof a === 'string' || a?.id !== id), { shouldDirty: true });
    };

    const onValid = async (values: OSDDetailData) => {
        const finalStatus = voided ? 'Void' : values.status;
        // On close, stamp the close-out date with today if left blank.
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const closeoutDate = finalStatus === 'Closed' && !values.closeoutDate ? todayStr : values.closeoutDate;
        setSaving(true);
        try {
            await onSave({ ...values, status: finalStatus, closeoutDate }, [
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
        const fields = Object.keys(errs);
        if (!fields.length) return;
        const labelOf = (f: string) => (({
            itemDescription: t('osd.itemDescription'),
        } as Record<string, string>)[f] || f);
        toast.warning(`請補齊必填欄位 / Complete required: ${fields.map(labelOf).join('、')}`);
        const el = document.querySelector(`[name="${fields[0]}"]`) as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // Every other OSD date is expected on/after raiseDate — flag (don't
    // block) anything that lands before it, e.g. a closeoutDate typo'd to
    // predate when the report was even raised.
    const dateFieldLabels: Partial<Record<keyof OSDDetailData, string>> = {
        dueDate: t('common.dueDate') || 'Due Date',
        correctiveActionTargetDate: t('osd.correctiveActionTargetDate') || 'Corrective Action Target Date',
        resolvedDate: t('osd.resolvedDate') || 'Resolved Date',
        closeoutDate: t('osd.closeoutDate') || 'Closeout Date',
    };

    const dateInput = (field: keyof OSDDetailData) => (
        <input
            {...register(field)}
            type={watch(field) ? 'date' : 'text'}
            placeholder="mm/dd/yyyy"
            lang="en"
            onFocus={(e) => (e.target.type = 'date')}
            onBlur={(e) => {
                if (!e.target.value) e.target.type = 'text';
                const label = dateFieldLabels[field];
                if (label) {
                    const check = checkDateOrder(getValues('raiseDate'), e.target.value, t('osd.raiseDate') || 'Raise Date', label);
                    if (!check.valid) toast.warning(check.message);
                }
            }}
            className={formStyles.formInput}
        />
    );

    // Voiding withdraws the report, so no fields are required — bypass the
    // zod resolver and save the current values directly. Otherwise validate.
    const handleSaveClick = () => {
        if (voided) {
            void onValid(getValues());
        } else {
            void handleSubmit(onValid, onInvalid)();
        }
    };

    const derivedStatus = voided ? 'Void' : watch('status');
    const statusText = ({
        'Open': t('status.open'), 'Resolved': t('status.resolved'),
        'Closed': t('status.closed'), 'Void': t('status.void'),
    } as Record<string, string>)[derivedStatus] || derivedStatus;

    return (
        <div className={formStyles.modalOverlay}>
            <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={formStyles.modalHeader}>
                    <h2>{readOnly ? '檢視 OSD / View OSD' : existingItem ? t('osd.editTitle') : t('osd.addTitle')}</h2>
                    <button className={formStyles.closeButton} onClick={onClose} disabled={saving}>×</button>
                </div>
                <div className={formStyles.modalBody}>
                    {!readOnly && (
                        <p className={formStyles.formRequiredHint}>{t('form.requiredHint')}</p>
                    )}
                    <datalist id="osd-people">
                        {peopleSuggestions.map(name => <option key={name} value={name} />)}
                    </datalist>
                    <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }}>
                    <div className={formStyles.formSections}>
                        {/* ===== 1. 基本資訊 / Identification ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>基本資訊 / Identification</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('osd.refNo')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={watch('osdNumber') || t('form.autoGenerated')}
                                        readOnly
                                        style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: watch('osdNumber') ? '#000000' : '#666666' }}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label style={labelStyle}>
                                        <span>{t('osd.status')}</span>
                                    </label>
                                    {voided ? (
                                        <div className={formStyles.readOnlyField}>{statusText}</div>
                                    ) : (
                                        <select className={formStyles.formSelect} {...register('status')}>
                                            <option value="Open">{t('status.open')}</option>
                                            <option value="Resolved">{t('status.resolved')}</option>
                                            <option value="Closed">{t('status.closed')}</option>
                                        </select>
                                    )}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('osd.contractor')}</label>
                                    <select className={formStyles.formSelect} {...register('contractor')}>
                                        <option value="">{t('obs.contractorPlaceholder')}</option>
                                        {getActiveContractors().map((c) => (
                                            <option key={c.id} value={c.name}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('osd.deliveryNoteNo')}</label>
                                    <input type="text" className={formStyles.formInput} {...register('deliveryNoteNo')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('osd.poNumber')}</label>
                                    <input type="text" className={formStyles.formInput} {...register('poNumber')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('osd.raisedBy')}</label>
                                    <input type="text" className={formStyles.formInput} list="osd-people" {...register('raisedBy')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('osd.raiseDate')}</label>
                                    {dateInput('raiseDate')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('common.dueDate')}</label>
                                    {dateInput('dueDate')}
                                </div>
                            </div>
                        </div>

                        {/* ===== 2. 到貨明細 / Delivery Detail ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>到貨明細 / Delivery Detail</h3>
                            <div className={formStyles.formGrid}>
                                <div className={`${formStyles.formGroup} ${formStyles.formGroupFull}`}>
                                    <label>{t('osd.itemDescription')} <span style={{ color: '#dc2626' }}>*</span></label>
                                    <input type="text" className={formStyles.formInput} {...register('itemDescription')} />
                                    {errText('itemDescription')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('osd.expectedQty')}</label>
                                    <input type="text" className={formStyles.formInput} {...register('expectedQty')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('osd.receivedQty')}</label>
                                    <input type="text" className={formStyles.formInput} {...register('receivedQty')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('osd.unit')}</label>
                                    <input type="text" className={formStyles.formInput} {...register('unit')} />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label className={formStyles.optionalLabel}>{t('osd.damageDescription')}</label>
                                    <textarea className={formStyles.formTextarea} rows={3} {...register('damageDescription')} />
                                </div>
                            </div>
                        </div>

                        {/* ===== 3. 收斂 / Disposition & Corrective Action ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>收斂 / Disposition &amp; Corrective Action</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('osd.disposition')}</label>
                                    <select className={formStyles.formSelect} {...register('disposition')}>
                                        <option value="">{t('osd.dispositionPlaceholder')}</option>
                                        <option value="Accept">{t('osd.disposition.accept')}</option>
                                        <option value="Reject">{t('osd.disposition.reject')}</option>
                                        <option value="UseAsIs">{t('osd.disposition.useAsIs')}</option>
                                        <option value="ReturnToSupplier">{t('osd.disposition.returnToSupplier')}</option>
                                        <option value="Replace">{t('osd.disposition.replace')}</option>
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('osd.correctiveActionOwner')}</label>
                                    <input type="text" className={formStyles.formInput} list="osd-people" {...register('correctiveActionOwner')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('osd.correctiveActionTargetDate')}</label>
                                    {dateInput('correctiveActionTargetDate')}
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label className={formStyles.optionalLabel}>{t('osd.correctiveAction')}</label>
                                    <textarea className={formStyles.formTextarea} rows={3} {...register('correctiveAction')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('osd.resolvedBy')}</label>
                                    <input type="text" className={formStyles.formInput} list="osd-people" {...register('resolvedBy')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('osd.resolvedDate')}</label>
                                    {dateInput('resolvedDate')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('osd.closeoutDate')}</label>
                                    {dateInput('closeoutDate')}
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, cursor: 'pointer' }}>
                                        <input type="checkbox" checked={voided} onChange={(e) => setVoided(e.target.checked)} />
                                        <span>作廢此報告 / Void this report</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* ===== 備註 / Remark ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>備註 / Remark</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroupFull}>
                                    <label className={formStyles.optionalLabel}>{t('common.remark')}</label>
                                    <textarea className={formStyles.formTextarea} rows={3} {...register('remark')} />
                                </div>
                            </div>
                        </div>

                        {/* ===== 4. 照片與附件 / Photos & Attachments ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>照片與附件 / Photos &amp; Attachments</h3>
                            <FileAttachment
                                id="osd-defect-photos"
                                category="defectPhoto"
                                entityType={existingItem ? 'osd' : undefined}
                                entityId={existingItem?.id}
                                title={t('osd.defectPhotos')}
                                legacyAttachments={watch('defectPhotos')}
                                onPendingFilesChange={setPendingDefectPhotos}
                                onDeleteExistingFile={(id) => deleteExisting('defectPhotos', id)}
                                onRemoveLegacy={(index) => removeLegacy('defectPhotos', index)}
                                onPreview={handlePreview}
                                accept="image/*"
                            />
                            <FileAttachment
                                id="osd-improvement-photos"
                                category="improvementPhoto"
                                entityType={existingItem ? 'osd' : undefined}
                                entityId={existingItem?.id}
                                title={t('osd.improvementPhotos')}
                                legacyAttachments={watch('improvementPhotos')}
                                onPendingFilesChange={setPendingImprovementPhotos}
                                onDeleteExistingFile={(id) => deleteExisting('improvementPhotos', id)}
                                onRemoveLegacy={(index) => removeLegacy('improvementPhotos', index)}
                                onPreview={handlePreview}
                                accept="image/*"
                            />
                            <FileAttachment
                                id="osd-attachments"
                                category="attachment"
                                entityType={existingItem ? 'osd' : undefined}
                                entityId={existingItem?.id}
                                title={t('osd.attachments')}
                                legacyAttachments={watch('attachments')}
                                onPendingFilesChange={setPendingAttachments}
                                onDeleteExistingFile={(id) => deleteExisting('attachments', id)}
                                onRemoveLegacy={(index) => removeLegacy('attachments', index)}
                                onPreview={handlePreview}
                            />
                        </div>
                    </div>
                    </fieldset>
                </div>
                <div className={formStyles.modalActions}>
                    {!readOnly && (
                        <button type="button" className={formStyles.saveButton} onClick={handleSaveClick} disabled={saving}>
                            {saving ? t('osd.saving') : t('common.save')}
                        </button>
                    )}
                    <button type="button" className={formStyles.printButton} onClick={handlePrintClick} disabled={saving} title={t('common.print') || 'Print'}>
                        {t('common.print') || 'Print'}
                    </button>
                    <button type="button" className={formStyles.cancelButton} onClick={onClose} disabled={saving}>
                        {t('common.cancel')}
                    </button>
                </div>
            </div>
            {isPrinting && printData && ReactDOM.createPortal(
                <OSDPrintTemplate
                    data={printData}
                    defectPhotos={printDefectPhotos}
                    improvementPhotos={printImprovementPhotos}
                />,
                document.body
            )}
            {previewUrl && (
                <ImagePreviewOverlay key={previewUrl} url={previewUrl} name={previewName} onClose={() => setPreviewUrl(null)} />
            )}
        </div>
    );
};
