import React, { useState, useMemo, useDeferredValue } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createRoleColumns } from './columns';
import { useIAMStore, Role } from '../../store/iamStore';
import { showRefusal } from '../../store/refusalStore';
import DeleteAuditModal from './DeleteAuditModal';
import RoleModal from './RoleModal';
import { reloadAndReopen, useOpenSession, useRecordVersion } from '../../hooks/useRecordVersion';
import { toast } from 'sonner';
import styles from './IAM.module.css';
import { Plus } from 'lucide-react';

interface RoleManagementProps {
    searchQuery: string;
    tabsComponent: React.ReactNode;
}

const RoleManagement: React.FC<RoleManagementProps> = ({ searchQuery, tabsComponent }) => {
    const { t } = useLanguage();
    const { hasPermission } = useAuth();
    const { roles, permissions, createRole, updateRole, deleteRole, loading } = useIAMStore();
    
    const deferredQuery = useDeferredValue(searchQuery);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    // OPTIMISTIC-LOCK-2026-001 B3b: the role's version (taken when the window opens) and which opening is current.
    const recordVersion = useRecordVersion();
    const openSession = useOpenSession();

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
        recordVersion.open(role.row_version);
        openSession.next();
        setEditingRole(role);
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        recordVersion.open(null);
        openSession.next();
        setEditingRole(null);
        setIsModalOpen(true);
    };

    // "Reload this record" after a 409 VERSION_CONFLICT (the refusal dialog has already confirmed that the form's changes are
    // discarded): close the window, reload the roles, open this role again with what is saved now.
    const reloadRecord = (id: string) => reloadAndReopen(openSession, {
        close: () => setIsModalOpen(false),
        reload: () => useIAMStore.getState().fetchRoles(),
        failed: () => !!useIAMStore.getState().error,
        found: () => useIAMStore.getState().roles.some(r => r.id === id),
        reopen: () => {
            const fresh = useIAMStore.getState().roles.find(r => r.id === id);
            if (fresh) handleEdit(fresh);
        },
        forget: () => setEditingRole(null),
        notify: (notice) => toast.warning(t(notice)),
    });

    const handleSave = async (validationData: any, isUpdate: boolean, id?: number) => {
        if (isUpdate && id) {
            await updateRole(id, validationData, recordVersion.current());
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
            } catch (err) {
                // still assigned to users / Admin role: the refusal dialog opens over this one, which stays open with the reason kept
                console.error('Failed to delete role:', err);
                showRefusal(err, 'delete');
            }
        }
    };

    return (
        <div className={styles.contentWrapper}>
            <div className={styles.actionBar}>
                {tabsComponent}
                <div className={styles.actionsBox}>
                    {hasPermission('iam:role:manage') && (
                        <button className={styles.addNewButton} onClick={handleAddNew}>
                            <Plus size={18} />
                            {t('iam.addRole')}
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.tableCard}>
                <div className={styles.tableFadeIn}>
                    <DataTable
                        title={t('iam.roleList')}
                        actions={null} // Actions decoupled to Action bar
                        columns={createRoleColumns(handleDeleteClick, permissions, t)}
                        data={filteredRoles}
                        getRowId={(row) => row.id}
                        onRowClick={(row) => handleEdit(row)}
                        searchKey="" // Search handled by our custom search bar
                    />
                </div>
            </div>

            {isModalOpen && (
                <RoleModal
                    key={openSession.key}
                    existingRole={editingRole}
                    onReloadRecord={editingRole ? () => { void reloadRecord(editingRole.id); } : undefined}
                    readOnly={!hasPermission('iam:role:manage')}
                    permissions={permissions}
                    onSave={handleSave}
                    onClose={() => setIsModalOpen(false)}
                    t={t}
                    loading={loading}
                />
            )}

            <DeleteAuditModal
                key={deleteModal.id ?? 'closed'}
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
