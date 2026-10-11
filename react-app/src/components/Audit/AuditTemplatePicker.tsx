import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Lock, X } from 'lucide-react';
import actionStyles from '../Shared/FormActions.module.css';
import { useLanguage } from '../../context/LanguageContext';
import type { AuditTemplate, AuditTemplateItem } from '../../store/auditTemplateStore';

/**
 * Picking a template's questions for one audit (AUDIT-TEMPLATES-2026-001 R2, user's choice 2026-10-11: "勾模板時跳出挑題
 * 視窗"). The questions are grouped by clause number; a clause checks all of its questions at once (4.1 → Q1 and Q2) or
 * one question at a time. Q numbers are the order inside the clause.
 *
 * First selection: everything is checked. Opening it again for a template the audit already uses: the questions the
 * audit has are checked — check more to add them, uncheck to remove them. A question that already has a result or a
 * note stays checked and locked (user's decision: only unfilled copies are removed). "取消選用此模板" removes every
 * unfilled copy and the template's name.
 */
interface AuditTemplatePickerProps {
    template: AuditTemplate;
    /** template item ids this audit already holds a copy of */
    present: Set<string>;
    /** template item ids whose copy has a result or note (cannot be removed) */
    filled: Set<string>;
    /** whether the template is selected on this audit (name or copies) — shows the deselect button */
    selected: boolean;
    onApply: (checked: Set<string>) => void;
    onDeselect: () => void;
    onCancel: () => void;
}

interface Group { no: string; title: string; items: (AuditTemplateItem & { id: string; q: number })[] }

export default function AuditTemplatePicker({ template, present, filled, selected, onApply, onDeselect, onCancel }: AuditTemplatePickerProps) {
    const { t } = useLanguage();
    const groups = useMemo(() => {
        const out: Group[] = [];
        for (const it of template.items || []) {
            if (!it.id) continue;
            const no = (it.no || '').trim();
            let g = out.find(x => x.no === no);
            if (!g) { g = { no, title: (it.title || '').trim() || (it.clause || '').split('\n')[0], items: [] }; out.push(g); }
            g.items.push({ ...it, id: it.id, q: g.items.length + 1 });
        }
        return out;
    }, [template]);
    const allIds = useMemo(() => groups.flatMap(g => g.items.map(i => i.id)), [groups]);
    const [checked, setChecked] = useState<Set<string>>(() => new Set(selected ? allIds.filter(id => present.has(id)) : allIds));
    const [open, setOpen] = useState<Set<string>>(() => new Set());

    const toggle = (ids: string[], on: boolean) => setChecked(prev => {
        const next = new Set(prev);
        for (const id of ids) {
            if (filled.has(id)) continue;          // locked: stays checked
            if (on) next.add(id); else next.delete(id);
        }
        return next;
    });
    const toggleOpen = (no: string) => setOpen(prev => { const n = new Set(prev); if (n.has(no)) n.delete(no); else n.add(no); return n; });

    const toAdd = allIds.filter(id => checked.has(id) && !present.has(id)).length;
    const toRemove = allIds.filter(id => !checked.has(id) && present.has(id)).length;
    const allOn = allIds.length > 0 && allIds.every(id => checked.has(id));
    const applyLabel = selected
        ? t('audit.templates.pickerApplyChanges', { add: toAdd, remove: toRemove })
        : t('audit.templates.pickerApply', { n: checked.size });

    return createPortal(
        <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" data-template-picker={template.name}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
                <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3 border-b border-slate-100">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">{t('audit.templates.pickerTitle', { name: template.name })}</h3>
                        <p className="text-xs text-slate-500 mt-1">{t('audit.templates.pickerHint')}</p>
                    </div>
                    <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600 p-1" aria-label={t('common.cancel')}><X size={20} /></button>
                </div>

                <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <input type="checkbox" checked={allOn} onChange={e => toggle(allIds, e.target.checked)} data-picker-all />
                        {t('audit.templates.pickerAll', { n: allIds.length })}
                    </label>
                    <span className="text-xs text-slate-500" data-picker-count>{t('audit.templates.pickerSelected', { n: checked.size, total: allIds.length })}</span>
                </div>

                <div className="overflow-y-auto overflow-x-hidden px-4 py-2 flex-1">
                    {groups.map(g => {
                        const ids = g.items.map(i => i.id);
                        const on = ids.filter(id => checked.has(id)).length;
                        const expanded = open.has(g.no);
                        return (
                            <div key={g.no || '-'} className="border-b border-slate-100 last:border-0" data-picker-group={g.no}>
                                <div className="flex items-center gap-2 py-2">
                                    <button type="button" onClick={() => toggleOpen(g.no)} className="text-slate-400 hover:text-slate-600 p-0.5" aria-label={g.no} aria-expanded={expanded}>
                                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    </button>
                                    <input type="checkbox" checked={on === ids.length} ref={el => { if (el) el.indeterminate = on > 0 && on < ids.length; }}
                                        onChange={e => toggle(ids, e.target.checked)} aria-label={g.no} data-picker-clause={g.no} />
                                    <button type="button" onClick={() => toggleOpen(g.no)} className="flex-1 min-w-0 flex items-baseline gap-2 text-left">
                                        <span className="text-sm font-bold text-teal-700 shrink-0">{g.no || '-'}</span>
                                        <span className="text-sm text-slate-600 truncate min-w-0 flex-1" title={g.title}>{g.title}</span>
                                        <span className="text-xs text-slate-400 shrink-0" data-picker-group-count>{t('audit.templates.pickerGroupCount', { on, n: ids.length })}</span>
                                    </button>
                                </div>
                                {expanded && (
                                    <ul className="pl-12 pb-2 space-y-1.5">
                                        {g.items.map(it => {
                                            const locked = filled.has(it.id);
                                            return (
                                                <li key={it.id}>
                                                    <label className={`flex items-start gap-2 text-sm ${locked ? 'text-slate-500' : 'text-slate-700'}`} title={locked ? t('audit.templates.pickerLocked') : undefined}>
                                                        <input type="checkbox" className="mt-1" checked={checked.has(it.id)} disabled={locked}
                                                            onChange={e => toggle([it.id], e.target.checked)} data-picker-item={it.id} />
                                                        <span className="font-semibold text-slate-500 shrink-0 w-7">Q{it.q}</span>
                                                        <span className="whitespace-pre-line">{it.task}</span>
                                                        {locked && <Lock size={14} className="mt-1 shrink-0 text-amber-600" />}
                                                    </label>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                    <div>
                        {selected && (
                            <button type="button" className={actionStyles.danger} onClick={onDeselect} data-picker-deselect>{t('audit.templates.pickerDeselect')}</button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button type="button" className={actionStyles.secondary} onClick={onCancel}>{t('common.cancel')}</button>
                        <button type="button" className={actionStyles.primary} onClick={() => onApply(checked)}
                            disabled={selected ? toAdd + toRemove === 0 : checked.size === 0} data-picker-apply>{applyLabel}</button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
