import type { ColumnDef } from '@tanstack/react-table';
import { StatusBadge } from '../Shared/StatusBadge';
import type { DocumentSummary } from '../../types/documents';
import type { DocumentsTextKey } from './documentsText';
import styles from './Documents.module.css';

type T = (key: DocumentsTextKey, params?: Record<string, string | number>) => string;

const typeKey = (t: string): DocumentsTextKey => (`type.${t}` as DocumentsTextKey);
const statusKey = (s: string): DocumentsTextKey => (`status.${s}` as DocumentsTextKey);

/** a safe label: an unknown type / status shows its raw value instead of the key */
export const labelOf = (dt: T, prefix: 'type' | 'status', value: string | null | undefined): string => {
    if (!value) return '-';
    const key = (prefix === 'type' ? typeKey(value) : statusKey(value));
    const label = dt(key);
    return label === key ? value : label;
};

export const createDocumentColumns = (dt: T, showSnippet: boolean): ColumnDef<DocumentSummary>[] => [
    {
        accessorKey: 'doc_no',
        header: dt('colDocNo'),
        cell: ({ row }) => <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.85rem' }}>{row.original.doc_no}</span>,
    },
    {
        accessorKey: 'title_zh',
        header: dt('colTitle'),
        cell: ({ row }) => (
            <div>
                <div className={styles.titleCell}>
                    {row.original.title_zh}
                    {row.original.is_template && <span className={`${styles.pill} ${styles.pillTemplate}`}>{dt('template')}</span>}
                </div>
                {row.original.title_en && <div className={styles.titleEn}>{row.original.title_en}</div>}
                {showSnippet && row.original.snippet && (
                    <div className={styles.snippet} title={row.original.snippet}>{dt('snippetLabel')}{row.original.snippet}</div>
                )}
            </div>
        ),
    },
    {
        accessorKey: 'doc_type',
        header: dt('colType'),
        cell: ({ row }) => <span className={styles.pill}>{labelOf(dt, 'type', row.original.doc_type)}</span>,
    },
    {
        id: 'current_version',
        header: dt('colVersion'),
        accessorFn: (d) => d.current_version?.version_label ?? '',
        cell: ({ row }) => row.original.current_version?.version_label ?? <span className={styles.muted}>-</span>,
    },
    {
        accessorKey: 'status',
        header: dt('colStatus'),
        cell: ({ row }) => <StatusBadge status={row.original.status} label={labelOf(dt, 'status', row.original.status)} />,
    },
    {
        accessorKey: 'effective_date',
        header: dt('colEffective'),
        cell: ({ row }) => row.original.effective_date || <span className={styles.muted}>-</span>,
    },
    {
        accessorKey: 'updated_at',
        header: dt('colUpdated'),
        cell: ({ row }) => <span className={styles.muted}>{(row.original.updated_at || '').slice(0, 16)}</span>,
    },
];
