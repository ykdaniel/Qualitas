import React, { useState, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createUserColumns } from './columns';
import { useIAMStore, User } from '../../store/iamStore';
import DeleteAuditModal from './DeleteAuditModal';
import styles from './IAM.module.css';
import { z } from 'zod';

const userSchema = z.object({
    name: z.string().min(3, "Username must be at least 3 characters"),
    email: z.string().email("Invalid email address"),
    role_id: z.number().int().positive("Invalid role"),
    status: z.enum(['active', 'inactive']),
    password: z.string().min(8, "Password must be at least 8 characters").optional(),
    reason: z.string().min(5, "Audit reason is required (min 5 characters)"),
});

const UserManagement: React.FC = () => {
    const { t } = useLanguage();
    const { users, roles, fetchUsers, createUser, updateUser, deleteUser, loading } = useIAMStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [resetPassword, setResetPassword] = useState(false);

    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null }>({
        isOpen: false,
        id: null
    });

    const [form, setForm] = useState({
        name: '',
        email: '',
        role: '',
        status: 'active' as 'active' | 'inactive',
        password: '',
        confirmPassword: '',
        reason: ''
    });

    const filteredUsers = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return users.filter(u =>
            u.name.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query) ||
            u.role.toLowerCase().includes(query)
        );
    }, [users, searchQuery]);

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setResetPassword(false);
        setForm({
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status as 'active' | 'inactive',
            password: '',
            confirmPassword: '',
            reason: ''
        });
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        try {
            const selectedRole = roles.find(r => r.name === form.role);
            if (!selectedRole && !editingUser) throw new Error("Please select a valid role");

            const roleId = selectedRole ? parseInt(selectedRole.id) : (editingUser ? editingUser.role_id : 0);

            const validationData = {
                name: form.name,
                email: form.email,
                role_id: roleId,
                status: form.status,
                password: (editingUser && !resetPassword) ? undefined : (form.password || undefined),
                reason: form.reason
            };

            userSchema.parse(validationData);

            if (form.password && form.password !== form.confirmPassword) {
                throw new Error(t('iam.passwordMismatch') || "Passwords don't match");
            }

            if (editingUser) {
                await updateUser(parseInt(editingUser.id), validationData);
            } else {
                await createUser(validationData);
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
                await deleteUser(parseInt(deleteModal.id), reason);
                setDeleteModal({ isOpen: false, id: null });
            } catch (err: any) {
                alert(err.message || "Failed to delete user");
            }
        }
    };

    return (
        <div className={styles.content}>
            <div className={styles.searchBar}>
                <input
                    type="text"
                    placeholder={t('iam.searchUser')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                />
            </div>

            <DataTable
                title={t('iam.userList')}
                actions={
                    <button className={styles.addNewButton} onClick={() => { setEditingUser(null); setForm({ name: '', email: '', role: roles[0]?.name || '', status: 'active', password: '', confirmPassword: '', reason: '' }); setIsModalOpen(true); }}>
                        {t('iam.addUser')}
                    </button>
                }
                columns={createUserColumns(handleEdit, handleDeleteClick, roles, t)}
                data={filteredUsers}
                getRowId={(row) => row.id}
                onRowClick={(row) => handleEdit(row)}
            />

            {isModalOpen && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <h2>{editingUser ? t('iam.editUser') : t('iam.addUser')}</h2>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label>{t('iam.name')}</label>
                                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                            </div>
                            <div className={styles.formGroup}>
                                <label>{t('iam.email')}</label>
                                <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                            </div>
                            <div className={styles.formGroup}>
                                <label>{t('iam.role')}</label>
                                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                                    {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label>{t('iam.status')}</label>
                                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
                                    <option value="active">{t('iam.status.active')}</option>
                                    <option value="inactive">{t('iam.status.inactive')}</option>
                                </select>
                            </div>

                            {editingUser && (
                                <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                                    <label className={styles.checkboxLabel}>
                                        <input type="checkbox" checked={resetPassword} onChange={e => setResetPassword(e.target.checked)} />
                                        {t('iam.resetPassword') || 'Reset Password'}
                                    </label>
                                </div>
                            )}

                            {(!editingUser || resetPassword) && (
                                <>
                                    <div className={styles.formGroup}>
                                        <label>{t('iam.password')}</label>
                                        <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label>{t('iam.confirmPassword')}</label>
                                        <input type="password" value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })} />
                                    </div>
                                </>
                            )}

                            <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                                <label>{t('iam.auditReason') || 'Change Reason (Audit)'} <span style={{ color: 'red' }}>*</span></label>
                                <textarea
                                    value={form.reason}
                                    onChange={e => setForm({ ...form, reason: e.target.value })}
                                    placeholder="Provide a reason for this change..."
                                    rows={2}
                                />
                            </div>
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
                title={t('iam.deleteUser') || 'Delete User'}
                message={t('common.confirmDelete') || 'Are you sure you want to delete this user?'}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteModal({ isOpen: false, id: null })}
            />
        </div>
    );
};

export default UserManagement;
