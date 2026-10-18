import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, Plus, Trash2, X } from 'lucide-react';
import actionStyles from '../Shared/FormActions.module.css';
import shellStyles from '../Shared/ModuleShell.module.css';
import { useLeaveGuard } from '../Shared/LeaveGuard';
import { useLanguage } from '../../context/LanguageContext';
import { useAuditTemplateStore, AuditTemplate, AuditTemplateItem } from '../../store/auditTemplateStore';
import { showRefusal } from '../../store/refusalStore';
import { reloadAndReopen, useOpenSession, useRecordVersion } from '../../hooks/useRecordVersion';

/**
 * The audit template library's management tab (AUDIT-TEMPLATES-2026-001), shown on the Audit page to holders of
 * audit:template:manage. A template (an audit type in the wizard) is a name plus a list of check items ({no, title,
 * clause, task}); the wizard copies the questions the auditor picks into the audit, so saving here only changes what
 * later picks copy.
 * Templates are never deleted — clearing "Active" hides one from the wizard. Blank item rows are dropped on save.
 */
type DraftItem = AuditTemplateItem & { _key: string };
interface Draft {
    id: number | null;  // null = a new template not saved yet
    name: string;
    version: string;
    description: string;
    is_active: boolean;
    items: DraftItem[];
}

let nextDraftKey = 0;
const draftKey = () => `row-${nextDraftKey++}`;
const blankItem = (): DraftItem => ({ _key: draftKey(), no: '', title: '', clause: '', task: '' });
const isBlankItem = (i: AuditTemplateItem) => !i.no.trim() && !(i.title || '').trim() && !i.clause.trim() && !i.task.trim();
const toDraft = (tpl: AuditTemplate | null): Draft => tpl
    ? { id: tpl.id, name: tpl.name, version: tpl.version || '', description: tpl.description || '', is_active: tpl.is_active,
        items: (tpl.items || []).map(i => ({ _key: i.id || draftKey(), id: i.id, no: i.no || '', title: i.title || '', clause: i.clause || '', task: i.task || '' })) }
    : { id: null, name: '', version: '', description: '', is_active: true, items: [blankItem()] };
// what the dirty check compares: the content, not the React row keys
const comparable = (d: Draft | null) => d && JSON.stringify({ ...d, items: d.items.map(({ _key, ...rest }) => rest) });

const INPUT = 'w-full px-3 py-2 bg-[#F5F7FA] border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm text-slate-800';
const CELL_INPUT = 'w-full px-2 py-1.5 bg-[#F5F7FA] border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm text-slate-800';
// Requirement texts and questions run over several lines (a), b) … lists): a text box tall enough for the content, up to 8 rows
const rowsFor = (text: string) => Math.min(8, Math.max(2, text.split('\n').length + Math.floor(text.length / 90)));

interface AuditTemplatesPanelProps {
    /** told whenever the unsaved state changes (and false on unmount), so the page can guard leaving the tab */
    onDirtyChange?: (dirty: boolean) => void;
}

export default function AuditTemplatesPanel({ onDirtyChange }: AuditTemplatesPanelProps) {
    const { t } = useLanguage();
    const { templates, loading, error, fetchTemplates, createTemplate, updateTemplate } = useAuditTemplateStore();
    const [showInactive, setShowInactive] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [baseline, setBaseline] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const dirty = draft !== null && comparable(draft) !== baseline;
    const guard = useLeaveGuard(dirty, saving);
    // OPTIMISTIC-LOCK-2026-001 B3a: the version the editor saves against — the template's, when it is opened; the version each
    // save answered (the editor stays open). Tracked here because the draft (toDraft) carries no version. openSession guards a
    // reload's late reopen against a template opened meanwhile.
    const recordVersion = useRecordVersion();
    const openSession = useOpenSession();
    const show = (tpl: AuditTemplate | null) => {
        const next = toDraft(tpl);
        recordVersion.open(tpl?.row_version);
        openSession.next();
        setDraft(next);
        setBaseline(comparable(next));
    };

    useEffect(() => { fetchTemplates(); }, [fetchTemplates]);
    useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
    useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

    const visible = useMemo(() => templates.filter(tpl => showInactive || tpl.is_active || tpl.id === draft?.id),
        [templates, showInactive, draft?.id]);

    const open = (tpl: AuditTemplate | null) => guard.requestAction(() => show(tpl));

    // "Reload this record" after a 409 VERSION_CONFLICT (the refusal dialog has already confirmed that the draft's changes are
    // discarded): reload the templates and show this one as it is saved now.
    const reloadTemplate = (id: number) => reloadAndReopen(openSession, {
        close: () => undefined,                      // the editor is part of the page: it is replaced when the reload is back
        reload: () => fetchTemplates(),
        failed: () => !!useAuditTemplateStore.getState().error,
        found: () => useAuditTemplateStore.getState().templates.some(tpl => tpl.id === id),
        reopen: () => show(useAuditTemplateStore.getState().templates.find(tpl => tpl.id === id) || null),
        forget: () => { setDraft(null); setBaseline(null); },
        notify: (notice) => toast.warning(t(notice)),
    });

    const setField = <K extends keyof Draft>(field: K, value: Draft[K]) => setDraft(d => (d ? { ...d, [field]: value } : d));
    const setItem = (key: string, field: 'no' | 'title' | 'clause' | 'task', value: string) =>
        setDraft(d => (d ? { ...d, items: d.items.map(i => (i._key === key ? { ...i, [field]: value } : i)) } : d));
    const addItem = () => setDraft(d => (d ? { ...d, items: [...d.items, blankItem()] } : d));
    const removeItem = (key: string) => setDraft(d => (d ? { ...d, items: d.items.filter(i => i._key !== key) } : d));
    const moveItem = (index: number, by: -1 | 1) => setDraft(d => {
        if (!d) return d;
        const to = index + by;
        if (to < 0 || to >= d.items.length) return d;
        const items = [...d.items];
        [items[index], items[to]] = [items[to], items[index]];
        return { ...d, items };
    });

    const handleSave = async () => {
        if (!draft) return;
        if (!draft.name.trim()) { toast.error(t('audit.templates.nameRequired')); return; }
        const kept = draft.items.filter(i => !isBlankItem(i));
        const missing = kept.findIndex(i => !i.task.trim());
        if (missing !== -1) {
            toast.error(t('audit.templates.taskRequired').replace('{n}', String(draft.items.indexOf(kept[missing]) + 1)));
            return;
        }
        const payload = {
            name: draft.name.trim(), version: draft.version.trim(), description: draft.description, is_active: draft.is_active,
            items: kept.map(({ _key, ...item }) => item),
        };
        setSaving(true);
        try {
            const saved = draft.id === null ? await createTemplate(payload) : await updateTemplate(draft.id, payload, recordVersion.current());
            recordVersion.saved(saved.row_version);
            const next = toDraft(saved);
            setDraft(next);
            setBaseline(comparable(next));
            toast.success(t('audit.templates.saved'));
        } catch (err) {
            // refused or failed (a duplicate name is 409 DUPLICATE_NAME now): the refusal dialog, the draft is kept (REFUSAL-DIALOG-2026-003)
            const id = draft.id;
            showRefusal(err, 'save', { keepsInput: true, onReload: id !== null ? () => { void reloadTemplate(id); } : undefined });
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        if (!draft) return;
        const original = draft.id === null ? null : templates.find(tpl => tpl.id === draft.id) || null;
        if (draft.id === null) {
            guard.requestAction(() => { setDraft(null); setBaseline(null); });
        } else {
            guard.requestAction(() => show(original));
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start" data-audit-templates>
            {/* template list */}
            <div className={shellStyles.content}>
                <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="text-base font-bold text-slate-800">{t('audit.templates.listTitle')}</h2>
                    <button className={actionStyles.secondary} type="button" onClick={() => open(null)} data-template-new>
                        <Plus size={16} /> {t('audit.templates.new')}
                    </button>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                    <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                    {t('audit.templates.showInactive')}
                </label>
                {error && <p className="text-sm text-red-600 mb-2">{t('audit.templates.loadFailed')}</p>}
                <ul className="space-y-1.5">
                    {visible.map(tpl => (
                        <li key={tpl.id}>
                            <button type="button" onClick={() => draft?.id !== tpl.id && open(tpl)} data-template-row={tpl.name}
                                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${draft?.id === tpl.id
                                    ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                                <span className={`block text-sm font-semibold ${tpl.is_active ? 'text-slate-800' : 'text-slate-400'}`}>{tpl.name}</span>
                                <span className="flex items-center gap-2 text-xs text-slate-500">
                                    {t('audit.templates.itemCount').replace('{n}', String((tpl.items || []).length))}
                                    {tpl.version && <span>· {tpl.version}</span>}
                                    {!tpl.is_active && <span className="px-1.5 rounded bg-slate-200 text-slate-600">{t('audit.templates.inactive')}</span>}
                                </span>
                            </button>
                        </li>
                    ))}
                    {!loading && visible.length === 0 && <li className="text-sm text-slate-400 py-4 text-center">{t('audit.templates.empty')}</li>}
                </ul>
            </div>

            {/* editor */}
            <div className={shellStyles.content} data-template-editor>
                {!draft ? (
                    <p className="text-sm text-slate-400 py-16 text-center">{t('audit.templates.selectHint')}</p>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px] gap-3">
                            <label className="block">
                                <span className="block text-xs font-bold text-slate-500 mb-1">{t('audit.templates.name')} *</span>
                                <input className={INPUT} value={draft.name} maxLength={100} onChange={e => setField('name', e.target.value)} data-template-name />
                            </label>
                            <label className="block">
                                <span className="block text-xs font-bold text-slate-500 mb-1">{t('audit.templates.version')}</span>
                                <input className={INPUT} value={draft.version} maxLength={50} onChange={e => setField('version', e.target.value)} />
                            </label>
                        </div>
                        <label className="block">
                            <span className="block text-xs font-bold text-slate-500 mb-1">{t('audit.templates.description')}</span>
                            <textarea className={INPUT} rows={2} value={draft.description} onChange={e => setField('description', e.target.value)} />
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input type="checkbox" checked={draft.is_active} onChange={e => setField('is_active', e.target.checked)} data-template-active />
                            {t('audit.templates.active')}
                        </label>

                        <div>
                            <span className="block text-xs font-bold text-slate-500 mb-2">{t('audit.templates.items')}</span>
                            <div className="overflow-x-auto border border-slate-200 rounded-xl">
                                <table className="w-full min-w-[1100px] table-fixed text-left border-collapse" data-template-items>
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="px-3 py-2.5 text-xs font-bold text-slate-500 w-[44px]">#</th>
                                            <th className="px-3 py-2.5 text-xs font-bold text-slate-500 w-[100px]">{t('audit.templates.colNo')}</th>
                                            <th className="px-3 py-2.5 text-xs font-bold text-slate-500 w-[170px]">{t('audit.templates.colTitle')}</th>
                                            <th className="px-3 py-2.5 text-xs font-bold text-slate-500 w-[36%]">{t('audit.templates.colClause')}</th>
                                            <th className="px-3 py-2.5 text-xs font-bold text-slate-500">{t('audit.templates.colTask')} *</th>
                                            <th className="px-2 py-2.5 w-[124px]" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {draft.items.map((item, index) => (
                                            <tr key={item._key} data-template-item>
                                                <td className="px-3 py-2 text-xs text-slate-400">{index + 1}</td>
                                                <td className="px-3 py-2 align-top"><input className={CELL_INPUT} aria-label={t('audit.templates.colNo')} value={item.no} maxLength={50} onChange={e => setItem(item._key, 'no', e.target.value)} /></td>
                                                <td className="px-3 py-2 align-top"><input className={CELL_INPUT} aria-label={t('audit.templates.colTitle')} value={item.title || ''} maxLength={200} onChange={e => setItem(item._key, 'title', e.target.value)} /></td>
                                                <td className="px-3 py-2"><textarea className={`${CELL_INPUT} resize-y`} rows={rowsFor(item.clause)} aria-label={t('audit.templates.colClause')} value={item.clause} maxLength={2000} onChange={e => setItem(item._key, 'clause', e.target.value)} /></td>
                                                <td className="px-3 py-2"><textarea className={`${CELL_INPUT} resize-y`} rows={rowsFor(item.task)} aria-label={t('audit.templates.colTask')} value={item.task} maxLength={2000} onChange={e => setItem(item._key, 'task', e.target.value)} /></td>
                                                <td className="px-2 py-2">
                                                    <div className="flex justify-end gap-1">
                                                        <button className={actionStyles.icon} type="button" onClick={() => moveItem(index, -1)} disabled={index === 0} aria-label={t('audit.templates.moveUp')}><ArrowUp size={15} /></button>
                                                        <button className={actionStyles.icon} type="button" onClick={() => moveItem(index, 1)} disabled={index === draft.items.length - 1} aria-label={t('audit.templates.moveDown')}><ArrowDown size={15} /></button>
                                                        <button className={actionStyles.iconDanger} type="button" onClick={() => removeItem(item._key)} aria-label={t('audit.templates.removeItem')}><Trash2 size={15} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {draft.items.length === 0 && (
                                            <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-sm">{t('audit.templates.noItems')}</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <button className={`${actionStyles.secondary} mt-3`} type="button" onClick={addItem} data-template-add-item>
                                <Plus size={16} /> {t('audit.templates.addItem')}
                            </button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                            <p className="text-xs text-slate-500 max-w-xl">{t('audit.templates.copyNote')}</p>
                            <div className="flex gap-2 ml-auto">
                                <button className={actionStyles.secondary} type="button" onClick={handleCancel} disabled={saving}><X size={16} /> {t('common.cancel')}</button>
                                <button className={actionStyles.primary} type="button" onClick={handleSave} disabled={saving || !dirty} data-template-save>
                                    <Check size={16} /> {saving ? t('common.saving') : t('common.save')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
