import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Role } from '../../store/iamStore';
import styles from './RoleModal.module.css';

const roleSchema = z.object({
    name: z.string().min(2, "Role name must be at least 2 characters"),
    description: z.string().min(5, "Description is required"),
    permissions: z.array(z.string()).min(1, "At least one permission must be selected"),
    reason: z.string().min(5, "Audit reason is required (min 5 characters)"),
});

interface RoleModalProps {
    existingRole: Role | null;
    permissions: { code: string; description: string }[];
    onSave: (validationData: any, isUpdate: boolean, id?: number) => Promise<void>;
    onClose: () => void;
    t: (key: string) => string;
    loading: boolean;
}

const RoleModal: React.FC<RoleModalProps> = ({ existingRole, permissions, onSave, onClose, t, loading }) => {
    const [isClosing, setIsClosing] = useState(false);

    const initialForm = useMemo(() => ({
        name: existingRole?.name || '',
        description: existingRole?.description || '',
        permissions: existingRole ? [...existingRole.permissions] : ([] as string[]),
        reason: ''
    }), [existingRole]);

    const [form, setForm] = useState(initialForm);

    const groupedPermissions = useMemo(() => {
        return permissions.reduce((acc, perm) => {
            const moduleName = (perm.code.split(':')[0] || 'OTHER').toUpperCase();
            if (!acc[moduleName]) acc[moduleName] = [];
            acc[moduleName].push(perm);
            return acc;
        }, {} as Record<string, typeof permissions>);
    }, [permissions]);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => onClose(), 250);
    };

    const togglePermission = (code: string) => {
        setForm(prev => ({
            ...prev,
            permissions: prev.permissions.includes(code)
                ? prev.permissions.filter(p => p !== code)
                : [...prev.permissions, code]
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            roleSchema.parse(form);
            await onSave(form, !!existingRole, existingRole ? parseInt(existingRole.id) : undefined);
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
                    <h2>{existingRole ? t('iam.editRole') : t('iam.addRole')}</h2>
                    <button type="button" className={styles.closeIconBtn} onClick={handleClose}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className={styles.modalForm}>
                    <div className={styles.formGroup}>
                        <label>{t('iam.roleName')} <span className={styles.required}>*</span></label>
                        <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                    </div>
                    
                    <div className={styles.formGroup}>
                        <label>{t('iam.description')} <span className={styles.required}>*</span></label>
                        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} required />
                    </div>

                    <div className={styles.formGroup}>
                        <label>{t('iam.permissionsLabel')} <span className={styles.required}>*</span></label>
                        <div className={styles.permissionsGroupContainer}>
                            {Object.entries(groupedPermissions).map(([moduleName, modulePerms]) => (
                                <div key={moduleName} className={styles.permissionSection}>
                                    <div className={styles.permissionSectionHeader}>
                                        <div className={styles.moduleBadge}>{moduleName} MODULE</div>
                                        <span className={styles.moduleCount}>
                                            {modulePerms.filter(p => form.permissions.includes(p.code)).length} / {modulePerms.length}
                                        </span>
                                    </div>
                                    <div className={styles.permissionsSectionGrid}>
                                        {modulePerms.map(p => (
                                            <label key={p.code} className={`${styles.permissionCheckbox} ${form.permissions.includes(p.code) ? styles.selected : ''}`}>
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
                        <label>{t('iam.auditReason') || 'Change Reason (Audit)'} <span className={styles.required}>*</span></label>
                        <textarea
                            value={form.reason}
                            onChange={e => setForm({ ...form, reason: e.target.value })}
                            placeholder="Reason for this change..."
                            rows={2}
                            required
                        />
                    </div>
                    
                    <div className={styles.formActions}>
                        <button type="button" className={styles.cancelButton} onClick={handleClose} disabled={loading}>{t('common.cancel')}</button>
                        <button type="submit" className={styles.submitButton} disabled={loading}>
                            {loading ? (t('common.saving') || 'Saving...') : (existingRole ? t('common.save') : t('common.add'))}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RoleModal;
