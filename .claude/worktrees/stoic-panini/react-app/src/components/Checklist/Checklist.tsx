import React, { useState, useMemo, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { Plus, Printer, FileText, Info, MapPin, Calendar, CheckCircle, AlertCircle, Trash2, XCircle, Check, HelpCircle, User, Signature } from 'lucide-react';
import { useChecklist, ChecklistRecord } from '../../context/ChecklistContext';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { BackButton } from '@/components/ui/BackButton';
import styles from './Checklist.module.css';
import { useDebounce } from '../../hooks/useDebounce';
import { useNOI } from '../../context/NOIContext';
import { useITP } from '../../context/ITPContext';
import { useITR } from '../../context/ITRContext';
import { useContractors } from '../../context/ContractorsContext';

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
    const navigate = useNavigate();
    const { records, loading, deleteRecord, addRecord, updateRecord, refreshRecords } = useChecklist();
    const [view, setView] = useState<'list' | 'editor'>('list');
    const [editingRecord, setEditingRecord] = useState<ChecklistRecord | null>(null);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 500);

    // Trigger server-side refetch when debounced search changes
    React.useEffect(() => {
        refreshRecords({ search: debouncedSearch });
    }, [debouncedSearch, refreshRecords]);

    // Data is now primarily filtered by backend.
    const filteredList = useMemo(() => {
        return records;
    }, [records]);

    // Check for query param 'recordNo' to open specific record
    const [searchParams] = useSearchParams();
    const recordNoParam = searchParams.get('recordNo');
    const fromSource = searchParams.get('from');

    React.useEffect(() => {
        if (recordNoParam && records.length > 0) {
            const found = records.find(r => r.recordsNo === recordNoParam);
            if (found) {
                setEditingRecord(found);
                setView('editor');
            } else {
                alert(t('checklist.recordNotFound') || 'Record not found');
            }
        } else if (fromSource === 'itr' && !editingRecord) {
            // 如果是從 ITR 來的，且沒有 recordNo (表示要新增)，直接進入編輯模式
            // 這裡不需要設定 editingRecord，因為 ChecklistEditor 會處理新增邏輯
            setView('editor');
        }
    }, [recordNoParam, records, t, fromSource, editingRecord]);

    const handleBack = () => {
        if (fromSource === 'itp' || fromSource === 'itr') {
            navigate(-1);
        } else if (view === 'editor') {
            setView('list');
            setEditingRecord(null);
        } else {
            navigate(-1); // Navigate back if in list view and not from specific source
        }
    };

    // --- 統計數據 ---
    const stats = useMemo(() => {
        const total = records.length;
        const passed = records.filter(r => r.status === 'Pass').length;
        const ongoing = records.filter(r => r.status === 'Ongoing').length;
        const failed = records.filter(r => r.status === 'Fail').length;
        const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
        return { total, passed, ongoing, failed, passRate };
    }, [records]);

    // Removed Modal State
    const [selectedItpIndex, setSelectedItpIndex] = useState(0);

    const { itpList } = useITP();

    // Transform dynamic itpList into itpDatabase format
    const dynamicItpDatabase = useMemo(() => {
        const baseDb: ItpItemDefinition[] = itpDatabase;
        const dynamicItems: ItpItemDefinition[] = itpList.filter(itp => itp.hasDetails && itp.detail_data).map(itp => {
            const parsed = JSON.parse(itp.detail_data!);
            return {
                id: itp.id,
                rev: itp.rev,
                eventNo: itp.referenceNo || '',
                activity: itp.description || '',
                standard: parsed.standard || '',
                criteria: parsed.criteria || '',
                stage: parsed.stage || 'Before',
                recordForm: parsed.recordForm || 'CHK-GEN-01',
                defaultItems: parsed.items || []
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
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [tempActivityName, setTempActivityName] = useState('');
    const [customActivityName, setCustomActivityName] = useState('');

    const handleAddNew = () => {
        setTempActivityName('');
        setShowActivityModal(true);
    };

    const confirmActivitySelection = () => {
        const matchIndex = dynamicItpDatabase.findIndex(itp => itp.activity === tempActivityName);
        if (matchIndex >= 0) {
            setSelectedItpIndex(matchIndex);
        } else {
            setSelectedItpIndex(0); // Default empty template
        }
        setCustomActivityName(tempActivityName);
        setEditingRecord(null); // Ensure we are in create mode
        setView('editor');
        setShowActivityModal(false);
    };

    const handleEdit = (record: ChecklistRecord) => {
        setEditingRecord(record);
        // Note: For editing, record data has precedence
        setView('editor');
    };

    const handleDelete = async (id: string) => {
        if (window.confirm("Are you sure you want to delete this record?")) {
            await deleteRecord(id);
        }
    };

    const checklistColumns = useMemo(() => createColumns(handleEdit, handleDelete, t), [handleEdit, handleDelete, t]);

    return (
        <div className={styles.container}>
            {/* Activity Selection Modal */}
            {showActivityModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-[400px] shadow-xl">
                        <h2 className="text-xl font-bold mb-4">Select Activity</h2>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Activity (ITP)
                            </label>
                            <input
                                className="w-full border rounded-md p-2"
                                value={tempActivityName}
                                onChange={(e) => setTempActivityName(e.target.value)}
                                list="itp-options"
                                placeholder="Enter or select activity..."
                            />
                            <datalist id="itp-options">
                                {dynamicItpDatabase.map((itp, idx) => (
                                    <option key={idx} value={itp.activity || `Template ${idx + 1}`} />
                                ))}
                            </datalist>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowActivityModal(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmActivitySelection}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <BackButton onClick={handleBack} />
                    <h1> {t('checklist.title') || 'Checklist Management'}</h1>
                </div>
                {view === 'list' && (
                    <div className={styles.headerRight}>
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder={t('checklist.searchPlaceholder') || 'Search...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                )}
            </div>

            {view === 'list' ? (
                <>
                    <div className={styles.summarySection}>
                        <h2 className={styles.summaryTitle}>{t('common.statistics') || 'Statistics'}</h2>
                        <div className={styles.statsContainer}>
                            <div className={styles.statusStatsGrid}>
                                {/* Ongoing */}
                                <div className={styles.statItem}>
                                    <div className={`${styles.statIcon} ${styles.blueIcon}`}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="12" cy="12" r="10" />
                                            <polyline points="12 6 12 12 16 14" />
                                        </svg>
                                    </div>
                                    <div className={styles.statContent}>
                                        <div className={styles.statLabel}>{t('checklist.status.ongoing') || 'Ongoing'}</div>
                                        <div className={styles.statValue}>{stats.ongoing}</div>
                                    </div>
                                </div>
                                {/* Passed */}
                                <div className={styles.statItem}>
                                    <div className={`${styles.statIcon} ${styles.greenIcon}`}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </div>
                                    <div className={styles.statContent}>
                                        <div className={styles.statLabel}>{t('checklist.status.pass') || 'Pass'}</div>
                                        <div className={styles.statValue}>{stats.passed}</div>
                                    </div>
                                </div>
                                {/* Failed */}
                                <div className={styles.statItem}>
                                    <div className={`${styles.statIcon} ${styles.pinkIcon}`}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </div>
                                    <div className={styles.statContent}>
                                        <div className={styles.statLabel}>{t('checklist.status.fail') || 'Fail'}</div>
                                        <div className={styles.statValue}>{stats.failed}</div>
                                    </div>
                                </div>
                                {/* Total */}
                                <div className={styles.statItem}>
                                    <div className={`${styles.statIcon} ${styles.grayIcon}`}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d="M18 17V9M12 17V5M6 17v-3" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </div>
                                    <div className={styles.statContent}>
                                        <div className={styles.statLabel}>{t('common.total') || 'Total'}</div>
                                        <div className={styles.statValue}>{stats.total}</div>
                                    </div>
                                </div>
                                {/* Pass Rate */}
                                <div className={styles.statItem}>
                                    <div className={`${styles.statIcon} ${styles.blueIcon}`}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </div>
                                    <div className={styles.statContent}>
                                        <div className={styles.statLabel}>{t('common.passRate') || 'Pass Rate'}</div>
                                        <div className={styles.statValue}>{stats.passRate}%</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={styles.content}>
                        <DataTable
                            title={t('checklist.listTitle') || "Checklist Records"}
                            actions={
                                <button onClick={handleAddNew} className={styles.addNewButton}>
                                    <Plus size={18} /> {t('checklist.addNew') || "New Checklist"}
                                </button>
                            }
                            columns={checklistColumns}
                            data={filteredList}
                            getRowId={(row) => row.id}
                        />


                    </div>
                </>
            ) : (
                <ChecklistEditor
                    record={editingRecord}
                    onCancel={handleBack}
                    saving={saving}
                    onSave={async (data) => {
                        setSaving(true);
                        try {
                            if (editingRecord) {
                                await updateRecord(editingRecord.id, data);
                            } else {
                                await addRecord(data);
                            }
                            setView('list');
                        } catch (err: any) {
                            let detail = err?.response?.data?.detail || t('common.saveFailed') || 'Save failed';
                            if (typeof detail === 'object') {
                                detail = JSON.stringify(detail);
                            }
                            alert(detail);
                        } finally {
                            setSaving(false);
                        }
                    }}
                    selectedItpIndex={selectedItpIndex}
                    customActivityName={customActivityName}
                    dynamicItpDatabase={dynamicItpDatabase}
                />
            )}
        </div>
    );
};


const ChecklistEditor = ({ record, onCancel, onSave, saving, selectedItpIndex, customActivityName, dynamicItpDatabase }: {
    record: ChecklistRecord | null,
    onCancel: () => void,
    onSave: (data: any) => Promise<void>,
    saving?: boolean,
    selectedItpIndex: number,
    customActivityName?: string,
    dynamicItpDatabase: ItpItemDefinition[]
}) => {
    const { t } = useLanguage();
    const { noiList } = useNOI();
    const { itpList } = useITP();
    const { itrList } = useITR();
    const { contractors } = useContractors();

    const getActiveContractors = () => contractors.filter(c => c.status === 'active');

    const [searchParams] = useSearchParams();
    const paramItrId = searchParams.get('itrId');
    const paramItrNumber = searchParams.get('itrNumber');
    const paramNoiNumber = searchParams.get('noiNumber');

    const [formData, setFormData] = useState<any>(() => {
        if (record) {
            // Include ITP/Analysis fields
            return {
                ...record.data,
                noiNumber: record.noiNumber,
                contractor: record.contractor,
                packageName: record.packageName,
                activity: record.activity,
                itpId: record.itpId,
                itpVersion: record.itpVersion,
                passCount: record.passCount,
                failCount: record.failCount,
                itrId: record.itrId,
                itrNumber: record.itrNumber
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
                activity: customActivityName || initialItp.activity || '',
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
                activity: customActivityName || itp.activity || '',
                stage: itp.stage || 'Before',
                items: generatedItems,
                // Do not overwrite other fields if they are already set?
                // Actually if user changes template/activity selection (not possible here except by Back/Cancel), we would reset.
            }));
        }
    }, [selectedItpIndex, record, dynamicItpDatabase]);

    const [isPrinting, setIsPrinting] = useState(false);

    const handlePrint = useCallback(() => {
        setIsPrinting(true);
    }, []);

    // Print effect — same pattern as NOI batch print
    useEffect(() => {
        if (!isPrinting) return;
        const timer = setTimeout(() => {
            window.print();
        }, 1000);
        const onAfterPrint = () => setIsPrinting(false);
        window.addEventListener('afterprint', onAfterPrint);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('afterprint', onAfterPrint);
        };
    }, [isPrinting]);

    // 補足空行邏輯 (A4 列印優化)
    const paddingRows = useMemo(() => {
        const minRows = 8;
        const currentRows = formData.items.length;
        if (currentRows < minRows) {
            return new Array(minRows - currentRows).fill(null);
        }
        return [];
    }, [formData.items]);

    return (
        <div className={styles.editorWrapper}>
            {/* --- Web view (Editing) --- */}
            <div className={`${styles.webEditor} ${styles.printHidden}`}>
                <div className={styles.webHeader}>
                    <div className={styles.webHeaderLeft}>
                        <h1>{formData.activity || t('checklist.activityPlaceholder') || 'Field Inspection'}</h1>
                        <p>Form ID: {displayNo}</p>
                    </div>
                    <div className={styles.webHeaderRight}>
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg font-bold text-sm hover:bg-slate-50 transition-colors"
                        >
                            <Printer size={16} /> {t('common.print')}
                        </button>
                        <button
                            disabled={saving}
                            onClick={() => onSave({
                                itpId: formData.itpId,
                                itpVersion: formData.itpVersion,
                                passCount: formData.items.filter((i: any) => i.result === 'O').length,
                                failCount: formData.items.filter((i: any) => i.result === 'X').length,
                                activity: formData.activity || 'N/A',
                                date: formData.inspectionDate,
                                status: formData.items.every((i: any) => i.result === 'O') ? 'Pass' : 'Fail',
                                packageName: formData.packageName || 'RKS',
                                contractor: formData.contractor,
                                location: formData.location,
                                revision: formData.revision,
                                noiNumber: formData.noiNumber,
                                itrId: formData.itrId,
                                itrNumber: formData.itrNumber,
                                data: { ...formData },
                                itpIndex: selectedItpIndex
                            })}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition-shadow disabled:opacity-50"
                        >
                            {saving ? t('common.saving') : t('common.save')}
                        </button>
                        <button onClick={onCancel} className="px-4 py-2 text-slate-500 hover:text-slate-800 font-bold text-sm">
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>

                {/* --- Project Information --- */}
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
                                <input
                                    className={styles.modernInput}
                                    value={formData.referenceNo}
                                    onChange={e => setFormData({ ...formData, referenceNo: e.target.value })}
                                    placeholder="Manual Entry"
                                />
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
                                            location: selectedNoi?.checkpoint || formData.location,
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

                {/* --- Inspection Checklist --- */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className="flex items-center gap-10 flex-1">
                            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
                                <CheckCircle size={18} />
                            </div>
                            <h2>Inspection Checklist</h2>
                        </div>
                        <button
                            onClick={() => {
                                const newId = formData.items.length > 0 ? Math.max(...formData.items.map((i: any) => i.id)) + 1 : 1;
                                setFormData({
                                    ...formData,
                                    items: [
                                        ...formData.items,
                                        { id: newId, item: "", criteria: "", situation: "", result: "O" }
                                    ]
                                });
                            }}
                            className="flex items-center gap-1 px-3 py-1 text-blue-600 hover:bg-blue-50 rounded-md transition-colors text-sm font-bold"
                        >
                            <Plus size={16} /> Add Row
                        </button>
                    </div>
                    <div className={styles.cardContent} style={{ padding: 0 }}>
                        <table className={styles.webTable}>
                            <thead>
                                <tr>
                                    <th style={{ width: '60px' }}>#</th>
                                    <th>Inspection Item</th>
                                    <th style={{ width: '200px' }}>Criteria</th>
                                    <th style={{ width: '200px' }}>Actual Situation</th>
                                    <th style={{ width: '120px', textAlign: 'center' }}>Result</th>
                                    <th style={{ width: '50px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {formData.items.map((item: any, idx: number) => (
                                    <tr key={idx}>
                                        <td className={styles.webItemNo}>{item.id}</td>
                                        <td>
                                            <input
                                                className={styles.underlineInput}
                                                style={{ fontWeight: 600 }}
                                                value={item.item}
                                                placeholder="Enter inspection item..."
                                                onChange={e => {
                                                    const newItems = [...formData.items];
                                                    newItems[idx].item = e.target.value;
                                                    setFormData({ ...formData, items: newItems });
                                                }}
                                            />
                                        </td>
                                        <td>
                                            <div className={styles.criteriaBox}>
                                                <input
                                                    className="w-full bg-transparent border-none outline-none"
                                                    value={item.criteria}
                                                    placeholder="Enter criteria..."
                                                    onChange={e => {
                                                        const newItems = [...formData.items];
                                                        newItems[idx].criteria = e.target.value;
                                                        setFormData({ ...formData, items: newItems });
                                                    }}
                                                />
                                            </div>
                                        </td>
                                        <td>
                                            <input
                                                className={styles.underlineInput}
                                                value={item.situation}
                                                placeholder="Enter observation..."
                                                onChange={e => {
                                                    const newItems = [...formData.items];
                                                    newItems[idx].situation = e.target.value;
                                                    setFormData({ ...formData, items: newItems });
                                                }}
                                            />
                                        </td>
                                        <td>
                                            <div className="flex justify-center">
                                                <div
                                                    className={`${styles.statusChip} ${item.result === 'O' ? styles.chipPass : (item.result === 'X' ? styles.chipFail : styles.chipNA)}`}
                                                    onClick={() => {
                                                        const newItems = [...formData.items];
                                                        newItems[idx].result = newItems[idx].result === 'O' ? 'X' : (newItems[idx].result === 'X' ? '/' : 'O');
                                                        setFormData({ ...formData, items: newItems });
                                                    }}
                                                >
                                                    {item.result === 'O' ? <CheckCircle size={14} /> : (item.result === 'X' ? <XCircle size={14} /> : <HelpCircle size={14} />)}
                                                    <span>{item.result === 'O' ? '合格' : (item.result === 'X' ? '不合格' : 'N/A')}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
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

                {/* --- Inspection Status Section --- */}
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
                                        value={formData.ncrNo}
                                        placeholder="e.g. NCR-001"
                                        onChange={e => setFormData({ ...formData, ncrNo: e.target.value })}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Re-inspection Date</label>
                                    <input
                                        type="date"
                                        className={styles.modernInput}
                                        disabled={formData.agreementChecked}
                                        value={formData.reInspectionDate}
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
            </div>

            {/* --- Print View (Preserved 1pt format) --- */}
            <div className={styles.printablePage}>
                <table className={styles.headerTable}>
                    <tbody>
                        <tr>
                            <td className={styles.headerCompanyCol}>
                                <div className="font-bold text-lg">Qualitas</div>
                                <div className="text-[10px] leading-tight text-slate-500 uppercase">Construction Quality Control</div>
                            </td>
                            <td className={styles.headerTitleCol}>
                                <h2 className="text-xl font-black mb-1 uppercase">Field Inspection Checklist</h2>
                                <h3 className="text-sm font-bold text-slate-700 italic">{formData.activity || '[ Activity ]'}</h3>
                            </td>
                            <td className={styles.headerInfoCol}>
                                <div className={styles.headerInfoRow}>
                                    <span className={styles.headerInfoLabel}>Doc No.</span>
                                    <span className={styles.headerInfoValue}>{displayNo}</span>
                                </div>
                                <div className={styles.headerInfoRow}>
                                    <span className={styles.headerInfoLabel}>Revision</span>
                                    <span className={styles.headerInfoValue}>Rev.{formData.revision || '0'}</span>
                                </div>
                                <div className={styles.headerInfoRow}>
                                    <span className={styles.headerInfoLabel}>Date</span>
                                    <span className={styles.headerInfoValue}>{formData.inspectionDate}</span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div className={styles.infoGrid}>
                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>Project Title</div>
                        <div className={styles.infoValue}>
                            {formData.projectTitle}
                        </div>
                    </div>
                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>ITR No.</div>
                        <div className={styles.infoValue}>
                            {formData.referenceNo}
                        </div>
                    </div>

                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>NOI Number</div>
                        <div className={styles.infoValue}>
                            {formData.noiNumber}
                        </div>
                    </div>

                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>Contractor</div>
                        <div className={styles.infoValue}>
                            {formData.contractor}
                        </div>
                    </div>

                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>Insp. Date</div>
                        <div className={styles.infoValue}>
                            {formData.inspectionDate}
                        </div>
                    </div>
                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>Location</div>
                        <div className={styles.infoValue}>
                            {formData.location}
                        </div>
                    </div>
                </div>

                <table className={styles.itemsTable}>
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}>#</th>
                            <th>Inspection Item</th>
                            <th>Criteria</th>
                            <th>Actual Situation</th>
                            <th style={{ width: '80px' }}>Result</th>
                        </tr>
                    </thead>
                    <tbody>
                        {formData.items.map((item: any, idx: number) => (
                            <tr key={idx}>
                                <td className="text-center">{item.id}</td>
                                <td className="font-bold">{item.item}</td>
                                <td>{item.criteria}</td>
                                <td>{item.situation}</td>
                                <td className="text-center">{item.result}</td>
                            </tr>
                        ))}
                        {paddingRows.map((_, idx) => (
                            <tr key={`pad-${idx}`} style={{ height: '32px' }}>
                                <td className="text-center"></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td className="text-center text-slate-300">/</td>
                            </tr>
                        ))}
                        <tr>
                            <td colSpan={5} className="text-center font-bold">-END-</td>
                        </tr>
                    </tbody>
                </table>

                <div className={styles.footerSection}>
                    <div className={styles.statementBox}>
                        <div className="flex flex-col gap-2">
                            <label className="flex items-start gap-2">
                                <input type="checkbox" checked={formData.agreementChecked} readOnly className="mt-1" />
                                <span>All inspection has been done and meet the Drawings, Criteria, Standards.</span>
                            </label>
                            <label className="flex items-start gap-2">
                                <input type="checkbox" checked={!formData.agreementChecked} readOnly className="mt-1" />
                                <span>Unfinished improvement, fill in "Non-Conformity Report" to track improvement.</span>
                            </label>
                        </div>
                    </div>

                    <table className={styles.signatureTable} style={{ width: '100%', borderBottom: 'none' }}>
                        <tbody>
                            <tr>
                                <td className={styles.signatureLabelCell}>Re-inspection Date</td>
                                <td className={styles.signatureValueCell}>
                                    <div className="text-center">{formData.agreementChecked ? 'N/A' : formData.reInspectionDate}</div>
                                </td>
                                <td className={styles.signatureLabelCell}>NCR No.</td>
                                <td className={styles.signatureValueCell}>
                                    <div className="text-center">{formData.agreementChecked ? 'N/A' : formData.ncrNo}</div>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <div className={styles.bottomLayout} style={{ marginTop: '-1pt' }}>
                        <div className={styles.remarkSection}>
                            <div className="font-bold mb-1">Remarks:</div>
                            <div className="text-xs">{formData.remarks}</div>
                        </div>

                        <table className={styles.signatureTable} style={{ width: '70%', borderLeft: 'none' }}>
                            <tbody>
                                <tr>
                                    <td className={styles.signatureHeaderCell}>Site Engineer</td>
                                    <td className={styles.signatureHeaderCell}>Construction Leader</td>
                                </tr>
                                <tr style={{ height: '60px' }}>
                                    <td></td>
                                    <td></td>
                                </tr>
                                <tr>
                                    <td colSpan={2} className={styles.signatureHeaderCell}>Subcontractor Representative</td>
                                </tr>
                                <tr style={{ height: '60px' }}>
                                    <td colSpan={2}></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className={styles.watermark}>
                    Generated by Qualitas Digital Inspection System
                </div>
            </div>

            {/* Print Portal — injected into document.body outside #root, same as NOI */}
            {isPrinting && ReactDOM.createPortal(
                <div id="checklist-print-root" className={styles.checklistPrintRoot}>
                    <div className={styles.checklistPrintPage}>
                        <table className={styles.headerTable}>
                            <tbody>
                                <tr>
                                    <td className={styles.headerCompanyCol}>
                                        <div style={{ fontWeight: 'bold', fontSize: '18px' }}>Qualitas</div>
                                        <div style={{ fontSize: '10px', lineHeight: 1.2, color: '#64748b', textTransform: 'uppercase' }}>Construction Quality Control</div>
                                    </td>
                                    <td className={styles.headerTitleCol}>
                                        <h2 style={{ fontSize: '20px', fontWeight: 900, marginBottom: '4px', textTransform: 'uppercase' }}>Field Inspection Checklist</h2>
                                        <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#334155', fontStyle: 'italic' }}>{formData.activity || '[ Activity ]'}</h3>
                                    </td>
                                    <td className={styles.headerInfoCol}>
                                        <div className={styles.headerInfoRow}>
                                            <span className={styles.headerInfoLabel}>Doc No.</span>
                                            <span className={styles.headerInfoValue}>{displayNo}</span>
                                        </div>
                                        <div className={styles.headerInfoRow}>
                                            <span className={styles.headerInfoLabel}>Revision</span>
                                            <span className={styles.headerInfoValue}>Rev.{formData.revision || '0'}</span>
                                        </div>
                                        <div className={styles.headerInfoRow}>
                                            <span className={styles.headerInfoLabel}>Date</span>
                                            <span className={styles.headerInfoValue}>{formData.inspectionDate}</span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <div className={styles.infoGrid}>
                            <div className={styles.infoItem}><div className={styles.infoLabel}>Project Title</div><div className={styles.infoValue}>{formData.projectTitle}</div></div>
                            <div className={styles.infoItem}><div className={styles.infoLabel}>ITR No.</div><div className={styles.infoValue}>{formData.referenceNo}</div></div>
                            <div className={styles.infoItem}><div className={styles.infoLabel}>NOI Number</div><div className={styles.infoValue}>{formData.noiNumber}</div></div>
                            <div className={styles.infoItem}><div className={styles.infoLabel}>Contractor</div><div className={styles.infoValue}>{formData.contractor}</div></div>
                            <div className={styles.infoItem}><div className={styles.infoLabel}>Insp. Date</div><div className={styles.infoValue}>{formData.inspectionDate}</div></div>
                            <div className={styles.infoItem}><div className={styles.infoLabel}>Location</div><div className={styles.infoValue}>{formData.location}</div></div>
                        </div>

                        <table className={styles.itemsTable}>
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}>#</th>
                                    <th>Inspection Item</th>
                                    <th>Criteria</th>
                                    <th>Actual Situation</th>
                                    <th style={{ width: '80px' }}>Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {formData.items.map((item: any, idx: number) => (
                                    <tr key={idx}>
                                        <td style={{ textAlign: 'center' }}>{item.id}</td>
                                        <td style={{ fontWeight: 'bold' }}>{item.item}</td>
                                        <td>{item.criteria}</td>
                                        <td>{item.situation}</td>
                                        <td style={{ textAlign: 'center' }}>{item.result}</td>
                                    </tr>
                                ))}
                                {paddingRows.map((_, idx) => (
                                    <tr key={`pad-${idx}`} style={{ height: '32px' }}>
                                        <td style={{ textAlign: 'center' }}></td>
                                        <td></td>
                                        <td></td>
                                        <td></td>
                                        <td style={{ textAlign: 'center', color: '#cbd5e1' }}>/</td>
                                    </tr>
                                ))}
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', fontWeight: 'bold' }}>-END-</td>
                                </tr>
                            </tbody>
                        </table>

                        <div className={styles.footerSection}>
                            <div className={styles.statementBox}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                        <input type="checkbox" checked={formData.agreementChecked} readOnly style={{ marginTop: '4px' }} />
                                        <span>All inspection has been done and meet the Drawings, Criteria, Standards.</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                        <input type="checkbox" checked={!formData.agreementChecked} readOnly style={{ marginTop: '4px' }} />
                                        <span>Unfinished improvement, fill in "Non-Conformity Report" to track improvement.</span>
                                    </label>
                                </div>
                            </div>

                            <table className={styles.signatureTable} style={{ width: '100%', borderBottom: 'none' }}>
                                <tbody>
                                    <tr>
                                        <td className={styles.signatureLabelCell}>Re-inspection Date</td>
                                        <td className={styles.signatureValueCell}><div style={{ textAlign: 'center' }}>{formData.agreementChecked ? 'N/A' : formData.reInspectionDate}</div></td>
                                        <td className={styles.signatureLabelCell}>NCR No.</td>
                                        <td className={styles.signatureValueCell}><div style={{ textAlign: 'center' }}>{formData.agreementChecked ? 'N/A' : formData.ncrNo}</div></td>
                                    </tr>
                                </tbody>
                            </table>

                            <div className={styles.bottomLayout} style={{ marginTop: '-1pt' }}>
                                <div className={styles.remarkSection}>
                                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Remarks:</div>
                                    <div style={{ fontSize: '10px' }}>{formData.remarks}</div>
                                </div>
                                <table className={styles.signatureTable} style={{ width: '70%', borderLeft: 'none' }}>
                                    <tbody>
                                        <tr>
                                            <td className={styles.signatureHeaderCell}>Site Engineer</td>
                                            <td className={styles.signatureHeaderCell}>Construction Leader</td>
                                        </tr>
                                        <tr style={{ height: '60px' }}><td></td><td></td></tr>
                                        <tr><td colSpan={2} className={styles.signatureHeaderCell}>Subcontractor Representative</td></tr>
                                        <tr style={{ height: '60px' }}><td colSpan={2}></td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className={styles.watermark}>Generated by Qualitas Digital Inspection System</div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Checklist;
