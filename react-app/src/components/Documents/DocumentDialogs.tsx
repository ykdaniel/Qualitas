/**
 * The register's dialogs (KM-DOCS-2026-001 D2): register / edit details, new version (Word and / or PDF, one request),
 * set current (choose a version that has its PDF). FormShell frame, FormActions footer, the unsaved-changes guard, and every
 * refusal through the shared refusal dialog (a 409 VERSION_CONFLICT offers "Reload this record" via onReloadRecord).
 */
import React, { useRef, useState } from 'react';
import formStyles from '../Shared/FormShell.module.css';
import actionStyles from '../Shared/FormActions.module.css';
import FormActions from '../Shared/FormActions';
import { useDraftGuard } from '../Shared/LeaveGuard';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { documentsApi, PDF_MAX_MB, WORD_MAX_MB } from '../../services/documentsApi';
import { showRefusal } from '../../store/refusalStore';
import { COMPANY_DOC_TYPES, type DocumentDetail, type DocumentSummary, type DocumentVersion } from '../../types/documents';
import { useDocumentsText, type DocumentsTextKey } from './documentsText';
import { labelOf } from './columns';
import styles from './Documents.module.css';

const trimOrNull = (v: string) => v.trim() || null;
const splitList = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

const Frame: React.FC<{ title: string; onClose: () => void; busy: boolean; children: React.ReactNode; testId: string }> = ({ title, onClose, busy, children, testId }) => {
    const { t } = useLanguage();
    const titleId = `${testId}-title`;
    return (
        <div className={formStyles.modalOverlay}>
            <div className={formStyles.modalContent} style={{ maxWidth: 720 }} data-testid={testId} role="dialog" aria-modal="true" aria-labelledby={titleId}>
                <div className={formStyles.modalHeader}>
                    <h2 id={titleId}>{title}</h2>
                    <button type="button" className={formStyles.closeButton} aria-label={t('common.close')} title={t('common.close')} disabled={busy} onClick={onClose}>&times;</button>
                </div>
                {children}
            </div>
        </div>
    );
};

// ---- register / edit details ----------------------------------------------------------------------------------------------

interface MetaValues { title_zh: string; title_en: string; doc_type: string; category: string; tags: string; effective_date: string; is_template: boolean; template_fields: string }

const fromDoc = (d: DocumentSummary | null): MetaValues => ({
    title_zh: d?.title_zh ?? '', title_en: d?.title_en ?? '', doc_type: d?.doc_type ?? 'procedure', category: d?.category ?? '',
    tags: d?.tags ?? '', effective_date: d?.effective_date ?? '', is_template: d?.is_template ?? false,
    template_fields: (d?.template_fields ?? []).join(', '),
});

export const DocumentMetaDialog: React.FC<{
    item?: DocumentDetail | null;                 // null = register a new company document
    onClose: () => void;
    onSaved: (doc: DocumentDetail, created: boolean) => void;
    onReloadRecord?: (id: string) => void;
}> = ({ item, onClose, onSaved, onReloadRecord }) => {
    const dt = useDocumentsText();
    const { user } = useAuth();
    const isAdmin = !!user?.is_admin;
    const editing = !!item;
    /** an archived document keeps only its tags editable (backend RECORD_LOCKED otherwise): the other fields are shown, read-only */
    const tagsOnly = item?.status === 'archived';
    const [v, setV] = useState<MetaValues>(() => fromDoc(item ?? null));
    const [saving, setSaving] = useState(false);
    const [tried, setTried] = useState(false);
    const busy = useRef(false);
    const guard = useDraftGuard(v, saving);
    const requestClose = () => guard.requestClose(onClose);
    const set = (k: keyof MetaValues, value: string | boolean) => setV((c) => ({ ...c, [k]: value }));
    const missingTitle = !v.title_zh.trim();
    const label = (key: DocumentsTextKey, required = false) => (
        <label className={required ? formStyles.requiredLabel : formStyles.optionalLabel}>{dt(key)}</label>
    );

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setTried(true);
        if (missingTitle || busy.current) return;
        busy.current = true;
        setSaving(true);
        try {
            const isTemplate = isAdmin && (v.is_template || v.doc_type === 'template');
            let saved: DocumentDetail;
            if (editing && item && tagsOnly) {
                saved = await documentsApi.update(item.id, { tags: trimOrNull(v.tags) }, item.row_version);
            } else if (editing && item) {
                saved = await documentsApi.update(item.id, {
                    title_zh: v.title_zh.trim(), title_en: trimOrNull(v.title_en), category: trimOrNull(v.category), tags: trimOrNull(v.tags),
                    effective_date: trimOrNull(v.effective_date), template_fields: isTemplate ? splitList(v.template_fields) : undefined,
                }, item.row_version);
            } else {
                saved = await documentsApi.create({
                    scope: 'company', doc_type: v.doc_type as DocumentDetail['doc_type'], title_zh: v.title_zh.trim(), title_en: trimOrNull(v.title_en),
                    category: trimOrNull(v.category), tags: trimOrNull(v.tags), effective_date: trimOrNull(v.effective_date),
                    is_template: isTemplate, template_fields: isTemplate ? splitList(v.template_fields) : undefined,
                });
            }
            guard.release();
            onSaved(saved, !editing);
        } catch (err) {
            showRefusal(err, 'save', { keepsInput: true, onReload: item && onReloadRecord ? () => onReloadRecord(item.id) : undefined });
        } finally {
            busy.current = false;
            setSaving(false);
        }
    };

    return (
        <Frame title={dt(editing ? 'editTitle' : 'createTitle')} onClose={requestClose} busy={saving} testId="document-meta-dialog">
            <form onSubmit={save} className={formStyles.modalBody} aria-busy={saving}>
                <p className={formStyles.formRequiredHint}>* {dt('required')}</p>
                {tagsOnly && <p className={styles.hint} data-testid="tags-only-hint">{dt('archivedTagsOnly')}</p>}
                <div className={formStyles.formGrid}>
                    <div className={formStyles.formGroupFull}>
                        {label('titleZh', true)}
                        <input className={formStyles.formInput} value={v.title_zh} disabled={tagsOnly} onChange={(e) => set('title_zh', e.target.value)} data-testid="doc-title-zh" autoFocus={!tagsOnly} />
                        {tried && missingTitle && <p className={styles.fieldError}>{dt('required')}</p>}
                    </div>
                    <div className={formStyles.formGroupFull}>
                        {label('titleEn')}
                        <input className={formStyles.formInput} value={v.title_en} disabled={tagsOnly} onChange={(e) => set('title_en', e.target.value)} data-testid="doc-title-en" />
                    </div>
                    <div className={formStyles.formGroup}>
                        {label('docType', true)}
                        <select className={formStyles.formSelect} value={v.doc_type} disabled={editing} onChange={(e) => set('doc_type', e.target.value)} data-testid="doc-type">
                            {COMPANY_DOC_TYPES.filter((t) => t !== 'template' || isAdmin).map((t) => (
                                <option key={t} value={t}>{labelOf(dt, 'type', t)}</option>
                            ))}
                        </select>
                    </div>
                    <div className={formStyles.formGroup}>
                        {label('category')}
                        <input className={formStyles.formInput} value={v.category} disabled={tagsOnly} onChange={(e) => set('category', e.target.value)} />
                    </div>
                    <div className={formStyles.formGroup}>
                        {label('tags')}
                        <input className={formStyles.formInput} value={v.tags} onChange={(e) => set('tags', e.target.value)} data-testid="doc-tags" />
                    </div>
                    <div className={formStyles.formGroup}>
                        {label('effectiveDate')}
                        <input className={formStyles.formInput} type="date" value={v.effective_date} disabled={tagsOnly} onChange={(e) => set('effective_date', e.target.value)} />
                    </div>
                    {isAdmin && (
                        <div className={formStyles.formGroupFull}>
                            <label className={styles.checkbox}>
                                <input type="checkbox" checked={v.is_template || v.doc_type === 'template'} disabled={editing || v.doc_type === 'template'}
                                       onChange={(e) => set('is_template', e.target.checked)} />
                                {dt('isTemplate')}
                            </label>
                            {(v.is_template || v.doc_type === 'template') && (
                                <>
                                    {label('templateFields')}
                                    <input className={formStyles.formInput} value={v.template_fields} disabled={tagsOnly} onChange={(e) => set('template_fields', e.target.value)} />
                                </>
                            )}
                        </div>
                    )}
                </div>
                <FormActions
                    cancel={<button type="button" className={actionStyles.secondary} disabled={saving} onClick={requestClose}>{dt('cancel')}</button>}
                    primary={<button type="submit" className={actionStyles.primary} disabled={saving} data-testid="doc-save">{saving ? dt('saving') : dt('save')}</button>}
                />
            </form>
        </Frame>
    );
};

// ---- new version ------------------------------------------------------------------------------------------------------------

const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
const isWord = (f: File) => /\.(docx|doc)$/i.test(f.name);

export const NewVersionDialog: React.FC<{
    doc: DocumentSummary;
    onClose: () => void;
    onSaved: (version: DocumentVersion) => void;
}> = ({ doc, onClose, onSaved }) => {
    const dt = useDocumentsText();
    const [word, setWord] = useState<File | null>(null);
    const [pdf, setPdf] = useState<File | null>(null);
    const [summary, setSummary] = useState('');
    const [labelText, setLabelText] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const busy = useRef(false);
    const guard = useDraftGuard({ word: word?.name, pdf: pdf?.name, summary, labelText }, saving);
    const requestClose = () => guard.requestClose(onClose);

    const pick = (kind: 'word' | 'pdf', input: HTMLInputElement) => {
        const file = input.files?.[0] ?? null;
        const setFile = kind === 'word' ? setWord : setPdf;
        setError(null);
        const maxMb = kind === 'pdf' ? PDF_MAX_MB : WORD_MAX_MB;
        const problem = !file ? null
            : !(kind === 'pdf' ? isPdf(file) : isWord(file)) ? dt('wrongType', { name: file.name, kind: kind === 'pdf' ? 'PDF' : 'Word' })
            : file.size > maxMb * 1024 * 1024 ? dt('tooLarge', { name: file.name, mb: maxMb }) : null;
        if (problem) {
            // what the input shows and what would be sent must stay the same: drop both (R1 P2-3)
            input.value = '';
            setFile(null);
            setError(problem);
            return;
        }
        setFile(file);
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy.current) return;
        if (!word && !pdf) { setError(dt('atLeastOneFile')); return; }
        busy.current = true;
        setSaving(true);
        try {
            const version = await documentsApi.addVersion(doc.id, { word, pdf }, summary.trim(), labelText);
            guard.release();
            onSaved(version);
        } catch (err) {
            showRefusal(err, 'save', { keepsInput: true });
        } finally {
            busy.current = false;
            setSaving(false);
        }
    };

    return (
        <Frame title={`${dt('newVersionTitle')} — ${doc.doc_no}`} onClose={requestClose} busy={saving} testId="new-version-dialog">
            <form onSubmit={save} className={formStyles.modalBody} aria-busy={saving}>
                <div className={formStyles.formGrid}>
                    <div className={formStyles.formGroup}>
                        <label className={formStyles.optionalLabel}>{dt('wordFile')}</label>
                        <div className={styles.fileRow}>
                            <input type="file" accept=".docx,.doc" onChange={(e) => pick('word', e.target)} data-testid="version-word" />
                            {word && <span className={styles.fileName}>{word.name}</span>}
                        </div>
                    </div>
                    <div className={formStyles.formGroup}>
                        <label className={formStyles.optionalLabel}>{dt('pdfFile')}</label>
                        <div className={styles.fileRow}>
                            <input type="file" accept="application/pdf,.pdf" onChange={(e) => pick('pdf', e.target)} data-testid="version-pdf" />
                            {pdf && <span className={styles.fileName}>{pdf.name}</span>}
                        </div>
                    </div>
                    <div className={formStyles.formGroupFull}>
                        <p className={styles.hint}>{dt('pdfRequiredHint')}</p>
                        {error && <p className={styles.fieldError} role="alert">{error}</p>}
                    </div>
                    <div className={formStyles.formGroupFull}>
                        <label className={formStyles.optionalLabel}>{dt('changeSummary')}</label>
                        <input className={formStyles.formInput} value={summary} onChange={(e) => setSummary(e.target.value)} data-testid="version-summary" />
                    </div>
                    <div className={formStyles.formGroup}>
                        <label className={formStyles.optionalLabel}>{dt('versionLabel')}</label>
                        <input className={formStyles.formInput} value={labelText} placeholder={`Rev${doc.latest_version_no + 1}.0`} onChange={(e) => setLabelText(e.target.value)} />
                    </div>
                </div>
                <FormActions
                    cancel={<button type="button" className={actionStyles.secondary} disabled={saving} onClick={requestClose}>{dt('cancel')}</button>}
                    primary={<button type="submit" className={actionStyles.primary} disabled={saving} data-testid="version-save">{saving ? dt('saving') : dt('save')}</button>}
                />
            </form>
        </Frame>
    );
};

// ---- set current ------------------------------------------------------------------------------------------------------------

export const SetCurrentDialog: React.FC<{
    doc: DocumentDetail;
    /** the version the user pressed "Set current" on (preselected when it can be chosen) */
    initialVersionId?: string;
    onClose: () => void;
    onSaved: (doc: DocumentDetail, version: DocumentVersion) => void;
    onReloadRecord?: (id: string) => void;
}> = ({ doc, initialVersionId, onClose, onSaved, onReloadRecord }) => {
    const dt = useDocumentsText();
    const candidates = doc.versions.filter((v) => v.status === 'draft' || v.status === 'current');
    const selectable = (id?: string) => candidates.some((v) => v.id === id && v.pdf_attachment_id && v.status === 'draft');
    const [chosen, setChosen] = useState<string>(() => (selectable(initialVersionId) ? initialVersionId! : [...candidates].reverse().find((v) => v.pdf_attachment_id && v.status === 'draft')?.id ?? ''));
    const [saving, setSaving] = useState(false);
    const busy = useRef(false);

    const save = async () => {
        if (!chosen || busy.current) return;
        busy.current = true;
        setSaving(true);
        try {
            const saved = await documentsApi.transition(doc.id, { to: 'current', version_id: chosen }, doc.row_version);
            const version = saved.versions.find((v) => v.id === chosen)!;
            onSaved(saved, version);
        } catch (err) {
            showRefusal(err, 'save', { onReload: onReloadRecord ? () => onReloadRecord(doc.id) : undefined, reloadDiscardsInput: false });
        } finally {
            busy.current = false;
            setSaving(false);
        }
    };

    return (
        <Frame title={`${dt('setCurrentTitle')} — ${doc.doc_no}`} onClose={onClose} busy={saving} testId="set-current-dialog">
            <div className={formStyles.modalBody}>
                <p className={styles.muted}>{dt('chooseVersion')}</p>
                <div className={styles.versionChoice}>
                    {candidates.map((v) => {
                        const disabled = !v.pdf_attachment_id || v.status === 'current';
                        return (
                            <label key={v.id} className={disabled ? styles.disabled : ''}>
                                <input type="radio" name="version" value={v.id} checked={chosen === v.id} disabled={disabled} onChange={() => setChosen(v.id)} />
                                <span>
                                    {dt('versionOption', { label: v.version_label.replace(/^Rev/i, ''), status: labelOf(dt, 'status', v.status), summary: v.change_summary ? `— ${v.change_summary}` : '' })}
                                    {!v.pdf_attachment_id && <span className={styles.muted}> {dt('versionNoPdf')}</span>}
                                </span>
                            </label>
                        );
                    })}
                </div>
                <FormActions
                    cancel={<button type="button" className={actionStyles.secondary} disabled={saving} onClick={onClose}>{dt('cancel')}</button>}
                    primary={<button type="button" className={actionStyles.primary} disabled={saving || !chosen} onClick={() => void save()} data-testid="set-current-save">{saving ? dt('saving') : dt('setCurrent')}</button>}
                />
            </div>
        </Frame>
    );
};
