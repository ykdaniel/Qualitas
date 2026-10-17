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
import { showRefusal } from '../../store/refusalStore';
import { describeSaveError } from '../../utils/saveErrors';
import { isAxiosError } from '../../utils/errorUtils';

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

    // Company: suggested from the same company list the Contractors module manages (our own
    // company and the owner included), or typed when it isn't on the list yet. Stored as a plain
    // string (never vendor_id), so it never touches P0 scope. Required for a new account; an
    // existing one may not be blanked, but an account that predates the rule can still be saved
    // without one (deactivate, password reset) — IAM-USER-COMPANY-LABEL-2026-001.
    const { getActiveContractors } = useContractorsStore();
    const companyOptions = useMemo(() => getActiveContractors().map(c => ({ name: c.name, abbreviation: c.abbreviation })),
        [getActiveContractors]);
    const companyMissing = !!existingUser && !existingUser.company_name;
    const companyRequired = !companyMissing;

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

            const company = form.company_name.trim();
            if (companyRequired && !company) throw new Error(t('iam.companyRequired') || 'Company is required.');
            // Every account except a system administrator works in a project (REF-PROJECT-SEQ-2026-001 B1, D8); the
            // server refuses it too. An existing account's projects are saved by the scope section's own button.
            const isAdminRole = (selectedRole?.name || '').toLowerCase() === 'admin';   // the one system administrator role, as the server decides it
            if (!existingUser && !isAdminRole && pendingScope.project_ids.length === 0) throw new Error(t('iam.projectRequired'));

            const validationData = {
                name: form.name,
                email: form.email,
                role_id: roleId,
                status: form.status,
                company_name: company || null,
                password: (existingUser && !(resetPassword && canSetPassword)) ? undefined : (form.password || undefined),
                reason: form.reason,
                // saved with the new account itself (the contractor binding, if any, follows below)
                project_ids: existingUser ? undefined : pendingScope.project_ids,
            };

            userSchema.parse(validationData);

            if (form.password && form.password !== form.confirmPassword) {
                throw new Error(t('iam.passwordMismatch') || "Passwords don't match");
            }

            const savedId = await onSave(validationData, !!existingUser, existingUser ? parseInt(existingUser.id) : undefined);

            // Create flow: the projects were saved with the account; a contractor binding is saved now that it exists.
            if (!existingUser && !!pendingScope.vendor_id && typeof savedId === 'number') {
                try {
                    await setUserScope(savedId, pendingScope);
                } catch (scopeErr: any) {
                    // the account IS created: not a refusal of this save, a part left undone — said as such, with the reason in words
                    toast.error(t('iam.scope.createdButScopeFailed'), { description: describeSaveError(scopeErr, t), duration: 10000 });
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
                // A refused or failed request: the refusal dialog (e.g. DUPLICATE_NAME for the e-mail, in the user's language;
                // REFUSAL-DIALOG-2026-003). A check of this form itself (role, company, project, password match) stays a toast.
                if (isAxiosError(err)) showRefusal(err, 'save', { keepsInput: true });
                else toast.error(getErrorMessage(err, "An error occurred"));
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
                            <label>{t('iam.companyName')} {companyRequired && <span className={styles.required}>*</span>}</label>
                            <input
                                type="text"
                                list="iam-company-options"
                                value={form.company_name}
                                onChange={e => setForm({ ...form, company_name: e.target.value })}
                                required={companyRequired}
                            />
                            <datalist id="iam-company-options">
                                {companyOptions.map(c => (
                                    <option key={c.name} value={c.name}>{c.abbreviation}</option>
                                ))}
                            </datalist>
                            {companyMissing && !existingUser?.display_company && !readOnly ? (
                                <p role="note" style={{ margin: '6px 0 0', padding: '6px 10px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6, fontSize: 12 }}>
                                    {t('iam.companyMissing')}
                                </p>
                            ) : (
                                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>{t('iam.companyHint')}</p>
                            )}
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
