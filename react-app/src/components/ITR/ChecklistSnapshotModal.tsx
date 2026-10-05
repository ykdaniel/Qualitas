import { useDraftGuard } from '../Shared/LeaveGuard';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import React, { useRef, useState } from 'react';
import styles from './ITR.module.css'; // Corrected import

import { useLanguage } from '../../context/LanguageContext';
import { CheckCircle, XCircle, HelpCircle, AlertCircle, Lock } from 'lucide-react';
import { ResultSelect } from '../Checklist/ChecklistResultControls';
import {
    deriveChecklistStatus, summarizeItems, itemsMissingNaReason, isLegacyNaWithoutReason,
    withResult, itemsForSave, hasApprovalLimitingNa, isNaPending, failuresSoFar,
} from '../../utils/checklistResult';

interface ChecklistSnapshotModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** May be async: the panel only closes once it resolves. A rejection keeps
     *  the panel open with every entry intact (the parent shows/rethrows the error). */
    onSave: (updatedSnapshot: any) => void | Promise<void>;
    initialData: any;
    readOnly?: boolean;
    /** Why readOnly is set — the parent ITR's persisted status. Drives which
     *  lock message is shown (Approved points to the revoke-approval flow;
     *  Void is terminal and must not suggest one). */
    lockReason?: 'Approved' | 'Void';
    /** The Checklist's OWN stored status (not the derived one). Pass/Fail =
     *  closed: results, observations and N/A reasons are protected by the
     *  backend (Reopen required), so the panel is read-only and offers the
     *  Reopen entry instead of letting the user edit and then be refused. */
    checklistStatus?: string;
    /** Holds checklist:close:all — the only permission that may Reopen. */
    canReopen?: boolean;
    /** Performs ONLY the Reopen status change and reloads backend state.
     *  Resolves { reloaded:false } when it succeeded but the reload failed;
     *  rejects when the reopen itself failed. */
    onReopen?: () => Promise<{ reloaded: boolean } | void>;
    /** §17: render inline (as an in-form accordion panel) instead of a centered
     *  popup overlay, so the ITR reads as one continuous record. */
    inline?: boolean;
}

export const ChecklistSnapshotModal: React.FC<ChecklistSnapshotModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialData,
    readOnly = false,
    lockReason,
    checklistStatus,
    canReopen = false,
    onReopen,
    inline = false
}) => {
    const { t } = useLanguage();
    // Local state for the snapshot being edited. A read-only snapshot (ITR Approved/Void) opens
    // straight to Checklist Items — the General Information fields (Reference no./Activity) are
    // already visible in the collapsed row above this panel, so there's nothing new to see there;
    // the Situation/Result data a reviewer actually came here for is one tab away otherwise.
    const [activeTab, setActiveTab] = useState<'general' | 'items'>(readOnly ? 'items' : 'general');
    const [formData, setFormData] = useState<any>(() => {
        if (initialData) {
            // Flatten data.items if available
            return {
                ...initialData,
                items: initialData.data?.items || initialData.items || [],
                // Ensure other flattened fields are available if needed
                ...initialData.data
            };
        }
        return {};
    });

    // Snapshot of the items as loaded — needed to tell an UNTOUCHED historical
    // N/A (no reason recorded) from an N/A the user just chose.
    const originalItems = useRef<any[]>(JSON.parse(JSON.stringify(formData.items || [])));
    const [saveError, setSaveError] = useState<string | null>(null);
    const [triedSave, setTriedSave] = useState(false);
    const [saving, setSaving] = useState(false);
    const [reopening, setReopening] = useState(false);
    const leaveGuard = useDraftGuard(formData, saving || reopening, isOpen && !readOnly);
    const requestClose = () => leaveGuard.requestClose(onClose);
    const [confirmingReopen, setConfirmingReopen] = useState(false);
    const [reopenError, setReopenError] = useState<string | null>(null);
    const [reopenStale, setReopenStale] = useState(false);

    if (!isOpen) return null;

    // Two independent reasons to be read-only: the parent ITR is Approved/Void
    // (never Reopen-able from here), or the Checklist itself is closed
    // (Pass/Fail) — the second is what the Reopen entry below unlocks.
    const closed = !readOnly && (checklistStatus === 'Pass' || checklistStatus === 'Fail');
    const locked = readOnly || closed;

    const handleReopen = async () => {
        if (reopening || !onReopen) return;       // no double submit
        setReopening(true);
        setReopenError(null);
        try {
            const outcome = await onReopen();
            if (outcome && outcome.reloaded === false) setReopenStale(true);   // reopened, but NOT unlocked until reloaded
        } catch (e: any) {
            const detail = e?.response?.data?.detail;
            setReopenError(t('checklist.reopen.failed', { message: typeof detail === 'string' ? detail : (e?.message || '') }));
        } finally {
            setReopening(false);
            setConfirmingReopen(false);
        }
    };

    const handleFieldChange = (field: string, value: any) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    const items: any[] = formData.items || [];
    const summary = summarizeItems(items);
    const computedStatus = deriveChecklistStatus(items);
    const missingReason = itemsMissingNaReason(items, originalItems.current);

    const setItem = (idx: number, next: any) => {
        const newItems = [...items];
        newItems[idx] = next;
        setFormData({ ...formData, items: newItems });
        setSaveError(null);
    };

    const handleSave = async () => {
        setTriedSave(true);
        if (missingReason.length > 0) {
            setActiveTab('items');
            setSaveError(t('checklist.na.reasonRequired'));
            return;
        }
        // status is always derived from item results (Gap B) — never the
        // free-typed value a stale formData.status might otherwise carry.
        // Items go back exactly as loaded except for the touched ones (see
        // itemsForSave) — legacy '-', missing or unknown values are not converted.
        const payload = {
            ...formData,
            status: computedStatus,
            data: {
                ...(formData.data || {}),
                items: itemsForSave(items)
            }
        };
        setSaving(true);
        try {
            await onSave(payload);
            onClose();
        } catch (e: any) {
            const detail = e?.response?.data?.detail;
            const message = typeof detail === 'string' ? detail : (e?.message || '');
            setSaveError(t('checklist.saveFailedKeep', { message }));
        } finally {
            setSaving(false);
        }
    };

    const panel = (
            <div className={inline
                ? "w-full overflow-hidden flex flex-col rounded-lg bg-white border border-slate-200"
                : `${styles.modalContent} w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl rounded-lg bg-white`}> {/* Increased width and fixed height behavior */}
                <div className="flex justify-between items-center p-4 border-b border-slate-200 shrink-0">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        {t(locked ? 'checklist.viewSnapshot' : 'checklist.editSnapshot')}
                        <span className="text-xs font-normal px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full border border-amber-200">
                            Snapshot
                        </span>
                    </h2>
                    <button onClick={requestClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <XCircle size={24} />
                    </button>
                </div>

                {/* readOnly here is always driven by the ITR's own Approved/Void lock (see
                    ITRModals.tsx) — never loosened from the frontend, this is purely an
                    explanatory label for a lock the backend already enforces independently.
                    Approved → only the revoke-approval flow unlocks it; Void → terminal, no
                    unlock path exists, so no revoke hint.
                    When readOnly, the "this is a read-only snapshot" note and the "locked
                    because..." note are combined into ONE banner instead of two stacked boxes —
                    a user reviewing an already-Approved record is here to read Situation/Result,
                    not to read two paragraphs of why editing is unavailable before getting there. */}
                {readOnly ? (
                    <div className="p-3 bg-amber-50 border-b border-amber-100 text-sm text-amber-800 flex items-center gap-2 shrink-0">
                        <Lock size={16} className="shrink-0" />
                        <span>
                            {t('checklist.snapshotViewNote')}
                            {' — '}
                            {lockReason === 'Void' ? t('checklist.lockedNoteVoid') : t('checklist.lockedNoteApproved')}
                        </span>
                    </div>
                ) : (
                    <div className="p-4 bg-blue-50 border-b border-blue-100 text-sm text-blue-700 flex items-start gap-2 shrink-0">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        {t(locked ? 'checklist.snapshotViewNote' : 'checklist.snapshotEditNote')}
                    </div>
                )}

                {closed && (
                    <div data-closed-note className="p-3 bg-amber-50 border-b border-amber-100 text-sm text-amber-800 shrink-0 space-y-2">
                        <div className="flex items-start gap-2">
                            <Lock size={16} className="mt-0.5 shrink-0" />
                            <span>
                                {reopenStale
                                    ? t('checklist.reopen.reloadFailed')
                                    : t(canReopen && onReopen ? 'checklist.reopen.lockedCanReopen' : 'checklist.reopen.lockedNoPermission', {
                                        status: t(checklistStatus === 'Pass' ? 'checklist.status.pass' : 'checklist.status.fail'),
                                    })}
                            </span>
                        </div>
                        {canReopen && onReopen && !reopenStale && !confirmingReopen && (
                            <button className={actionStyles.workflow}
                                type="button"
                                data-reopen-button
                                onClick={() => { setReopenError(null); setConfirmingReopen(true); }}
                                disabled={reopening}
                            >
                                {t('checklist.reopen.button')}
                            </button>
                        )}
                        {confirmingReopen && (
                            <div data-reopen-confirm className="rounded-md border border-amber-300 bg-white p-3 space-y-2">
                                <p className="text-amber-900">{t('checklist.reopen.confirmNote')}</p>
                                <div className="flex gap-2">
                                    <button className={actionStyles.workflow}
                                        type="button"
                                        data-reopen-confirm-button
                                        onClick={handleReopen}
                                        disabled={reopening}
                                    >
                                        {t('checklist.reopen.confirm')}
                                    </button>
                                    <button className={actionStyles.secondary}
                                        type="button"
                                        onClick={() => setConfirmingReopen(false)}
                                        disabled={reopening}
                                    >
                                        {t('common.cancel')}
                                    </button>
                                </div>
                            </div>
                        )}
                        {reopenError && (
                            <div data-reopen-error className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">{reopenError}</div>
                        )}
                    </div>
                )}

                <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-4 gap-4 shrink-0">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`pb-3 px-2 text-sm font-semibold transition-colors border-b-2 ${activeTab === 'general'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        {t('checklist.tabGeneral')}
                    </button>
                    <button
                        onClick={() => setActiveTab('items')}
                        className={`pb-3 px-2 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'items'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        {t('checklist.tabItems')}
                        <span className="text-xs bg-slate-200 text-slate-600 px-1.5 rounded-full">
                            {formData.items?.length || 0}
                        </span>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 bg-white">
                    {activeTab === 'general' && (
                        <div className="grid grid-cols-2 gap-6">
                            {/* ... Content ... */}
                            <div className="space-y-4">
                                <div className={styles.formGroup}>
                                    <label className={styles.requiredLabel}>{t('common.referenceNo')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.recordsNo || ''}
                                        readOnly // Usually ref no is fixed or auto-gen
                                        disabled
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.requiredLabel}>{t('common.status')}</label>
                                    <div
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold w-fit ${computedStatus === 'Pass' ? 'bg-green-100 text-green-700' :
                                            computedStatus === 'Fail' ? 'bg-red-100 text-red-700' :
                                                'bg-slate-100 text-slate-500'
                                            }`}
                                        title={t('checklist.statusComputedNote') || 'Status is derived from item results and cannot be edited directly.'}
                                    >
                                        {computedStatus === 'Pass' ? <CheckCircle size={14} /> : computedStatus === 'Fail' ? <XCircle size={14} /> : <HelpCircle size={14} />}
                                        {computedStatus === 'Pass' ? t('checklist.status.pass') : computedStatus === 'Fail' ? t('checklist.status.fail') : t('checklist.status.ongoing')}
                                    </div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.requiredLabel}>{t('common.location')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.location || ''}
                                        onChange={(e) => handleFieldChange('location', e.target.value)}
                                        placeholder="Specific location for this check"
                                        disabled={locked}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('common.remark')}</label>
                                    <textarea
                                        className={`${styles.formInput} min-h-[100px] resize-none`}
                                        value={formData.remarks || ''}
                                        onChange={(e) => handleFieldChange('remarks', e.target.value)}
                                        placeholder="Add observations or remarks..."
                                        disabled={locked}
                                    />
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className={styles.formGroup}>
                                    <label className={styles.requiredLabel}>{t('checklist.activity')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.activity || ''}
                                        readOnly
                                        disabled
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.requiredLabel}>{t('itr.inspectionDate')}</label>
                                    <input
                                        type="date"
                                        className={styles.formInput}
                                        value={formData.date ? formData.date.split('T')[0] : ''}
                                        onChange={(e) => handleFieldChange('date', e.target.value)}
                                        disabled={locked}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.requiredLabel}>NOI No.</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.aconexNumber || ''}
                                        readOnly
                                        disabled
                                    />
                                </div>
                            </div>
                        </div>
                    )} {/* Closing activeTab === 'general' */}

                    {activeTab === 'items' && (
                        <div className="space-y-4">
                            {/* No Add/Remove item entry point here (2026-09-19 fix): the
                                snapshot's item/criteria list is a fixed copy of the linked
                                template at the moment it was linked — the template library
                                is the only place items/criteria are authored. This view only
                                ever fills in Situation/Result for the items already present. */}
                            <div>
                                <h3 className="font-bold text-slate-700">{t('checklist.itemsList')}</h3>
                                <p className="text-xs text-slate-400 mt-0.5">{t('checklist.itemsAreReferenceNote') || 'Item / Criteria are fixed from the linked template — fill in the actual Situation and Result for this inspection.'}</p>
                            </div>

                            {items.length > 0 && (
                                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-1" data-progress-summary>
                                    <div className="font-bold text-slate-800" data-progress-judged>
                                        {t('checklist.progress.judged', { judged: summary.judged, total: summary.total })}
                                    </div>
                                    <div data-progress-breakdown>
                                        {t('checklist.progress.breakdown', {
                                            pass: summary.pass, fail: summary.fail, na: summary.na,
                                            unfilled: summary.unfilled, unknown: summary.unknown,
                                        })}
                                    </div>
                                </div>
                            )}
                            {failuresSoFar(summary) > 0 && (
                                <div data-fail-so-far-note className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                                    <XCircle size={14} className="mt-0.5 shrink-0" />{t('checklist.progress.failSoFar', { fail: summary.fail })}
                                </div>
                            )}
                            {hasApprovalLimitingNa(summary) && (
                                <div data-na-limit-note data-na-pending={isNaPending(summary) ? 'true' : undefined} className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                                    {isNaPending(summary) ? `${t('checklist.na.pendingNote')} ${t('checklist.na.limitNote')}` : t('checklist.na.limitNote')}
                                </div>
                            )}
                            {summary.unknown > 0 && (
                                <div data-unknown-note className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                                    <HelpCircle size={14} className="mt-0.5 shrink-0" />{t('checklist.unknown.note')}
                                </div>
                            )}

                            {items.length > 0 ? (
                                <div className="overflow-x-auto border rounded-lg">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-600 font-bold border-b">
                                            <tr>
                                                <th className="px-3 py-2 w-10">#</th>
                                                <th className="px-3 py-2 w-1/6">{t('checklist.item')}</th>
                                                <th className="px-3 py-2 w-1/6">{t('checklist.criteria')}</th>
                                                <th className="px-3 py-2 min-w-[260px]">{t('checklist.situation')}</th>
                                                <th className="px-3 py-2 w-52 shrink-0">{t('checklist.result')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {items.map((item: any, idx: number) => {
                                                const isNa = item?.result === '/';
                                                const legacyNa = isNa && isLegacyNaWithoutReason(item, originalItems.current[idx]);
                                                const reasonMissing = missingReason.includes(idx);
                                                return (
                                                <tr key={idx} className="hover:bg-slate-50 align-top" data-item-row={idx}>
                                                    <td className="px-3 py-2 text-center text-slate-500">{item.id}</td>
                                                    <td className="px-3 py-2">
                                                        <div className="font-medium text-slate-800">{item.item}</div>
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-600">{item.criteria}</td>
                                                    <td className="px-3 py-2">
                                                        {locked ? (
                                                            // Locked/read-only: a plain text block, not a disabled form
                                                            // control — disabled inputs/textareas cannot be focused,
                                                            // scrolled, or have their text selected/copied in any major
                                                            // browser, so a disabled textarea would make long content
                                                            // LESS readable than before, not more. A plain <div> keeps
                                                            // the lock (nothing here can be edited or submitted) while
                                                            // actually satisfying "can read and copy the full text".
                                                            <div
                                                                data-situation-readonly={idx}
                                                                className="w-full min-h-[4.5rem] whitespace-pre-wrap break-words text-slate-700 py-1"
                                                            >
                                                                {item.situation || ''}
                                                            </div>
                                                        ) : (
                                                            <textarea
                                                                data-situation-input={idx}
                                                                rows={3}
                                                                className="w-full min-h-[4.5rem] resize-y rounded border border-slate-200 bg-transparent px-2 py-1.5 hover:border-slate-300 focus:border-blue-500 outline-none transition-colors"
                                                                value={item.situation || ''}
                                                                placeholder="..."
                                                                onChange={(e) => setItem(idx, { ...item, situation: e.target.value })}
                                                            />
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <ResultSelect
                                                            value={item.result}
                                                            disabled={locked}
                                                            onChange={(code) => setItem(idx, withResult(item, code))}
                                                        />
                                                        {isNa && (
                                                            <div className="mt-2">
                                                                <label className="block text-[11px] font-semibold text-slate-500">
                                                                    {t('checklist.na.reasonLabel')}{!legacyNa && <span className="text-red-500"> *</span>}
                                                                </label>
                                                                <input
                                                                    type="text"
                                                                    data-na-reason={idx}
                                                                    className={`w-full rounded border px-2 py-1 text-xs outline-none ${reasonMissing && triedSave ? 'border-red-400 bg-red-50' : 'border-slate-300 focus:border-blue-500'}`}
                                                                    value={item.naReason || ''}
                                                                    placeholder={t('checklist.na.reasonPlaceholder')}
                                                                    onChange={(e) => setItem(idx, { ...item, naReason: e.target.value })}
                                                                    disabled={locked}
                                                                />
                                                                {legacyNa && (
                                                                    <div data-na-legacy className="mt-1 text-[11px] font-semibold text-slate-500">{t('checklist.na.legacyNoReason')}</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed text-slate-400">
                                    {t('checklist.noItems')}
                                </div>
                            )}
                        </div>
                    )} {/* Closing activeTab === 'items' */}
                </div>

                {saveError && (
                    <div data-save-error className="px-4 py-2 border-t border-red-200 bg-red-50 text-sm text-red-700 shrink-0">{saveError}</div>
                )}
            <FormActions cancel={<><button
                className={actionStyles.secondary}
                onClick={requestClose}
            >
                {t('common.cancel')}
            </button></>} primary={<>{!locked && (
                <button
                    className={actionStyles.primary}
                    onClick={handleSave}
                    disabled={saving}
                >
                    {t('common.save')}
                </button>
            )}</>} />
            </div>
    );

    return inline ? panel : (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            {panel}
        </div>
    );
};
