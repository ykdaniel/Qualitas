import React, { useState, useMemo, useDeferredValue } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createUserColumns } from './columns';
import { useIAMStore, User } from '../../store/iamStore';
import UserModal from './UserModal';
import styles from './IAM.module.css';
import { Plus } from 'lucide-react';

interface UserManagementProps {
    searchQuery: string;
    tabsComponent: React.ReactNode;
}

const UserManagement: React.FC<UserManagementProps> = ({ searchQuery, tabsComponent }) => {
    const { t } = useLanguage();
    const { hasPermission, user: currentUser } = useAuth();
    // Mirrors the API's rule (which is what actually enforces it): Admin = role name, case-insensitive.
    const isAdminName = (name?: string | null) => (name || '').toLowerCase() === 'admin';
    const viewerIsAdmin = isAdminName(currentUser?.role_name);
    const { users, roles, createUser, updateUser, loading } = useIAMStore();
    const deferredQuery = useDeferredValue(searchQuery);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    const filteredUsers = useMemo(() => {
        const query = deferredQuery.toLowerCase();
        return users.filter(u =>
            u.name.toLowerCase().includes(query) ||
            u.username.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query) ||
            u.role.toLowerCase().includes(query)
        );
    }, [users, deferredQuery]);

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setIsModalOpen(true);
    };

    const handleSave = async (validationData: any, isUpdate: boolean, id?: number): Promise<number | void> => {
        if (isUpdate && id) {
            await updateUser(id, validationData);
            return id;
        } else {
            const result = await createUser(validationData);
            return result?.id != null ? Number(result.id) : undefined;
        }
    };

    return (
        <div className={styles.contentWrapper}>
            <div className={styles.actionBar}>
                {tabsComponent}
                <div className={styles.actionsBox}>
                    {hasPermission('iam:user:manage') && (
                        <button className={styles.addNewButton} onClick={() => { setEditingUser(null); setIsModalOpen(true); }}>
                            <Plus size={18} />
                            {t('iam.addUser')}
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.tableCard}>
                <div className={styles.tableFadeIn}>
                    <DataTable
                        title={t('iam.userList')}
                        actions={null} // Actions moved to Action Bar
                        columns={createUserColumns(roles, t)}
                        data={filteredUsers}
                        getRowId={(row) => row.id}
                        onRowClick={(row) => handleEdit(row)}
                        searchKey="" // Search handled externally by our search bar
                    />
                </div>
            </div>

            {isModalOpen && (
                <UserModal
                    existingUser={editingUser}
                    readOnly={!hasPermission('iam:user:manage') || (!!editingUser && isAdminName(editingUser.role) && !viewerIsAdmin)}
                    canManageRoles={hasPermission('iam:role:manage')}
                    canSetPassword={viewerIsAdmin}
                    adminAccountLocked={!!editingUser && isAdminName(editingUser.role) && !viewerIsAdmin}
                    roles={roles}
                    onSave={handleSave}
                    onClose={() => setIsModalOpen(false)}
                    t={t}
                    loading={loading}
                />
            )}
        </div>
    );
};

export default UserManagement;
