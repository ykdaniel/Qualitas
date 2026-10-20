/**
 * /api/documents — the controlled-document register (KM-DOCS-2026-001 D1 backend, D2 company-layer front end).
 * Every write that edits a document sends the row_version it was read at (OPTIMISTIC-LOCK-2026-001); a 409
 * VERSION_CONFLICT reaches the caller as the axios error so the shared refusal dialog can offer "Reload this record".
 */
import api from './api';
import { withRowVersion } from '../utils/rowVersion';
import type {
  DocumentCreatePayload, DocumentDetail, DocumentListParams, DocumentReference, DocumentSummary, DocumentTransitionPayload,
  DocumentUpdatePayload, DocumentVersion,
} from '../types/documents';

export const DOCUMENT_VERSION_ENTITY = 'document_version';
/** the issued PDF may be larger than the general attachment limit (backend DOCUMENT_PDF_MAX_MB, default 50) */
export const PDF_MAX_MB = 50;
export const WORD_MAX_MB = 20;

/** query parameters as the backend expects them: booleans as 'true' / 'false', empty values dropped */
export function listQuery(params: DocumentListParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = typeof v === 'boolean' ? String(v) : (v as string | number);
  }
  return out;
}

export const documentsApi = {
  list: async (params: DocumentListParams): Promise<DocumentSummary[]> => {
    const r = await api.get<DocumentSummary[]>('/documents/', { params: listQuery(params) });
    return r.data;
  },
  get: async (id: string): Promise<DocumentDetail> => {
    const r = await api.get<DocumentDetail>(`/documents/${id}`);
    return r.data;
  },
  create: async (payload: DocumentCreatePayload): Promise<DocumentDetail> => {
    const r = await api.post<DocumentDetail>('/documents/', payload);
    return r.data;
  },
  update: async (id: string, payload: DocumentUpdatePayload, rowVersion?: number | null): Promise<DocumentDetail> => {
    const r = await api.patch<DocumentDetail>(`/documents/${id}`, withRowVersion(payload, rowVersion));
    return r.data;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/documents/${id}`);
  },
  /** one request: the version row, its Word and / or PDF, the Word's text (multipart) */
  addVersion: async (id: string, files: { word?: File | null; pdf?: File | null }, changeSummary: string, versionLabel?: string): Promise<DocumentVersion> => {
    const form = new FormData();
    if (files.word) form.append('word', files.word);
    if (files.pdf) form.append('pdf', files.pdf);
    form.append('change_summary', changeSummary);
    if (versionLabel && versionLabel.trim()) form.append('version_label', versionLabel.trim());
    const r = await api.post<DocumentVersion>(`/documents/${id}/versions`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return r.data;
  },
  transition: async (id: string, payload: DocumentTransitionPayload, rowVersion?: number | null): Promise<DocumentDetail> => {
    const r = await api.post<DocumentDetail>(`/documents/${id}/transition`, withRowVersion(payload, rowVersion));
    return r.data;
  },
  references: async (id: string): Promise<DocumentReference[]> => {
    const r = await api.get<DocumentReference[]>(`/documents/${id}/references`);
    return r.data;
  },
  /** the file itself, as a Blob (the register's download checks the document's own permission per record) */
  downloadBlob: async (id: string, versionId: string, kind: 'word' | 'pdf'): Promise<Blob> => {
    const r = await api.get(`/documents/${id}/versions/${versionId}/download`, { params: { kind }, responseType: 'blob' });
    return r.data as Blob;
  },
  /** save the file through the browser (a blob URL, revoked afterwards); rejects when the download fails */
  download: async (id: string, versionId: string, kind: 'word' | 'pdf', fileName: string): Promise<void> => {
    const blob = await documentsApi.downloadBlob(id, versionId, kind);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || `${kind}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
