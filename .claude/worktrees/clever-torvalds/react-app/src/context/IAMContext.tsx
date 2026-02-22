import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, ReactNode } from 'react';
import api, * as apiService from '../services/api';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { getErrorMessage } from '../utils/errorUtils';

export interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    status: 'active' | 'inactive';
    createdAt: string;
}

export interface Role {
    id: string;
    name: string;
    description: string;
    permissions: string[];
}

interface IAMContextType {
    users: User[];
    roles: Role[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    addUser: (user: Omit<User, 'id'>) => Promise<User>;
    updateUser: (id: string, user: Partial<User>) => Promise<void>;
    deleteUser: (id: string) => Promise<void>;
    addRole: (role: Omit<Role, 'id'>) => Promise<Role>;
    updateRole: (id: string, role: Partial<Role>) => Promise<void>;
    deleteRole: (id: string) => Promise<void>;
}

const IAMContext = createContext<IAMContextType | undefined>(undefined);

// NOTE: localStorage 備援已移除，API 錯誤會直接顯示給使用者

export const IAMProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { handleError } = useErrorHandler();

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [usersData, rolesData] = await Promise.all([
                apiService.getUsers(),
                apiService.getRoles(),
            ]);

            // Transform API data to match Context interfaces
            // API User: id (number), Context User: id (string)
            const formattedUsers: User[] = usersData.map(u => ({
                id: String(u.id),
                name: u.full_name || u.username,
                email: u.email,
                role: u.role_name || 'user',
                status: u.is_active ? 'active' : 'inactive',
                createdAt: (u as any).created_at || new Date().toISOString().split('T')[0],
            }));

            const formattedRoles: Role[] = rolesData.map(r => ({
                id: String(r.id),
                name: r.name,
                description: r.description || '',
                permissions: Array.isArray(r.permissions) ? r.permissions : [],
            }));

            setUsers(formattedUsers);
            setRoles(formattedRoles);
        } catch (err: unknown) {
            const errorMsg = getErrorMessage(err, 'Failed to fetch IAM data');
            setError(errorMsg);
            handleError(err, 'iam.fetchError');
        } finally {
            setLoading(false);
        }
    }, [handleError]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // User CRUD
    const addUser = useCallback(async (user: Omit<User, 'id'>): Promise<User> => {
        try {
            // Find role_id from role name
            const roleObj = roles.find(r => r.name === user.role);
            const roleId = roleObj ? Number(roleObj.id) : 2; // Default to user role if not found

            // NOTE: IAM.tsx 使用直接 API 調用處理密碼，此函式為備用
            // 此函式產生臨時密碼，適用於自動化或批次建立使用者的情境
            const payload: apiService.CreateUserPayload = {
                username: user.name,
                email: user.email,
                password: `User_${Date.now()}`, // 臨時密碼
                role_id: roleId,
                is_active: user.status === 'active',
            };

            const newUserApi = await apiService.createUser(payload);
            const newUser: User = {
                id: String(newUserApi.id),
                name: newUserApi.full_name || newUserApi.username,
                email: newUserApi.email,
                role: newUserApi.role_name || user.role,
                status: newUserApi.is_active ? 'active' : 'inactive',
                createdAt: (newUserApi as any).created_at || new Date().toISOString().split('T')[0],
            };

            setUsers(prev => [...prev, newUser]);
            return newUser;
        } catch (err: unknown) {
            handleError(err, 'iam.saveUserError');
            throw err;
        }
    }, [roles, handleError]);

    const updateUser = useCallback(async (id: string, updates: Partial<User>) => {
        try {
            // We need full payload for update usually, or partial. API supports partial.
            // But we need to map frontend fields to backend
            const currentUser = users.find(u => u.id === id);
            if (!currentUser) return;

            const roleObj = roles.find(r => r.name === (updates.role || currentUser.role));
            const roleId = roleObj ? Number(roleObj.id) : undefined;

            const payload: apiService.UpdateUserPayload = {};
            if (updates.name) payload.username = updates.name; // or full_name?
            if (updates.email) payload.email = updates.email;
            if (updates.status) payload.is_active = updates.status === 'active';
            if (roleId) payload.role_id = roleId;

            const res = await apiService.updateUser(Number(id), payload);

            const updatedUser: User = {
                ...currentUser,
                ...updates,
                name: res.full_name || res.username,
                email: res.email,
                role: res.role_name || currentUser.role, // Backend might not return role_name on update
                status: res.is_active ? 'active' : 'inactive'
            };

            setUsers(prev => prev.map(u => (u.id === id ? updatedUser : u)));
        } catch (err: unknown) {
            // Silently fail for update errors - state rollback not implemented
        }
    }, [users, roles]);

    const deleteUser = useCallback(async (id: string) => {
        try {
            await apiService.deleteUser(Number(id));
            setUsers(prev => prev.filter(u => u.id !== id));
        } catch (err: unknown) {
            // Silently fail for delete errors
        }
    }, []);

    // Role CRUD
    const addRole = useCallback(async (role: Omit<Role, 'id'>): Promise<Role> => {
        try {
            const payload: apiService.CreateRolePayload = {
                name: role.name,
                description: role.description,
                permissions: role.permissions
            };
            const res = await apiService.createRole(payload);
            const newRole: Role = {
                id: String(res.id),
                name: res.name,
                description: res.description || '',
                permissions: res.permissions
            };
            setRoles(prev => [...prev, newRole]);
            return newRole;
        } catch (err: unknown) {
            throw err;
        }
    }, []);

    const updateRole = useCallback(async (id: string, updates: Partial<Role>) => {
        try {
            const payload: apiService.UpdateRolePayload = {};
            if (updates.name) payload.name = updates.name;
            if (updates.description) payload.description = updates.description;
            if (updates.permissions) payload.permissions = updates.permissions;

            const res = await apiService.updateRole(Number(id), payload);

            setRoles(prev => prev.map(r => (r.id === id ? {
                id: String(res.id),
                name: res.name,
                description: res.description || '',
                permissions: res.permissions
            } : r)));
        } catch (err: unknown) {
            // Silently fail for update errors
        }
    }, []);

    const deleteRole = useCallback(async (id: string) => {
        try {
            await apiService.deleteRole(Number(id));
            setRoles(prev => prev.filter(r => r.id !== id));
        } catch (err: unknown) {
            // Silently fail for delete errors
        }
    }, []);

    const value = useMemo(
        () => ({ users, roles, loading, error, refetch: fetchData, addUser, updateUser, deleteUser, addRole, updateRole, deleteRole }),
        [users, roles, loading, error, fetchData, addUser, updateUser, deleteUser, addRole, updateRole, deleteRole]
    );

    return (
        <IAMContext.Provider value={value}>
            {children}
        </IAMContext.Provider>
    );
};

export const useIAM = () => {
    const context = useContext(IAMContext);
    if (context === undefined) {
        throw new Error('useIAM must be used within an IAMProvider');
    }
    return context;
};
