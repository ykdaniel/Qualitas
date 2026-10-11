/**
 * The discussion register of a meeting (MEETING-TABS-2026-001), as pure functions so it can be unit-tested.
 *
 * Shape: categories ("1", shown 1.0) hold optional sub-categories ("1.1") and items; items sit directly under a
 * category ("1.1") or under a sub-category ("1.1.1"). Rows are kept in `no` order, which is also tree order.
 *
 * Older meetings stored two levels without `kind` — a major topic (level 0, or no level at all) and its
 * sub-items (level 1, "n.m"). normalizeDiscussionLog reads them as categories and items, so they render and
 * edit like new ones; a Draft is written back in the new shape the next time it is saved (Published / Void
 * meetings are locked and never rewritten).
 */
import type { DiscussionLogEntry, ProgressUpdate } from '../../store/meetingMinutesStore';

export type EntryKind = 'category' | 'subcategory' | 'item';

const segments = (no: string) => no.split('.').map(s => Number.parseInt(s, 10) || 0);

/** Tree order: 1 < 1.1 < 1.1.1 < 1.2 < 2. */
export function compareNo(a: string, b: string): number {
    const x = segments(a), y = segments(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if (x[i] === undefined) return -1;
        if (y[i] === undefined) return 1;
        if (x[i] !== y[i]) return x[i] - y[i];
    }
    return 0;
}

export const depthOf = (no: string) => no.split('.').length - 1;
export const parentOf = (no: string) => (no.includes('.') ? no.slice(0, no.lastIndexOf('.')) : null);
export const isItem = (e: DiscussionLogEntry) => e.kind === 'item';
export const displayNo = (e: DiscussionLogEntry) => (e.kind === 'category' ? `${e.no}.0` : e.no);

const legacyContent = (e: DiscussionLogEntry) =>
    e.content ?? [e.topic, e.discussion, e.decision].filter(Boolean).join(' / ');

function kindOf(e: DiscussionLogEntry): EntryKind {
    if (e.kind === 'category' || e.kind === 'subcategory' || e.kind === 'item') return e.kind;
    if (e.level === 1) return 'item';                       // legacy sub-item
    if (e.level == null) {
        // flat rows saved 2026-08-29 … 08-31 already had an owner / status: they were action rows, not headings
        if (e.owner !== undefined || e.status !== undefined) return 'item';
        if (e.no.includes('.')) return 'item';
    }
    return 'category';                                      // legacy major topic / flat topic
}

/** Reads any stored shape (current or legacy) into the current one, in tree order. */
export function normalizeDiscussionLog(raw: DiscussionLogEntry[] | null | undefined): DiscussionLogEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter(e => e && typeof e.no === 'string' && e.no.trim() !== '')
        .map((e): DiscussionLogEntry => {
            const kind = kindOf(e);
            const out: DiscussionLogEntry = { no: e.no.trim(), kind, level: depthOf(e.no.trim()) as 0 | 1 | 2, content: legacyContent(e) };
            if (e.carried) out.carried = true;
            if (e.lastMeeting) out.lastMeeting = true;
            if (e.highlight) out.highlight = true;
            if (kind === 'item') {
                out.raisedDate = e.raisedDate || '';
                out.owner = e.owner || '';
                out.targetDate = e.targetDate || '';
                out.status = e.status === 'Closed' ? 'Closed' : 'Open';
                out.updates = Array.isArray(e.updates) ? e.updates.filter(u => u && typeof u.content === 'string') : [];
            }
            return out;
        })
        .sort((a, b) => compareNo(a.no, b.no));
}

const directChildren = (log: DiscussionLogEntry[], parentNo: string | null) =>
    log.filter(e => parentOf(e.no) === parentNo);

/** Next free number under `parentNo` (null = a new category). Never reuses a number still present. */
export function nextNo(log: DiscussionLogEntry[], parentNo: string | null): string {
    const max = directChildren(log, parentNo).reduce((m, e) => Math.max(m, segments(e.no)[segments(e.no).length - 1] ?? 0), 0);
    return parentNo === null ? String(max + 1) : `${parentNo}.${max + 1}`;
}

export function addEntry(log: DiscussionLogEntry[], parentNo: string | null, kind: EntryKind, content: string,
    item?: { owner?: string; targetDate?: string; status?: string; raisedDate?: string }): DiscussionLogEntry[] {
    const no = nextNo(log, parentNo);
    const entry: DiscussionLogEntry = { no, kind, level: depthOf(no) as 0 | 1 | 2, content };
    if (kind === 'item') {
        entry.raisedDate = item?.raisedDate || '';
        entry.owner = item?.owner || '';
        entry.targetDate = item?.targetDate || '';
        entry.status = item?.status === 'Closed' ? 'Closed' : 'Open';
        entry.updates = [];
    }
    return [...log, entry].sort((a, b) => compareNo(a.no, b.no));
}

/**
 * Renumbers the whole tree contiguously (1, 1.1, 1.1.1 …), keeping order and structure, and says which old number
 * became which. Null when the tree is not clean — a duplicate number or a row whose parent is missing — since
 * walking it would drop or duplicate rows; such a register is left as it is.
 */
export function renumberWithMap(log: DiscussionLogEntry[]): { log: DiscussionLogEntry[]; map: Record<string, string> } | null {
    if (new Set(log.map(e => e.no)).size !== log.length) return null;
    const out: DiscussionLogEntry[] = [];
    const map: Record<string, string> = {};
    const walk = (parentNo: string | null, newParent: string | null) => {
        directChildren(log, parentNo).sort((a, b) => compareNo(a.no, b.no)).forEach((e, i) => {
            const no = newParent === null ? String(i + 1) : `${newParent}.${i + 1}`;
            map[e.no] = no;
            out.push({ ...e, no, level: depthOf(no) as 0 | 1 | 2 });
            walk(e.no, no);
        });
    };
    walk(null, null);
    return out.length === log.length ? { log: out, map } : null;
}

export const renumber = (log: DiscussionLogEntry[]) => renumberWithMap(log)?.log ?? log;

/**
 * Removes a row and everything under it. Numbers close up only while nothing in the register was carried in from
 * an earlier meeting — carried numbers are how people refer to an item across meetings, so they must not move.
 * `map` gives every old number its new one (null = removed), so whatever the form keeps by number (a progress update
 * being typed, the row a new entry is being added under) can follow.
 */
export function removeEntryWithMap(log: DiscussionLogEntry[], no: string): { log: DiscussionLogEntry[]; map: Record<string, string | null> } {
    const map: Record<string, string | null> = {};
    const rest: DiscussionLogEntry[] = [];
    for (const e of log) {
        if (e.no === no || e.no.startsWith(`${no}.`)) map[e.no] = null;
        else rest.push(e);
    }
    const renumbered = rest.some(e => e.carried) ? null : renumberWithMap(rest);
    for (const e of rest) map[e.no] = renumbered ? renumbered.map[e.no] : e.no;
    return { log: renumbered ? renumbered.log : rest, map };
}

export const removeEntry = (log: DiscussionLogEntry[], no: string) => removeEntryWithMap(log, no).log;

export function updateEntry(log: DiscussionLogEntry[], no: string, patch: Partial<DiscussionLogEntry>): DiscussionLogEntry[] {
    return log.map(e => (e.no === no ? { ...e, ...patch } : e));
}

export function addUpdate(log: DiscussionLogEntry[], no: string, update: ProgressUpdate): DiscussionLogEntry[] {
    return log.map(e => (e.no === no ? { ...e, updates: [...(e.updates || []), { date: update.date || '', content: update.content }] } : e));
}

/** Only updates written in this meeting can be removed; carried ones are part of an earlier meeting's record. */
export function removeUpdate(log: DiscussionLogEntry[], no: string, index: number): DiscussionLogEntry[] {
    return log.map(e => (e.no === no && !e.updates?.[index]?.carried
        ? { ...e, updates: (e.updates || []).filter((_, i) => i !== index) } : e));
}

/** A row can be removed unless it, or anything under it, was carried in from an earlier meeting (close it instead). */
export const canRemove = (log: DiscussionLogEntry[], no: string) =>
    !log.some(e => (e.no === no || e.no.startsWith(`${no}.`)) && e.carried);

export const openItemCount = (log: DiscussionLogEntry[]) => log.filter(e => isItem(e) && e.status !== 'Closed').length;

/** The category / sub-category titles above a row, outermost first. */
export function headingsOf(log: DiscussionLogEntry[], no: string): string[] {
    const titles: string[] = [];
    for (let p = parentOf(no); p !== null; p = parentOf(p)) {
        const parent = log.find(e => e.no === p);
        if (parent && !isItem(parent)) titles.unshift(parent.content || '');
    }
    return titles;
}

/** An item's progress updates in date order — the same date in the order they were written — each with its index in
 *  `updates`. A note written later for an earlier day (user, 2026-10-11: "如果我忘記補充資料可以補上去") lands on its day. */
export function updatesByDate(e: DiscussionLogEntry): { u: ProgressUpdate; i: number }[] {
    return (e.updates || []).map((u, i) => ({ u, i }))
        .sort((a, b) => ((a.u.date || '') < (b.u.date || '') ? -1 : (a.u.date || '') > (b.u.date || '') ? 1 : a.i - b.i));
}

/**
 * How an item's text or a progress note reads (R17, the user's own practice: "最新的是紅色、上週紀錄的藍色、過去重點紀錄…
 * 標示為紅色＝重點"; R18, after seeing it: "日期最新為紅色不粗體 上一次的是藍色 之前的是灰色 補登為紅色"): marked key point or
 * written in this meeting (a backfilled day too) → red, written in the meeting before → blue, anything older → grey —
 * date and text alike, none of it bold. A first meeting (nothing carried) is all red. The same rule drives the screen,
 * the print and the Word export.
 */
export type Tone = 'key' | 'current' | 'last' | 'old';
export function toneOf(x: { carried?: boolean; lastMeeting?: boolean; highlight?: boolean }): Tone {
    if (x.highlight) return 'key';
    if (!x.carried) return 'current';
    if (x.lastMeeting) return 'last';
    return 'old';
}
export const TONE_COLOR: Record<Tone, string> = { key: '#C00000', current: '#C00000', last: '#1F4E99', old: '#7A818A' };

/** Marks / unmarks a progress note as a key point — carried ones too: the flag is how a past note stays visible. */
export function toggleUpdateHighlight(log: DiscussionLogEntry[], no: string, index: number): DiscussionLogEntry[] {
    return log.map(e => (e.no === no && e.updates?.[index]
        ? { ...e, updates: e.updates.map((u, i) => (i === index ? withFlag(u, !u.highlight) : u)) } : e));
}
/** Marks / unmarks an item (its text) as a key point, carried or not. */
export function toggleItemHighlight(log: DiscussionLogEntry[], no: string): DiscussionLogEntry[] {
    return log.map(e => (e.no === no ? withFlag(e, !e.highlight) : e));
}
function withFlag<T extends { highlight?: boolean }>(x: T, on: boolean): T {
    const out = { ...x };
    if (on) out.highlight = true;
    else delete out.highlight;              // unmarked: the key goes, nothing left behind in the stored JSON
    return out;
}

/** Changes one of this meeting's updates; carried ones (an earlier meeting's record) are never changed. */
export function patchUpdate(log: DiscussionLogEntry[], no: string, index: number, patch: Partial<ProgressUpdate>): DiscussionLogEntry[] {
    return log.map(e => (e.no === no && e.updates?.[index] && !e.updates[index].carried
        ? { ...e, updates: e.updates.map((u, i) => (i === index ? { ...u, ...patch } : u)) } : e));
}

/** Today as yyyy-mm-dd in local time (what a date input shows). */
export function localToday(now = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export type ProgressProblem = 'noText' | 'noDate' | 'beforeRaised' | 'afterLatest';
/**
 * What is wrong with a progress note written in this meeting, or null. Its day may not be before the item was raised,
 * nor after `latest` — today, or the meeting date when the minutes are prepared ahead of it.
 */
export function progressProblem(u: ProgressUpdate, raisedDate: string | undefined, latest: string): ProgressProblem | null {
    if (!u.content.trim()) return 'noText';
    if (!u.date) return 'noDate';
    if (raisedDate && u.date < raisedDate) return 'beforeRaised';
    if (u.date > latest) return 'afterLatest';
    return null;
}

/** The first progress note of this meeting that cannot be saved as it is (carried notes are not checked). */
export function firstProgressProblem(log: DiscussionLogEntry[], latest: string): { no: string; problem: ProgressProblem; raisedDate?: string } | null {
    for (const e of log) {
        if (!isItem(e)) continue;
        for (const u of e.updates || []) {
            if (u.carried) continue;
            const problem = progressProblem(u, e.raisedDate, latest);
            if (problem) return { no: e.no, problem, raisedDate: e.raisedDate };
        }
    }
    return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-07-21" → "21 Jul 2026", the company minutes' date format (user decision 2026-10-11); anything else as-is. */
export function formatMinutesDate(value: string | null | undefined): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return value || '';
    return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

// ── open / closed items across meetings (the list page's item views, MEETING-TABS-2026-001 R7) ──

/** The fields of a meeting the item views need. */
export interface MeetingForItems {
    id: string;
    documentNumber: string;
    rev?: string;
    title?: string;
    meetingDate?: string;
    status?: string;
    updatedAt?: string;
    discussionLog?: DiscussionLogEntry[] | null;
}

export interface RegisterItemRow {
    meetingId: string;
    documentNumber: string;
    rev: string;
    meetingTitle: string;
    meetingDate: string;
    itemNo: string;
    content: string;
    owner: string;
    raisedDate: string;
    targetDate: string;
    status: string;
    /** category / sub-category titles above the item */
    topicTitle: string;
    /** open with a target date before today */
    overdue: boolean;
}

const revNumber = (rev?: string) => Number.parseFloat(rev || '') || 0;

/**
 * The newest occurrence of every recurring meeting (highest rev; the later update on a tie), Void meetings left out.
 * Open items are carried from one occurrence to the next, so only the newest one says what is still open.
 */
const newerFirst = (a: MeetingForItems, b: MeetingForItems) =>
    revNumber(b.rev) - revNumber(a.rev) || (b.updatedAt || '').localeCompare(a.updatedAt || '');

function seriesNewestFirst<T extends MeetingForItems>(meetings: T[]): T[][] {
    const series = new Map<string, T[]>();
    for (const m of meetings) {
        if (m.status === 'Void') continue;
        const key = m.documentNumber || m.id;
        series.set(key, [...(series.get(key) || []), m]);
    }
    return [...series.values()].map(list => list.sort(newerFirst));
}

export function latestPerSeries<T extends MeetingForItems>(meetings: T[]): T[] {
    return seriesNewestFirst(meetings).map(list => list[0]);
}

/**
 * The occurrence of each series whose register says what is open: the newest one — unless its register is empty,
 * as with an occurrence created before open items were carried forward (MEETING-TABS-2026-001); then the newest one
 * that has a register.
 */
export function registerSourcePerSeries<T extends MeetingForItems>(meetings: T[]): T[] {
    return seriesNewestFirst(meetings)
        .map(list => list.find(m => normalizeDiscussionLog(m.discussionLog).length > 0))
        .filter((m): m is T => !!m);
}

/**
 * Open items: from the newest occurrence of each meeting that has a register (registerSourcePerSeries), overdue first, then by target date. Closed items: from every
 * meeting that is not Void (a closed item is never carried on, so it appears once — in the meeting that closed it).
 */
export function collectRegisterItems(meetings: MeetingForItems[], which: 'open' | 'closed', today: string): RegisterItemRow[] {
    const source = which === 'open' ? registerSourcePerSeries(meetings) : meetings.filter(m => m.status !== 'Void');
    const rows: RegisterItemRow[] = [];
    for (const m of source) {
        const log = normalizeDiscussionLog(m.discussionLog);
        for (const e of log) {
            if (!isItem(e) || (which === 'open') === (e.status === 'Closed')) continue;
            rows.push({
                meetingId: m.id, documentNumber: m.documentNumber, rev: m.rev || '', meetingTitle: m.title || '',
                meetingDate: m.meetingDate || '', itemNo: e.no, content: e.content || '', owner: e.owner || '',
                raisedDate: e.raisedDate || '', targetDate: e.targetDate || '', status: e.status || 'Open',
                topicTitle: headingsOf(log, e.no).join(' / '),
                overdue: which === 'open' && !!e.targetDate && e.targetDate < today,
            });
        }
    }
    return rows.sort(which === 'open'
        ? (a, b) => Number(b.overdue) - Number(a.overdue) || (a.targetDate || '9999').localeCompare(b.targetDate || '9999')
            || a.documentNumber.localeCompare(b.documentNumber) || compareNo(a.itemNo, b.itemNo)
        : (a, b) => b.meetingDate.localeCompare(a.meetingDate) || a.documentNumber.localeCompare(b.documentNumber) || compareNo(a.itemNo, b.itemNo));
}
