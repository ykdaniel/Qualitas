import React, { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { Plus, Printer } from 'lucide-react';
import { useChecklist, ChecklistRecord } from '../../context/ChecklistContext';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { BackButton } from '@/components/ui/BackButton';
import styles from './Checklist.module.css';
import { useDebounce } from '../../hooks/useDebounce';
import { useNOI } from '../../context/NOIContext';
import { useITP } from '../../context/ITPContext';

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
}

const itpDatabase: ItpItemDefinition[] = [
    {
        eventNo: "A6",
        activity: "Stakeout",
        standard: "HL-ONS-TECO-STR-DWG-02000",
        criteria: "Meet design requirement",
        stage: "Before",
        recordForm: "CHK-SV-01",
        defaultItems: [
            { item: "Drawing Number", criteria: "Ref: HL-ONS-TECO-STR-DWG-02000\nMeet design requirement", situation: "NA", result: "O" },
            { item: "Control Point - Coordinate N", criteria: "Drawing Spec", situation: "", result: "O" },
            { item: "Control Point - Coordinate E", criteria: "Drawing Spec", situation: "", result: "O" },
            { item: "Control Point - Elevation", criteria: "Drawing Spec", situation: "", result: "O" },
            { item: "Survey Records", criteria: "Submit Survey Records", situation: "See Attachment", result: "O" }
        ]
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
        }
    }, [recordNoParam, records, t]);

    const handleBack = () => {
        if (fromSource === 'itp') {
            navigate(-1);
        } else {
            setView('list');
            setEditingRecord(null);
        }
    };

    // --- 統計數據 ---
    const stats = useMemo(() => {
        const total = records.length;
        const passed = records.filter(r => r.status === 'Pass').length;
        const ongoing = records.filter(r => r.status === 'Ongoing').length;
        const failed = records.filter(r => r.status === 'Fail').length;
        return { total, passed, ongoing, failed };
    }, [records]);

    // --- 操作處理 ---
    const handleAddNew = () => {
        setEditingRecord(null);
        setView('editor');
    };

    const handleEdit = (record: ChecklistRecord) => {
        setEditingRecord(record);
        setView('editor');
    };

    const handleDelete = async (id: string) => {
        if (window.confirm("Are you sure you want to delete this record?")) {
            await deleteRecord(id);
        }
    };

    const columns = useMemo(() => createColumns(handleEdit, handleDelete), [handleEdit, handleDelete]);

    if (view === 'editor') {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <BackButton
                            label={fromSource === 'itp' ? 'Back to ITP' : 'Back to List'}
                            onClick={handleBack}
                        />
                    </div>
                </div>
                <ChecklistEditor
                    record={editingRecord}
                    onCancel={() => setView('list')}
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
                            const detail = err?.response?.data?.detail || t('common.saveFailed') || 'Save failed';
                            alert(detail);
                        } finally {
                            setSaving(false);
                        }
                    }}
                />
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <BackButton />
                    <h1>{t('checklist.title') || 'Checklist Management'}</h1>
                </div>
                <div className={styles.headerRight}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder={t('common.search') || 'Search...'}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className={styles.summarySection}>
                <h2 className={styles.summaryTitle}>{t('common.statistics') || 'Statistics'}</h2>
                <div className={styles.statsContainer}>
                    <div className={styles.statusStatsGrid}>
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
                    columns={columns}
                    data={filteredList}
                    getRowId={(row) => row.id}
                />
            </div>
        </div>
    );
};


const ChecklistEditor = ({ record, onCancel, onSave, saving }: {
    record: ChecklistRecord | null,
    onCancel: () => void,
    onSave: (data: any) => Promise<void>,
    saving?: boolean
}) => {
    const { t } = useLanguage();
    const { noiList } = useNOI();
    const { itpList } = useITP();

    // Transform dynamic itpList into itpDatabase format
    const dynamicItpDatabase = useMemo(() => {
        // Base hardcoded database as fallback or if itpList is empty
        const baseDb: ItpItemDefinition[] = itpDatabase;
        const dynamicItems: ItpItemDefinition[] = itpList.filter(itp => itp.hasDetails && itp.detail_data).map(itp => {
            const parsed = JSON.parse(itp.detail_data!);
            return {
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
        // Remove duplicates if any (by activity name)
        const unique = merged.reduce((acc, current) => {
            if (!acc.find(item => item.activity === current.activity)) {
                acc.push(current);
            }
            return acc;
        }, [] as ItpItemDefinition[]);

        return unique;
    }, [itpList]);

    const [selectedItpIndex, setSelectedItpIndex] = useState(record ? record.itpIndex : 0);
    const [formData, setFormData] = useState<any>(record ? { ...record.data, noiNumber: record.noiNumber } : {
        projectTitle: "Hai Long Offshore Wind Farm Project",
        recordsNo: "[AUTO-GENERATE]",
        packageName: "RKS",
        inspectionDate: new Date().toISOString().slice(0, 10),
        location: "Foundation Area",
        stage: "Before",
        revision: 0,
        referenceNo: "",
        noiNumber: "",
        items: [],
        reInspectionDate: "",
        ncrNo: "",
        agreementChecked: true,
        remarks: "1. Mark 'O' for passed items, 'X' for failed items, and '/' for N/A items.\n2. Inspection items and criteria should be detailed with quantified data.",
        signatures: {
            siteEngineer: "",
            constructionLeader: "",
            subcontractorRep: ""
        }
    });

    const currentItp = dynamicItpDatabase[selectedItpIndex] || dynamicItpDatabase[0];

    // NOTE: Record No 由後端自動產生，前端僅負責顯示
    const displayNo = useMemo(() => {
        if (record) {
            return record.recordsNo;
        }
        return '[Auto-Generated on Save]';
    }, [record]);

    React.useEffect(() => {
        if (!record || (record && selectedItpIndex !== record.itpIndex)) {
            const itp = dynamicItpDatabase[selectedItpIndex] || dynamicItpDatabase[0];
            const generatedItems = itp.defaultItems.map((defItem, idx) => ({
                id: idx + 1,
                item: defItem.item,
                criteria: defItem.criteria,
                situation: defItem.situation,
                result: defItem.result
            }));
            setFormData((prev: any) => ({
                ...prev,
                stage: itp.stage,
                items: generatedItems
            }));
        }
    }, [selectedItpIndex, record]);

    const handlePrint = () => window.print();

    // Fill empty rows (approx 15 rows in template)
    const totalDisplayRows = 15;
    const paddingRows = Array(Math.max(0, totalDisplayRows - formData.items.length)).fill(null);

    return (
        <div className={styles.editorWrapper}>
            <div className={`w-[210mm] mb-6 flex justify-end ${styles.printHidden}`}>
                <div className="flex gap-2 items-end">
                    <button onClick={onCancel} disabled={saving} className="px-6 py-2 bg-slate-100 rounded-lg font-bold text-sm disabled:opacity-50">{t('common.cancel')}</button>
                    <button
                        disabled={saving}
                        onClick={() => onSave({
                            itpIndex: selectedItpIndex,
                            activity: dynamicItpDatabase[selectedItpIndex]?.activity || 'N/A',
                            date: formData.inspectionDate,
                            status: formData.items.every((i: any) => i.result === 'O') ? 'Pass' : 'Fail',
                            packageName: formData.packageName || 'RKS',
                            location: formData.location,
                            revision: formData.revision,
                            noiNumber: formData.noiNumber,
                            data: { ...formData }
                        })} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm disabled:opacity-50"
                    >
                        {saving ? (t('common.saving') || 'Saving...') : t('common.save')}
                    </button>
                    <button onClick={handlePrint} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold text-sm flex items-center gap-2">
                        <Printer size={16} /> {t('common.print')}
                    </button>
                </div>
            </div>

            {/* A4 Content */}
            <div className={styles.printablePage}>
                <div className={styles.formHeader}>
                    <div className={styles.formNo}>{displayNo}</div>
                    <div className={`flex items-center gap-4 ${styles.printHidden} mb-2`}>
                        <span className="text-sm font-bold text-slate-600">Template:</span>
                        <select
                            value={selectedItpIndex}
                            onChange={(e) => setSelectedItpIndex(Number(e.target.value))}
                            className="p-1 border rounded text-sm bg-white"
                        >
                            {dynamicItpDatabase.map((itp, idx) => (
                                <option key={idx} value={idx}>{itp.activity}</option>
                            ))}
                        </select>
                    </div>
                    <h1>Checklist for {currentItp?.activity}</h1>
                </div>

                <div className={styles.infoGrid}>
                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>Project Title</div>
                        <div className={styles.infoValue}>
                            <textarea
                                value={formData.projectTitle}
                                onChange={e => setFormData({ ...formData, projectTitle: e.target.value })}
                                rows={1}
                            />
                        </div>
                    </div>
                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>ITR No.</div>
                        <div className={styles.infoValue}>
                            <input
                                value={formData.referenceNo}
                                onChange={e => setFormData({ ...formData, referenceNo: e.target.value })}
                                placeholder="Manual Entry"
                            />
                        </div>
                    </div>
                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>NOI Number</div>
                        <div className={styles.infoValue}>
                            <select
                                value={formData.noiNumber || ''}
                                onChange={e => {
                                    const selectedNoi = noiList.find(n => n.referenceNo === e.target.value);
                                    setFormData({
                                        ...formData,
                                        noiNumber: e.target.value,
                                        packageName: selectedNoi?.package || formData.packageName,
                                        location: selectedNoi?.checkpoint || formData.location
                                    });
                                }}
                                className="w-full bg-transparent border-none outline-none"
                            >
                                <option value="">{t('checklist.selectNoi') || '-- Select NOI --'}</option>
                                {noiList.map(noi => (
                                    <option key={noi.id} value={noi.referenceNo}>
                                        {noi.referenceNo} ({noi.package})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>Subcontractor</div>
                        <div className={styles.infoValue}>
                            <textarea
                                value={formData.packageName}
                                onChange={e => setFormData({ ...formData, packageName: e.target.value })}
                                rows={1}
                            />
                        </div>
                    </div>
                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>Inspection Date</div>
                        <div className={styles.infoValue}>
                            <input type="date" value={formData.inspectionDate} onChange={e => setFormData({ ...formData, inspectionDate: e.target.value })} />
                        </div>
                    </div>
                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>Inspection Location</div>
                        <div className={styles.infoValue}>
                            <textarea
                                value={formData.location}
                                onChange={e => setFormData({ ...formData, location: e.target.value })}
                                rows={1}
                            />
                        </div>
                    </div>
                    <div className={styles.infoItem}>
                        <div className={styles.infoLabel}>Inspection Stage</div>
                        <div className={styles.infoValue}>
                            <div className="flex gap-4">
                                {['Before', 'During', 'After'].map(s => (
                                    <label key={s} className="flex items-center gap-1 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.stage === s}
                                            onChange={() => setFormData({ ...formData, stage: s })}
                                        /> {s}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <table className={styles.itemsTable}>
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}>#</th>
                            <th>Inspection Item</th>
                            <th>Drawings, Criteria, Standards</th>
                            <th>Actual Situation</th>
                            <th style={{ width: '60px' }}>Result</th>
                        </tr>
                    </thead>
                    <tbody>
                        {formData.items.map((item: any, idx: number) => (
                            <tr key={idx}>
                                <td className="text-center">{item.id}</td>
                                <td className="font-bold">{item.item}</td>
                                <td>
                                    <textarea
                                        className={styles.tableInput}
                                        value={item.criteria}
                                        rows={2}
                                        onChange={e => {
                                            const newItems = [...formData.items];
                                            newItems[idx].criteria = e.target.value;
                                            setFormData({ ...formData, items: newItems });
                                        }}
                                    />
                                </td>
                                <td>
                                    <textarea
                                        className={styles.tableInput}
                                        style={{ textAlign: 'center', fontStyle: 'italic' }}
                                        value={item.situation}
                                        rows={2}
                                        onChange={e => {
                                            const newItems = [...formData.items];
                                            newItems[idx].situation = e.target.value;
                                            setFormData({ ...formData, items: newItems });
                                        }}
                                    />
                                </td>
                                <td className="p-0">
                                    <button
                                        className={`${styles.resultBtn} ${item.result === 'O' ? 'text-green-600' : 'text-red-500'}`}
                                        onClick={() => {
                                            const newItems = [...formData.items];
                                            newItems[idx].result = newItems[idx].result === 'O' ? 'X' : (newItems[idx].result === 'X' ? '/' : 'O');
                                            setFormData({ ...formData, items: newItems });
                                        }}
                                    >
                                        {item.result}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {/* 補足空白行 */}
                        {paddingRows.map((_, idx) => (
                            <tr key={`pad-${idx}`} style={{ height: '32px' }}>
                                <td className="text-center"></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td className="text-center text-slate-300">/</td>
                            </tr>
                        ))}
                        {/* 結尾標記 */}
                        <tr>
                            <td colSpan={5} className="text-center font-bold">-END-</td>
                        </tr>
                    </tbody>
                </table>

                <div className={styles.footerSection}>
                    <div className={styles.statementBox}>
                        <div className="flex flex-col gap-2">
                            <label className="flex items-start gap-2 cursor-pointer">
                                <input type="checkbox" checked={formData.agreementChecked} onChange={e => setFormData({ ...formData, agreementChecked: e.target.checked })} className="mt-1" />
                                <span>All inspection has been done and meet the Drawings, Criteria, Standards.</span>
                            </label>
                            <label className="flex items-start gap-2 cursor-pointer">
                                <input type="checkbox" checked={!formData.agreementChecked} onChange={e => setFormData({ ...formData, agreementChecked: !e.target.checked })} className="mt-1" />
                                <span>Unfinished improvement, fill in "Non-Conformity Report" to track improvement.</span>
                            </label>
                        </div>
                    </div>

                    <div className={styles.reInspectionGrid}>
                        <div className={styles.reInspectionItem}>
                            <div className={styles.infoLabel}>NCR No.</div>
                            <div className={styles.infoValue}>
                                {formData.agreementChecked ? (
                                    <div className="flex items-center justify-center h-full text-slate-500">N/A</div>
                                ) : (
                                    <input value={formData.ncrNo} onChange={e => setFormData({ ...formData, ncrNo: e.target.value })} placeholder="e.g. NCR-001" />
                                )}
                            </div>
                        </div>
                        <div className={styles.reInspectionItem} style={{ borderRight: 'none' }}>
                            <div className={styles.infoLabel}>Re-inspection Date</div>
                            <div className={styles.infoValue}>
                                {formData.agreementChecked ? (
                                    <div className="flex items-center justify-center h-full text-slate-500">N/A</div>
                                ) : (
                                    <input type="date" value={formData.reInspectionDate} onChange={e => setFormData({ ...formData, reInspectionDate: e.target.value })} />
                                )}
                            </div>
                        </div>
                    </div>

                    <div className={styles.signatureGrid}>
                        <div className={styles.remarkSection}>
                            <strong>Remarks :</strong><br />
                            {formData.remarks.split('\n').map((r: string, i: number) => <div key={i} className="leading-relaxed">{r}</div>)}
                        </div>
                        <div className="grid grid-cols-2">
                            <div className={styles.signatureBlock}>
                                <div className={styles.signatureLabel}>Site Engineer</div>
                                <div className={styles.signatureContent}>{formData.signatures.siteEngineer}</div>
                            </div>
                            <div className={styles.signatureBlock} style={{ borderRight: 'none' }}>
                                <div className={styles.signatureLabel}>Construction Leader</div>
                                <div className={styles.signatureContent}>{formData.signatures.constructionLeader}</div>
                            </div>
                            <div className={styles.signatureBlock} style={{ gridColumn: 'span 2', borderRight: 'none', borderBottom: 'none' }}>
                                <div className={styles.signatureLabel}>Subcontractor</div>
                                <div className={styles.signatureContent}>{formData.signatures.subcontractorRep}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.watermark}>
                    Generated by Qualitas Digital Inspection System
                </div>
            </div>
        </div>
    );
};

export default Checklist;
