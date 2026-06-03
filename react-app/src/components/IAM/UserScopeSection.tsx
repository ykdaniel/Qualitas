import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
    getProjects, getContractors, getUserScope, setUserScope,
    type ProjectApi, type Contractor,
} from '../../services/api';

export interface ScopeValue {
    project_ids: string[];
    vendor_id: string | null;
}

interface UserScopeSectionProps {
    t: (key: string) => string;
    /** Edit mode: an existing user id. Self-contained load + save. */
    userId?: number;
    /** Create mode (no userId): controlled value reported up via onChange;
     *  the parent persists the scope after the user is created. */
    value?: ScopeValue;
    onChange?: (value: ScopeValue) => void;
}

/**
 * P0 data isolation — assign a user's project / contractor scope.
 * - Edit mode (`userId` set): loads and saves via the scope API independently
 *   of the surrounding form, with its own Save button.
 * - Create mode (`value`/`onChange`): controlled, no API calls; the parent
 *   stores the selection and saves it once the new user exists.
 * Empty projects + no contractor ⇒ full access.
 */
const UserScopeSection: React.FC<UserScopeSectionProps> = ({ userId, t, value, onChange }) => {
    const isEdit = userId != null;
    const [projects, setProjects] = useState<ProjectApi[]>([]);
    const [contractors, setContractors] = useState<Contractor[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set(value?.project_ids));
    const [vendorId, setVendorId] = useState<string>(value?.vendor_id || '');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [projs, ctrs] = await Promise.all([getProjects(), getContractors()]);
                if (!alive) return;
                setProjects(projs);
                setContractors(ctrs);
                if (isEdit) {
                    const scope = await getUserScope(userId!);
                    if (!alive) return;
                    setSelected(new Set(scope.project_ids));
                    setVendorId(scope.vendor_id || '');
                }
            } catch {
                if (alive) toast.error(t('iam.scope.loadFailed') || 'Failed to load scope');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            if (!isEdit) onChange?.({ project_ids: Array.from(next), vendor_id: vendorId || null });
            return next;
        });
    };

    const changeVendor = (v: string) => {
        setVendorId(v);
        if (!isEdit) onChange?.({ project_ids: Array.from(selected), vendor_id: v || null });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await setUserScope(userId, {
                project_ids: Array.from(selected),
                vendor_id: vendorId || null,
            });
            toast.success(t('iam.scope.saved') || 'Data scope saved');
        } catch (err: any) {
            toast.error(err?.response?.data?.detail || t('iam.scope.saveFailed') || 'Failed to save scope');
        } finally {
            setSaving(false);
        }
    };

    const unrestricted = selected.size === 0 && !vendorId;

    const s: Record<string, React.CSSProperties> = {
        wrap: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, background: '#fafaf8' },
        title: { fontSize: 14, fontWeight: 700, color: '#4a4238', margin: '0 0 4px' },
        hint: { fontSize: 12, color: '#6b7280', margin: '0 0 12px' },
        badge: {
            display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '2px 8px',
            borderRadius: 12, marginLeft: 8,
            background: unrestricted ? '#fef3c7' : '#dcfce7',
            color: unrestricted ? '#92400e' : '#166534',
        },
        grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6, marginBottom: 12 },
        chk: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151' },
        row: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
        select: { flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db' },
        save: {
            padding: '8px 16px', background: '#4a4238', color: '#faf7f1', border: 'none',
            borderRadius: 6, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
        },
        empty: { fontSize: 13, color: '#9ca3af' },
    };

    if (loading) return <div style={s.wrap}><span style={s.empty}>{t('common.loading') || 'Loading...'}</span></div>;

    return (
        <div style={s.wrap}>
            <div style={s.title}>
                {t('iam.scope.title') || 'Data Scope'}
                <span style={s.badge}>
                    {unrestricted ? (t('iam.scope.fullAccess') || 'Full access') : (t('iam.scope.restricted') || 'Restricted')}
                </span>
            </div>
            <p style={s.hint}>
                {t('iam.scope.hint') || 'Leave projects empty for full access (internal staff). Pick projects to limit an owner; also pick a contractor to limit a contractor login to its own records.'}
            </p>

            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{t('iam.scope.projects') || 'Projects'}</label>
            <div style={s.grid}>
                {projects.length === 0 && <span style={s.empty}>{t('iam.scope.noProjects') || 'No projects'}</span>}
                {projects.map(p => (
                    <label key={p.id} style={s.chk}>
                        <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                        {p.name}
                    </label>
                ))}
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{t('iam.scope.contractor') || 'Contractor (optional)'}</label>
            <div style={s.row}>
                <select style={s.select} value={vendorId} onChange={e => changeVendor(e.target.value)}>
                    <option value="">{t('iam.scope.anyContractor') || '— Any / none —'}</option>
                    {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {isEdit && (
                    <button type="button" style={s.save} onClick={handleSave} disabled={saving}>
                        {saving ? (t('common.saving') || 'Saving...') : (t('iam.scope.save') || 'Save scope')}
                    </button>
                )}
            </div>
        </div>
    );
};

export default UserScopeSection;
