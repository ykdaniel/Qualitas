import React, { useState, useMemo, useDeferredValue } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '../../context/LanguageContext';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createUserColumns } from './columns';
import { useIAMStore, User } from '../../store/iamStore';
import DeleteAuditModal from './DeleteAuditModal';
import UserModal from './UserModal';
import styles from './IAM.module.css';
import { Plus } from 'lucide-react';

interface UserManagementProps {
    searchQuery: string;
    tabsComponent: React.ReactNode;
}

const UserManagement: React.FC<UserManagementProps> = ({ searchQuery, tabsComponent }) => {
    const { t } = useLanguage();
    const { users, roles, createUser, updateUser, deleteUser, loading } = useIAMStore();
    const deferredQuery = useDeferredValue(searchQuery);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null }>({
        isOpen: false,
        id: null
    });

    const filteredUsers = useMemo(() => {
        const query = deferredQuery.toLowerCase();
        return users.filter(u =>
            u.name.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query) ||
            u.role.toLowerCase().includes(query)
        );
    }, [users, deferredQuery]);

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setIsModalOpen(true);
    };

    const handleSave = async (validationData: any, isUpdate: boolean, id?: number) => {
        if (isUpdate && id) {
            await updateUser(id, validationData);
        } else {
            await createUser(validationData);
        }
    };

    const handleDeleteClick = (id: string) => {
        setDeleteModal({ isOpen: true, id });
    };

    const handleDeleteConfirm = async (reason: string) => {
        if (deleteModal.id) {
            try {
                await deleteUser(parseInt(deleteModal.id), reason);
                setDeleteModal({ isOpen: false, id: null });
            } catch (err: any) {
                toast.error(err.message || "Failed to delete user");
            }
        }
    };

    return (
        <div className={styles.contentWrapper}>
            <div className={styles.actionBar}>
                {tabsComponent}
                <div className={styles.actionsBox}>
                    <button className={styles.addNewButton} onClick={() => { setEditingUser(null); setIsModalOpen(true); }}>
                        <Plus size={18} />
                        {t('iam.addUser')}
                    </button>
                </div>
            </div>

            <div className={styles.tableCard}>
                <div className={styles.tableFadeIn}>
                    <DataTable
                        title={t('iam.userList')}
                        actions={null} // Actions moved to Action Bar
                        columns={createUserColumns(handleEdit, handleDeleteClick, roles, t)}
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
                    roles={roles}
                    onSave={handleSave}
                    onClose={() => setIsModalOpen(false)}
                    t={t}
                    loading={loading}
                />
            )}

            <DeleteAuditModal
                isOpen={deleteModal.isOpen}
                title={t('iam.deleteUser') || 'Delete User'}
                message={t('common.confirmDelete') || 'Are you sure you want to delete this user?'}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteModal({ isOpen: false, id: null })}
            />
        </div>
    );
};

export default UserManagement;
