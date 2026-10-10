import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type { DiscussionLogEntry } from '../../store/meetingMinutesStore';
import formStyles from '../Shared/FormShell.module.css';
import actionStyles from '../Shared/FormActions.module.css';
import {
    addEntry, addUpdate, canRemove, displayNo, isItem, removeEntryWithMap, removeUpdate, updateEntry, type EntryKind,
} from './discussionLog';

/** The row being added (one at a time). Held by the modal so its unsaved-input guard can see it. */
export interface RegisterAdder {
    parent: string | null;
    kind: EntryKind;
    content: string;
    owner: string;
    targetDate: string;
    status: string;
}
/** A progress update being typed under an item, by item number. */
export type UpdateDrafts = Record<string, { date: string; content: string }>;

interface Props {
    log: DiscussionLogEntry[];
    onChange: (log: DiscussionLogEntry[]) => void;
    readOnly: boolean;
    /** date a new progress update starts with (the meeting date, else today) */
    defaultUpdateDate: string;
    adder: RegisterAdder | null;
    setAdder: (a: RegisterAdder | null) => void;
    updateDrafts: UpdateDrafts;
    setUpdateDrafts: (d: UpdateDrafts) => void;
    /** <datalist> id with attendee / user names for "Action by" */
    peopleListId: string;
}

const HEAD_BG: Record<string, string> = { category: '#e5e7eb', subcategory: '#f1f5f9' };
const cell: React.CSSProperties = { border: '1px solid #cbd5e1', padding: '6px 8px', verticalAlign: 'top' };
const greyText = '#94a3b8';

/**
 * The discussion register as the company's minutes print it: # / Discussions & Actions / Action by / Target Date &
 * Status, categories (1.0) and sub-categories (1.1) as shaded rows, items with their dated progress updates (rows
 * carried from an earlier meeting grey and read-only). MEETING-TABS-2026-001.
 */
const DiscussionRegister: React.FC<Props> = ({
    log, onChange, readOnly, defaultUpdateDate, adder, setAdder, updateDrafts, setUpdateDrafts, peopleListId,
}) => {
    const { t } = useLanguage();
    const [filter, setFilter] = useState<'active' | 'closed' | 'all'>('active');

    const itemVisible = (e: DiscussionLogEntry) =>
        filter === 'all' || (filter === 'closed' ? e.status === 'Closed' : e.status !== 'Closed');
    const headingVisible = (e: DiscussionLogEntry) =>
        filter !== 'closed' || log.some(x => isItem(x) && x.no.startsWith(`${e.no}.`) && itemVisible(x));
    const rows = log.filter(e => (isItem(e) ? itemVisible(e) : headingVisible(e)));

    // Removing may renumber the rows: whatever is kept by number (updates being typed, the row a new entry goes under)
    // follows its row, and goes away with it.
    const remove = (no: string) => {
        const { log: next, map } = removeEntryWithMap(log, no);
        onChange(next);
        const drafts: UpdateDrafts = {};
        for (const [k, d] of Object.entries(updateDrafts)) {
            const to = k in map ? map[k] : k;
            if (to) drafts[to] = d;
        }
        setUpdateDrafts(drafts);
        if (adder && adder.parent !== null && adder.parent in map) {
            const to = map[adder.parent];
            setAdder(to ? { ...adder, parent: to } : null);
        }
    };
    const startAdding = (parent: string | null, kind: EntryKind) =>
        setAdder({ parent, kind, content: '', owner: '', targetDate: '', status: 'Open' });
    const commitAdder = () => {
        if (!adder || !adder.content.trim()) return;
        onChange(addEntry(log, adder.parent, adder.kind, adder.content.trim(),
            { owner: adder.owner, targetDate: adder.targetDate, status: adder.status }));
        setAdder(null);
    };
    const setUpdateDraft = (no: string, patch: Partial<{ date: string; content: string }> | null) => {
        const next = { ...updateDrafts };
        if (patch === null) delete next[no];
        else next[no] = { ...(next[no] || { date: defaultUpdateDate, content: '' }), ...patch };
        setUpdateDrafts(next);
    };
    const commitUpdate = (no: string) => {
        const d = updateDrafts[no];
        if (!d || !d.content.trim()) return;
        onChange(addUpdate(log, no, { date: d.date, content: d.content.trim() }));
        setUpdateDraft(no, null);
    };
    const setUpdateField = (no: string, index: number, patch: { date?: string; content?: string }) => {
        const e = log.find(x => x.no === no);
        if (!e) return;
        onChange(updateEntry(log, no, { updates: (e.updates || []).map((u, i) => (i === index ? { ...u, ...patch } : u)) }));
    };
    const adderParentLabel = () => {
        if (!adder || adder.parent === null) return '';
        const p = log.find(e => e.no === adder.parent);
        return p ? `${displayNo(p)} ${p.content || ''}` : adder.parent;
    };
    const kindLabel = (k: EntryKind) => t(k === 'category' ? 'meetingMinutes.addCategory' : k === 'subcategory' ? 'meetingMinutes.addSubcategory' : 'meetingMinutes.addItem');

    return (
        <div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, borderBottom: '1px solid #e2e8f0' }}>
                {(['active', 'closed', 'all'] as const).map(f => (
                    <button key={f} type="button" onClick={() => setFilter(f)} style={{
                        padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer',
                        fontWeight: filter === f ? 700 : 400,
                        borderBottom: filter === f ? '2px solid #92702a' : '2px solid transparent',
                        color: filter === f ? '#92702a' : '#64748b',
                    }}>
                        {f === 'active' ? t('meetingMinutes.tabActive') : f === 'closed' ? t('meetingMinutes.tabClosed') : t('common.all')}
                    </button>
                ))}
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table data-register style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            <th style={{ ...cell, width: 64 }}>#</th>
                            <th style={cell}>{t('meetingMinutes.colDiscussion')}</th>
                            <th style={{ ...cell, width: 150 }}>{t('meetingMinutes.colActionBy')}</th>
                            <th style={{ ...cell, width: 160 }}>{t('meetingMinutes.colTarget')}</th>
                            {!readOnly && <th style={{ ...cell, width: 44 }} aria-label={t('common.delete')} />}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && (
                            <tr><td style={{ ...cell, color: greyText }} colSpan={readOnly ? 4 : 5}>{t('meetingMinutes.emptyRegister')}</td></tr>
                        )}
                        {rows.map(e => {
                            const editableText = !readOnly && !e.carried;
                            const removable = !readOnly && canRemove(log, e.no);
                            if (!isItem(e)) {
                                return (
                                    <tr key={e.no} data-row={e.no} style={{ background: HEAD_BG[e.kind || 'category'] }}>
                                        <td style={{ ...cell, fontWeight: 600 }}>{displayNo(e)}</td>
                                        <td style={cell} colSpan={3}>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                                {editableText
                                                    ? <input className={formStyles.formInput} style={{ flex: 1, minWidth: 200, fontWeight: 600 }} value={e.content || ''}
                                                        aria-label={`${displayNo(e)}`}
                                                        onChange={ev => onChange(updateEntry(log, e.no, { content: ev.target.value }))} />
                                                    : <strong style={{ flex: 1 }}>{e.content}</strong>}
                                                {!readOnly && e.kind === 'category' && (
                                                    <button type="button" className={formStyles.printButton} onClick={() => startAdding(e.no, 'subcategory')}>
                                                        <Plus size={14} /> {t('meetingMinutes.addSubcategory')}
                                                    </button>
                                                )}
                                                {!readOnly && (
                                                    <button type="button" className={formStyles.printButton} onClick={() => startAdding(e.no, 'item')}>
                                                        <Plus size={14} /> {t('meetingMinutes.addItem')}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        {!readOnly && (
                                            <td style={cell}>
                                                {removable && (
                                                    <button type="button" className={actionStyles.iconDanger} aria-label={t('common.delete')}
                                                        onClick={() => remove(e.no)}><Trash2 size={16} /></button>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            }
                            const draft = updateDrafts[e.no];
                            return (
                                <tr key={e.no} data-row={e.no}>
                                    <td style={cell}>
                                        {e.no}
                                        {e.carried && <div style={{ fontSize: 11, color: greyText }} title={t('meetingMinutes.carriedHint')}>{t('meetingMinutes.carried')}</div>}
                                    </td>
                                    <td style={cell}>
                                        {editableText
                                            ? <textarea className={formStyles.formTextarea} rows={2} value={e.content || ''} aria-label={e.no}
                                                onChange={ev => onChange(updateEntry(log, e.no, { content: ev.target.value }))} />
                                            : <div style={{ whiteSpace: 'pre-wrap' }}>{e.content}</div>}
                                        {(e.updates || []).map((u, i) => (
                                            <div key={i} data-update={`${e.no}#${i}`} style={{ marginTop: 6, color: u.carried ? greyText : '#334155' }}>
                                                {u.carried || readOnly ? (
                                                    <>
                                                        <div style={{ fontSize: 12 }}>{u.date}</div>
                                                        <div style={{ whiteSpace: 'pre-wrap', paddingLeft: 12 }}>{u.content}</div>
                                                    </>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                                        <input type="date" className={formStyles.formInput} style={{ width: 150 }} value={u.date || ''}
                                                            aria-label={t('meetingMinutes.updateDate')}
                                                            onChange={ev => setUpdateField(e.no, i, { date: ev.target.value })} />
                                                        <textarea className={formStyles.formTextarea} rows={2} style={{ flex: 1 }} value={u.content}
                                                            aria-label={t('meetingMinutes.updateContent')}
                                                            onChange={ev => setUpdateField(e.no, i, { content: ev.target.value })} />
                                                        <button type="button" className={actionStyles.iconDanger} aria-label={t('common.delete')}
                                                            onClick={() => onChange(removeUpdate(log, e.no, i))}><Trash2 size={14} /></button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {!readOnly && (draft ? (
                                            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'flex-start' }}>
                                                <input type="date" className={formStyles.formInput} style={{ width: 150 }} value={draft.date}
                                                    aria-label={t('meetingMinutes.updateDate')}
                                                    onChange={ev => setUpdateDraft(e.no, { date: ev.target.value })} />
                                                <textarea className={formStyles.formTextarea} rows={2} style={{ flex: 1 }} value={draft.content}
                                                    placeholder={t('meetingMinutes.updateContent')}
                                                    onChange={ev => setUpdateDraft(e.no, { content: ev.target.value })} />
                                                <button type="button" className={formStyles.printButton} onClick={() => commitUpdate(e.no)}>{t('common.add')}</button>
                                                <button type="button" className={actionStyles.secondary} onClick={() => setUpdateDraft(e.no, null)}>{t('common.cancel')}</button>
                                            </div>
                                        ) : (
                                            <button type="button" className={formStyles.printButton} style={{ marginTop: 6 }} onClick={() => setUpdateDraft(e.no, {})}>
                                                <Plus size={14} /> {t('meetingMinutes.addUpdate')}
                                            </button>
                                        ))}
                                    </td>
                                    <td style={cell}>
                                        {readOnly
                                            ? (e.owner || '-')
                                            : <input className={formStyles.formInput} list={peopleListId} value={e.owner || ''} aria-label={t('meetingMinutes.colActionBy')}
                                                onChange={ev => onChange(updateEntry(log, e.no, { owner: ev.target.value }))} />}
                                    </td>
                                    <td style={cell}>
                                        {readOnly ? (
                                            <>
                                                <div>{e.targetDate || '-'}</div>
                                                <div>{e.status === 'Closed' ? t('meetingMinutes.itemStatusClosed') : t('meetingMinutes.itemStatusOpen')}</div>
                                            </>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <input type="date" className={formStyles.formInput} value={e.targetDate || ''} aria-label={t('meetingMinutes.targetDate')}
                                                    onChange={ev => onChange(updateEntry(log, e.no, { targetDate: ev.target.value }))} />
                                                <select className={formStyles.formSelect} value={e.status === 'Closed' ? 'Closed' : 'Open'} aria-label={t('meetingMinutes.itemStatus')}
                                                    onChange={ev => onChange(updateEntry(log, e.no, { status: ev.target.value }))}>
                                                    <option value="Open">{t('meetingMinutes.itemStatusOpen')}</option>
                                                    <option value="Closed">{t('meetingMinutes.itemStatusClosed')}</option>
                                                </select>
                                            </div>
                                        )}
                                    </td>
                                    {!readOnly && (
                                        <td style={cell}>
                                            {removable && (
                                                <button type="button" className={actionStyles.iconDanger} aria-label={t('common.delete')}
                                                    onClick={() => remove(e.no)}><Trash2 size={16} /></button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {!readOnly && (adder ? (
                <div data-register-adder style={{ marginTop: 12, border: '1px dashed #cbd5e1', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <strong>{kindLabel(adder.kind)}{adder.parent !== null && <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 12 }}>{t('meetingMinutes.under')} {adderParentLabel()}</span>}</strong>
                    {adder.kind === 'item'
                        ? <textarea className={formStyles.formTextarea} rows={3} value={adder.content} placeholder={t('meetingMinutes.itemPlaceholder')}
                            onChange={ev => setAdder({ ...adder, content: ev.target.value })} />
                        : <input className={formStyles.formInput} value={adder.content}
                            placeholder={t(adder.kind === 'category' ? 'meetingMinutes.categoryPlaceholder' : 'meetingMinutes.subcategoryPlaceholder')}
                            onChange={ev => setAdder({ ...adder, content: ev.target.value })} />}
                    {adder.kind === 'item' && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <input className={formStyles.formInput} list={peopleListId} style={{ flex: 2, minWidth: 160 }} value={adder.owner}
                                placeholder={t('meetingMinutes.colActionBy')} onChange={ev => setAdder({ ...adder, owner: ev.target.value })} />
                            <input type="date" className={formStyles.formInput} style={{ flex: 1, minWidth: 150 }} value={adder.targetDate}
                                aria-label={t('meetingMinutes.targetDate')} onChange={ev => setAdder({ ...adder, targetDate: ev.target.value })} />
                            <select className={formStyles.formSelect} style={{ flex: 1, minWidth: 120 }} value={adder.status}
                                aria-label={t('meetingMinutes.itemStatus')} onChange={ev => setAdder({ ...adder, status: ev.target.value })}>
                                <option value="Open">{t('meetingMinutes.itemStatusOpen')}</option>
                                <option value="Closed">{t('meetingMinutes.itemStatusClosed')}</option>
                            </select>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className={formStyles.printButton} onClick={commitAdder} disabled={!adder.content.trim()}>
                            <Plus size={14} /> {t('common.add')}
                        </button>
                        <button type="button" className={actionStyles.secondary} onClick={() => setAdder(null)}>{t('common.cancel')}</button>
                    </div>
                </div>
            ) : (
                <button type="button" className={formStyles.printButton} style={{ marginTop: 12 }} onClick={() => startAdding(null, 'category')}>
                    <Plus size={16} /> {t('meetingMinutes.addCategory')}
                </button>
            ))}
        </div>
    );
};

export default DiscussionRegister;
