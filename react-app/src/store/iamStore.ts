import { create } from 'zustand';
import * as apiService from '../services/api';
import { getErrorMessage } from '../utils/errorUtils';

// NOTE: 匯出 User 和 Role 型別，供 IAM 元件使用（保持與既有元件介面一致）
export interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    role_id?: number;
    status: 'active' | 'inactive';
    createdAt: string;
}

export interface Role {
    id: string;
    name: string;
    description: string;
    permissions: string[];
}

export interface Permission {
    id: number;
    code: string;
    name: string;
    description: string;
    module: string;
}

interface IAMState {
    users: User[];
    roles: Role[];
    permissions: Permission[];
    loading: boolean;
    error: string | null;

    // Actions — 與既有 IAM 元件介面一致
    fetchUsers: () => Promise<void>;
    fetchRoles: () => Promise<void>;
    fetchPermissions: () => Promise<void>;
    fetchData: () => Promise<void>;
    refetch: () => Promise<void>;
    // NOTE: 接受任意 payload 物件，與 IAM 元件的呼叫方式一致
    createUser: (payload: any) => Promise<any>;
    updateUser: (id: number, payload: any) => Promise<any>;
    deleteUser: (id: number, reason?: string) => Promise<void>;
    createRole: (payload: any) => Promise<any>;
    updateRole: (id: number, payload: any) => Promise<any>;
    deleteRole: (id: number, reason?: string) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;
}

export const useIAMStore = create<IAMState>((set, get) => ({
    users: [],
    roles: [],
    permissions: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchUsers: async () => {
        set({ loading: true, error: null });
        try {
            const usersData = await apiService.getUsers();
            const formattedUsers: User[] = usersData.map(u => ({
                id: String(u.id),
                name: u.full_name || u.username,
                email: u.email,
                role: u.role_name || 'user',
                status: u.is_active ? 'active' as const : 'inactive' as const,
                createdAt: (u as any).created_at || new Date().toISOString().split('T')[0],
            }));
            set({ users: formattedUsers, loading: false });
        } catch (err: any) {
            const errorMsg = getErrorMessage(err, 'Failed to fetch users');
            set({ error: errorMsg, loading: false });
        }
    },

    fetchRoles: async () => {
        set({ loading: true, error: null });
        try {
            const rolesData = await apiService.getRoles();
            const formattedRoles: Role[] = rolesData.map(r => ({
                id: String(r.id),
                name: r.name,
                description: r.description || '',
                permissions: Array.isArray(r.permissions) ? r.permissions : [],
            }));
            set({ roles: formattedRoles, loading: false });
        } catch (err: any) {
            const errorMsg = getErrorMessage(err, 'Failed to fetch roles');
            set({ error: errorMsg, loading: false });
        }
    },

    fetchPermissions: async () => {
        set({ loading: true, error: null });
        try {
            const permsData = await apiService.getPermissions();
            // NOTE: 確保 description 為 string（API 可能回傳 undefined）
            set({ permissions: permsData.map(p => ({ ...p, description: p.description || '' })), loading: false });
        } catch (err: any) {
            const errorMsg = getErrorMessage(err, 'Failed to fetch permissions');
            set({ error: errorMsg, loading: false });
        }
    },

    // NOTE: 一次性取得 Users + Roles，供 AuthContext 登入時使用
    fetchData: async () => {
        set({ loading: true, error: null });
        try {
            const [usersData, rolesData] = await Promise.all([
                apiService.getUsers(),
                apiService.getRoles(),
            ]);
            const formattedUsers: User[] = usersData.map(u => ({
                id: String(u.id),
                name: u.full_name || u.username,
                email: u.email,
                role: u.role_name || 'user',
                status: u.is_active ? 'active' as const : 'inactive' as const,
                createdAt: (u as any).created_at || new Date().toISOString().split('T')[0],
            }));
            const formattedRoles: Role[] = rolesData.map(r => ({
                id: String(r.id),
                name: r.name,
                description: r.description || '',
                permissions: Array.isArray(r.permissions) ? r.permissions : [],
            }));
            set({ users: formattedUsers, roles: formattedRoles, loading: false });
        } catch (err: any) {
            const errorMsg = getErrorMessage(err, 'Failed to fetch IAM data');
            set({ error: errorMsg, loading: false });
        }
    },

    refetch: async () => {
        await get().fetchData();
    },

    // --- User CRUD ---
    createUser: async (payload: any) => {
        const apiPayload: apiService.CreateUserPayload = {
            username: payload.name || payload.username,
            email: payload.email,
            password: payload.password || `User_${Date.now()}`,
            role_id: payload.role_id,
            is_active: payload.status === 'active',
        };
        const result = await apiService.createUser(apiPayload);
        const newUser: User = {
            id: String(result.id),
            name: result.full_name || result.username,
            email: result.email,
            role: result.role_name || 'user',
            role_id: payload.role_id,
            status: result.is_active ? 'active' : 'inactive',
            createdAt: (result as any).created_at || new Date().toISOString().split('T')[0],
        };
        set((state) => ({ users: [...state.users, newUser] }));
        return result;
    },

    updateUser: async (id: number, payload: any) => {
        const apiPayload: apiService.UpdateUserPayload = {};
        if (payload.name) apiPayload.username = payload.name;
        if (payload.email) apiPayload.email = payload.email;
        if (payload.status) apiPayload.is_active = payload.status === 'active';
        if (payload.role_id) apiPayload.role_id = payload.role_id;
        if (payload.password) apiPayload.password = payload.password;

        const result = await apiService.updateUser(id, apiPayload);
        const updatedUser: User = {
            id: String(result.id),
            name: result.full_name || result.username,
            email: result.email,
            role: result.role_name || 'user',
            role_id: payload.role_id || 0,
            status: result.is_active ? 'active' : 'inactive',
            createdAt: (result as any).created_at || new Date().toISOString().split('T')[0],
        };
        set((state) => ({
            users: state.users.map(u => (u.id === String(id) ? updatedUser : u)),
        }));
        return result;
    },

    deleteUser: async (id: number, _reason?: string) => {
        await apiService.deleteUser(id);
        set((state) => ({ users: state.users.filter(u => u.id !== String(id)) }));
    },

    // --- Role CRUD ---
    createRole: async (payload: any) => {
        const apiPayload: apiService.CreateRolePayload = {
            name: payload.name,
            description: payload.description,
            permissions: payload.permissions,
        };
        const result = await apiService.createRole(apiPayload);
        const newRole: Role = {
            id: String(result.id),
            name: result.name,
            description: result.description || '',
            permissions: result.permissions,
        };
        set((state) => ({ roles: [...state.roles, newRole] }));
        return result;
    },

    updateRole: async (id: number, payload: any) => {
        const apiPayload: apiService.UpdateRolePayload = {};
        if (payload.name) apiPayload.name = payload.name;
        if (payload.description) apiPayload.description = payload.description;
        if (payload.permissions) apiPayload.permissions = payload.permissions;

        const result = await apiService.updateRole(id, apiPayload);
        set((state) => ({
            roles: state.roles.map(r => (r.id === String(id) ? {
                id: String(result.id),
                name: result.name,
                description: result.description || '',
                permissions: result.permissions,
            } : r)),
        }));
        return result;
    },

    deleteRole: async (id: number, _reason?: string) => {
        await apiService.deleteRole(id);
        set((state) => ({ roles: state.roles.filter(r => r.id !== String(id)) }));
    },
}));
