import { useDraftGuard } from '../Shared/LeaveGuard';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Role, User } from '../../store/iamStore';
import { useContractorsStore } from '../../store/contractorsStore';
import UserScopeSection, { type ScopeValue } from './UserScopeSection';
import { setUserScope } from '../../services/api';
import { getErrorMessage } from '../../utils/errorUtils';
import styles from './UserModal.module.css';

const userSchema = z.object({
    name: z.string().min(3, "Username must be at least 3 characters"),
    email: z.string().email("Invalid email address"),
    role_id: z.number().int().positive("Invalid role").optional(),   // optional: an account may be created with no role
    status: z.enum(['active', 'inactive']),
    password: z.string().min(8, "Password must be at least 8 characters").optional(),
    reason: z.string().min(5, "Audit reason is required (min 5 characters)"),
});

interface UserModalProps {
    existingUser: User | null;
    readOnly?: boolean;
    /** Holds iam:role:manage — the only way to name a role (the API refuses it otherwise). */
    canManageRoles?: boolean;
    /** Is an Admin — the only actor the API lets set a password through IAM. */
    canSetPassword?: boolean;
    /** Target is an Admin account and the viewer is not an Admin: shown read-only. */
    adminAccountLocked?: boolean;
    roles: Role[];
    onSave: (validationData: any, isUpdate: boolean, id?: number) => Promise<number | void>;
    onClose: () => void;
    t: (key: string) => string;
    loading: boolean;
}

const UserModal: React.FC<UserModalProps> = ({ existingUser, readOnly = false, canManageRoles = false, canSetPassword = false, adminAccountLocked = false, roles, onSave, onClose, t, loading }) => {
    const [isClosing, setIsClosing] = useState(false);
    const [resetPassword, setResetPassword] = useState(false);
    // Create mode only: scope chosen before the user exists, persisted post-create.
    const [pendingScope, setPendingScope] = useState<ScopeValue>({ project_ids: [], vendor_id: null });

    // Company picker reuses the same Contractors list the Contractors
    // module manages — company_name is still stored as a plain string
    // (never vendor_id), so picking a name here never touches P0 scope.
    // If the existing user's saved company_name isn't in the active list
    // (renamed/deactivated contractor, or a value typed before this
    // became a picker), it's added as an extra option so it doesn't
    // silently vanish from the field.
    const { getActiveContractors } = useContractorsStore();
    const contractorNames = useMemo(() => {
        const names = getActiveContractors().map(c => c.name);
        if (existingUser?.company_name && !names.includes(existingUser.company_name)) {
            names.push(existingUser.company_name);
        }
        return names;
    }, [getActiveContractors, existingUser]);

    const initialForm = useMemo(() => ({
        name: existingUser?.username || '',
        email: existingUser?.email || '',
        // '' = no role. A roleless existing account has no role_id (the store's 'user' label is not a real role);
        // a new account defaults to the first role only for someone allowed to name a role — never a default grant.
        role: existingUser ? (existingUser.role_id ? existingUser.role : '') : (canManageRoles ? (roles[0]?.name || '') : ''),
        status: (existingUser?.status as 'active' | 'inactive') || ('active' as 'active' | 'inactive'),
        company_name: existingUser?.company_name || '',
        password: '',
        confirmPassword: '',
        reason: ''
    }), [existingUser, roles, canManageRoles]);

    const [form, setForm] = useState(initialForm);

    const leaveGuard = useDraftGuard({ form, pendingScope, resetPassword }, loading, !readOnly && !adminAccountLocked);
    const handleClose = () => leaveGuard.requestClose(() => {
        setIsClosing(true);
        setTimeout(() => onClose(), 250);
    }, true);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const selectedRole = roles.find(r => r.name === form.role);
            if (form.role && !selectedRole) throw new Error("Please select a valid role");

            // No role chosen => role_id is omitted entirely (nothing is granted by default).
            const roleId = selectedRole ? parseInt(selectedRole.id) : (existingUser?.role_id ?? undefined);

            const validationData = {
                name: form.name,
                email: form.email,
                role_id: roleId,
                status: form.status,
                company_name: form.company_name || null,
                password: (existingUser && !(resetPassword && canSetPassword)) ? undefined : (form.password || undefined),
                reason: form.reason
            };

            userSchema.parse(validationData);

            if (form.password && form.password !== form.confirmPassword) {
                throw new Error(t('iam.passwordMismatch') || "Passwords don't match");
            }

            const savedId = await onSave(validationData, !!existingUser, existingUser ? parseInt(existingUser.id) : undefined);

            // Create flow: persist the chosen data scope now that the user exists.
            const hasScope = pendingScope.project_ids.length > 0 || !!pendingScope.vendor_id;
            if (!existingUser && hasScope && typeof savedId === 'number') {
                try {
                    await setUserScope(savedId, pendingScope);
                } catch (scopeErr: any) {
                    toast.error(scopeErr?.response?.data?.detail || t('iam.scope.saveFailed') || 'User created, but failed to save data scope');
                }
            }

            // Scope has its own Save button; saving user fields must not silently discard it.
            leaveGuard.markSaved();
            if (leaveGuard.hasOtherChanges()) {
                leaveGuard.requestClose(() => { setIsClosing(true); setTimeout(onClose, 250); }, true);
            } else {
                leaveGuard.release();
                setIsClosing(true);
                setTimeout(onClose, 250);
            }
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
                // Surface the backend's reason (e.g. "Password must contain both
                // letters and digits", "Email already registered") instead of the
                // generic axios "Request failed with status code 400".
                toast.error(getErrorMessage(err, "An error occurred"));
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
                    <h2>{readOnly ? t('iam.viewUser') : existingUser ? t('iam.editUser') : t('iam.addUser')}</h2>
                    <button type="button" className={styles.closeIconBtn} onClick={handleClose}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className={styles.modalForm}>
                    {adminAccountLocked && (
                        <p role="note" style={{ margin: '0 0 12px', padding: '8px 12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6, fontSize: 13 }}>
                            {t('iam.adminAccountReadOnly')}
                        </p>
                    )}
                    <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }}>
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
                                <select value={form.role} disabled={!canManageRoles} onChange={e => setForm({ ...form, role: e.target.value })}>
                                    {(!existingUser || !existingUser.role_id) && <option value="">{t('iam.noRole')}</option>}
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
                        <div className={styles.formGroup}>
                            <label>{t('iam.companyName')}</label>
                            <div className={styles.selectWrapper}>
                                <select
                                    value={form.company_name}
                                    onChange={e => setForm({ ...form, company_name: e.target.value })}
                                >
                                    <option value="">{t('common.selectPlaceholder') || 'Select...'}</option>
                                    {contractorNames.map(name => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                                <div className={styles.selectArrow}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </div>
                            </div>
                        </div>

                        {!existingUser && !canManageRoles && (
                            <p className={`${styles.formGroup} ${styles.fullWidth}`} style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{t('iam.noRoleHint')}</p>
                        )}

                        {existingUser && canSetPassword && (
                            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                <label className={styles.checkboxLabel}>
                                    <input type="checkbox" checked={resetPassword} onChange={e => setResetPassword(e.target.checked)} />
                                    {t('iam.resetPassword') || 'Reset Password'}
                                </label>
                            </div>
                        )}
                        {existingUser && !canSetPassword && !adminAccountLocked && (
                            <p className={`${styles.formGroup} ${styles.fullWidth}`} style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{t('iam.passwordAdminOnly')}</p>
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

                        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                            {existingUser ? (
                                <UserScopeSection userId={parseInt(existingUser.id)} t={t} />
                            ) : (
                                <UserScopeSection t={t} value={pendingScope} onChange={setPendingScope} />
                            )}
                        </div>
                    </div>
                    </fieldset>

                    <FormActions
                        cancel={<>
                            <button className={actionStyles.secondary} type="button" onClick={handleClose} disabled={loading}>{t('common.cancel')}</button>
                        </>}
                        primary={<>
                            {!readOnly && (
                                <button className={actionStyles.primary} type="submit" disabled={loading}>
                                    {loading ? (t('common.saving') || 'Saving...') : (existingUser ? t('common.save') : t('common.add'))}
                                </button>
                            )}
                        </>}
                    />
                </form>
            </div>
        </div>
    );
};

export default UserModal;
