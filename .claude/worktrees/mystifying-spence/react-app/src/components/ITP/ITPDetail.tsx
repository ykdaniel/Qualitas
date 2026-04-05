import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import { useITR } from '../../context/ITRContext';
import { ITRDetailsViewModal } from '../ITR/ITRModals';
import {
  FileText, Printer, Filter, PenTool, LayoutTemplate, Layers, X, Save, AlertCircle, Plus,
  CheckCircle2, ChevronDown, Calendar, Hash, Tag, FileCheck, ShieldCheck, HardHat, User, Building2, Trash2, ArrowDown
} from 'lucide-react';
import { BackButton } from '../ui/BackButton';

// --- 定義施工階段結構 ---
const PHASES = [
  { code: "A", title: "A. Before Construction (施工前)", color: "bg-slate-200" },
  { code: "B", title: "B. During Construction (施工中)", color: "bg-blue-100" },
  { code: "C", title: "C. After Construction (施工後)", color: "bg-emerald-100" }
];

// --- 初始資料庫數據 ---
const INITIAL_ITEMS = [
  // --- Phase A ---
  {
    phase: "A", id: "A1", activity: { en: "Length", ch: "長度" }, standard: "CNS 2602", criteria: "22m ±0.3% / 25m ±0.3%",
    checkTime: { en: "Deliver to site", ch: "運抵工地" }, method: { en: "Tape measure", ch: "捲尺" }, frequency: "-",
    vp: { sub: "", teco: "", employer: "", hse: "" }, record: "-"
  },
  {
    phase: "A", id: "A2", activity: { en: "Thickness", ch: "厚度" }, standard: "CNS 2602", criteria: "100mm -2/+40mm",
    checkTime: { en: "Deliver to site", ch: "運抵工地" }, method: { en: "Tape measure", ch: "捲尺" }, frequency: "-",
    vp: { sub: "", teco: "", employer: "", hse: "" }, record: "-"
  },
  {
    phase: "A", id: "A3", activity: { en: "Outer Diameter", ch: "外徑" }, standard: "CNS 2602", criteria: "600mm -4/+7mm",
    checkTime: { en: "Deliver to site", ch: "運抵工地" }, method: { en: "Tape measure", ch: "捲尺" }, frequency: "-",
    vp: { sub: "", teco: "", employer: "", hse: "" }, record: "-"
  },
  {
    phase: "A", id: "A4", activity: { en: "Quantity", ch: "數量" }, standard: "Shipping Order", criteria: "Meet shipping order",
    checkTime: { en: "Deliver to site", ch: "運抵工地" }, method: { en: "Visual", ch: "目視檢查" }, frequency: "Each Time",
    vp: { sub: "H", teco: "W", employer: "R", hse: "" }, record: "ITP-PL-01"
  },
  {
    phase: "A", id: "A5", activity: { en: "Stakeout", ch: "放樣" }, standard: "HL-ONS-TECO-STR-DWG-02000", criteria: "Meet design req.",
    checkTime: { en: "Before construction", ch: "施工前" }, method: { en: "Tape Measure", ch: "捲尺" }, frequency: "Each Time",
    vp: { sub: "H", teco: "H", employer: "H", hse: "" }, record: "ITP-SV-01"
  },
  // --- Phase B ---
  {
    phase: "B", id: "B1", activity: { en: "Foundation piling position", ch: "基礎打設座標" }, standard: "HL-ONS-TECO-STR-DWG-02000", criteria: "Tolerance ± 7.5 cm",
    checkTime: { en: "During Piling", ch: "打樁時" }, method: { en: "Total Station", ch: "全站儀" }, frequency: "Each Pile",
    vp: { sub: "H", teco: "H", employer: "H", hse: "" }, record: "QTS-RKS-HL-CHK-000001"
  },
  {
    phase: "B", id: "B2", activity: { en: "Pile Elevation", ch: "基礎高程" }, standard: "HL-ONS-TECO-GEO-DWG-08000", criteria: "Tolerance ± 7.5 cm",
    checkTime: { en: "After Piling", ch: "打樁後" }, method: { en: "Total Station", ch: "全站儀" }, frequency: "Each Pile",
    vp: { sub: "H", teco: "W", employer: "R", hse: "" }, record: "ITP-PL-04"
  },
  {
    phase: "B", id: "B3", activity: { en: "Pile Joint", ch: "樁頭檢查" }, standard: "CNS 2602", criteria: "No Oil, Rust, Dust",
    checkTime: { en: "Before Welding", ch: "焊接前" }, method: { en: "Visual", ch: "目視" }, frequency: "Each Pile",
    vp: { sub: "H", teco: "W", employer: "W", hse: "※" }, record: "ITP-PL-02"
  },
  {
    phase: "B", id: "B4", activity: { en: "Welding", ch: "焊接" }, standard: "CNS 13341", criteria: "No Defect (無缺失)",
    checkTime: { en: "After Welding", ch: "焊接後" }, method: { en: "NDT - MT", ch: "MT 檢測" }, frequency: "1/50 pcs",
    vp: { sub: "H", teco: "W", employer: "W", hse: "※" }, record: "ITP-PL-02"
  },
  {
    phase: "B", id: "B5", activity: { en: "Verticality of Pile", ch: "基礎垂直度" }, standard: "HL-ONS-TECO-GEO-DWG-08000", criteria: "< 1/75",
    checkTime: { en: "During Piling", ch: "打樁時" }, method: { en: "Spirit Level Ruler", ch: "水平尺" }, frequency: "Each Pile",
    vp: { sub: "H", teco: "W", employer: "W", hse: "" }, record: "ITP-PL-02&04"
  },
  {
    phase: "B", id: "B6", activity: { en: "Hit number of hammers", ch: "打擊次數" }, standard: "HL-ONS-TECO-ENG-PLN-00005", criteria: "< 2000 hits",
    checkTime: { en: "During Piling", ch: "打樁時" }, method: { en: "Visual", ch: "目視" }, frequency: "Each Pile",
    vp: { sub: "H", teco: "W", employer: "W", hse: "" }, record: "ITP-PL-02&04"
  },
  // --- Phase C ---
  {
    phase: "C", id: "C1", activity: { en: "Pile Position", ch: "樁位複測" }, standard: "HL-ONS-TECO-STR-", criteria: "Tolerance < 7.5cm",
    checkTime: { en: "After Piling", ch: "打樁後" }, method: { en: "Total Station", ch: "全站儀" }, frequency: "Each Pile",
    vp: { sub: "H", teco: "W", employer: "W", hse: "" }, record: "ITP-PL-03"
  }
];

// --- 空白項目模板 ---
const EMPTY_ITEM = {
  phase: "B",
  id: "",
  activity: { en: "", ch: "" },
  standard: "",
  criteria: "",
  checkTime: { en: "", ch: "" },
  method: { en: "", ch: "" },
  frequency: "",
  vp: { sub: "", teco: "", employer: "", hse: "" },
  record: "-"
};

// --- VP 標籤元件 ---
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

const ITPDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { itrList } = useITR();
  // NOTE: 初始為空陣列，避免所有 ITP 顯示相同的硬編碼資料
  const [items, setItems] = useState<any[]>([]);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [workTitle, setWorkTitle] = useState(""); // 工項標題狀態
  const [referenceNo, setReferenceNo] = useState(""); // Form No.
  const [viewingItrItem, setViewingItrItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch data on mount
  useEffect(() => {
    const fetchITP = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const response = await api.get(`/itp/${id}`);
        const data = response.data;
        if (data) {
          if (data.description) setWorkTitle(data.description);
          if (data.referenceNo) setReferenceNo(data.referenceNo);

          let details: any = {};
          if (typeof data.detail_data === 'string') {
            try {
              details = JSON.parse(data.detail_data);
            } catch (e) {
              console.error("Failed to parse detail_data", e);
            }
          } else if (typeof data.detail_data === 'object') {
            details = data.detail_data;
          }

          // 從後端載入檢查項目；若 detail_data 為空則保持空陣列
          if (details && (details.a || details.b || details.c)) {
            const loadedItems = [
              ...(details.a || []).map((i: any, index: number) => ({ ...i, phase: 'A', id: `A${index + 1}` })),
              ...(details.b || []).map((i: any, index: number) => ({ ...i, phase: 'B', id: `B${index + 1}` })),
              ...(details.c || []).map((i: any, index: number) => ({ ...i, phase: 'C', id: `C${index + 1}` })),
            ];
            setItems(loadedItems);
          }
          // 若無 detail_data，items 維持空陣列，使用者可透過「Add Item」新增
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
      await api.put(`/itp/${id}`, { description: workTitle });

      // 2. Update Details
      const payload = {
        a: items.filter(i => i.phase === 'A').map(({ phase, ...rest }) => rest),
        b: items.filter(i => i.phase === 'B').map(({ phase, ...rest }) => rest),
        c: items.filter(i => i.phase === 'C').map(({ phase, ...rest }) => rest),
        checklist: [],
        self_inspection: null
      };

      await api.put(`/itp/${id}/detail`, payload);
      alert("Saved successfully!");
    } catch (error) {
      console.error("Failed to save ITP:", error);
      alert("Failed to save document.");
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
  const handleEditClick = (item: any) => {
    setEditingItem({ ...item, isNew: false });
  };

  // 開啟新增模式 (New Item)
  const handleAddNew = () => {
    const defaultPhase = 'A';
    setEditingItem({ ...EMPTY_ITEM, phase: defaultPhase, id: calculateNextId(defaultPhase), isNew: true, insertAfter: 'end' });
  };

  // 儲存修改
  const handleSave = () => {
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

  const handleChange = (field: string, value: string, subField: string | null = null) => {
    if (subField) {
      setEditingItem((prev: any) => ({ ...prev, [field]: { ...prev[field], [subField]: value } }));
    } else {
      setEditingItem((prev: any) => {
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
    setEditingItem((prev: any) => ({ ...prev, vp: { ...prev.vp, [role]: value } }));
  };

  const handleDelete = (itemId: string) => {
    if (window.confirm("確定要刪除此項目嗎？")) {
      setItems(prev => prev.filter(item => item.id !== itemId));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans text-slate-800 p-4 md:p-8 overflow-x-auto relative selection:bg-blue-100 selection:text-blue-900">
      <style>
        {`
          @media print {
            @page {
              size: landscape;
              margin: 1cm;
            }
            
            /* Hide non-print elements */
            .no-print {
              display: none !important;
            }

            /* Reset body and container for printing */
            body {
              background: white !important;
              color: black !important;
              margin: 0 !important;
              padding: 0 !important;
            }

            .print-container {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
              border: none !important;
              display: block !important;
            }

            /* Force black borders for table */
            table, th, td {
              border: 1px solid black !important;
              border-collapse: collapse !important;
            }

            /* Ensure all cells are visible */
            th, td {
              overflow: visible !important;
              white-space: normal !important;
            }

            /* Avoid page breaks inside rows */
            tr {
              page-break-inside: avoid;
              break-inside: avoid;
            }

            /* Ensure the blue top bar prints (if desired) or remove it */
            .bg-gradient-to-r {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
          }
        `}
      </style>

      {/* Back Button & Toolbar */}
      <div className="max-w-[1400px] min-w-[1024px] mx-auto mb-6 flex items-center justify-between no-print">
        <BackButton
          label="Back to List"
          onClick={() => navigate('/itp')}
        />

        <div className="flex gap-3">
          <button
            onClick={saveToBackend}
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-emerald-700 shadow-sm hover:shadow active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <LayoutTemplate size={14} className="animate-spin" /> : <Save size={14} strokeWidth={3} />}
            {saving ? "Saving..." : "Save Document"}
          </button>
          <button onClick={handleAddNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-blue-700 shadow-sm hover:shadow active:scale-95 transition-all">
            <Plus size={14} strokeWidth={3} /> Add New Item
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-all"
          >
            <Printer size={14} /> Print / PDF
          </button>
        </div>
      </div>

      {/* Subject Header */}


      {/* 編輯視窗 (Modal) */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-300">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-5 flex justify-between items-center text-white shadow-md relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
              <h3 className="font-bold text-xl flex items-center gap-3 relative z-10">
                <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                  <PenTool size={20} className="text-white" />
                </div>
                {editingItem.isNew ? "Add New Inspection Item" : `Edit Item (${editingItem.id})`}
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="hover:bg-white/20 p-2 rounded-full transition-colors relative z-10"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* Basic Info Card */}
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm grid grid-cols-2 gap-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    <Hash size={14} /> Event No.
                  </label>
                  {/* Event No. is always auto-generated and read-only */}
                  <div className="text-sm font-bold text-slate-800 bg-slate-100 border border-slate-200 rounded-lg px-4 h-10 flex items-center shadow-sm min-w-[3.5rem] justify-center cursor-not-allowed select-none">
                    {editingItem.id}
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    <Layers size={14} /> Phase
                  </label>
                  <div className="relative">
                    <select className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white font-medium text-slate-700 shadow-sm cursor-pointer transition-all hover:border-slate-400"
                      value={editingItem.phase} onChange={(e) => handleChange('phase', e.target.value)}>
                      {PHASES.map(p => <option key={p.code} value={p.code}>{p.title}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-3 text-slate-400 pointer-events-none" size={16} />
                  </div>
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
                      <ChevronDown className="absolute right-3 top-3 text-slate-400 pointer-events-none" size={16} />
                    </div>
                  </div>
                )}
              </div>

              {/* Inspection Details */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-2">
                  <FileText size={16} className="text-blue-600" /> Inspection Details
                </h4>
                {/* Activity (EN) & Standard Row */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2 ml-1">
                      <FileText size={14} className="text-blue-500" /> Activity (EN)
                    </label>
                    <input type="text" className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all shadow-sm"
                      value={editingItem.activity.en} onChange={(e) => handleChange('activity', e.target.value, 'en')} />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2 ml-1">
                      <ShieldCheck size={14} /> Standard
                    </label>
                    <input type="text" className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono text-slate-600 bg-white shadow-sm"
                      value={editingItem.standard} onChange={(e) => handleChange('standard', e.target.value)} />
                  </div>
                </div>

                {/* Activity (CH) & Acceptance Criteria Row */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2 ml-1">
                      <FileText size={14} className="text-blue-500" /> Activity (CH)
                    </label>
                    <input type="text" className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all shadow-sm"
                      value={editingItem.activity.ch} onChange={(e) => handleChange('activity', e.target.value, 'ch')} />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2 ml-1">
                      <CheckCircle2 size={14} /> Acceptance Criteria
                    </label>
                    <input type="text" className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm font-medium"
                      value={editingItem.criteria} onChange={(e) => handleChange('criteria', e.target.value)} />
                  </div>
                </div>

                {/* Procedure Specifics (Timing, Method, Frequency, Record) */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-6 pt-2">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2 ml-1">
                      <Calendar size={14} className="text-blue-500" /> Check Time (EN/CH)
                    </label>
                    <div className="flex flex-col gap-2">
                      <input type="text" className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm"
                        value={editingItem.checkTime.en} onChange={(e) => handleChange('checkTime', e.target.value, 'en')} />
                      <input type="text" className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-500 bg-white shadow-sm"
                        value={editingItem.checkTime.ch} onChange={(e) => handleChange('checkTime', e.target.value, 'ch')} />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2 ml-1">
                      <Filter size={14} className="text-blue-500" /> Method (EN/CH)
                    </label>
                    <div className="flex flex-col gap-2">
                      <input type="text" className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm"
                        value={editingItem.method.en} onChange={(e) => handleChange('method', e.target.value, 'en')} />
                      <input type="text" className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-500 bg-white shadow-sm"
                        value={editingItem.method.ch} onChange={(e) => handleChange('method', e.target.value, 'ch')} />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2 ml-1">
                      <AlertCircle size={14} className="text-slate-400" /> Frequency
                    </label>
                    <input type="text" className="w-full border border-slate-300 rounded-lg px-4 h-10 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm"
                      value={editingItem.frequency} onChange={(e) => handleChange('frequency', e.target.value)} />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2 ml-1">
                      <FileCheck size={14} className="text-emerald-600" /> Records
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full border border-slate-300 bg-white rounded-lg pl-10 pr-4 h-10 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-slate-700 shadow-sm"
                        list="itr-options"
                        value={editingItem.record}
                        onChange={(e) => handleChange('record', e.target.value)}
                        placeholder="Select or enter Record No."
                      />
                      <Tag className="absolute left-3 top-3 text-slate-400" size={16} />
                      <datalist id="itr-options">
                        {itrList.map((itr) => (
                          <option key={itr.id} value={itr.documentNumber} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                </div>

                {/* Verification Points */}
                <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100">
                  <label className="block text-xs font-bold text-indigo-800 uppercase mb-4 tracking-wide text-center">Verification Points Assigment</label>
                  <div className="grid grid-cols-4 gap-4">
                    {[
                      { key: 'sub', label: 'Sub-Con', icon: <HardHat size={14} /> },
                      { key: 'teco', label: 'Main Con', icon: <Building2 size={14} /> },
                      { key: 'employer', label: 'Employer', icon: <User size={14} /> },
                      { key: 'hse', label: 'HSE', icon: <ShieldCheck size={14} /> }
                    ].map(({ key, label, icon }) => (
                      <div key={key} className="flex flex-col items-center bg-white p-3 rounded-lg border border-indigo-100 shadow-sm transition-transform hover:-translate-y-1 duration-200">
                        <div className="text-[10px] uppercase font-bold text-slate-400 mb-2 flex items-center gap-1">
                          {icon} {label}
                        </div>
                        <select className="w-full border-0 bg-slate-50 rounded-md text-sm font-bold py-1.5 text-center cursor-pointer hover:bg-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700"
                          value={editingItem.vp[key]} onChange={(e) => handleVPChange(key, e.target.value)}>
                          <option value="">-</option><option value="H">H</option><option value="W">W</option><option value="R">R</option><option value="※">※</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-8 py-5 border-t border-slate-200 flex justify-end gap-4">
              <button
                onClick={() => setEditingItem(null)}
                className="px-6 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2.5 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 transform active:scale-95"
              >
                <Save size={18} /> Save Changes
              </button>
            </div>
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
          <div className="flex justify-end mt-1">
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
                <th className="px-2 py-2 text-center border-r border-black w-12 bg-slate-800 text-[11px] font-bold">TECO</th>
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
                        <div className="font-bold text-sm mb-1">{item.activity.en}</div>
                        <div className="text-slate-600 text-xs font-medium">{item.activity.ch}</div>
                      </td>
                      <td className="px-5 py-4 border-r border-black align-top">
                        <div className="inline-block bg-slate-100 text-slate-600 text-[11px] font-mono px-2 py-0.5 rounded mb-2 border border-black">
                          {item.standard}
                        </div>
                        <div className="text-slate-800 text-sm leading-relaxed font-medium">{item.criteria}</div>
                      </td>
                      <td className="px-5 py-4 border-r border-black bg-slate-50 align-top">
                        <div className="text-black text-sm font-medium">{item.checkTime.en}</div>
                        <div className="text-slate-500 text-xs mt-1">{item.checkTime.ch}</div>
                      </td>
                      <td className="px-5 py-4 border-r border-black align-top">
                        <div className="text-black text-sm">{item.method.en}</div>
                        <div className="text-slate-500 text-xs mt-1">{item.method.ch}</div>
                      </td>
                      <td className="px-5 py-4 border-r border-black align-top"><div className="text-slate-800 text-xs">{item.frequency}</div></td>
                      <td className="px-5 py-4 border-r border-black bg-slate-50 align-top">
                        {item.record !== '-' ? (
                          <button
                            onClick={() => {
                              if (item.record.includes('CHK') || item.record.startsWith('QTS')) {
                                navigate(`/checklist?recordNo=${item.record}&from=itp`);
                                return;
                              }
                              const found = itrList.find(itr => itr.documentNumber === item.record);
                              if (found) {
                                setViewingItrItem(found);
                              } else {
                                // Fallback: if not found in context (might be manually entered or not synced), 
                                // we could still show a basic view or alert
                                alert('Record document data not found in current list.');
                              }
                            }}
                            className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-white text-slate-900 hover:text-blue-800 hover:bg-blue-50 transition-colors font-mono text-xs font-bold border border-slate-300 hover:border-blue-400 whitespace-nowrap shadow-sm group/itr"
                          >
                            <FileText size={12} className="mr-1.5 opacity-70 group-hover/itr:opacity-100" />{item.record}
                          </button>
                        ) : <span className="text-slate-400 text-xs pl-2">-</span>}
                      </td>
                      <td className="px-2 py-4 text-center border-r border-black align-middle"><VPBadge type={item.vp.sub} /></td>
                      <td className="px-2 py-4 text-center border-r border-black align-middle"><VPBadge type={item.vp.teco} /></td>
                      <td className="px-2 py-4 text-center border-r border-black align-middle"><VPBadge type={item.vp.employer} /></td>
                      <td className="px-2 py-4 text-center border-r border-black align-middle"><VPBadge type={item.vp.hse} /></td>
                      <td className="px-4 py-4 text-center align-middle sticky right-0 bg-white shadow-[-5px_0_10px_-5px_rgba(0,0,0,0.05)] transition-all border-l border-black no-print">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEditClick(item)}
                            className="text-slate-500 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50 transition-all"
                            title="Edit"
                          >
                            <PenTool size={16} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-slate-500 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-all"
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

      {/* Viewing ITR Details Modal */}
      {viewingItrItem && (
        <ITRDetailsViewModal
          itrId={viewingItrItem.id}
          itrItem={viewingItrItem}
          onPrint={() => window.print()}
          onClose={() => setViewingItrItem(null)}
        />
      )}
    </div>
  );
};

export default ITPDetail;
