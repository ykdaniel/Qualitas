import { useItemDraftGuard } from '../Shared/LeaveGuard';
import { useLeaveGuard } from '../Shared/LeaveGuard';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import { useITRStore } from '../../store/itrStore';

import {
  FileText, Printer, Filter, PenTool, LayoutTemplate, Layers, X, Save, AlertCircle, Plus,
  CheckCircle2, ChevronDown, Calendar, Hash, Tag, FileCheck, ShieldCheck, HardHat, User, Building2, Trash2, ArrowDown
} from 'lucide-react';
import { BackButton } from '../ui/BackButton';
import { useLanguage } from '../../context/LanguageContext';
import { toast } from 'sonner';
import { InspectionItem } from '../../types/itp';
import { PHASES, EMPTY_ITEM } from '../../constants/itp';
import { getNextRevision } from '../../utils/revision';
import VPBadge from './VPBadge';
import { resolveItpRecordLink } from '../../utils/itpRecordLink';
import { parseInspectionItems } from '../../utils/itpParser';
import { missingRequiredItemFields, preferEnglishText } from '../../utils/itpItemValidation';
import './ITPDetail.print.css';
import './itp-print-global.css';



const ITPDetail: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const itrList = useITRStore(state => state.itrList);
  // NOTE: 初始為空陣列，避免所有 ITP 顯示相同的硬編碼資料
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [editingItem, setEditingItem] = useState<InspectionItem | null>(null);
    const itemGuard = useItemDraftGuard(editingItem);
  const [workTitle, setWorkTitle] = useState(""); // 工項標題狀態
  const [referenceNo, setReferenceNo] = useState(""); // Form No.

  const [, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [rev, setRev] = useState("");
  const draftKey = JSON.stringify({ items, workTitle });
  const [baseline, setBaseline] = useState<string | null>(null);
  useLeaveGuard(baseline !== null && draftKey !== baseline, saving);
  // Which Record value's link is currently being resolved (real lookup, not a prefix guess —
  // see utils/itpRecordLink.ts) — used to disable that one button while the round trip is in
  // flight.
  const [resolvingRecord, setResolvingRecord] = useState<string | null>(null);

  const handleRecordClick = async (value: string) => {
    if (resolvingRecord) return;
    setResolvingRecord(value);
    try {
      const result = await resolveItpRecordLink(value);
      switch (result.kind) {
        case 'itr':
          navigate('/itr');
          toast.info(`Please find ITR ${result.documentNumber} in the ITR list.`);
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

  const handlePublish = async () => {
    if (!id) return;
    const nextRev = getNextRevision(rev);
    if (!window.confirm(`Are you sure you want to publish this ITP as Revision ${nextRev}?`)) return;

    setSaving(true);
    try {
      // 1. Update Revision & Title
      await api.put(`/itp/${id}/`, {
        description: workTitle,
        rev: nextRev,
        status: 'Approved' // Optional: set status to Approved on publish
      });
      setRev(nextRev); // Update local state immediately

      // 2. Update Details (same as save)
      const payload = {
        a: items.filter(i => i.phase === 'A').map(({ phase: _phase, ...rest }) => rest),
        b: items.filter(i => i.phase === 'B').map(({ phase: _phase, ...rest }) => rest),
        c: items.filter(i => i.phase === 'C').map(({ phase: _phase, ...rest }) => rest),
        checklist: [],
        self_inspection: null
      };
      await api.put(`/itp/${id}/detail`, payload);
      setBaseline(draftKey);
      toast.success(`Published successfully as Revision ${nextRev}!`);
    } catch (error) {
      console.error("Failed to publish ITP:", error);
      toast.error("Failed to publish document.");
    } finally {
      setSaving(false);
    }
  };

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

  // Fetch data on mount
  useEffect(() => {
    const fetchITP = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const response = await api.get(`/itp/${id}/`);
        const data = response.data;
        if (data) {
          if (data.description) setWorkTitle(data.description);
          if (data.referenceNo) setReferenceNo(data.referenceNo);
          if (data.rev) setRev(data.rev);

          // 與列表頁彈窗（ITPModals.tsx）共用同一套解析工具：同時接受舊版 {a,b,c} 分階段物件
          // 與新版每筆項目自帶 phase 的扁平陣列，避免兩個入口對同一筆資料顯示不一致
          // （BACKLOG #35）。若無 detail_data 或格式無法辨識，回傳空陣列，使用者仍可透過
          // 「Add Item」新增，行為與先前相同。
          const parsedItems = parseInspectionItems(data.detail_data);
          setItems(parsedItems);
          setBaseline(JSON.stringify({ items: parsedItems, workTitle: data.description || '' }));
        }
      } catch (error) {
        console.error("Failed to fetch ITP:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchITP();
  }, [id]);


  // Save changes to backend
  const saveToBackend = async () => {
    if (!id) return;
    setSaving(true);
    try {
      // 1. Update Title (Description)
      await api.put(`/itp/${id}/`, { description: workTitle });

      // 2. Update Details
      const payload = {
        a: items.filter(i => i.phase === 'A').map(({ phase: _phase, ...rest }) => rest),
        b: items.filter(i => i.phase === 'B').map(({ phase: _phase, ...rest }) => rest),
        c: items.filter(i => i.phase === 'C').map(({ phase: _phase, ...rest }) => rest),
        checklist: [],
        self_inspection: null
      };

      await api.put(`/itp/${id}/detail`, payload);
      setBaseline(draftKey);
      toast.success("Saved successfully!");
    } catch (error) {
      console.error("Failed to save ITP:", error);
      toast.error("Failed to save document.");
    } finally {
      setSaving(false);
    }
  };

  // 計算下一個 ID
  const calculateNextId = (phase: string, insertAfterId: string = 'end') => {
    const phaseItems = items.filter(i => i.phase === phase);
    let potentialIndex = phaseItems.length; // Default to end

    if (insertAfterId && insertAfterId !== 'end') {
      const index = phaseItems.findIndex(i => i.id === insertAfterId);
      if (index !== -1) {
        potentialIndex = index + 1;
      }
    }
    return `${phase}${potentialIndex + 1}`;
  };

  // 開啟編輯模式 (Existing Item)
  const handleEditClick = (item: InspectionItem) => {
    setEditingItem({ ...item, isNew: false });
  };

  // 開啟新增模式 (New Item)
  const handleAddNew = () => {
    const defaultPhase = 'A';
    setEditingItem({ ...EMPTY_ITEM, phase: defaultPhase, id: calculateNextId(defaultPhase), isNew: true, insertAfter: 'end' });
  };

  // 儲存修改
  const handleSave = () => {
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

      // Renumber IDs for the phase
      newPhaseItems = newPhaseItems.map((item, index) => ({
        ...item,
        id: `${item.phase}${index + 1}`
      }));

      setItems([...otherItems, ...newPhaseItems]);
    } else {
      setItems(prevItems => prevItems.map(item =>
        item.id === editingItem.id ? editingItem : item
      ));
    }
    setEditingItem(null);
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
        // 如果變更 Phase 或 Insert Position，自動更新 ID
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

  const handleDelete = (itemId: string) => {
    if (window.confirm("Are you sure you want to delete this item?")) {
      setItems(prev => prev.filter(item => item.id !== itemId));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans text-slate-800 p-4 md:p-8 overflow-x-auto relative selection:bg-blue-100 selection:text-blue-900">
      {/* Back Button & Toolbar */}
      <div className="max-w-[1400px] min-w-[1024px] mx-auto mb-6 flex items-center justify-between no-print">
        <BackButton
          label={t('common.back')}
          onClick={() => navigate('/itp')}
        />

        
      </div>

      {/* Subject Header */}


      {/* 編輯視窗 (Modal) */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[90vw] xl:max-w-[1500px] overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-300 max-h-[95vh] flex flex-col">
            {/* Modal Header */}
            <div className="bg-[#faf7f1] border-b border-[#b8945a]/20 px-8 py-5 flex justify-between items-center shrink-0 rounded-t-2xl">
              <h3 className="font-bold text-xl flex items-center gap-3 text-[#2d2a24]">
                <div className="bg-[#b8945a]/10 p-2 rounded-lg">
                  <PenTool size={20} className="text-[#8a6a3a]" />
                </div>
                {editingItem.isNew
                  ? (t('itp.itemPanel.addTitle') || 'Add New Inspection Item')
                  : (t('itp.itemPanel.editTitle') || 'Edit Item ({id})').replace('{id}', editingItem.id)}
              </h3>
              <button
                onClick={() => itemGuard.requestClose(() => setEditingItem(null))}
                className="hover:bg-[#b8945a]/10 p-2 rounded-full transition-colors text-[#6b6355]"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              {/* Event No. box removed (2026-10-07, "這有必要嗎"): read-only and already in the
                  modal title. Phase stays (handleAddNew defaults to 'A', and it is the only way
                  to move an item between phases); Insert After shares its row for new items. */}
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
                      <span className="text-xs font-bold text-slate-700 uppercase whitespace-nowrap">{t('itp.detail.insertAfter') || 'Insert After'}</span>
                      <span className="flex-1 border-t-2 border-slate-400"></span>
                    </div>
                    <select
                      className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm"
                      value={editingItem.insertAfter || 'end'}
                      onChange={(e) => handleChange('insertAfter', e.target.value)}
                    >
                      <option value="beginning">{t('itp.detail.atTheBeginning') || 'At the Beginning'}</option>
                      <option value="end">{t('itp.detail.atTheEnd') || 'At the End'}</option>
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
                    Section label sits ON the divider line (2026-10-07, "字可以放在橫線前面"),
                    not below a plain line, so the label reads as part of the same divider. */}
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

            {/* Modal Footer */}
                      <FormActions cancel={<button
                          onClick={() => itemGuard.requestClose(() => setEditingItem(null))}
                          className={actionStyles.secondary}
                      >
                          {t('common.cancel') || 'Cancel'}
                      </button>} primary={<button
                          onClick={handleSave}
                          className={actionStyles.primary}
                      >
                          <Save size={18} /> {t('common.apply') || 'Apply'}
                      </button>} />
          </div>
        </div>
      )}

      {/* --- Main Document Container --- */}
      <div className="max-w-[1400px] min-w-[1024px] mx-auto bg-white rounded-xl shadow-lg border-x-0 border-t-0 overflow-hidden print-container">

        {/* Document Header Section */}
        <div className="bg-white px-8 pt-8 pb-2 border-b border-slate-200 relative">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600"></div>

          {/* Top Row: Title */}
          <div className="flex justify-between items-center mb-1 pt-2">
            <div className="w-48 opacity-40 hover:opacity-100 transition-opacity">
              {/* Placeholder for Logo */}
              <div className="h-12 w-32 bg-slate-100 rounded flex items-center justify-center text-xs text-slate-400 font-medium border border-dashed border-slate-300">
                Logo Area
              </div>
            </div>

            <div className="flex-1 text-center">
              <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight flex flex-col items-center gap-2">
                Inspection & Test Plan
              </h1>
              <div className="mt-2 text-xl font-bold text-slate-700">
                <span
                  className="border-b-2 border-dashed border-slate-300 px-2 py-0.5 hover:border-blue-500 hover:bg-blue-50 transition-all outline-none cursor-text min-w-[200px] inline-block"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => setWorkTitle(e.currentTarget.innerText)}
                >
                  {workTitle}
                </span>
              </div>
            </div>


          </div>

          {/* Form No. - Inside Header, Bottom Right */}
          <div className="flex justify-end mt-1 gap-4">
            <div className="text-xs font-bold text-slate-700">
              Rev: {rev || '-'}
            </div>
            <div className="text-xs font-bold text-slate-700">
              {referenceNo}
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse border border-black border-t-2">
            <thead className="bg-slate-800 text-white font-bold text-xs uppercase tracking-wider border-b-2 border-black leading-tight">
              <tr>
                <th rowSpan={2} className="px-5 py-4 w-16 border-r border-black bg-slate-800 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-center">Event No.</th>
                <th rowSpan={2} className="px-5 py-4 w-64 border-r border-black text-center">Inspection Activity</th>
                <th rowSpan={2} className="px-5 py-4 w-56 border-r border-black text-center">Standard / Criteria</th>
                <th rowSpan={2} className="px-5 py-4 w-40 border-r border-black bg-slate-800 text-center">Check Time</th>
                <th rowSpan={2} className="px-5 py-4 w-40 border-r border-black text-center">Method</th>
                <th rowSpan={2} className="px-5 py-4 w-28 border-r border-black text-center">Frequency</th>
                <th rowSpan={2} className="px-5 py-4 w-32 border-r border-black bg-slate-800 text-center">Records</th>
                <th colSpan={4} className="px-2 py-3 text-center border-b border-black bg-slate-800">Verification Point</th>
                <th rowSpan={2} className="px-5 py-4 text-center w-32 bg-slate-800 sticky right-0 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] border-l border-black no-print">Operation</th>
              </tr>
              <tr>
                <th className="px-2 py-2 text-center border-r border-black w-12 bg-slate-800 text-[11px] font-bold">Sub.</th>
                <th className="px-2 py-2 text-center border-r border-black w-12 bg-slate-800 text-[11px] font-bold">MAIN</th>
                <th className="px-2 py-2 text-center border-r border-black w-12 bg-slate-800 text-[11px] font-bold">Emp.</th>
                <th className="px-2 py-2 text-center w-12 bg-slate-800 text-[11px] font-bold">HSE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black">
              {PHASES.map((phase) => (
                <React.Fragment key={phase.code}>
                  <tr className="border-y border-black sticky top-[60px] z-[5]">
                    <td colSpan={12} className={`px-0 py-0 border-b border-black ${phase.color}`}>
                      <div className="px-6 py-3 font-bold text-sm flex items-center gap-2 uppercase tracking-wide w-full text-black">
                        {phase.title}
                      </div>
                    </td>
                  </tr>
                  {items.filter(item => item.phase === phase.code).map((item) => (
                    <tr key={item.id} className="hover:bg-blue-50/40 transition-colors group border-b border-black last:border-0 relative">
                      <td className="px-5 py-4 font-mono text-slate-900 font-bold border-r border-black bg-slate-50/30 group-hover:bg-blue-50/50 sticky left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] align-top pt-5">
                        {item.id}
                      </td>
                      <td className="px-5 py-4 border-r border-black align-top group-hover:text-black text-slate-800 transition-colors">
                        <div className="font-bold text-[11px] mb-1">{item.activity.en}</div>
                        <div className="text-slate-500 text-[10px] font-medium">{item.activity.ch}</div>
                      </td>
                      <td className="px-5 py-4 border-r border-black align-top">
                        <div className="inline-block bg-slate-100 text-slate-600 text-[11px] font-mono px-2 py-0.5 rounded mb-2 border border-black">
                          <div>{typeof item.standard === 'string' ? item.standard : item.standard.en}</div>
                          {typeof item.standard !== 'string' && item.standard.ch && <div className="text-slate-500 text-[10px]">{item.standard.ch}</div>}
                        </div>
                        {(() => { const arr = (typeof item.criteria === 'string' ? (item.criteria ? [{ en: item.criteria, ch: '' }] : []) : (Array.isArray(item.criteria) ? item.criteria.map((c: any) => typeof c === 'string' ? { en: c, ch: '' } : c) : [])).filter((c: any) => c.en || c.ch); if (arr.length === 0) return null; if (arr.length === 1) return <><div className="text-slate-800 text-[11px] font-medium">{(arr[0] as any).en}</div>{(arr[0] as any).ch && <div className="text-slate-500 text-[10px] mt-0.5">{(arr[0] as any).ch}</div>}</>; return <ul className="space-y-1 pl-1">{arr.map((c: any, i: number) => <li key={i} className="flex items-start gap-1"><span className="text-slate-400 shrink-0 mt-0.5">•</span><div><div className="text-slate-800 text-[11px] font-medium">{c.en}</div>{c.ch && <div className="text-slate-500 text-[10px]">{c.ch}</div>}</div></li>)}</ul>; })()}
                      </td>
                      <td className="px-5 py-4 border-r border-black bg-slate-50 align-top">
                        <div className="text-black text-[11px] font-medium">{item.checkTime.en}</div>
                        <div className="text-slate-500 text-[10px] mt-1">{item.checkTime.ch}</div>
                      </td>
                      <td className="px-5 py-4 border-r border-black align-top">
                        <div className="text-black text-[11px]">{item.method.en}</div>
                        <div className="text-slate-500 text-[10px] mt-1">{item.method.ch}</div>
                      </td>
                      <td className="px-5 py-4 border-r border-black align-top">
                        {typeof item.frequency === 'string' ? (
                          <div className="text-slate-800 text-[11px]">{item.frequency}</div>
                        ) : (
                          <>
                            <div className="text-slate-800 text-[11px]">{item.frequency.en}</div>
                            {item.frequency.ch && <div className="text-slate-500 text-[10px] mt-1">{item.frequency.ch}</div>}
                          </>
                        )}
                      </td>
                      <td className="px-5 py-4 border-r border-black bg-slate-50 align-top">
                        {item.record !== '-' ? (
                          <button
                            onClick={() => handleRecordClick(item.record)}
                            disabled={resolvingRecord === item.record}
                            className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-white text-slate-900 hover:text-blue-800 hover:bg-blue-50 transition-colors font-mono text-xs font-bold border border-slate-300 hover:border-blue-400 whitespace-nowrap shadow-sm group/itr disabled:opacity-50"
                          >
                            <FileText size={12} className="mr-1.5 opacity-70 group-hover/itr:opacity-100" />{resolvingRecord === item.record ? '...' : item.record}
                          </button>
                        ) : <span className="text-slate-400 text-xs pl-2">-</span>}
                      </td>
                      <td className="px-2 py-4 text-center border-r border-black align-middle"><VPBadge type={item.vp.sub} /></td>
                      <td className="px-2 py-4 text-center border-r border-black align-middle"><VPBadge type={item.vp.teco} /></td>
                      <td className="px-2 py-4 text-center border-r border-black align-middle"><VPBadge type={item.vp.employer} /></td>
                      <td className="px-2 py-4 text-center border-r border-black align-middle"><VPBadge type={item.vp.hse} /></td>
                      <td className="px-4 py-4 text-center align-middle sticky right-0 bg-white shadow-[-5px_0_10px_-5px_rgba(0,0,0,0.05)] transition-all border-l border-black no-print">
                        <div className="flex items-center justify-center gap-2">
                          <button className={actionStyles.icon}
                            onClick={() => handleEditClick(item)}
                            title="Edit"
                          >
                            <PenTool size={16} strokeWidth={2.5} />
                          </button>
                          <button className={actionStyles.iconDanger}
                            onClick={() => handleDelete(item.id)}
                            title="Delete"
                          >
                            <Trash2 size={16} strokeWidth={2.5} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="bg-slate-50 border-t border-black p-4 text-center text-xs text-slate-500 font-medium">
          End of Document - Total {items.length} Inspection Items
        </div>
      </div>

          <div className="max-w-[1400px] mx-auto"><FormActions tools={<><button
              onClick={() => setIsPrinting(true)}
              className={actionStyles.secondary}
          >
              <Printer size={14} /> {t('itp.actionPrint') || 'Print'}
          </button><button onClick={handleAddNew} className={actionStyles.secondary}>
                  <Plus size={14} strokeWidth={3} /> {t('itp.actionAddNewItem') || 'Add New Item'}
              </button></>} secondary={<button
                  onClick={handlePublish}
                  disabled={saving}
                  className={actionStyles.workflow}
              >
                  <ShieldCheck size={14} strokeWidth={3} /> {t('itp.actionPublish') || 'Publish'}
              </button>} primary={<button
                  onClick={saveToBackend}
                  disabled={saving}
                  className={actionStyles.primary}
              >
                  {saving ? <LayoutTemplate size={14} className="animate-spin" /> : <Save size={14} strokeWidth={3} />}
                  {saving ? (t('common.saving') || 'Saving...') : (t('itp.detail.saveDocument') || 'Save Document')}
              </button>} /></div>
      {/* --- Print View (Portal) --- */}
      {/* Always render portal but hide via CSS to support Ctrl+P */}
      {ReactDOM.createPortal(
        <div id="itp-print-root">
          <div className="max-w-[1400px] min-w-[1024px] mx-auto bg-white rounded-xl shadow-lg border-x-0 border-t-0 overflow-hidden print-container">
            {/* Document Header Section - Duplicated for Print */}
            <div className="bg-white px-8 pt-8 pb-2 border-b border-slate-200 relative">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600"></div>
              <div className="flex justify-between items-center mb-1 pt-2">
                <div className="w-48 opacity-40">
                  {/* Logo Placeholder */}
                  <div className="h-12 w-32 bg-slate-100 rounded flex items-center justify-center text-xs text-slate-400 font-medium border border-dashed border-slate-300">
                    Logo Area
                  </div>
                </div>
                <div className="flex-1 text-center">
                  <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight flex flex-col items-center gap-2">
                    Inspection & Test Plan
                  </h1>
                  <div className="mt-2 text-xl font-bold text-slate-700">
                    <span className="border-b-2 border-dashed border-slate-300 px-2 py-0.5 min-w-[200px] inline-block">
                      {workTitle}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex justify-end mt-1 gap-4">
                <div className="text-xs font-bold text-slate-700">
                  Rev: {rev || '-'}
                </div>
                <div className="text-xs font-bold text-slate-700">
                  {referenceNo}
                </div>
              </div>
            </div>

            {/* Table Content - Duplicated for Print */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse border border-black border-t-2">
                <thead className="bg-slate-800 text-white font-bold text-xs uppercase tracking-wider border-b-2 border-black leading-tight">
                  <tr>
                    <th rowSpan={2} className="px-5 py-4 w-16 border-r border-black bg-slate-800 text-center">Event No.</th>
                    <th rowSpan={2} className="px-5 py-4 w-64 border-r border-black text-center">Inspection Activity</th>
                    <th rowSpan={2} className="px-5 py-4 w-56 border-r border-black text-center">Standard / Criteria</th>
                    <th rowSpan={2} className="px-5 py-4 w-40 border-r border-black bg-slate-800 text-center">Check Time</th>
                    <th rowSpan={2} className="px-5 py-4 w-40 border-r border-black text-center">Method</th>
                    <th rowSpan={2} className="px-5 py-4 w-28 border-r border-black text-center">Frequency</th>
                    <th rowSpan={2} className="px-5 py-4 w-32 border-r border-black bg-slate-800 text-center">Records</th>
                    <th colSpan={4} className="px-2 py-3 text-center border-b border-black bg-slate-800">Verification Point</th>
                  </tr>
                  <tr>
                    <th className="px-2 py-2 text-center border-r border-black w-12 bg-slate-800 text-[11px] font-bold">Sub.</th>
                    <th className="px-2 py-2 text-center border-r border-black w-12 bg-slate-800 text-[11px] font-bold">MAIN</th>
                    <th className="px-2 py-2 text-center border-r border-black w-12 bg-slate-800 text-[11px] font-bold">Emp.</th>
                    <th className="px-2 py-2 text-center w-12 bg-slate-800 text-[11px] font-bold">HSE</th>
                  </tr>
                </thead>
                {PHASES.map((phase) => {
                  const phaseItems = items.filter(item => item.phase === phase.code);
                  const renderRow = (item: InspectionItem) => (
                        <tr key={item.id} className="border-b border-black last:border-0 relative">
                          <td className="px-5 py-4 font-mono text-slate-900 font-bold border-r border-black bg-slate-50/30 align-top pt-5">
                            {item.id}
                          </td>
                          <td className="px-5 py-4 border-r border-black align-top text-slate-800">
                            <div className="font-bold text-sm mb-1">{item.activity.en}</div>
                            <div className="text-slate-600 text-xs font-medium">{item.activity.ch}</div>
                          </td>
                          <td className="px-5 py-4 border-r border-black align-top">
                            <div className="inline-block bg-slate-100 text-slate-600 text-[11px] font-mono px-2 py-0.5 rounded mb-2 border border-black">
                              <div>{typeof item.standard === 'string' ? item.standard : item.standard.en}</div>
                              {typeof item.standard !== 'string' && item.standard.ch && <div className="text-slate-400">{item.standard.ch}</div>}
                            </div>
                            {(() => { const arr = (typeof item.criteria === 'string' ? (item.criteria ? [{ en: item.criteria, ch: '' }] : []) : (Array.isArray(item.criteria) ? item.criteria.map((c: any) => typeof c === 'string' ? { en: c, ch: '' } : c) : [])).filter((c: any) => c.en || c.ch); if (arr.length === 0) return null; if (arr.length === 1) return <><div className="text-slate-800 text-sm font-medium">{(arr[0] as any).en}</div>{(arr[0] as any).ch && <div className="text-slate-500 text-xs mt-0.5">{(arr[0] as any).ch}</div>}</>; return <ul className="space-y-1 pl-1">{arr.map((c: any, i: number) => <li key={i} className="flex items-start gap-1"><span className="text-slate-400 shrink-0 mt-0.5">•</span><div><div className="text-slate-800 text-sm font-medium">{c.en}</div>{c.ch && <div className="text-slate-500 text-xs">{c.ch}</div>}</div></li>)}</ul>; })()}
                          </td>
                          <td className="px-5 py-4 border-r border-black bg-slate-50 align-top">
                            <div className="text-black text-sm font-medium">{item.checkTime.en}</div>
                            <div className="text-slate-500 text-xs mt-1">{item.checkTime.ch}</div>
                          </td>
                          <td className="px-5 py-4 border-r border-black align-top">
                            <div className="text-black text-sm">{item.method.en}</div>
                            <div className="text-slate-500 text-xs mt-1">{item.method.ch}</div>
                          </td>
                          <td className="px-5 py-4 border-r border-black align-top">
                        {typeof item.frequency === 'string' ? (
                          <div className="text-slate-800 text-xs">{item.frequency}</div>
                        ) : (
                          <>
                            <div className="text-slate-800 text-xs">{item.frequency.en}</div>
                            {item.frequency.ch && <div className="text-slate-400 text-xs mt-1">{item.frequency.ch}</div>}
                          </>
                        )}
                      </td>
                          <td className="px-5 py-4 border-r border-black bg-slate-50 align-top">
                            {item.record !== '-' ? (
                              <span className="font-mono text-xs font-bold text-slate-900">{item.record}</span>
                            ) : <span className="text-slate-400 text-xs pl-2">-</span>}
                          </td>
                          <td className="px-2 py-4 text-center border-r border-black align-middle"><VPBadge type={item.vp.sub} /></td>
                          <td className="px-2 py-4 text-center border-r border-black align-middle"><VPBadge type={item.vp.teco} /></td>
                          <td className="px-2 py-4 text-center border-r border-black align-middle"><VPBadge type={item.vp.employer} /></td>
                          <td className="px-2 py-4 text-center align-middle"><VPBadge type={item.vp.hse} /></td>
                        </tr>
                  );
                  // Phase heading travels with its first row so a tall first row cannot strand the heading alone at a page bottom.
                  return (
                    <React.Fragment key={phase.code}>
                      <tbody className="break-inside-avoid">
                      <tr className="border-y border-black">
                        <td colSpan={11} className={`px-0 py-0 border-b border-black ${phase.color}`}>
                          <div className="px-6 py-3 font-bold text-sm flex items-center gap-2 uppercase tracking-wide w-full text-black">
                            {phase.title}
                          </div>
                        </td>
                      </tr>
                        {phaseItems.length > 0 && renderRow(phaseItems[0])}
                      </tbody>
                      <tbody>
                        {phaseItems.slice(1).map(renderRow)}
                      </tbody>
                    </React.Fragment>
                  );
                })}
              </table>
            </div>

            {/* Footer info */}
            <div className="bg-slate-50 border-t border-black p-4 text-center text-xs text-slate-500 font-medium">
              End of Document - Total {items.length} Inspection Items
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Viewing ITR Details Modal */}

    </div>
  );
};

export default ITPDetail;
