import React, { useState, useMemo, useDeferredValue } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '../../context/LanguageContext';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createRoleColumns } from './columns';
import { useIAMStore, Role } from '../../store/iamStore';
import DeleteAuditModal from './DeleteAuditModal';
import RoleModal from './RoleModal';
import styles from './IAM.module.css';
import { Plus } from 'lucide-react';

interface RoleManagementProps {
    searchQuery: string;
    tabsComponent: React.ReactNode;
}

const RoleManagement: React.FC<RoleManagementProps> = ({ searchQuery, tabsComponent }) => {
    const { t } = useLanguage();
    const { roles, permissions, createRole, updateRole, deleteRole, loading } = useIAMStore();
    
    const deferredQuery = useDeferredValue(searchQuery);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);

    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null }>({
        isOpen: false,
        id: null
    });

    const filteredRoles = useMemo(() => {
        const query = deferredQuery.toLowerCase();
        return roles.filter(r =>
            r.name.toLowerCase().includes(query) ||
            r.description.toLowerCase().includes(query)
        );
    }, [roles, deferredQuery]);

    const handleEdit = (role: Role) => {
        setEditingRole(role);
        setIsModalOpen(true);
    };

    const handleSave = async (validationData: any, isUpdate: boolean, id?: number) => {
        if (isUpdate && id) {
            await updateRole(id, validationData);
        } else {
            await createRole(validationData);
        }
    };

    const handleDeleteClick = (id: string) => {
        setDeleteModal({ isOpen: true, id });
    };

    const handleDeleteConfirm = async (reason: string) => {
        if (deleteModal.id) {
            try {
                await deleteRole(parseInt(deleteModal.id), reason);
                setDeleteModal({ isOpen: false, id: null });
            } catch (err: any) {
                toast.error(err.message || "Failed to delete role");
            }
        }
    };

    return (
        <div className={styles.contentWrapper}>
            <div className={styles.actionBar}>
                {tabsComponent}
                <div className={styles.actionsBox}>
                    <button className={styles.addNewButton} onClick={() => { setEditingRole(null); setIsModalOpen(true); }}>
                        <Plus size={18} />
                        {t('iam.addRole')}
                    </button>
                </div>
            </div>

            <div className={styles.tableCard}>
                <div className={styles.tableFadeIn}>
                    <DataTable
                        title={t('iam.roleList')}
                        actions={null} // Actions decoupled to Action bar
                        columns={createRoleColumns(handleEdit, handleDeleteClick, permissions, t)}
                        data={filteredRoles}
                        getRowId={(row) => row.id}
                        onRowClick={(row) => handleEdit(row)}
                        searchKey="" // Search handled by our custom search bar
                    />
                </div>
            </div>

            {isModalOpen && (
                <RoleModal
                    existingRole={editingRole}
                    permissions={permissions}
                    onSave={handleSave}
                    onClose={() => setIsModalOpen(false)}
                    t={t}
                    loading={loading}
                />
            )}

            <DeleteAuditModal
                isOpen={deleteModal.isOpen}
                title={t('iam.deleteRole') || 'Delete Role'}
                message={t('common.confirmDelete') || 'Are you sure you want to delete this role?'}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteModal({ isOpen: false, id: null })}
            />
        </div>
    );
};

export default RoleManagement;
