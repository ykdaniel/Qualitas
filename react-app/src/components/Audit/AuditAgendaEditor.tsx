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
 *
 * Lunch (AUDIT-BUTTONS-2026-001): when a date first appears in the agenda (the first row of a new day is added, or a row
 * is moved to a day that had none), a 12:00-13:00 "Lunch Time" row (kind 'lunch') is added for that day. It is a default,
 * stored like any row: it can be edited or deleted, and is not added again for a day that already has rows. Every date
 * change reconciles at once: the day the row arrives on gets its lunch if it had no rows, and the day it left loses its
 * lunch when no session remains there and the lunch is still the untouched default. So the intermediate values a typed
 * date goes through (0002-10-01, 0020-10-01, …) or arrow-key steps leave nothing behind, and the table never grows when
 * the field is left — a click straight from the date field onto a button below lands on that button (AUDIT-BUTTONS R3).
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

let nextLunchId = 0;
const isUntouchedLunch = (r: AuditAgendaEntry) => r.kind === 'lunch' && r.start === '12:00' && r.end === '13:00'
    && r.item === 'Lunch Time' && !r.auditee && !r.auditor && !r.remarks;
const lunchRow = (date: string): AuditAgendaEntry => ({
    id: `lunch-${Date.now()}-${nextLunchId++}`, kind: 'lunch', date, start: '12:00', end: '13:00', item: 'Lunch Time', auditee: '', auditor: '', remarks: '',
});

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

    const update = (id: AuditAgendaEntry['id'], field: keyof AuditAgendaEntry, value: string) => {
        const row = rows.find(r => r.id === id);
        let next = rows.map(r => (r.id === id ? { ...r, [field]: value } : r));
        const before = row?.date || '';
        if (field === 'date' && row && row.kind !== 'lunch' && value !== before) {
            // the day left behind: drop its untouched default lunch once no session remains there
            if (before && !next.some(r => r.id !== id && r.kind !== 'lunch' && r.date === before)) {
                next = next.filter(r => !(r.date === before && isUntouchedLunch(r)));
            }
            // the day arrived on: its default lunch, if the agenda had no row on that day yet
            if (value && !rows.some(r => r.id !== id && r.date === value)) next = [...next, lunchRow(value)];
        }
        onChange(next);
    };

    const addRow = () => {
        const last = rows[rows.length - 1];
        const row: AuditAgendaEntry = {
            id: Date.now(),
            // continue the day of the last row (or start on the audit's first day), carry the time on from where it ended
            date: last?.date || startDate || '',
            start: last?.end || '',
            end: '',
            item: '',
            auditee: '',
            auditor: last?.auditor || defaultAuditor || '',
            remarks: '',
        };
        // the first row of a new day also brings that day's default lunch
        const isNewDay = !!row.date && !rows.some(r => r.date === row.date);
        onChange(isNewDay ? [...rows, row, lunchRow(row.date)] : [...rows, row]);
    };

    const removeRow = (id: AuditAgendaEntry['id']) => onChange(rows.filter(r => r.id !== id));

    return (
        <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }} className="space-y-3">
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
                {/* Fixed layout: the audit item takes all the width the other columns leave (at least ~240px — below that the
                    table scrolls sideways inside this box instead of squeezing it); start / end wide enough for a full
                    "下午12:00" plus the clock icon (AUDIT-BUTTONS-2026-001). */}
                <table className="w-full min-w-[1210px] table-fixed text-left border-collapse" data-agenda-table>
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-3 py-3 text-xs font-bold text-slate-500 w-[150px]">{t('audit.agenda.colDate')}</th>
                            <th className="px-3 py-3 text-xs font-bold text-slate-500 w-[156px]">{t('audit.agenda.colStart')}</th>
                            <th className="px-3 py-3 text-xs font-bold text-slate-500 w-[156px]">{t('audit.agenda.colEnd')}</th>
                            <th className="px-3 py-3 text-xs font-bold text-slate-500">{t('audit.agenda.colItem')}</th>
                            <th className="px-3 py-3 text-xs font-bold text-slate-500 w-[150px]">{t('audit.agenda.colAuditee')}</th>
                            <th className="px-3 py-3 text-xs font-bold text-slate-500 w-[120px]">{t('audit.agenda.colAuditor')}</th>
                            <th className="px-3 py-3 text-xs font-bold text-slate-500 w-[150px]">{t('audit.agenda.colRemarks')}</th>
                            <th className="px-2 py-3 w-[52px]" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map(row => {
                            const badTime = agendaRowTimeInvalid(row);
                            const outside = outOfPeriod.includes(row);
                            return (
                                <tr key={row.id} data-agenda-row data-agenda-kind={row.kind || 'session'} className={row.kind === 'lunch' ? 'bg-slate-100' : undefined}>
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
