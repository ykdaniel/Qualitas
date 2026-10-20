/**
 * Inline PDF of a document version (KM-DOCS-2026-001 D2). The file is fetched with the API client (so the Authorization
 * header applies — an <iframe> cannot send one) and shown from a blob URL, which is revoked when the version changes or
 * the viewer unmounts. Browsers without an inline PDF viewer still get the download / open-in-tab buttons.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { documentsApi } from '../../services/documentsApi';
import { useDocumentsText } from './documentsText';
import styles from './Documents.module.css';

interface Props {
    documentId: string;
    versionId: string;
    fileName: string;
    /** the toolbar's left text (e.g. "Rev1.0 · current") */
    caption?: React.ReactNode;
}

const PdfViewer: React.FC<Props> = ({ documentId, versionId, fileName, caption }) => {
    const dt = useDocumentsText();
    // the fetched file, keyed by the version it belongs to: a result for another version counts as "still loading"
    const key = `${documentId}/${versionId}`;
    const [result, setResult] = useState<{ key: string; url: string | null; failed: boolean } | null>(null);

    useEffect(() => {
        let cancelled = false;
        let objectUrl: string | null = null;
        documentsApi.downloadBlob(documentId, versionId, 'pdf').then((blob) => {
            if (cancelled) return;
            objectUrl = URL.createObjectURL(blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }));
            setResult({ key, url: objectUrl, failed: false });
        }).catch(() => {
            if (!cancelled) setResult({ key, url: null, failed: true });
        });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [documentId, versionId, key]);

    const current = result && result.key === key ? result : null;
    const state: 'loading' | 'ready' | 'failed' = !current ? 'loading' : current.failed ? 'failed' : 'ready';
    const url = current?.url ?? null;

    return (
        <div className={styles.pdfCard} data-testid="pdf-viewer">
            <div className={styles.pdfToolbar}>
                <span>{caption}</span>
                <span className={styles.actionRow}>
                    <button type="button" className={styles.smallButton} disabled={!url} onClick={() => url && window.open(url, '_blank', 'noopener')}>
                        {dt('openInNewTab')}
                    </button>
                    <button type="button" className={styles.smallButton} onClick={() => documentsApi.download(documentId, versionId, 'pdf', fileName).catch(() => toast.error(dt('downloadFailed')))}>
                        {dt('downloadPdf')}
                    </button>
                </span>
            </div>
            {state === 'loading' && <div className={styles.emptyState}><p>{dt('pdfLoading')}</p></div>}
            {state === 'failed' && <div className={styles.emptyState} role="alert"><p>{dt('pdfLoadFailed')}</p></div>}
            {state === 'ready' && url && <iframe className={styles.pdfFrame} src={url} title={fileName} />}
        </div>
    );
};

export default PdfViewer;
