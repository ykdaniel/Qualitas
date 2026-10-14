import { create } from 'zustand';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { FilterParams } from '../types/api';
import { getErrorMessage } from '../utils/errorUtils';
import { getProjectFilterParams, getCurrentProjectScopeId, withCurrentProject } from '../utils/projectFilter';

export interface Attendee {
    name: string;
    company?: string;
    role?: string;
    /** CONTRACTOR-PERSONNEL-2026-001: picked from a company's personnel list. The texts above are the snapshot shown and
     *  printed, so renaming or deactivating that person later never changes these minutes; older rows have no ids. */
    contractorId?: string;
    personnelId?: string;
}

/** A dated progress note under a discussion item ("21 Jul 2026 — TECO supplemented drawing …"). */
export interface ProgressUpdate {
    date?: string;           // YYYY-MM-DD
    content: string;
    /** Brought in from an earlier meeting by "New Occurrence": shown grey and read-only. */
    carried?: boolean;
    /** Written in the meeting just before this one (set when "New Occurrence" brings it in): shown blue (R17). */
    lastMeeting?: boolean;
    /** Marked as a key point by the user: shown red in every later meeting until unmarked (R17). */
    highlight?: boolean;
}

/**
 * One row of the discussion register (MEETING-TABS-2026-001): a category ("1" → shown 1.0), an optional
 * sub-category ("1.1") or an item ("1.1" directly under a category, or "1.1.1" under a sub-category).
 * Items carry Action by / Target date / Status and dated progress updates. Older rows had only two levels
 * (major topic / sub-item) and no `kind`; they are read through normalizeDiscussionLog
 * (components/MeetingMinutes/discussionLog.ts) and written back in this shape when a Draft is saved.
 */
export interface DiscussionLogEntry {
    no: string;              // fixed once assigned while any carried row exists (see discussionLog.ts)
    kind?: 'category' | 'subcategory' | 'item';
    level?: 0 | 1 | 2;       // depth of `no`; legacy rows: 0 = major topic, 1 = sub-item, undefined = flat (topic)
    /** Free-text "topic + discussion" combined field (current shape). */
    content?: string;
    /** Legacy shape (pre-merge) — kept optional so old saved rows still
     * render; new entries only ever write `content`. */
    topic?: string;
    discussion?: string;
    decision?: string;
    raisedDate?: string;     // items only — YYYY-MM-DD the item was first raised
    owner?: string;          // items only — "Action by"
    targetDate?: string;     // items only — YYYY-MM-DD
    status?: string;         // items only — 'Open' | 'Closed'
    updates?: ProgressUpdate[];
    /** Brought in from an earlier meeting by "New Occurrence": its text stays as recorded there. */
    carried?: boolean;
    /** Items: added in the meeting just before this one (set by "New Occurrence"): shown blue (R17). */
    lastMeeting?: boolean;
    /** Items: marked as a key point: shown red until unmarked (R17). */
    highlight?: boolean;
}

export interface MeetingMinutesItem {
    id: string;
    vendor?: string;
    documentNumber: string;
    rev?: string;
    status: string;
    title?: string;
    meetingType?: string;
    meetingDate?: string;
    meetingTime?: string;
    meetingEndTime?: string;
    location?: string;
    organizer?: string;
    attendees?: Attendee[];
    discussionLog?: DiscussionLogEntry[];
    attachments?: string[];
    createdAt?: string;
    updatedAt?: string;
}

function normalizeItem(item: unknown): MeetingMinutesItem {
    const record = (typeof item === 'object' && item !== null ? { ...item } : {}) as Record<string, unknown>;
    return parseJsonFields(record, ['attendees', 'discussionLog', 'attachments']) as unknown as MeetingMinutesItem;
}

interface MeetingMinutesState {
    meetingList: MeetingMinutesItem[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchMeetingMinutes: (params?: FilterParams) => Promise<void>;
    refetch: (params?: FilterParams) => Promise<void>;
    addMeetingMinutes: (meeting: Omit<MeetingMinutesItem, 'id'>) => Promise<MeetingMinutesItem>;
    updateMeetingMinutes: (id: string, meeting: Partial<MeetingMinutesItem>) => Promise<void>;
    deleteMeetingMinutes: (id: string) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;
}

// See itpStore.ts's itpFetchSeq — discards a stale (superseded) response (BACKLOG #28/#37).
let meetingFetchSeq = 0;
// See itpStore.ts's itpDataScopeId — clears the list on a cross-scope failure (BACKLOG #28/#37).
let meetingDataScopeId: string | null = null;

export const useMeetingMinutesStore = create<MeetingMinutesState>((set, get) => ({
    meetingList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchMeetingMinutes: async (params?: FilterParams) => {
        const seq = ++meetingFetchSeq;
        const requestedScopeId = getCurrentProjectScopeId();
        set({ loading: true, error: null });
        try {
            const response = await api.get('/meeting-minutes/', { params: { ...getProjectFilterParams(), ...params } });
            if (seq !== meetingFetchSeq) return;
            meetingDataScopeId = requestedScopeId;
            set({ meetingList: (response.data || []).map(normalizeItem), loading: false });
        } catch (err: any) {
            if (seq !== meetingFetchSeq) return;
            const message = getErrorMessage(err, 'Failed to fetch Meeting Minutes');
            if (requestedScopeId !== meetingDataScopeId) {
                meetingDataScopeId = requestedScopeId;
                set({ meetingList: [], error: message, loading: false });
            } else {
                set({ error: message, loading: false });
            }
        }
    },

    refetch: async (params?: FilterParams) => {
        await get().fetchMeetingMinutes(params);
    },

    addMeetingMinutes: async (meeting: Omit<MeetingMinutesItem, 'id'>) => {
        try {
            const response = await api.post('/meeting-minutes/', withCurrentProject(meeting));
            const newMeeting = normalizeItem(response.data);
            set((state) => ({ meetingList: [...state.meetingList, newMeeting] }));
            return newMeeting;
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to add Meeting Minutes');
            set({ error: msg });
            throw error;
        }
    },

    updateMeetingMinutes: async (id: string, updates: Partial<MeetingMinutesItem>) => {
        try {
            const response = await api.put(`/meeting-minutes/${id}`, updates);
            const updated = normalizeItem(response.data);
            set((state) => ({ meetingList: state.meetingList.map(m => m.id === id ? updated : m) }));
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to update Meeting Minutes');
            set({ error: msg });
            throw error;
        }
    },

    deleteMeetingMinutes: async (id: string) => {
        // A refused or failed delete goes to the caller, which shows it in the refusal dialog (REFUSAL-DIALOG-2026-001); the page's error banner is for list loads only.
        await api.delete(`/meeting-minutes/${id}`);
        set((state) => ({ meetingList: state.meetingList.filter(m => m.id !== id) }));
    }
}));
