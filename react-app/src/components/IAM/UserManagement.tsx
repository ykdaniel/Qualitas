import React, { useState, useMemo, useDeferredValue } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createUserColumns } from './columns';
import { useIAMStore, User } from '../../store/iamStore';
import UserModal from './UserModal';
import { reloadAndReopen, useOpenSession, useRecordVersion } from '../../hooks/useRecordVersion';
import { toast } from 'sonner';
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
    // OPTIMISTIC-LOCK-2026-001 B3b: the account's version, shared by the form and its scope section (both saves move the same
    // row_version and the window stays open between them), and which opening is current (keys the window; guards a reload).
    const recordVersion = useRecordVersion();
    const openSession = useOpenSession();

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
        recordVersion.open(user.row_version);
        openSession.next();
        setEditingUser(user);
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        recordVersion.open(null);
        openSession.next();
        setEditingUser(null);
        setIsModalOpen(true);
    };

    // "Reload this record" after a 409 VERSION_CONFLICT (the refusal dialog has already confirmed that the form's changes are
    // discarded): close the window, reload the users, open this account again with what is saved now.
    const reloadRecord = (id: string) => reloadAndReopen(openSession, {
        close: () => setIsModalOpen(false),
        reload: () => useIAMStore.getState().fetchUsers(),
        failed: () => !!useIAMStore.getState().error,
        found: () => useIAMStore.getState().users.some(u => u.id === id),
        reopen: () => {
            const fresh = useIAMStore.getState().users.find(u => u.id === id);
            if (fresh) handleEdit(fresh);
        },
        forget: () => setEditingUser(null),
        notify: (notice) => toast.warning(t(notice)),
    });

    const handleSave = async (validationData: any, isUpdate: boolean, id?: number): Promise<number | void> => {
        // the answer's version belongs to the window that saved: never to one opened after it (B3b review R1 P2-1)
        const mine = openSession.key;
        if (isUpdate && id) {
            const result = await updateUser(id, validationData, recordVersion.current());
            if (openSession.isCurrent(mine)) recordVersion.saved(result?.row_version);
            return id;
        } else {
            const result = await createUser(validationData);
            if (openSession.isCurrent(mine)) recordVersion.saved(result?.row_version);
            return result?.id != null ? Number(result.id) : undefined;
        }
    };

    return (
        <div className={styles.contentWrapper}>
            <div className={styles.actionBar}>
                {tabsComponent}
                <div className={styles.actionsBox}>
                    {hasPermission('iam:user:manage') && (
                        <button className={styles.addNewButton} onClick={handleAddNew}>
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
                    key={openSession.key}
                    existingUser={editingUser}
                    recordVersion={recordVersion}
                    onReloadRecord={editingUser ? () => { void reloadRecord(editingUser.id); } : undefined}
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
