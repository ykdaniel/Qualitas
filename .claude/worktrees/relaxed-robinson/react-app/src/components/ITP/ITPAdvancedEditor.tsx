import React, { useState } from 'react';
import { PenTool, Trash2, Plus, FileText, CheckCircle2, Calendar, Filter, AlertCircle, FileCheck, Tag, X, Save, ShieldCheck, HardHat, Building2, User, ArrowDown, LayoutTemplate } from 'lucide-react';
import { ITPData, InspectionItem } from '../../types/itp'; // Ensure these types exist or define them
import { PHASES, EMPTY_ITEM } from '../../constants/itp';
import { useITR } from '../../context/ITRContext';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

// Define Props
interface ITPAdvancedEditorProps {
    items: InspectionItem[];
    onItemsChange: (items: InspectionItem[]) => void;
    readOnly?: boolean;
    onViewRecord?: (itr: any) => void;
    headerData?: {
        referenceNo: string;
        description: string;
        rev: string;
        vendor: string;
        submissionDate: string;
    };
}


// VP Badge Component (Internal)
const VPBadge = ({ type }: { type: string }) => {
    const styles: { [key: string]: string } = {
        H: "bg-rose-100 text-rose-700 border-rose-200 font-bold ring-1 ring-rose-200 shadow-sm",
        W: "bg-amber-100 text-amber-700 border-amber-200 font-bold ring-1 ring-amber-200 shadow-sm",
        R: "bg-sky-100 text-sky-700 border-sky-200 font-bold ring-1 ring-sky-200 shadow-sm",
        "※": "bg-slate-100 text-slate-600 border-slate-200 font-medium ring-1 ring-slate-200"
    };

    if (!type) return <span className="text-slate-200 font-light">-</span>;

    return (
        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-all ${styles[type] || ""}`}>
            {type}
        </span>
    );
};


export interface ITPAdvancedEditorRef {
    handleAddNew: () => void;
}

export const ITPAdvancedEditor = React.forwardRef<ITPAdvancedEditorRef, ITPAdvancedEditorProps>(({ items, onItemsChange, readOnly = false, onViewRecord, headerData }, ref) => {
    const { itrList } = useITR();
    const navigate = useNavigate();
    const [editingItem, setEditingItem] = useState<InspectionItem | null>(null);

    // Calculate Next ID
    const calculateNextId = (phase: string, insertAfterId: string = 'end') => {
        const phaseItems = items.filter(i => i.phase === phase);
        let potentialIndex = phaseItems.length;

        if (insertAfterId && insertAfterId !== 'end') {
            const index = phaseItems.findIndex(i => i.id === insertAfterId);
            if (index !== -1) {
                potentialIndex = index + 1;
            }
        }
        return `${phase}${potentialIndex + 1}`;
    };

    // Handlers
    const handleEditClick = (item: InspectionItem) => {
        setEditingItem({ ...item, isNew: false });
    };

    const handleAddNew = () => {
        const defaultPhase = 'A';
        setEditingItem({
            ...EMPTY_ITEM,
            phase: defaultPhase,
            id: calculateNextId(defaultPhase),
            isNew: true,
            insertAfter: 'end'
        });
    };

    React.useImperativeHandle(ref, () => ({
        handleAddNew
    }));

    const handleSaveItem = () => {
        if (!editingItem) return;

        if (editingItem.isNew) {
            const { isNew, insertAfter, ...newItem } = editingItem;
            const currentPhaseItems = items.filter(i => i.phase === newItem.phase);
            const otherItems = items.filter(i => i.phase !== newItem.phase);

            let newPhaseItems = [];
            if (!insertAfter || insertAfter === 'end') {
                newPhaseItems = [...currentPhaseItems, newItem];
            } else {
                const insertIndex = currentPhaseItems.findIndex(i => i.id === insertAfter);
                if (insertIndex !== -1) {
                    newPhaseItems = [
                        ...currentPhaseItems.slice(0, insertIndex + 1),
                        newItem,
                        ...currentPhaseItems.slice(insertIndex + 1)
                    ];
                } else {
                    newPhaseItems = [...currentPhaseItems, newItem];
                }
            }

            // Renumber
            newPhaseItems = newPhaseItems.map((item, index) => ({
                ...item,
                id: `${item.phase}${index + 1}`
            }));

            onItemsChange([...otherItems, ...newPhaseItems]);
        } else {
            onItemsChange(items.map(item => item.id === editingItem.id ? editingItem : item));
        }
        setEditingItem(null);
    };

    const handleDelete = (itemId: string) => {
        if (window.confirm("Are you sure you want to delete this item?")) {
            onItemsChange(items.filter(item => item.id !== itemId));
        }
    };

    const handleChange = (field: keyof InspectionItem, value: string, subField: string | null = null) => {
        if (subField && editingItem) {
            setEditingItem((prev: InspectionItem | null) => {
                if (!prev) return null;
                return {
                    ...prev,
                    [field]: {
                        ...(prev[field as keyof InspectionItem] as any),
                        [subField]: value
                    }
                };
            });
        } else {
            setEditingItem((prev: InspectionItem | null) => {
                if (!prev) return null;
                const updated = { ...prev, [field]: value };
                if (prev.isNew) {
                    if (field === 'phase') {
                        updated.id = calculateNextId(value, prev.insertAfter);
                    } else if (field === 'insertAfter') {
                        updated.id = calculateNextId(prev.phase, value);
                    }
                }
                return updated;
            });
        }
    };

    const handleVPChange = (role: string, value: string) => {
        setEditingItem((prev: InspectionItem | null) => {
            if (!prev) return null;
            return { ...prev, vp: { ...prev.vp, [role]: value } as any };
        });
    };

    return (
        <div className="w-full bg-slate-50 relative pt-4 print:bg-white print:pt-0">
            {/* Print Header */}
            {headerData && (
                <div className="bg-white px-8 pt-6 pb-2 relative mb-1 print:mb-0 print:pb-0 print:border-none print:shadow-none print:block">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 print:h-1"></div>
                    <div className="flex justify-between items-center mb-1 pt-2 print:mb-0">
                        <div className="w-48 opacity-40">
                            <div className="h-12 w-32 bg-slate-100 rounded flex items-center justify-center text-xs text-slate-400 font-medium border border-dashed border-slate-300 print:border-slate-400">
                                Logo Area
                            </div>
                        </div>
                        <div className="flex-1 text-center">
                            <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight flex flex-col items-center gap-2 print:text-2xl">
                                Inspection & Test Plan
                            </h1>
                            <div className="mt-2 text-xl font-bold text-slate-700 print:text-lg">
                                <span className="border-b-2 border-dashed border-slate-300 px-2 py-0.5 min-w-[200px] inline-block print:border-slate-400">
                                    {headerData.description}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end mt-1 gap-4 text-xs font-bold text-slate-700 print:text-xs print:mt-0 print:gap-6">
                        <div>{headerData.referenceNo}</div>
                        <div>{headerData.rev || '-'}</div>
                    </div>
                </div>
            )}

            {/* Table */}
            {/* Table */}
            <div className="w-full overflow-x-auto bg-white print:overflow-visible relative">
                <table className="w-full text-left text-sm border-collapse print:border-collapse">
                    <thead className="bg-[#1e293b] text-white font-bold text-xs uppercase tracking-wider leading-tight">
                        <tr>
                            <th rowSpan={2} className="px-5 py-4 w-16 border-r border-slate-700 text-center rounded-tl-lg">Event No.</th>
                            <th rowSpan={2} className="px-5 py-4 w-64 border-r border-slate-700 text-center">Inspection Activity</th>
                            <th rowSpan={2} className="px-5 py-4 w-56 border-r border-slate-700 text-center">Standard / Criteria</th>
                            <th rowSpan={2} className="px-5 py-4 w-40 border-r border-slate-700 text-center">Check Time</th>
                            <th rowSpan={2} className="px-5 py-4 w-40 border-r border-slate-700 text-center">Method</th>
                            <th rowSpan={2} className="px-5 py-4 w-28 border-r border-slate-700 text-center">Frequency</th>
                            <th rowSpan={2} className="px-5 py-4 w-32 border-r border-slate-700 text-center">Records</th>
                            <th colSpan={4} className={`px-2 py-3 text-center border-b border-slate-700 ${readOnly ? 'rounded-tr-lg' : 'border-r border-slate-700'}`}>Verification Point</th>
                            {!readOnly && <th rowSpan={2} className="px-5 py-4 text-center w-32 sticky right-0 z-10 bg-[#1e293b] rounded-tr-lg print:hidden">Op.</th>}
                        </tr>
                        <tr>
                            <th className="px-2 py-2 text-center border-r border-slate-700 w-12 text-[11px] font-bold">Sub.</th>
                            <th className="px-2 py-2 text-center border-r border-slate-700 w-12 text-[11px] font-bold">TECO</th>
                            <th className="px-2 py-2 text-center border-r border-slate-700 w-12 text-[11px] font-bold">Emp.</th>
                            <th className={`px-2 py-2 text-center w-12 text-[11px] font-bold ${!readOnly && 'border-r border-slate-700'}`}>HSE</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {PHASES.map((phase) => (
                            <React.Fragment key={phase.code}>
                                <tr className="sticky top-0 z-[5]">
                                    <td colSpan={readOnly ? 11 : 12} className={`px-0 py-0 border-b border-slate-300 ${phase.color}`}>
                                        <div className="px-6 py-3 font-bold text-sm flex items-center gap-2 uppercase tracking-wide w-full text-slate-800">
                                            {phase.title}
                                        </div>
                                    </td>
                                </tr>
                                {items.filter(item => item.phase === phase.code).map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors group border-b border-slate-100 last:border-0 relative">
                                        <td className="px-5 py-4 font-mono text-slate-900 font-bold border-r border-slate-100 bg-slate-50/50 align-top pt-5">
                                            {item.id}
                                        </td>
                                        <td className="px-5 py-4 border-r border-slate-100 align-top text-slate-800">
                                            <div className="font-bold text-sm mb-1">{item.activity.en}</div>
                                            <div className="text-slate-500 text-xs font-medium">{item.activity.ch}</div>
                                        </td>
                                        <td className="px-5 py-4 border-r border-slate-100 align-top">
                                            <div className="inline-block bg-slate-100 text-slate-600 text-[11px] font-mono px-2 py-0.5 rounded mb-2 border border-slate-200">
                                                {item.standard}
                                            </div>
                                            <div className="text-slate-700 text-sm leading-relaxed font-medium">{item.criteria}</div>
                                        </td>
                                        <td className="px-5 py-4 border-r border-slate-100 align-top bg-slate-50/30">
                                            <div className="text-slate-900 text-sm font-medium">{item.checkTime.en}</div>
                                            <div className="text-slate-500 text-xs mt-1">{item.checkTime.ch}</div>
                                        </td>
                                        <td className="px-5 py-4 border-r border-slate-100 align-top">
                                            <div className="text-slate-900 text-sm">{item.method.en}</div>
                                            <div className="text-slate-500 text-xs mt-1">{item.method.ch}</div>
                                        </td>
                                        <td className="px-5 py-4 border-r border-slate-200 align-top"><div className="text-slate-600 text-xs font-medium bg-slate-100 inline-block px-2 py-1 rounded">{item.frequency}</div></td>
                                        <td className="px-5 py-4 border-r border-slate-200 bg-slate-50/30 align-top">
                                            {item.record !== '-' ? (
                                                <button
                                                    onClick={() => {
                                                        if (item.record.includes('CHK') || item.record.startsWith('QTS')) {
                                                            navigate(`/checklist?recordNo=${item.record}&from=itp`);
                                                            return;
                                                        }
                                                        const found = itrList.find(itr => itr.documentNumber === item.record);
                                                        if (found) {
                                                            if (onViewRecord) {
                                                                onViewRecord(found);
                                                            } else {
                                                                alert(`Viewing ITR: ${found.documentNumber}`);
                                                            }
                                                        } else {
                                                            toast.error('Record document data not found.');
                                                        }
                                                    }}
                                                    className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-white text-blue-600 border border-blue-100 hover:border-blue-300 hover:bg-blue-50 whitespace-nowrap shadow-sm transition-all"
                                                >
                                                    <FileText size={12} className="mr-1.5" />{item.record}
                                                </button>
                                            ) : <span className="text-slate-300 text-xs pl-2">-</span>}
                                        </td>
                                        <td className="px-2 py-4 text-center border-r border-slate-200 align-middle"><VPBadge type={item.vp.sub} /></td>
                                        <td className="px-2 py-4 text-center border-r border-slate-200 align-middle"><VPBadge type={item.vp.teco} /></td>
                                        <td className="px-2 py-4 text-center border-r border-slate-200 align-middle"><VPBadge type={item.vp.employer} /></td>
                                        <td className={`px-2 py-4 text-center align-middle print:border-r-0 ${!readOnly && 'border-r border-slate-200'}`}><VPBadge type={item.vp.hse} /></td>
                                        {!readOnly && (
                                            <td className="px-4 py-4 text-center align-middle sticky right-0 bg-white/95 backdrop-blur-sm shadow-[-5px_0_10px_-5px_rgba(0,0,0,0.05)] print:hidden">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => handleEditClick(item)} className="text-slate-400 hover:text-blue-600 p-1.5 rounded-md hover:bg-blue-50 transition-all">
                                                        <PenTool size={14} strokeWidth={2.5} />
                                                    </button>
                                                    <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-all">
                                                        <Trash2 size={14} strokeWidth={2.5} />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>


            {/* Edit Modal (Portal or Inline?) Inline is safer for z-index */}
            {
                editingItem && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 text-left">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-300 max-h-[90vh] flex flex-col">
                            {/* Header */}
                            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-5 flex justify-between items-center text-white shrink-0">
                                <h3 className="font-bold text-xl flex items-center gap-3">
                                    <PenTool size={20} />
                                    {editingItem.isNew ? "Add New Inspection Item" : `Edit Item (${editingItem.id})`}
                                </h3>
                                <button onClick={() => setEditingItem(null)}><X size={20} /></button>
                            </div>

                            {/* Body */}
                            <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                                {/* Phase & Event */}
                                <div className="grid grid-cols-2 gap-6 bg-slate-50 p-5 rounded-xl border border-slate-200">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Event No.</label>
                                        <div className="text-sm font-bold text-slate-800 bg-slate-100 border border-slate-200 rounded-lg px-4 h-10 flex items-center">{editingItem.id}</div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phase</label>
                                        <select className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm" value={editingItem.phase} onChange={(e) => handleChange('phase', e.target.value)}>
                                            {PHASES.map(p => <option key={p.code} value={p.code}>{p.title}</option>)}
                                        </select>
                                    </div>
                                    {/* Insert Position Selection (Only for New Items) */}
                                    {editingItem.isNew && (
                                        <div className="col-span-2 border-t border-slate-200 pt-4 mt-2">
                                            <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                                <ArrowDown size={14} className="text-blue-500" /> Insert After (插入位置)
                                            </label>
                                            <div className="relative">
                                                <select
                                                    className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white font-medium text-slate-700 shadow-sm cursor-pointer transition-all hover:border-slate-400"
                                                    value={editingItem.insertAfter || 'end'}
                                                    onChange={(e) => handleChange('insertAfter', e.target.value)}
                                                >
                                                    <option value="end">At the End (最後面)</option>
                                                    {items.filter(i => i.phase === editingItem.phase).map(item => (
                                                        <option key={item.id} value={item.id}>
                                                            {item.id} - {item.activity.en}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Details */}
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Activity (EN)</label>
                                            <input className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm" value={editingItem.activity.en} onChange={(e) => handleChange('activity', e.target.value, 'en')} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Standard</label>
                                            <input className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm" value={editingItem.standard} onChange={(e) => handleChange('standard', e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Activity (CH)</label>
                                            <input className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm" value={editingItem.activity.ch} onChange={(e) => handleChange('activity', e.target.value, 'ch')} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Criteria</label>
                                            <input className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm" value={editingItem.criteria} onChange={(e) => handleChange('criteria', e.target.value)} />
                                        </div>
                                    </div>

                                    {/* Others */}
                                    <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Check Time (EN/CH)</label>
                                            <input className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm mb-2" value={editingItem.checkTime.en} onChange={(e) => handleChange('checkTime', e.target.value, 'en')} />
                                            <input className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm text-slate-500" value={editingItem.checkTime.ch} onChange={(e) => handleChange('checkTime', e.target.value, 'ch')} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Method (EN/CH)</label>
                                            <input className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm mb-2" value={editingItem.method.en} onChange={(e) => handleChange('method', e.target.value, 'en')} />
                                            <input className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm text-slate-500" value={editingItem.method.ch} onChange={(e) => handleChange('method', e.target.value, 'ch')} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Frequency</label>
                                            <input className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm" value={editingItem.frequency} onChange={(e) => handleChange('frequency', e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Record</label>
                                            <input
                                                className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm"
                                                list="itr-options"
                                                value={editingItem.record}
                                                onChange={(e) => handleChange('record', e.target.value)}
                                                placeholder="Select or enter Record No."
                                            />
                                            <datalist id="itr-options">
                                                {itrList.map((itr) => (
                                                    <option key={itr.id} value={itr.documentNumber} />
                                                ))}
                                            </datalist>
                                        </div>
                                    </div>

                                    {/* VP */}
                                    <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100 mt-4">
                                        <label className="block text-xs font-bold text-indigo-800 uppercase mb-4 text-center">Verification Points</label>
                                        <div className="grid grid-cols-4 gap-4">
                                            {[
                                                { key: 'sub', label: 'Sub-Con', icon: <HardHat size={14} /> },
                                                { key: 'teco', label: 'Main Con', icon: <Building2 size={14} /> },
                                                { key: 'employer', label: 'Employer', icon: <User size={14} /> },
                                                { key: 'hse', label: 'HSE', icon: <ShieldCheck size={14} /> }
                                            ].map(({ key, label, icon }) => (
                                                <div key={key} className="flex flex-col items-center bg-white p-3 rounded-lg border border-indigo-100 shadow-sm">
                                                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-2 flex items-center gap-1">{icon} {label}</div>
                                                    <select className="w-full border-0 bg-slate-50 rounded-md text-sm font-bold py-1.5 text-center" value={editingItem.vp[key]} onChange={(e) => handleVPChange(key, e.target.value)}>
                                                        <option value="">-</option><option value="H">H</option><option value="W">W</option><option value="R">R</option><option value="※">※</option>
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="bg-slate-50 px-8 py-5 border-t border-slate-200 flex justify-end gap-4 shrink-0">
                                <button onClick={() => setEditingItem(null)} className="px-6 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg">Cancel</button>
                                <button onClick={handleSaveItem} className="px-6 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg flex items-center gap-2"><Save size={18} /> Save Changes</button>
                            </div>
                        </div>
                    </div>
                )}
        </div>
    );
});
