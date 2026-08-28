import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { getUsers, getEntityFiles, getAuthenticatedFileUrl, formatUserLabel, exportNcrDocx, type User as ApiUser } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
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
    /** Open the form locked for viewing only — every field disabled, no Save.
     *  Driven by the caller from IAM permission + record status. */
    readOnly?: boolean;
}

export const NCRDetailModal: React.FC<NCRDetailModalProps> = ({ ncrId: _ncrId, existingItem, onSave, onClose, readOnly = false }) => {
    const { t } = useLanguage();
    const { hasPermission } = useAuth();
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

    // The form was one long single-scroll modal (8 sections) — split into tabs
    // grouped along the existing section boundaries so nothing else changes.
    // FIELD_TAB maps every field that can carry a zod error to the tab that
    // shows it, so onInvalid can jump to the right tab before scrolling.
    type NCRTabId = 'basic' | 'description' | 'disposition' | 'rootcause' | 'closure' | 'attachments';
    const TABS: { id: NCRTabId; label: string }[] = [
        { id: 'basic', label: t('ncr.tab.basic') || 'Identification' },
        { id: 'description', label: t('ncr.tab.description') || 'Description & Traceability' },
        { id: 'disposition', label: t('ncr.sectionDisposition') || 'Disposition & Repair' },
        { id: 'rootcause', label: t('ncr.tab.rootcause') || 'Root Cause & CA/PA' },
        { id: 'attachments', label: t('ncr.tab.attachments') || 'Photos & Attachments' },
        { id: 'closure', label: t('ncr.tab.closure') || 'Verification & Closure' },
    ];
    const FIELD_TAB: Partial<Record<keyof NCRDetailData, NCRTabId>> = {
        subject: 'basic', type: 'basic', severity: 'basic', discipline: 'basic',
        contractor: 'basic', raisedBy: 'basic', foundBy: 'basic', assignedTo: 'basic',
        raiseDate: 'basic', foundLocation: 'basic', serialNumbers: 'basic', itrNumber: 'basic',
        projectQualityManager: 'basic', aconex: 'basic',
        referenceStandards: 'description', requirement: 'description', deviation: 'description',
        drawingNo: 'description', specNo: 'description', qtyAffected: 'description',
        qtyAffectedUnit: 'description', extent: 'description',
        lineNo: 'description', weldJointNo: 'description', heatBatchNo: 'description',
        immediateCorrectionAction: 'disposition', repairMethodStatement: 'disposition',
        productDisposition: 'disposition', concessionNo: 'disposition',
        productIntegrityRelated: 'disposition', permanentProductDeviation: 'disposition', impactToOM: 'disposition',
        recurrence: 'rootcause', recurrenceRef: 'rootcause', directCause: 'rootcause',
        rootCauseAnalysis: 'rootcause', correctiveActions: 'rootcause', correctiveActionOwner: 'rootcause',
        correctiveActionTargetDate: 'rootcause', preventiveAction: 'rootcause',
        preventiveActionOwner: 'rootcause', preventiveActionTargetDate: 'rootcause',
        effectivenessVerified: 'closure', effectivenessVerifiedDate: 'closure', reInspectionNumber: 'closure',
        closeoutDate: 'closure', effectivenessNotes: 'closure', remark: 'closure',
        ownerApproval: 'closure', ownerApprovalBy: 'closure',
        ownerApprovalDate: 'closure', ownerApprovalNotes: 'closure',
        defectPhotos: 'attachments', progressPhotos: 'attachments', improvementPhotos: 'attachments', attachments: 'attachments',
    };
    const [activeTab, setActiveTab] = useState<NCRTabId>('basic');
    const tabsWithErrors = new Set(
        Object.keys(errors).map((f) => FIELD_TAB[f as keyof NCRDetailData]).filter(Boolean)
    );
    // Switching tabs should land on the top of that tab's content, not wherever
    // the previous tab happened to be scrolled to.
    const modalBodyRef = useRef<HTMLDivElement>(null);
    const goToTab = (tab: NCRTabId) => {
        setActiveTab(tab);
        modalBodyRef.current?.scrollTo({ top: 0 });
    };

    // File handling states
    const [pendingDefectPhotos, setPendingDefectPhotos] = useState<File[]>([]);
    const [pendingProgressPhotos, setPendingProgressPhotos] = useState<File[]>([]);
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
        return u ? formatUserLabel(u) : `#${id}`;
    };

    // Formal print report (BACKLOG #15). Mount the report portal, print, unmount.
    const [isPrinting, setIsPrinting] = useState(false);
    const [printData, setPrintData] = useState<NCRDetailData | null>(null);
    const [printDefectPhotos, setPrintDefectPhotos] = useState<string[]>([]);
    const [printProgressPhotos, setPrintProgressPhotos] = useState<string[]>([]);
    const [printImprovementPhotos, setPrintImprovementPhotos] = useState<string[]>([]);
    const [printAttachments, setPrintAttachments] = useState<{ name: string; url: string }[]>([]);
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

    // Gather before/during/after photos + general attachments (legacy array +
    // uploaded files), resolve to same-origin URLs, then trigger printing.
    const handlePrintClick = async () => {
        const current = getValues();
        const legacyDefect = (current.defectPhotos || []).filter((p): p is string => typeof p === 'string');
        const legacyProgress = (current.progressPhotos || []).filter((p): p is string => typeof p === 'string');
        const legacyImprove = (current.improvementPhotos || []).filter((p): p is string => typeof p === 'string');
        const legacyAttachments = (current.attachments || []).filter((p): p is string => typeof p === 'string');
        let defect = legacyDefect;
        let progress = legacyProgress;
        let improve = legacyImprove;
        let attachmentFiles: { name: string; url: string }[] = legacyAttachments.map((u) => ({
            name: decodeURIComponent(u.split('/').pop() || u),
            url: u,
        }));
        if (existingItem?.id) {
            try {
                const [d, p, i, a] = await Promise.all([
                    getEntityFiles('ncr', existingItem.id, 'defectPhoto'),
                    getEntityFiles('ncr', existingItem.id, 'progressPhoto'),
                    getEntityFiles('ncr', existingItem.id, 'improvementPhoto'),
                    getEntityFiles('ncr', existingItem.id, 'attachment'),
                ]);
                defect = [...legacyDefect, ...d.map(f => f.file_url)];
                progress = [...legacyProgress, ...p.map(f => f.file_url)];
                improve = [...legacyImprove, ...i.map(f => f.file_url)];
                attachmentFiles = [
                    ...attachmentFiles,
                    ...a.map(f => ({ name: f.file_name, url: f.file_url })),
                ];
            } catch {/* fall back to legacy arrays */}
        }
        setPrintData(current);
        setPrintDefectPhotos(defect.map(getAuthenticatedFileUrl));
        setPrintProgressPhotos(progress.map(getAuthenticatedFileUrl));
        setPrintImprovementPhotos(improve.map(getAuthenticatedFileUrl));
        setPrintAttachments(attachmentFiles.map(f => ({ name: f.name, url: getAuthenticatedFileUrl(f.url) })));
        setIsPrinting(true);
    };

    // Formal .docx export (BACKLOG #18 pilot) — server builds the same
    // 7-section report directly with python-docx, embedded photos included.
    const [exportingDocx, setExportingDocx] = useState(false);
    const handleExportDocxClick = async () => {
        if (!existingItem?.id || exportingDocx) return;
        setExportingDocx(true);
        try {
            await exportNcrDocx(existingItem.id, getValues('ncrNumber') || 'NCR');
        } catch {
            toast.error(t('common.saveFailed') || 'Export failed');
        } finally {
            setExportingDocx(false);
        }
    };

    // 附件預覽
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState<string>('');
    const handlePreview = (url: string, name?: string) => {
        setPreviewUrl(url);
        setPreviewName(name || '');
    };

    // TBC/N/A used to overwrite the field's text with a literal magic string.
    // Now they set a companion `<field>Status` column instead and clear the
    // text, so "still TBC" is queryable and the text field stays either
    // genuinely blank or real content (BACKLOG item 6). Typing into the field
    // clears the status again — see statusClearingRegister below.
    const statusField = (field: keyof NCRDetailData) => `${String(field)}Status` as keyof NCRDetailData;

    const handleNAButton = (field: keyof NCRDetailData) => {
        setValue(field, '', { shouldDirty: true });
        setValue(statusField(field), 'NA', { shouldDirty: true });
    };

    const handleDateButton = (field: keyof NCRDetailData) => {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}_`;
        const cur = (getValues(field) as string) || '';
        setValue(field, cur ? `${cur}\n${dateStr}` : dateStr, { shouldDirty: true });
        // This writes real content via setValue, which registerClearingStatus's
        // onChange (real DOM events only) never sees — clear the TBC/NA badge
        // here too, or it keeps showing over genuine content.
        setValue(statusField(field), '', { shouldDirty: true });
    };

    const handleTBCButton = (field: keyof NCRDetailData) => {
        setValue(field, '', { shouldDirty: true });
        setValue(statusField(field), 'TBC', { shouldDirty: true });
    };

    // Wraps register() for the 7 TBC/NA-capable textareas: typing real content
    // clears the companion status field so the text isn't shown as still
    // TBC/NA once the user has actually filled it in.
    const registerClearingStatus = (field: keyof NCRDetailData) =>
        register(field, {
            onChange: (e) => {
                if (e.target.value) setValue(statusField(field), '', { shouldDirty: true });
            },
        });

    const StatusBadge = ({ field }: { field: keyof NCRDetailData }) => {
        const status = watch(statusField(field)) as string;
        if (!status) return null;
        return (
            <span className={formStyles.statusBadge}>
                {status === 'TBC' ? t('common.tbc') : t('common.na')}
            </span>
        );
    };

    // Shows "TBC" / "N/A" as placeholder text inside the empty textarea itself
    // — visually similar to the old behavior of writing the word straight
    // into the field, but it's real placeholder text (not stored content), so
    // it disappears the instant the user types, which is exactly when
    // registerClearingStatus's onChange clears the status column underneath.
    const statusPlaceholder = (field: keyof NCRDetailData) => {
        const status = watch(statusField(field)) as string;
        return status === 'TBC' ? 'TBC' : status === 'NA' ? 'N/A' : undefined;
    };

    const handleRemoveLegacyPhoto = (index: number, photoType: 'defect' | 'progress' | 'improvement') => {
        const key = photoType === 'defect' ? 'defectPhotos' : photoType === 'progress' ? 'progressPhotos' : 'improvementPhotos';
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
    const productDisposition = watch('productDisposition');
    const repairStar = productDisposition === 'Repair' ? closeStar : null;
    const recurrence = watch('recurrence');
    const recurrenceStar = recurrence === 'Yes' ? closeStar : null;

    // Recurrence Ref. only makes sense when Recurrence = Yes — lock it
    // otherwise and clear any stale reference (skip the first render so
    // opening an existing "No" record doesn't wipe its saved value).
    const isFirstRecurrenceRender = useRef(true);
    useEffect(() => {
        if (isFirstRecurrenceRender.current) {
            isFirstRecurrenceRender.current = false;
            return;
        }
        if (recurrence !== 'Yes') {
            setValue('recurrenceRef', '', { shouldDirty: true });
        }
    }, [recurrence]);
    const needsOwnerApproval = productDisposition === 'Use As Is' || productDisposition === 'Repair';
    const ownerApprovalStar = needsOwnerApproval ? closeStar : null;
    // Owner/engineering sign-off represents an external party's decision —
    // gated separately from general edit rights so not every ncr:update:all
    // holder can fill it in on the owner's behalf.
    const canApproveOwner = hasPermission('ncr:approve:all');
    const ownerApprovalDisabled = !needsOwnerApproval || !canApproveOwner;

    // Concession No. only applies to a "Use As Is" disposition — lock the field
    // otherwise, and clear it back to the default when the user switches away
    // from "Use As Is" during this editing session (skip on initial mount so
    // opening an existing record never silently discards its saved value).
    const isFirstDispositionRender = useRef(true);
    useEffect(() => {
        if (isFirstDispositionRender.current) {
            isFirstDispositionRender.current = false;
            return;
        }
        if (productDisposition !== 'Use As Is') {
            setValue('concessionNo', 'Not Applicable', { shouldDirty: true });
        }
        // Owner/engineering approval applies to both "Use As Is" and "Repair"
        // (both are technical changes needing sign-off) — clear it when the
        // disposition moves to something that doesn't need approval at all.
        if (productDisposition !== 'Use As Is' && productDisposition !== 'Repair') {
            setValue('ownerApproval', '', { shouldDirty: true });
            setValue('ownerApprovalBy', '', { shouldDirty: true });
            setValue('ownerApprovalDate', '', { shouldDirty: true });
            setValue('ownerApprovalNotes', '', { shouldDirty: true });
        }
    }, [productDisposition]);

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
                { category: 'progressPhoto', files: pendingProgressPhotos },
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
            // Not every NCR originates from an ITR (e.g. raised directly from a
            // site walk or audit finding) — N/A is a normal, valid case. Just a
            // non-blocking heads-up, not a confirmation gate.
            toast.info(t('ncr.noItrLinkHint') || 'This NCR is not linked to any ITR.');
        }
        // NOI is reachable through the linked ITR (ITR carries its originating
        // NOI), so derive it from the chosen ITR instead of asking again. Only
        // fall back to the existing form value when there's no ITR link at all
        // (legacy records) — if an ITR *is* linked but has no NOI of its own,
        // trust that (clearing to '') instead of keeping a stale NOI from a
        // previously-linked, since-replaced ITR.
        const linkedItr = itrList.find(i => i.documentNumber === values.itrNumber);
        const noiNumber = values.itrNumber ? (linkedItr?.noiNumber || '') : (values.noiNumber || '');
        const finalStatus = voided ? 'Void' : deriveNCRStatus(values);
        if (finalStatus === 'Closed' && noiNumber) {
            toast.info(`NCR closed. You may now update NOI ${noiNumber} status to "Resolved".`);
        }
        // On close, stamp the close-out date with today if the user left it blank.
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const closeoutDate = finalStatus === 'Closed' && !values.closeoutDate ? todayStr : values.closeoutDate;
        // Due Date is auto-derived from raise date + severity (not user-editable).
        await persist({ ...values, status: finalStatus, noiNumber, closeoutDate, dueDate: computeDueDate(values.raiseDate, values.severity) });
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
            ownerApproval: t('ncr.ownerApproval') || 'Owner/Engineering Approval',
            improvementPhotos: t('obs.improvementPhotos'),
        } as Record<string, string>)[f] || f);
        const labels = fields.map(labelOf);
        toast.warning(`請補齊必填欄位 / Complete required fields: ${labels.join('、')}`);
        // The first error's field may be on a tab that isn't currently shown —
        // switch to it first, then wait a tick for that tab's content to mount
        // before scrolling to the field.
        const firstTab = FIELD_TAB[fields[0] as keyof NCRDetailData];
        if (firstTab) goToTab(firstTab);
        setTimeout(() => {
            // Fields rendered via a custom component (e.g. improvementPhotos'
            // FileAttachment) aren't register()-bound and have no [name]
            // attribute — fall back to a [data-field] marker on their wrapper.
            const el = document.querySelector(
                `[name="${fields[0]}"], [data-field="${fields[0]}"]`
            ) as HTMLElement | null;
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, firstTab ? 50 : 0);
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
    const derivedStatus = voided ? 'Void' : deriveNCRStatus({ effectivenessVerified: watch('effectivenessVerified'), ownerApproval: watch('ownerApproval'), status: watch('status') });
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
                    <h2>{readOnly ? t('ncr.viewTitle') : existingItem ? t('ncr.editTitle') : t('ncr.addTitle')}</h2>
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
                    <p className={formStyles.formRequiredHint} style={labelStyle}>
                        <span>{t('form.requiredHint')}</span>
                        {infoDot('紅 * 開立必填、橘 * 結案必填;狀態由「驗證與結案」自動決定。/ red * = required to raise, amber * = required to close; status auto-set from Verification & Closure.')}
                    </p>
                    )}
                    <datalist id="ncr-people">
                        {peopleSuggestions.map(name => <option key={name} value={name} />)}
                    </datalist>
                    {/* A single disabled fieldset locks every input/select/textarea
                        and inline button below in one shot when readOnly. */}
                    <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }}>
                    {activeTab === 'basic' && (
                    <div className={formStyles.formSections}>
                        {/* ===== 1. 基本資訊 / Identification ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionIdentification')} <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>{t('ncr.roleIssuerQC')}</span></h3>
                            <div className={formStyles.formGrid}>
                                {/* 系統自動 */}
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
                                {/* 分類 */}
                                <div className={`${formStyles.formGroup} ${formStyles.formGroupFull}`}>
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
                                {/* 單位／人 */}
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
                                    <label>{t('obs.raisedBy')}{openStar}</label>
                                    <input type="text" className={formStyles.formInput} list="ncr-people" {...register('raisedBy')} />
                                    {errText('raisedBy')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.foundBy')}{openStar}</label>
                                    <input type="text" className={formStyles.formInput} list="ncr-people" {...register('foundBy')} />
                                    {errText('foundBy')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.assignedTo') || 'Assigned To'}{openStar}</label>
                                    <select
                                        name="assignedTo"
                                        className={formStyles.formSelect}
                                        value={watch('assignedTo') ?? ''}
                                        onChange={(e) => setValue('assignedTo', e.target.value ? Number(e.target.value) : null, { shouldValidate: true, shouldDirty: true })}
                                    >
                                        <option value="">{t('common.selectPlaceholder') || 'Select...'}</option>
                                        {users.map(u => (
                                            <option key={u.id} value={u.id}>{formatUserLabel(u)}</option>
                                        ))}
                                    </select>
                                    {errText('assignedTo')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('ncr.projectQualityManager')}</label>
                                    <input type="text" className={formStyles.formInput} list="ncr-people" {...register('projectQualityManager')} />
                                </div>
                                {/* 日期 */}
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
                                {/* 地點／追溯 */}
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.foundLocation')}{openStar}</label>
                                    <input type="text" className={formStyles.formInput} {...register('foundLocation')} />
                                    {errText('foundLocation')}
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
                                    <select
                                        className={formStyles.formSelect}
                                        {...register('itrNumber', {
                                            onChange: (e) => {
                                                const itr = itrList.find(i => i.documentNumber === e.target.value);
                                                if (!itr) return;
                                                // Fill from the linked ITR instead of making the user
                                                // retype it — only fills fields still empty, never
                                                // overwrites something already entered for this NCR.
                                                const cur = getValues();
                                                if (!cur.contractor && itr.vendor) setValue('contractor', itr.vendor, { shouldDirty: true });
                                                if (!cur.foundLocation && itr.foundLocation) setValue('foundLocation', itr.foundLocation, { shouldDirty: true });
                                                if (!cur.subject && itr.subject) setValue('subject', itr.subject, { shouldDirty: true });
                                                if (!cur.raiseDate && itr.raiseDate) setValue('raiseDate', itr.raiseDate, { shouldDirty: true });
                                            },
                                        })}
                                    >
                                        <option value="">Select ITR No.</option>
                                        {itrList.map((itr) => (
                                            <option key={itr.id} value={itr.documentNumber}>
                                                {itr.documentNumber}
                                            </option>
                                        ))}
                                    </select>
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
                        {/* ===== 2. 不符合描述 / Non-Conformance Description ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionNonConformance')} <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>{t('ncr.roleIssuerQC')}</span></h3>
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
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionTraceabilityImpact')} <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>{t('ncr.roleIssuerQC')}</span></h3>
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
                                    <input type="number" step="any" min="0" className={formStyles.formInput} {...register('qtyAffected')} />
                                    {errText('qtyAffected')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('ncr.qtyAffectedUnit')}</label>
                                    <input type="text" className={formStyles.formInput} placeholder="joint / m / pcs..." {...register('qtyAffectedUnit')} />
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
                    </div>
                    )}

                    {activeTab === 'disposition' && (
                    <div className={formStyles.formSections}>
                        {/* ===== 4. 處置 / Disposition ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionDisposition')} <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>{t('ncr.roleContractor')}</span></h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>{t('ncr.correctionAction')}</label>
                                        <div className={styles.buttonGroup}>
                                            <StatusBadge field="immediateCorrectionAction" />
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleTBCButton('immediateCorrectionAction')}>{t('common.tbc')}</button>
                                            <button type="button" className={formStyles.naButton} onClick={() => handleNAButton('immediateCorrectionAction')}>{t('common.na')}</button>
                                        </div>
                                    </div>
                                    <textarea className={formStyles.formTextarea} rows={3} placeholder={statusPlaceholder('immediateCorrectionAction')} {...registerClearingStatus('immediateCorrectionAction')} />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>{t('ncr.repairMethod')}{repairStar}</label>
                                        <div className={styles.buttonGroup}>
                                            <StatusBadge field="repairMethodStatement" />
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleTBCButton('repairMethodStatement')}>{t('common.tbc')}</button>
                                            <button type="button" className={formStyles.naButton} onClick={() => handleNAButton('repairMethodStatement')}>{t('common.na')}</button>
                                        </div>
                                    </div>
                                    <textarea className={formStyles.formTextarea} rows={3} placeholder={statusPlaceholder('repairMethodStatement')} {...registerClearingStatus('repairMethodStatement')} />
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
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        disabled={productDisposition !== 'Use As Is'}
                                        {...register('concessionNo')}
                                    />
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
                    </div>
                    )}

                    {activeTab === 'rootcause' && (
                    <div className={formStyles.formSections}>
                        {/* ===== 5. 根本原因與矯正·預防措施 / Root Cause & CA/PA ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionRootCauseCAPA')} <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>{t('ncr.roleContractor')}</span></h3>
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
                                    <input type="text" className={formStyles.formInput} disabled={recurrence !== 'Yes'} {...register('recurrenceRef')} />
                                    {errText('recurrenceRef')}
                                </div>
                                <div className={`${formStyles.formGroup} ${formStyles.formGroupFull}`}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>直接原因 Direct Cause</label>
                                        <div className={styles.buttonGroup}>
                                            <StatusBadge field="directCause" />
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleTBCButton('directCause')}>{t('common.tbc')}</button>
                                            <button type="button" className={formStyles.naButton} onClick={() => handleNAButton('directCause')}>{t('common.na')}</button>
                                        </div>
                                    </div>
                                    <textarea className={formStyles.formTextarea} rows={2} placeholder={statusPlaceholder('directCause')} {...registerClearingStatus('directCause')} />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>{t('ncr.rootCause')}</label>
                                        <div className={styles.buttonGroup}>
                                            <StatusBadge field="rootCauseAnalysis" />
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleTBCButton('rootCauseAnalysis')}>{t('common.tbc')}</button>
                                            <button type="button" className={formStyles.naButton} onClick={() => handleNAButton('rootCauseAnalysis')}>{t('common.na')}</button>
                                        </div>
                                    </div>
                                    <textarea className={formStyles.formTextarea} rows={4} placeholder={statusPlaceholder('rootCauseAnalysis')} {...registerClearingStatus('rootCauseAnalysis')} />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>{t('ncr.correctiveActions')}</label>
                                        <div className={styles.buttonGroup}>
                                            <StatusBadge field="correctiveActions" />
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleTBCButton('correctiveActions')}>{t('common.tbc')}</button>
                                            <button type="button" className={formStyles.naButton} onClick={() => handleNAButton('correctiveActions')}>{t('common.na')}</button>
                                        </div>
                                    </div>
                                    <textarea className={formStyles.formTextarea} rows={3} placeholder={statusPlaceholder('correctiveActions')} {...registerClearingStatus('correctiveActions')} />
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
                                            <StatusBadge field="preventiveAction" />
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleTBCButton('preventiveAction')}>{t('common.tbc')}</button>
                                            <button type="button" className={formStyles.naButton} onClick={() => handleNAButton('preventiveAction')}>{t('common.na')}</button>
                                        </div>
                                    </div>
                                    <textarea className={formStyles.formTextarea} rows={3} placeholder={statusPlaceholder('preventiveAction')} {...registerClearingStatus('preventiveAction')} />
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
                    </div>
                    )}

                    {activeTab === 'closure' && (
                    <div className={formStyles.formSections}>
                        {/* ===== 業主／工程權責審核 / Owner &amp; Engineering-Design Authority Approval =====
                            Required (Approved) before closing when disposition is Use As Is / Repair
                            — these are technical changes to the accepted product (print report 見 6.3).
                            Comes before QC's effectiveness verification: chronologically the owner must
                            approve the disposition before the corrective action even proceeds. */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.ownerApprovalSection')} <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>（業主 / Owner）</span></h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label style={labelStyle}>
                                        <span>{t('ncr.ownerApproval')}{ownerApprovalStar}</span>
                                        {infoDot(t('ncr.ownerApprovalHint') || 'Required for "Use As Is" / "Repair" — a Rejected approval sends the NCR back to In Progress regardless of QC effectiveness verification.')}
                                    </label>
                                    <select
                                        className={formStyles.formSelect}
                                        disabled={ownerApprovalDisabled}
                                        {...register('ownerApproval')}
                                    >
                                        <option value="">{t('common.selectPlaceholder')}</option>
                                        <option value="Pending">{t('ncr.effectiveness.pending') || 'Pending 待驗證'}</option>
                                        <option value="Approved">{t('ncr.ownerApproval.approved')}</option>
                                        <option value="Rejected">{t('ncr.ownerApproval.rejected')}</option>
                                    </select>
                                    {errText('ownerApproval')}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('ncr.ownerApprovalBy')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        list="ncr-people"
                                        disabled={ownerApprovalDisabled}
                                        {...register('ownerApprovalBy')}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('ncr.ownerApprovalDate')}</label>
                                    <input
                                        type="date"
                                        lang="en"
                                        className={formStyles.formInput}
                                        disabled={ownerApprovalDisabled}
                                        {...register('ownerApprovalDate')}
                                    />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label className={formStyles.optionalLabel}>{t('ncr.ownerApprovalNotes')}</label>
                                    <textarea
                                        className={formStyles.formTextarea}
                                        rows={2}
                                        disabled={ownerApprovalDisabled}
                                        {...register('ownerApprovalNotes')}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* ===== 6. 驗證與結案 / Verification & Closure ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionVerificationClosure')} <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>{t('ncr.roleQC')}</span></h3>
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
                                            <StatusBadge field="effectivenessNotes" />
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleDateButton('effectivenessNotes')}>{t('common.addDate')}</button>
                                            <button type="button" className={formStyles.tbcButton} onClick={() => handleTBCButton('effectivenessNotes')}>{t('common.tbc')}</button>
                                            <button type="button" className={formStyles.naButton} onClick={() => handleNAButton('effectivenessNotes')}>{t('common.na')}</button>
                                        </div>
                                    </div>
                                    <textarea className={formStyles.formTextarea} rows={2} placeholder={statusPlaceholder('effectivenessNotes')} {...registerClearingStatus('effectivenessNotes')} />
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
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionRemark')}</h3>
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
                    </div>
                    )}

                    {activeTab === 'attachments' && (
                    <div className={formStyles.formSections}>
                        {/* ===== 7. 照片與附件 / Photos & Attachments ===== */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionAttachments')}</h3>
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
                                id="ncr-progress-photos"
                                category="progressPhoto"
                                entityType={existingItem ? 'ncr' : undefined}
                                entityId={existingItem?.id}
                                title={t('ncr.progressPhotos')}
                                legacyAttachments={watch('progressPhotos')}
                                onPendingFilesChange={setPendingProgressPhotos}
                                onDeleteExistingFile={(id) => {
                                    setDeletedFileIds(prev => [...prev, id]);
                                    setValue('progressPhotos', (getValues('progressPhotos') || []).filter((a: any) => typeof a === 'string' || a?.id !== id), { shouldDirty: true });
                                }}
                                onRemoveLegacy={(index) => handleRemoveLegacyPhoto(index, 'progress')}
                                onPreview={handlePreview}
                                accept="image/*"
                            />
                            <div data-field="improvementPhotos">
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
                                {errText('improvementPhotos')}
                            </div>
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
                    )}
                    </fieldset>
                    <div className={formStyles.modalActions}>
                        {!readOnly && (
                            <button className={formStyles.saveButton} onClick={handleSaveClick} disabled={saving}>
                                {saving ? t('obs.saving') : t('common.save')}
                            </button>
                        )}
                        <button className={formStyles.printButton} onClick={handlePrintClick} style={{ marginLeft: '12px' }} disabled={saving} title={t('common.print') || 'Print'}>
                            {t('common.print') || 'Print'}
                        </button>
                        {existingItem?.id && (
                            <button className={formStyles.printButton} onClick={handleExportDocxClick} style={{ marginLeft: '12px' }} disabled={saving || exportingDocx} title={t('common.exportWord') || 'Export Word'}>
                                {exportingDocx ? (t('common.saving') || '...') : (t('common.exportWord') || 'Export Word')}
                            </button>
                        )}
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
                    progressPhotos={printProgressPhotos}
                    improvementPhotos={printImprovementPhotos}
                    attachmentFiles={printAttachments}
                />,
                document.body
            )}
            {previewUrl && (
                <ImagePreviewOverlay key={previewUrl} url={previewUrl} name={previewName} onClose={() => setPreviewUrl(null)} />
            )}
        </div >
    );
};
