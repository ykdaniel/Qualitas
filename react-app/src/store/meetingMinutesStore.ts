import { create } from 'zustand';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { FilterParams } from '../types/api';
import { getErrorMessage } from '../utils/errorUtils';
import { getProjectFilterParams } from '../utils/projectFilter';

export interface Attendee {
    name: string;
    company?: string;
    role?: string;
}

export interface DiscussionLogEntry {
    no: string;             // "1", "1.1", "1.2" — fixed once assigned
    level?: 0 | 1;           // 0 = major topic, 1 = sub-item (undefined = legacy flat entry, treated as level 0)
    /** Free-text "topic + discussion" combined field (current shape). */
    content?: string;
    /** Legacy shape (pre-merge) — kept optional so old saved rows still
     * render; new entries only ever write `content`. */
    topic?: string;
    discussion?: string;
    decision?: string;
    owner?: string;          // sub-items only
    status?: string;         // sub-items only — 'Open' | 'Closed'
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

export const useMeetingMinutesStore = create<MeetingMinutesState>((set, get) => ({
    meetingList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchMeetingMinutes: async (params?: FilterParams) => {
        set({ loading: true, error: null });
        try {
            const response = await api.get('/meeting-minutes/', { params: { ...getProjectFilterParams(), ...params } });
            set({ meetingList: (response.data || []).map(normalizeItem), loading: false });
        } catch (err: any) {
            set({ error: getErrorMessage(err, 'Failed to fetch Meeting Minutes'), loading: false });
        }
    },

    refetch: async (params?: FilterParams) => {
        await get().fetchMeetingMinutes(params);
    },

    addMeetingMinutes: async (meeting: Omit<MeetingMinutesItem, 'id'>) => {
        try {
            const response = await api.post('/meeting-minutes/', meeting);
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
        try {
            await api.delete(`/meeting-minutes/${id}`);
            set((state) => ({ meetingList: state.meetingList.filter(m => m.id !== id) }));
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to delete Meeting Minutes');
            set({ error: msg });
            throw error;
        }
    }
}));
