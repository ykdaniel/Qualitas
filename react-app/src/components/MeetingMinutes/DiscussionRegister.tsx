import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type { DiscussionLogEntry } from '../../store/meetingMinutesStore';
import formStyles from '../Shared/FormShell.module.css';
import actionStyles from '../Shared/FormActions.module.css';
import {
    addEntry, canRemove, currentUpdateIndex, displayNo, formatMinutesDate, isItem, removeEntryWithMap, setCurrentUpdate,
    updateEntry, type EntryKind,
} from './discussionLog';

/** The row being added in "Edit structure" (one at a time). Held by the modal so its unsaved-input guard can see it. */
export interface RegisterAdder {
    parent: string | null;
    kind: EntryKind;
    content: string;
    owner: string;
    targetDate: string;
    status: string;
    raisedDate: string;
}

interface Props {
    log: DiscussionLogEntry[];
    onChange: (log: DiscussionLogEntry[]) => void;
    readOnly: boolean;
    /** the meeting date (else today): default date of this week's updates and of new items */
    meetingDate: string;
    adder: RegisterAdder | null;
    setAdder: (a: RegisterAdder | null) => void;
    /** <datalist> id with attendee / user names for "Action by" */
    peopleListId: string;
}

const HEAD_BG: Record<string, string> = { category: '#e5e7eb', subcategory: '#f1f5f9' };
const cell: React.CSSProperties = { border: '1px solid #cbd5e1', padding: '6px 8px', verticalAlign: 'top' };
const grey = '#94a3b8';
const small: React.CSSProperties = { fontSize: 12, color: grey };

/**
 * The discussion register as the company's minutes print it (# / Discussions & Actions / Action by / Target Date &
 * Status), in two modes (user decision 2026-10-11, MEETING-TABS-2026-001):
 *  - "Weekly update" (default): the open items only, their text read-only; earlier updates listed grey as
 *    "date + text"; one field per item for this week's update (dated with the meeting date) and the status.
 *  - "Edit structure": add / remove categories, sub-categories and items; change text, Action by, target date and
 *    raised date. Rows carried from an earlier meeting keep their text and cannot be removed.
 * Published / Void meetings are read-only in both.
 */
const DiscussionRegister: React.FC<Props> = ({ log, onChange, readOnly, meetingDate, adder, setAdder, peopleListId }) => {
    const { t } = useLanguage();
    const [mode, setMode] = useState<'weekly' | 'structure'>('weekly');
    const [filter, setFilter] = useState<'active' | 'closed' | 'all'>('active');
    // Weekly mode lists the items open when the form opened (plus ones added since): closing one this week keeps it
    // on screen until the form is closed, instead of making it vanish under the cursor.
    const [openAtStart, setOpenAtStart] = useState(() => new Set(log.filter(e => isItem(e) && e.status !== 'Closed').map(e => e.no)));
    // A date picked in an item's "this week" field before any text: kept here until the update exists.
    const [weekDates, setWeekDates] = useState<Record<string, string>>({});

    // ── which rows show ──
    const itemShown = (e: DiscussionLogEntry) => mode === 'weekly'
        ? e.status !== 'Closed' || openAtStart.has(e.no)
        : filter === 'all' || (filter === 'closed' ? e.status === 'Closed' : e.status !== 'Closed');
    const headingShown = (e: DiscussionLogEntry) =>
        log.some(x => isItem(x) && x.no.startsWith(`${e.no}.`) && itemShown(x))
        || (mode === 'structure' && filter !== 'closed');
    const rows = log.filter(e => (isItem(e) ? itemShown(e) : headingShown(e)));

    // ── structure edits ──
    const remove = (no: string) => {
        const { log: next, map } = removeEntryWithMap(log, no);
        onChange(next);
        // everything kept by row number follows the renumbering
        const follow = (n: string) => (n in map ? map[n] : n);
        setOpenAtStart(new Set([...openAtStart].map(follow).filter((n): n is string => !!n)));
        setWeekDates(Object.fromEntries(Object.entries(weekDates).map(([n, d]) => [follow(n), d] as const).filter(([n]) => !!n)));
        if (adder && adder.parent !== null && adder.parent in map) {
            const to = map[adder.parent];
            setAdder(to ? { ...adder, parent: to } : null);
        }
    };
    const startAdding = (parent: string | null, kind: EntryKind) =>
        setAdder({ parent, kind, content: '', owner: '', targetDate: '', status: 'Open', raisedDate: meetingDate });
    const commitAdder = () => {
        if (!adder || !adder.content.trim()) return;
        onChange(addEntry(log, adder.parent, adder.kind, adder.content.trim(),
            { owner: adder.owner, targetDate: adder.targetDate, status: adder.status, raisedDate: adder.raisedDate }));
        setAdder(null);
    };
    const adderParentLabel = () => {
        if (!adder || adder.parent === null) return '';
        const p = log.find(e => e.no === adder.parent);
        return p ? `${displayNo(p)} ${p.content || ''}` : adder.parent;
    };
    const kindLabel = (k: EntryKind) => t(k === 'category' ? 'meetingMinutes.addCategory' : k === 'subcategory' ? 'meetingMinutes.addSubcategory' : 'meetingMinutes.addItem');
    const set = (no: string, patch: Partial<DiscussionLogEntry>) => onChange(updateEntry(log, no, patch));

    const tabButton = (active: boolean): React.CSSProperties => ({
        padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: active ? 700 : 400,
        borderBottom: active ? '2px solid #92702a' : '2px solid transparent', color: active ? '#92702a' : '#64748b',
    });
    const statusText = (e: DiscussionLogEntry) => (e.status === 'Closed' ? t('meetingMinutes.itemStatusClosed') : t('meetingMinutes.itemStatusOpen'));
    const statusSelect = (e: DiscussionLogEntry) => (
        <select className={formStyles.formSelect} value={e.status === 'Closed' ? 'Closed' : 'Open'} aria-label={t('meetingMinutes.itemStatus')}
            onChange={ev => set(e.no, { status: ev.target.value })}>
            <option value="Open">{t('meetingMinutes.itemStatusOpen')}</option>
            <option value="Closed">{t('meetingMinutes.itemStatusClosed')}</option>
        </select>
    );
    const editable = !readOnly;

    /** Earlier updates (and, read-only, this meeting's own) as "date + text". */
    const updateList = (e: DiscussionLogEntry, skipCurrent: boolean) => {
        const cur = skipCurrent ? currentUpdateIndex(e) : -1;
        return (e.updates || []).map((u, i) => i === cur ? null : (
            <div key={i} data-update={`${e.no}#${i}`} style={{ marginTop: 6, color: u.carried ? grey : '#334155' }}>
                <div style={{ fontSize: 12 }}>{formatMinutesDate(u.date)}</div>
                <div style={{ whiteSpace: 'pre-wrap', paddingLeft: 12 }}>{u.content}</div>
            </div>
        ));
    };

    const itemRow = (e: DiscussionLogEntry) => {
        const textEditable = editable && mode === 'structure' && !e.carried;
        const cur = currentUpdateIndex(e);
        const curUpdate = cur >= 0 ? e.updates![cur] : null;
        return (
            <tr key={e.no} data-row={e.no}>
                <td style={cell}>
                    {e.no}
                    {e.carried && <div style={{ fontSize: 11, color: grey }} title={t('meetingMinutes.carriedHint')}>{t('meetingMinutes.carried')}</div>}
                </td>
                <td style={cell}>
                    {mode === 'structure' && editable ? (
                        <label style={{ ...small, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                            {t('meetingMinutes.raisedDate')}
                            <input type="date" className={formStyles.formInput} style={{ width: 160 }} value={e.raisedDate || ''}
                                onChange={ev => set(e.no, { raisedDate: ev.target.value })} />
                        </label>
                    ) : e.raisedDate ? <div style={small} data-raised>{formatMinutesDate(e.raisedDate)}</div> : null}
                    {textEditable
                        ? <textarea className={formStyles.formTextarea} rows={2} value={e.content || ''} aria-label={e.no}
                            onChange={ev => set(e.no, { content: ev.target.value })} />
                        : <div style={{ whiteSpace: 'pre-wrap' }}>{e.content}</div>}
                    {updateList(e, mode === 'weekly' && editable)}
                    {mode === 'weekly' && editable && (
                        <div data-this-week style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 8 }}>
                            <span style={{ fontSize: 12, color: '#92702a', fontWeight: 600, whiteSpace: 'nowrap', paddingTop: 8 }}>{t('meetingMinutes.thisWeek')}</span>
                            <input type="date" className={formStyles.formInput} style={{ width: 150 }} aria-label={t('meetingMinutes.updateDate')}
                                value={curUpdate?.date ?? weekDates[e.no] ?? meetingDate}
                                onChange={ev => (curUpdate
                                    ? onChange(setCurrentUpdate(log, e.no, { date: ev.target.value }, meetingDate))
                                    : setWeekDates({ ...weekDates, [e.no]: ev.target.value }))} />
                            <textarea className={formStyles.formTextarea} rows={2} style={{ flex: 1 }} placeholder={t('meetingMinutes.updateContent')}
                                value={curUpdate?.content ?? ''}
                                onChange={ev => onChange(setCurrentUpdate(log, e.no, { content: ev.target.value }, weekDates[e.no] ?? meetingDate))} />
                        </div>
                    )}
                </td>
                <td style={cell}>
                    {editable && mode === 'structure'
                        ? <input className={formStyles.formInput} list={peopleListId} value={e.owner || ''} aria-label={t('meetingMinutes.colActionBy')}
                            onChange={ev => set(e.no, { owner: ev.target.value })} />
                        : (e.owner || '-')}
                </td>
                <td style={cell}>
                    {editable && mode === 'structure' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <input type="date" className={formStyles.formInput} value={e.targetDate || ''} aria-label={t('meetingMinutes.targetDate')}
                                onChange={ev => set(e.no, { targetDate: ev.target.value })} />
                            {statusSelect(e)}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div>{formatMinutesDate(e.targetDate) || '-'}</div>
                            {editable ? statusSelect(e) : <div>{statusText(e)}</div>}
                        </div>
                    )}
                </td>
                {editable && mode === 'structure' && (
                    <td style={cell}>
                        {canRemove(log, e.no) && (
                            <button type="button" className={actionStyles.iconDanger} aria-label={t('common.delete')} onClick={() => remove(e.no)}><Trash2 size={16} /></button>
                        )}
                    </td>
                )}
            </tr>
        );
    };

    const headingRow = (e: DiscussionLogEntry) => {
        const structure = editable && mode === 'structure';
        return (
            <tr key={e.no} data-row={e.no} style={{ background: HEAD_BG[e.kind || 'category'] }}>
                <td style={{ ...cell, fontWeight: 600 }}>{displayNo(e)}</td>
                <td style={cell} colSpan={3}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {structure && !e.carried
                            ? <input className={formStyles.formInput} style={{ flex: 1, minWidth: 200, fontWeight: 600 }} value={e.content || ''} aria-label={displayNo(e)}
                                onChange={ev => set(e.no, { content: ev.target.value })} />
                            : <strong style={{ flex: 1 }}>{e.content}</strong>}
                        {structure && e.kind === 'category' && (
                            <button type="button" className={formStyles.printButton} onClick={() => startAdding(e.no, 'subcategory')}>
                                <Plus size={14} /> {t('meetingMinutes.addSubcategory')}
                            </button>
                        )}
                        {structure && (
                            <button type="button" className={formStyles.printButton} onClick={() => startAdding(e.no, 'item')}>
                                <Plus size={14} /> {t('meetingMinutes.addItem')}
                            </button>
                        )}
                    </div>
                </td>
                {structure && (
                    <td style={cell}>
                        {canRemove(log, e.no) && (
                            <button type="button" className={actionStyles.iconDanger} aria-label={t('common.delete')} onClick={() => remove(e.no)}><Trash2 size={16} /></button>
                        )}
                    </td>
                )}
            </tr>
        );
    };

    const withDeleteColumn = editable && mode === 'structure';
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10, borderBottom: '1px solid #e2e8f0' }}>
                <div role="tablist" aria-label={t('meetingMinutes.discussionSection')} style={{ display: 'flex', gap: 4 }}>
                    {(['weekly', 'structure'] as const).map(m => (
                        <button key={m} type="button" role="tab" aria-selected={mode === m} style={tabButton(mode === m)}
                            onClick={() => {
                                // the add-row only lives in Edit Structure: leaving it drops the row, after asking if anything was typed
                                if (m === 'weekly' && adder) {
                                    const typed = adder.content.trim() || adder.owner.trim() || adder.targetDate || adder.status !== 'Open';
                                    if (typed && !window.confirm(t('meetingMinutes.discardNewRow'))) return;
                                    setAdder(null);
                                }
                                setMode(m);
                            }}>
                            {m === 'weekly' ? t('meetingMinutes.modeWeekly') : t('meetingMinutes.modeStructure')}
                        </button>
                    ))}
                </div>
                {mode === 'structure' && (
                    <div style={{ display: 'flex', gap: 4 }}>
                        {(['active', 'closed', 'all'] as const).map(f => (
                            <button key={f} type="button" aria-pressed={filter === f} style={tabButton(filter === f)} onClick={() => setFilter(f)}>
                                {f === 'active' ? t('meetingMinutes.tabActive') : f === 'closed' ? t('meetingMinutes.tabClosed') : t('common.all')}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table data-register data-mode={mode} style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            <th style={{ ...cell, width: 64 }}>#</th>
                            <th style={cell}>{t('meetingMinutes.colDiscussion')}</th>
                            <th style={{ ...cell, width: 150 }}>{t('meetingMinutes.colActionBy')}</th>
                            <th style={{ ...cell, width: 160 }}>{t('meetingMinutes.colTarget')}</th>
                            {withDeleteColumn && <th style={{ ...cell, width: 44 }} aria-label={t('common.delete')} />}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && (
                            <tr><td style={{ ...cell, color: grey }} colSpan={withDeleteColumn ? 5 : 4}>
                                {mode === 'weekly' ? t('meetingMinutes.weeklyEmpty') : t('meetingMinutes.emptyRegister')}
                            </td></tr>
                        )}
                        {rows.map(e => (isItem(e) ? itemRow(e) : headingRow(e)))}
                    </tbody>
                </table>
            </div>

            {editable && mode === 'structure' && (adder ? (
                <div data-register-adder style={{ marginTop: 12, border: '1px dashed #cbd5e1', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <strong>{kindLabel(adder.kind)}{adder.parent !== null && <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 12 }}>{t('meetingMinutes.under')} {adderParentLabel()}</span>}</strong>
                    {adder.kind === 'item'
                        ? <textarea className={formStyles.formTextarea} rows={3} value={adder.content} placeholder={t('meetingMinutes.itemPlaceholder')}
                            onChange={ev => setAdder({ ...adder, content: ev.target.value })} />
                        : <input className={formStyles.formInput} value={adder.content}
                            placeholder={t(adder.kind === 'category' ? 'meetingMinutes.categoryPlaceholder' : 'meetingMinutes.subcategoryPlaceholder')}
                            onChange={ev => setAdder({ ...adder, content: ev.target.value })} />}
                    {adder.kind === 'item' && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <label style={{ ...small, display: 'flex', gap: 6, alignItems: 'center' }}>
                                {t('meetingMinutes.raisedDate')}
                                <input type="date" className={formStyles.formInput} style={{ width: 160 }} value={adder.raisedDate}
                                    onChange={ev => setAdder({ ...adder, raisedDate: ev.target.value })} />
                            </label>
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
