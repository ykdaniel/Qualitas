import React, { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
    createContractorPersonnel, getContractorPersonnel, updateContractorPersonnel, type ContractorPersonnelApi,
} from '../../services/api';
import { showRefusal } from '../../store/refusalStore';

type Draft = { name: string; position: string; email: string; phone: string };

interface Props {
    contractorId: string;
}

const EMPTY: Draft = { name: '', position: '', email: '', phone: '' };
const cell: React.CSSProperties = { border: '1px solid #e2e8f0', padding: '4px 6px', fontSize: 13, verticalAlign: 'middle' };
const input: React.CSSProperties = { width: '100%', padding: '4px 6px', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 4 };
const iconBtn: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: '#64748b', lineHeight: 0 };
const textBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 2, border: '1px solid #d6c9ad', background: '#fff', color: '#7a5c1e', borderRadius: 4, padding: '2px 8px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' };

/**
 * A company's people (CONTRACTOR-PERSONNEL-2026-001, user 2026-10-11: "contractor 有人員 但不一定能進系統"): not system
 * accounts — the meeting attendee picker offers them. Saved at once (not with the contractor form's Save). There is no
 * delete: someone who left is set inactive, so meetings that list them keep reading the same.
 */
const ContractorPersonnel: React.FC<Props> = ({ contractorId }) => {
    const { t } = useLanguage();
    const { hasPermission } = useAuth();
    const canManage = hasPermission('contractors:manage:all');
    const [people, setPeople] = useState<ContractorPersonnelApi[]>([]);
    const [showInactive, setShowInactive] = useState(false);
    const [loading, setLoading] = useState(true);
    const [draft, setDraft] = useState<Draft>(EMPTY);
    // the row being edited, with the version it was read at (OPTIMISTIC-LOCK-2026-001 B3b)
    const [editing, setEditing] = useState<{ id: string; row_version?: number | null } & Draft | null>(null);
    const [busy, setBusy] = useState(false);

    /** Resolves to the list it loaded, or null when the load failed. */
    const load = useCallback(async (): Promise<ContractorPersonnelApi[] | null> => {
        try {
            const list = await getContractorPersonnel(contractorId, true);
            setPeople(list);
            return list;
        } catch (err) {
            console.error('Loading the personnel list failed:', err);
            toast.error(t('contractors.personnel.loadFailed'));
            return null;
        } finally {
            setLoading(false);
        }
    }, [contractorId, t]);

    const startEditing = (p: ContractorPersonnelApi) =>
        setEditing({ id: p.id, row_version: p.row_version, name: p.name, position: p.position || '', email: p.email || '', phone: p.phone || '' });
    // "Reload this record" after a 409 VERSION_CONFLICT: reload the list; an edited row starts again from what is saved now
    // (the dialog has already confirmed that its changes are discarded).
    const reloadAfterConflict = async (editedId?: string) => {
        const list = await load();
        if (!editedId) return;
        const fresh = list?.find(p => p.id === editedId);
        // only if that row is still the one being edited (the user may have started on another meanwhile), and only if it is
        // still shown — a person made inactive meanwhile would be edited in a hidden row (B3b review R1 P3-3, P3-4)
        setEditing(prev => {
            if (prev?.id !== editedId) return prev;
            if (!fresh || (!fresh.is_active && !showInactive)) return null;
            return { id: fresh.id, row_version: fresh.row_version, name: fresh.name, position: fresh.position || '', email: fresh.email || '', phone: fresh.phone || '' };
        });
    };
    useEffect(() => { void load(); }, [load]);

    const run = async (action: () => Promise<unknown>, done: string, reload?: { editedId?: string }) => {
        if (busy) return false;
        setBusy(true);
        try {
            await action();
            toast.success(done);
            await load();
            return true;
        } catch (err) {
            console.error('Saving the personnel list failed:', err);
            // e.g. DUPLICATE_NAME, in the user's language (REFUSAL-DIALOG-2026-003); a version conflict offers the reload — a row
            // being edited asks first (its changes are discarded), a list action reloads at once
            showRefusal(err, 'save', reload ? {
                onReload: () => { void reloadAfterConflict(reload.editedId); },
                reloadDiscardsInput: !!reload.editedId,
            } : undefined);
            return false;
        } finally {
            setBusy(false);
        }
    };
    const handleAdd = async () => {
        if (!draft.name.trim()) {
            toast.error(t('contractors.personnel.nameRequired'));
            return;
        }
        if (await run(() => createContractorPersonnel(contractorId, draft), t('contractors.personnel.added'))) setDraft(EMPTY);
    };
    const handleApply = async () => {
        if (!editing) return;
        if (!editing.name.trim()) {
            toast.error(t('contractors.personnel.nameRequired'));
            return;
        }
        const { id, row_version: rowVersion, ...data } = editing;
        if (await run(() => updateContractorPersonnel(id, data, rowVersion), t('contractors.personnel.saved'), { editedId: id })) setEditing(null);
    };
    const setActive = (p: ContractorPersonnelApi, active: boolean) =>
        run(() => updateContractorPersonnel(p.id, { is_active: active }, p.row_version),     // the row's version as listed
            active ? t('contractors.personnel.reactivated') : t('contractors.personnel.deactivated'), {});
    const escCancel = (ev: React.KeyboardEvent) => {
        if (ev.key === 'Escape' && !ev.nativeEvent.isComposing) {
            ev.preventDefault();
            ev.stopPropagation();
            setEditing(null);
        }
    };

    const shown = people.filter(p => showInactive || p.is_active);
    const inactiveCount = people.filter(p => !p.is_active).length;
    const field = (value: string, onValue: (v: string) => void, label: string, type = 'text') => (
        // inside the contractor form: Enter here must not submit that form
        <input style={input} type={type} value={value} aria-label={label} placeholder={label} onChange={e => onValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} />
    );

    return (
        <section data-personnel style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>{t('contractors.personnel.title')}</h3>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#475569' }}>
                    <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                    {t('contractors.personnel.showInactive')}{inactiveCount ? ` (${inactiveCount})` : ''}
                </label>
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 12, color: '#64748b' }}>{t('contractors.personnel.hint')}</p>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            <th style={{ ...cell, width: '28%' }}>{t('contractors.personnel.name')}</th>
                            <th style={cell}>{t('contractors.personnel.position')}</th>
                            <th style={cell}>{t('contractors.email')}</th>
                            <th style={cell}>{t('contractors.phone')}</th>
                            <th style={{ ...cell, width: 56 }}>{t('contractors.personnel.active')}</th>
                            {canManage && <th style={{ ...cell, width: 130 }} />}
                        </tr>
                    </thead>
                    <tbody>
                        {!loading && shown.length === 0 && (
                            <tr><td style={{ ...cell, color: '#94a3b8' }} colSpan={canManage ? 6 : 5}>{t('contractors.personnel.empty')}</td></tr>
                        )}
                        {shown.map(p => editing?.id === p.id ? (
                            <tr key={p.id} data-person={p.name} data-editing onKeyDown={escCancel}>
                                <td style={cell}>{field(editing.name, v => setEditing({ ...editing, name: v }), t('contractors.personnel.name'))}</td>
                                <td style={cell}>{field(editing.position, v => setEditing({ ...editing, position: v }), t('contractors.personnel.position'))}</td>
                                <td style={cell}>{field(editing.email, v => setEditing({ ...editing, email: v }), t('contractors.email'), 'email')}</td>
                                <td style={cell}>{field(editing.phone, v => setEditing({ ...editing, phone: v }), t('contractors.phone'), 'tel')}</td>
                                <td style={cell}>{p.is_active ? t('contractors.personnel.yes') : t('contractors.personnel.no')}</td>
                                <td style={cell}>
                                    <button type="button" style={iconBtn} aria-label={t('meetingMinutes.applyRow')} title={t('meetingMinutes.applyRow')} onClick={handleApply} disabled={busy}><Check size={16} /></button>
                                    <button type="button" style={iconBtn} aria-label={t('meetingMinutes.cancelRow')} title={t('meetingMinutes.cancelRow')} onClick={() => setEditing(null)}><X size={16} /></button>
                                </td>
                            </tr>
                        ) : (
                            <tr key={p.id} data-person={p.name} style={p.is_active ? undefined : { color: '#94a3b8' }}>
                                <td style={cell}>{p.name}</td>
                                <td style={cell}>{p.position || '-'}</td>
                                <td style={cell}>{p.email || '-'}</td>
                                <td style={cell}>{p.phone || '-'}</td>
                                <td style={cell}>{p.is_active ? t('contractors.personnel.yes') : t('contractors.personnel.no')}</td>
                                {canManage && (
                                    <td style={cell}>
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                            <button type="button" style={iconBtn} aria-label={t('contractors.personnel.edit')} title={t('contractors.personnel.edit')} disabled={!!editing}
                                                onClick={() => startEditing(p)}><Pencil size={14} /></button>
                                            <button type="button" style={textBtn} disabled={busy} onClick={() => setActive(p, !p.is_active)}>
                                                {p.is_active ? t('contractors.personnel.deactivate') : t('contractors.personnel.reactivate')}
                                            </button>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                        {canManage && (
                            <tr data-person-new>
                                <td style={cell}>{field(draft.name, v => setDraft({ ...draft, name: v }), t('contractors.personnel.name'))}</td>
                                <td style={cell}>{field(draft.position, v => setDraft({ ...draft, position: v }), t('contractors.personnel.position'))}</td>
                                <td style={cell}>{field(draft.email, v => setDraft({ ...draft, email: v }), t('contractors.email'), 'email')}</td>
                                <td style={cell}>{field(draft.phone, v => setDraft({ ...draft, phone: v }), t('contractors.phone'), 'tel')}</td>
                                <td style={cell} />
                                <td style={cell}>
                                    <button type="button" style={textBtn} onClick={handleAdd} disabled={busy}><Plus size={12} /> {t('contractors.personnel.add')}</button>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

export default ContractorPersonnel;
