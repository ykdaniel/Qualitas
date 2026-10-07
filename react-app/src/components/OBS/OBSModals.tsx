import { useDraftGuard } from '../Shared/LeaveGuard';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useContractorsStore } from '../../store/contractorsStore';
import ReactDOM from 'react-dom';
import { getUsers, getEntityFiles, getAuthenticatedFileUrl, formatUserLabel, type User as ApiUser } from '../../services/api';
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
import { DateIssueBanner } from '../Shared/DateIssueMark';
import { AttachmentsBlockedNotice, SaveFollowUpBanner } from '../Shared/SaveFollowUpBanner';
import { OBS_DATE_FIELDS, preserveHistoricalDates } from '../../utils/dateIssues';
import { followUpOf } from '../../utils/saveFlow';
import type { FollowUp, SaveOutcome } from '../../utils/saveFlow';
import { describeSaveError, presentOutcome } from '../../utils/saveErrors';

export type { OBSDetailData };

export interface PendingUploads {
    category: string;
    files: File[];
}

export interface OBSDetailModalProps {
    obsId: string | null;
    existingItem?: OBSItem;
    onSave: (details: OBSDetailData, pendingUploads: PendingUploads[], deletedFileIds: string[]) => Promise<SaveOutcome>;
    /** Retries only the unfinished file steps of a record that is already stored (never writes the record). */
    onRetryFiles?: (pendingUploads: PendingUploads[], deletedFileIds: string[]) => Promise<SaveOutcome>;
    onClose: () => void;
    /** Open the form locked for viewing only — every field disabled, no Save.
     *  Driven by the caller from IAM permission + record status. */
    readOnly?: boolean;
    /** false when the account may not upload / remove attachments (no update permission): the file controls are read-only and a notice says why. */
    attachmentsAllowed?: boolean;
}

export const OBSDetailModal: React.FC<OBSDetailModalProps> = ({ obsId: _obsId, existingItem, onSave, onRetryFiles, onClose, readOnly = false, attachmentsAllowed = true }) => {
    const { t } = useLanguage();
    const { user: currentUser } = useAuth();
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
    const leaveGuard = useDraftGuard({ fields: watch(), pendingDefectPhotos, pendingImprovementPhotos, pendingAttachments, deletedFileIds, voided }, saving, !readOnly);
    const requestClose = () => leaveGuard.requestClose(onClose);
    // Per-category counters handed to FileAttachment: bumped once that category's pending files are stored on the server.
    const [syncTokens, setSyncTokens] = useState<Record<string, number>>({});

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

    // What is still owed after a "saved, but a file step failed" outcome (see SaveFollowUpBanner).
    const [followUp, setFollowUp] = useState<FollowUp | null>(null);
    const uploadGroups = () => [
        { category: 'defectPhoto', files: pendingDefectPhotos },
        { category: 'improvementPhoto', files: pendingImprovementPhotos },
        { category: 'attachment', files: pendingAttachments },
    ];
    // Shared by "Save" and "retry remaining files": trims what already went through, shows the ONE message, closes only when done.
    const applyOutcome = (outcome: SaveOutcome, created: boolean) => {
        if (outcome.status === 'saved-incomplete') {
            // The record is stored. Drop what already went through so a retry only redoes the rest.
            const done = new Set(outcome.uploadedCategories);
            if (done.has('defectPhoto')) setPendingDefectPhotos([]);
            if (done.has('improvementPhoto')) setPendingImprovementPhotos([]);
            if (done.has('attachment')) setPendingAttachments([]);
            setDeletedFileIds(outcome.remainingDeletes);
            setSyncTokens(prev => outcome.uploadedCategories.reduce((acc, c) => ({ ...acc, [c]: (acc[c] ?? 0) + 1 }), { ...prev }));
            setFollowUp(prev => followUpOf(outcome, prev?.created ?? created));
        } else if (outcome.status !== 'failed') {
            setFollowUp(null);
        }
        const { close, notice } = presentOutcome(outcome, t);
        if (notice) (notice.level === 'error' ? toast.error : toast.warning)(notice.text, { duration: 10000 });
        if (close) { leaveGuard.release(); onClose(); }
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
        // Stamp each engineer's approval date with today if left blank, then
        // derive Close-out Date as the later of the two — it is not an
        // independently-set field.
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const qualityEngineerApprovalDate = values.qualityEngineerApproval === 'Approved' && !values.qualityEngineerApprovalDate ? todayStr : values.qualityEngineerApprovalDate;
        const constructionEngineerApprovalDate = values.constructionEngineerApproval === 'Approved' && !values.constructionEngineerApprovalDate ? todayStr : values.constructionEngineerApprovalDate;
        const closeoutDate = qualityEngineerApprovalDate && constructionEngineerApprovalDate
            ? (qualityEngineerApprovalDate > constructionEngineerApprovalDate ? qualityEngineerApprovalDate : constructionEngineerApprovalDate)
            : (qualityEngineerApprovalDate || constructionEngineerApprovalDate || '');
        setSaving(true);
        try {
            // an invalid stored date must not be erased by a blank <input type="date"> (it cannot display an invalid string)
            const outcome = await onSave(preserveHistoricalDates({ ...values, status: finalStatus, closeoutDate, qualityEngineerApprovalDate, constructionEngineerApprovalDate }, existingItem, OBS_DATE_FIELDS), uploadGroups(), deletedFileIds);
            applyOutcome(outcome, !existingItem);
        } catch (err) {
            toast.error(t('saveFlow.failedKeep', { message: describeSaveError(err, t) }), { duration: 10000 });
        } finally {
            setSaving(false);
        }
    };
    // Retries only the unfinished file steps: the record itself is not written (that needs update permission the user may not have).
    const retryFiles = async () => {
        if (!onRetryFiles) return;
        setSaving(true);
        try {
            applyOutcome(await onRetryFiles(uploadGroups(), deletedFileIds), false);
        } catch (err) {
            toast.error(t('saveFlow.failedKeep', { message: describeSaveError(err, t) }), { duration: 10000 });
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

    // Engineer sign-off identity (2026-10-05, BACKLOG #20): ApprovedBy used to be
    // a free-pick dropdown over every IAM user. The server now always derives it
    // from whoever is authenticated (obs_service.py::_apply_engineer_approval_identity)
    // and ignores whatever the client sends, so this is a read-only PREVIEW of what
    // the server will stamp, not the source of truth. It only substitutes the current
    // user's name when THIS editing session is the one flipping Pending/Rejected ->
    // Approved; an already-Approved record (loaded that way) keeps showing its real,
    // possibly different, historical approver instead of being overwritten by whoever
    // happens to be viewing it now.
    const approverDisplay = (approvalField: 'qualityEngineerApproval' | 'constructionEngineerApproval', byField: 'qualityEngineerApprovalBy' | 'constructionEngineerApprovalBy') => {
        const liveApproval = watch(approvalField);
        const storedByField = watch(byField);
        if (liveApproval !== 'Approved') return storedByField || '—';
        const wasAlreadyApproved = existingItem?.[approvalField] === 'Approved';
        if (wasAlreadyApproved) return storedByField || '—';
        return currentUser ? formatUserLabel(currentUser) : '—';
    };

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
        : deriveOBSStatus({
            qualityEngineerApproval: watch('qualityEngineerApproval'),
            constructionEngineerApproval: watch('constructionEngineerApproval'),
        });
    const statusText = ({
        'Open': t('status.open'), 'In Progress': t('status.inProgress'),
        'Resolved': t('status.resolved'), 'Closed': t('status.closed'), 'Void': t('status.void'),
    } as Record<string, string>)[derivedStatus] || derivedStatus;

    return (
        <div className={formStyles.modalOverlay}>
            <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={formStyles.modalHeader}>
                    <h2>{readOnly ? '檢視觀察 / View Observation' : existingItem ? t('obs.editTitle') : t('obs.addTitle')}</h2>
                    <button className={formStyles.closeButton} aria-label={t('common.close')} title={t('common.close')} onClick={requestClose} disabled={saving}>×</button>
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
                    <DateIssueBanner item={existingItem} />
                    {!readOnly && !attachmentsAllowed && <AttachmentsBlockedNotice creating={!existingItem} />}
                    <SaveFollowUpBanner followUp={followUp} canEditFields={!readOnly} canRetry={attachmentsAllowed} busy={saving} onRetry={() => { void retryFiles(); }} />
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
                                readOnly={!attachmentsAllowed}
                                syncToken={syncTokens.defectPhoto}
                                initialPendingFiles={pendingDefectPhotos}
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
                                readOnly={!attachmentsAllowed}
                                syncToken={syncTokens.improvementPhoto}
                                initialPendingFiles={pendingImprovementPhotos}
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
                                readOnly={!attachmentsAllowed}
                                syncToken={syncTokens.attachment}
                                initialPendingFiles={pendingAttachments}
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
                            <h3 className={formStyles.sectionTitle}>結案簽核 / Closure Sign-off <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>（QC）</span></h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label style={labelStyle}>
                                        <span>{t('obs.qualityEngineer') || '品質工程師 Quality Engineer'}</span>
                                        {infoDot('雙方都設為 Approved 才會結案；任一方 Rejected 都會退回處理中 / Both must be Approved to close; either Rejected sends it back to In Progress.')}
                                    </label>
                                    <select className={formStyles.formSelect} {...register('qualityEngineerApproval')}>
                                        <option value="Pending">{t('ncr.effectiveness.pending') || '待驗證 Pending'}</option>
                                        <option value="Approved">核准 Approved</option>
                                        <option value="Rejected">退回 Rejected</option>
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('obs.approvedBy') || '簽核人 Approved By'}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={approverDisplay('qualityEngineerApproval', 'qualityEngineerApprovalBy')}
                                        readOnly
                                        style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed' }}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('obs.approvalDate') || '簽核日期 Approval Date'}</label>
                                    {dateInput('qualityEngineerApprovalDate')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label style={labelStyle}>
                                        <span>{t('obs.constructionEngineer') || '工地工程師 Construction Engineer'}</span>
                                    </label>
                                    <select className={formStyles.formSelect} {...register('constructionEngineerApproval')}>
                                        <option value="Pending">{t('ncr.effectiveness.pending') || '待驗證 Pending'}</option>
                                        <option value="Approved">核准 Approved</option>
                                        <option value="Rejected">退回 Rejected</option>
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('obs.approvedBy') || '簽核人 Approved By'}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={approverDisplay('constructionEngineerApproval', 'constructionEngineerApprovalBy')}
                                        readOnly
                                        style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed' }}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('obs.approvalDate') || '簽核日期 Approval Date'}</label>
                                    {dateInput('constructionEngineerApprovalDate')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label style={labelStyle}>
                                        <span>{t('obs.closeoutDate')}</span>
                                        {infoDot('自動取兩位工程師簽核日期中較晚的一個，結案後才會顯示 / Automatically the later of the two engineers’ approval dates — shown once at least one has signed off.')}
                                    </label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={(() => {
                                            const q = watch('qualityEngineerApprovalDate');
                                            const c = watch('constructionEngineerApprovalDate');
                                            if (q && c) return q > c ? q : c;
                                            return q || c || '—';
                                        })()}
                                        readOnly
                                        style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed' }}
                                    />
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
                <FormActions
                    tools={<>
                        <button className={actionStyles.secondary} type="button" onClick={handlePrintClick} disabled={saving} title={t('common.print') || 'Print'}>
                            {t('common.print') || 'Print'}
                        </button>
                    </>}
                    cancel={<>
                        <button className={actionStyles.secondary} type="button" onClick={requestClose} disabled={saving}>
                            {t('common.cancel')}
                        </button>
                    </>}
                    primary={<>
                        {!readOnly && (
                            <button className={actionStyles.primary} type="button" onClick={handleSaveClick} disabled={saving}>
                                {saving ? t('obs.saving') : t('common.save')}
                            </button>
                        )}
                    </>}
                />
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
