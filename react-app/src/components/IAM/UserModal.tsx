import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Role, User } from '../../store/iamStore';
import styles from './UserModal.module.css';

const userSchema = z.object({
    name: z.string().min(3, "Username must be at least 3 characters"),
    email: z.string().email("Invalid email address"),
    role_id: z.number().int().positive("Invalid role"),
    status: z.enum(['active', 'inactive']),
    password: z.string().min(8, "Password must be at least 8 characters").optional(),
    reason: z.string().min(5, "Audit reason is required (min 5 characters)"),
});

interface UserModalProps {
    existingUser: User | null;
    roles: Role[];
    onSave: (validationData: any, isUpdate: boolean, id?: number) => Promise<void>;
    onClose: () => void;
    t: (key: string) => string;
    loading: boolean;
}

const UserModal: React.FC<UserModalProps> = ({ existingUser, roles, onSave, onClose, t, loading }) => {
    const [isClosing, setIsClosing] = useState(false);
    const [resetPassword, setResetPassword] = useState(false);

    const initialForm = useMemo(() => ({
        name: existingUser?.name || '',
        email: existingUser?.email || '',
        role: existingUser?.role || roles[0]?.name || '',
        status: (existingUser?.status as 'active' | 'inactive') || ('active' as 'active' | 'inactive'),
        password: '',
        confirmPassword: '',
        reason: ''
    }), [existingUser, roles]);

    const [form, setForm] = useState(initialForm);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => onClose(), 250);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const selectedRole = roles.find(r => r.name === form.role);
            if (!selectedRole && !existingUser) throw new Error("Please select a valid role");

            const roleId = selectedRole ? parseInt(selectedRole.id) : (existingUser ? parseInt(existingUser.role_id.toString()) : 0);

            const validationData = {
                name: form.name,
                email: form.email,
                role_id: roleId,
                status: form.status,
                password: (existingUser && !resetPassword) ? undefined : (form.password || undefined),
                reason: form.reason
            };

            userSchema.parse(validationData);

            if (form.password && form.password !== form.confirmPassword) {
                throw new Error(t('iam.passwordMismatch') || "Passwords don't match");
            }

            await onSave(validationData, !!existingUser, existingUser ? parseInt(existingUser.id) : undefined);
            
            // Animation for successful close
            handleClose();
        } catch (err: any) {
            if (err instanceof z.ZodError) {
                const error = err as z.ZodError;
                const issues = error.issues;
                if (issues && Array.isArray(issues)) {
                    toast.error(issues.map((e: any) => e.message).join('\n'));
                } else {
                    console.error("Validation error:", error);
                    toast.error(`Validation failed: ${error.message || 'Unknown error'}`);
                }
            } else {
                toast.error(err.message || "An error occurred");
            }
        }
    };

    return (
        <div className={`${styles.modalOverlay} ${isClosing ? styles.closing : ''}`} onMouseDown={handleClose}>
            <div 
                className={`${styles.modalContent} ${isClosing ? styles.closingCard : ''}`} 
                onMouseDown={e => e.stopPropagation()}
            >
                <div className={styles.modalHeader}>
                    <h2>{existingUser ? t('iam.editUser') : t('iam.addUser')}</h2>
                    <button type="button" className={styles.closeIconBtn} onClick={handleClose}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className={styles.modalForm}>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label>{t('iam.name')} <span className={styles.required}>*</span></label>
                            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                        </div>
                        <div className={styles.formGroup}>
                            <label>{t('iam.email')} <span className={styles.required}>*</span></label>
                            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                        </div>
                        <div className={styles.formGroup}>
                            <label>{t('iam.role')}</label>
                            <div className={styles.selectWrapper}>
                                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                                    {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                                </select>
                                <div className={styles.selectArrow}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </div>
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label>{t('iam.status')}</label>
                            <div className={styles.selectWrapper}>
                                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
                                    <option value="active">{t('iam.status.active') || 'Active'}</option>
                                    <option value="inactive">{t('iam.status.inactive') || 'Inactive'}</option>
                                </select>
                                <div className={styles.selectArrow}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </div>
                            </div>
                        </div>

                        {existingUser && (
                            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                <label className={styles.checkboxLabel}>
                                    <input type="checkbox" checked={resetPassword} onChange={e => setResetPassword(e.target.checked)} />
                                    {t('iam.resetPassword') || 'Reset Password'}
                                </label>
                            </div>
                        )}

                        {(!existingUser || resetPassword) && (
                            <>
                                <div className={styles.formGroup}>
                                    <label>{t('iam.password')} <span className={styles.required}>*</span></label>
                                    <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required={!existingUser || resetPassword} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('iam.confirmPassword')} <span className={styles.required}>*</span></label>
                                    <input type="password" value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })} required={!existingUser || resetPassword} />
                                </div>
                            </>
                        )}
                        
                        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                            <label>{t('iam.auditReason') || 'Change Reason (Audit)'} <span className={styles.required}>*</span></label>
                            <textarea
                                value={form.reason}
                                onChange={e => setForm({ ...form, reason: e.target.value })}
                                placeholder="Provide a reason for this change..."
                                rows={2}
                                required
                            />
                        </div>
                    </div>

                    <div className={styles.formActions}>
                        <button type="button" className={styles.cancelButton} onClick={handleClose} disabled={loading}>{t('common.cancel')}</button>
                        <button type="submit" className={styles.submitButton} disabled={loading}>
                            {loading ? (t('common.saving') || 'Saving...') : (existingUser ? t('common.save') : t('common.add'))}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UserModal;
