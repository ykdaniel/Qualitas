import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type { FollowUp } from '../../utils/saveFlow';

/**
 * Shown after a save that stored the record but did not finish its file steps. Says that the record exists (so nobody creates it a
 * second time), which steps are unfinished, and offers a button that retries ONLY those steps — the record is never written again.
 * Without update permission the files cannot be retried by this user (the server refuses uploads without it): no button, and the banner says
 * who has to do it.
 */
export const SaveFollowUpBanner: React.FC<{ followUp: FollowUp | null; canEditFields: boolean; canRetry: boolean; busy: boolean; onRetry: () => void }> = ({ followUp, canEditFields, canRetry, busy, onRetry }) => {
    const { t } = useLanguage();
    if (!followUp) return null;
    const steps = [
        ...followUp.categories.map(c => t(`saveFlow.category.${c}`)),
        ...(followUp.deletes > 0 ? [t('saveFlow.followUp.deletes', { n: followUp.deletes })] : []),
    ].join('、');
    const nothingLeft = followUp.categories.length === 0 && followUp.deletes === 0;
    return (
        <div data-save-followup role="alert" style={{ margin: '0 0 12px', padding: '10px 14px', borderRadius: 8, border: '1px solid #f59e0b', background: '#fffbeb', color: '#92400e', fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
                <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} aria-hidden="true" />
                {t(followUp.created ? 'saveFlow.followUp.created' : 'saveFlow.followUp.saved', { steps })}
            </div>
            {followUp.failures.length > 0 && (
                <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                    {followUp.failures.map((failure, index) => (
                        <li key={index}>{failure.step === 'upload'
                            ? t('saveFlow.step.upload', { what: t(`saveFlow.category.${failure.category}`), message: failure.message })
                            : t('saveFlow.step.delete', { message: failure.message })}</li>
                    ))}
                </ul>
            )}
            {followUp.reloadFailed && <div>{t('saveFlow.savedReloadFailed')}</div>}
            <div>{t(!canRetry ? 'saveFlow.followUp.noUpload' : canEditFields ? 'saveFlow.followUp.canEdit' : 'saveFlow.followUp.noUpdate')}</div>
            {!nothingLeft && canRetry && (
                <button type="button" onClick={onRetry} disabled={busy} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, border: '1px solid #b45309', background: '#fff', color: '#92400e', cursor: busy ? 'wait' : 'pointer', fontWeight: 600 }}>
                    {t('saveFlow.followUp.retry')}
                </button>
            )}
        </div>
    );
};

/** Shown on an editable form when the account may not upload / remove attachments (no update permission): before creating, so nobody
 *  finds out only after the record exists. */
export const AttachmentsBlockedNotice: React.FC<{ creating: boolean }> = ({ creating }) => {
    const { t } = useLanguage();
    return (
        <div data-attachments-blocked role="note" style={{ margin: '0 0 12px', padding: '10px 14px', borderRadius: 8, border: '1px solid #f59e0b', background: '#fffbeb', color: '#92400e', fontSize: 13 }}>
            <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} aria-hidden="true" />
            {t(creating ? 'saveFlow.attachmentsBlocked.create' : 'saveFlow.attachmentsBlocked.edit')}
        </div>
    );
};
