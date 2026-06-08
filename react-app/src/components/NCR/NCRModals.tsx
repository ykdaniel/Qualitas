import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { getUsers, getEntityFiles, getAuthenticatedFileUrl, type User as ApiUser } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useITRStore } from '../../store/itrStore';
import type { NCRItem } from '../../store/ncrStore';
import FileAttachment from '../Shared/FileAttachment';
import ImagePreviewOverlay from '../Shared/ImagePreviewOverlay';
import RelatedDocuments from '../ui/RelatedDocuments';
import styles from './NCR.module.css';

import ReactDOM from 'react-dom';
import NCRPrintTemplate from './NCRPrintTemplate';
import './NCR.print.css';
import formStyles from '../Shared/FormShell.module.css';
import { ncrFormSchema, emptyNCRForm, toFormValues, deriveNCRStatus, computeDueDate, NCR_ERROR_FALLBACKS } from './ncrFormSchema';
import type { NCRDetailData } from './ncrFormSchema';

// NCRDetailData now lives with the zod schema (single source of truth). Re-export
// it so existing importers (NCR.tsx, NCRPrintTemplate) keep working unchanged.
export type { NCRDetailData };

export interface PendingUploads {
    category: string;
    files: File[];
}

export interface NCRDetailModalProps {
    ncrId: string | null;
    existingItem?: NCRItem;
    onSave: (details: NCRDetailData, pendingUploads: PendingUploads[], deletedFileIds: string[]) => void | Promise<void>;
    onClose: () => void;
}

export const NCRDetailModal: React.FC<NCRDetailModalProps> = ({ ncrId: _ncrId, existingItem, onSave, onClose }) => {
    const { t } = useLanguage();
    const { getActiveContractors } = useContractorsStore();
    const itrList = useITRStore(state => state.itrList);

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        getValues,
        formState: { errors },
    } = useForm<NCRDetailData>({
        resolver: zodResolver(ncrFormSchema),
        defaultValues: existingItem ? toFormValues(existingItem) : emptyNCRForm,
    });

    // File handling states
    const [pendingDefectPhotos, setPendingDefectPhotos] = useState<File[]>([]);
    const [pendingImprovementPhotos, setPendingImprovementPhotos] = useState<File[]>([]);
    const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
    const [deletedFileIds, setDeletedFileIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    // Status is derived from the Verification & Closure state; Void is a manual override.
    const [voided, setVoided] = useState(() => existingItem?.status === 'Void');

    // The optional traceability/impact/description fields (everything except the
    // four required ones) collapse by default to declutter the form, but start
    // expanded when the record already has data in them so it isn't hidden.
    const [showDetailFields, setShowDetailFields] = useState(() => {
        const v = existingItem ? toFormValues(existingItem) : emptyNCRForm;
        return ([
            'lineNo', 'weldJointNo', 'heatBatchNo',
        ] as (keyof NCRDetailData)[]).some(k => Boolean(v[k]));
    });

    // Users for the assignedTo person picker (BACKLOG #13 #2 — FK to users)
    const [users, setUsers] = useState<ApiUser[]>([]);
    useEffect(() => {
        let alive = true;
        getUsers().then(u => { if (alive) setUsers(u); }).catch(() => {/* non-fatal */});
        return () => { alive = false; };
    }, []);
    const userLabel = (id: number | null) => {
        if (id == null) return '-';
        const u = users.find(x => x.id === id);
        return u ? (u.full_name || u.username) : `#${id}`;
    };

    // Formal print report (BACKLOG #15). Mount the report portal, print, unmount.
    const [isPrinting, setIsPrinting] = useState(false);
    const [printData, setPrintData] = useState<NCRDetailData | null>(null);
    const [printDefectPhotos, setPrintDefectPhotos] = useState<string[]>([]);
    const [printImprovementPhotos, setPrintImprovementPhotos] = useState<string[]>([]);
    useEffect(() => {
        if (!isPrinting) return;
        const timer = setTimeout(() => window.print(), 200);
        const onAfterPrint = () => setIsPrinting(false);
        window.addEventListener('afterprint', onAfterPrint);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('afterprint', onAfterPrint);
        };
    }, [isPrinting]);

    // Gather before/after photos (legacy array + uploaded attachments), resolve
    // to same-origin URLs, then trigger printing.
    const handlePrintClick = async () => {
        const current = getValues();
        const legacyDefect = (current.defectPhotos || []).filter((p): p is string => typeof p === 'string');
        const legacyImprove = (current.improvementPhotos || []).filter((p): p is string => typeof p === 'string');
        let defect = legacyDefect;
        let improve = legacyImprove;
        if (existingItem?.id) {
            try {
                const [d, i] = await Promise.all([
                    getEntityFiles('ncr', existingItem.id, 'defectPhoto'),
                    getEntityFiles('ncr', existingItem.id, 'improvementPhoto'),
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

    // 附件預覽
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState<string>('');
    const handlePreview = (url: string, name?: string) => {
        setPreviewUrl(url);
        setPreviewName(name || '');
    };

    const handleNAButton = (field: keyof NCRDetailData) => {
        setValue(field, 'Not Applicable', { shouldDirty: true });
    };

    const handleDateButton = (field: keyof NCRDetailData) => {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}_`;
        const cur = (getValues(field) as string) || '';
        setValue(field, cur ? `${cur}\n${dateStr}` : dateStr, { shouldDirty: true });
    };

    const handleTBCButton = (field: keyof NCRDetailData) => {
        setValue(field, 'To be confirmed', { shouldDirty: true });
    };

    const handleRemoveLegacyPhoto = (index: number, photoType: 'defect' | 'improvement') => {
        const key = photoType === 'defect' ? 'defectPhotos' : 'improvementPhotos';
        const next = (getValues(key) || []).filter((_, i) => i !== index);
        setValue(key, next, { shouldDirty: true });
    };

    const handleRemoveLegacyAttachment = (index: number) => {
        const next = (getValues('attachments') || []).filter((_, i) => i !== index);
        setValue('attachments', next, { shouldDirty: true });
    };

    // Two tiers of required, distinguished by colour:
    //   openStar  (red)   — required to raise/save at all.
    //   closeStar (amber) — required only to close (enforced when effectiveness=Yes).
    const openStar = <span style={{ color: '#dc2626' }} title="開立必填 / required to raise"> *</span>;
    const closeStar = <span style={{ color: '#d97706' }} title="結案必填 / required to close"> *</span>;
    const repairStar = watch('productDisposition') === 'Repair' ? closeStar : null;
    const recurrenceStar = watch('recurrence') === 'Yes' ? closeStar : null;

    // Name suggestions for the people fields (raisedBy / foundBy / CA & PA
    // owners). These stay free text — site/contractor staff aren't always system
    // users — but a datalist gives autocomplete to cut typos and keep names
    // consistent. Sourced from system users + active contractors.
    const peopleSuggestions = Array.from(new Set([
        ...users.map(u => u.full_name || u.username),
        ...getActiveContractors().map(c => c.name),
    ].filter(Boolean)));

    // Inline error text for a field (closure-gate messages are i18n keys).
    const errText = (field: keyof NCRDetailData) => {
        const msg = errors[field]?.message as string | undefined;
        if (!msg) return null;
        return (
            <p style={{ color: '#dc2626', fontSize: 12, margin: '4px 0 0', lineHeight: 1.4 }}>
                {t(msg) || NCR_ERROR_FALLBACKS[msg] || msg}
            </p>
        );
    };

    // Small circled "!" that holds a field's help note in a hover tooltip, so the
    // form stays clean instead of carrying a paragraph under every field.
    const infoDot = (text: string) => (
        <span
            title={text}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: '50%', border: '1px solid #9ca3af', color: '#6b7280', fontSize: 10, fontWeight: 700, lineHeight: 1, cursor: 'help', flex: '0 0 auto' }}
        >!</span>
    );
    const labelStyle = { display: 'inline-flex', alignItems: 'center', gap: 6 } as const;

    const persist = async (values: NCRDetailData) => {
        setSaving(true);
        try {
            await onSave(values, [
                { category: 'defectPhoto', files: pendingDefectPhotos },
                { category: 'improvementPhoto', files: pendingImprovementPhotos },
                { category: 'attachment', files: pendingAttachments }
            ], deletedFileIds);
            onClose();
        } catch (err) {
            toast.error((err as Error)?.message || t('common.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    // Save — zod (resolver) enforces the strict QC closure gate before we get here.
    // A voided NCR is withdrawn, so it needs no response: skip both the
    // required-field validation (see handleSaveClick) and the link warning.
    const onValidSave = async (values: NCRDetailData) => {
        if (!voided && !values.itrNumber) {
            // Warn if no link to origin (NOI is traced through the ITR)
            if (!window.confirm('This NCR is not linked to any ITR. Do you want to continue?')) {
                return;
            }
        }
        // NOI is reachable through the linked ITR (ITR carries its originating
        // NOI), so derive it from the chosen ITR instead of asking again. Keep
        // any existing value as a fallback for legacy records.
        const linkedItr = itrList.find(i => i.documentNumber === values.itrNumber);
        const noiNumber = linkedItr?.noiNumber || values.noiNumber || '';
        const finalStatus = voided ? 'Void' : deriveNCRStatus(values);
        if (finalStatus === 'Closed' && noiNumber) {
            toast.info(`NCR closed. You may now update NOI ${noiNumber} status to "Resolved".`);
        }
        // Due Date is auto-derived from raise date + severity (not user-editable).
        await persist({ ...values, status: finalStatus, noiNumber, dueDate: computeDueDate(values.raiseDate, values.severity) });
    };

    // On a failed close, list every missing field (not just the first) and
    // scroll to the first one so the user isn't hunting through the long form.
    const onInvalid = (errs: typeof errors) => {
        const fields = Object.keys(errs);
        if (!fields.length) return;
        const labelOf = (f: string) => (({
            subject: t('obs.subject'),
            type: t('ncr.type'),
            severity: t('ncr.severity') || 'Severity',
            contractor: t('obs.contractor'),
            raiseDate: t('ncr.raiseDate'),
            discipline: t('ncr.discipline') || 'Discipline',
            foundLocation: t('obs.foundLocation'),
            foundBy: t('obs.foundBy'),
            raisedBy: t('obs.raisedBy'),
            assignedTo: t('ncr.assignedTo') || 'Assigned To',
            referenceStandards: t('obs.refStandards'),
            deviation: '偏差說明 Deviation',
            productDisposition: t('obs.productDisposition'),
            reInspectionNumber: t('ncr.reinspectionNo'),
            drawingNo: '圖號 Drawing No.',
            specNo: '規範號 Spec No.',
            qtyAffected: '受影響數量 Qty Affected',
            extent: '範圍 Extent',
            repairMethodStatement: t('ncr.repairMethod'),
            recurrenceRef: '關聯前次 NCR',
        } as Record<string, string>)[f] || f);
        const labels = fields.map(labelOf);
        toast.warning(`請補齊必填欄位 / Complete required fields: ${labels.join('、')}`);
        const el = document.querySelector(`[name="${fields[0]}"]`) as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // Voiding withdraws the NCR, so no fields are required — bypass the zod
    // resolver entirely and save the current values straight away. Otherwise run
    // the normal validated submit (closure gate + required fields).
    const handleSaveClick = () => {
        if (voided) {
            void onValidSave(getValues());
        } else {
            void handleSubmit(onValidSave, onInvalid)();
        }
    };

    // Live status badge — derived from verification & closure (Void = override).
    const derivedStatus = voided ? 'Void' : deriveNCRStatus({ effectivenessVerified: watch('effectivenessVerified') });
    // Due Date auto-derived live from raise date + severity (Major +7 / Minor +14).
    const computedDueDate = computeDueDate(watch('raiseDate'), watch('severity'));
    const statusText = ({
        'Open': t('status.open'), 'In Progress': t('status.inProgress'),
        'Resolved': t('status.resolved'), 'Closed': t('status.closed'), 'Void': t('status.void'),
    } as Record<string, string>)[derivedStatus] || derivedStatus;

    return (
        <div className={formStyles.modalOverlay}>
            <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={formStyles.modalHeader}>
                    <h2>{existingItem ? t('ncr.editTitle') : t('ncr.addTitle')}</h2>
                    <button className={formStyles.closeButton} onClick={onClose} disabled={saving}>×</button>
                </div>
                <div className={formStyles.modalBody}>
                    <p className={formStyles.formRequiredHint} style={labelStyle}>
                        <span>{t('form.requiredHint')}</span>
                        {infoDot('紅 * 開立必填、橘 * 結案必填;狀態由「驗證與結案」自動決定。/ red * = required to raise, amber * = required to close; status auto-set from Verification & Closure.')}
                    </p>
                    <datalist id="ncr-people">
                        {peopleSuggestions.map(name => <option key={name} value={name} />)}
                    </datalist>
                    <div className={formStyles.formSections}>
                        {/* ===== 1. 基本資訊 / Identification ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>基本資訊 / Identification <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>（開立人 / QC）</span></h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.documentNumber')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={watch('ncrNumber') || t('form.autoGenerated')}
                                        readOnly
                                        style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: watch('ncrNumber') ? '#000000' : '#666666' }}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label style={labelStyle}>
                                        <span>{t('common.status')}</span>
                                        {infoDot('由「驗證與結案」自動判定 / auto-set from Verification & Closure')}
                                    </label>
                                    <div className={formStyles.readOnlyField}>{statusText}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.subject')}{openStar}</label>
                                    <input type="text" className={formStyles.formInput} {...register('subject')} />
                                    {errText('subject')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.type')}{openStar}</label>
                                    <select className={formStyles.formSelect} {...register('type')}>
                                        <option value="">{t('obs.typePlaceholder')}</option>
                                        <option value="Design">{t('ncr.type.design')}</option>
                                        <option value="Material">{t('ncr.type.material')}</option>
                                        <option value="Workmanship">{t('ncr.type.workmanship')}</option>
                                        <option value="Document">{t('ncr.type.document')}</option>
                                    </select>
                                    {errText('type')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label style={labelStyle}>
                                        <span>{t('ncr.severity') || 'Severity'}{openStar}</span>
                                        {infoDot(t('ncr.severity.hint') || 'Major: affects fitness-for-purpose / safety / code or contract compliance, or is a repeat/systemic issue — needs PQM/owner sign-off (SLA 7 days). Minor: isolated, easily corrected, no impact on function — contractor corrects + QC verifies (SLA 14 days).')}
                                    </label>
                                    <select className={formStyles.formSelect} {...register('severity')}>
                                        <option value="">{t('common.selectPlaceholder') || 'Select...'}</option>
                                        <option value="Major">{t('ncr.severity.major') || 'Major 重大'}</option>
                                        <option value="Minor">{t('ncr.severity.minor') || 'Minor 輕微'}</option>
                                    </select>
                                    {errText('severity')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.discipline') || 'Discipline'}{openStar}</label>
                                    <select className={formStyles.formSelect} {...register('discipline')}>
                                        <option value="">{t('common.selectPlaceholder') || 'Select...'}</option>
                                        <option value="Civil">{t('ncr.discipline.civil') || 'Civil 土建'}</option>
                                        <option value="Structural">{t('ncr.discipline.structural') || 'Structural 結構'}</option>
                                        <option value="Mechanical">{t('ncr.discipline.mechanical') || 'Mechanical 機械'}</option>
                                        <option value="Electrical">{t('ncr.discipline.electrical') || 'Electrical 電氣'}</option>
                                        <option value="Piping">{t('ncr.discipline.piping') || 'Piping 管路'}</option>
                                        <option value="Architectural">{t('ncr.discipline.architectural') || 'Architectural 建築'}</option>
                                    </select>
                                    {errText('discipline')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.contractor')}{openStar}</label>
                                    <select className={formStyles.formSelect} {...register('contractor')}>
                                        <option value="">{t('obs.contractorPlaceholder')}</option>
                                        {getActiveContractors().map((contractor) => (
                                            <option key={contractor.id} value={contractor.name}>
                                                {contractor.name}
                                            </option>
                                        ))}
                                    </select>
                                    {errText('contractor')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.raiseDate')}{openStar}</label>
                                    <input
                                        {...register('raiseDate')}
                                        type={watch('raiseDate') ? 'date' : 'text'}
                                        placeholder="mm/dd/yyyy"
                                        lang="en"
                                        onFocus={(e) => (e.target.type = 'date')}
                                        onBlur={(e) => { if (!e.target.value) e.target.type = 'text'; }}
                                        className={formStyles.formInput}
                                    />
                                    {errText('raiseDate')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label style={labelStyle}>
                                        <span>{t('common.dueDate')}</span>
                                        {infoDot('依嚴重度自動計算 Major +7天 / Minor +14天 / auto from severity')}
                                    </label>
                                    <div className={formStyles.readOnlyField}>{computedDueDate || '—'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.foundLocation')}{openStar}</label>
                                    <input type="text" className={formStyles.formInput} {...register('foundLocation')} />
                                    {errText('foundLocation')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.foundBy')}{openStar}</label>
                                    <input type="text" className={formStyles.formInput} list="ncr-people" {...register('foundBy')} />
                                    {errText('foundBy')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.raisedBy')}{openStar}</label>
                                    <input type="text" className={formStyles.formInput} list="ncr-people" {...register('raisedBy')} />
                                    {errText('raisedBy')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.assignedTo') || 'Assigned To'}{openStar}</label>
                                    <select
                                        className={formStyles.formSelect}
                                        value={watch('assignedTo') ?? ''}
                                        onChange={(e) => setValue('assignedTo', e.target.value ? Number(e.target.value) : null, { shouldValidate: true, shouldDirty: true })}
                                    >
                                        <option value="">{t('common.selectPlaceholder') || 'Select...'}</option>
                                        {users.map(u => (
                                            <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                                        ))}
                                    </select>
                                    {errText('assignedTo')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.serialNumbers')}</label>
                                    <input type="text" className={formStyles.formInput} {...register('serialNumbers')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label style={labelStyle}>
                                        <span>{t('ncr.itrNo')}</span>
                                        {infoDot('NOI 由所選 ITR 自動帶出追溯,毋須另選 / NOI is traced automatically from the linked ITR')}
                                    </label>
                                    <select className={formStyles.formSelect} {...register('itrNumber')}>
                                        <option value="">Select ITR No.</option>
                                        {itrList.map((itr) => (
                                            <option key={itr.id} value={itr.documentNumber}>
                                                {itr.documentNumber}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* ===== 2. 不符合描述 / Non-Conformance Description ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>不符合描述 / Non-Conformance Description <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>（開立人 / QC）</span></h3>
                            <div className={formStyles.formGrid}>
                                <div className={`${formStyles.formGroup} ${formStyles.formGroupFull}`}>
                                    <label>{t('obs.refStandards')}{openStar}</label>
                                    <input type="text" className={formStyles.formInput} {...register('referenceStandards')} />
                                    {errText('referenceStandards')}
                                </div>
                                <div className={`${formStyles.formGroup} ${formStyles.formGroupFull}`}>
                                    <label>規範要求 Requirement</label>
                                    <textarea className={formStyles.formTextarea} rows={2} {...register('requirement')} />
                                </div>
                                <div className={`${formStyles.formGroup} ${formStyles.formGroupFull}`}>
                                    <label>偏差說明 Deviation{openStar}</label>
                                    <textarea className={formStyles.formTextarea} rows={3} {...register('deviation')} />
                                    {errText('deviation')}
                                </div>
                            </div>
                        </div>

                        {/* ===== 3. 追溯與影響 / Traceability & Impact =====
                            drawingNo / specNo / qtyAffected / extent required at closure; rest collapse. */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>追溯與影響 / Traceability &amp; Impact <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>（開立人 / QC）</span></h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>圖號 Drawing No.{closeStar}</label>
                                    <input type="text" className={formStyles.formInput} {...register('drawingNo')} />
                                    {errText('drawingNo')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>規範號 Spec No.{closeStar}</label>
                                    <input type="text" className={formStyles.formInput} {...register('specNo')} />
                                    {errText('specNo')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>受影響數量 Qty Affected{closeStar}</label>
                                    <input type="text" className={formStyles.formInput} {...register('qtyAffected')} />
                                    {errText('qtyAffected')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>範圍 Isolated / Systemic{closeStar}</label>
                                    <select className={formStyles.formSelect} {...register('extent')}>
                                        <option value="">—</option>
                                        <option value="Isolated">單一 Isolated</option>
                                        <option value="Systemic">系統性 Systemic</option>
                                    </select>
                                    {errText('extent')}
                                </div>
                            </div>
                            <h4
                                className={formStyles.sectionTitle}
                                style={{ cursor: 'pointer', userSelect: 'none', fontSize: 13, marginTop: 12 }}
                                onClick={() => setShowDetailFields(s => !s)}
                            >
                                <span style={{ display: 'inline-block', width: 16 }}>{showDetailFields ? '▾' : '▸'}</span>
                                其他追溯／影響（選填）/ More detail (optional)
                            </h4>
                            {showDetailFields && (
                            <div className={formStyles.formGrid}>
                                {([
                                    ['lineNo', '管線編號 Line No.'], ['weldJointNo', '焊道編號 Weld / Joint No.'],
                                    ['heatBatchNo', '材料批號 Heat / Batch No.'],
                                ] as [keyof NCRDetailData, string][]).map(([f, label]) => (
                                    <div className={formStyles.formGroup} key={f}>
                                        <label>{label}</label>
                                        <input type="text" className={formStyles.formInput} {...register(f)} />
                                    </div>
                                ))}
                            </div>
                            )}
                        </div>

                        {/* ===== 4. 處置 / Disposition ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionDisposition')} <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>（承包商 / Contractor）</span></h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>{t('ncr.correctionAction')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleTBCButton('immediateCorrectionAction')}>{t('common.tbc')}</button>
                                            <button type="button" className={formStyles.naButton} onClick={() => handleNAButton('immediateCorrectionAction')}>{t('common.na')}</button>
                                        </div>
                                    </div>
                                    <textarea className={formStyles.formTextarea} rows={3} {...register('immediateCorrectionAction')} />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>{t('ncr.repairMethod')}{repairStar}</label>
                                        <div className={styles.buttonGroup}>
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleTBCButton('repairMethodStatement')}>{t('common.tbc')}</button>
                                            <button type="button" className={formStyles.naButton} onClick={() => handleNAButton('repairMethodStatement')}>{t('common.na')}</button>
                                        </div>
                                    </div>
                                    <textarea className={formStyles.formTextarea} rows={3} {...register('repairMethodStatement')} />
                                    {errText('repairMethodStatement')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.productDisposition')}{closeStar}</label>
                                    <select className={formStyles.formSelect} {...register('productDisposition')}>
                                        <option value="">{t('common.selectPlaceholder')}</option>
                                        <option value="Use As Is">{t('ncr.disposition.useAsIs')}</option>
                                        <option value="Repair">{t('ncr.disposition.repair')}</option>
                                        <option value="Rework">{t('ncr.disposition.rework')}</option>
                                        <option value="Reject">{t('ncr.disposition.reject')}</option>
                                    </select>
                                    {errText('productDisposition')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>讓步／偏差核准編號 Concession No.</label>
                                    <input type="text" className={formStyles.formInput} {...register('concessionNo')} />
                                </div>
                                <div className={formStyles.formGroupFull} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('ncr.integrityRelated')}</label>
                                        <select className={formStyles.formSelect} {...register('productIntegrityRelated')}>
                                            <option value="">{t('common.selectPlaceholder')}</option>
                                            <option value="Yes">{t('common.yes')}</option>
                                            <option value="No">{t('common.no')}</option>
                                        </select>
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('ncr.permanentDeviation')}</label>
                                        <select className={formStyles.formSelect} {...register('permanentProductDeviation')}>
                                            <option value="">{t('common.selectPlaceholder')}</option>
                                            <option value="Yes">{t('common.yes')}</option>
                                            <option value="No">{t('common.no')}</option>
                                        </select>
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('ncr.impactOM')}</label>
                                        <select className={formStyles.formSelect} {...register('impactToOM')}>
                                            <option value="">{t('common.selectPlaceholder')}</option>
                                            <option value="Yes">{t('common.yes')}</option>
                                            <option value="No">{t('common.no')}</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ===== 5. 根本原因與矯正·預防措施 / Root Cause & CA/PA ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>根本原因與矯正·預防措施 / Root Cause &amp; Corrective / Preventive Action <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>（承包商 / Contractor）</span></h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>重複性 Recurrence</label>
                                    <select className={formStyles.formSelect} {...register('recurrence')}>
                                        <option value="">—</option>
                                        <option value="No">否 No</option>
                                        <option value="Yes">是 Yes</option>
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>關聯前次 NCR Recurrence Ref.{recurrenceStar}</label>
                                    <input type="text" className={formStyles.formInput} {...register('recurrenceRef')} />
                                    {errText('recurrenceRef')}
                                </div>
                                <div className={`${formStyles.formGroup} ${formStyles.formGroupFull}`}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>直接原因 Direct Cause</label>
                                        <div className={styles.buttonGroup}>
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleTBCButton('directCause')}>{t('common.tbc')}</button>
                                            <button type="button" className={formStyles.naButton} onClick={() => handleNAButton('directCause')}>{t('common.na')}</button>
                                        </div>
                                    </div>
                                    <textarea className={formStyles.formTextarea} rows={2} {...register('directCause')} />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>{t('ncr.rootCause')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleTBCButton('rootCauseAnalysis')}>{t('common.tbc')}</button>
                                            <button type="button" className={formStyles.naButton} onClick={() => handleNAButton('rootCauseAnalysis')}>{t('common.na')}</button>
                                        </div>
                                    </div>
                                    <textarea className={formStyles.formTextarea} rows={4} {...register('rootCauseAnalysis')} />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>{t('ncr.correctiveActions')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleTBCButton('correctiveActions')}>{t('common.tbc')}</button>
                                            <button type="button" className={formStyles.naButton} onClick={() => handleNAButton('correctiveActions')}>{t('common.na')}</button>
                                        </div>
                                    </div>
                                    <textarea className={formStyles.formTextarea} rows={3} {...register('correctiveActions')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>矯正措施負責人 CA Owner</label>
                                    <input type="text" className={formStyles.formInput} list="ncr-people" {...register('correctiveActionOwner')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>矯正目標日 CA Target Date</label>
                                    <input type="date" lang="en" className={formStyles.formInput} {...register('correctiveActionTargetDate')} />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>{t('ncr.preventiveAction')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleTBCButton('preventiveAction')}>{t('common.tbc')}</button>
                                            <button type="button" className={formStyles.naButton} onClick={() => handleNAButton('preventiveAction')}>{t('common.na')}</button>
                                        </div>
                                    </div>
                                    <textarea className={formStyles.formTextarea} rows={3} {...register('preventiveAction')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>預防措施負責人 PA Owner</label>
                                    <input type="text" className={formStyles.formInput} list="ncr-people" {...register('preventiveActionOwner')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>預防目標日 PA Target Date</label>
                                    <input type="date" lang="en" className={formStyles.formInput} {...register('preventiveActionTargetDate')} />
                                </div>
                            </div>
                        </div>

                        {/* ===== 6. 驗證與結案 / Verification & Closure ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>驗證與結案 / Verification &amp; Closure <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>（QC）</span></h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label style={labelStyle}>
                                        <span>{t('ncr.effectivenessVerified') || 'Effectiveness Verified'}</span>
                                        {infoDot(`設為 Yes 即結案；No 退回處理中 / Set to "Yes" to close. ${t('ncr.effectiveness.hint') || 'Confirm the corrective action prevented recurrence. An NCR cannot be Closed until this is "Yes"; "No" routes it back to In Progress.'}`)}
                                    </label>
                                    <select className={formStyles.formSelect} {...register('effectivenessVerified')}>
                                        <option value="">{t('common.selectPlaceholder') || 'Select...'}</option>
                                        <option value="Pending">{t('ncr.effectiveness.pending') || 'Pending 待驗證'}</option>
                                        <option value="Yes">{t('ncr.effectiveness.yes') || 'Yes 有效'}</option>
                                        <option value="No">{t('ncr.effectiveness.no') || 'No 無效'}</option>
                                    </select>
                                    {errText('effectivenessVerified')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('ncr.effectivenessVerifiedDate') || 'Verified Date'}</label>
                                    <input type="date" lang="en" className={formStyles.formInput} {...register('effectivenessVerifiedDate')} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.reinspectionNo')}{closeStar}</label>
                                    <input type="text" className={formStyles.formInput} {...register('reInspectionNumber')} />
                                    {errText('reInspectionNumber')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('obs.closeoutDate')}</label>
                                    <input type="date" lang="en" className={formStyles.formInput} {...register('closeoutDate')} />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label className={formStyles.optionalLabel}>{t('ncr.effectivenessNotes') || 'Verification Notes'}</label>
                                        <div className={styles.buttonGroup}>
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleDateButton('effectivenessNotes')}>{t('common.addDate')}</button>
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleTBCButton('effectivenessNotes')}>{t('common.tbc')}</button>
                                            <button type="button" className={formStyles.naButton} onClick={() => handleNAButton('effectivenessNotes')}>{t('common.na')}</button>
                                        </div>
                                    </div>
                                    <textarea className={formStyles.formTextarea} rows={2} {...register('effectivenessNotes')} />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, cursor: 'pointer' }}>
                                        <input type="checkbox" checked={voided} onChange={(e) => setVoided(e.target.checked)} />
                                        <span>作廢此 NCR / Void this NCR</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* ===== 備註 / Remark ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>備註 / Remark</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label className={formStyles.optionalLabel}>{t('common.remark')}</label>
                                        <button type="button" className={formStyles.tbcButton} onClick={() => handleDateButton('remark')}>{t('common.addDate')}</button>
                                    </div>
                                    <textarea className={formStyles.formTextarea} rows={3} {...register('remark')} />
                                </div>
                            </div>
                        </div>

                        {/* ===== 7. 照片與附件 / Photos & Attachments ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>照片與附件 / Photos &amp; Attachments</h3>
                            <FileAttachment
                                id="ncr-defect-photos"
                                category="defectPhoto"
                                entityType={existingItem ? 'ncr' : undefined}
                                entityId={existingItem?.id}
                                title={t('obs.defectPhotos')}
                                legacyAttachments={watch('defectPhotos')}
                                onPendingFilesChange={setPendingDefectPhotos}
                                onDeleteExistingFile={(id) => {
                                    setDeletedFileIds(prev => [...prev, id]);
                                    setValue('defectPhotos', (getValues('defectPhotos') || []).filter((a: any) => typeof a === 'string' || a?.id !== id), { shouldDirty: true });
                                }}
                                onRemoveLegacy={(index) => handleRemoveLegacyPhoto(index, 'defect')}
                                onPreview={handlePreview}
                                accept="image/*"
                            />
                            <FileAttachment
                                id="ncr-improvement-photos"
                                category="improvementPhoto"
                                entityType={existingItem ? 'ncr' : undefined}
                                entityId={existingItem?.id}
                                title={t('obs.improvementPhotos')}
                                legacyAttachments={watch('improvementPhotos')}
                                onPendingFilesChange={setPendingImprovementPhotos}
                                onDeleteExistingFile={(id) => {
                                    setDeletedFileIds(prev => [...prev, id]);
                                    setValue('improvementPhotos', (getValues('improvementPhotos') || []).filter((a: any) => typeof a === 'string' || a?.id !== id), { shouldDirty: true });
                                }}
                                onRemoveLegacy={(index) => handleRemoveLegacyPhoto(index, 'improvement')}
                                onPreview={handlePreview}
                                accept="image/*"
                            />
                            <FileAttachment
                                id="ncr-attachments"
                                category="attachment"
                                entityType={existingItem ? 'ncr' : undefined}
                                entityId={existingItem?.id}
                                title={t('obs.attachments')}
                                legacyAttachments={watch('attachments')}
                                onPendingFilesChange={setPendingAttachments}
                                onDeleteExistingFile={(id) => {
                                    setDeletedFileIds(prev => [...prev, id]);
                                    setValue('attachments', (getValues('attachments') || []).filter((a: any) => typeof a === 'string' || a?.id !== id), { shouldDirty: true });
                                }}
                                onRemoveLegacy={handleRemoveLegacyAttachment}
                                onPreview={handlePreview}
                            />
                        </div>
                        {existingItem?.id && (
                            <RelatedDocuments entityType="ncr" entityId={existingItem.id} />
                        )}
                    </div>
                    <div className={formStyles.modalActions}>
                        <button className={formStyles.saveButton} onClick={handleSaveClick} disabled={saving}>
                            {saving ? t('obs.saving') : t('common.save')}
                        </button>
                        <button className={formStyles.printButton} onClick={handlePrintClick} style={{ marginLeft: '12px' }} disabled={saving} title={t('common.print') || 'Print'}>
                            {t('common.print') || 'Print'}
                        </button>
                        <button className={formStyles.cancelButton} onClick={onClose} disabled={saving}>
                            {t('common.cancel')}
                        </button>
                    </div>
                </div >
            </div >
            {isPrinting && printData && ReactDOM.createPortal(
                <NCRPrintTemplate
                    data={printData}
                    resolveUser={userLabel}
                    defectPhotos={printDefectPhotos}
                    improvementPhotos={printImprovementPhotos}
                />,
                document.body
            )}
            {previewUrl && (
                <ImagePreviewOverlay key={previewUrl} url={previewUrl} name={previewName} onClose={() => setPreviewUrl(null)} />
            )}
        </div >
    );
};

export interface NCRDetailsViewModalProps {
    ncrId: string;
    ncrItem?: NCRItem;
    ncrDetailData?: NCRDetailData;
    onClose: () => void;
}

export const NCRDetailsViewModal: React.FC<NCRDetailsViewModalProps> = ({ ncrId: _ncrId, ncrItem, ncrDetailData, onClose }) => {
    const { t } = useLanguage();
    // Combine data from both sources, with detailData taking precedence.
    // Base mapping is shared with the edit modal via toFormValues().
    const displayData: NCRDetailData = (() => {
        const base = ncrItem ? toFormValues(ncrItem) : emptyNCRForm;
        if (!ncrDetailData) return base;
        const out = { ...base };
        (Object.keys(base) as (keyof NCRDetailData)[]).forEach((k) => {
            const dv = ncrDetailData[k] as unknown;
            const keep = typeof dv === 'number' ? true : (dv !== undefined && dv !== null && dv !== '');
            if (keep) (out as any)[k] = dv;
        });
        return out;
    })();

    const handlePrint = () => {
        window.print();
    };

    // 附件預覽
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState<string>('');
    const handlePreview = (url: string, name?: string) => {
        setPreviewUrl(url);
        setPreviewName(name || '');
    };

    return (
        <div className={formStyles.modalOverlay}>
            <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={formStyles.modalHeader}>
                    <h2>{t('ncr.viewTitle')}</h2>
                    <button className={formStyles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={formStyles.modalBody}>
                    <div className={formStyles.formSections}>
                        {/* 不符合項目資訊 */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('obs.sectionInfo')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.itrNo')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.itrNumber || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('itr.ncrNo')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.ncrNumber || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.subject')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.subject || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.raiseDate')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.raiseDate || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.type')}</label>
                                    <div className={formStyles.readOnlyField}>
                                        {displayData.type ? t(`ncr.type.${displayData.type.toLowerCase()}`) : '-'}
                                    </div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.severity') || 'Severity'}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.severity || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.discipline') || 'Discipline'}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.discipline || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('common.contractor')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.contractor || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.refStandards')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.referenceStandards || '-'}</div>
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>規範要求 Requirement</label>
                                    <div className={formStyles.readOnlyField}>{displayData.requirement || '-'}</div>
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>偏差說明 Deviation</label>
                                    <div className={formStyles.readOnlyField}>{displayData.deviation || displayData.detailsDescription || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.foundLocation')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.foundLocation || '-'}</div>
                                </div>
                            </div>
                        </div>

                        {/* 照片 */}
                        <div className={formStyles.formSection}>
                            <FileAttachment
                                id="ncr-defect-photos-view"
                                category="defectPhoto"
                                entityType="ncr"
                                entityId={ncrItem?.id}
                                title={t('obs.defectPhotos')}
                                legacyAttachments={displayData.defectPhotos || []}
                                readOnly={true}
                                onPreview={handlePreview}
                                accept="image/*"
                            />
                        </div>
                        <div className={formStyles.formSection}>
                            <FileAttachment
                                id="ncr-improvement-photos-view"
                                category="improvementPhoto"
                                entityType="ncr"
                                entityId={ncrItem?.id}
                                title={t('obs.improvementPhotos')}
                                legacyAttachments={displayData.improvementPhotos || []}
                                readOnly={true}
                                onPreview={handlePreview}
                                accept="image/*"
                            />
                        </div>

                        {/* {t('obs.sectionPersonnelLocation')} */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('obs.sectionPersonnelLocation')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.foundBy')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.foundBy || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.raisedBy')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.raisedBy || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.serialNumbers')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.serialNumbers || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.productDisposition')}</label>
                                    <div className={formStyles.readOnlyField}>
                                        {displayData.productDisposition ? t(`ncr.disposition.${displayData.productDisposition.replace(/\s+/g, '').replace(/^./, str => str.toLowerCase())}`) : '-'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* {t('ncr.sectionDisposition')} */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionDisposition')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('ncr.correctionAction')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.immediateCorrectionAction || '-'}</div>
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('ncr.repairMethod')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.repairMethodStatement || '-'}</div>
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('ncr.rootCause')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.rootCauseAnalysis || '-'}</div>
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('ncr.correctiveActions')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.correctiveActions || '-'}</div>
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('ncr.preventiveAction')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.preventiveAction || '-'}</div>
                                </div>
                            </div>
                        </div>

                        {/* {t('ncr.sectionReinspection')} */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionReinspection')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.itrNo')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.itrNumber || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('itr.ncrNo')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.ncrNumber || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.reinspectionNo')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.reInspectionNumber || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.noiNo')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.noiNumber || '-'}</div>
                                </div>
                            </div>
                        </div>

                        {/* {t('ncr.sectionQuality')} */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionQuality')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('common.status')}</label>
                                    <div className={formStyles.readOnlyField}>
                                        {({
                                            'open': t('status.open'),
                                            'in progress': t('status.inProgress'),
                                            'resolved': t('status.resolved'),
                                            'closed': t('status.closed'),
                                            'void': t('status.void'),
                                        } as Record<string, string>)[displayData.status.toLowerCase()] || displayData.status || '-'}
                                    </div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.closeoutDate')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.closeoutDate || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.effectivenessVerified') || 'Effectiveness Verified'}</label>
                                    <div className={formStyles.readOnlyField}>
                                        {displayData.effectivenessVerified || '-'}
                                        {displayData.effectivenessVerifiedDate ? ` (${displayData.effectivenessVerifiedDate})` : ''}
                                    </div>
                                </div>
                                <div className={formStyles.formGroupFull} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('ncr.integrityRelated')}</label>
                                        <div className={formStyles.readOnlyField}>{displayData.productIntegrityRelated || '-'}</div>
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('ncr.permanentDeviation')}</label>
                                        <div className={formStyles.readOnlyField}>{displayData.permanentProductDeviation || '-'}</div>
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('ncr.impactOM')}</label>
                                        <div className={formStyles.readOnlyField}>{displayData.impactToOM || '-'}</div>
                                    </div>
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('common.remark')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.remark || '-'}</div>
                                </div>
                            </div>
                        </div>

                        <div className={formStyles.formSection}>
                            <FileAttachment
                                id="ncr-attachments-view"
                                category="attachment"
                                entityType="ncr"
                                entityId={ncrItem?.id}
                                title={t('obs.attachments')}
                                legacyAttachments={displayData.attachments || []}
                                readOnly={true}
                                onPreview={handlePreview}
                            />
                        </div>
                    </div>
                </div>
                <div className={formStyles.modalActions}>
                    <button className={formStyles.printButton} onClick={handlePrint}>
                        {t('common.print')}
                    </button>
                    <button className={formStyles.cancelButton} onClick={onClose}>
                        {t('common.close')}
                    </button>
                </div>
            </div>
            {previewUrl && (
                <ImagePreviewOverlay key={previewUrl} url={previewUrl} name={previewName} onClose={() => setPreviewUrl(null)} />
            )}
        </div>
    );
};
