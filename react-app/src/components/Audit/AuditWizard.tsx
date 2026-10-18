import { useDraftGuard, useItemDraftGuard } from '../Shared/LeaveGuard';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  MapPin, ClipboardList, CheckCircle, ChevronRight, ChevronLeft,
  Save, FileText, Users, CheckSquare, Plus, Trash2, Edit2, Check, X,
  Search, ShieldCheck, Printer, CalendarDays, Lock, ListChecks
} from 'lucide-react';
import { useAuditStore, AuditItem, AuditAgendaEntry } from '../../store/auditStore';
import { useAuditTemplateStore, AuditTemplate } from '../../store/auditTemplateStore';
import AuditTemplatePicker from './AuditTemplatePicker';
import AutoGrowTextarea from './AutoGrowTextarea';
import { useContractorsStore } from '../../store/contractorsStore';
import { useProjectStore } from '../../store/projectStore';
import { useLanguage } from '../../context/LanguageContext';
import { showRefusal } from '../../store/refusalStore';
import { useRecordVersion } from '../../hooks/useRecordVersion';
import { checkDateOrder } from '../../utils/dateValidation';
import { exportAuditDocx } from '../../services/api';
import AuditPrintTemplate, { AuditPrintKind, AuditPrintData, auditProgress } from './AuditPrintTemplate';
import AuditAgendaEditor, { agendaRowTimeInvalid, isBlankAgendaRow, sortAgenda } from './AuditAgendaEditor';
import './Audit.print.css';

// Today as YYYY-MM-DD in the browser's time zone (toISOString() is UTC: the previous day before 08:00 in Taiwan).
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Enter that is NOT confirming an IME candidate (Zhuyin / Pinyin). Chrome reports the confirming keydown with
// isComposing = true; Safari fires compositionend first and then a keydown with isComposing = false but keyCode 229,
// so both have to be checked (the old onKeyPress never fired for 229 — this keeps that behaviour).
const isPlainEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229;

// Wizard steps (label keys). Personnel and Scope & Location share one step (AUDIT-LAYOUT-2026-001): both are plan data,
// a handful of fields each.
// The Agenda (daily schedule, AUDIT-AGENDA-2026-001) sits between them and the checklist and carries "Print Audit Plan".
const WIZARD_STEPS = ['audit.wizard.step1', 'audit.wizard.stepPersonnelScope', 'audit.wizard.stepAgenda', 'audit.wizard.step4', 'audit.wizard.step5'];
const LAST_STEP = WIZARD_STEPS.length;

// Steps with a document (AUDIT-BUTTONS-2026-001): which printout / Word kind, and the print button label.
const STEP_DOCUMENTS: Record<number, { kind: AuditPrintKind; printLabel: string }> = {
  3: { kind: 'plan', printLabel: 'audit.wizard.printPlan' },
  4: { kind: 'checklist', printLabel: 'audit.wizard.printChecklist' },
  5: { kind: 'report', printLabel: 'audit.wizard.printReport' },
};
// Same file names as the backend (_DOCX_KINDS suffixes).
const DOCX_SUFFIX: Record<AuditPrintKind, string> = { report: '', plan: '-Plan', checklist: '-Checklist' };

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
// Checklist results (AUDIT-GRADES-2026-001, user's choice 2026-10-11): 符合 Pass, 正面發現 Positive, 主要不符合 Major,
// 次要不符合 Minor. An older audit's 'fail' still counts as graded (shown as 不符合（未分級）) until the auditor regrades it.
const GRADE_BUTTONS = [
  { value: 'pass', label: 'audit.grades.passShort', title: '符合 (Pass)', active: 'text-green-600' },
  { value: 'positive', label: 'audit.grades.positiveShort', title: '正面發現 (Positive)', active: 'text-sky-600' },
  { value: 'major', label: 'audit.grades.majorShort', title: '主要不符合 (Major)', active: 'text-red-600' },
  { value: 'minor', label: 'audit.grades.minorShort', title: '次要不符合 (Minor)', active: 'text-amber-600' },
];
const GRADED_STATUSES = new Set(['pass', 'positive', 'major', 'minor', 'fail']);
const AUDIT_STATUS_LABELS: Record<string, string> = {
  'Draft': '✏️ Draft（草稿）',
  'Planned': '📅 Planned（計畫中）',
  'In Progress': '👣 In Progress（進行中）',
  'Completed': '✅ Completed（已完成）',
  'Closed': '🔒 Closed（已關閉）',
  'Void': '⛔ Void（作廢）',
};


interface AuditWizardProps {
  existingItem?: AuditItem;
  readOnly?: boolean;
  // audit:update:all. Without it a user can create an audit (one save) but every later save is
  // refused by the backend, so the wizard turns read-only right after the first create.
  canUpdate?: boolean;
  onClose: () => void;
  onSaveSuccess: () => void;
  /** Reopens the audit (by id: one this wizard created has no id on the page) with what is saved now: offered by the refusal
   *  dialog after a 409 VERSION_CONFLICT (OPTIMISTIC-LOCK-2026-001). */
  onReloadRecord?: (id: string) => void;
}

export const AuditWizard: React.FC<AuditWizardProps> = ({ existingItem, readOnly: readOnlyProp = false, canUpdate = true, onClose, onSaveSuccess, onReloadRecord }) => {
  const { t } = useLanguage();
  const { addAudit, updateAudit, loading } = useAuditStore();
  // The version this wizard saves against (OPTIMISTIC-LOCK-2026-001): the record's, once, when the wizard opens; moved on by every
  // save that went through — "Save draft" keeps the wizard open and may be pressed again.
  const recordVersion = useRecordVersion(existingItem?.row_version);
  // Same source as the Audit page: the shared contractor picker list (status already normalised).
  const contractorOptions = useContractorsStore(state => state.options);
  const activeContractors = useMemo(() => contractorOptions.filter(c => c.status === 'active'), [contractorOptions]);
  const { projectList, fetchProjects, currentProject } = useProjectStore();
  React.useEffect(() => { fetchProjects(); }, [fetchProjects]);
  // The audit template library (AUDIT-TEMPLATES-2026-001), every template incl. inactive ones (see templateChips).
  const { templates: libraryTemplates, loaded: templatesLoaded, error: templatesError, fetchTemplates } = useAuditTemplateStore();
  React.useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const [isSaving, setIsSaving] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const [exportingDocx, setExportingDocx] = useState(false);
  // The form a Save Draft re-ordered the agenda into (see handleSaveDraft); null when there is nothing to confirm.
  const [agendaResyncTarget, setAgendaResyncTarget] = useState<typeof formData | null>(null);
  // The three print buttons render a formal printout (AuditPrintTemplate) into <body> and print that, instead of the
  // wizard itself (AUDIT-PRINT-2026-001); cleared again after the print dialog closes. `n` makes every click a new job, so
  // a button still works if a browser never fired afterprint for the previous one.
  const [printJob, setPrintJob] = useState<{ kind: AuditPrintKind; n: number } | null>(null);
  const requestPrint = (kind: AuditPrintKind) => setPrintJob(prev => ({ kind, n: (prev?.n ?? 0) + 1 }));
  React.useEffect(() => {
    if (!printJob) return;
    const timer = setTimeout(() => window.print(), 200);
    const onAfterPrint = () => setPrintJob(null);
    window.addEventListener('afterprint', onAfterPrint);
    return () => { clearTimeout(timer); window.removeEventListener('afterprint', onAfterPrint); };
  }, [printJob]);

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    auditTitle: existingItem?.title || '',
    // A new audit is created in the project currently selected in the header (REF-PROJECT-SEQ-2026-001 B2, D3); the
    // field is read-only. Under "All projects" it is blank and the server refuses the create (the page's "new" button
    // is disabled there).
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
    // only object rows (a hand-edited database value must not crash the wizard), each with its own id for the editor
    agenda: (Array.isArray(existingItem?.agenda) ? existingItem.agenda : [])
      .filter((row): row is AuditAgendaEntry => !!row && typeof row === 'object' && !Array.isArray(row))
      .map((row, i, rows) => (row.id === null || row.id === undefined || rows.findIndex(r => r.id === row.id) !== i
        ? { ...row, id: `loaded-${i}` } : row)),
    contractor: existingItem?.contractor || '',
    vendorId: existingItem?.vendor_id || '',
    status: existingItem?.status || 'Draft',
  });
  // Active contractors, plus the record's own contractor when it has since been deactivated
  // (otherwise an existing audit showed an empty picker).
  const pickerContractors = useMemo(() => {
    if (!formData.vendorId || activeContractors.some(c => c.id === formData.vendorId)) return activeContractors;
    const own = contractorOptions.find(c => c.id === formData.vendorId)
      || { id: formData.vendorId, name: formData.contractor || formData.vendorId };
    return [...activeContractors, own];
  }, [activeContractors, contractorOptions, formData.vendorId, formData.contractor]);
  // Server-assigned and never edited, so kept out of formData (and out of the leave guard): after
  // the first Save Draft of a new record it is filled in from the create response.
  const [auditNo, setAuditNo] = useState(existingItem?.auditNo || '');
  // Status of the last successful save (undefined = not saved yet). Drives the status options and
  // the lock, so a record saved as Void mid-session locks without reopening the wizard.
  const [savedStatus, setSavedStatus] = useState<string | undefined>(existingItem?.status);
  const statusOptions = savedStatus === undefined
    ? AUDIT_CREATE_STATUSES
    : [savedStatus, ...(AUDIT_STATUS_TRANSITIONS[savedStatus] || [])];
  // A legacy record may have only a project name (no project_id): show the project that name
  // matches, and save that link the next time the record is saved.
  const selectedProjectId = formData.projectId
    || projectList.find(p => p.name === formData.projectName)?.id
    || '';
  // "[code] name", or the legacy name when no project is linked — the picker label, the print and the Word export.
  const selectedProjectLabel = (() => {
    const project = projectList.find(p => p.id === selectedProjectId);
    return project ? (project.code ? `[${project.code}] ${project.name}` : project.name) : formData.projectName;
  })();

  const BLANK_NEW_ITEM = { no: '', clause: '', task: '', templateId: undefined as number | undefined, templateItemId: undefined as string | undefined };
  const [newItem, setNewItem] = useState(BLANK_NEW_ITEM);
  // the add form (user's design 2026-10-11), four rows: clause dropdown = '' | 'custom' | `${templateId}::${clauseNo}`;
  // question dropdown = 'all' (every question of that clause) or one templateItemId; then clause text and question
  const [newClause, setNewClause] = useState('');
  const [newQ, setNewQ] = useState('all');
  const [isCustomNew, setIsCustomNew] = useState(false);
  // Audit.tsx never promotes its own currentAuditId after a mid-session "Save Draft" (Save
  // Draft deliberately keeps the wizard open without calling onSaveSuccess, so the parent
  // never learns the new id) — existingItem stays undefined for the rest of this wizard's
  // life even after the first successful create. Without tracking the id locally, EVERY
  // subsequent Save Draft click on a still-open new record would call addAudit() again,
  // creating another duplicate record each time (reproduced: two Save Draft clicks with an
  // Add in between produced two separate audit rows, the second one holding the added item
  // and the first one permanently stuck with an empty custom_check_items).
  const [createdId, setCreatedId] = useState<string | null>(null);
  // The id is fixed when the wizard opens: existingItem is re-looked-up from the list on every
  // parent render, so a list re-fetch that (briefly) lacks this record would otherwise turn the
  // next save into a create of a duplicate.
  const [openedId] = useState<string | null>(existingItem?.id ?? null);
  const recordId = openedId ?? createdId;
  // the reload for the refusal dialog: this audit, once it has an id (also one created by this wizard — B2 review R1 P3-5)
  const reloadThis = () => (recordId && onReloadRecord ? () => onReloadRecord(recordId) : undefined);
  const createdWithoutUpdate = createdId !== null && !canUpdate;
  const readOnly = readOnlyProp || createdWithoutUpdate
    || (savedStatus !== undefined && AUDIT_LOCKED_STATUSES.has(savedStatus));
  // Why the wizard is read-only, shown as a banner under the step bar (AUDIT-BTNFIX-2026-001): the controls are disabled
  // either way, but without it a locked audit looked editable and clicks just did nothing.
  const readOnlyReason = savedStatus === 'Closed' ? 'audit.wizard.readOnlyClosed'
    : savedStatus === 'Void' ? 'audit.wizard.readOnlyVoid'
    : createdWithoutUpdate ? 'audit.wizard.createdNoUpdateNotice'
    : readOnlyProp ? 'audit.wizard.readOnlyNoPermission'
    : null;
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState({ no: '', clause: '', task: '' });
  const leaveGuard = useDraftGuard(formData, isSaving || isDraftSaving, !readOnly);
  // After a Save Draft re-ordered the agenda on screen (handleSaveDraft), that re-ordered form is the saved state — but
  // only if it is still the form on screen: an edit made while the save was in flight kept the old form (and is unsaved).
  React.useEffect(() => {
    if (!agendaResyncTarget) return;
    if (formData === agendaResyncTarget) leaveGuard.markSaved();
    setAgendaResyncTarget(null);
  }, [agendaResyncTarget, formData, leaveGuard]);
  useDraftGuard(newItem, false, !readOnly);
  useItemDraftGuard(editingItemId !== null ? editFormData : null);
  const requestClose = () => leaveGuard.requestClose(onClose, true);

  const startEdit = (item: any) => {
    setEditingItemId(item.id);
    setEditFormData({ no: item.no, clause: item.clause, task: item.task });
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
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

  // Step 4 template chips (AUDIT-TEMPLATES-2026-001). A library template counts as selected when its name is in
  // selected_templates (what the audit records and prints) or the audit holds questions copied from it (by templateId —
  // so a template renamed since is still recognised; R2 review). Shown: the library's active templates, a deactivated one
  // this audit still uses, and a selected name the library no longer has (an audit from before the library, or the old
  // name of a renamed template) — that last kind can only be unselected, which removes just the name.
  const templateChips = useMemo(() => {
    const usedIds = new Set(formData.customCheckItems.map((i: any) => i?.templateId).filter((id: any) => id !== undefined && id !== null));
    const chips: { key: string; name: string; template: AuditTemplate | null; selected: boolean }[] = [];
    for (const tpl of libraryTemplates) {
      const selected = formData.selectedTemplates.includes(tpl.name) || usedIds.has(tpl.id);
      if (tpl.is_active || selected) chips.push({ key: `t-${tpl.id}`, name: tpl.name, template: tpl, selected });
    }
    for (const name of formData.selectedTemplates) {
      if (!libraryTemplates.some(tpl => tpl.name === name)) chips.push({ key: `n-${name}`, name, template: null, selected: true });
    }
    return chips;
  }, [libraryTemplates, formData.selectedTemplates, formData.customCheckItems]);
  const templateNames = useMemo(() => new Map(libraryTemplates.map(tpl => [tpl.id, tpl.name])), [libraryTemplates]);
  const [pickerTemplate, setPickerTemplate] = useState<AuditTemplate | null>(null);

  // A copied question counts as filled once it has a result (one of the four grades, or an older 'fail') or a note: those are never removed.
  const isFilledItem = (item: any) => GRADED_STATUSES.has(item?.status) || !!String(item?.note ?? '').trim();

  // Clicking a chip ticks / unticks an audit type (user's design 2026-10-11): ticking only records the name — its questions
  // become available in the add form's dropdown and the batch picker; unticking removes the unfilled questions that came
  // from it (deselectTemplate). A name the library no longer has can only be unticked, which removes just the name.
  const handleTemplateChip = (chip: typeof templateChips[number]) => {
    const tpl = chip.template;
    if (!tpl) {
      setFormData(prev => ({ ...prev, selectedTemplates: prev.selectedTemplates.filter((n: string) => n !== chip.name) }));
      return;
    }
    if (chip.selected) { deselectTemplate(tpl); return; }
    setFormData(prev => ({ ...prev, selectedTemplates: prev.selectedTemplates.includes(tpl.name) ? prev.selectedTemplates : [...prev.selectedTemplates, tpl.name] }));
    if (!(tpl.items || []).length) toast.info(t('audit.templates.nothingToAdd', { name: tpl.name }));
  };
  const selectedTypes = templateChips.filter(c => c.selected && c.template && (c.template.items || []).length).map(c => c.template as AuditTemplate);

  // The batch picker's result: copy the checked questions the audit does not have yet (each tagged templateId /
  // templateItemId), remove the unchecked ones it has — only unfilled ones (filled ones are locked in the picker, and are
  // kept here as well).
  const applyTemplatePick = (tpl: AuditTemplate, checked: Set<string>) => {
    const items: any[] = formData.customCheckItems;
    const present = new Set(items.filter(i => i?.templateId === tpl.id).map(i => String(i.templateItemId)));
    const adds = (tpl.items || []).filter(it => it.id && checked.has(it.id) && !present.has(it.id));
    // only questions the picker shows can be unticked: a copy of a question the template has since dropped (not in the
    // picker) always stays — editing a template never changes an audit (R2 review)
    const currentIds = new Set((tpl.items || []).map(it => String(it.id)));
    const removable = (i: any) => i?.templateId === tpl.id && currentIds.has(String(i.templateItemId)) && !checked.has(String(i.templateItemId)) && !isFilledItem(i);
    const removes = items.filter(removable).length;
    setFormData(prev => {
      let nextId = Math.max(Date.now(), ...prev.customCheckItems.map((i: any) => (typeof i?.id === 'number' ? i.id : 0))) + 1;
      const kept = prev.customCheckItems.filter((i: any) => !removable(i));
      const copies = adds.map(it => ({ id: nextId++, no: it.no || '', clause: it.clause || '', task: it.task || '', templateId: tpl.id, templateItemId: it.id }));
      const customCheckItems = [...kept, ...copies];
      // the batch picker is opened for a ticked audit type: the type stays ticked whatever was picked
      const names = prev.selectedTemplates.includes(tpl.name) ? prev.selectedTemplates : [...prev.selectedTemplates, tpl.name];
      return { ...prev, customCheckItems, selectedTemplates: names };
    });
    if (adds.length) toast.success(t('audit.templates.added', { n: adds.length, name: tpl.name }));
    if (removes) toast.info(t('audit.templates.removed', { n: removes, name: tpl.name }));
    setPickerTemplate(null);
  };

  // Unticking a type (or 「取消選用此模板」 in the picker): every unfilled copy goes; filled ones stay, with a notice. The
  // type's name leaves selected_templates only when nothing from it remains — so the chip, the printouts (which list the
  // names) and the questions left in the audit always agree.
  const deselectTemplate = (tpl: AuditTemplate) => {
    const copied = formData.customCheckItems.filter((i: any) => i?.templateId === tpl.id);
    const kept = copied.filter(isFilledItem).length;
    setFormData(prev => ({
      ...prev,
      selectedTemplates: kept ? prev.selectedTemplates : prev.selectedTemplates.filter((n: string) => n !== tpl.name),
      customCheckItems: prev.customCheckItems.filter((i: any) => i?.templateId !== tpl.id || isFilledItem(i)),
    }));
    if (newClause.startsWith(`${tpl.id}::`) || newItem.templateId === tpl.id) {   // the add form showed this type's clause (R2 review)
      setNewClause(''); setNewQ('all'); setNewItem(BLANK_NEW_ITEM);
    }
    if (copied.length > kept) toast.info(t('audit.templates.removed', { n: copied.length - kept, name: tpl.name }));
    if (kept) toast.warning(t('audit.templates.keptFilled', { n: kept, name: tpl.name }));
    setPickerTemplate(null);
  };

  // Results (AUDIT-GRADES-2026-001): the four grades and an older audit's 'fail' (不符合（未分級）) are graded; anything
  // else (no status, the old 'pending') is not graded. Progress = graded / total, as in the printouts and the Word export.
  const stats = useMemo(() => {
    // only object items count, the same filter as the printouts and the Word export (R1 review)
    const items: any[] = formData.customCheckItems.filter((i: any) => !!i && typeof i === 'object' && !Array.isArray(i));
    const total = items.length;
    const count = (s: string) => items.filter(i => i?.status === s).length;
    const byGrade = { pass: count('pass'), positive: count('positive'), major: count('major'), minor: count('minor'), fail: count('fail') };
    const pending = total - Object.values(byGrade).reduce((a, b) => a + b, 0);
    const progress = auditProgress(total, pending);
    return { total, ...byGrade, pending, progress };
  }, [formData.customCheckItems]);

  const filteredItems = useMemo(() => {
    return formData.customCheckItems.filter((item: any) => {
      const query = searchTerm.trim().toLowerCase();
      const matchesSearch = !query || (item.clause || '').toLowerCase().includes(query) || (item.task || '').toLowerCase().includes(query);
      const matchesCategory = activeCategory === ALL_CATEGORY || (item.no || UNCATEGORIZED) === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [formData.customCheckItems, searchTerm, activeCategory]);

  // Clicking the grade an item already has clears it (back to not graded).
  const updateItemStatus = (id: number, newStatus: string) => {
    setFormData(prev => ({
      ...prev,
      customCheckItems: prev.customCheckItems.map((item: any) =>
        item.id === id ? { ...item, status: item.status === newStatus ? '' : newStatus, updatedAt: localToday() } : item
      )
    }));
  };

  const updateItemNote = (id: number, newNote: string) => {
    setFormData(prev => ({
      ...prev,
      customCheckItems: prev.customCheckItems.map((item: any) => 
        item.id === id ? { ...item, note: newNote, updatedAt: localToday() } : item
      )
    }));
  };

  // The add form lists the clauses of the audit types (templates) ticked above (number + title); the second dropdown picks
  // all of the clause's questions or one of them. One question fills the clause text and question (still editable) and
  // the new item is tagged templateId / templateItemId; "all" adds every question of the clause the audit does not have.
  const pickedClause = useMemo(() => {
    if (!newClause || newClause === 'custom') return null;
    const [tplId, no] = newClause.split('::');
    // only a clause of a type that is still ticked (R2 review: an unticked type's clause must not stay addable)
    const tpl = selectedTypes.find(x => String(x.id) === tplId);
    if (!tpl) return null;
    const items = (tpl.items || []).filter(it => it.id && (it.no || '') === no);
    const have = new Set(formData.customCheckItems.filter((i: any) => i?.templateId === tpl.id).map((i: any) => String(i.templateItemId)));
    return { tpl, no, items, have };
  }, [newClause, selectedTypes, formData.customCheckItems]);
  const handleClausePick = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setNewClause(val);
    setNewQ('all');
    setNewItem(BLANK_NEW_ITEM);
    if (val === 'custom') setIsCustomNew(true);
  };
  const handleQuestionPick = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setNewQ(val);
    const it = pickedClause?.items.find(x => x.id === val);
    setNewItem(it && pickedClause ? { no: it.no || '', clause: it.clause || '', task: it.task || '', templateId: pickedClause.tpl.id, templateItemId: it.id }
      : BLANK_NEW_ITEM);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Outside the state updater (StrictMode runs updaters twice, which showed the toast twice).
    if (name === 'auditStartDate' || name === 'auditEndDate') {
      const next = { ...formData, [name]: value };
      const check = checkDateOrder(next.auditStartDate, next.auditEndDate, t('audit.wizard.startDateLabel'), t('audit.wizard.endDateLabel'), t);
      if (!check.valid) toast.warning(check.message);
    }
  };

  const handleContractorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vendorId = e.target.value;
    const selectedVendor = pickerContractors.find(v => v.id === vendorId);
    setFormData(prev => ({
      ...prev,
      vendorId: vendorId,
      contractor: selectedVendor?.name || ''
    }));
  };

  const handleNewItemChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewItem(prev => ({ ...prev, [name]: value }));
  };

  const addCustomItem = () => {
    if (pickedClause && newQ === 'all') {
      const { tpl } = pickedClause;
      const adds = pickedClause.items.filter(it => !pickedClause.have.has(it.id as string));
      if (!adds.length) { toast.info(t('audit.templates.alreadyAdded')); return; }
      setFormData(prev => {
        let nextId = Math.max(Date.now(), ...prev.customCheckItems.map((i: any) => (typeof i?.id === 'number' ? i.id : 0))) + 1;
        const copies = adds.map(it => ({ id: nextId++, no: it.no || '', clause: it.clause || '', task: it.task || '', templateId: tpl.id, templateItemId: it.id }));
        const names = prev.selectedTemplates.includes(tpl.name) ? prev.selectedTemplates : [...prev.selectedTemplates, tpl.name];
        return { ...prev, customCheckItems: [...prev.customCheckItems, ...copies], selectedTemplates: names };
      });
      toast.success(t('audit.templates.added', { n: adds.length, name: tpl.name }));
      setNewClause(''); setNewQ('all'); setNewItem(BLANK_NEW_ITEM);
      return;
    }
    if (!newItem.task.trim()) return;
    if (newItem.templateItemId && formData.customCheckItems.some((i: any) => i?.templateId === newItem.templateId && i?.templateItemId === newItem.templateItemId)) {
      toast.info(t('audit.templates.alreadyAdded'));
      return;
    }
    // one above the largest id in use: copied template questions are numbered from Date.now() upwards, so a plain
    // Date.now() here could repeat one of them (R1 review)
    const { templateId, templateItemId, ...fields } = newItem;
    const itemToAdd = { id: Math.max(Date.now(), ...formData.customCheckItems.map((i: any) => (typeof i?.id === 'number' ? i.id : 0))) + 1, ...fields,
      ...(templateItemId ? { templateId, templateItemId } : {}) };
    const fromTpl = templateItemId ? libraryTemplates.find(x => x.id === templateId) : undefined;
    setFormData(prev => ({
      ...prev,
      customCheckItems: [...prev.customCheckItems, itemToAdd],
      selectedTemplates: fromTpl && !prev.selectedTemplates.includes(fromTpl.name) ? [...prev.selectedTemplates, fromTpl.name] : prev.selectedTemplates,
    }));
    setNewItem(BLANK_NEW_ITEM);
    setNewClause(''); setNewQ('all');
    setIsCustomNew(false);
  };

  const removeCustomItem = (id: number) => {
    setFormData(prev => ({
      ...prev,
      customCheckItems: prev.customCheckItems.filter((item: any) => item.id !== id)
    }));
  };

  const nextStep = () => setStep(prev => Math.min(prev + 1, LAST_STEP));
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
      // blank rows dropped, in time order — the order the backend stores (and checks a Closed resave against)
      agenda: sortAgenda(formData.agenda.filter(row => !isBlankAgendaRow(row))),
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
    if (formData.agenda.some(agendaRowTimeInvalid)) {
      toast.error(t('audit.agenda.timeOrder'));
      return true;
    }
    if (editingItemId !== null) {
      toast.error(t('audit.wizard.unconfirmedEditItem'));
      return true;
    }
    if (!hasUnconfirmedNewItem()) return false;
    toast.error(t('audit.wizard.unconfirmedNewItem'));
    return true;
  };

  const handleSaveDraft = async () => {
    if (readOnly) return;
    if (blockSaveForUnconfirmedNewItem()) return;
    setIsDraftSaving(true);
    setDraftMessage('');
    const formAtSave = formData;

    try {
      const updates = prepareAuditData(formData.status);
      if (recordId) {
        await updateAudit(recordId, updates, recordVersion.current());
        recordVersion.saved(useAuditStore.getState().auditList.find(a => a.id === recordId)?.row_version);
        setSavedStatus(updates.status);
      } else {
        const created = await addAudit(updates);
        recordVersion.saved(created.row_version);
        setCreatedId(created.id);
        setAuditNo(created.auditNo);
        setSavedStatus(created.status);
      }

      leaveGuard.markSaved();
      // Show the agenda as it was saved (time order, blank rows dropped) — only when nothing was edited meanwhile, and
      // then take that re-ordered form as the saved state once it has rendered.
      if (updates.agenda && JSON.stringify(updates.agenda) !== JSON.stringify(formAtSave.agenda)) {
        const resynced = { ...formAtSave, agenda: updates.agenda as AuditAgendaEntry[] };
        setFormData(prev => (prev === formAtSave ? resynced : prev));
        setAgendaResyncTarget(resynced);
      }
      const time = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setDraftMessage(`${t('audit.wizard.draftSaved')} ${time}`);
      setTimeout(() => setDraftMessage(''), 4000);
      // Don't call onSaveSuccess() here — draft save should keep the wizard open
    } catch (err) {
      // auditStore rethrows the axios error as is: the refusal dialog (REFUSAL-DIALOG-2026-002 D2) translates it; the wizard stays open
      console.error("草稿儲存失敗: ", err);
      showRefusal(err, 'save', { keepsInput: true, onReload: reloadThis() });
    } finally {
      setIsDraftSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (blockSaveForUnconfirmedNewItem()) return;
    setIsSaving(true);

    try {
      const updates = prepareAuditData(formData.status);
      if (recordId) {
        await updateAudit(recordId, updates, recordVersion.current());
        recordVersion.saved(useAuditStore.getState().auditList.find(a => a.id === recordId)?.row_version);
      } else {
        const created = await addAudit(updates);
        recordVersion.saved(created.row_version);
        setCreatedId(created.id);
        setAuditNo(created.auditNo);
      }

      leaveGuard.release();
      onSaveSuccess();
    } catch (err) {
      console.error("資料庫寫入失敗: ", err);
      showRefusal(err, 'save', { keepsInput: true, onReload: reloadThis() });
    } finally {
      setIsSaving(false);
    }
  };

  // Word export (AUDIT-EXPORT-DOCX-2026-001): the server builds the report from the SAVED record, so unsaved edits would
  // silently be missing from the file — ask for a save first instead.
  const handleExportDocx = async (kind: AuditPrintKind) => {
    if (!recordId || exportingDocx) return;
    if (leaveGuard.dirty) {
      toast.warning(t('audit.wizard.exportSaveFirst'));
      return;
    }
    setExportingDocx(true);
    try {
      await exportAuditDocx(recordId, `${auditNo || 'Audit'}${DOCX_SUFFIX[kind]}`, kind);
    } catch (err) {
      console.error('Word 匯出失敗: ', err);
      toast.error(t('audit.wizard.exportFailed'));
    } finally {
      setExportingDocx(false);
    }
  };

  // What the printouts show: the form as it is on screen (the Word export reads the saved record instead).
  const printData: AuditPrintData = {
    auditNo,
    status: formData.status,
    title: formData.auditTitle,
    projectLabel: selectedProjectLabel,
    // Legacy rows may hold only the contractor id; the Word export then falls back to the contractor's name too.
    contractor: formData.contractor || contractorOptions.find(c => c.id === formData.vendorId)?.name || '',
    startDate: formData.auditStartDate,
    endDate: formData.auditEndDate,
    location: formData.location,
    projectDirector: formData.projectDirector,
    techLead: formData.techLead,
    leadAuditor: formData.leadAuditor,
    supportAuditors: formData.supportAuditors,
    auditCriteria: formData.auditCriteria,
    scopeDescription: formData.scopeDescription,
    selectedTemplates: formData.selectedTemplates,
    customCheckItems: formData.customCheckItems,
    // what will be saved: blank rows dropped, in time order
    agenda: sortAgenda(formData.agenda.filter(row => !isBlankAgendaRow(row))),
    findings: formData.findings,
  };

  // The document that belongs to the current step: its print button and its Word export sit in the footer.
  const stepDocument = STEP_DOCUMENTS[step];

  const renderProgressBar = () => (
    // px-10: each label is centred under its circle and wider than it, so the first and last labels hang ~36px past the
    // circles — the padding keeps them inside the wizard at every width (AUDIT-LAYOUT R2).
    <div className="flex items-center justify-between mb-8 w-full max-w-4xl mx-auto px-10">
      {WIZARD_STEPS.map((labelKey, index) => { const i = index + 1; return (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center relative">
            <button
              type="button"
              onClick={() => setStep(i)}
              // no motion on the step bar: no hover zoom, no transitions (AUDIT-BUTTONS-2026-001)
              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 z-10 cursor-pointer ${
                step >= i ? 'bg-teal-600 border-teal-600 text-white shadow-lg' : 'bg-white border-gray-300 text-gray-400 hover:border-teal-400'
              }`}
            >
              {step > i ? <CheckCircle size={20} /> : i}
            </button>
            {/* Below 640px four labels cannot fit side by side (they overlapped even with five steps before): numbers only. */}
            <span className={`absolute -bottom-8 text-xs font-bold whitespace-nowrap hidden sm:block ${
              step >= i ? 'text-teal-700' : 'text-slate-400'
            }`}>
              {t(labelKey)}
            </span>
          </div>
          {i < LAST_STEP && (
            <div className={`flex-1 h-1 mx-2 rounded-full drop-shadow-sm ${
              step > i ? 'bg-teal-500' : 'bg-slate-600/50'
            }`} />
          )}
        </React.Fragment>
      ); })}
    </div>
  );

  return (
    <>
    {/* print: the wizard is a fixed, internally scrolling overlay — printed as is (browser print menu, no printout
        mounted), only the first screenful came out. In print it becomes normal flow so the browser paginates it;
        Audit.tsx hides the page behind. */}
    <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto px-4 md:px-8 flex justify-center items-start print:static print:overflow-visible print:block print:p-0 print:bg-white">
      {/* vertical padding lives here, not on the scroll container, so the sticky header / footer sit flush with its edges */}
      <div className="w-full max-w-[1400px] pt-8 pb-8 print:p-0">
        {/* Title and step bar stay put while the step scrolls (AUDIT-BUTTONS-2026-001: "要固定不要轉動"). */}
        <div className="sticky top-0 z-20 bg-slate-50 pt-2 pb-2 no-print" data-wizard-header>
        <div className="flex justify-between items-center mb-6">
            <div className="text-left flex items-center gap-4">
                <div className="inline-flex items-center justify-center p-2.5 bg-emerald-50 text-teal-700 rounded-2xl">
                    <ClipboardList size={24} />
                </div>
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t('audit.wizard.title')}</h1>
            </div>
            <button 
                onClick={requestClose}
                className="w-12 h-12 bg-transparent hover:bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all"
            >
                <X size={26} />
            </button>
        </div>

          {renderProgressBar()}
        </div>

        {readOnlyReason && (
          <div role="status" data-readonly-banner={readOnlyReason} className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl font-medium shadow-sm no-print flex items-center justify-center gap-2 text-center">
            <Lock size={18} className="shrink-0" />
            <span>{t(readOnlyReason)}</span>
          </div>
        )}

        {/* overflow-clip (not -hidden) keeps the rounded corners without making the card a scroll container, so the sticky
            footer below sticks to the wizard's own scroll area */}
        <div className="bg-white rounded-4xl shadow-xl shadow-slate-900/10 overflow-clip relative border border-slate-100/50 print-modal-content">
          <form onSubmit={handleSubmit}>
            
            {/* Step 1: Project Info */}
            {step === 1 && (
              <div className="p-6 md:p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3 mb-4">
                  <FileText className="text-teal-600" size={24} />
                  <h2 className="text-xl font-bold text-slate-800">{t('audit.wizard.step1')}</h2>
                </div>
                
                <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-5">
                  <div>
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Audit Doc No</span>
                       <span className="text-xs font-medium text-slate-400">(稽核文件編號)</span>
                    </label>
                    <input type="text" name="auditDocNo" value={auditNo} className="w-full px-4 py-3 bg-[#F5F7FA] border border-slate-200 rounded-xl outline-none text-slate-400 font-medium cursor-not-allowed" placeholder="系統自動產生" readOnly style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }} />
                  </div>
                  <div>
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Project No / Name</span>
                       <span className="text-xs font-medium text-slate-400">(專案名稱)</span>
                    </label>
                    {/* REF-PROJECT-SEQ-2026-001 B2 (D3): an audit belongs to the project the user works in — shown, not chosen. */}
                    <input type="text" name="projectId" value={selectedProjectLabel} readOnly
                      className="w-full px-4 py-3 bg-[#F5F7FA] border border-slate-200 rounded-xl outline-none text-slate-400 font-medium cursor-not-allowed"
                      style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }} />
                  </div>
                  <div>
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Contractor</span>
                       <span className="text-xs font-medium text-slate-400">(受稽核廠商)</span>
                    </label>
                    <select value={formData.vendorId} onChange={handleContractorChange} className="w-full px-4 py-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium appearance-none">
                        <option value="">{t('audit.wizard.selectContractor')}</option>
                        {pickerContractors.map(vendor => (
                            <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                        ))}
                    </select>
                  </div>
                  <div className="col-span-full">
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">{t('audit.auditTitle') || 'Audit Title'}</span>
                       <span className="text-xs font-medium text-slate-400">(稽核標題)</span>
                    </label>
                    <input type="text" name="auditTitle" value={formData.auditTitle} onChange={handleInputChange} className="w-full px-4 py-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" placeholder={t('audit.auditTitlePlaceholder')} />
                  </div>
                  <div>
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Audit Start Date</span>
                    </label>
                    <input type="date" name="auditStartDate" value={formData.auditStartDate} onChange={handleInputChange} className="w-full px-4 py-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                  </div>
                  <div>
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Audit End Date</span>
                    </label>
                    <input type="date" name="auditEndDate" value={formData.auditEndDate} onChange={handleInputChange} className="w-full px-4 py-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                  </div>
                  <div>
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Status</span>
                       <span className="text-xs font-medium text-slate-400">(稽核狀態)</span>
                    </label>
                    <select name="status" value={formData.status} onChange={handleInputChange} className="w-full px-4 py-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium appearance-none">
                      {/* Only what the workflow allows from the last saved status (the backend refuses anything else). */}
                      {statusOptions.map(status => (
                        <option key={status} value={status}>{AUDIT_STATUS_LABELS[status] || status}</option>
                      ))}
                    </select>
                  </div>
                </fieldset>
              </div>
            )}

            {/* Step 2: Personnel + Scope & Location (merged, AUDIT-LAYOUT-2026-001) */}
            {step === 2 && (
              <div className="p-6 md:p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3 mb-4">
                  <Users className="text-teal-600" size={24} />
                  <h2 className="text-xl font-bold text-slate-800">{t('audit.wizard.stepPersonnelScope')}</h2>
                </div>

                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-wide no-print">
                  <Users size={16} /> {t('audit.wizard.step2')} (Carried Out By)
                </h3>
                <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-5 no-print">
                  <div>
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Project Director</span>
                    </label>
                    <input type="text" name="projectDirector" value={formData.projectDirector} onChange={handleInputChange} className="w-full px-4 py-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                  </div>
                  <div>
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Package or Tech. Lead</span>
                    </label>
                    <input type="text" name="techLead" value={formData.techLead} onChange={handleInputChange} className="w-full px-4 py-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                  </div>
                  <div>
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Lead Auditor</span>
                    </label>
                    <input type="text" name="leadAuditor" value={formData.leadAuditor} onChange={handleInputChange} className="w-full px-4 py-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                  </div>
                  <div className="col-span-full">
                    <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Support Auditor</span>
                    </label>
                    <input type="text" name="supportAuditors" value={formData.supportAuditors} onChange={handleInputChange} className="w-full px-4 py-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                  </div>
                </fieldset>

                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-wide pt-2 no-print">
                  <MapPin size={16} /> {t('audit.wizard.step3')}
                </h3>
                <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-5 no-print">
                <div>
                  <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Location</span>
                       <span className="text-xs font-medium text-slate-400">(稽核地點)</span>
                  </label>
                  <input type="text" name="location" value={formData.location} onChange={handleInputChange} className="w-full px-4 py-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                </div>
                <div className="md:col-span-1 xl:col-span-2">
                  <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Audit Criteria</span>
                       <span className="text-xs font-medium text-slate-400">(稽核準則)</span>
                  </label>
                  <input type="text" name="auditCriteria" value={formData.auditCriteria} onChange={handleInputChange} placeholder="例如: 專案合約、ISO 9001、施工規範..." className="w-full px-4 py-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium" />
                </div>
                <div className="col-span-full">
                  <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Audit Scope</span>
                       <span className="text-xs font-medium text-slate-400">(範圍描述)</span>
                  </label>
                  <textarea name="scopeDescription" value={formData.scopeDescription} onChange={handleInputChange} rows={5} className="w-full px-4 py-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none resize-none transition-all text-slate-800 font-medium"></textarea>
                </div>
                </fieldset>

                {/* Print Only Summary for the plan (steps 1-2) */}
                <div className="hidden print:block space-y-4">
                  <div className="text-center mb-6 border-b-2 border-slate-800 pb-3">
                    <h1 className="text-2xl font-bold text-slate-900 mb-1">Internal Quality Audit Plan</h1>
                    <h2 className="text-lg font-bold text-slate-700">內部稽核計畫書</h2>
                  </div>

                  <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm border border-slate-300 p-5 rounded-lg">
                    {/* Project info (step 1) */}
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

                    {/* Personnel (step 2) */}
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

                    {/* Scope & location (step 2) */}
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

            {/* Step 3: Audit Plan — the daily schedule (AUDIT-AGENDA-2026-001); its print / Word buttons are in the footer */}
            {step === 3 && (
              <div className="p-6 md:p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3 mb-4">
                  <CalendarDays className="text-teal-600" size={24} />
                  <h2 className="text-xl font-bold text-slate-800">{t('audit.wizard.stepAgenda')}</h2>
                </div>
                <AuditAgendaEditor
                  rows={formData.agenda}
                  onChange={agenda => setFormData(prev => ({ ...prev, agenda }))}
                  readOnly={readOnly}
                  startDate={formData.auditStartDate}
                  endDate={formData.auditEndDate}
                  defaultAuditor={formData.leadAuditor}
                />
              </div>
            )}

            {/* Step 4: Checklist Configuration */}
            {step === 4 && (
              <div className="p-6 md:p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3 mb-4">
                  <CheckSquare className="text-teal-600" size={24} />
                  <h2 className="text-xl font-bold text-slate-800">{t('audit.wizard.step4')}</h2>
                </div>

                {/* Template Selection */}
                <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }} className="no-print">
                  <label className="flex items-baseline gap-2 mb-3">
                       <span className="text-sm font-bold text-slate-800">Template Selection</span>
                       <span className="text-xs font-medium text-slate-400">(選用標準模板)</span>
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {templateChips.map((chip) => (
                      <button
                        key={chip.key} type="button" data-template-chip={chip.name} aria-pressed={chip.selected}
                        title={chip.template ? (chip.template.description || undefined) : t('audit.templates.legacyHint')}
                        onClick={() => handleTemplateChip(chip)} disabled={!templatesLoaded}
                        className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all border ${
                          chip.selected ? 'bg-teal-600 border-teal-600 text-white shadow-md' : 'bg-transparent border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {chip.name}
                        {chip.template && !chip.template.is_active && <span className="ml-1 font-medium opacity-80">{t('audit.templates.inactiveSuffix')}</span>}
                      </button>
                    ))}
                    {templateChips.length === 0 && (templatesLoaded || templatesError) && (
                      <span className="text-sm text-slate-400">{t(templatesError ? 'audit.templates.loadFailed' : 'audit.templates.noneAvailable')}</span>
                    )}
                  </div>
                  {!readOnly && selectedTypes.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {selectedTypes.map(tpl => (
                        <button key={tpl.id} type="button" className={actionStyles.secondary} onClick={() => setPickerTemplate(tpl)} data-batch-pick={tpl.name}>
                          <ListChecks size={16} /> {t('audit.templates.batchPick', { name: tpl.name })}
                        </button>
                      ))}
                    </div>
                  )}
                  {pickerTemplate && (() => {
                    const copies = formData.customCheckItems.filter((i: any) => i?.templateId === pickerTemplate.id);
                    return (
                      <AuditTemplatePicker
                        template={pickerTemplate}
                        present={new Set(copies.map((i: any) => String(i.templateItemId)))}
                        filled={new Set(copies.filter(isFilledItem).map((i: any) => String(i.templateItemId)))}
                        selected={templateChips.some(c => c.template?.id === pickerTemplate.id && c.selected)}
                        onApply={checked => applyTemplatePick(pickerTemplate, checked)}
                        onDeselect={() => deselectTemplate(pickerTemplate)}
                        onCancel={() => setPickerTemplate(null)}
                      />
                    );
                  })()}
                </fieldset>

                {/* Custom Checklist Items */}
                <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }} className="space-y-4">
                  <label className="flex items-baseline gap-2 mb-2">
                       <span className="text-sm font-bold text-slate-800">Custom Audit Items</span>
                       <span className="text-xs font-medium text-slate-400">(自定義查檢項目)</span>
                  </label>
                  
                  {/* Add Input Form */}
                  <div className="p-5 border border-slate-200 rounded-2xl flex flex-col gap-3 no-print" data-add-form>
                    {/* row 1: clause (or, for a custom question, its clause number) and, beside it, the question number (user's
                        layout 2026-10-11); each field has the same small caption as the cards below */}
                    <div className="flex gap-3 items-end">
                    <div className="flex-1 min-w-0">
                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-1">{isCustomNew ? '條文編號 Clause No.' : '條文 Clause'}</span>
                    {isCustomNew ? (
                      <div className="flex gap-2">
                        <input type="text" name="no" value={newItem.no} onChange={handleNewItemChange} placeholder={t('audit.templates.customNoPlaceholder')} className="w-full p-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all text-sm text-slate-800 font-medium" />
                        <button type="button" onClick={() => { setIsCustomNew(false); setNewClause(''); setNewItem(BLANK_NEW_ITEM); }} className="text-slate-400 hover:text-red-500 p-2 shrink-0"><X size={18} /></button>
                      </div>
                    ) : (
                      <select name="clausePick" value={newClause} onChange={handleClausePick} data-clause-pick className="w-full p-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all text-sm text-slate-800 font-bold">
                        <option value="" disabled>{t(selectedTypes.length ? 'audit.templates.pickClause' : 'audit.templates.pickTypeFirst')}</option>
                        {selectedTypes.map(tpl => {
                          const have = new Set(formData.customCheckItems.filter((i: any) => i?.templateId === tpl.id).map((i: any) => String(i.templateItemId)));
                          const clauses: { no: string; label: string; ids: string[] }[] = [];
                          for (const it of (tpl.items || [])) {
                            if (!it.id) continue;
                            let c = clauses.find(x => x.no === (it.no || ''));
                            if (!c) {
                              const title = (it.title || '').trim() || (it.clause || '').split('\n')[0];
                              c = { no: it.no || '', label: `${it.no || '-'}  ${title.length > 90 ? title.slice(0, 90) + '…' : title}`, ids: [] };
                              clauses.push(c);
                            }
                            c.ids.push(it.id);
                          }
                          return (
                            <optgroup key={tpl.id} label={tpl.name}>
                              {clauses.map(c => (
                                <option key={c.no} value={`${tpl.id}::${c.no}`}>
                                  {`${c.label}${c.ids.length > 1 ? `（${c.ids.length}）` : ''}${c.ids.every(id => have.has(id)) ? `  ${t('audit.templates.alreadyAddedTag')}` : ''}`}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                        <option value="custom">✎ {t('audit.templates.customQuestion')}</option>
                      </select>
                    )}
                    </div>
                    {/* all of the clause's questions, or one of them */}
                    {pickedClause && (
                      <div className="w-52 shrink-0">
                      <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-1">題目 Question</span>
                      <select name="questionPick" value={newQ} onChange={handleQuestionPick} data-question-pick className="w-full p-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all text-sm text-slate-800">
                        <option value="all">{t('audit.templates.allQuestions', { n: pickedClause.items.length })}</option>
                        {/* question numbers only: the full question shows (editable) in the last row (user's choice 2026-10-11) */}
                        {pickedClause.items.map((it, idx) => (
                          <option key={it.id} value={it.id}>
                            {`${t('audit.templates.questionN', { n: idx + 1 })}${pickedClause.have.has(it.id as string) ? `  ${t('audit.templates.alreadyAddedTag')}` : ''}`}
                          </option>
                        ))}
                      </select>
                      </div>
                    )}
                    </div>
                    {pickedClause && newQ === 'all' ? (
                      <div className="flex gap-2 items-start">
                        <div className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700" data-all-preview>
                          <p className="font-semibold mb-1">{t('audit.templates.allQuestionsHint', { n: pickedClause.items.length })}</p>
                          {/* every question with its own clause text — they differ per question (user 2026-10-11) */}
                          <div className="space-y-3">
                            {pickedClause.items.map((it, idx) => {
                              const added = pickedClause.have.has(it.id as string);
                              return (
                                <div key={it.id} className={`border-t border-slate-200 pt-2 first:border-0 first:pt-0 ${added ? 'text-slate-400' : 'text-slate-700'}`} data-all-item>
                                  <p className="font-semibold text-xs mb-1">{t('audit.templates.questionN', { n: idx + 1 })}{added ? `  ${t('audit.templates.alreadyAddedTag')}` : ''}</p>
                                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">條文內容 Clause Description</span>
                                  <p className="whitespace-pre-line mb-1.5">{it.clause || '-'}</p>
                                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">查檢重點 Audit Question</span>
                                  <p className="whitespace-pre-line">{it.task}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <button className={actionStyles.icon} type="button" onClick={addCustomItem} data-add-item><Plus size={20} /></button>
                      </div>
                    ) : (
                      <>
                        {/* row 3: clause text; row 4: question + add */}
                        <div>
                        <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-1">條文內容 Clause Description</span>
                        <AutoGrowTextarea name="clause" rows={2} value={newItem.clause} onChange={handleNewItemChange} placeholder={t('audit.templates.clausePlaceholder')} data-new-clause className="w-full p-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all text-sm text-slate-800 font-medium resize-y" />
                        </div>
                        <div>
                        <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-1">查檢重點 Audit Question</span>
                        <div className="flex gap-2 items-start">
                          <AutoGrowTextarea name="task" rows={2} value={newItem.task} onChange={handleNewItemChange} onKeyDown={(e) => { if (isPlainEnter(e) && !e.shiftKey) { e.preventDefault(); addCustomItem(); } }} placeholder={t('audit.templates.taskPlaceholder')} className="flex-1 p-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all text-sm text-slate-800 font-medium resize-y" />
                          <button className={actionStyles.icon} type="button" onClick={addCustomItem} data-add-item><Plus size={20} /></button>
                        </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Items List */}
                  <div className="space-y-3 mt-4 h-[300px] overflow-y-auto pr-2 custom-scrollbar border border-slate-100 rounded-xl p-2 print-expand">
                    {formData.customCheckItems.map((item: any, index: number) => (
                      <div key={item.id} className="flex items-start gap-4 p-4 bg-white border border-slate-200 rounded-xl group hover:border-teal-300 transition-all shadow-sm">
                        <span className="bg-slate-100 text-slate-500 text-xs w-6 h-6 flex items-center justify-center rounded-full font-bold shrink-0 mt-0.5">{index + 1}</span>
                        {editingItemId === item.id ? (
                          <div className="flex-1 flex flex-col gap-3">
                            <div className="flex items-start gap-3">
                              <input type="text" name="no" value={editFormData.no} onChange={handleEditChange} placeholder={t('audit.templates.customNoPlaceholder')} className="w-1/3 shrink-0 p-2 bg-white border border-slate-300 rounded-lg outline-none focus:border-teal-500 text-sm" />
                              <AutoGrowTextarea name="clause" rows={3} value={editFormData.clause} onChange={handleEditChange} placeholder="ISO 9001:2015 Clause 內容..." className="flex-1 p-2 bg-white border border-slate-300 rounded-lg outline-none focus:border-teal-500 text-sm resize-y" />
                            </div>
                            <AutoGrowTextarea name="task" rows={3} value={editFormData.task} onChange={handleEditChange} placeholder="輸入稽核查檢重點 (Audit Question)..." className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none focus:border-teal-500 text-sm resize-y" />
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
                                  {item.templateId != null && (
                                    <span className="block mt-1 text-[11px] text-slate-400" data-item-template>
                                      {templateNames.has(item.templateId) ? t('audit.templates.fromTemplateNamed', { name: templateNames.get(item.templateId) as string }) : t('audit.templates.fromTemplate')}
                                    </span>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Clause Description</span>
                                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{item.clause || '-'}</p>
                                </div>
                              </div>
                              <div className="pt-2 border-t border-slate-100">
                                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Audit Question</span>
                                <p className="text-sm font-medium text-slate-800 whitespace-pre-line">{item.task}</p>
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
              <div className="p-6 md:p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 bg-slate-50 min-h-[500px]">
                
                {/* Header Section */}
                <header>
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-8 h-8 text-indigo-600" />
                    <h1 className="text-2xl font-bold text-slate-800">{t('audit.wizard.executionTitle')}</h1>
                  </div>
                  <p className="text-slate-500">{formData.projectName ? `${formData.projectName} - ${t('audit.wizard.regularAudit')}` : t('audit.wizard.configureFirst')}</p>
                </header>

                {/* Statistics Cards */}
                {/* six cards: one row from xl, 3 × 2 below it so a ~1024px screen needs no sideways scroll (user 2026-10-11) */}
                <div className="grid grid-cols-3 xl:grid-cols-6 gap-4 overflow-x-auto min-w-full pb-2">
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
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 min-w-[140px]" data-stat="pass">
                    <p className="text-slate-500 text-sm mb-1 whitespace-nowrap">{t('audit.wizard.statPass')}</p>
                    <p className="text-2xl font-bold text-green-600">{stats.pass}</p>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3">
                      <div className="bg-green-500 h-1.5 rounded-full" style={{ width: stats.total ? `${(stats.pass / stats.total) * 100}%` : '0%' }}></div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 min-w-[140px]" data-stat="positive">
                    <p className="text-slate-500 text-sm mb-1 whitespace-nowrap">{t('audit.wizard.statPositive')}</p>
                    <p className="text-2xl font-bold text-sky-600">{stats.positive}</p>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3">
                      <div className="bg-sky-500 h-1.5 rounded-full" style={{ width: stats.total ? `${(stats.positive / stats.total) * 100}%` : '0%' }}></div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 min-w-[140px]" data-stat="major">
                    <p className="text-slate-500 text-sm mb-1 whitespace-nowrap">{t('audit.wizard.statMajor')}</p>
                    <p className="text-2xl font-bold text-red-600">{stats.major}</p>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3">
                      <div className="bg-red-500 h-1.5 rounded-full" style={{ width: stats.total ? `${(stats.major / stats.total) * 100}%` : '0%' }}></div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 min-w-[140px]" data-stat="minor">
                    <p className="text-slate-500 text-sm mb-1 whitespace-nowrap">{t('audit.wizard.statMinor')}</p>
                    <p className="text-2xl font-bold text-amber-600">{stats.minor}</p>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3">
                      <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: stats.total ? `${(stats.minor / stats.total) * 100}%` : '0%' }}></div>
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
                        // The only text input on the last step, inside the form that has the submit button:
                        // Enter would otherwise submit (save and close) the whole audit.
                        onKeyDown={(e) => { if (isPlainEnter(e)) e.preventDefault(); }}
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
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-64 text-center">{t('audit.wizard.colStatus')}</th>
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
                                <span className="text-sm font-bold text-slate-800 mb-0.5 whitespace-pre-line">{item.clause || '-'}</span>
                                <span className="text-xs text-slate-500 leading-relaxed whitespace-pre-line">{item.task || '-'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex justify-center">
                                <div className="flex flex-col items-center gap-1">
                                  {/* an older audit's ungraded fail: shown until the auditor picks Major or Minor */}
                                  {item.status === 'fail' && (
                                    <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1.5" data-ungraded-fail>{t('audit.wizard.legendUngraded')}</span>
                                  )}
                                  <div className="flex bg-slate-100 p-1 rounded-lg gap-1 border border-slate-200" data-grade-buttons>
                                    {GRADE_BUTTONS.map(g => (
                                      <button
                                        key={g.value}
                                        type="button"
                                        onClick={() => updateItemStatus(item.id, g.value)}
                                        className={`px-2 py-1 rounded text-xs font-bold transition-all whitespace-nowrap ${item.status === g.value ? `bg-white shadow-sm ${g.active}` : 'text-slate-400 hover:text-slate-600'}`}
                                        title={g.title}
                                        aria-pressed={item.status === g.value}
                                        data-grade={g.value}
                                      >
                                        {t(g.label)}
                                      </button>
                                    ))}
                                  </div>
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
                                  className="w-full text-sm bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-400 focus:outline-none p-2 rounded-lg transition-all text-slate-700 resize-y min-h-[40px] print:hidden"
                                />
                                {/* A textarea prints only its visible rows; print the whole note as text instead. */}
                                <p className="hidden print:block w-full text-sm text-slate-700 whitespace-pre-wrap break-words">{item.note || '-'}</p>
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
                        <span className="text-xs text-slate-500">{t('audit.wizard.legendPass')}: {stats.pass}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                        <span className="text-xs text-slate-500">{t('audit.wizard.legendPositive')}: {stats.positive}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                        <span className="text-xs text-slate-500">{t('audit.wizard.legendMajor')}: {stats.major}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                        <span className="text-xs text-slate-500">{t('audit.wizard.legendMinor')}: {stats.minor}</span>
                      </div>
                      {stats.fail > 0 && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-red-300"></div>
                          <span className="text-xs text-slate-500">{t('audit.wizard.legendUngraded')}: {stats.fail}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                        <span className="text-xs text-slate-500">{t('audit.wizard.legendNotGraded')}: {stats.pending}</span>
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
                    className="w-full px-4 py-3 bg-[#F5F7FA] border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all text-slate-800 font-medium resize-y print:hidden"
                    placeholder={t('audit.findingsPlaceholder')}
                  />
                  {/* A textarea prints only its visible rows; print the full findings as text instead. */}
                  <p className="hidden print:block text-slate-800 whitespace-pre-wrap break-words">{formData.findings || '-'}</p>
                </div>
              </div>
            )}

            {/* Footer Navigation — sticky at the bottom so Back / Print / Word / Save / Next stay reachable on long steps */}
                      <div className="sticky bottom-0 z-10" data-wizard-footer>
                      <FormActions tools={<>{step > 1 && (
                          <button className={actionStyles.secondary}
                              type="button" onClick={prevStep}
                          >
                              <ChevronLeft size={20} /> {t('audit.wizard.prevStep')}
                          </button>
                      )}
                      {/* This step's printout and Word document, bottom-left like every other module's Print / Export Word
                          (AUDIT-BUTTONS-2026-001): step 3 the audit plan, step 4 the on-site checklist, step 5 the report.
                          Word needs a saved record (the server builds it from the saved audit). */}
                      {stepDocument && (<>
                          <button className={actionStyles.secondary} type="button" onClick={() => requestPrint(stepDocument.kind)} data-step-print={stepDocument.kind}>
                              <Printer size={16} /> {t(stepDocument.printLabel)}
                          </button>
                          {recordId && (
                              <button className={actionStyles.secondary} type="button" onClick={() => handleExportDocx(stepDocument.kind)} disabled={exportingDocx} data-step-word={stepDocument.kind}>
                                  <FileText size={16} /> {exportingDocx ? t('audit.wizard.exporting') : t('common.exportWord')}
                              </button>
                          )}
                      </>)}</>} secondary={<>{/* 儲存進度按鈕 (Ghost Style) — hidden entirely once Closed:
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
                          )}</>} primary={<>{step < LAST_STEP ? (
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
                      </div>
          </form>
        </div>
      </div>
    </div>
    {printJob && createPortal(<AuditPrintTemplate key={printJob.n} kind={printJob.kind} data={printData} unsaved={leaveGuard.dirty} />, document.body)}
    </>
  );
};

export default AuditWizard;
