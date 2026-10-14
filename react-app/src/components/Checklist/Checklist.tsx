import { useDraftGuard } from '../Shared/LeaveGuard';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { toast } from 'sonner';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { Plus, Printer, Info, MapPin, CheckCircle, AlertCircle, Trash2, User, Signature, History, Search, ArrowLeft, FileText } from 'lucide-react';
import { useChecklistStore, ChecklistRecord, isTemplateHistoricallyProtected, isSharedChecklistTemplate } from '../../store/checklistStore';
import { showRefusal } from '../../store/refusalStore';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import ChecklistPrintTemplate from './ChecklistPrintTemplate';
import { ResultSelect } from './ChecklistResultControls';
import ChecklistCellInput from './ChecklistCellInput';
import { withResult, deriveChecklistStatus, itemCounts } from '../../utils/checklistResult';
import styles from './Checklist.module.css';
import shellStyles from '../Shared/ModuleShell.module.css';
import { useDebounce } from '../../hooks/useDebounce';
import { RETURN_ITP_PARAM, itpReopenPath } from '../../utils/itpReturnLink';
import { useNOIStore } from '../../store/noiStore';
import { useITPStore } from '../../store/itpStore';
import { useITRStore } from '../../store/itrStore';
import { useContractorsStore } from '../../store/contractorsStore';
import { getErrorMessage } from '../../utils/errorUtils';
import { exportChecklistDocx } from '../../services/api';

// --- ITP 資料庫定義 ---
interface ItpItemDefinition {
    eventNo: string;
    activity: string;
    standard: string;
    criteria: string;
    stage: string;
    recordForm: string;
    defaultItems: Array<{
        item: string;
        criteria: string;
        situation: string;
        result: string;
    }>;
    id?: string;
    rev?: string;
}

const itpDatabase: ItpItemDefinition[] = [
    {
        eventNo: "",
        activity: "",
        standard: "",
        criteria: "",
        stage: "",
        recordForm: "",
        defaultItems: []
    }
];

const Checklist: React.FC = () => {
    const { t } = useLanguage();
    const { hasPermission, user } = useAuth();
    // Checklist templates are shared by every project: only a system administrator creates, changes or deletes one
    // (REF-PROJECT-SEQ-2026-001 B2; the server refuses anyone else with SHARED_TEMPLATE_ADMIN_ONLY).
    const isAdmin = !!user?.is_admin;
    const navigate = useNavigate();
    const { records, deleteRecord, addRecord, updateRecord, refreshRecords } = useChecklistStore();
    const [view, setView] = useState<'list' | 'editor'>('list');
    const [editingRecord, setEditingRecord] = useState<ChecklistRecord | null>(null);
    const sharedTemplateLocked = !!editingRecord && !isAdmin && isSharedChecklistTemplate(editingRecord);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 500);

    const { fetchNOIs } = useNOIStore();
    const { fetchITRs } = useITRStore();

    useEffect(() => {
        fetchNOIs();
        fetchITRs();
    }, [fetchNOIs, fetchITRs]);

    // Trigger server-side refetch when debounced search changes
    React.useEffect(() => {
        refreshRecords({ search: debouncedSearch });
    }, [debouncedSearch, refreshRecords]);

    // Deep-link: open a specific record via ?openId=<id-or-recordsNo>&from=<source>
    const [searchParams, setSearchParams] = useSearchParams();
    const fromSource = searchParams.get('from');
    const deepLinkAppliedRef = useRef(false);

    React.useEffect(() => {
        if (deepLinkAppliedRef.current) return;
        const openId = searchParams.get('openId');
        if (!openId) return;
        if (records.length === 0) return;
        const found = records.find(r => r.id === openId || r.recordsNo === openId);
        if (!found) return;
        setEditingRecord(found);
        setView('editor');
        deepLinkAppliedRef.current = true;
        const next = new URLSearchParams(searchParams);
        next.delete('openId');
        setSearchParams(next, { replace: true });
    }, [searchParams, records, setSearchParams]);

    const returnItpId = searchParams.get(RETURN_ITP_PARAM);
    // Opened from an ITP edit window: Cancel goes back to that ITP, so it is labelled "Back to ITP"
    // (CHECKLIST-BACK-LABEL-2026-001). Same condition as handleBack below, so label and destination agree.
    const backToItp = fromSource === 'itp' && !!returnItpId;

    const handleBack = () => {
        if (backToItp && returnItpId) {
            // Back to the ITP edit window this Checklist was opened from (see utils/itpReturnLink).
            // replace: the Checklist entry is left behind, so the browser's own Back afterwards
            // does not bounce between the two pages.
            navigate(itpReopenPath(returnItpId), { replace: true });
        } else if (fromSource === 'itp' || fromSource === 'itr') {
            navigate(-1);
        } else if (view === 'editor') {
            setView('list');
            setEditingRecord(null);
        } else {
            navigate(-1); // Navigate back if in list view and not from specific source
        }
    };

    // Removed Modal State
    const [selectedItpIndex, setSelectedItpIndex] = useState(0);

    const itpList = useITPStore(state => state.itpList);

    // Transform dynamic itpList into itpDatabase format
    const dynamicItpDatabase = useMemo(() => {
        const baseDb: ItpItemDefinition[] = itpDatabase;
        const dynamicItems: ItpItemDefinition[] = itpList
            .filter(itp => itp.hasDetails && Array.isArray(itp.detail_data) && itp.detail_data.length > 0)
            .map(itp => {
                // detail_data is already ITPInspectionItem[]
                const items = itp.detail_data!.map(d => ({
                    item: d.activity,
                    criteria: d.acceptanceCriteria,
                    situation: "",
                    result: ""
                }));

                return {
                    id: itp.id,
                    rev: itp.rev,
                    eventNo: itp.referenceNo || '',
                    activity: itp.description || '',
                    standard: '', // Not in ITPInspectionItem
                    criteria: '', // Not in ITPInspectionItem (it's per item now)
                    stage: 'Before', // Default
                    recordForm: 'CHK-GEN-01', // Default or need new field
                    defaultItems: items
                };
            });
        const merged = [...baseDb, ...dynamicItems];
        const unique = merged.reduce((acc, current) => {
            if (!acc.find(item => item.activity === current.activity)) {
                acc.push(current);
            }
            return acc;
        }, [] as ItpItemDefinition[]);
        return unique;
    }, [itpList]);

    // --- UI/UX for Activity Selection ---
    const handleAddNew = () => {
        setSelectedItpIndex(0);
        setEditingRecord(null);
        setView('editor');
    };

    const handleEdit = useCallback((record: ChecklistRecord) => {
        setEditingRecord(record);
        // Note: For editing, record data has precedence
        setView('editor');
    }, []);

    const handleDelete = useCallback(async (id: string) => {
        if (!window.confirm(t('common.confirmDelete'))) return;
        try {
            await deleteRecord(id);
        } catch (err) {
            // ITR-owned instance / has held results: it used to fail with no message at all; now shown in the refusal dialog
            console.error('Failed to delete checklist:', err);
            showRefusal(err, 'delete');
        }
    }, [deleteRecord, t]);

    const checklistColumns = useMemo(() => createColumns(handleDelete, t, isAdmin), [handleDelete, t, isAdmin]);

    return (
        <div className={shellStyles.container}>
            {view === 'list' ? (
                <>
                    {/* Template-library framing (2026-09-19): this page is a pure
                        template library — Checklist maintains items/criteria only,
                        actual inspection results are filled in from within an ITR
                        after linking a template. No Pass/Fail/pass-rate stats here
                        on purpose; those describe ITR-linked instances, not templates. */}
                    <div className={styles.listIntro}>
                        <h1 className={styles.listIntroTitle}>{t('checklist.title')}</h1>
                        <p className={styles.listIntroDesc}>{t('checklist.pageDescription')}</p>
                    </div>

                    <div className={shellStyles.toolbar}>
                        <div className={styles.listCount}>
                            {records.length} {t('checklist.templatesCount') || 'templates'}
                        </div>
                        <div className={shellStyles.toolbarRight}>
                            <div className={shellStyles.searchWrap}>
                                <Search size={15} className={shellStyles.searchIcon} strokeWidth={2} />
                                <input
                                    type="text"
                                    className={shellStyles.searchInput}
                                    placeholder={t('checklist.searchPlaceholder') || 'Search...'}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            {hasPermission('checklist:create:all') && (
                                <button type="button" onClick={handleAddNew} className={shellStyles.addNewButton}
                                    disabled={!isAdmin} title={isAdmin ? undefined : t('refusal.code.SHARED_TEMPLATE_ADMIN_ONLY')}>
                                    <Plus size={16} /> {t('checklist.addNew') || 'New Template'}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className={shellStyles.content}>
                        <DataTable
                            columns={checklistColumns}
                            data={records}
                            getRowId={(row) => row.id}
                            getRowClassName={(row) =>
                                isTemplateHistoricallyProtected(row) ? shellStyles.rowAlert : ''
                            }
                            onRowClick={(row) => handleEdit(row)}
                        />
                    </div>
                </>
            ) : (
                <ChecklistEditor
                    record={editingRecord}
                    onCancel={handleBack}
                    backToItp={backToItp}
                    saving={saving}
                    // §17: a bare template (itrId & templateId both null) must never take real
                    // pass/fail results directly — force read-only regardless of permission,
                    // so it stays reusable/clean for future "Generate Checklist" links.
                    // This page only ever authors/edits TEMPLATES (see the page
                    // intro above) — a brand-new record is always a template, and
                    // the sole defensive exception below (itrId/templateId set) is
                    // for a stray legacy deep-link, never a normal path here.
                    isBareTemplate={!editingRecord || (!editingRecord.itrId && !editingRecord.templateId)}
                    // A template that already carries real historical inspection
                    // results (legacy data pre-dating §17, or evidence whose true
                    // origin can't be proven — see backend's evidence_historical_
                    // unknown/evidence_recorded_at) can't be safely edited as if it
                    // were clean: locked read-only regardless of permission, with
                    // its original content preserved untouched.
                    sharedTemplateReadOnly={sharedTemplateLocked}
                    readOnly={
                        (!!editingRecord && isTemplateHistoricallyProtected(editingRecord)) || sharedTemplateLocked
                            ? true
                            : !(
                                !editingRecord
                                    ? hasPermission('checklist:create:all')
                                    : (!editingRecord.itrId && !editingRecord.templateId)
                                        ? hasPermission('checklist:update:all')
                                        : (editingRecord.status === 'Pass' || editingRecord.status === 'Fail')
                                            ? hasPermission('checklist:close:all')
                                            : hasPermission('checklist:update:all')
                            )
                    }
                    onSave={async (data) => {
                        setSaving(true);
                        try {
                            const saved = editingRecord
                                ? await updateRecord(editingRecord.id, data)
                                : await addRecord(data);
                            const version = saved.version;
                            toast.success(
                                version === null || version === undefined
                                    ? (t('checklist.saveSuccess') || 'Template saved')
                                    : t('checklist.saveSuccessWithVersion', { version: String(version) })
                            );
                            setView('list');
                        } catch (err: any) {
                            const detail = getErrorMessage(err, t('common.saveFailed'));
                            toast.error(detail);
                        } finally {
                            setSaving(false);
                        }
                    }}
                    // Backend locks detail_data/passCount/failCount once Pass/Fail
                    // (checklist_service.py) — Reopen is the only way back to
                    // Ongoing, since status has no manual dropdown otherwise
                    // (it's always re-derived from item results on Save).
                    // Excludes bare templates — those are read-only unconditionally
                    // (see the readOnly prop above), so Reopen would flip status
                    // back to Ongoing without actually unlocking anything, which
                    // just confuses whoever clicks it.
                    canReopen={
                        !!editingRecord &&
                        !(!editingRecord.itrId && !editingRecord.templateId) &&
                        (editingRecord.status === 'Pass' || editingRecord.status === 'Fail') &&
                        hasPermission('checklist:close:all')
                    }
                    onReopen={async () => {
                        if (!editingRecord) return;
                        setSaving(true);
                        try {
                            await updateRecord(editingRecord.id, { status: 'Ongoing' } as any);
                            const refreshed = records.find(r => r.id === editingRecord.id);
                            if (refreshed) setEditingRecord(refreshed);
                        } catch (err: any) {
                            const detail = getErrorMessage(err, t('common.saveFailed'));
                            toast.error(detail);
                        } finally {
                            setSaving(false);
                        }
                    }}
                    selectedItpIndex={selectedItpIndex}
                    dynamicItpDatabase={dynamicItpDatabase}
                />
            )}
        </div>
    );
};


const ChecklistEditor = ({ record, onCancel, backToItp = false, onSave, saving, readOnly = false, sharedTemplateReadOnly = false, isBareTemplate = false, canReopen = false, onReopen, selectedItpIndex, dynamicItpDatabase }: {
    record: ChecklistRecord | null,
    onCancel: () => void,
    backToItp?: boolean,
    onSave: (data: any) => Promise<void>,
    saving?: boolean,
    readOnly?: boolean,
    /** a shared template opened by someone who is not a system administrator (shown as a notice; readOnly is set too) */
    sharedTemplateReadOnly?: boolean,
    isBareTemplate?: boolean,
    canReopen?: boolean,
    onReopen?: () => Promise<void>,
    selectedItpIndex: number,
    dynamicItpDatabase: ItpItemDefinition[]
}) => {
    const { t } = useLanguage();
    const noiList = useNOIStore(state => state.noiList);
    const itpList = useITPStore(state => state.itpList);
    const itrList = useITRStore(state => state.itrList);
    const { getActiveContractors } = useContractorsStore();


    // Same shared check the list badge and the outer readOnly computation
    // use (isTemplateHistoricallyProtected) — recomputed here too so the
    // editor can show an explanatory banner, not just lock.
    const isHistoricalAnomaly = !!record && isTemplateHistoricallyProtected(record);
    // A historically-anomalous template must stay INSPECTABLE — its
    // Situation/Result values must still render (read-only, via the
    // readOnly fieldset) even though it's a bare template; only a
    // genuinely clean template hides these columns as not-yet-relevant.
    // (2026-09-19 fix: must not switch to template mode and make existing
    // historical results unreadable/impossible to audit.)
    const showResultColumns = !isBareTemplate || isHistoricalAnomaly;

    const [searchParams] = useSearchParams();
    const paramItrId = searchParams.get('itrId');
    const paramItrNumber = searchParams.get('itrNumber');
    const paramNoiNumber = searchParams.get('noiNumber');

    const [activeTab, setActiveTab] = useState<'general' | 'checklist'>('general');

    const [formData, setFormData] = useState<any>(() => {
        if (record) {
            // Include ITP/Analysis fields
            return {
                ...record.data,
                // recordsNo is authoritative ONLY on the top-level record (the
                // backend column) — record.data is detail_data, which for an
                // older save may still hold a stale/placeholder copy (see the
                // 2026-09-19 recordsNo-overwrite fix). Always override with
                // the real value from the row itself, spread order be damned.
                recordsNo: record.recordsNo,
                noiNumber: record.noiNumber,
                contractor: record.contractor,
                packageName: record.packageName,
                activity: record.activity,
                itpId: record.itpId,
                itpVersion: record.itpVersion,
                passCount: record.passCount,
                failCount: record.failCount,
                itrId: record.itrId || paramItrId,
                itrNumber: record.itrNumber || paramItrNumber
            };
        } else {
            const initialItp = dynamicItpDatabase[selectedItpIndex] || dynamicItpDatabase[0];
            const generatedItems = initialItp.defaultItems.map((defItem, idx) => ({
                id: idx + 1,
                item: "", // default: defItem.item
                criteria: "", // default: defItem.criteria
                situation: "", // default: defItem.situation
                result: ""
            }));
            return {
                recordsNo: "[AUTO-GENERATE]",
                packageName: "",
                contractor: "",
                activity: initialItp.activity || '',
                inspectionDate: new Date().toISOString().slice(0, 10),
                location: "",
                stage: initialItp.stage || 'Before',
                revision: 0,
                referenceNo: "",
                itrNumber: paramItrNumber || "",
                itrId: paramItrId || "",
                noiNumber: paramNoiNumber || "",
                items: generatedItems,
                reInspectionDate: "",
                ncrNo: "",
                agreementChecked: true,
                remarks: "1. Mark 'O' for passed items, 'X' for failed items, and '/' for N/A items.\n2. Inspection items and criteria should be detailed with quantified data.",
                signatures: {
                    siteEngineer: "",
                    constructionLeader: "",
                    subcontractorRep: ""
                }
            };
        }
    });

    // NOTE: Record No 由後端自動產生，前端僅負責顯示
    const displayNo = useMemo(() => {
        if (record) {
            return record.recordsNo || "[AUTO-GENERATE]";
        }
        return "[AUTO-GENERATE]";
    }, [record]);

    React.useEffect(() => {
        if (!record) { // Only apply default ITP items if creating a new record
            const itp = dynamicItpDatabase[selectedItpIndex] || dynamicItpDatabase[0];
            const generatedItems = itp.defaultItems.map((defItem, idx) => ({
                id: idx + 1,
                item: "", // default: defItem.item
                criteria: "", // default: defItem.criteria
                situation: "", // default: defItem.situation
                result: ""
            }));
            setFormData((prev: any) => ({
                ...prev,
                activity: itp.activity || '',
                stage: itp.stage || 'Before',
                items: generatedItems,
                // Do not overwrite other fields if they are already set?
                // Actually if user changes template/activity selection (not possible here except by Back/Cancel), we would reset.
            }));
        }
    }, [selectedItpIndex, record, dynamicItpDatabase]);

    const [isPrinting, setIsPrinting] = useState(false);
    const leaveGuard = useDraftGuard(formData, !!saving, !readOnly);
    const requestCancel = () => leaveGuard.requestClose(onCancel);

    useEffect(() => {
        if (isPrinting) {
            const timer = setTimeout(() => {
                window.print();
            }, 500); // Wait for portal to render

            const onAfterPrint = () => setIsPrinting(false);
            window.addEventListener('afterprint', onAfterPrint);

            return () => {
                clearTimeout(timer);
                window.removeEventListener('afterprint', onAfterPrint);
            };
        }
    }, [isPrinting]);

    const handlePrint = () => setIsPrinting(true);

    // Word export (CHECKLIST-BACK-LABEL-2026-001 R2): the server builds the file from the SAVED record, so a new
    // template or unsaved edits would silently be missing from it — ask for a save first instead (as the Audit wizard).
    const [exportingDocx, setExportingDocx] = useState(false);
    const handleExportDocx = async () => {
        if (exportingDocx || saving) return;
        if (!record || leaveGuard.dirty) {
            toast.warning(t('checklist.exportSaveFirst'));
            return;
        }
        setExportingDocx(true);
        try {
            await exportChecklistDocx(record.id, record.recordsNo || 'Checklist');
        } catch (err) {
            console.error('Checklist Word export failed:', err);
            toast.error(t('common.exportFailed') || 'Export failed. Please try again.');
        } finally {
            setExportingDocx(false);
        }
    };

    return (
        <div className={styles.editorWrapper}>
            {/* --- Web view (Editing) --- */}
            <div className={`${styles.webEditor} print:hidden`}>
                <div className={styles.webHeader}>
                    <div className={styles.webHeaderLeft} style={{ flex: 1, marginRight: '20px' }}>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Activity / Inspection Item</label>
                            <input
                                className="text-2xl font-bold text-slate-800 border-b-2 border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none bg-transparent transition-all w-full placeholder:text-slate-300"
                                value={formData.activity}
                                onChange={(e) => setFormData({ ...formData, activity: e.target.value })}
                                placeholder={t('checklist.activityPlaceholder') || 'Enter Activity Name...'}
                                list="editor-itp-options"
                                disabled={readOnly}
                            />
                            <datalist id="editor-itp-options">
                                {dynamicItpDatabase.map((itp, idx) => (
                                    <option key={idx} value={itp.activity} />
                                ))}
                            </datalist>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-sm text-slate-500 font-bold uppercase">Form ID:</span>
                            <input
                                className="text-sm font-medium text-slate-700 border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none bg-transparent transition-all w-[200px]"
                                // Always the backend-authoritative value (displayNo reads
                                // record.recordsNo directly, never formData/detail_data) —
                                // see the 2026-09-19 recordsNo-overwrite fix.
                                value={displayNo || t('form.autoGenerated')}
                                readOnly
                                style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: record ? '#000000' : '#666666' }}
                            />
                            {isBareTemplate && (
                                <span className={styles.modeBadge}>
                                    {record ? (t('checklist.modeEditBadge') || 'Editing Template') : (t('checklist.modeNewBadge') || 'New Template')}
                                </span>
                            )}
                        </div>
                    </div>
                    
                </div>

                {isHistoricalAnomaly ? (
                    <div className={styles.historicalBanner}>
                        <History size={16} />
                        {t('checklist.historicalDataBanner') || 'This template contains historical inspection data. Its original content has been preserved and is shown read-only — it cannot be safely edited here.'}
                    </div>
                ) : isBareTemplate && (
                    <div className={styles.templateBanner}>
                        <Info size={16} />
                        {t('checklist.templateModeBanner') || 'Template Mode — maintain inspection items and acceptance criteria here. Fill in actual inspection results after linking this template within an ITR.'}
                    </div>
                )}
                {sharedTemplateReadOnly && (
                    <div className={styles.templateBanner}>
                        <Info size={16} />
                        {t('project.sharedTemplateReadOnly')}
                    </div>
                )}

                {!isBareTemplate && (
                <div className={styles.tabsContainer}>
                    <button
                        className={`${styles.tabButton} ${activeTab === 'general' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('general')}
                    >
                        {t('common.baseInfo') || 'General Info'}
                    </button>
                    <button
                        className={`${styles.tabButton} ${activeTab === 'checklist' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('checklist')}
                    >
                        {t('checklist.listTitle') || 'Checklist'}
                        {` (${formData.items.length})`}
                    </button>
                </div>
                )}

                {/* A single disabled fieldset locks every input/select/textarea/button
                    below in one shot when readOnly (closed record, insufficient permission). */}
                <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }}>

                {/* --- Project Information (instance execution context — not
                    shown in template mode; see the page intro/banners above) --- */}
                {!isBareTemplate && activeTab === 'general' && (
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
                                <Info size={18} />
                            </div>
                            <h2>Project Information</h2>
                        </div>
                        <div className={styles.cardContent}>
                            <div className={styles.grid3}>
                                <div className={styles.formGroup}>
                                    <label>Project Title *</label>
                                    <select
                                        className={styles.modernSelect}
                                        value={formData.projectTitle || ''}
                                        onChange={e => setFormData({ ...formData, projectTitle: e.target.value })}
                                    >
                                        <option value="Hai Long">Hai Long</option>
                                        <option value="Yunlin">Yunlin</option>
                                        <option value="Greater Changhua">Greater Changhua</option>
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>ITR No.</label>
                                    <select
                                        className={styles.modernSelect}
                                        value={formData.referenceNo || ''}
                                        onChange={e => setFormData({ ...formData, referenceNo: e.target.value })}
                                    >
                                        <option value="">Select ITR</option>
                                        {itrList.map((itr: any) => (
                                            <option key={itr.id} value={itr.referenceNo || itr.documentNumber}>
                                                {itr.referenceNo || itr.documentNumber}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>NOI Number</label>
                                    <select
                                        className={styles.modernSelect}
                                        value={formData.noiNumber || ''}
                                        onChange={e => {
                                            const selectedNoi = noiList.find(n => n.referenceNo === e.target.value);
                                            const linkedItp = selectedNoi ? itpList.find(i => i.referenceNo === selectedNoi.itpNo) : undefined;
                                            setFormData({
                                                ...formData,
                                                noiNumber: e.target.value,
                                                packageName: selectedNoi?.package || formData.packageName,
                                                contractor: selectedNoi?.contractor || formData.contractor,
                                                // NOI has no location field — `checkpoint` is an H/W/S/R
                                                // inspection-type code, not a place (see
                                                // feedback_noi_title_field memory). Previously mismapped
                                                // here; location stays whatever the user types.
                                                activity: linkedItp?.description || formData.activity
                                            });
                                        }}
                                    >
                                        <option value="">Select NOI</option>
                                        {noiList.map(n => <option key={n.id} value={n.referenceNo}>{n.referenceNo}</option>)}
                                    </select>
                                </div>

                                <div className={styles.formGroup}>
                                    <label>Contractor</label>
                                    <select
                                        className={styles.modernSelect}
                                        value={formData.contractor}
                                        onChange={e => setFormData({ ...formData, contractor: e.target.value })}
                                    >
                                        <option value="">-- Select --</option>
                                        {getActiveContractors().map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Inspection Date *</label>
                                    <div className="relative">
                                        <input
                                            type="date"
                                            className={styles.modernInput}
                                            value={formData.inspectionDate}
                                            onChange={e => setFormData({ ...formData, inspectionDate: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Inspection Location</label>
                                    <div className="relative">
                                        <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            className={`${styles.modernInput} pl-10`}
                                            value={formData.location}
                                            onChange={e => setFormData({ ...formData, location: e.target.value })}
                                            placeholder="e.g. Foundation Area"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- Inspection Checklist --- */}
                {(isBareTemplate || activeTab === 'checklist') && (
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div className="flex items-center gap-10 flex-1">
                                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
                                    <CheckCircle size={18} />
                                </div>
                                <h2>{isBareTemplate ? (t('checklist.listTitle') || 'Checklist Template') : 'Inspection Checklist'}</h2>
                            </div>
                            <button className={actionStyles.secondary}
                                onClick={() => {
                                    const newId = formData.items.length > 0 ? Math.max(...formData.items.map((i: any) => i.id)) + 1 : 1;
                                    setFormData({
                                        ...formData,
                                        items: [
                                            ...formData.items,
                                            // A fresh row never starts pre-marked O/Pass — that made
                                            // sense nowhere, but especially not for a template row,
                                            // which must never carry a result at all (see the
                                            // template-mode Save payload above).
                                            { id: newId, item: "", criteria: "", situation: "", result: "" }
                                        ]
                                    });
                                }}
                            >
                                <Plus size={16} /> Add Row
                            </button>
                        </div>
                        <div className={`${styles.cardContent} ${styles.itemsTableWrap}`} style={{ padding: 0 }}>
                            {/* Proportional columns (CHECKLIST-TEMPLATE-LAYOUT-2026-001): Criteria is usually the
                                longest text, so it gets the widest share; the result columns take theirs when shown. */}
                            <table className={`${styles.webTable} ${showResultColumns ? styles.webTableWithResults : ''}`}>
                                <colgroup>
                                    <col className={styles.colNo} />
                                    <col className={styles.colItem} />
                                    <col className={styles.colCriteria} />
                                    {showResultColumns && <col />}
                                    {showResultColumns && <col className={styles.colResult} />}
                                    <col className={styles.colDelete} />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>{t('checklist.item') || 'Inspection Item'}</th>
                                        <th>{t('checklist.criteria') || 'Criteria'}</th>
                                        {showResultColumns && <th>Actual Situation</th>}
                                        {showResultColumns && <th>Result</th>}
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {formData.items.map((item: any, idx: number) => (
                                        <tr key={idx}>
                                            <td className={styles.webItemNo}>{item.id}</td>
                                            <td>
                                                <ChecklistCellInput
                                                    bold
                                                    value={item.item}
                                                    placeholder="Enter inspection item..."
                                                    onChange={value => {
                                                        const newItems = [...formData.items];
                                                        newItems[idx].item = value;
                                                        setFormData({ ...formData, items: newItems });
                                                    }}
                                                />
                                            </td>
                                            <td>
                                                <ChecklistCellInput
                                                    value={item.criteria}
                                                    placeholder="Enter criteria..."
                                                    onChange={value => {
                                                        const newItems = [...formData.items];
                                                        newItems[idx].criteria = value;
                                                        setFormData({ ...formData, items: newItems });
                                                    }}
                                                />
                                            </td>
                                            {showResultColumns && (
                                            <td>
                                                <ChecklistCellInput
                                                    value={item.situation}
                                                    placeholder="Enter observation..."
                                                    onChange={value => {
                                                        const newItems = [...formData.items];
                                                        newItems[idx].situation = value;
                                                        setFormData({ ...formData, items: newItems });
                                                    }}
                                                />
                                            </td>
                                            )}
                                            {showResultColumns && (
                                            <td className={styles.resultCell}>
                                                {/* Same four-way control as the ITR snapshot (no cycling
                                                    button). For a historically-anomalous template this is
                                                    locked read-only, so the original values are simply shown. */}
                                                <ResultSelect
                                                    value={item.result}
                                                    disabled={readOnly}
                                                    onChange={(code) => {
                                                        const newItems = [...formData.items];
                                                        newItems[idx] = withResult(newItems[idx], code);
                                                        setFormData({ ...formData, items: newItems });
                                                    }}
                                                />
                                                {item.result === '/' && (
                                                    <div className="mt-1 text-[11px] text-slate-500" data-na-reason-line>
                                                        {String(item.naReason ?? '').trim()
                                                            ? <>{t('checklist.na.reasonLabel')}: {item.naReason}</>
                                                            : t('checklist.na.legacyNoReason')}
                                                    </div>
                                                )}
                                            </td>
                                            )}
                                            <td className={styles.webDeleteCell}>
                                                <button
                                                    onClick={() => {
                                                        const newItems = formData.items.filter((_: any, i: number) => i !== idx);
                                                        setFormData({ ...formData, items: newItems });
                                                    }}
                                                    className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* --- Inspection Status Section (results/NCR/signatures — instance-
                    only; never shown in template mode, see spec item 3) --- */}
                {!isBareTemplate && activeTab === 'general' && (
                    <>
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
                                    <CheckCircle size={18} />
                                </div>
                                <h2>Inspection Status</h2>
                            </div>
                            <div className={styles.cardContent} style={{ display: 'flex', gap: '32px', padding: '20px 24px' }}>
                                <label className={styles.checkOption} style={{ margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 500, color: '#475569' }}>
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600"
                                        checked={formData.agreementChecked}
                                        onChange={e => setFormData({ ...formData, agreementChecked: e.target.checked })}
                                    />
                                    All inspection done & meet standards
                                </label>
                                <label className={styles.checkOption} style={{ margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 500, color: '#475569' }}>
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600"
                                        checked={!formData.agreementChecked}
                                        onChange={e => setFormData({ ...formData, agreementChecked: !e.target.checked })}
                                    />
                                    Unfinished improvement (NCR required)
                                </label>
                            </div>
                        </div>

                        {/* --- Bottom Section (NCR & Signatures) --- */}
                        <div className={styles.grid2}>
                            <div className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
                                        <AlertCircle size={18} />
                                    </div>
                                    <h2>NCR & Remarks</h2>
                                </div>
                                <div className={styles.cardContent}>
                                    <div className="flex flex-col gap-4">
                                        <div className={styles.formGroup}>
                                            <label>NCR No.</label>
                                            <input
                                                className={styles.modernInput}
                                                disabled={formData.agreementChecked}
                                                value={formData.agreementChecked ? "N/A" : formData.ncrNo}
                                                placeholder="e.g. NCR-001"
                                                onChange={e => setFormData({ ...formData, ncrNo: e.target.value })}
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label>Re-inspection Date</label>
                                            <input
                                                type={formData.agreementChecked ? "text" : "date"}
                                                className={styles.modernInput}
                                                disabled={formData.agreementChecked}
                                                value={formData.agreementChecked ? "N/A" : formData.reInspectionDate}
                                                onChange={e => setFormData({ ...formData, reInspectionDate: e.target.value })}
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label>Remarks</label>
                                            <textarea
                                                className={styles.modernInput}
                                                style={{ minHeight: '100px' }}
                                                value={formData.remarks}
                                                onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
                                        <User size={18} />
                                    </div>
                                    <h2>Signatures</h2>
                                </div>
                                <div className={styles.cardContent}>
                                    <div className="flex flex-col gap-4">
                                        <div className={styles.grid2}>
                                            <div className={styles.signatureCard}>
                                                <div className={styles.signatureIcon}><Signature size={20} /></div>
                                                <div className={styles.signatureTitle}>Site Engineer</div>
                                                <div className={styles.signatureHelper}>Click to sign</div>
                                            </div>
                                            <div className={styles.signatureCard}>
                                                <div className={styles.signatureIcon}><Signature size={20} /></div>
                                                <div className={styles.signatureTitle}>Construction Leader</div>
                                                <div className={styles.signatureHelper}>Click to sign</div>
                                            </div>
                                        </div>
                                        <div className={styles.signatureCard} style={{ width: '100%' }}>
                                            <div className={styles.signatureIcon}><Signature size={20} /></div>
                                            <div className={styles.signatureTitle}>Subcontractor Representative</div>
                                            <div className={styles.signatureHelper}>Click to sign</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
                </fieldset>
                {/* Navigation and output on the left, saving on the right (as the Audit wizard / NOI), user 2026-10-12. */}
                <FormActions tools={<>
                    <button className={actionStyles.secondary} onClick={requestCancel}>
                        {backToItp
                            ? <><ArrowLeft size={16} /> {t('checklist.backToItp') || 'Back to ITP'}</>
                            : t('common.cancel')}
                    </button>
                    <button className={actionStyles.secondary} onClick={handlePrint}>
                        <Printer size={16} /> {t('common.print')}
                    </button>
                    <button className={actionStyles.secondary} onClick={handleExportDocx} disabled={saving || exportingDocx}>
                        <FileText size={16} /> {exportingDocx ? (t('common.exporting') || 'Exporting...') : (t('common.exportWord') || 'Export Word')}
                    </button>
                    {!readOnly && isBareTemplate && record && (
                        <span className={styles.saveHint}>{t('checklist.updateTemplateNote') || 'Updating this template does not affect existing ITR references.'}</span>
                    )}
                </>}
                    secondary={<>{canReopen && onReopen && (
                        <button className={actionStyles.workflow}
                            disabled={saving}
                            onClick={onReopen}
                            title={t('checklist.reopenHint') || 'Switch back to Ongoing so inspection results can be edited again'}
                        >
                            {t('checklist.reopen') || 'Reopen'}
                        </button>
                    )}</>}
                    primary={<>{!readOnly && (
                            <button className={actionStyles.primary}
                                disabled={saving}
                                onClick={() => onSave(
                                    isBareTemplate
                                        ? {
                                            // Template save: identity + items/criteria only. status is
                                            // always 'Ongoing' (the one value that can never carry
                                            // evidence per _touched_fields_carry_results) — a template
                                            // must never carry real inspection evidence; the backend
                                            // rejects the write outright if it does (see checklist_
                                            // service.py's bare-template guard). "Actual Situation"/
                                            // "Result" aren't even editable in template mode (see the
                                            // items table below). `date`/`status` are still required by
                                            // the backend's create schema even for a template.
                                            //
                                            // recordsNo is deliberately OMITTED here (2026-09-19 fix):
                                            // it is backend-assigned on create and must never be sent on
                                            // update — a stale "[AUTO-GENERATE]" placeholder that leaked
                                            // into formData/detail_data on a prior save would otherwise
                                            // silently overwrite the record's real, already-assigned
                                            // number. `data` strips it too, so detail_data never carries
                                            // a second, driftable copy of it at all.
                                            activity: formData.activity || 'N/A',
                                            date: formData.inspectionDate || new Date().toISOString().slice(0, 10),
                                            status: 'Ongoing',
                                            data: (({ recordsNo: _omit, ...rest }) => ({
                                                ...rest,
                                                items: formData.items.map((i: any) => ({
                                                    id: i.id, item: i.item, criteria: i.criteria,
                                                    situation: '', result: '',
                                                })),
                                            }))(formData),
                                            itpIndex: selectedItpIndex,
                                        }
                                        : {
                                            itpId: formData.itpId,
                                            itpVersion: formData.itpVersion,
                                            ...itemCounts(formData.items),
                                            activity: formData.activity || 'N/A',
                                            date: formData.inspectionDate,
                                            status: deriveChecklistStatus(formData.items),
                                            packageName: formData.packageName || 'RKS',
                                            contractor: formData.contractor,
                                            location: formData.location,
                                            revision: formData.revision,
                                            noiNumber: formData.noiNumber,
                                            itrId: formData.itrId,
                                            itrNumber: formData.itrNumber,
                                            // recordsNo omitted — see the template-mode branch's comment.
                                            data: (({ recordsNo: _omit, ...rest }) => rest)(formData),
                                            itpIndex: selectedItpIndex,
                                        }
                                )}
                            >
                                {isBareTemplate
                                    ? (saving ? (t('checklist.savingTemplate') || 'Saving...') : (t('checklist.saveTemplate') || 'Save Template'))
                                    : (saving ? t('common.saving') : t('common.save'))}
                            </button>
                    )}</>} />
            </div>

            {/* --- Print View (Portal) --- */}
            {/* Always render portal but hide via CSS to support Ctrl+P */}
            {ReactDOM.createPortal(
                <ChecklistPrintTemplate formData={formData} displayNo={displayNo} />,
                document.body
            )}
        </div>
    );
};

export default Checklist;
