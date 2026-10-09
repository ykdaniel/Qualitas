/**
 * Approved-material register API (MATERIAL-SUBMITTAL M6, DECISIONS 材料：只作為核准材料登錄簿). Thin wrappers over the backend;
 * JSON is camelCase. The former submittal-workflow calls were removed with their backend routes (2026-10-09).
 */
import api from './api';

/** result of a revision; a registered material is always Approved or ApprovedWithComments, older rows may hold the others */
export type RevisionStatus = 'Draft' | 'Submitted' | 'Approved' | 'ApprovedWithComments' | 'ReviseAndResubmit' | 'Rejected';

/** the one submission category that only takes images, shown as thumbnails (M6; the server enforces it too) */
export const PHOTO_CATEGORY = 'photo';
export const MATERIAL_ENTITY = 'material_rev';

export interface Page<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
}

// ── approved materials (M6): the CURRENT approved revision of each submittal, as approved ──
export interface ApprovedMaterial {
    submittalId: string;
    revisionId: string;
    projectId: string;
    vendorId: string;
    vendorName?: string | null;
    documentNumber: string;
    revNo: number;
    result: 'Approved' | 'ApprovedWithComments';
    approvedDate?: string | null;
    decisionMaker?: string | null;
    externalDocNo?: string | null;
    name?: string | null;
    category?: string | null;
    brand?: string | null;
    model?: string | null;
    specification?: string | null;
    manufacturer?: string | null;
    supplier?: string | null;
    specReference?: string | null;
    /** shelf view: the first photo's stored path (served by /api/files/download/<path>) and how many photos there are */
    coverPhotoPath?: string | null;
    photoCount?: number;
}
/** Register an ALREADY externally approved material in one step (M6, DECISIONS 材料：只作為核准材料登錄簿). */
export interface RegisterPayload {
    projectId: string;
    vendorId: string;
    name: string;
    category?: string | null;
    brand?: string | null;
    model?: string | null;
    specification?: string | null;
    manufacturer?: string | null;
    supplier?: string | null;
    specReference?: string | null;
    resultCode: 'Approved' | 'ApprovedWithComments';
    approvedDate: string;
    decisionMaker?: string | null;
    externalDocNo?: string | null;
}
export const registerMaterial = async (body: RegisterPayload) =>
    (await api.post<ApprovedMaterial>('/material-submittals/register', body)).data;
/** Only the fields sent change; the project and the contractor cannot change. */
export const updateRegistered = async (submittalId: string, body: Partial<Omit<RegisterPayload, 'projectId' | 'vendorId'>>) =>
    (await api.put<ApprovedMaterial>(`/material-submittals/${submittalId}/register`, body)).data;
export const listApproved = async (projectId: string, params: { q?: string; category?: string; vendorId?: string; result?: 'Approved' | 'ApprovedWithComments'; registeredFrom?: string; limit?: number; offset?: number } = {}) =>
    (await api.get<Page<ApprovedMaterial>>('/material-submittals/approved', { params: { projectId, ...params } })).data;

// ── M6 R2 ──
/** One id per add-material form, sent with every attempt: a repeated request returns the record the first one created. */
export const registerMaterialOnce = async (body: RegisterPayload, clientRequestId: string) =>
    (await api.post<ApprovedMaterial>('/material-submittals/register', { ...body, clientRequestId })).data;
/** Other records of the project with the same name + brand + model, over ALL records (server-side; warns only). */
export const findDuplicateMaterials = async (projectId: string, p: { name: string; brand?: string | null; model?: string | null; excludeId?: string; clientRequestId?: string }) =>
    (await api.get<{ items: { submittalId: string; documentNumber: string }[] }>('/material-submittals/duplicates', {
        params: { projectId, name: p.name, brand: p.brand || undefined, model: p.model || undefined, excludeId: p.excludeId, clientRequestId: p.clientRequestId },
    })).data.items;
/** Dashboard figures: one project, or every project the user can see when projectId is omitted (counted on the server). */
export const materialStats = async (p: { projectId?: string; vendorId?: string; registeredFrom?: string }) =>
    (await api.get<{ total: number; registeredSince: number }>('/material-submittals/stats', { params: p })).data;
