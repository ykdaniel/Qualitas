import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import ReactDOM from 'react-dom';
import { getUsers, getEntityFiles, getAuthenticatedFileUrl, type User as ApiUser } from '../../services/api';
import type { OBSItem } from '../../store/obsStore';
import FileAttachment from '../Shared/FileAttachment';
import ImagePreviewOverlay from '../Shared/ImagePreviewOverlay';
import OBSPrintTemplate from './OBSPrintTemplate';
import './OBS.print.css';
import formStyles from '../Shared/FormShell.module.css';
import { obsFormSchema, emptyOBSForm, toFormValues, deriveOBSStatus, OBS_ERROR_FALLBACKS } from './obsFormSchema';
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
    /** Open the form locked for viewing only — every field disabled, no Save.
     *  Driven by the caller from IAM permission + record status. */
    readOnly?: boolean;
}

export const OBSDetailModal: React.FC<OBSDetailModalProps> = ({ obsId: _obsId, existingItem, onSave, onClose, readOnly = false }) => {
    const { t } = useLanguage();
    const { getActiveContractors } = useContractorsStore();

    const {
        register, handleSubmit, watch, setValue, getValues,
        formState: { errors },
    } = useForm<OBSDetailData>({
        resolver: zodResolver(obsFormSchema),
        defaultValues: existingItem ? toFormValues(existingItem) : emptyOBSForm,
    });

    // The form was one long single-scroll modal (5 sections) — split into tabs
    // grouped along the existing section boundaries, mirroring NCRModals.tsx's
    // tab split so the two sibling "raise a finding" forms navigate the same
    // way. Remark folds into the closure tab, same as NCR does.
    type OBSTabId = 'basic' | 'description' | 'response' | 'closure' | 'attachments';
    const TABS: { id: OBSTabId; label: string }[] = [
        { id: 'basic', label: '基本資訊 / Identification' },
        { id: 'description', label: '觀察描述 / Description' },
        { id: 'response', label: '處置 / Response' },
        { id: 'attachments', label: '照片與附件 / Photos & Attachments' },
        { id: 'closure', label: '驗證與結案 / Verification & Closure' },
    ];
    const FIELD_TAB: Partial<Record<keyof OBSDetailData, OBSTabId>> = {
        subject: 'basic',
        detailsDescription: 'description',
    };
    const [activeTab, setActiveTab] = useState<OBSTabId>('basic');
    const tabsWithErrors = new Set(
        Object.keys(errors).map((f) => FIELD_TAB[f as keyof OBSDetailData]).filter(Boolean)
    );
    const modalBodyRef = useRef<HTMLDivElement>(null);
    const goToTab = (tab: OBSTabId) => {
        setActiveTab(tab);
        modalBodyRef.current?.scrollTo({ top: 0 });
    };

    // Status is derived from the Verification & Closure state (not picked
    // manually); "Void" is a manual override.
    const [voided, setVoided] = useState(() => existingItem?.status === 'Void');

    // File handling
    const [pendingDefectPhotos, setPendingDefectPhotos] = useState<File[]>([]);
    const [pendingImprovementPhotos, setPendingImprovementPhotos] = useState<File[]>([]);
    const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
    const [deletedFileIds, setDeletedFileIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    // Attachment image preview (parity with NCR).
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState<string>('');
    const handlePreview = (url: string, name?: string) => {
        setPreviewUrl(url);
        setPreviewName(name || '');
    };

    // Print: mount the report portal, print, unmount (same pattern as NCR).
    const [isPrinting, setIsPrinting] = useState(false);
    const [printData, setPrintData] = useState<OBSDetailData | null>(null);
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
                    getEntityFiles('obs', existingItem.id, 'defectPhoto'),
                    getEntityFiles('obs', existingItem.id, 'improvementPhoto'),
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

    const errText = (field: keyof OBSDetailData) => {
        const msg = errors[field]?.message as string | undefined;
        if (!msg) return null;
        return (
            <p style={{ color: '#dc2626', fontSize: 12, margin: '4px 0 0', lineHeight: 1.4 }}>
                {t(msg) || OBS_ERROR_FALLBACKS[msg] || msg}
            </p>
        );
    };

    // Small circled "!" holding a field's help note in a hover tooltip — keeps the
    // form clean (same pattern as the NCR form).
    const infoDot = (text: string) => (
        <span
            title={text}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: '50%', border: '1px solid #9ca3af', color: '#6b7280', fontSize: 10, fontWeight: 700, lineHeight: 1, cursor: 'help', flex: '0 0 auto' }}
        >!</span>
    );
    const labelStyle = { display: 'inline-flex', alignItems: 'center', gap: 6 } as const;

    const removeLegacy = (key: 'defectPhotos' | 'improvementPhotos' | 'attachments', index: number) => {
        const next = (getValues(key) || []).filter((_, i) => i !== index);
        setValue(key, next, { shouldDirty: true });
    };
    const deleteExisting = (key: 'defectPhotos' | 'improvementPhotos' | 'attachments', id: string) => {
        setDeletedFileIds(prev => [...prev, id]);
        setValue(key, (getValues(key) || []).filter((a: any) => typeof a === 'string' || a?.id !== id), { shouldDirty: true });
    };

    const onValid = async (values: OBSDetailData) => {
        const finalStatus = voided ? 'Void' : deriveOBSStatus(values);
        // Closure photo gate: an OBS can only close with BOTH an observation
        // (defect) photo and an improvement photo as evidence. Voided records are
        // withdrawn so they skip it. Photos may be already-saved server files,
        // pending uploads in this save, or legacy URL strings on the record.
        if (!voided && finalStatus === 'Closed') {
            const legacyCount = (key: 'defectPhotos' | 'improvementPhotos') =>
                ((getValues(key) as unknown[]) || []).filter(a => typeof a === 'string').length;
            let serverDefect = 0, serverImprove = 0;
            if (existingItem?.id) {
                try {
                    const [d, i] = await Promise.all([
                        getEntityFiles('obs', existingItem.id, 'defectPhoto'),
                        getEntityFiles('obs', existingItem.id, 'improvementPhoto'),
                    ]);
                    const del = new Set(deletedFileIds);
                    serverDefect = d.filter(f => !del.has(f.id)).length;
                    serverImprove = i.filter(f => !del.has(f.id)).length;
                } catch {/* fall back to pending + legacy counts */}
            }
            const defectTotal = serverDefect + pendingDefectPhotos.length + legacyCount('defectPhotos');
            const improveTotal = serverImprove + pendingImprovementPhotos.length + legacyCount('improvementPhotos');
            const missing: string[] = [];
            if (defectTotal === 0) missing.push(t('obs.defectPhotos') || '觀察照片');
            if (improveTotal === 0) missing.push(t('obs.improvementPhotos') || '改善照片');
            if (missing.length) {
                toast.warning(`結案需附照片 / Closure requires both photos: ${missing.join('、')}`);
                return;
            }
        }
        // On close, stamp the close-out / verified dates with today if left blank.
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const closeoutDate = finalStatus === 'Closed' && !values.closeoutDate ? todayStr : values.closeoutDate;
        const verifiedDate = values.verified === 'Verified' && !values.verifiedDate ? todayStr : values.verifiedDate;
        setSaving(true);
        try {
            await onSave({ ...values, status: finalStatus, closeoutDate, verifiedDate }, [
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
            subject: t('obs.subject'),
            detailsDescription: t('obs.detailsDescription'),
        } as Record<string, string>)[f] || f);
        toast.warning(`請補齊必填欄位 / Complete required: ${fields.map(labelOf).join('、')}`);
        const firstTab = FIELD_TAB[fields[0] as keyof OBSDetailData];
        if (firstTab) goToTab(firstTab);
        setTimeout(() => {
            const el = document.querySelector(`[name="${fields[0]}"]`) as HTMLElement | null;
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, firstTab ? 50 : 0);
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

    // Voiding withdraws the observation, so no fields are required — bypass the
    // zod resolver and save the current values directly. Otherwise validate.
    const handleSaveClick = () => {
        if (voided) {
            void onValid(getValues());
        } else {
            void handleSubmit(onValid, onInvalid)();
        }
    };

    // Live status badge — derived from verification & closure (Void = override).
    const derivedStatus = voided
        ? 'Void'
        : deriveOBSStatus({ verified: watch('verified') });
    const statusText = ({
        'Open': t('status.open'), 'In Progress': t('status.inProgress'),
        'Resolved': t('status.resolved'), 'Closed': t('status.closed'), 'Void': t('status.void'),
    } as Record<string, string>)[derivedStatus] || derivedStatus;

    return (
        <div className={formStyles.modalOverlay}>
            <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={formStyles.modalHeader}>
                    <h2>{readOnly ? '檢視觀察 / View Observation' : existingItem ? t('obs.editTitle') : t('obs.addTitle')}</h2>
                    <button className={formStyles.closeButton} onClick={onClose} disabled={saving}>×</button>
                </div>
                <div className={formStyles.tabsContainer}>
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`${formStyles.tabButton} ${activeTab === tab.id ? formStyles.activeTab : ''}`}
                            onClick={() => goToTab(tab.id)}
                        >
                            {tab.label}
                            {tabsWithErrors.has(tab.id) && (
                                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#dc2626', marginLeft: 6, verticalAlign: 'middle' }} />
                            )}
                        </button>
                    ))}
                </div>
                <div className={formStyles.modalBody} ref={modalBodyRef}>
                    {!readOnly && (
                        <p className={formStyles.formRequiredHint}>{t('form.requiredHint')}</p>
                    )}
                    <datalist id="obs-people">
                        {peopleSuggestions.map(name => <option key={name} value={name} />)}
                    </datalist>
                    {/* A single disabled fieldset locks every field/button below in
                        one shot when readOnly. */}
                    <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }}>
                    {activeTab === 'basic' && (
                    <div className={formStyles.formSections}>
                        {/* ===== 1. 基本資訊 / Identification ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>基本資訊 / Identification <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>（開立人 / QC）</span></h3>
                            <div className={formStyles.formGrid}>
                                {/* 系統自動 */}
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
                                    <label style={labelStyle}>
                                        <span>{t('obs.status')}</span>
                                        {infoDot('由「驗證與結案」自動判定 / auto-set from Verification & Closure')}
                                    </label>
                                    <div className={formStyles.readOnlyField}>{statusText}</div>
                                </div>
                                {/* 分類 */}
                                <div className={`${formStyles.formGroup} ${formStyles.formGroupFull}`}>
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
                                {/* 單位／人 */}
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
                                    <label>{t('obs.raisedBy')}</label>
                                    <input type="text" className={formStyles.formInput} list="obs-people" {...register('raisedBy')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.foundBy')}</label>
                                    <input type="text" className={formStyles.formInput} list="obs-people" {...register('foundBy')} />
                                </div>
                                {/* 日期 */}
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.raiseDate')}</label>
                                    {dateInput('raiseDate')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('common.dueDate')}</label>
                                    {dateInput('dueDate')}
                                </div>
                                {/* 地點 */}
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.foundLocation')}</label>
                                    <input type="text" className={formStyles.formInput} {...register('foundLocation')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('ncr.aconex')}</label>
                                    <input type="text" className={formStyles.formInput} {...register('aconex')} />
                                </div>
                            </div>
                        </div>
                    </div>
                    )}

                    {activeTab === 'description' && (
                    <div className={formStyles.formSections}>
                        {/* ===== 2. 觀察描述 / Description ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>觀察描述 / Description <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>（開立人 / QC）</span></h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('obs.detailsDescription')} <span style={{ color: '#dc2626' }}>*</span></label>
                                    <textarea className={formStyles.formTextarea} rows={4} {...register('detailsDescription')} />
                                    {errText('detailsDescription')}
                                </div>
                            </div>
                        </div>
                    </div>
                    )}

                    {activeTab === 'response' && (
                    <div className={formStyles.formSections}>
                        {/* ===== 3. 處置 / Response ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>處置 / Response <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>（承包商 / Contractor）</span></h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('obs.actionTaken') || 'Action Taken'}</label>
                                    <textarea className={formStyles.formTextarea} rows={2} {...register('productDisposition')} />
                                </div>
                            </div>
                        </div>
                    </div>
                    )}

                    {activeTab === 'attachments' && (
                    <div className={formStyles.formSections}>
                        {/* ===== 5. 照片與附件 / Photos & Attachments ===== */}
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
                                onPreview={handlePreview}
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
                                onPreview={handlePreview}
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
                                onPreview={handlePreview}
                            />
                        </div>
                    </div>
                    )}

                    {activeTab === 'closure' && (
                    <div className={formStyles.formSections}>
                        {/* ===== 4. 驗證與結案 / Verification & Closure ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>驗證與結案 / Verification &amp; Closure <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>（QC）</span></h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label style={labelStyle}>
                                        <span>{t('obs.verified') || 'Verified'}</span>
                                        {infoDot('設為 Verified 即結案；Rejected 退回處理中 / Set to "Verified" to close; "Rejected" routes it back to In Progress.')}
                                    </label>
                                    <select className={formStyles.formSelect} {...register('verified')}>
                                        <option value="Pending">{t('ncr.effectiveness.pending') || '待驗證 Pending'}</option>
                                        <option value="Verified">通過 Verified</option>
                                        <option value="Rejected">退回 Rejected</option>
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('obs.verifiedDate') || 'Verified Date'}</label>
                                    {dateInput('verifiedDate')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('obs.closeoutDate')}</label>
                                    {dateInput('closeoutDate')}
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, cursor: 'pointer' }}>
                                        <input type="checkbox" checked={voided} onChange={(e) => setVoided(e.target.checked)} />
                                        <span>作廢此觀察 / Void this observation</span>
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
                    </div>
                    )}
                    </fieldset>
                </div>
                <div className={formStyles.modalActions}>
                    {!readOnly && (
                        <button type="button" className={formStyles.saveButton} onClick={handleSaveClick} disabled={saving}>
                            {saving ? t('obs.saving') : t('common.save')}
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
                <OBSPrintTemplate
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
