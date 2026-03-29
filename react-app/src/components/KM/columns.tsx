import { ColumnDef } from '@tanstack/react-table';
import { KMArticle } from '../../types/km';

export const createColumns = (
    onDelete: (id: string) => void,
    t: (key: string) => string
): ColumnDef<KMArticle>[] => [
        {
            accessorKey: 'articleNo',
            header: t('km.articleNo') || 'Article No.',
        },
        {
            accessorKey: 'title',
            header: t('km.titleField') || 'Title',
            cell: ({ row }) => (
                <div style={{ fontWeight: 500, color: '#0f172a' }}>{row.original.title}</div>
            ),
        },
        {
            accessorKey: 'category',
            header: t('km.category') || 'Category',
            cell: ({ row }) => (
                <span style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    backgroundColor: '#e0f2fe',
                    color: '#0369a1',
                    fontSize: '0.875rem'
                }}>
                    {row.original.category || 'General'}
                </span>
            ),
        },
        {
            accessorKey: 'tags',
            header: t('km.tags') || 'Tags',
            cell: ({ row }) => {
                if (!row.original.tags) return '-';
                const tagsList = row.original.tags.split(',').map(tag => tag.trim());
                return (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {tagsList.map(tag => (
                            <span key={tag} style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: '#f1f5f9',
                                color: '#475569',
                                fontSize: '0.75rem',
                                border: '1px solid #e2e8f0'
                            }}>
                                {tag}
                            </span>
                        ))}
                    </div>
                );
            },
        },
        {
            accessorKey: 'status',
            header: t('common.status') || 'Status',
            cell: ({ row }) => {
                const status = row.original.status || 'Published';
                let color = '#22c55e'; // default green
                if (status === 'Draft') color = '#f59e0b';
                if (status === 'Archived') color = '#64748b';

                return (
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: color,
                        fontWeight: 500
                    }}>
                        <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: color
                        }} />
                        {status}
                    </span>
                );
            },
        },
        {
            accessorKey: 'created_at',
            header: t('common.createdAt') || 'Created At',
        },
        {
            id: 'actions',
            header: t('common.actions') || 'Actions',
            cell: ({ row }) => {
                return (
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(row.original.id); }}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#ef4444',
                                padding: '4px'
                            }}
                            title={t('common.delete') || 'Delete'}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                );
            },
        },
    ];
