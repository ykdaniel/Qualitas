/**
 * Company-document register — the KM entry (KM-DOCS-2026-001 D2, DESIGN §4). The list comes from the server with the
 * filters and the search (number / title / tags / current version's Word text); a row opens the detail page; registering a
 * document opens the meta dialog. The legacy knowledge base stays reachable, read-only, from the header (U4).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import shellStyles from '../Shared/ModuleShell.module.css';
import { useAuth } from '../../context/AuthContext';
import { useDebounce } from '../../hooks/useDebounce';
import { useDocumentsStore } from '../../store/documentsStore';
import { DataTable } from '../Shared/DataTable/DataTable';
import { COMPANY_DOC_TYPES, type DocumentDetail } from '../../types/documents';
import { createDocumentColumns, labelOf } from './columns';
import { DocumentMetaDialog } from './DocumentDialogs';
import { useDocumentsText } from './documentsText';
import styles from './Documents.module.css';

const STATUSES = ['draft', 'current', 'archived'] as const;

const DocumentsRegister: React.FC = () => {
    const dt = useDocumentsText();
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const canView = hasPermission('km:view:all');
    const canCreate = hasPermission('km:create:all');
    const { list, loading, error, accessDenied, fetchList, mergeIntoList } = useDocumentsStore();

    const [q, setQ] = useState('');
    const debouncedQ = useDebounce(q, 300);
    const [docType, setDocType] = useState('');
    const [status, setStatus] = useState('');
    const [includeArchived, setIncludeArchived] = useState(false);
    const [registering, setRegistering] = useState(false);

    useEffect(() => {
        if (!canView) return;
        void fetchList({ scope: 'company', doc_type: docType || undefined, status: status || undefined, q: debouncedQ.trim() || undefined,
                         include_hidden: includeArchived || undefined, limit: 500 });
    }, [canView, fetchList, docType, status, debouncedQ, includeArchived]);

    const columns = useMemo(() => createDocumentColumns(dt, !!debouncedQ.trim()), [dt, debouncedQ]);
    const openDetail = useCallback((id: string) => navigate(`/km/${id}`), [navigate]);
    const onRegistered = (doc: DocumentDetail) => {
        mergeIntoList(doc);
        setRegistering(false);
        toast.success(dt('savedCreated', { docNo: doc.doc_no }));
        navigate(`/km/${doc.id}`);
    };

    if (!canView || accessDenied) {
        return (
            <div className={shellStyles.container}>
                <h1>{dt('registerTitle')}</h1>
                <p role="alert">{dt('viewDenied')}</p>
            </div>
        );
    }

    return (
        <div className={shellStyles.container} data-testid="documents-register">
            <div className={styles.header}>
                <div>
                    <h1>{dt('registerTitle')}</h1>
                    <p className={styles.subtitle}>{dt('registerSubtitle')}</p>
                </div>
                <div className={styles.headerLinks}>
                    <Link to="/km/legacy" className={styles.linkButton} data-testid="legacy-link">{dt('legacyLink')}</Link>
                </div>
            </div>

            <div className={shellStyles.toolbar}>
                <div className={shellStyles.chipGroup}>
                    <select className={styles.filterSelect} value={docType} onChange={(e) => setDocType(e.target.value)} aria-label={dt('filterType')} data-testid="filter-type">
                        <option value="">{dt('filterType')}：{dt('all')}</option>
                        {COMPANY_DOC_TYPES.map((t) => <option key={t} value={t}>{labelOf(dt, 'type', t)}</option>)}
                    </select>
                    <select className={styles.filterSelect} value={status} onChange={(e) => setStatus(e.target.value)} aria-label={dt('filterStatus')} data-testid="filter-status">
                        <option value="">{dt('filterStatus')}：{dt('all')}</option>
                        {STATUSES.map((s) => <option key={s} value={s}>{labelOf(dt, 'status', s)}</option>)}
                    </select>
                    <label className={styles.checkbox}>
                        <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} data-testid="include-archived" />
                        {dt('includeArchived')}
                    </label>
                </div>
                <div className={shellStyles.toolbarRight}>
                    <div className={shellStyles.searchWrap}>
                        <Search className={shellStyles.searchIcon} size={15} strokeWidth={2} />
                        <input className={shellStyles.searchInput} placeholder={dt('search')} value={q} onChange={(e) => setQ(e.target.value)} data-testid="documents-search" />
                    </div>
                    {canCreate && (
                        <button type="button" className={shellStyles.addNewButton} onClick={() => setRegistering(true)} data-testid="register-document">
                            + {dt('addDocument')}
                        </button>
                    )}
                </div>
            </div>

            <div className={shellStyles.content}>
                {loading && <p className={shellStyles.loadingNote}>{dt('loading')}</p>}
                {error && !loading && <div className={shellStyles.errorBanner} role="alert">{dt('loadFailed')}</div>}
                {!loading && !error && list.length === 0 && (
                    <p className={styles.muted} data-testid="documents-empty">{debouncedQ.trim() || docType || status ? dt('emptySearch') : dt('empty')}</p>
                )}
                {!loading && !error && list.length > 0 && (
                    <DataTable columns={columns} data={list} searchKey="" onRowClick={(row) => openDetail(row.id)} getRowId={(row) => row.id} />
                )}
            </div>

            {registering && <DocumentMetaDialog onClose={() => setRegistering(false)} onSaved={(doc) => onRegistered(doc)} />}
        </div>
    );
};

export default DocumentsRegister;
