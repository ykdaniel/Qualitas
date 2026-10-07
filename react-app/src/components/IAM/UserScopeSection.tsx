import { useLeaveGuard } from '../Shared/LeaveGuard';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
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
    // Loaded independently (Promise.allSettled, not Promise.all) so that one endpoint failing —
    // most commonly getContractors() for an account with iam:user:manage but NOT
    // contractors:view:all — no longer takes down projects and the user's EXISTING scope with it.
    // Before this fix, a single Promise.all meant a contractor-list 403 left `projects` and
    // `selected`/`vendorId` at their initial EMPTY state (never populated from getUserScope), so
    // an admin who only meant to toggle a project checkbox and Save would silently submit
    // `vendor_id: null`, wiping out the user's real contractor assignment. Reproduced live before
    // this fix; see the isolated-stack review script for the exact before/after values.
    const [projectsError, setProjectsError] = useState(false);
    const [contractorsError, setContractorsError] = useState(false);
    // Only meaningful in edit mode — the user's CURRENT scope failed to load, so `selected`/
    // `vendorId` do not reflect reality. Saving is disabled while this is true, and also
    // (see scopeLoaded below) until the first successful load completes at all: PUT
    // /iam/users/{id}/scope always replaces both project_ids and vendor_id (confirmed by reading
    // routers/iam.py::set_user_scope and schemas.UserScope — both fields required, no
    // partial/merge semantics), so this component has no way to send a safe partial update; the
    // approach taken here is to block Save until this component's own copy of the scope is known
    // good, not a claim that no other path could ever submit a request.
    const [scopeError, setScopeError] = useState(false);
    // True only after getUserScope has actually returned successfully for THIS userId (edit mode)
    // — checked by both the Save button's `disabled` and handleSave itself, independent of
    // `loading`/`scopeError`, so the very first load (before either of those could reflect a
    // failure) also blocks Save until it completes. Not edit mode has nothing to load, so it's
    // true immediately.
    const [scopeLoaded, setScopeLoaded] = useState(!isEdit);
    const aliveRef = React.useRef(true);
    const scopeKey = JSON.stringify({ project_ids: [...selected].sort(), vendor_id: vendorId || null });
    const [baseline, setBaseline] = useState<string | null>(null);
    useLeaveGuard(isEdit && scopeLoaded && baseline !== null && scopeKey !== baseline, saving);

    // Initial (mount-time) load only — fetches all three sources together, which is safe here
    // because no local edit can exist yet (the form has not rendered). Retrying a SINGLE failed
    // source after that uses one of the three functions below instead of this one, specifically
    // so that re-fetching (say) the contractor list can never overwrite `selected`/`vendorId`
    // with a fresh (and now possibly stale, relative to an in-progress edit) copy of the server's
    // scope — see retryScope's own comment for why re-running the scope fetch is still safe.
    const load = React.useCallback(async () => {
        setLoading(true);
        setProjectsError(false);
        setContractorsError(false);
        setScopeError(false);
        const [projRes, ctrRes, scopeRes] = await Promise.allSettled([
            getProjects(),
            getContractors(),
            isEdit ? getUserScope(userId!) : Promise.resolve(null),
        ]);
        if (!aliveRef.current) return;
        // Persistent inline banners (below, with their own Retry buttons) carry these errors —
        // no toast here too, so each failure is reported in exactly one place.
        if (projRes.status === 'fulfilled') {
            setProjects(projRes.value);
        } else {
            setProjectsError(true);
        }
        if (ctrRes.status === 'fulfilled') {
            setContractors(ctrRes.value);
        } else {
            setContractorsError(true);
        }
        if (isEdit) {
            if (scopeRes.status === 'fulfilled' && scopeRes.value) {
                setSelected(new Set(scopeRes.value.project_ids));
                setVendorId(scopeRes.value.vendor_id || '');
                setBaseline(JSON.stringify({ project_ids: [...scopeRes.value.project_ids].sort(), vendor_id: scopeRes.value.vendor_id || null }));
                setScopeLoaded(true);
            } else {
                setScopeError(true);
            }
        }
        setLoading(false);
    }, [userId, isEdit]);

    // Per-source retries — each re-fetches ONLY its own endpoint. Retrying the project list or
    // the contractor list must never re-fetch (and so never overwrite) `selected`/`vendorId`,
    // since the admin may already have made an unsaved edit to them since the initial load.
    const retryProjects = React.useCallback(async () => {
        setProjectsError(false);
        try {
            const projs = await getProjects();
            if (!aliveRef.current) return;
            setProjects(projs);
        } catch {
            if (aliveRef.current) setProjectsError(true);
        }
    }, []);
    const retryContractors = React.useCallback(async () => {
        setContractorsError(false);
        try {
            const ctrs = await getContractors();
            if (!aliveRef.current) return;
            setContractors(ctrs);
        } catch {
            if (aliveRef.current) setContractorsError(true);
        }
    }, []);
    // Scope controls stay disabled until the authoritative scope has loaded.
    const retryScope = React.useCallback(async () => {
        if (!isEdit) return;
        setScopeError(false);
        try {
            const scope = await getUserScope(userId!);
            if (!aliveRef.current) return;
            setSelected(new Set(scope.project_ids));
            setVendorId(scope.vendor_id || '');
                setBaseline(JSON.stringify({ project_ids: [...scope.project_ids].sort(), vendor_id: scope.vendor_id || null }));
            setScopeLoaded(true);
        } catch {
            if (aliveRef.current) setScopeError(true);
        }
    }, [userId, isEdit]);

    useEffect(() => {
        aliveRef.current = true;
        load();
        return () => { aliveRef.current = false; };
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
        // Requires the CURRENT user's scope to have actually finished loading successfully —
        // checked here independently of the button's own `disabled`, and independently of
        // `loading` (which currently also hides the button entirely while true, but this check
        // does not rely on that to hold).
        if (scopeError || !scopeLoaded) return;
        setSaving(true);
        try {
            await setUserScope(userId, {
                project_ids: Array.from(selected),
                vendor_id: vendorId || null,
            });
            setBaseline(scopeKey);
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
        errorBanner: {
            fontSize: 12, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 6, padding: '8px 10px', marginBottom: 10, display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', gap: 10,
        },
        retryBtn: {
            fontSize: 12, fontWeight: 600, color: '#991b1b', background: '#fff', border: '1px solid #fecaca',
            borderRadius: 6, padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' as const,
        },
    };

    if (loading) return <div style={s.wrap}><span style={s.empty}>{t('common.loading') || 'Loading...'}</span></div>;

    // The current vendor_id may point at a contractor this account can't (or momentarily
    // couldn't) resolve a name for — inject it as a visible option instead of letting the
    // <select> silently show nothing selected while the real value is still held in state.
    const vendorOptionKnown = !vendorId || contractors.some(c => c.id === vendorId);

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

            {scopeError && (
                <div style={s.errorBanner}>
                    <span>{t('iam.scope.existingScopeLoadFailed') || "Failed to load this user's current data scope. Saving is disabled to avoid overwriting it with incomplete data."}</span>
                    <button className={actionStyles.secondary} type="button" onClick={retryScope}>{t('iam.scope.retry') || 'Retry'}</button>
                </div>
            )}

            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{t('iam.scope.projects') || 'Projects'}</label>
            {projectsError && (
                <div style={s.errorBanner}>
                    <span>{t('iam.scope.projectsLoadFailed') || 'Failed to load the project list.'}</span>
                    <button className={actionStyles.secondary} type="button" onClick={retryProjects}>{t('iam.scope.retry') || 'Retry'}</button>
                </div>
            )}
            <div style={s.grid}>
                {projects.length === 0 && !projectsError && <span style={s.empty}>{t('iam.scope.noProjects') || 'No projects'}</span>}
                {projects.map(p => (
                    <label key={p.id} style={s.chk}>
                        <input type="checkbox" disabled={saving || !scopeLoaded || scopeError} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                        {p.name}
                    </label>
                ))}
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{t('iam.scope.contractor') || 'Contractor (optional)'}</label>
            {contractorsError && (
                <div style={s.errorBanner}>
                    <span>{t('iam.scope.contractorsLoadFailed') || 'Failed to load the contractor list — the current contractor assignment is kept, but cannot be changed until this is retried.'}</span>
                    <button className={actionStyles.secondary} type="button" onClick={retryContractors}>{t('iam.scope.retry') || 'Retry'}</button>
                </div>
            )}
            <div style={s.row}>
                <select style={s.select} value={vendorId} onChange={e => changeVendor(e.target.value)} disabled={contractorsError || saving || !scopeLoaded || scopeError}>
                    <option value="">{t('iam.scope.anyContractor') || '— Any / none —'}</option>
                    {!vendorOptionKnown && <option value={vendorId}>{vendorId} (name unavailable)</option>}
                    {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>
            {isEdit && (
                <FormActions primary={
                    <button className={actionStyles.primary} type="button" onClick={handleSave} disabled={saving || scopeError || !scopeLoaded}>
                        {saving ? (t('common.saving') || 'Saving...') : (t('iam.scope.save') || 'Save scope')}
                    </button>
                } />
            )}
        </div>
    );
};

export default UserScopeSection;
