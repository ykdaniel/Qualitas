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

// Request interceptor: attach Bearer token (legacy) AND CSRF header for cookie auth
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Echo the CSRF cookie back as a header for state-changing requests so the
    // backend's double-submit check passes when authenticating via cookie.
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
let refreshSubscribers: ((token: string) => void)[] = [];

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
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

      // Refresh token comes from either the httpOnly cookie (auto-attached
      // via withCredentials) or, for legacy clients, localStorage.
      const refreshToken = localStorage.getItem('refreshToken');

      // If already refreshing, queue this request until the new token arrives
      if (isRefreshing) {
        return new Promise((resolve) => {
          addRefreshSubscriber((newToken: string) => {
            if (newToken) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            resolve(api(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        // Send refresh_token in body if we have one (legacy); otherwise rely on the cookie.
        const res = await axios.post(
          `${baseURL}/auth/refresh`,
          refreshToken ? { refresh_token: refreshToken } : {},
          { withCredentials: true }
        );
        const { access_token, refresh_token: newRefresh } = res.data;
        if (access_token) localStorage.setItem('token', access_token);
        if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
        isRefreshing = false;
        onTokenRefreshed(access_token || '');

        // Retry the original request with the new token (header) — cookie was
        // already updated by the server's Set-Cookie response.
        if (access_token) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }
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
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
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
  is_active: boolean;
  full_name?: string;
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

  const response = await api.post<AttachmentInfo[]>('/files/upload/', formData, {
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
  const response = await api.get<AttachmentInfo[]>('/files/by-entity/', { params });
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
