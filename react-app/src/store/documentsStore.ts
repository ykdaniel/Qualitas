/** Company-document register state (KM-DOCS-2026-001 D2). The list and the open document are fetched from the server;
 *  writes go straight through documentsApi and refresh what they touched. Errors surface as the axios error to the caller
 *  (the refusal dialog reads status and code); the list keeps a friendly text and an accessDenied flag like kmStore. */
import { create } from 'zustand';
import { documentsApi } from '../services/documentsApi';
import type { DocumentDetail, DocumentListParams, DocumentSummary } from '../types/documents';

interface DocumentsState {
  list: DocumentSummary[];
  listParams: DocumentListParams | null;
  loading: boolean;
  error: string | null;
  accessDenied: boolean;
  current: DocumentDetail | null;
  currentLoading: boolean;
  currentError: 'notFound' | 'failed' | null;
  /** the id the latest fetchOne asked for: an older answer for another id is dropped (R1 P2-1) */
  currentRequest: string | null;
  fetchList: (params: DocumentListParams) => Promise<void>;
  refreshList: () => Promise<void>;
  fetchOne: (id: string) => Promise<DocumentDetail | null>;
  setCurrent: (doc: DocumentDetail | null) => void;
  /** replace the document in the list (after a write) without a round trip */
  mergeIntoList: (doc: DocumentDetail) => void;
}

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  list: [],
  listParams: null,
  loading: false,
  error: null,
  accessDenied: false,
  current: null,
  currentLoading: false,
  currentError: null,
  currentRequest: null,

  fetchList: async (params) => {
    set({ loading: true, error: null, accessDenied: false, listParams: params });
    try {
      const data = await documentsApi.list(params);
      // a slower earlier request must not overwrite a newer search
      if (get().listParams !== params) return;
      set({ list: data, loading: false });
    } catch (err: any) {
      if (get().listParams !== params) return;
      set({ accessDenied: err?.response?.status === 403, list: [], error: 'load', loading: false });
    }
  },

  refreshList: async () => {
    const params = get().listParams;
    if (params) await get().fetchList({ ...params });
  },

  fetchOne: async (id) => {
    // another document must never stay on screen (with its buttons) while this one loads
    set((s) => ({ currentLoading: true, currentError: null, currentRequest: id, current: s.current?.id === id ? s.current : null }));
    try {
      const doc = await documentsApi.get(id);
      if (get().currentRequest !== id) return null;
      set({ current: doc, currentLoading: false });
      return doc;
    } catch (err: any) {
      if (get().currentRequest !== id) return null;
      set({ current: null, currentLoading: false, currentError: err?.response?.status === 404 ? 'notFound' : 'failed' });
      return null;
    }
  },

  setCurrent: (doc) => set({ current: doc }),

  mergeIntoList: (doc) => set((s) => ({
    list: s.list.some((d) => d.id === doc.id) ? s.list.map((d) => (d.id === doc.id ? { ...d, ...doc } : d)) : [doc, ...s.list],
  })),
}));
