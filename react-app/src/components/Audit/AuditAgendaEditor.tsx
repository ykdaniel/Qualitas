import React from 'react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import actionStyles from '../Shared/FormActions.module.css';
import { useLanguage } from '../../context/LanguageContext';
import type { AuditAgendaEntry } from '../../store/auditStore';

/**
 * The audit's daily schedule (AUDIT-AGENDA-2026-001): one row per slot — date, start / end time, audit item / process,
 * auditee, auditor, remarks — edited in place. Rows are sorted by date and start time when the audit is saved
 * (sortAgenda, the same order the backend stores); a row that ends before it starts blocks the save, a date outside the
 * audit period only shows a notice (audits get rescheduled).
 */
interface AuditAgendaEditorProps {
    rows: AuditAgendaEntry[];
    onChange: (rows: AuditAgendaEntry[]) => void;
    readOnly: boolean;
    startDate: string;
    endDate: string;
    defaultAuditor: string;
}

const TEXT_FIELDS: (keyof AuditAgendaEntry)[] = ['date', 'start', 'end', 'item', 'auditee', 'auditor', 'remarks'];

// A row with nothing filled in is dropped on save.
export const isBlankAgendaRow = (row: AuditAgendaEntry) => TEXT_FIELDS.every(f => !String(row[f] ?? '').trim());

export const agendaRowTimeInvalid = (row: AuditAgendaEntry) => !!row.start && !!row.end && row.end < row.start;

// Same order as the backend (schemas._sorted_agenda): by date, then start time; rows without a date / time after the
// others, otherwise in entry order (Array.prototype.sort is stable).
export const sortAgenda = (rows: AuditAgendaEntry[]) => [...rows].sort((a, b) => {
    const key = (r: AuditAgendaEntry): [number, string, number, string] => [r.date ? 0 : 1, r.date || '', r.start ? 0 : 1, r.start || ''];
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) {
        if (ka[i] < kb[i]) return -1;
        if (ka[i] > kb[i]) return 1;
    }
    return 0;
});

const INPUT = 'w-full px-2 py-1.5 bg-[#F5F7FA] border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none text-sm text-slate-800';

export default function AuditAgendaEditor({ rows, onChange, readOnly, startDate, endDate, defaultAuditor }: AuditAgendaEditorProps) {
    const { t } = useLanguage();

    const outOfPeriod = rows.filter(r => r.date && ((startDate && r.date < startDate) || (endDate && r.date > endDate)));

    const update = (id: AuditAgendaEntry['id'], field: keyof AuditAgendaEntry, value: string) =>
        onChange(rows.map(r => (r.id === id ? { ...r, [field]: value } : r)));

    const addRow = () => {
        const last = rows[rows.length - 1];
        onChange([...rows, {
            id: Date.now(),
            // continue the day of the last row (or start on the audit's first day), carry the time on from where it ended
            date: last?.date || startDate || '',
            start: last?.end || '',
            end: '',
            item: '',
            auditee: '',
            auditor: last?.auditor || defaultAuditor || '',
            remarks: '',
        }]);
    };

    const removeRow = (id: AuditAgendaEntry['id']) => onChange(rows.filter(r => r.id !== id));

    return (
        <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }} className="space-y-3">
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full min-w-[920px] text-left border-collapse" data-agenda-table>
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-3 py-3 text-xs font-bold text-slate-500 w-40">{t('audit.agenda.colDate')}</th>
                            <th className="px-3 py-3 text-xs font-bold text-slate-500 w-28">{t('audit.agenda.colStart')}</th>
                            <th className="px-3 py-3 text-xs font-bold text-slate-500 w-28">{t('audit.agenda.colEnd')}</th>
                            <th className="px-3 py-3 text-xs font-bold text-slate-500">{t('audit.agenda.colItem')}</th>
                            <th className="px-3 py-3 text-xs font-bold text-slate-500 w-44">{t('audit.agenda.colAuditee')}</th>
                            <th className="px-3 py-3 text-xs font-bold text-slate-500 w-32">{t('audit.agenda.colAuditor')}</th>
                            <th className="px-3 py-3 text-xs font-bold text-slate-500 w-40">{t('audit.agenda.colRemarks')}</th>
                            <th className="px-2 py-3 w-12" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map(row => {
                            const badTime = agendaRowTimeInvalid(row);
                            const outside = outOfPeriod.includes(row);
                            return (
                                <tr key={row.id} data-agenda-row>
                                    <td className="px-3 py-2">
                                        <input type="date" aria-label={t('audit.agenda.colDate')} value={row.date || ''} onChange={e => update(row.id, 'date', e.target.value)}
                                            className={`${INPUT} ${outside ? 'border-amber-400 bg-amber-50' : ''}`} />
                                    </td>
                                    <td className="px-3 py-2">
                                        <input type="time" aria-label={t('audit.agenda.colStart')} value={row.start || ''} onChange={e => update(row.id, 'start', e.target.value)}
                                            className={`${INPUT} ${badTime ? 'border-red-400 bg-red-50' : ''}`} />
                                    </td>
                                    <td className="px-3 py-2">
                                        <input type="time" aria-label={t('audit.agenda.colEnd')} value={row.end || ''} onChange={e => update(row.id, 'end', e.target.value)}
                                            className={`${INPUT} ${badTime ? 'border-red-400 bg-red-50' : ''}`} />
                                    </td>
                                    <td className="px-3 py-2">
                                        <input type="text" aria-label={t('audit.agenda.colItem')} value={row.item || ''} onChange={e => update(row.id, 'item', e.target.value)}
                                            placeholder={t('audit.agenda.itemPlaceholder')} className={INPUT} />
                                    </td>
                                    <td className="px-3 py-2">
                                        <input type="text" aria-label={t('audit.agenda.colAuditee')} value={row.auditee || ''} onChange={e => update(row.id, 'auditee', e.target.value)}
                                            placeholder={t('audit.agenda.auditeePlaceholder')} className={INPUT} />
                                    </td>
                                    <td className="px-3 py-2">
                                        <input type="text" aria-label={t('audit.agenda.colAuditor')} value={row.auditor || ''} onChange={e => update(row.id, 'auditor', e.target.value)} className={INPUT} />
                                    </td>
                                    <td className="px-3 py-2">
                                        <input type="text" aria-label={t('audit.agenda.colRemarks')} value={row.remarks || ''} onChange={e => update(row.id, 'remarks', e.target.value)} className={INPUT} />
                                    </td>
                                    <td className="px-2 py-2 text-right">
                                        {!readOnly && (
                                            <button className={actionStyles.iconDanger} type="button" onClick={() => removeRow(row.id)} aria-label={t('audit.agenda.removeRow')}>
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {rows.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-6 py-10 text-center text-slate-400 text-sm">{t('audit.agenda.empty')}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {rows.some(agendaRowTimeInvalid) && (
                <p className="flex items-center gap-2 text-sm text-red-600"><AlertCircle size={16} /> {t('audit.agenda.timeOrder')}</p>
            )}
            {outOfPeriod.length > 0 && (
                <p className="flex items-center gap-2 text-sm text-amber-700"><AlertCircle size={16} /> {t('audit.agenda.outsidePeriod')}</p>
            )}

            {!readOnly && (
                <button className={actionStyles.secondary} type="button" onClick={addRow}>
                    <Plus size={16} /> {t('audit.agenda.addRow')}
                </button>
            )}
        </fieldset>
    );
}
