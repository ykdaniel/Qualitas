import axios from 'axios';
import { FilterParams } from '../types/api';

const baseURL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api';

const api = axios.create({
  baseURL,
  // withCredentials sends auth cookies (httpOnly access_token + non-httpOnly
  // csrf_token) on every request. Required now that we authenticate via cookie
  // in addition to legacy Bearer header.
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Read a non-httpOnly cookie value by name
function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

let logoutHandler: (() => void) | null = null;

export const setupLogoutHandler = (handler: () => void) => {
  logoutHandler = handler;
};

// Request interceptor: authentication is carried entirely by the httpOnly
// access_token cookie (sent automatically via withCredentials). We only need to
// echo the CSRF cookie back as a header for state-changing requests so the
// backend's double-submit check passes.
api.interceptors.request.use(
  (config) => {
    const method = (config.method || 'get').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const csrf = readCookie('csrf_token');
      if (csrf) {
        config.headers['X-CSRF-Token'] = csrf;
      }
    }
    // Don't override Content-Type if it's already set
    if (!config.headers['Content-Type'] && !config.headers['content-type']) {
      config.headers['Content-Type'] = 'application/json';
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Track whether a token refresh is already in progress
let isRefreshing = false;
let refreshSubscribers: (() => void)[] = [];

function onTokenRefreshed() {
  refreshSubscribers.forEach((cb) => cb());
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: () => void) {
  refreshSubscribers.push(cb);
}

// Response interceptor — attempt silent refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401) {
      // 排除登入 / refresh 請求，避免無限迴圈（注意：/auth/verify 不在排除範圍內）
      const isAuthEndpoint =
        originalRequest?.url?.includes('/auth/login') ||
        originalRequest?.url?.includes('/auth/refresh');
      const isAlreadyOnLogin = window.location.pathname === '/login';

      if (isAuthEndpoint || isAlreadyOnLogin) {
        return Promise.reject(error);
      }

      // The refresh token rides in the httpOnly refresh_token cookie (sent
      // automatically via withCredentials). Nothing token-related is read from
      // or written to JS-accessible storage.

      // If already refreshing, queue this request until the refresh completes.
      if (isRefreshing) {
        return new Promise((resolve) => {
          addRefreshSubscriber(() => {
            resolve(api(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        // Cookie-based refresh: the server reads the refresh cookie and replies
        // with fresh Set-Cookie headers. No tokens travel through the body.
        await axios.post(`${baseURL}/auth/refresh`, {}, { withCredentials: true });
        isRefreshing = false;
        onTokenRefreshed();

        // Retry the original request — the new access cookie is already in place.
        return api(originalRequest);
      } catch {
        isRefreshing = false;
        refreshSubscribers = [];
        doLogout();
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

function doLogout() {
  if (logoutHandler) {
    logoutHandler();
  } else {
    window.location.href = '/login';
  }
}

export interface NamingRuleApi {
  id: number;
  doc_type: string;
  prefix: string;
  sequence_digits: number;
}

export const getNamingRules = async (): Promise<NamingRuleApi[]> => {
  const res = await api.get<NamingRuleApi[]>('/settings/naming-rules');
  return res.data;
};

export interface NamingRuleUpdatePayload {
  doc_type: string;
  prefix: string;
  sequence_digits: number;
}

export const updateNamingRules = async (
  rules: NamingRuleUpdatePayload[]
): Promise<NamingRuleApi[]> => {
  const response = await api.put<NamingRuleApi[]>('/settings/naming-rules', rules);
  return response.data;
};

// --- Contractors API ---

export interface Contractor {
  id: string;
  name: string;
  package: string;
  abbreviation: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  scope: string;
  status: 'Active' | 'Inactive' | 'active' | 'inactive';
}

export interface CreateContractorPayload {
  name: string;
  package: string;
  abbreviation: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  scope: string;
  status: 'Active' | 'Inactive';
}

export type UpdateContractorPayload = Partial<CreateContractorPayload>

export const getContractors = async (): Promise<Contractor[]> => {
  const response = await api.get<Contractor[]>('/contractors/');
  return response.data;
};

export const createContractor = async (
  data: CreateContractorPayload
): Promise<Contractor> => {
  const response = await api.post<Contractor>('/contractors/', data);
  return response.data;
};

export const updateContractor = async (
  id: string,
  data: UpdateContractorPayload
): Promise<Contractor> => {
  const response = await api.put<Contractor>(`/contractors/${id}`, data);
  return response.data;
};

export const deleteContractor = async (id: string): Promise<void> => {
  await api.delete(`/contractors/${id}`);
};

// --- Projects API ---

export interface ProjectApi {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  owner: string | null;
  created_at: string | null;
}

export interface CreateProjectPayload {
  name: string;
  code?: string;
  description?: string;
  owner?: string;
}

export type UpdateProjectPayload = Partial<CreateProjectPayload>

export const getProjects = async (): Promise<ProjectApi[]> => {
  const response = await api.get<ProjectApi[]>('/projects/');
  return response.data;
};

export const createProject = async (data: CreateProjectPayload): Promise<ProjectApi> => {
  const response = await api.post<ProjectApi>('/projects/', data);
  return response.data;
};

export const updateProject = async (id: string, data: UpdateProjectPayload): Promise<ProjectApi> => {
  const response = await api.put<ProjectApi>(`/projects/${id}`, data);
  return response.data;
};

export const deleteProject = async (id: string): Promise<void> => {
  await api.delete(`/projects/${id}`);
};

// --- IAM API (Users & Roles) ---

export interface User {
  id: number;
  username: string;
  email: string;
  role_id: number;
  role_name?: string;
  /** Permission codes granted via the user's role (e.g. "ncr:update:all").
   *  Used to gate UI; the backend still enforces them per endpoint. */
  permissions: string[];
  is_active: boolean;
  full_name?: string;
  /** Editable, cosmetic-only company label — only meaningful for internal
   *  staff (no vendor_id). Prefer `display_company` for showing a user's
   *  company; this is the raw settable field. */
  company_name?: string | null;
  /** Resolved "Name / Company" label source: the user's real vendor name
   *  when contractor-scoped, else their `company_name`. Read-only. */
  display_company?: string | null;
}

export interface Role {
  id: number;
  name: string;
  description?: string;
  permissions: string[]; // List of permission codes
}

export interface Permission {
  id: number;
  code: string;
  name: string;
  description?: string;
  module: string;
}

export const getUsers = async (): Promise<User[]> => {
  const response = await api.get<User[]>('/iam/users/');
  return response.data;
};

/** "Name / Company" label for a user-picker option — the shared format
 *  used everywhere a real user account is selected (NCR/OBS/ITR/Follow Up
 *  Issues assignee pickers, etc.). Falls back to plain name when the user
 *  has no company on file (internal staff with no company_name set). */
export const formatUserLabel = (u: User): string => {
  const name = u.full_name || u.username;
  return u.display_company ? `${name} / ${u.display_company}` : name;
};

export const getRoles = async (): Promise<Role[]> => {
  const response = await api.get<Role[]>('/iam/roles/');
  return response.data;
};

export const getPermissions = async (): Promise<Permission[]> => {
  const response = await api.get<Permission[]>('/iam/permissions/');
  return response.data;
};

export interface CreateUserPayload {
  username: string;
  email: string;
  password?: string;
  role_id: number;
  is_active: boolean;
  company_name?: string | null;
  reason?: string | null;
}

export type UpdateUserPayload = Partial<CreateUserPayload>

export const createUser = async (data: CreateUserPayload): Promise<User> => {
  const response = await api.post<User>('/iam/users/', data);
  return response.data;
};

export const updateUser = async (id: number, data: UpdateUserPayload): Promise<User> => {
  const response = await api.put<User>(`/iam/users/${id}/`, data);
  return response.data;
};

// P0 data isolation: a user's project / contractor scope.
export interface UserScope {
  project_ids: string[];
  vendor_id: string | null;
}

export const getUserScope = async (id: number): Promise<UserScope> => {
  const response = await api.get<UserScope>(`/iam/users/${id}/scope`);
  return response.data;
};

export const setUserScope = async (id: number, scope: UserScope): Promise<UserScope> => {
  const response = await api.put<UserScope>(`/iam/users/${id}/scope`, scope);
  return response.data;
};

export interface CreateRolePayload {
  name: string;
  description?: string;
  permissions: string[];
  /** Audit reason (the role form requires one); stored on the Role audit entry. */
  reason?: string;
}

export type UpdateRolePayload = Partial<CreateRolePayload>

export const createRole = async (data: CreateRolePayload): Promise<Role> => {
  const response = await api.post<Role>('/iam/roles/', data);
  return response.data;
};

export const updateRole = async (id: number, data: UpdateRolePayload): Promise<Role> => {
  const response = await api.put<Role>(`/iam/roles/${id}/`, data);
  return response.data;
};

export const deleteUser = async (id: number, reason?: string): Promise<void> => {
  await api.delete(`/iam/users/${id}/`, { params: reason ? { reason } : undefined });
};

export const deleteRole = async (id: number, reason?: string): Promise<void> => {
  await api.delete(`/iam/roles/${id}/`, { params: reason ? { reason } : undefined });
};

// --- Checklist API ---

export interface ChecklistRecordApi {
  id: string;
  recordsNo: string;
  activity: string;
  date: string;
  status: string;
  packageName: string;
  location?: string;
  itpIndex: number;
  contractor?: string;
  itpId?: string;
  itpVersion?: string;
  passCount?: number;
  failCount?: number;
  itrId?: string;
  itrNumber?: string;
  noiNumber?: string;
  detail_data?: string;
  template_id?: string; // §17: instance -> 來源範本（範本本身為 NULL）
  // Read-only provenance fields — backend already returns these (see
  // backend/schemas.py's Checklist schema), never accepted on create/update.
  version?: number | null; // template's own edit counter (bare template only)
  source_template_version?: number | null; // captured once at link_checklist time; NULL = historical/unknown
  evidence_recorded_at?: string | null;
  evidence_recorded_at_reliable?: boolean | null;
  evidence_historical_unknown?: boolean | null;
}

export interface CreateChecklistPayload {
  recordsNo: string;
  activity: string;
  date: string;
  status: string;
  packageName: string;
  location?: string;
  itpIndex: number;
  contractor?: string;
  itpId?: string;
  itpVersion?: string;
  passCount?: number;
  failCount?: number;
  itrId?: string;
  itrNumber?: string;
  noiNumber?: string;
  detail_data?: string;
}

export const getChecklists = async (params?: FilterParams): Promise<ChecklistRecordApi[]> => {
  const queryParams: any = { ...params };
  if (params?.itrId) queryParams.itr_id = params.itrId;
  if (params?.noiNumber) queryParams.noi_number = params.noiNumber;
  const response = await api.get<ChecklistRecordApi[]>('/checklist/', { params: queryParams });
  return response.data;
};

export const createChecklist = async (data: CreateChecklistPayload): Promise<ChecklistRecordApi> => {
  const response = await api.post<ChecklistRecordApi>('/checklist/', data);
  return response.data;
};

export const updateChecklist = async (id: string, data: Partial<CreateChecklistPayload>): Promise<ChecklistRecordApi> => {
  const response = await api.put<ChecklistRecordApi>(`/checklist/${id}/`, data);
  return response.data;
};

export const deleteChecklist = async (id: string): Promise<void> => {
  await api.delete(`/checklist/${id}/`);
};

// §17: link a checklist TEMPLATE onto an ITR — the backend creates an
// ITR-owned instance copy (it never mutates the shared template).
export const linkChecklistToITR = async (itrId: string, checklistId: string): Promise<any> => {
  const response = await api.post(`/itr/${itrId}/link-checklist`, null, { params: { checklist_id: checklistId } });
  return response.data;
};

// §17: remove a checklist instance from an ITR (deletes the ITR-owned copy).
export const unlinkChecklistFromITR = async (itrId: string, checklistId: string): Promise<any> => {
  const response = await api.delete(`/itr/${itrId}/link-checklist/${checklistId}`);
  return response.data;
};

export interface KPIWeight {
  id: number;
  pqp_weight: number;
  itp_weight: number;
  obs_weight: number;
  ncr_weight: number;
  updated_at?: string | null;
}

export const getKPIWeight = async (): Promise<KPIWeight> => {
  const response = await api.get('/kpi/weights');
  return response.data;
};

export const updateKPIWeight = async (weight: Omit<KPIWeight, 'id' | 'updated_at'>): Promise<KPIWeight> => {
  const response = await api.put('/kpi/weights', weight);
  return response.data;
};

// One meeting can produce several action items in one save — this creates
// them all as FollowUp rows in a single call rather than N round-trips.
export const bulkCreateFollowUps = async (items: Record<string, unknown>[]): Promise<any[]> => {
  const response = await api.post('/followup/bulk/', items);
  return response.data;
};

// Auto-create an NCR from a failed/rejected ITR — backend pre-populates
// vendor, NOI reference, location, etc. from the source ITR.
export const createNcrFromItr = async (itrId: string): Promise<any> => {
  const response = await api.post(`/itr/${itrId}/create-ncr`);
  return response.data;
};

// Create a re-inspection ITR from a failed/rejected ITR — backend copies
// vendor, NOI, subject, event/checkpoint, etc. from the source ITR.
export const createReinspectionItr = async (itrId: string): Promise<any> => {
  const response = await api.post(`/itr/${itrId}/re-inspect`);
  return response.data;
};

// Revoke an ITR's approval — the ONLY sanctioned way out of Approved (a
// normal update cannot change status away from Approved). Backend is gated
// on ITR_APPROVE, requires a non-empty reason, and writes the audit entry
// (incl. the checklist snapshot) in the same transaction.
export const revokeItrApproval = async (
  itrId: string,
  newStatus: 'In Progress' | 'Void',
  reason: string
): Promise<any> => {
  const response = await api.post(`/itr/${itrId}/revoke-approval`, { new_status: newStatus, reason });
  return response.data;
};

// Approval history — READ-ONLY (2026-09-20). The list carries no snapshots; a single event (with its stored
// ITR + Checklist snapshots) is fetched only when the user opens it. There is deliberately no write call here.
export const getItrApprovalEvents = async (
  itrId: string,
  params: { skip?: number; limit?: number } = {}
): Promise<import('../utils/approvalHistory').ApprovalEventPage> => {
  const response = await api.get(`/itr/${encodeURIComponent(itrId)}/approval-events`, { params });
  return response.data;
};

export const getItrApprovalEvent = async (
  itrId: string,
  eventId: number
): Promise<import('../utils/approvalHistory').ApprovalEventDetail> => {
  const response = await api.get(`/itr/${encodeURIComponent(itrId)}/approval-events/${eventId}`);
  return response.data;
};

// Create the next occurrence of a recurring meeting series (BACKLOG #18) —
// backend reuses the source row's documentNumber and increments rev;
// new row starts as Draft.
export const createMeetingMinutesOccurrence = async (meetingId: string): Promise<any> => {
  const response = await api.post(`/meeting-minutes/${meetingId}/new-occurrence`);
  return response.data;
};

// Formal .docx export of an NCR report (BACKLOG #18 pilot) — mirrors
// kmService.exportDocx's blob-download pattern.
export const exportNcrDocx = async (ncrId: string, filename: string): Promise<void> => {
  const response = await api.get(`/ncr/${ncrId}/export-docx`, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([response.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.docx`;
  a.click();
  URL.revokeObjectURL(url);
};

// Formal .docx export of an ITR report, including linked Checklist results
// (ITR-EXPORT-DOCX-2026-001) — mirrors exportNcrDocx's blob-download pattern.
export const exportItrDocx = async (itrId: string, filename: string): Promise<void> => {
  const response = await api.get(`/itr/${itrId}/export-docx`, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([response.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.docx`;
  a.click();
  URL.revokeObjectURL(url);
};

// Formal .docx export of a Notice of Inspection (NOI-EXPORT-DOCX-2026-001) — mirrors
// exportItrDocx's blob-download pattern.
export const exportNoiDocx = async (noiId: string, filename: string): Promise<void> => {
  const response = await api.get(`/noi/${noiId}/export-docx`, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([response.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.docx`;
  a.click();
  URL.revokeObjectURL(url);
};

// --- File Management API ---

export interface AttachmentInfo {
  id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  file_url: string;
  file_size?: number;
  mime_type?: string;
  category: string;
  uploaded_by?: string;
  uploaded_at: string;
}

export const uploadFiles = async (
  entityType: string,
  entityId: string,
  files: File[],
  category: string = 'attachment'
): Promise<AttachmentInfo[]> => {
  const formData = new FormData();
  formData.append('entity_type', entityType);
  formData.append('entity_id', entityId);
  formData.append('category', category);
  files.forEach((file) => formData.append('files', file));

  const response = await api.post<AttachmentInfo[]>('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const getEntityFiles = async (
  entityType: string,
  entityId: string,
  category?: string
): Promise<AttachmentInfo[]> => {
  const params: Record<string, string> = { entity_type: entityType, entity_id: entityId };
  if (category) params.category = category;
  // No trailing slash: the backend route is exactly `/files/by-entity`, and a slash makes FastAPI answer 307 with an ABSOLUTE Location that only
  // works when every proxy in front rewrites or preserves it (2026-09-21) — an extra round trip for every list, and a failed one where it does not.
  const response = await api.get<AttachmentInfo[]>('/files/by-entity', { params });
  return response.data;
};

export const deleteFile = async (fileId: string): Promise<void> => {
  await api.delete(`/files/${fileId}`);
};

/**
 * The backend builds file URLs from ``request.base_url`` (e.g.
 * ``http://127.0.0.1:8000/api/files/download/...``). Loading that absolute URL
 * directly in an <img>/<iframe> is cross-origin relative to the app origin, so
 * the browser does NOT attach the httpOnly auth cookie and the request 401s —
 * the image silently fails to render.
 *
 * Collapse it to a same-origin relative path (``/api/files/download/...``) so
 * the request flows through the dev proxy / nginx on the app's own origin,
 * where the cookie is sent automatically. We deliberately do NOT append
 * ``?token=`` — that would leak the token into history, access logs and Referer.
 */
export const getAuthenticatedFileUrl = (url: string): string => {
  if (!url) return url;
  // data:/blob: URLs are already self-contained — leave them untouched.
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    // Already a relative path (or unparseable) — return unchanged.
    return url;
  }
};

export default api;
