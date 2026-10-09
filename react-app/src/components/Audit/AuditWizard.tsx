import { useDraftGuard, useItemDraftGuard } from '../Shared/LeaveGuard';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  MapPin, ClipboardList, CheckCircle, ChevronRight, ChevronLeft,
  Save, FileText, Users, CheckSquare, Plus, Trash2, Edit2, Check, X,
  AlertCircle, Search, ShieldCheck, Printer
} from 'lucide-react';
import { useAuditStore, AuditItem } from '../../store/auditStore';
import { useProjectStore } from '../../store/projectStore';
import { useLanguage } from '../../context/LanguageContext';
import { checkDateOrder } from '../../utils/dateValidation';

const ALL_CATEGORY = '__ALL__';
const UNCATEGORIZED = '__UNCATEGORIZED__';

// Mirrors backend/core/utils.py::WorkflowEngine.TRANSITIONS["Audit"] — the backend is the only
// source of truth for which transitions it accepts (same approach as ITP_STATUS_TRANSITIONS in
// ITPModals.tsx). Keep this in sync if the backend map ever changes.
const AUDIT_STATUS_TRANSITIONS: Record<string, string[]> = {
  'Draft': ['Planned', 'Void'],
  'Planned': ['In Progress', 'Draft', 'Void'],
  'In Progress': ['Completed', 'Void'],
  'Completed': ['Closed', 'In Progress', 'Void'],
  'Closed': [],
  'Void': [],
};
// A new audit may start in any status that still has a way forward (audit_service.py refuses
// Closed / Void on create: a record created in a dead end could never be edited or deleted).
const AUDIT_CREATE_STATUSES = ['Draft', 'Planned', 'In Progress', 'Completed'];
// Closed and Void are dead ends ("Closed": [] / "Void": []): read-only here and in the backend.
const AUDIT_LOCKED_STATUSES = new Set(['Closed', 'Void']);
const AUDIT_STATUS_LABELS: Record<string, string> = {
  'Draft': '✏️ Draft（草稿）',
  'Planned': '📅 Planned（計畫中）',
  'In Progress': '👣 In Progress（進行中）',
  'Completed': '✅ Completed（已完成）',
  'Closed': '🔒 Closed（已關閉）',
  'Void': '⛔ Void（作廢）',
};

// 內建 ISO 9001:2015 條文資料庫
const ISO_CLAUSES = [
  { no: '4.1', clause: 'Understanding the organization and its context', task: 'How has the organization determined external and internal issues relevant to its purpose and strategic direction?' },
  { no: '4.2', clause: 'Understanding the needs and expectations of interested parties', task: 'How do you monitor and review information about these interested parties and their relevant requirements?' },
  { no: '4.3', clause: 'Determining the scope of the quality management system', task: 'Has the organization determined the boundaries and applicability of the QMS to establish its scope?' },
  { no: '4.4', clause: 'Quality management system and its processes', task: 'How has the organization determined the processes needed for the QMS and their application?' },
  { no: '5.1', clause: 'Leadership and commitment', task: 'How does top management demonstrate leadership and commitment with respect to the QMS?' },
  { no: '5.2', clause: 'Policy', task: 'Has top management established, implemented and maintained a quality policy?' },
  { no: '6.1', clause: 'Actions to address risks and opportunities', task: 'How are risks and opportunities determined and addressed?' },
  { no: '6.2', clause: 'Quality objectives and planning to achieve them', task: 'Are quality objectives established at relevant functions, levels and processes?' },
  { no: '7.1', clause: 'Resources', task: 'How does the organization determine and provide the resources needed for the QMS?' },
  { no: '7.2', clause: 'Competence', task: 'How do you determine the necessary competence of person(s) doing work under your control?' },
  { no: '7.5', clause: 'Documented information', task: 'Does the QMS include documented information required by ISO 9001?' },
  { no: '8.1', clause: 'Operational planning and control', task: 'How does the organization plan, implement and control the processes needed to meet requirements?' },
  { no: '8.2', clause: 'Requirements for products and services', task: 'How do you determine the requirements for the products and services to be offered?' },
  { no: '8.4', clause: 'Control of externally provided processes, products and services', task: 'How do you ensure that externally provided processes, products and services conform to requirements?' },
  { no: '8.5', clause: 'Production and service provision', task: 'Are production and service provision implemented under controlled conditions?' },
  { no: '9.1', clause: 'Monitoring, measurement, analysis and evaluation', task: 'How do you determine what needs to be monitored and measured?' },
  { no: '9.2', clause: 'Internal audit', task: 'Are internal audits conducted at planned intervals?' },
  { no: '9.3', clause: 'Management review', task: 'Does top management review the organization\'s QMS at planned intervals?' },
  { no: '10.2', clause: 'Nonconformity and corrective action', task: 'When a nonconformity occurs, how does the organization react to it?' },
  { no: '10.3', clause: 'Continual improvement', task: 'How does the organization continually improve the QMS?' }
];

interface AuditWizardProps {
  auditId: string | null;
  existingItem?: AuditItem;
  readOnly?: boolean;
  onClose: () => void;
  onSaveSuccess: () => void;
}

export const AuditWizard: React.FC<AuditWizardProps> = ({ existingItem, readOnly: readOnlyProp = false, onClose, onSaveSuccess }) => {
  const { t } = useLanguage();
  const { addAudit, updateAudit, loading } = useAuditStore();
  // Same source as the Audit page (GET /audit/contractors, audit:view is enough); Audit.tsx fetches it.
  const contractorOptions = useAuditStore(state => state.contractorOptions);
  const activeContractors = useMemo(() => contractorOptions.filter(c => c.status === 'active'), [contractorOptions]);
  const { projectList, fetchProjects, currentProject } = useProjectStore();
  React.useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    auditTitle: existingItem?.title || '',
    // A new audit starts in the project currently selected in the header (blank under "All
    // projects"), so it doesn't vanish from the list it was created from; always changeable.
    projectId: existingItem ? (existingItem.project_id || '') : (currentProject?.id || ''),
    projectName: existingItem ? (existingItem.project_name || '') : (currentProject?.name || ''),
    findings: existingItem?.findings || '',
    auditStartDate: existingItem?.date || '',
    auditEndDate: existingItem?.end_date || '',
    projectDirector: existingItem?.project_director || '',
    leadAuditor: existingItem?.auditor || '',
    supportAuditors: existingItem?.support_auditors || '',
    techLead: existingItem?.tech_lead || '',
    location: existingItem?.location || '',
    auditCriteria: existingItem?.audit_criteria || '',
    scopeDescription: existingItem?.scope_description || '',
    selectedTemplates: existingItem?.selected_templates || [],
    customCheckItems: existingItem?.custom_check_items || [],
    contractor: existingItem?.contractor || '',
    vendorId: existingItem?.vendor_id || '',
    status: existingItem?.status || 'Draft',
  });
  // Server-assigned and never edited, so kept out of formData (and out of the leave guard): after
  // the first Save Draft of a new record it is filled in from the create response.
  const [auditNo, setAuditNo] = useState(existingItem?.auditNo || '');
  // Status of the last successful save (undefined = not saved yet). Drives the status options and
  // the lock, so a record saved as Void mid-session locks without reopening the wizard.
  const [savedStatus, setSavedStatus] = useState<string | undefined>(existingItem?.status);
  const readOnly = readOnlyProp || (savedStatus !== undefined && AUDIT_LOCKED_STATUSES.has(savedStatus));
  const statusOptions = savedStatus === undefined
    ? AUDIT_CREATE_STATUSES
    : [savedStatus, ...(AUDIT_STATUS_TRANSITIONS[savedStatus] || [])];
  // A legacy record may have only a project name (no project_id): show the project that name
  // matches, and save that link the next time the record is saved.
  const selectedProjectId = formData.projectId
    || projectList.find(p => p.name === formData.projectName)?.id
    || '';

  const [newItem, setNewItem] = useState({ no: '', clause: '', task: '' });
  const [isCustomNew, setIsCustomNew] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  // Audit.tsx never promotes its own currentAuditId after a mid-session "Save Draft" (Save
  // Draft deliberately keeps the wizard open without calling onSaveSuccess, so the parent
  // never learns the new id) — existingItem stays undefined for the rest of this wizard's
  // life even after the first successful create. Without tracking the id locally, EVERY
  // subsequent Save Draft click on a still-open new record would call addAudit() again,
  // creating another duplicate record each time (reproduced: two Save Draft clicks with an
  // Add in between produced two separate audit rows, the second one holding the added item
  // and the first one permanently stuck with an empty custom_check_items).
  const [createdId, setCreatedId] = useState<string | null>(null);
  const recordId = existingItem?.id ?? createdId;
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState({ no: '', clause: '', task: '' });
  const [isCustomEdit, setIsCustomEdit] = useState(false);
  const leaveGuard = useDraftGuard(formData, isSaving || isDraftSaving, !readOnly);
  useDraftGuard(newItem, false, !readOnly);
  useItemDraftGuard(editingItemId !== null ? editFormData : null);
  const requestClose = () => leaveGuard.requestClose(onClose, true);

  const startEdit = (item: any) => {
    setEditingItemId(item.id);
    setEditFormData({ no: item.no, clause: item.clause, task: item.task });
    if (item.no && !ISO_CLAUSES.some(c => c.no === item.no)) {
      setIsCustomEdit(true);
    } else {
      setIsCustomEdit(false);
    }
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  const saveEdit = () => {
    setFormData(prev => ({
      ...prev,
      customCheckItems: prev.customCheckItems.map((item: any) =>
        item.id === editingItemId ? { ...item, ...editFormData } : item
      )
    }));
    setEditingItemId(null);
  };

  const cancelEdit = () => setEditingItemId(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY);

  const categories = useMemo(() => {
    const cats = formData.customCheckItems.map((i: any) => i.no || UNCATEGORIZED);
    return [ALL_CATEGORY, ...Array.from(new Set(cats))] as string[];
  }, [formData.customCheckItems]);

  const stats = useMemo(() => {
    const total = formData.customCheckItems.length;
    const passed = formData.customCheckItems.filter((i: any) => i.status === 'pass').length;
    const failed = formData.customCheckItems.filter((i: any) => i.status === 'fail').length;
    const pending = total - passed - failed; // The "!" status is treated as pending or warning
    const progress = total === 0 ? 0 : Math.round(((total - pending) / total) * 100);
    return { total, passed, failed, pending, progress };
  }, [formData.customCheckItems]);

  const filteredItems = useMemo(() => {
    return formData.customCheckItems.filter((item: any) => {
      const matchesSearch = (item.clause || '').includes(searchTerm) || (item.task || '').includes(searchTerm);
      const matchesCategory = activeCategory === ALL_CATEGORY || (item.no || UNCATEGORIZED) === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [formData.customCheckItems, searchTerm, activeCategory]);

  const updateItemStatus = (id: number, newStatus: string) => {
    setFormData(prev => ({
      ...prev,
      customCheckItems: prev.customCheckItems.map((item: any) => 
        item.id === id ? { ...item, status: newStatus, updatedAt: new Date().toISOString().split('T')[0] } : item
      )
    }));
  };

  const updateItemNote = (id: number, newNote: string) => {
    setFormData(prev => ({
      ...prev,
      customCheckItems: prev.customCheckItems.map((item: any) => 
        item.id === id ? { ...item, note: newNote, updatedAt: new Date().toISOString().split('T')[0] } : item
      )
    }));
  };

  const handleNewClauseSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'custom') {
      setIsCustomNew(true);
      setNewItem(prev => ({ ...prev, no: '' }));
    } else {
      const found = ISO_CLAUSES.find(c => c.no === val);
      if (found) setNewItem({ no: found.no, clause: found.clause, task: found.task });
    }
  };

  const handleEditClauseSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'custom') {
      setIsCustomEdit(true);
      setEditFormData(prev => ({ ...prev, no: '' }));
    } else {
      const found = ISO_CLAUSES.find(c => c.no === val);
      if (found) setEditFormData({ no: found.no, clause: found.clause, task: found.task });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      if (name === 'auditStartDate' || name === 'auditEndDate') {
        const check = checkDateOrder(updated.auditStartDate, updated.auditEndDate, 'Audit Start Date', 'Audit End Date');
        if (!check.valid) toast.warning(check.message);
      }
      return updated;
    });
  };

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const projectId = e.target.value;
    const selected = projectList.find(p => p.id === projectId);
    setFormData(prev => ({ ...prev, projectId, projectName: selected?.name || '' }));
  };

  const handleContractorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vendorId = e.target.value;
    const selectedVendor = activeContractors.find((v: any) => v.id === vendorId);
    setFormData(prev => ({
      ...prev,
      vendorId: vendorId,
      contractor: selectedVendor?.name || ''
    }));
  };

  const handleNewItemChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewItem(prev => ({ ...prev, [name]: value }));
  };

  const addCustomItem = () => {
    if (!newItem.task.trim()) return;
    const itemToAdd = { id: Date.now(), ...newItem };
    setFormData(prev => ({
      ...prev,
      customCheckItems: [...prev.customCheckItems, itemToAdd]
    }));
    setNewItem({ no: '', clause: '', task: '' });
    setIsCustomNew(false);
  };

  const removeCustomItem = (id: number) => {
    setFormData(prev => ({
      ...prev,
      customCheckItems: prev.customCheckItems.filter((item: any) => item.id !== id)
    }));
  };

  const nextStep = () => setStep(prev => Math.min(prev + 1, 5));
  const prevStep = () => setStep(prev => Math.max(prev - 1, 1));

  const prepareAuditData = (status: string): Omit<AuditItem, 'id'> => {
    return {
      // The backend assigns auditNo on create and ignores it on update; sent only because the
      // create schema still lists it.
      auditNo: auditNo,
      title: formData.auditTitle || '',
      date: formData.auditStartDate || '',
      end_date: formData.auditEndDate || '',
      project_id: selectedProjectId || null,
      project_name: formData.projectName || '',
      auditor: formData.leadAuditor || '',
      project_director: formData.projectDirector || '',
      support_auditors: formData.supportAuditors || '',
      tech_lead: formData.techLead || '',
      location: formData.location || '',
      findings: formData.findings || '',
      audit_criteria: formData.auditCriteria || '',
      scope_description: formData.scopeDescription || '',
      selected_templates: formData.selectedTemplates,
      custom_check_items: formData.customCheckItems,
      contractor: formData.contractor || '',
      vendor_id: formData.vendorId || undefined,
      status: status,
    };
  };

  // Typing a custom check item but forgetting to click "Add" must not silently discard it
  // on save — the field never made it into customCheckItems, so guide the user instead.
  // The SAME loss happens for an EXISTING item mid-inline-edit (startEdit/editFormData):
  // while editingItemId !== null, editFormData is a separate local draft not yet folded
  // back into formData.customCheckItems (that only happens on saveEdit / "套用"), so a
  // main-form save right now would keep the item's OLD values and silently drop whatever
  // was just typed in the inline edit row.
  const hasUnconfirmedNewItem = () => newItem.no.trim() || newItem.clause.trim() || newItem.task.trim();
  const blockSaveForUnconfirmedNewItem = () => {
    if (editingItemId !== null) {
      toast.error('您正在編輯既有查檢項目但尚未按「儲存」套用這筆編輯。請先儲存，或按「取消」放棄後再保存整份表單。');
      return true;
    }
    if (!hasUnconfirmedNewItem()) return false;
    toast.error('您在自訂查檢項目輸入了內容但尚未按「新增」。請先按「新增」加入，或清空欄位後再保存。');
    return true;
  };

  const handleSaveDraft = async () => {
    if (readOnly) return;
    if (blockSaveForUnconfirmedNewItem()) return;
    setIsDraftSaving(true);
    setSaveError('');
    setDraftMessage('');

    try {
      const updates = prepareAuditData(formData.status || 'Draft');
      if (recordId) {
        await updateAudit(recordId, updates);
        setSavedStatus(updates.status);
      } else {
        const created = await addAudit(updates);
        setCreatedId(created.id);
        setAuditNo(created.auditNo);
        setSavedStatus(created.status);
      }

      leaveGuard.markSaved();
      const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setDraftMessage(`${t('audit.wizard.draftSaved')} ${time}`);
      setTimeout(() => setDraftMessage(''), 4000);
      // Don't call onSaveSuccess() here — draft save should keep the wizard open
    } catch (err: any) {
      console.error("草稿儲存失敗: ", err);
      setSaveError(t('audit.wizard.saveError'));
    } finally {
      setIsDraftSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (blockSaveForUnconfirmedNewItem()) return;
    setIsSaving(true);
    setSaveError('');

    try {
      const updates = prepareAuditData(formData.status || 'Planned');
      if (recordId) {
        await updateAudit(recordId, updates);
      } else {
        const created = await addAudit(updates);
        setCreatedId(created.id);
        setAuditNo(created.auditNo);
      }

      leaveGuard.release();
      setIsSubmitted(true);
      onSaveSuccess();
    } catch (err: any) {
      console.error("資料庫寫入失敗: ", err);
      setSaveError(t('audit.wizard.submitError'));
    } finally {
      setIsSaving(false);
    }
  };

  const renderProgressBar = () => (
    <div className="flex items-center justify-between mb-12 w-full max-w-4xl mx-auto">
      {[1, 2, 3, 4, 5].map((i) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center relative">
            <button
              type="button"
              onClick={() => setStep(i)}
              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 z-10 cursor-pointer hover:scale-110 ${
                step >= i ? 'bg-teal-600 border-teal-600 text-white shadow-lg' : 'bg-white border-gray-300 text-gray-400 hover:border-teal-400'
              }`}
            >
              {step > i ? <CheckCircle size={20} /> : i}
            </button>
            <span className={`absolute -bottom-8 text-xs font-bold whitespace-nowrap ${
              step >= i ? 'text-teal-700' : 'text-slate-400'
            }`}>
              {i === 1 ? t('audit.wizard.step1') : i === 2 ? t('audit.wizard.step2') : i === 3 ? t('audit.wizard.step3') : i === 4 ? t('audit.wizard.step4') : t('audit.wizard.step5')}
            </span>
          </div>
          {i < 5 && (
            <div className={`flex-1 h-1 mx-2 rounded-full transition-colors duration-300 drop-shadow-sm ${
              step > i ? 'bg-teal-500' : 'bg-slate-600/50'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  if (isSubmitted) {
    return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto no-print">
        <div className="bg-white p-10 rounded-3xl shadow-2xl text-center max-w-2xl w-full border border-teal-100">
          <div className="w-24 h-24 bg-teal-50 text-teal-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={56} />
          </div>
          <h2 className="text-3xl font-black text-slate-800 mb-2">{t('audit.wizard.successTitle')}</h2>
          <p className="text-slate-500 mb-8">{t('audit.wizard.successSubtitle')}{auditNo || t('audit.wizard.successSubtitleAuto')}</p>

          <div className="grid grid-cols-2 gap-4 text-left bg-slate-50 p-6 rounded-2xl mb-8 border border-slate-100">
            <div className="col-span-2">
              <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">{t('audit.wizard.projectNameLabel')}</p>
              <p className="font-semibold text-slate-700">{formData.projectName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">{t('audit.wizard.leadAuditorLabel')}</p>
              <p className="font-semibold text-slate-700">{formData.leadAuditor}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">{t('audit.wizard.checkItemCountLabel')}</p>
              <p className="font-semibold text-slate-700">{formData.customCheckItems.length} {t('audit.wizard.customItemsSuffix')}</p>
            </div>
          </div>

          <button
            onClick={requestClose}
            className="w-full py-4 bg-teal-600 text-white rounded-2xl font-bold text-lg hover:bg-teal-700 hover:shadow-lg transition-all active:scale-[0.98]"
          >
            {t('audit.wizard.backToList')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto py-12 px-4 flex justify-center items-start pt-16">
      <div className="w-full max-w-5xl">
        <div className="flex justify-between items-center mb-6 no-print">
            <div className="text-left flex items-center gap-4">
                <div className="inline-flex items-center justify-center p-3.5 bg-emerald-50 text-teal-700 rounded-2xl">
                    <ClipboardList size={28} />
                </div>
                <h1 className="text-3xl font-black text-slate-800 tracking-tight">{t('audit.wizard.title')}</h1>
            </div>
            <button 
                onClick={requestClose}
                className="w-12 h-12 bg-transparent hover:bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all"
            >
                <X size={26} />
            </button>
        </div>

        <div className="no-print">
          {renderProgressBar()}
        </div>

        {saveError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-center font-medium shadow-sm no-print">
            {saveError}
          </div>
        )}

        <div className="bg-white rounded-4xl shadow-xl shadow-slate-900/10 overflow-hidden relative border border-slate-100/50 print-modal-content">
          <form onSubmit={handleSubmit}>
            
            {/* Step 1: Project Info */}
            {step === 1 && (
              <div className="p-8 md:p-12 space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-6">
                  <FileText className="text-teal-600" size={28} />
                  <h2 className="text-2xl font-bold text-slate-800">{t('audit.wizard.step1')}</h2>
                </div>
                
                <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="col-span-full">
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Audit Doc No</span>
                       <span className="text-xs font-medium text-slate-400">(稽核文件編號)</span>
                    </label>
                    <input type="text" name="auditDocNo" value={auditNo} className="w-full md:w-1/2 p-4 bg-[#F5F7FA] border border-slate-200 rounded-2xl outline-none text-slate-400 font-medium cursor-not-allowed" placeholder="系統自動產生" readOnly style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }} />
                  </div>
                  <div className="col-span-full">
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">{t('audit.auditTitle') || 'Audit Title'}</span>
                       <span className="text-xs font-medium text-slate-400">(稽核標題)</span>
                    </label>
                    <input type="text" name="auditTitle" value={formData.auditTitle} onChange={handleInputChange} className="w-full p-4 bg-[#F5F7FA] border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" placeholder={t('audit.auditTitlePlaceholder') || 'Enter audit title'} />
                  </div>
                  <div className="col-span-full">
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Project No / Name</span>
                       <span className="text-xs font-medium text-slate-400">(專案名稱)</span>
                    </label>
                    <select
                      name="projectId"
                      value={selectedProjectId}
                      onChange={handleProjectChange}
                      className="w-full p-4 bg-[#F5F7FA] border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium appearance-none"
                    >
                      <option value="">{t('audit.wizard.selectProject')}</option>
                      {projectList.map(p => (
                        <option key={p.id} value={p.id}>{p.code ? `[${p.code}] ` : ''}{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-full">
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Contractor</span>
                       <span className="text-xs font-medium text-slate-400">(受稽核廠商)</span>
                    </label>
                    <select value={formData.vendorId} onChange={handleContractorChange} className="w-full md:w-1/2 p-4 bg-[#F5F7FA] border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium appearance-none">
                        <option value="">{t('audit.wizard.selectContractor')}</option>
                        {activeContractors.map((vendor: any) => (
                            <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                        ))}
                    </select>
                  </div>
                  <div className="col-span-1">
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Audit Start Date</span>
                    </label>
                    <input type="date" name="auditStartDate" value={formData.auditStartDate} onChange={handleInputChange} className="w-full p-4 bg-[#F5F7FA] border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                  </div>
                  <div className="col-span-1">
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Audit End Date</span>
                    </label>
                    <input type="date" name="auditEndDate" value={formData.auditEndDate} onChange={handleInputChange} className="w-full p-4 bg-[#F5F7FA] border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                  </div>
                  <div className="col-span-full">
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Status</span>
                       <span className="text-xs font-medium text-slate-400">(稽核狀態)</span>
                    </label>
                    <select name="status" value={formData.status} onChange={handleInputChange} className="w-full md:w-1/3 p-4 bg-[#F5F7FA] border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium appearance-none">
                      {/* Only what the workflow allows from the last saved status (the backend refuses anything else). */}
                      {statusOptions.map(status => (
                        <option key={status} value={status}>{AUDIT_STATUS_LABELS[status] || status}</option>
                      ))}
                    </select>
                  </div>
                </fieldset>
              </div>
            )}

            {/* Step 2: Personnel */}
            {step === 2 && (
              <div className="p-8 md:p-12 space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-6">
                  <Users className="text-teal-600" size={28} />
                  <h2 className="text-2xl font-bold text-slate-800">{t('audit.wizard.step2')} (Carried Out By)</h2>
                </div>
                <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Project Director</span>
                    </label>
                    <input type="text" name="projectDirector" value={formData.projectDirector} onChange={handleInputChange} className="w-full p-4 bg-[#F5F7FA] border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                  </div>
                  <div>
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Package or Tech. Lead</span>
                    </label>
                    <input type="text" name="techLead" value={formData.techLead} onChange={handleInputChange} className="w-full p-4 bg-[#F5F7FA] border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                  </div>
                  <div>
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Lead Auditor</span>
                    </label>
                    <input type="text" name="leadAuditor" value={formData.leadAuditor} onChange={handleInputChange} className="w-full p-4 bg-[#F5F7FA] border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                  </div>
                  <div>
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Support Auditor</span>
                    </label>
                    <input type="text" name="supportAuditors" value={formData.supportAuditors} onChange={handleInputChange} className="w-full p-4 bg-[#F5F7FA] border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                  </div>
                </fieldset>
              </div>
            )}

            {/* Step 3: Location */}
            {step === 3 && (
              <div className="p-8 md:p-12 space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                  <div className="flex items-center gap-3">
                    <MapPin className="text-teal-600" size={28} />
                    <h2 className="text-2xl font-bold text-slate-800">{t('audit.wizard.step3')}</h2>
                  </div>
                  <button className={actionStyles.secondary} type="button" onClick={() => window.print()}>
                    <Printer className="w-4 h-4" /> {t('audit.wizard.printPlan')}
                  </button>
                </div>
                
                <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }} className="space-y-8 no-print">
                <div>
                  <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Location</span>
                       <span className="text-xs font-medium text-slate-400">(稽核地點)</span>
                  </label>
                  <input type="text" name="location" value={formData.location} onChange={handleInputChange} className="w-full md:w-1/2 p-4 bg-[#F5F7FA] border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                </div>
                <div>
                  <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Audit Criteria</span>
                       <span className="text-xs font-medium text-slate-400">(稽核準則)</span>
                  </label>
                  <input type="text" name="auditCriteria" value={formData.auditCriteria} onChange={handleInputChange} placeholder="例如: 專案合約、ISO 9001、施工規範..." className="w-full p-4 bg-[#F5F7FA] border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                </div>
                <div>
                  <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Audit Scope</span>
                       <span className="text-xs font-medium text-slate-400">(範圍描述)</span>
                  </label>
                  <textarea name="scopeDescription" value={formData.scopeDescription} onChange={handleInputChange} rows={5} className="w-full p-4 bg-[#F5F7FA] border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none resize-none transition-all text-slate-800 font-medium"></textarea>
                </div>
                </fieldset>

                {/* Print Only Summary for Steps 1-3 */}
                <div className="hidden print:block space-y-4">
                  <div className="text-center mb-6 border-b-2 border-slate-800 pb-3">
                    <h1 className="text-2xl font-bold text-slate-900 mb-1">Internal Quality Audit Plan</h1>
                    <h2 className="text-lg font-bold text-slate-700">內部稽核計畫書</h2>
                  </div>

                  <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm border border-slate-300 p-5 rounded-lg">
                    {/* Step 1 Info */}
                    <div className="col-span-1 border-b border-slate-100 pb-2">
                      <span className="font-bold text-slate-500 block mb-0.5 text-xs">Audit No. (稽核編號)</span>
                      <p className="font-semibold text-slate-800 text-sm">{auditNo || 'TBD'}</p>
                    </div>
                    <div className="col-span-1 border-b border-slate-100 pb-2">
                      <span className="font-bold text-slate-500 block mb-0.5 text-xs">Project Name (專案名稱)</span>
                      <p className="font-semibold text-slate-800 text-sm">{formData.projectName || 'TBD'}</p>
                    </div>
                    
                    <div className="col-span-1 border-b border-slate-100 pb-2">
                      <span className="font-bold text-slate-500 block mb-0.5 text-xs">Contractor (受稽核單位)</span>
                      <p className="font-semibold text-slate-800 text-sm">{formData.contractor || 'TBD'}</p>
                    </div>
                    <div className="col-span-1 border-b border-slate-100 pb-2">
                      <span className="font-bold text-slate-500 block mb-0.5 text-xs">Audit Date (稽核日期)</span>
                      <p className="font-semibold text-slate-800 text-sm">{formData.auditStartDate} {formData.auditEndDate ? `~ ${formData.auditEndDate}` : ''}</p>
                    </div>

                    {/* Step 2 Info */}
                    <div className="col-span-1 border-b border-slate-100 pb-2">
                      <span className="font-bold text-slate-500 block mb-0.5 text-xs">Project Director (專案主管)</span>
                      <p className="font-semibold text-slate-800 text-sm">{formData.projectDirector || '-'}</p>
                    </div>
                    <div className="col-span-1 border-b border-slate-100 pb-2">
                      <span className="font-bold text-slate-500 block mb-0.5 text-xs">Tech. Lead (技術負責人)</span>
                      <p className="font-semibold text-slate-800 text-sm">{formData.techLead || '-'}</p>
                    </div>
                    <div className="col-span-1 border-b border-slate-100 pb-2">
                      <span className="font-bold text-slate-500 block mb-0.5 text-xs">Lead Auditor (主稽核員)</span>
                      <p className="font-semibold text-slate-800 text-sm">{formData.leadAuditor || '-'}</p>
                    </div>
                    <div className="col-span-1 border-b border-slate-100 pb-2">
                      <span className="font-bold text-slate-500 block mb-0.5 text-xs">Support Auditor (協同稽核員)</span>
                      <p className="font-semibold text-slate-800 text-sm">{formData.supportAuditors || '-'}</p>
                    </div>

                    {/* Step 3 Info */}
                    <div className="col-span-1 border-b border-slate-100 pb-2">
                      <span className="font-bold text-slate-500 block mb-0.5 text-xs">Location (稽核地點)</span>
                      <p className="font-semibold text-slate-800 text-sm">{formData.location || '-'}</p>
                    </div>
                    <div className="col-span-1 border-b border-slate-100 pb-2">
                      <span className="font-bold text-slate-500 block mb-0.5 text-xs">Audit Criteria (稽核準則)</span>
                      <p className="font-semibold text-slate-800 text-sm">{formData.auditCriteria || '-'}</p>
                    </div>
                    <div className="col-span-2 pt-1">
                      <span className="font-bold text-slate-500 block mb-0.5 text-xs">Audit Scope (範圍描述)</span>
                      <p className="font-semibold text-slate-800 text-sm whitespace-pre-wrap">{formData.scopeDescription || '-'}</p>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* Step 4: Checklist Configuration */}
            {step === 4 && (
              <div className="p-8 md:p-12 space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                  <div className="flex items-center gap-3">
                    <CheckSquare className="text-teal-600" size={28} />
                    <h2 className="text-2xl font-bold text-slate-800">{t('audit.wizard.step4')} Checklist</h2>
                  </div>
                  <button className={actionStyles.secondary} type="button" onClick={() => window.print()}>
                    <Printer className="w-4 h-4" /> {t('audit.wizard.printChecklist')}
                  </button>
                </div>

                {/* Template Selection */}
                <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }} className="no-print">
                  <label className="flex items-baseline gap-2 mb-3">
                       <span className="text-sm font-bold text-slate-800">Template Selection</span>
                       <span className="text-xs font-medium text-slate-400">(選用標準模板)</span>
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {['ISO 9001:2015', 'ISO 45001', '品質管理程序書', '供應商評鑑表'].map((template) => (
                      <button
                        key={template} type="button"
                        onClick={() => {
                          const exists = formData.selectedTemplates.includes(template);
                          setFormData((prev: any) => ({
                            ...prev,
                            selectedTemplates: exists ? prev.selectedTemplates.filter((t: string) => t !== template) : [...prev.selectedTemplates, template]
                          }));
                        }}
                        className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all border ${
                          formData.selectedTemplates.includes(template) ? 'bg-teal-600 border-teal-600 text-white shadow-md' : 'bg-transparent border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {template}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {/* Custom Checklist Items */}
                <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }} className="space-y-4">
                  <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Custom Audit Items</span>
                       <span className="text-xs font-medium text-slate-400">(自定義查檢項目)</span>
                  </label>
                  
                  {/* Add Input Form */}
                  <div className="p-5 border border-slate-200 rounded-2xl flex flex-col gap-3 no-print">
                    <div className="flex items-start gap-3">
                      {isCustomNew ? (
                        <div className="flex gap-2 w-1/3 shrink-0">
                          <input type="text" name="no" value={newItem.no} onChange={handleNewItemChange} placeholder="自訂編號 (例: 4.1)" className="w-full p-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all text-sm font-medium text-slate-800" />
                          <button type="button" onClick={() => {setIsCustomNew(false); setNewItem({no:'', clause:'', task:''})}} className="text-slate-400 hover:text-red-500 p-2 shrink-0"><X size={18} /></button>
                        </div>
                      ) : (
                        <select name="no" value={newItem.no || ''} onChange={handleNewClauseSelect} className="w-1/3 shrink-0 p-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all text-sm text-slate-800 font-bold appearance-none">
                          <option value="" disabled>{t('audit.wizard.selectISOClause')}</option>
                          {ISO_CLAUSES.map(c => <option key={c.no} value={c.no}>{c.no} - {c.clause}</option>)}
                          <option value="custom">✎ {t('audit.wizard.customClause')}</option>
                        </select>
                      )}
                      <input type="text" name="clause" value={newItem.clause} onChange={handleNewItemChange} placeholder="ISO 9001:2015 Clause 內容..." className="flex-1 p-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all text-sm font-medium text-slate-800" />
                    </div>
                    <div className="flex gap-2">
                      <input type="text" name="task" value={newItem.task} onChange={handleNewItemChange} onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomItem())} placeholder="輸入稽核查檢重點 (Audit Question)..." className="flex-1 p-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all text-sm font-medium text-slate-800" />
                      <button className={actionStyles.icon} type="button" onClick={addCustomItem}><Plus size={20} /></button>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="space-y-3 mt-4 h-[300px] overflow-y-auto pr-2 custom-scrollbar border border-slate-100 rounded-xl p-2 print-expand">
                    {formData.customCheckItems.map((item: any, index: number) => (
                      <div key={item.id} className="flex items-start gap-4 p-4 bg-white border border-slate-200 rounded-xl group hover:border-teal-300 transition-all shadow-sm">
                        <span className="bg-slate-100 text-slate-500 text-xs w-6 h-6 flex items-center justify-center rounded-full font-bold shrink-0 mt-0.5">{index + 1}</span>
                        {editingItemId === item.id ? (
                          <div className="flex-1 flex flex-col gap-3">
                            <div className="flex items-start gap-3">
                              {isCustomEdit ? (
                                <div className="flex gap-2 w-1/3 shrink-0">
                                  <input type="text" name="no" value={editFormData.no} onChange={handleEditChange} placeholder="自訂編號" className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none focus:border-teal-500 text-sm" />
                                  <button type="button" onClick={() => {setIsCustomEdit(false); setEditFormData({no:'', clause:'', task:''})}} className="text-slate-400 hover:text-red-500 p-2 shrink-0"><X size={18} /></button>
                                </div>
                              ) : (
                                <select name="no" value={editFormData.no || ''} onChange={handleEditClauseSelect} className="w-1/3 shrink-0 p-2 bg-white border border-slate-300 rounded-lg outline-none focus:border-teal-500 text-sm font-bold text-slate-700">
                                  <option value="" disabled>{t('audit.wizard.selectISOClause')}</option>
                                  {ISO_CLAUSES.map(c => <option key={c.no} value={c.no}>{c.no} - {c.clause}</option>)}
                                  <option value="custom">✎ {t('audit.wizard.customClause')}</option>
                                </select>
                              )}
                              <input type="text" name="clause" value={editFormData.clause} onChange={handleEditChange} onKeyPress={(e) => { if (e.key === 'Enter') e.preventDefault(); }} placeholder="ISO 9001:2015 Clause 內容..." className="flex-1 p-2 bg-white border border-slate-300 rounded-lg outline-none focus:border-teal-500 text-sm" />
                            </div>
                            <input type="text" name="task" value={editFormData.task} onChange={handleEditChange} onKeyPress={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } }} placeholder="輸入稽核查檢重點 (Audit Question)..." className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none focus:border-teal-500 text-sm" />
                            <div className="flex justify-end gap-2 mt-1">
                              <button className={actionStyles.secondary} type="button" onClick={cancelEdit}><X size={16} /> {t('common.cancel')}</button>
                              <button className={actionStyles.primary} type="button" onClick={saveEdit}><Check size={16} /> {t('common.save')}</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1 flex flex-col gap-3">
                              <div className="flex items-start gap-4">
                                <div className="w-1/3 shrink-0">
                                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-1">條文編號 Clause No.</span>
                                  <p className="text-sm font-semibold text-teal-700 bg-teal-50 inline-block px-2 py-1 rounded">{item.no || '-'}</p>
                                </div>
                                <div className="flex-1">
                                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Clause Description</span>
                                  <p className="text-sm text-slate-600 mt-1">{item.clause || '-'}</p>
                                </div>
                              </div>
                              <div className="pt-2 border-t border-slate-100">
                                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Audit Question</span>
                                <p className="text-sm font-medium text-slate-800">{item.task}</p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                              <button className={actionStyles.icon} type="button" onClick={() => startEdit(item)}><Edit2 size={18} /></button>
                              <button className={actionStyles.iconDanger} type="button" onClick={() => removeCustomItem(item.id)}><Trash2 size={18} /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    {formData.customCheckItems.length === 0 && (
                      <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">{t('audit.wizard.noCustomItems')}</div>
                    )}
                  </div>
                </fieldset>
              </div>
            )}

            {/* Step 5: Execution & Evaluation */}
            {step === 5 && (
              <div className="p-8 md:p-12 space-y-6 animate-in fade-in slide-in-from-bottom-4 bg-slate-50 min-h-[500px]">
                
                {/* Header Section */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck className="w-8 h-8 text-indigo-600" />
                      <h1 className="text-2xl font-bold text-slate-800">{t('audit.wizard.executionTitle')}</h1>
                    </div>
                    <p className="text-slate-500">{formData.projectName ? `${formData.projectName} - ${t('audit.wizard.regularAudit')}` : t('audit.wizard.configureFirst')}</p>
                  </div>
                  
                  <div className="flex items-center gap-3 no-print">
                    <button className={actionStyles.secondary} type="button" onClick={() => window.print()}>
                      <Printer className="w-4 h-4" /> {t('audit.wizard.printReport')}
                    </button>
                  </div>
                </header>

                {/* Statistics Cards */}
                <div className="grid grid-cols-4 gap-4 overflow-x-auto min-w-full pb-2">
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 min-w-[140px]">
                    <p className="text-slate-500 text-sm mb-1 whitespace-nowrap">{t('audit.wizard.statTotal')}</p>
                    <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3">
                      <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 min-w-[140px]">
                    <p className="text-slate-500 text-sm mb-1 whitespace-nowrap">{t('audit.wizard.statProgress')}</p>
                    <div className="flex items-end justify-between">
                      <p className="text-2xl font-bold text-slate-800">{stats.progress}%</p>
                      <p className="text-xs text-slate-400 mb-1 whitespace-nowrap ml-2">{t('audit.wizard.statCompleted')} {stats.total - stats.pending}</p>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3">
                      <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${stats.progress}%` }}></div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 min-w-[140px]">
                    <p className="text-slate-500 text-sm mb-1 whitespace-nowrap">{t('audit.wizard.statPass')}</p>
                    <p className="text-2xl font-bold text-green-600">{stats.passed}</p>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3">
                      <div className="bg-green-500 h-1.5 rounded-full" style={{ width: stats.total ? `${(stats.passed / stats.total) * 100}%` : '0%' }}></div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 min-w-[140px]">
                    <p className="text-slate-500 text-sm mb-1 whitespace-nowrap">{t('audit.wizard.statFail')}</p>
                    <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3">
                      <div className="bg-red-500 h-1.5 rounded-full" style={{ width: stats.total ? `${(stats.failed / stats.total) * 100}%` : '0%' }}></div>
                    </div>
                  </div>
                </div>

                {/* Filters & Search */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 no-print">
                  <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto">
                      {categories.map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setActiveCategory(cat)}
                          className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-all ${
                            activeCategory === cat 
                            ? 'bg-indigo-100 text-indigo-700 font-semibold border border-indigo-200' 
                            : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {cat === ALL_CATEGORY ? t('audit.wizard.allCategories') : cat === UNCATEGORIZED ? t('audit.wizard.uncategorized') : cat}
                        </button>
                      ))}
                    </div>
                    <div className="relative w-full md:w-72">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder={t('audit.wizard.searchPlaceholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        // The only text input on step 5, inside the form that has the submit button:
                        // Enter would otherwise submit (save and close) the whole audit.
                        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-slate-50"
                      />
                    </div>
                  </div>
                </div>

                {/* Checklist Content */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                  <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }} className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-32">{t('audit.wizard.colCategory')}</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('audit.wizard.colContent')}</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-40 text-center">{t('audit.wizard.colStatus')}</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('audit.wizard.colRemarks')}</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-28 text-right">{t('audit.wizard.colUpdated')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredItems.map((item: any) => (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <span className="text-xs font-medium px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md">
                                {item.no || t('audit.wizard.notSet')}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-800 mb-0.5">{item.clause || '-'}</span>
                                <span className="text-xs text-slate-500 leading-relaxed">{item.task || '-'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex justify-center">
                                <div className="flex bg-slate-100 p-1 rounded-lg gap-1 border border-slate-200">
                                  <button 
                                    type="button"
                                    onClick={() => updateItemStatus(item.id, 'pass')}
                                    className={`p-1.5 rounded transition-all ${item.status === 'pass' ? 'bg-white shadow-sm text-green-600' : 'text-slate-400 hover:text-slate-600'}`}
                                    title="符合 (Pass)"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={() => updateItemStatus(item.id, 'pending')}
                                    className={`p-1.5 rounded transition-all ${(!item.status || item.status === 'pending') ? 'bg-white shadow-sm text-amber-500' : 'text-slate-400 hover:text-slate-600'}`}
                                    title="注意/待改善 (!)"
                                  >
                                    <AlertCircle className="w-4 h-4" />
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={() => updateItemStatus(item.id, 'fail')}
                                    className={`p-1.5 rounded transition-all ${item.status === 'fail' ? 'bg-white shadow-sm text-red-600' : 'text-slate-400 hover:text-slate-600'}`}
                                    title="不符合 (X)"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2 group">
                                <textarea 
                                  value={item.note || ''}
                                  onChange={(e) => updateItemNote(item.id, e.target.value)}
                                  placeholder={t('common.clickToEnter') || 'Click to enter...'}
                                  rows={2}
                                  className="w-full text-sm bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 focus:outline-none p-2 rounded-lg transition-all text-slate-700 resize-y min-h-[40px]"
                                />
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-[10px] font-mono text-slate-400 uppercase">
                                {item.updatedAt || '-'}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {filteredItems.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-6 py-20 text-center">
                              <div className="flex flex-col items-center justify-center text-slate-400">
                                <Search className="w-12 h-12 mb-3 opacity-20" />
                                <p className="text-sm font-medium">{t('audit.wizard.noResults')}</p>
                                <button
                                  type="button"
                                  onClick={() => {setSearchTerm(''); setActiveCategory(ALL_CATEGORY);}}
                                  className="mt-2 text-indigo-500 text-xs hover:underline"
                                >
                                  {t('audit.wizard.resetFilter')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </fieldset>

                  <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-xs text-slate-500">{t('audit.wizard.legendPass')}: {stats.passed}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                        <span className="text-xs text-slate-500">{t('audit.wizard.legendWarning')}: {stats.pending}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                        <span className="text-xs text-slate-500">{t('audit.wizard.legendFail')}: {stats.failed}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 font-medium italic">
                      * {t('audit.wizard.autoTimestamp')}
                    </p>
                  </div>
                </div>

                {/* Findings / Summary */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mt-6">
                  <label className="flex items-baseline gap-2 mb-3">
                    <span className="text-sm font-bold text-slate-800">{t('audit.findings') || 'Findings / Summary'}</span>
                    <span className="text-xs font-medium text-slate-400">(稽核發現與總結)</span>
                  </label>
                  <textarea
                    name="findings"
                    value={formData.findings}
                    onChange={handleInputChange}
                    rows={5}
                    disabled={readOnly}
                    className="w-full p-4 bg-[#F5F7FA] border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium resize-y"
                    placeholder={t('audit.findingsPlaceholder') || 'Enter audit findings and summary...'}
                  />
                </div>
              </div>
            )}

            {/* Footer Navigation */}
                      <FormActions tools={<>{step > 1 && (
                          <button className={actionStyles.secondary}
                              type="button" onClick={prevStep}
                          >
                              <ChevronLeft size={20} /> {t('audit.wizard.prevStep')}
                          </button>
                      )}</>} secondary={<>{/* 儲存進度按鈕 (Ghost Style) — hidden entirely once Closed:
                    a true dead end (WorkflowEngine "Closed": []), so there's
                    nothing left to save, matching the backend's unconditional
                    lock in audit_service.py. */}
                          {!readOnly && (
                              <button className={actionStyles.secondary}
                                  type="button"
                                  onClick={handleSaveDraft}
                                  disabled={isDraftSaving || loading}
                              >
                                  <Save size={18} /> {isDraftSaving ? t('audit.wizard.savingDraft') : t('audit.wizard.saveDraft')}
                              </button>
                          )}
                          {draftMessage && (
                              <span className="text-sm font-medium text-slate-500 animate-in fade-in hidden sm:block whitespace-nowrap absolute right-8 bottom-24">
                                  {draftMessage}
                              </span>
                          )}</>} primary={<>{step < 5 ? (
                              <button className={actionStyles.primary} key="btn-next" type="button" onClick={(e) => { e.preventDefault(); nextStep(); }}>
                                  {t('audit.wizard.nextStep')} <ChevronRight size={20} />
                              </button>
                          ) : !readOnly ? (
                              <button className={actionStyles.primary}
                                  key="btn-submit"
                                  type="submit"
                                  disabled={isSaving || loading}
                              >
                                  {isSaving ? t('audit.wizard.submitting') : t('audit.wizard.submit')} <CheckCircle size={20} />
                              </button>
                          ) : null}</>} />
          </form>
        </div>
      </div>
    </div>
  );
};

export default AuditWizard;
