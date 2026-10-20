/**
 * One company document (KM-DOCS-2026-001 D2): header, the current version's PDF inline (or a clear empty state), the version
 * history with downloads and "Set current", the references, and the actions the caller's permissions and the document's
 * status allow. Every write refreshes the document from the server; a 409 offers "Reload this record".
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import shellStyles from '../Shared/ModuleShell.module.css';
import ConfirmModal from '../Shared/ConfirmModal';
import { StatusBadge } from '../Shared/StatusBadge';
import { BackButton } from '../ui/BackButton';
import { useAuth } from '../../context/AuthContext';
import { documentsApi } from '../../services/documentsApi';
import { showRefusal } from '../../store/refusalStore';
import { useDocumentsStore } from '../../store/documentsStore';
import type { DocumentDetail as Doc, DocumentVersion } from '../../types/documents';
import { labelOf } from './columns';
import { DocumentMetaDialog, NewVersionDialog, SetCurrentDialog } from './DocumentDialogs';
import PdfViewer from './PdfViewer';
import { useDocumentsText } from './documentsText';
import styles from './Documents.module.css';

type Dialog = { kind: 'meta' } | { kind: 'version' } | { kind: 'current'; versionId?: string } | { kind: 'archive' } | { kind: 'unarchive' } | { kind: 'delete' } | null;

const DocumentDetail: React.FC = () => {
    const dt = useDocumentsText();
    const navigate = useNavigate();
    const { documentId = '' } = useParams<{ documentId: string }>();
    const { user, hasPermission } = useAuth();
    const isAdmin = !!user?.is_admin;
    const canUpdate = hasPermission('km:update:all');
    const canDelete = hasPermission('km:delete:all');
    const { current: doc, currentLoading, currentError, fetchOne, mergeIntoList } = useDocumentsStore();
    const [dialog, setDialog] = useState<Dialog>(null);
    const [pending, setPending] = useState(false);

    useEffect(() => { void fetchOne(documentId); }, [documentId, fetchOne]);

    const reload = useCallback(async () => {
        const fresh = await fetchOne(documentId);
        if (fresh) mergeIntoList(fresh);
        return fresh;
    }, [documentId, fetchOne, mergeIntoList]);

    /** a 409 in a form: close it, reload the document, reopen the form on the fresh version — never keep the old input against a
     *  new row_version, which would overwrite the other person's change without a conflict (R1 P1-1; other modules' reloadAndReopen) */
    const reloadAndReopen = async (again: Dialog) => {
        setDialog(null);
        const fresh = await reload();
        if (fresh) setDialog(again);
    };

    const download = (versionId: string, kind: 'word' | 'pdf', fileName: string) => {
        if (!doc) return;
        documentsApi.download(doc.id, versionId, kind, fileName).catch(() => toast.error(dt('downloadFailed')));
    };

    const apply = (fresh: Doc) => {
        useDocumentsStore.getState().setCurrent(fresh);
        mergeIntoList(fresh);
    };

    const transition = async (to: 'archived' | 'draft', okKey: 'savedArchived' | 'savedUnarchived') => {
        if (!doc) return;
        setPending(true);
        try {
            apply(await documentsApi.transition(doc.id, { to }, doc.row_version));
            toast.success(dt(okKey));
            setDialog(null);
        } catch (err) {
            setDialog(null);
            showRefusal(err, 'save', { onReload: () => void reload(), reloadDiscardsInput: false });
        } finally {
            setPending(false);
        }
    };

    const remove = async () => {
        if (!doc) return;
        setPending(true);
        try {
            await documentsApi.remove(doc.id);
            toast.success(dt('savedDeleted'));
            navigate('/km');
        } catch (err) {
            setDialog(null);
            showRefusal(err, 'delete');
        } finally {
            setPending(false);
        }
    };

    if (doc && doc.id !== documentId) {
        // the store still holds another document (or a stale answer): show nothing of it
        return <div className={shellStyles.container}><p className={shellStyles.loadingNote}>{dt('loading')}</p></div>;
    }
    if (currentLoading && !doc) {
        return <div className={shellStyles.container}><p className={shellStyles.loadingNote}>{dt('loading')}</p></div>;
    }
    if (!doc) {
        return (
            <div className={shellStyles.container}>
                <BackButton onClick={() => navigate('/km')} />
                <p role="alert" style={{ marginTop: 16 }}>{dt(currentError === 'notFound' ? 'notFound' : 'detailFailed')}</p>
                {currentError === 'failed' && <button type="button" className={shellStyles.retryButton} onClick={() => void reload()}>{dt('retry')}</button>}
            </div>
        );
    }

    const editable = canUpdate && !(doc.is_template && !isAdmin);
    const locked = doc.status === 'archived';
    const current = doc.versions.find((v) => v.id === doc.current_version_id) ?? null;
    const canSetCurrent = editable && !locked && doc.versions.some((v) => v.status === 'draft' && v.pdf_attachment_id);
    // a template is deleted by a system administrator only, like every other template write (BACKLOG #65; backend SHARED_TEMPLATE_ADMIN_ONLY)
    const canDeleteDraft = canDelete && doc.status === 'draft' && !doc.versions.some((v) => v.status !== 'draft') && !(doc.is_template && !isAdmin);
    const versionsDesc = [...doc.versions].sort((a, b) => b.version_no - a.version_no);

    return (
        <div className={shellStyles.container} data-testid="document-detail">
            <div className={styles.detailTop}>
                <BackButton onClick={() => navigate('/km')} />
                <div className={styles.actionRow}>
                    {editable && !locked && <button type="button" className={`${styles.smallButton} ${styles.smallButtonPrimary}`} onClick={() => setDialog({ kind: 'version' })} data-testid="action-new-version">{dt('newVersion')}</button>}
                    {canSetCurrent && <button type="button" className={styles.smallButton} onClick={() => setDialog({ kind: 'current' })} data-testid="action-set-current">{dt('setCurrent')}</button>}
                    {editable && <button type="button" className={styles.smallButton} onClick={() => setDialog({ kind: 'meta' })} data-testid="action-edit-meta">{dt('editMeta')}</button>}
                    {editable && doc.status === 'current' && <button type="button" className={styles.smallButton} onClick={() => setDialog({ kind: 'archive' })} data-testid="action-archive">{dt('archive')}</button>}
                    {editable && locked && <button type="button" className={styles.smallButton} onClick={() => setDialog({ kind: 'unarchive' })} data-testid="action-unarchive">{dt('unarchive')}</button>}
                    {canDeleteDraft && <button type="button" className={styles.smallButton} onClick={() => setDialog({ kind: 'delete' })} data-testid="action-delete">{dt('deleteDraft')}</button>}
                </div>
            </div>

            <div className={styles.hero}>
                <div className={styles.heroMeta}>
                    <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{doc.doc_no}</span>
                    <span className={styles.pill}>{labelOf(dt, 'type', doc.doc_type)}</span>
                    {doc.is_template && doc.doc_type !== 'template' && <span className={`${styles.pill} ${styles.pillTemplate}`}>{dt('template')}</span>}
                    <StatusBadge status={doc.status} label={labelOf(dt, 'status', doc.status)} />
                    {doc.effective_date && <span>{dt('effectiveDate')}：{doc.effective_date}</span>}
                    {current && <span>{dt('currentVersion')}：{current.version_label}</span>}
                </div>
                <h1>{doc.title_zh}</h1>
                {doc.title_en && <p className={styles.heroEn}>{doc.title_en}</p>}
                {doc.tags && <div className={styles.tagRow}>{doc.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => <span key={t} className={styles.tag}>{t}</span>)}</div>}
            </div>

            <div className={styles.layout}>
                <div>
                    {current && current.pdf_attachment_id ? (
                        <PdfViewer documentId={doc.id} versionId={current.id} fileName={current.pdf_file_name || `${doc.doc_no}.pdf`}
                                   caption={<><strong>{current.version_label}</strong> · {labelOf(dt, 'status', current.status)}{current.change_summary ? ` · ${current.change_summary}` : ''}</>} />
                    ) : (
                        <div className={styles.pdfCard}>
                            <div className={styles.emptyState} data-testid="pdf-empty">
                                {/* three empty states: no version at all / versions but none current / a current version without its PDF */}
                                <h3>{dt(!doc.versions.length ? 'noVersionTitle' : current ? 'noPdfTitle' : 'noCurrentTitle')}</h3>
                                <p>{dt(!doc.versions.length ? 'noVersionBody' : current ? 'noPdfBody' : 'noCurrentBody')}</p>
                                {editable && !locked && <button type="button" className={`${styles.smallButton} ${styles.smallButtonPrimary}`} onClick={() => setDialog({ kind: 'version' })}>{dt('newVersion')}</button>}
                                {current && current.word_attachment_id && (
                                    <button type="button" className={styles.smallButton} onClick={() => download(current.id, 'word', current.word_file_name || `${doc.doc_no}.docx`)}>{dt('downloadWord')}</button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div>
                    <div className={styles.sideCard}>
                        <h3>{dt('versions')}</h3>
                        {versionsDesc.length === 0 && <p className={styles.muted}>{dt('noVersionYet')}</p>}
                        <ul className={styles.versionList} data-testid="version-list">
                            {versionsDesc.map((v: DocumentVersion) => (
                                <li key={v.id} className={`${styles.versionItem} ${v.id === doc.current_version_id ? styles.versionItemCurrent : ''}`} data-testid={`version-${v.version_no}`}>
                                    <div className={styles.versionHead}>
                                        <span className={styles.versionLabel}>{v.version_label}</span>
                                        <StatusBadge status={v.status} label={labelOf(dt, 'status', v.status)} />
                                    </div>
                                    <div className={styles.versionMeta}>{(v.created_at || '').slice(0, 16)} · {v.searchable ? dt('searchable') : dt('notSearchable')}</div>
                                    {v.change_summary && <div className={styles.versionSummary}>{v.change_summary}</div>}
                                    <div className={styles.versionFiles}>
                                        {v.pdf_attachment_id && <button type="button" className={styles.smallButton} onClick={() => download(v.id, 'pdf', v.pdf_file_name || `${doc.doc_no}-${v.version_label}.pdf`)}>{dt('downloadPdf')}</button>}
                                        {v.word_attachment_id && <button type="button" className={styles.smallButton} onClick={() => download(v.id, 'word', v.word_file_name || `${doc.doc_no}-${v.version_label}.docx`)}>{dt('downloadWord')}</button>}
                                        {editable && !locked && v.status === 'draft' && (
                                            <button type="button" className={`${styles.smallButton} ${styles.smallButtonPrimary}`} disabled={!v.pdf_attachment_id}
                                                    title={v.pdf_attachment_id ? undefined : dt('needsPdf')} onClick={() => setDialog({ kind: 'current', versionId: v.id })}>{dt('setCurrent')}</button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className={styles.sideCard}>
                        <h3>{dt('references')}</h3>
                        {doc.references.length === 0 ? <p className={styles.muted}>{dt('noReferences')}</p> : (
                            <ul className={styles.refList}>
                                {doc.references.map((r) => (
                                    <li key={r.id}>
                                        {dt('refFrom', { type: r.from_type, id: r.from_id })}
                                        {r.section_ref ? ` · ${dt('refSection', { section: r.section_ref })}` : ''}
                                        {r.version_id && r.pinned_version_no ? ` · ${dt('refPinned', { no: r.pinned_version_no })}` : ''}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {dialog?.kind === 'meta' && (
                <DocumentMetaDialog key={doc.row_version ?? 0} item={doc} onClose={() => setDialog(null)} onReloadRecord={() => void reloadAndReopen({ kind: 'meta' })}
                                    onSaved={(fresh) => { apply(fresh); setDialog(null); toast.success(dt('savedUpdated')); }} />
            )}
            {dialog?.kind === 'version' && (
                <NewVersionDialog doc={doc} onClose={() => setDialog(null)}
                                  onSaved={(version) => { setDialog(null); void reload(); toast.success(dt('savedVersion', { label: version.version_label })); }} />
            )}
            {dialog?.kind === 'current' && (
                <SetCurrentDialog key={doc.row_version ?? 0} doc={doc} initialVersionId={dialog.versionId} onClose={() => setDialog(null)} onReloadRecord={() => void reloadAndReopen({ kind: 'current', versionId: dialog.versionId })}
                                  onSaved={(fresh, version) => { apply(fresh); setDialog(null); toast.success(dt('savedCurrent', { label: version.version_label })); }} />
            )}
            <ConfirmModal isOpen={dialog?.kind === 'archive'} pending={pending} title={dt('confirmArchiveTitle')} message={dt('confirmArchive')}
                          onConfirm={() => void transition('archived', 'savedArchived')} onCancel={() => setDialog(null)} confirmText={dt('archive')} cancelText={dt('cancel')} />
            <ConfirmModal isOpen={dialog?.kind === 'unarchive'} pending={pending} title={dt('confirmUnarchiveTitle')} message={dt('confirmUnarchive')}
                          onConfirm={() => void transition('draft', 'savedUnarchived')} onCancel={() => setDialog(null)} confirmText={dt('unarchive')} cancelText={dt('cancel')} />
            <ConfirmModal isOpen={dialog?.kind === 'delete'} pending={pending} intent="danger" title={dt('confirmDeleteTitle')} message={dt('confirmDelete')}
                          onConfirm={() => void remove()} onCancel={() => setDialog(null)} confirmText={dt('deleteDraft')} cancelText={dt('cancel')} />
        </div>
    );
};

export default DocumentDetail;
