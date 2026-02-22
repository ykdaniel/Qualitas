import React, { useState, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createRoleColumns } from './columns';
import { useIAMStore, Role } from '../../store/iamStore';
import DeleteAuditModal from './DeleteAuditModal';
import styles from './IAM.module.css';
import { z } from 'zod';

const roleSchema = z.object({
    name: z.string().min(2, "Role name must be at least 2 characters"),
    description: z.string().min(5, "Description is required"),
    permissions: z.array(z.string()).min(1, "At least one permission must be selected"),
    reason: z.string().min(5, "Audit reason is required (min 5 characters)"),
});

const RoleManagement: React.FC = () => {
    const { t } = useLanguage();
    const { roles, permissions, createRole, updateRole, deleteRole, loading } = useIAMStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);

    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null }>({
        isOpen: false,
        id: null
    });

    const [form, setForm] = useState({
        name: '',
        description: '',
        permissions: [] as string[],
        reason: ''
    });

    const groupedPermissions = useMemo(() => {
        return permissions.reduce((acc, perm) => {
            const moduleName = (perm.code.split(':')[0] || 'OTHER').toUpperCase();
            if (!acc[moduleName]) acc[moduleName] = [];
            acc[moduleName].push(perm);
            return acc;
        }, {} as Record<string, typeof permissions>);
    }, [permissions]);

    const filteredRoles = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return roles.filter(r =>
            r.name.toLowerCase().includes(query) ||
            r.description.toLowerCase().includes(query)
        );
    }, [roles, searchQuery]);

    const handleEdit = (role: Role) => {
        setEditingRole(role);
        setForm({
            name: role.name,
            description: role.description,
            permissions: [...role.permissions],
            reason: ''
        });
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        try {
            roleSchema.parse(form);
            if (editingRole) {
                await updateRole(parseInt(editingRole.id), form);
            } else {
                await createRole(form);
            }
            setIsModalOpen(false);
        } catch (err: any) {
            if (err instanceof z.ZodError) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const error = err as any;
                const issues = error.errors || error.issues;
                if (issues && Array.isArray(issues)) {
                    alert(issues.map((e: any) => e.message).join('\n'));
                } else {
                    console.error("Validation error:", error);
                    alert(`Validation failed: ${error.message || 'Unknown error'}`);
                }
            } else {
                alert(err.message || "An error occurred");
            }
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
                alert(err.message || "Failed to delete role");
            }
        }
    };

    const togglePermission = (code: string) => {
        setForm(prev => ({
            ...prev,
            permissions: prev.permissions.includes(code)
                ? prev.permissions.filter(p => p !== code)
                : [...prev.permissions, code]
        }));
    };

    return (
        <div className={styles.content}>
            <div className={styles.searchBar}>
                <input
                    type="text"
                    placeholder={t('iam.searchRole')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                />
            </div>

            <DataTable
                title={t('iam.roleList')}
                actions={
                    <button className={styles.addNewButton} onClick={() => { setEditingRole(null); setForm({ name: '', description: '', permissions: [], reason: '' }); setIsModalOpen(true); }}>
                        {t('iam.addRole')}
                    </button>
                }
                columns={createRoleColumns(handleEdit, handleDeleteClick, permissions, t)}
                data={filteredRoles}
                getRowId={(row) => row.id}
                onRowClick={(row) => handleEdit(row)}
            />

            {isModalOpen && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <h2>{editingRole ? t('iam.editRole') : t('iam.addRole')}</h2>
                        <div className={styles.formGroup}>
                            <label>{t('iam.roleName')}</label>
                            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                        </div>
                        <div className={styles.formGroup}>
                            <label>{t('iam.description')}</label>
                            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
                        </div>
                        <div className={styles.formGroup}>
                            <label>{t('iam.permissionsLabel')}</label>
                            <div className={styles.permissionsGroupContainer}>
                                {Object.entries(groupedPermissions).map(([moduleName, modulePerms]) => (
                                    <div key={moduleName} className={styles.permissionSection}>
                                        <div className={styles.permissionSectionHeader}>
                                            {moduleName} MODULE
                                        </div>
                                        <div className={styles.permissionsSectionGrid}>
                                            {modulePerms.map(p => (
                                                <label key={p.code} className={styles.permissionCheckbox}>
                                                    <input
                                                        type="checkbox"
                                                        checked={form.permissions.includes(p.code)}
                                                        onChange={() => togglePermission(p.code)}
                                                    />
                                                    <span>{p.description || p.code}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label>{t('iam.auditReason') || 'Change Reason (Audit)'} <span style={{ color: 'red' }}>*</span></label>
                            <textarea
                                value={form.reason}
                                onChange={e => setForm({ ...form, reason: e.target.value })}
                                placeholder="Reason for this change..."
                                rows={2}
                            />
                        </div>
                        <div className={styles.formActions}>
                            <button onClick={handleSave} className={styles.saveButton} disabled={loading}>{t('common.save')}</button>
                            <button onClick={() => setIsModalOpen(false)} className={styles.cancelButton}>{t('common.cancel')}</button>
                        </div>
                    </div>
                </div>
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
