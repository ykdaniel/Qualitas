import { useItemDraftGuard } from '../Shared/LeaveGuard';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import React, { useState } from 'react';
import { PenTool, Trash2, ArrowDown, X, Save, ShieldCheck, HardHat, Building2, User, FileText, GripVertical, Copy } from 'lucide-react';
import { InspectionItem } from '../../types/itp';
import { PHASES, EMPTY_ITEM } from '../../constants/itp';
import { useITRStore } from '../../store/itrStore';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import VPBadge from './VPBadge';
import { resolveItpRecordLink } from '../../utils/itpRecordLink';
import { useLanguage } from '../../context/LanguageContext';
import { missingRequiredItemFields, preferEnglishText } from '../../utils/itpItemValidation';
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


export interface ITPAdvancedEditorRef {
    handleAddNew: () => void;
}

export const ITPAdvancedEditor = React.forwardRef<ITPAdvancedEditorRef, ITPAdvancedEditorProps>(({ items, onItemsChange, readOnly = false, onViewRecord, headerData }, ref) => {
    const itrList = useITRStore(state => state.itrList);
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [editingItem, setEditingItem] = useState<InspectionItem | null>(null);
    const itemGuard = useItemDraftGuard(editingItem);

    // Which Record value's link is currently being resolved (real lookup, not a prefix guess —
    // see utils/itpRecordLink.ts) — used to disable that one button and show it's working,
    // since this now takes a real round trip instead of a synchronous local check.
    const [resolvingRecord, setResolvingRecord] = useState<string | null>(null);

    const handleRecordClick = async (value: string) => {
        if (resolvingRecord) return;
        setResolvingRecord(value);
        try {
            const result = await resolveItpRecordLink(value);
            switch (result.kind) {
                case 'itr':
                    if (onViewRecord) {
                        onViewRecord({ documentNumber: result.documentNumber });
                    } else {
                        toast.info(`Viewing ITR: ${result.documentNumber}`);
                    }
                    break;
                case 'checklist':
                    navigate(`/checklist?openId=${result.recordsNo}&from=itp`);
                    break;
                case 'ambiguous':
                    toast.error(`Multiple documents match "${value}" — cannot tell which one this Record refers to. Please check the record number.`);
                    break;
                case 'forbidden':
                    toast.error('You do not have permission to view this record.');
                    break;
                case 'not_found':
                    toast.error('Record document data not found.');
                    break;
                default:
                    toast.error('Could not look up this record right now. Please try again.');
            }
        } finally {
            setResolvingRecord(null);
        }
    };

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

    // Opens the same Add-New editor panel, pre-filled with an independent deep copy of the
    // source item's content (JSON round-trip — every nested object/array, e.g. criteria, vp,
    // bilingual fields, gets its own copy, so editing the new item's Criteria/Verification
    // Points afterwards can never reach back and mutate the source item). Nothing is written
    // until the user clicks Apply on this panel; Cancel discards it exactly like Add New does.
    // The copy gets a fresh id (computed the same way Add New does, inserted right after the
    // source item; final sequential numbering happens on Apply, same as any new item) and a
    // cleared `record` — the source's linked ITR/Checklist record describes an inspection that
    // already happened for THAT item, and copying it onto a new, not-yet-inspected item would
    // misrepresent it as already recorded.
    const handleCopyClick = (item: InspectionItem) => {
        const cloned = JSON.parse(JSON.stringify(item)) as InspectionItem;
        setEditingItem({
            ...cloned,
            id: calculateNextId(item.phase, item.id),
            isNew: true,
            insertAfter: item.id,
            record: '-'
        });
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

        // Activity and Standard each need English OR Chinese (DECISIONS.md 2026-10-07, BACKLOG #36); trimmed, other fields optional.
        // Returning early keeps the panel open with everything the user typed.
        if (missingRequiredItemFields(editingItem).length > 0) {
            toast.warning(t('itp.itemPanel.eitherLanguageRequiredToast') || 'Activity and Standard each need English or Chinese (at least one) before applying.');
            return;
        }

        if (editingItem.isNew) {
            const { insertAfter, ...newItem } = editingItem;
            const currentPhaseItems = items.filter(i => i.phase === newItem.phase);
            const otherItems = items.filter(i => i.phase !== newItem.phase);

            let newPhaseItems = [];
            if (!insertAfter || insertAfter === 'end') {
                newPhaseItems = [...currentPhaseItems, newItem];
            } else if (insertAfter === 'beginning') {
                newPhaseItems = [newItem, ...currentPhaseItems];
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

    const normalizeCriteria = (criteria: any): { en: string; ch: string }[] => {
        if (!criteria) return [];
        if (typeof criteria === 'string') return criteria ? [{ en: criteria, ch: '' }] : [];
        if (!Array.isArray(criteria)) return [];
        return criteria.map((c: any) => typeof c === 'string' ? { en: c, ch: '' } : { en: c?.en ?? '', ch: c?.ch ?? '' });
    };

    const handleCriteriaChange = (index: number, value: string, subField: 'en' | 'ch') => {
        setEditingItem((prev: InspectionItem | null) => {
            if (!prev) return null;
            const arr = normalizeCriteria(prev.criteria);
            const next = arr.map((c, i) => i === index ? { ...c, [subField]: value } : c);
            return { ...prev, criteria: next };
        });
    };

    const handleCriteriaAdd = () => {
        setEditingItem((prev: InspectionItem | null) => {
            if (!prev) return null;
            return { ...prev, criteria: [...normalizeCriteria(prev.criteria), { en: '', ch: '' }] };
        });
    };

    const handleCriteriaRemove = (index: number) => {
        setEditingItem((prev: InspectionItem | null) => {
            if (!prev) return null;
            return { ...prev, criteria: normalizeCriteria(prev.criteria).filter((_, i) => i !== index) };
        });
    };

    // Drag-and-drop reorder
    const [dragItemId, setDragItemId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);

    const handleDragStart = (e: React.DragEvent, itemId: string) => {
        setDragItemId(itemId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, itemId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (itemId !== dragOverId) setDragOverId(itemId);
    };

    const handleDragEnd = () => {
        setDragItemId(null);
        setDragOverId(null);
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!dragItemId || dragItemId === targetId) { handleDragEnd(); return; }
        const sourceItem = items.find(i => i.id === dragItemId);
        const targetItem = items.find(i => i.id === targetId);
        if (!sourceItem || !targetItem) { handleDragEnd(); return; }

        const sourcePhase = sourceItem.phase;
        const targetPhase = targetItem.phase;

        // Remove source item from its original phase
        const sourcePhaseItems = items.filter(i => i.phase === sourcePhase && i.id !== dragItemId);
        // Insert into target phase at the target position
        const targetPhaseItems = sourcePhase === targetPhase
            ? sourcePhaseItems
            : items.filter(i => i.phase === targetPhase);
        const tgtIdx = targetPhaseItems.findIndex(i => i.id === targetId);
        const movedItem = { ...sourceItem, phase: targetPhase };
        const reorderedTarget = [...targetPhaseItems];
        reorderedTarget.splice(tgtIdx, 0, movedItem);

        // Renumber both phases
        const renumberedSource = sourcePhase !== targetPhase
            ? sourcePhaseItems.map((item, idx) => ({ ...item, id: `${sourcePhase}${idx + 1}` }))
            : [];
        const renumberedTarget = reorderedTarget.map((item, idx) => ({ ...item, id: `${targetPhase}${idx + 1}` }));

        // Collect items from unaffected phases
        const affectedPhases = new Set([sourcePhase, targetPhase]);
        const otherItems = items.filter(i => !affectedPhases.has(i.phase));

        onItemsChange([...otherItems, ...renumberedSource, ...renumberedTarget]);
        handleDragEnd();
    };

    return (
        <div className="w-full bg-slate-50 relative pt-4 print:bg-white print:pt-0">
            {/* Compact on-screen identity bar — screen only (hidden on print, see the full print
                header below). Keeps just enough to know which document this is while editing:
                reference no., subject, and revision — without the full print-page header
                permanently eating a third of the screen while the item table scrolls beneath it. */}
            {headerData && (
                <div className="print:hidden bg-white px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-4 text-sm">
                    <div className="flex items-baseline gap-3 min-w-0">
                        <span className="font-mono font-bold text-slate-800 shrink-0">{headerData.referenceNo}</span>
                        <span className="text-slate-500 truncate">{headerData.description}</span>
                    </div>
                    <span className="font-bold text-slate-600 shrink-0">{headerData.rev || '-'}</span>
                </div>
            )}

            {/* Print Header — screen: hidden (replaced above by the compact bar); print: unchanged,
                exactly as before this batch. */}
            {headerData && (
                <div className="hidden bg-white px-8 pt-6 pb-2 relative mb-1 print:mb-0 print:pb-0 print:border-none print:shadow-none print:block">
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
            <div className="w-full overflow-auto bg-white print:overflow-visible print:max-h-none relative" style={{ maxHeight: 'calc(100vh - 240px)' }}>
                <table className="w-full text-left text-sm border-collapse print:border-collapse">
                    <thead className="bg-[#1e293b] text-white font-bold text-xs uppercase tracking-wider leading-tight sticky top-0 z-[15]">
                        <tr>
                            {!readOnly && <th rowSpan={2} className="px-2 py-4 w-8 border-r border-slate-700 text-center rounded-tl-lg print:hidden"></th>}
                            <th rowSpan={2} className={`px-5 py-4 w-16 border-r border-slate-700 text-center ${readOnly ? 'rounded-tl-lg' : ''}`}>Event No.</th>
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
                            <th className="px-2 py-2 text-center border-r border-slate-700 w-12 text-[11px] font-bold">MAIN</th>
                            <th className="px-2 py-2 text-center border-r border-slate-700 w-12 text-[11px] font-bold">Emp.</th>
                            <th className={`px-2 py-2 text-center w-12 text-[11px] font-bold ${!readOnly && 'border-r border-slate-700'}`}>HSE</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {PHASES.map((phase) => (
                            <React.Fragment key={phase.code}>
                                <tr className="sticky top-0 z-[5]">
                                    <td colSpan={readOnly ? 11 : 13} className={`px-0 py-0 border-b border-slate-300 ${phase.color}`}>
                                        <div className="px-6 py-3 font-bold text-sm flex items-center gap-2 uppercase tracking-wide w-full text-slate-800">
                                            {phase.title}
                                        </div>
                                    </td>
                                </tr>
                                {items.filter(item => item.phase === phase.code).map((item) => (
                                    <tr
                                        key={item.id}
                                        draggable={!readOnly}
                                        onDragStart={!readOnly ? (e) => handleDragStart(e, item.id) : undefined}
                                        onDragOver={!readOnly ? (e) => handleDragOver(e, item.id) : undefined}
                                        onDragEnd={!readOnly ? handleDragEnd : undefined}
                                        onDrop={!readOnly ? (e) => handleDrop(e, item.id) : undefined}
                                        className={`transition-colors group border-b border-slate-100 last:border-0 relative ${dragOverId === item.id && dragItemId !== item.id ? 'bg-blue-50 border-t-2 border-t-blue-400' : dragItemId === item.id ? 'opacity-40' : 'hover:bg-slate-50'}`}
                                    >
                                        {!readOnly && (
                                            <td className="px-2 py-4 text-center border-r border-slate-100 align-middle cursor-grab active:cursor-grabbing print:hidden">
                                                <GripVertical size={14} className="text-slate-300 group-hover:text-slate-400 mx-auto" />
                                            </td>
                                        )}
                                        <td className="px-5 py-4 font-mono text-slate-900 font-bold border-r border-slate-100 bg-slate-50/50 align-top pt-5">
                                            {item.id}
                                        </td>
                                        <td className="px-5 py-4 border-r border-slate-100 align-top text-slate-800">
                                            <div className="font-bold text-sm mb-1 whitespace-pre-line">{item.activity.en}</div>
                                            <div className="text-slate-500 text-xs font-medium whitespace-pre-line">{item.activity.ch}</div>
                                        </td>
                                        <td className="px-5 py-4 border-r border-slate-100 align-top">
                                            <div className="inline-block bg-slate-100 text-slate-600 text-[11px] font-mono px-2 py-0.5 rounded mb-2 border border-slate-200">
                                                <div className="whitespace-pre-line">{typeof item.standard === 'string' ? item.standard : item.standard.en}</div>
                                                {typeof item.standard !== 'string' && item.standard.ch && <div className="text-slate-400 whitespace-pre-line">{item.standard.ch}</div>}
                                            </div>
                                            {(() => {
                                                const arr = (typeof item.criteria === 'string' ? (item.criteria ? [{ en: item.criteria, ch: '' }] : []) : (Array.isArray(item.criteria) ? item.criteria.map((c: any) => typeof c === 'string' ? { en: c, ch: '' } : c) : [])).filter((c: any) => c.en || c.ch);
                                                if (arr.length === 0) return null;
                                                if (arr.length === 1) return <><div className="text-slate-700 text-sm font-medium whitespace-pre-line">{(arr[0] as any).en}</div>{(arr[0] as any).ch && <div className="text-slate-500 text-xs mt-0.5 whitespace-pre-line">{(arr[0] as any).ch}</div>}</>;
                                                return <ul className="space-y-1 pl-1">{arr.map((c: any, i: number) => <li key={i} className="flex items-start gap-1"><span className="text-slate-400 shrink-0 mt-0.5">•</span><div><div className="text-slate-700 text-sm font-medium whitespace-pre-line">{c.en}</div>{c.ch && <div className="text-slate-500 text-xs whitespace-pre-line">{c.ch}</div>}</div></li>)}</ul>;
                                            })()}
                                        </td>
                                        <td className="px-5 py-4 border-r border-slate-100 align-top bg-slate-50/30">
                                            <div className="text-slate-900 text-sm font-medium whitespace-pre-line">{item.checkTime.en}</div>
                                            <div className="text-slate-500 text-xs mt-1 whitespace-pre-line">{item.checkTime.ch}</div>
                                        </td>
                                        <td className="px-5 py-4 border-r border-slate-100 align-top">
                                            <div className="text-slate-900 text-sm whitespace-pre-line">{item.method.en}</div>
                                            <div className="text-slate-500 text-xs mt-1 whitespace-pre-line">{item.method.ch}</div>
                                        </td>
                                        <td className="px-5 py-4 border-r border-slate-200 align-top">
                                            {typeof item.frequency === 'string' ? (
                                                <div className="text-slate-600 text-xs font-medium bg-slate-100 inline-block px-2 py-1 rounded whitespace-pre-line">{item.frequency}</div>
                                            ) : (
                                                <>
                                                    <div className="text-slate-600 text-xs font-medium bg-slate-100 inline-block px-2 py-1 rounded whitespace-pre-line">{item.frequency.en}</div>
                                                    {item.frequency.ch && <div className="text-slate-400 text-xs mt-1 whitespace-pre-line">{item.frequency.ch}</div>}
                                                </>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 border-r border-slate-200 bg-slate-50/30 align-top">
                                            {item.record !== '-' ? (
                                                <button
                                                    onClick={() => handleRecordClick(item.record)}
                                                    disabled={resolvingRecord === item.record}
                                                    className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-white text-blue-600 border border-blue-100 hover:border-blue-300 hover:bg-blue-50 whitespace-nowrap shadow-sm transition-all disabled:opacity-50"
                                                >
                                                    <FileText size={12} className="mr-1.5" />{resolvingRecord === item.record ? '...' : item.record}
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
                                                    <button className={actionStyles.icon} onClick={() => handleEditClick(item)} title="Edit">
                                                        <PenTool size={14} strokeWidth={2.5} />
                                                    </button>
                                                    <button className={actionStyles.icon} onClick={() => handleCopyClick(item)} title="Copy">
                                                        <Copy size={14} strokeWidth={2.5} />
                                                    </button>
                                                    <button className={actionStyles.iconDanger} onClick={() => handleDelete(item.id)} title="Delete">
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
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[90vw] xl:max-w-[1500px] overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-300 max-h-[95vh] flex flex-col">
                            {/* Header */}
                            <div className="bg-[#faf7f1] border-b border-[#b8945a]/20 px-6 sm:px-8 py-4 flex justify-between items-center shrink-0 rounded-t-2xl">
                                <h3 className="font-bold text-xl flex items-center gap-3 text-[#2d2a24]">
                                    <PenTool size={20} className="text-[#8a6a3a]" />
                                    {editingItem.isNew
                                        ? (t('itp.itemPanel.addTitle') || 'Add New Inspection Item')
                                        : (t('itp.itemPanel.editTitle') || 'Edit Item ({id})').replace('{id}', editingItem.id)}
                                </h3>
                                <button className="hover:bg-[#b8945a]/10 p-2 rounded-full transition-colors text-[#6b6355]" onClick={() => itemGuard.requestClose(() => setEditingItem(null))}><X size={20} /></button>
                            </div>

                            {/* Body */}
                            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                                {/* Event No. box removed (2026-10-07, "這有必要嗎"): read-only and already in the
                                    modal title. Phase stays (only way to move an item between phases);
                                    Insert After shares its row for new items. */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-xs font-bold text-slate-700 uppercase whitespace-nowrap">{t('itp.itemPanel.phase') || 'Phase'}</span>
                                            <span className="flex-1 border-t-2 border-slate-400"></span>
                                        </div>
                                        <select className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm" value={editingItem.phase} onChange={(e) => handleChange('phase', e.target.value)}>
                                            {PHASES.map(p => <option key={p.code} value={p.code}>{p.title}</option>)}
                                        </select>
                                    </div>
                                    {editingItem.isNew && (
                                        <div>
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-xs font-bold text-slate-700 uppercase whitespace-nowrap">Insert After (插入位置)</span>
                                                <span className="flex-1 border-t-2 border-slate-400"></span>
                                            </div>
                                            <select
                                                className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm"
                                                value={editingItem.insertAfter || 'end'}
                                                onChange={(e) => handleChange('insertAfter', e.target.value)}
                                            >
                                                <option value="beginning">At the Beginning (最前面)</option>
                                                <option value="end">At the End (最後面)</option>
                                                {items.filter(i => i.phase === editingItem.phase).map(item => (
                                                    <option key={item.id} value={item.id}>
                                                        {item.id} - {preferEnglishText(item.activity)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {/* Details */}
                                <div className="space-y-4">
                                    {/* Activity & Standard — side-by-side as a pair (2026-10-07: "次項目可以並排" —
                                        the two field-GROUPS sit side by side to save vertical space; each group's
                                        own EN/CH stays stacked top-to-bottom internally, matching the table/print
                                        direction, with a persistent "EN"/"中文" label on every box). */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <div>
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-xs font-bold text-slate-700 uppercase whitespace-nowrap">{t('itp.itemPanel.activityLabel') || 'Activity (EN/CH)'}</span>
                                                <span className="text-[11px] font-semibold text-[#b91c1c] whitespace-nowrap">{t('itp.itemPanel.eitherLanguageRequired') || 'English or Chinese — at least one'}</span>
                                                <span className="flex-1 border-t-2 border-slate-400"></span>
                                            </div>
                                            <span className="inline-block text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 mb-1">EN</span>
                                            <textarea rows={2} className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm resize-y mb-2" value={editingItem.activity.en} onChange={(e) => handleChange('activity', e.target.value, 'en')} />
                                            <span className="inline-block text-[11px] font-bold text-[#8a6a3a] bg-[#faf7f1] border border-[#b8945a]/40 rounded px-1.5 py-0.5 mb-1">中文</span>
                                            <textarea rows={2} className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm text-slate-900 resize-y" value={editingItem.activity.ch} onChange={(e) => handleChange('activity', e.target.value, 'ch')} />
                                        </div>

                                        <div>
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-xs font-bold text-slate-700 uppercase whitespace-nowrap">{t('itp.itemPanel.standardLabel') || 'Standard (EN/CH)'}</span>
                                                <span className="text-[11px] font-semibold text-[#b91c1c] whitespace-nowrap">{t('itp.itemPanel.eitherLanguageRequired') || 'English or Chinese — at least one'}</span>
                                                <span className="flex-1 border-t-2 border-slate-400"></span>
                                            </div>
                                            <span className="inline-block text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 mb-1">EN</span>
                                            <textarea rows={2} className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm resize-y mb-2"
                                                value={typeof editingItem.standard === 'string' ? editingItem.standard : editingItem.standard.en}
                                                onChange={(e) => handleChange('standard', e.target.value, 'en')} />
                                            <span className="inline-block text-[11px] font-bold text-[#8a6a3a] bg-[#faf7f1] border border-[#b8945a]/40 rounded px-1.5 py-0.5 mb-1">中文</span>
                                            <textarea rows={2} className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm text-slate-900 resize-y"
                                                value={typeof editingItem.standard === 'string' ? '' : editingItem.standard.ch}
                                                onChange={(e) => handleChange('standard', e.target.value, 'ch')} />
                                        </div>
                                    </div>

                                    {/* Criteria — EN above CH per entry, stacked (same reasoning as Activity).
                                        Section label sits ON the divider line (2026-10-07, "字可以放在橫線
                                        前面"), not below a plain line, so the label reads as part of the same
                                        divider. */}
                                    <div className="pt-2">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-xs font-bold text-slate-700 uppercase whitespace-nowrap">{t('itp.itemPanel.criteriaLabel') || 'Criteria'}</span>
                                            <span className="flex-1 border-t-2 border-slate-400"></span>
                                        </div>
                                        {normalizeCriteria(editingItem.criteria).map((c, idx) => (
                                            <div key={idx} data-criteria-row={idx} className="flex items-start gap-2 mb-3 p-2 rounded-lg border border-slate-200 bg-slate-50/60">
                                                {normalizeCriteria(editingItem.criteria).length > 1 && (
                                                    <span className="shrink-0 w-6 h-6 mt-0.5 rounded-full bg-slate-700 text-white text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                                                )}
                                                {/* One criterion = one framed row: EN left, 中文 right on desktop (stacked below sm). */}
                                                <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div className="min-w-0">
                                                        <span className="inline-block text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 mb-1">EN</span>
                                                        <textarea rows={2} className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm resize-y" value={c.en} onChange={(e) => handleCriteriaChange(idx, e.target.value, 'en')} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="inline-block text-[11px] font-bold text-[#8a6a3a] bg-[#faf7f1] border border-[#b8945a]/40 rounded px-1.5 py-0.5 mb-1">中文</span>
                                                        <textarea rows={2} className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm text-slate-900 resize-y" value={c.ch} onChange={(e) => handleCriteriaChange(idx, e.target.value, 'ch')} />
                                                    </div>
                                                </div>
                                                <button className={actionStyles.iconDanger} type="button" onClick={() => handleCriteriaRemove(idx)}>✕</button>
                                            </div>
                                        ))}
                                        <button className={actionStyles.compact} type="button" onClick={handleCriteriaAdd}>{t('itp.itemPanel.addCriteria') || '+ Add Criteria'}</button>
                                    </div>

                                    {/* Others — Check Time / Method each get their own labeled-divider line (2026-10-07, "Check Time/Method 各劃一條") */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 pt-2">
                                        <div>
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-xs font-bold text-slate-700 uppercase whitespace-nowrap">{t('itp.itemPanel.checkTimeLabel') || 'Check Time (EN/CH)'}</span>
                                                <span className="flex-1 border-t-2 border-slate-400"></span>
                                            </div>
                                            <textarea rows={3} className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm mb-2 resize-y" value={editingItem.checkTime.en} onChange={(e) => handleChange('checkTime', e.target.value, 'en')} />
                                            <textarea rows={3} className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm text-slate-900 resize-y" value={editingItem.checkTime.ch} onChange={(e) => handleChange('checkTime', e.target.value, 'ch')} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-xs font-bold text-slate-700 uppercase whitespace-nowrap">{t('itp.itemPanel.methodLabel') || 'Method (EN/CH)'}</span>
                                                <span className="flex-1 border-t-2 border-slate-400"></span>
                                            </div>
                                            <textarea rows={3} className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm mb-2 resize-y" value={editingItem.method.en} onChange={(e) => handleChange('method', e.target.value, 'en')} />
                                            <textarea rows={3} className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm text-slate-900 resize-y" value={editingItem.method.ch} onChange={(e) => handleChange('method', e.target.value, 'ch')} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-xs font-bold text-slate-700 uppercase whitespace-nowrap">{t('itp.itemPanel.frequencyLabel') || 'Frequency (EN/CH)'}</span>
                                                <span className="flex-1 border-t-2 border-slate-400"></span>
                                            </div>
                                            <textarea rows={3} className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm mb-2 resize-y"
                                                value={typeof editingItem.frequency === 'string' ? editingItem.frequency : editingItem.frequency.en}
                                                onChange={(e) => handleChange('frequency', e.target.value, 'en')} />
                                            <textarea rows={3} className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm text-slate-900 resize-y"
                                                value={typeof editingItem.frequency === 'string' ? '' : editingItem.frequency.ch}
                                                onChange={(e) => handleChange('frequency', e.target.value, 'ch')} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-xs font-bold text-slate-700 uppercase whitespace-nowrap">{t('itp.itemPanel.recordLabel') || 'Record'}</span>
                                                <span className="flex-1 border-t-2 border-slate-400"></span>
                                            </div>
                                            <input
                                                className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm"
                                                list="itr-options"
                                                value={editingItem.record}
                                                onChange={(e) => handleChange('record', e.target.value)}
                                                placeholder={t('itp.itemPanel.recordPlaceholder') || 'Select or enter Record No.'}
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
                                        <label className="flex items-center justify-center gap-2 text-xs font-bold text-indigo-800 uppercase mb-4 text-center normal-case">
                                            <span className="uppercase">{t('itp.itemPanel.verificationPoints') || 'Verification Points'}</span>
                                            <span
                                                title={t('itp.itemPanel.vpLegend') || ''}
                                                className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full border border-indigo-300 text-indigo-500 text-[10px] font-bold leading-none cursor-help shrink-0"
                                            >!</span>
                                        </label>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            {[
                                                { key: 'sub', label: t('itp.itemPanel.subCon') || 'Sub-Con', icon: <HardHat size={14} /> },
                                                { key: 'teco', label: t('itp.itemPanel.mainCon') || 'Main Con', icon: <Building2 size={14} /> },
                                                { key: 'employer', label: t('itp.itemPanel.employer') || 'Employer', icon: <User size={14} /> },
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
                            <FormActions cancel={<button className={actionStyles.secondary} onClick={() => itemGuard.requestClose(() => setEditingItem(null))}>{t('common.cancel')}</button>} primary={<button className={actionStyles.primary} onClick={handleSaveItem}><Save size={18} /> {t('common.apply')}</button>} />
                        </div>
                    </div>
                )}
        </div>
    );
});
