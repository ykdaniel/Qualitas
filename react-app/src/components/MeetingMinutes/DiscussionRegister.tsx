import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../context/LanguageContext';
import type { DiscussionLogEntry, ProgressUpdate } from '../../store/meetingMinutesStore';
import formStyles from '../Shared/FormShell.module.css';
import styles from './DiscussionRegister.module.css';
import {
    addEntry, addUpdate, canRemove, displayNo, formatMinutesDate, isItem, localToday, nextNo, parentOf, patchUpdate, progressProblem,
    removeEntryWithMap, removeUpdate, updateEntry, updatesByDate, type EntryKind, type ProgressProblem,
} from './discussionLog';

/** The latest day a progress note may carry: today, or the meeting date when the minutes are prepared ahead of it. */
export const latestNoteDate = (meetingDate: string) => (meetingDate > localToday() ? meetingDate : localToday());

/** Why a progress note cannot be applied or saved, and what to do. */
export function progressProblemText(t: (key: string, params?: Record<string, string | number>) => string,
    problem: ProgressProblem, raisedDate: string | undefined, latest: string): string {
    return t(`meetingMinutes.note_${problem}`, { raised: formatMinutesDate(raisedDate), latest: formatMinutesDate(latest) });
}

/**
 * The one row being edited in place (✏️), or being added (`no` null — not in the log until ✓). Held by the modal so
 * its unsaved-input guard and Save check can see it.
 */
export interface RegisterEdit {
    no: string | null;
    parent: string | null;
    kind: EntryKind;
    content: string;
    owner: string;
    targetDate: string;
    raisedDate: string;
}

/** Whether the open edit holds anything the user would lose: a new row with any text, or a change to an existing row. */
export function isEditDirty(edit: RegisterEdit | null, log: DiscussionLogEntry[]): boolean {
    if (!edit) return false;
    if (edit.no === null) return !!(edit.content.trim() || edit.owner.trim() || edit.targetDate);
    const e = log.find(x => x.no === edit.no);
    if (!e) return false;
    return (e.content || '') !== edit.content || (isItem(e) && ((e.owner || '') !== edit.owner
        || (e.targetDate || '') !== edit.targetDate || (e.raisedDate || '') !== edit.raisedDate));
}

interface Props {
    log: DiscussionLogEntry[];
    onChange: (log: DiscussionLogEntry[]) => void;
    readOnly: boolean;
    /** the meeting date (else today): default date of this week's updates and of new items */
    meetingDate: string;
    edit: RegisterEdit | null;
    setEdit: (e: RegisterEdit | null) => void;
    /** <datalist> id with attendee / user names for "Action by" */
    peopleListId: string;
}

const without = <T,>(rec: Record<string, T>, key: string): Record<string, T> =>
    Object.fromEntries(Object.entries(rec).filter(([k]) => k !== key));
const HEAD_BG: Record<string, string> = { category: '#e5e7eb', subcategory: '#f1f5f9' };
const cell: React.CSSProperties = { border: '1px solid #cbd5e1', padding: '6px 8px', verticalAlign: 'top' };
const grey = '#94a3b8';
const small: React.CSSProperties = { fontSize: 12, color: grey };
// Compact controls that stay inside their cell (user, 2026-10-11: "太大 要符合欄寬"): small text, tight padding, no wrap.
const mini: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 2, padding: '2px 6px', fontSize: 12, lineHeight: 1.3,
    borderWidth: 1, borderStyle: 'solid', borderColor: '#d6c9ad', borderRadius: 4, background: '#fff', color: '#7a5c1e', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
};


/** A textarea as tall as its content (one line when empty) — no fixed height, no scrollbar. */
const AutoText: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className, value, ...rest }) => {
    const ref = useRef<HTMLTextAreaElement>(null);
    const fit = () => {
        const el = ref.current;
        if (!el || el.offsetWidth === 0) return;                 // inside a hidden tab: measured when it shows
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight + 2}px`;            // + the 1px top / bottom border
    };
    useLayoutEffect(fit, [value]);
    // re-fit when the width changes (a hidden tab shown, a window resized) — width only, so setting the height cannot loop
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        let width = el.offsetWidth;
        const ro = new ResizeObserver(() => { if (el.offsetWidth !== width) { width = el.offsetWidth; fit(); } });
        ro.observe(el);
        // a web font arriving after the first measurement changes the wrapping: measure once more
        let alive = true;
        document.fonts?.ready.then(() => { if (alive) fit(); });
        return () => { alive = false; ro.disconnect(); };
    }, []);
    return <textarea ref={ref} rows={1} value={value} className={`${formStyles.formTextarea} ${styles.autoText} ${className || ''}`} {...rest} />;
};

/**
 * The discussion register as the company's minutes print it (# / Discussions & Actions / Action by / Target Date &
 * Status) — one screen, edited in place (user decision 2026-10-11, MEETING-TABS-2026-001):
 *  - open items by default ("Show closed" adds the rest); each item reads as text: raised date, text, earlier updates
 *    grey as date + text, and a date + field for this week's update (no label; the placeholder says what it is — user, 2026-10-11); the status is a dropdown;
 *  - ✏️ turns that one row into inputs (text, Action by, target and raised date), ✓ applies, ✕ cancels — one row at a
 *    time; 🗑 asks first; a new item / category opens straight in edit;
 *  - rows carried from an earlier meeting keep their text (only Action by / target date / status change) and stay;
 *  - Published / Void: everything read-only, no buttons, no this-week field.
 */
const DiscussionRegister: React.FC<Props> = ({ log, onChange, readOnly, meetingDate, edit, setEdit, peopleListId }) => {
    const { t } = useLanguage();
    const editable = !readOnly;
    const [showClosed, setShowClosed] = useState(false);
    // Items open when the form opened (plus ones added since): one closed this week stays on screen, with its
    // this-week field, until the form is closed.
    const [openAtStart, setOpenAtStart] = useState(() => new Set(log.filter(e => isItem(e) && e.status !== 'Closed').map(e => e.no)));
    // The heading (category / sub-category) of the row last clicked or focused: where "Add Sub-category" / "Add Item"
    // in the toolbar put the new row by default (user, 2026-10-11: all three add buttons in the toolbar).
    const [contextNo, setContextNo] = useState<string | null>(null);
    // Progress notes (user, 2026-10-11: "同一列可以多個日期 如果我忘記補充資料可以補上去"): an item can get any number in
    // one meeting, each on its own day (a missed day can be filled in later); shown and printed in date order.
    // The note being typed in an item's "Add progress…" field is written into the log as it is typed (Save never
    // loses it) — `pending` holds its index in `updates`; ✓ files it and empties the field for the next one.
    const [pending, setPending] = useState<Record<string, number>>({});
    // The day picked in an item's field before any text (the meeting date until changed).
    const [noteDates, setNoteDates] = useState<Record<string, string>>({});
    // One of this meeting's notes opened with ✏️: changed in place; ✕ / Esc put back `orig`.
    const [noteEdit, setNoteEdit] = useState<{ no: string; i: number; orig: ProgressUpdate } | null>(null);
    // Where ✓ was refused for an empty note ("new:1.2" for the field, "1.2#0" for a ✏️ note) — shown in red until fixed.
    const [noteRefused, setNoteRefused] = useState<string | null>(null);
    const latest = latestNoteDate(meetingDate);

    const activeThisMeeting = (e: DiscussionLogEntry) => e.status !== 'Closed' || openAtStart.has(e.no);
    const itemShown = (e: DiscussionLogEntry) => showClosed || activeThisMeeting(e);
    // a heading shows unless everything under it is hidden closed items (an empty new heading shows, to add into)
    const headingShown = (e: DiscussionLogEntry) => {
        const items = log.filter(x => isItem(x) && x.no.startsWith(`${e.no}.`));
        return items.length === 0 || items.some(itemShown) || log.some(x => !isItem(x) && x.no.startsWith(`${e.no}.`) && headingShown(x));
    };
    const rows = log.filter(e => (isItem(e) ? itemShown(e) : headingShown(e)));

    // ── edits ──
    const set = (no: string, patch: Partial<DiscussionLogEntry>) => onChange(updateEntry(log, no, patch));
    const startEdit = (e: DiscussionLogEntry) => setEdit({
        no: e.no, parent: null, kind: e.kind || 'item', content: e.content || '', owner: e.owner || '',
        targetDate: e.targetDate || '', raisedDate: e.raisedDate || '',
    });
    const startNew = (parent: string | null, kind: EntryKind) =>
        setEdit({ no: null, parent, kind, content: '', owner: '', targetDate: '', raisedDate: meetingDate });
    const categories = log.filter(e => e.kind === 'category');
    /** The heading a row belongs to: itself for a heading, its parent for an item. */
    const headingOf = (no: string) => (isItem(log.find(e => e.no === no) || { no, kind: 'item' }) ? parentOf(no) : no);
    // Two levels only (user, 2026-10-11): new items go straight under a category (x.0 → x.y). Sub-categories of older
    // meetings stay as they are — shown, their title editable, their x.y.z items editable and carried — but nothing
    // new is added under them; an item for that topic goes under its category.
    const parentChoices = (_kind: EntryKind) => categories;
    // default parent: the category of the row last clicked (or of the row just added), else the last category
    const defaultParent = (from: string | null = contextNo, trusted = false) => {
        if (trusted && from) return from.split('.')[0];             // a category just added: not in `log` until the next render
        const ctx = from && log.some(e => e.no === from) ? from.split('.')[0] : null;
        const wanted = ctx ?? (categories.length ? categories[categories.length - 1].no : null);
        return categories.some(h => h.no === wanted) ? wanted : (categories[0]?.no ?? null);
    };
    /** Applies the open row (✓). Returns its number and where the next Add should go, or null when the row has no text yet. */
    const commit = (): { no: string; ctx: string | null; newCategory: boolean } | null => {
        if (!edit || !edit.content.trim()) return null;
        let ctx: string | null;
        let no = edit.no ?? '';
        if (edit.no === null) {
            const newNo = nextNo(log, edit.parent);
            no = newNo;
            // a new item counts as open this meeting: closed later in the same session, it stays on screen
            if (edit.kind === 'item') setOpenAtStart(new Set([...openAtStart, newNo]));
            // the next Add goes where this one went: under the new heading, or beside the new item
            ctx = edit.kind === 'item' ? edit.parent : newNo;
            onChange(addEntry(log, edit.parent, edit.kind, edit.content.trim(),
                { owner: edit.owner, targetDate: edit.targetDate, raisedDate: edit.raisedDate }));
        } else {
            const e = log.find(x => x.no === edit.no);
            const patch: Partial<DiscussionLogEntry> = e?.carried ? {} : { content: edit.content.trim() };
            if (e && isItem(e)) Object.assign(patch, { owner: edit.owner, targetDate: edit.targetDate, ...(e.carried ? {} : { raisedDate: edit.raisedDate }) });
            set(edit.no, patch);
            ctx = headingOf(edit.no);
        }
        setContextNo(ctx);
        setEdit(null);
        return { no, ctx, newCategory: edit.no === null && edit.kind === 'category' };
    };
    // After ✓ the focus goes to "Add Item", so typing on is one key away — no empty row is opened by itself
    // (user, 2026-10-11: "按完一次後就消失了 這樣不能一直編輯下去").
    const addItemRef = useRef<HTMLButtonElement>(null);
    // the open row an Add was refused for; any change to the row makes a new `edit` object, which clears it
    const [rowError, setRowError] = useState<RegisterEdit | null>(null);
    const editHint = (
        rowError && rowError === edit
            ? <div data-edit-hint role="alert" style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{t('meetingMinutes.rowNeedsText')}</div>
            : <div data-edit-hint style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{t('meetingMinutes.editHint')}</div>
    );
    const [focusAddItem, setFocusAddItem] = useState(0);
    useEffect(() => { if (focusAddItem) addItemRef.current?.focus(); }, [focusAddItem]);
    const apply = () => { if (commit()) setFocusAddItem(n => n + 1); };
    /**
     * Add Category / Add Item while a row is open: a blank new row (or an unchanged ✏️ row) is simply replaced; a changed row with its text is applied
     * first (as ✓) and the new one opens after it; a row with other input but no text stays, and says why.
     */
    const addFromToolbar = (kind: 'category' | 'item') => {
        let from = contextNo;
        let trusted = false;
        if (edit && !isEditDirty(edit, log)) {
            // a blank new row is replaced; a ✏️ row opened but not changed is just closed (nothing to apply or announce)
            if (edit.no !== null) from = headingOf(edit.no);
        } else if (edit) {
            const done = commit();
            if (!done) {
                // said twice: a toast, and in red under the row itself (until the row is changed)
                toast.error(t('meetingMinutes.rowNeedsText'));
                setRowError(edit);
                document.querySelector<HTMLTextAreaElement>('[data-register] [data-editing] textarea')?.focus();
                return;
            }
            // applied to the minutes on screen only — the Save button still has to write it
            const shown = log.find(x => x.no === done.no) ?? { no: done.no, kind: edit.kind };
            toast.success(t('meetingMinutes.rowApplied', { no: displayNo(shown as DiscussionLogEntry) }));
            from = done.ctx;
            trusted = done.newCategory;
        }
        if (kind === 'category') startNew(null, 'category');
        else startNew(defaultParent(from, trusted), 'item');
    };
    const remove = (e: DiscussionLogEntry) => {
        if (!window.confirm(t(isItem(e) ? 'meetingMinutes.confirmDeleteItem' : 'meetingMinutes.confirmDeleteRow', { no: displayNo(e) }))) return;
        const { log: next, map } = removeEntryWithMap(log, e.no);
        onChange(next);
        // everything kept by row number follows the renumbering
        const follow = (n: string) => (n in map ? map[n] : n);
        if (contextNo !== null) setContextNo(follow(contextNo));
        setOpenAtStart(new Set([...openAtStart].map(follow).filter((n): n is string => !!n)));
        const followKeys = <T,>(rec: Record<string, T>) =>
            Object.fromEntries(Object.entries(rec).map(([n, v]) => [follow(n), v] as const).filter(([n]) => !!n)) as Record<string, T>;
        setNoteDates(followKeys(noteDates));
        setPending(followKeys(pending));
        if (noteEdit) setNoteEdit(follow(noteEdit.no) ? { ...noteEdit, no: follow(noteEdit.no)! } : null);
        setNoteRefused(null);
        if (edit) {
            const no = edit.no !== null ? follow(edit.no) : null;
            const parent = edit.parent !== null ? follow(edit.parent) : null;
            if ((edit.no !== null && !no) || (edit.parent !== null && !parent)) setEdit(null);
            else setEdit({ ...edit, no, parent });
        }
    };

    const iconButton = (label: string, icon: React.ReactNode, onClick: () => void, danger = false, disabled = false) => (
        <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
            className={`${styles.iconBtn} ${danger ? styles.danger : ''}`}>{icon}</button>
    );
    /** A compact add button; `disabledReason` disables it and says why — as a tooltip, and on click (aria-disabled keeps it
     *  focusable, so keyboard and screen-reader users get the reason too). */
    const addButton = (label: string, onClick: () => void, disabledReason?: string, ref?: React.Ref<HTMLButtonElement>) => (
        <button type="button" ref={ref} style={{ ...mini, ...(disabledReason ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}
            aria-disabled={disabledReason ? true : undefined} title={disabledReason}
            onClick={() => (disabledReason ? toast.info(disabledReason) : onClick())}><Plus size={12} /> {label}</button>
    );
    const rowButtons = (e: DiscussionLogEntry) => editable && !edit && (
        <div className={styles.rowActions} data-row-actions>
            {iconButton(t('meetingMinutes.editRow'), <Pencil size={14} />, () => startEdit(e))}
            {canRemove(log, e.no) && iconButton(t('common.delete'), <Trash2 size={14} />, () => remove(e), true)}
        </div>
    );
    /** Esc anywhere in the row being added / edited = ✕ (user, 2026-10-11: "按錯了…一般是按ESC"). Handled here and not
     *  passed on, so it never closes the form or reaches the leave guard; outside an edit Esc keeps its usual meaning.
     *  (Enter = ✓ was left out on purpose: in "Action by" Enter also picks a suggestion and confirms Chinese IME input.) */
    const escToCancel = (ev: React.KeyboardEvent) => {
        // keyCode 229: Safari ends IME composition before this keydown, so isComposing alone misses it
        if (ev.key !== 'Escape' || ev.nativeEvent.isComposing || ev.nativeEvent.keyCode === 229) return;
        ev.preventDefault();
        ev.stopPropagation();
        setEdit(null);
    };
    const applyButtons = (
        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            {iconButton(t('meetingMinutes.applyRow'), <Check size={16} />, apply, false, !edit?.content.trim())}
            {iconButton(t('meetingMinutes.cancelRow'), <X size={16} />, () => setEdit(null))}
        </div>
    );
    const statusSelect = (e: DiscussionLogEntry) => (
        <select className={formStyles.formSelect} value={e.status === 'Closed' ? 'Closed' : 'Open'} aria-label={t('meetingMinutes.itemStatus')}
            onChange={ev => set(e.no, { status: ev.target.value })}>
            <option value="Open">{t('meetingMinutes.itemStatusOpen')}</option>
            <option value="Closed">{t('meetingMinutes.itemStatusClosed')}</option>
        </select>
    );
    const statusText = (e: DiscussionLogEntry) => (e.status === 'Closed' ? t('meetingMinutes.itemStatusClosed') : t('meetingMinutes.itemStatusOpen'));
    const raisedInput = (value: string, onValue: (v: string) => void) => (
        <label style={{ ...small, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            {t('meetingMinutes.raisedDate')}
            <input type="date" className={formStyles.formInput} style={{ width: 160 }} value={value} onChange={ev => onValue(ev.target.value)} />
        </label>
    );

    /** Earlier updates as "date + text" (grey when from an earlier meeting); this meeting's own goes in the field. */
    // ── progress notes ──
    const noteProblemLine = (problem: ProgressProblem | null, raisedDate: string | undefined) => problem && (
        <div data-note-problem role="alert" style={{ fontSize: 12, color: '#dc2626', marginTop: 2 }}>
            {progressProblemText(t, problem, raisedDate, latest)}
        </div>
    );
    // a day problem shows while typing; an empty note only once ✓ was refused for it
    const dayProblem = (u: ProgressUpdate | undefined, raisedDate: string | undefined) => {
        const p = u ? progressProblem(u, raisedDate, latest) : null;
        return p === 'noText' ? null : p;
    };
    const typeNote = (e: DiscussionLogEntry, text: string) => {
        const i = pending[e.no];
        setNoteRefused(null);
        if (i === undefined) {
            if (!text.trim()) return;                                // spaces alone write nothing
            onChange(addUpdate(log, e.no, { date: noteDates[e.no] ?? meetingDate, content: text }));
            setPending({ ...pending, [e.no]: (e.updates || []).length });
        } else if (!text.trim()) {
            // emptied again: the note goes, its day stays in the field
            setNoteDates({ ...noteDates, [e.no]: e.updates?.[i]?.date ?? meetingDate });
            onChange(removeUpdate(log, e.no, i));
            setPending(without(pending, e.no));
        } else {
            onChange(patchUpdate(log, e.no, i, { content: text }));
        }
    };
    const setNoteDay = (e: DiscussionLogEntry, day: string) => {
        const i = pending[e.no];
        if (i === undefined) setNoteDates({ ...noteDates, [e.no]: day });
        else onChange(patchUpdate(log, e.no, i, { date: day }));
    };
    /** ✓ on the field: files the note (it already is in the log) and empties the field for the next one. */
    const fileNote = (e: DiscussionLogEntry) => {
        const i = pending[e.no];
        const u = i === undefined ? undefined : e.updates?.[i];
        const problem = u ? progressProblem(u, e.raisedDate, latest) : 'noText';
        if (problem) {
            toast.error(progressProblemText(t, problem, e.raisedDate, latest));
            if (problem === 'noText') setNoteRefused(`new:${e.no}`);
            return;
        }
        setPending(without(pending, e.no));
        setNoteDates(without(noteDates, e.no));                      // the next note starts on the meeting date again
        setNoteRefused(null);
    };
    const dropPendingNote = (e: DiscussionLogEntry) => {
        const i = pending[e.no];
        if (i !== undefined) onChange(removeUpdate(log, e.no, i));
        setPending(without(pending, e.no));
        setNoteRefused(null);
    };
    const applyNote = (e: DiscussionLogEntry) => {
        if (!noteEdit) return;
        const u = e.updates?.[noteEdit.i];
        const problem = u ? progressProblem(u, e.raisedDate, latest) : null;
        if (problem) {
            toast.error(progressProblemText(t, problem, e.raisedDate, latest));
            if (problem === 'noText') setNoteRefused(`${e.no}#${noteEdit.i}`);
            return;
        }
        setNoteEdit(null);
        setNoteRefused(null);
    };
    const cancelNote = () => {
        if (!noteEdit) return;
        onChange(patchUpdate(log, noteEdit.no, noteEdit.i, noteEdit.orig));
        setNoteEdit(null);
        setNoteRefused(null);
    };
    const deleteNote = (e: DiscussionLogEntry, i: number) => {
        const u = e.updates?.[i];
        if (!u || !window.confirm(t('meetingMinutes.confirmDeleteNote', { date: formatMinutesDate(u.date) || '-' }))) return;
        onChange(removeUpdate(log, e.no, i));
        const p = pending[e.no];
        if (p !== undefined && p > i) setPending({ ...pending, [e.no]: p - 1 });
    };
    const escKey = (ev: React.KeyboardEvent, then: () => void) => {
        if (ev.key !== 'Escape' || ev.nativeEvent.isComposing || ev.nativeEvent.keyCode === 229) return;
        ev.preventDefault();
        ev.stopPropagation();
        then();
    };
    const dayInput = (value: string, onDay: (v: string) => void, raisedDate: string | undefined) => (
        <input type="date" className={formStyles.formInput} style={{ width: 150, height: 34, paddingTop: 4, paddingBottom: 4 }}
            aria-label={t('meetingMinutes.updateDate')} value={value} min={raisedDate || undefined} max={latest}
            onChange={ev => onDay(ev.target.value)} />
    );
    /** The item's notes in date order (the one still in the "Add progress…" field left out); this meeting's own have ✏️ / 🗑. */
    const noteList = (e: DiscussionLogEntry, withField: boolean) => updatesByDate(e).map(({ u, i }) => {
        if (withField && pending[e.no] === i) return null;
        if (noteEdit && noteEdit.no === e.no && noteEdit.i === i) {
            const refused = noteRefused === `${e.no}#${i}` && !u.content.trim();
            return (
                <div key={i} data-update={`${e.no}#${i}`} data-note-editing onKeyDown={ev => escKey(ev, cancelNote)} style={{ marginTop: 6 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        {dayInput(u.date, v => onChange(patchUpdate(log, e.no, i, { date: v })), e.raisedDate)}
                        <AutoText style={{ flex: 1 }} value={u.content} autoFocus aria-label={t('meetingMinutes.updateContent')}
                            onChange={ev => { setNoteRefused(null); onChange(patchUpdate(log, e.no, i, { content: ev.target.value })); }} />
                        {iconButton(t('meetingMinutes.applyRow'), <Check size={16} />, () => applyNote(e))}
                        {iconButton(t('meetingMinutes.cancelRow'), <X size={16} />, cancelNote)}
                    </div>
                    {noteProblemLine(refused ? 'noText' : dayProblem(u, e.raisedDate), e.raisedDate)
                        || <div data-edit-hint style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{t('meetingMinutes.editHint')}</div>}
                </div>
            );
        }
        const own = editable && !u.carried && !noteEdit;
        return (
            <div key={i} data-update={`${e.no}#${i}`} style={{ marginTop: 6, color: u.carried ? grey : '#334155' }}>
                <div style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span>{formatMinutesDate(u.date)}</span>
                    {own && (
                        <span className={styles.rowActions} style={{ display: 'inline-flex' }} data-note-actions>
                            {iconButton(t('meetingMinutes.editNote'), <Pencil size={12} />, () => { setNoteRefused(null); setNoteEdit({ no: e.no, i, orig: u }); })}
                            {iconButton(t('meetingMinutes.deleteNote'), <Trash2 size={12} />, () => deleteNote(e, i), true)}
                        </span>
                    )}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', paddingLeft: 12 }}>{u.content}</div>
            </div>
        );
    });
    /** "Add progress…": a day (the meeting date unless changed, may go back to fill in a missed day) and the text. */
    const noteField = (e: DiscussionLogEntry) => {
        const i = pending[e.no];
        const u = i === undefined ? undefined : e.updates?.[i];
        const refused = noteRefused === `new:${e.no}` && !u;
        return (
            // Esc drops the note being typed; with nothing typed it is left to the row (✏️ row edit: cancel the row)
            <div data-this-week-block onKeyDown={ev => { if (i !== undefined) escKey(ev, () => dropPendingNote(e)); }}>
                <div data-this-week style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 8 }}>
                    {dayInput(u?.date ?? noteDates[e.no] ?? meetingDate, v => setNoteDay(e, v), e.raisedDate)}
                    <AutoText style={{ flex: 1 }} placeholder={t('meetingMinutes.updateContent')}
                        value={u?.content ?? ''} onChange={ev => typeNote(e, ev.target.value)} />
                    {iconButton(t('meetingMinutes.fileNote'), <Check size={16} />, () => fileNote(e))}
                </div>
                {noteProblemLine(refused ? 'noText' : dayProblem(u ?? { date: noteDates[e.no] ?? meetingDate, content: 'x' }, e.raisedDate), e.raisedDate)}
            </div>
        );
    };

    const itemRow = (e: DiscussionLogEntry) => {
        const editing = edit?.no === e.no ? edit : null;
        const weekField = editable && activeThisMeeting(e);
        return (
            <tr key={e.no} data-row={e.no} data-editing={editing ? '' : undefined} onKeyDown={editing ? escToCancel : undefined}
                onMouseDown={() => setContextNo(headingOf(e.no))} onFocus={() => setContextNo(headingOf(e.no))}>
                <td style={cell}>
                    {e.no}
                    {e.carried && <div style={{ fontSize: 11, color: grey }} title={t('meetingMinutes.carriedHint')}>{t('meetingMinutes.carried')}</div>}
                </td>
                <td style={cell}>
                    {editing && !e.carried
                        ? raisedInput(editing.raisedDate, v => setEdit({ ...editing, raisedDate: v }))
                        : e.raisedDate ? <div style={small} data-raised>{formatMinutesDate(e.raisedDate)}</div> : null}
                    {editing && !e.carried
                        ? <AutoText value={editing.content} aria-label={e.no}
                            onChange={ev => setEdit({ ...editing, content: ev.target.value })} />
                        // under its raised date, indented like every progress update below it: one "date / text" list
                        : <div data-item-text style={{ whiteSpace: 'pre-wrap', paddingLeft: e.raisedDate ? 12 : 0 }}>{e.content}</div>}
                    {editing && editHint}
                    {noteList(e, weekField)}
                    {weekField && noteField(e)}
                </td>
                <td style={cell}>
                    {editing
                        ? <input className={formStyles.formInput} list={peopleListId} value={editing.owner} aria-label={t('meetingMinutes.colActionBy')}
                            onChange={ev => setEdit({ ...editing, owner: ev.target.value })} />
                        : (e.owner || '-')}
                </td>
                <td style={cell}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {editing
                            ? <input type="date" className={formStyles.formInput} value={editing.targetDate} aria-label={t('meetingMinutes.targetDate')}
                                onChange={ev => setEdit({ ...editing, targetDate: ev.target.value })} />
                            : <div>{formatMinutesDate(e.targetDate) || '-'}</div>}
                        {editable ? statusSelect(e) : <div>{statusText(e)}</div>}
                    </div>
                </td>
                {editable && <td style={cell}>{editing ? applyButtons : rowButtons(e)}</td>}
            </tr>
        );
    };

    const headingRow = (e: DiscussionLogEntry) => {
        const editing = edit?.no === e.no ? edit : null;
        return (
            <tr key={e.no} data-row={e.no} data-editing={editing ? '' : undefined} onKeyDown={editing ? escToCancel : undefined} style={{ background: HEAD_BG[e.kind || 'category'] }}
                onMouseDown={() => setContextNo(e.no)} onFocus={() => setContextNo(e.no)}>
                <td style={{ ...cell, fontWeight: 600 }}>{displayNo(e)}</td>
                <td style={cell} colSpan={3}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {editing
                            ? <AutoText style={{ flex: 1, minWidth: 0, fontWeight: 600 }} value={editing.content} aria-label={displayNo(e)}
                                onChange={ev => setEdit({ ...editing, content: ev.target.value })} />
                            : <strong style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{e.content}</strong>}
                    </div>
                    {editing && editHint}
                </td>
                {editable && <td style={cell}>{editing ? applyButtons : (!e.carried ? rowButtons(e) : null)}</td>}
            </tr>
        );
    };

    /** The row being added, shown where it will go (after its parent's last row, or at the end for a category). */
    const newRow = () => {
        if (!edit || edit.no !== null) return null;
        const isHeading = edit.kind !== 'item';
        return (
            <tr key="__new" data-row="new" data-editing="" onKeyDown={escToCancel} style={isHeading ? { background: HEAD_BG[edit.kind] } : undefined}>
                {/* the number this row will get on ✓ (the same nextNo addEntry uses), faint until applied */}
                <td style={{ ...cell, color: grey, fontWeight: isHeading ? 600 : 400 }}>
                    <span data-pending-no title={t('meetingMinutes.pendingNo')}>
                        {(() => { const no = nextNo(log, edit.parent); return edit.kind === 'category' ? `${no}.0` : no; })()}
                    </span>
                    {edit.kind !== 'category' && (
                        // where the new row goes; changing it renumbers the pending row
                        <select aria-label={t('meetingMinutes.parentRow')} title={t('meetingMinutes.parentRow')} value={edit.parent ?? ''}
                            onChange={ev => setEdit({ ...edit, parent: ev.target.value })}
                            style={{ display: 'block', marginTop: 4, maxWidth: 140, fontSize: 11, padding: '1px 2px', color: '#475569', fontWeight: 400 }}>
                            {parentChoices(edit.kind).map(h => <option key={h.no} value={h.no}>{displayNo(h)} {(h.content || '').slice(0, 24)}</option>)}
                        </select>
                    )}
                </td>
                {isHeading ? (
                    <td style={cell} colSpan={3}>
                        <AutoText style={{ fontWeight: 600 }} value={edit.content} autoFocus
                            placeholder={t('meetingMinutes.categoryPlaceholder')}
                            onChange={ev => setEdit({ ...edit, content: ev.target.value })} />
                        {editHint}
                    </td>
                ) : (
                    <>
                        <td style={cell}>
                            {raisedInput(edit.raisedDate, v => setEdit({ ...edit, raisedDate: v }))}
                            <AutoText value={edit.content} autoFocus placeholder={t('meetingMinutes.itemPlaceholder')}
                                onChange={ev => setEdit({ ...edit, content: ev.target.value })} />
                            {editHint}
                        </td>
                        <td style={cell}>
                            <input className={formStyles.formInput} list={peopleListId} value={edit.owner} placeholder={t('meetingMinutes.colActionBy')}
                                onChange={ev => setEdit({ ...edit, owner: ev.target.value })} />
                        </td>
                        <td style={cell}>
                            <input type="date" className={formStyles.formInput} value={edit.targetDate} aria-label={t('meetingMinutes.targetDate')}
                                onChange={ev => setEdit({ ...edit, targetDate: ev.target.value })} />
                        </td>
                    </>
                )}
                <td style={cell}>{applyButtons}</td>
            </tr>
        );
    };
    const newRowAfter = (() => {
        if (!edit || edit.no !== null || edit.parent === null) return null;
        let last: string | null = null;
        for (const e of rows) if (e.no === edit.parent || e.no.startsWith(`${edit.parent}.`)) last = e.no;
        return last;
    })();

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showClosed} onChange={ev => setShowClosed(ev.target.checked)} />
                    {t('meetingMinutes.showClosed')}
                </label>
                {editable && (
                    // always there while the meeting can be edited — also while a row is open (see addFromToolbar)
                    <div data-register-toolbar style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {addButton(t('meetingMinutes.addCategory'), () => addFromToolbar('category'))}
                        {addButton(t('meetingMinutes.addItem'), () => addFromToolbar('item'),
                            categories.length === 0 && !(edit?.no === null && edit.kind === 'category' && edit.content.trim())
                                ? t('meetingMinutes.needCategoryFirst') : undefined, addItemRef)}
                    </div>
                )}
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table data-register style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            <th style={{ ...cell, width: 64 }}>#</th>
                            <th style={cell}>{t('meetingMinutes.colDiscussion')}</th>
                            <th style={{ ...cell, width: 150 }}>{t('meetingMinutes.colActionBy')}</th>
                            <th style={{ ...cell, width: 160 }}>{t('meetingMinutes.colTarget')}</th>
                            {editable && <th style={{ ...cell, width: 64 }} aria-label={t('meetingMinutes.editRow')} />}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && !edit && (
                            <tr><td style={{ ...cell, color: grey }} colSpan={editable ? 5 : 4}>{t('meetingMinutes.emptyRegister')}</td></tr>
                        )}
                        {rows.map(e => (
                            <React.Fragment key={e.no}>
                                {isItem(e) ? itemRow(e) : headingRow(e)}
                                {newRowAfter === e.no && newRow()}
                            </React.Fragment>
                        ))}
                        {edit && edit.no === null && (edit.parent === null || newRowAfter === null) && newRow()}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default DiscussionRegister;
