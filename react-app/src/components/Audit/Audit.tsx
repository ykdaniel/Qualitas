import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useAuditStore } from '../../store/auditStore';
import type { AuditItem } from '../../store/auditStore';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './Audit.module.css';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { AuditEditModal } from './AuditModals';
import { BackButton } from '@/components/ui/BackButton';

const Audit: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { auditList, loading, error, addAudit, updateAudit, deleteAudit } = useAuditStore();
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentAuditId, setCurrentAuditId] = useState<string | null>(null);
    const { getActiveContractors } = useContractorsStore();
    const [selectedVendorFilter, setSelectedVendorFilter] = useState<string | null>(null);

    // Get active contractors
    const activeContractors = useMemo(() => getActiveContractors(), [getActiveContractors]);

    // Compute vendor stats and schedule
    // Note: This logic for the "Matrix" and "Vendor Panel" ignores Table filtering/sorting
    // enabling "View" consistency even when Table is filtered.
    const { vendorStats } = useMemo(() => {
        const stats: Record<string, number> = {};

        auditList.forEach(audit => {
            if (audit.contractor) {
                stats[audit.contractor] = (stats[audit.contractor] || 0) + 1;
            }
        });

        return { vendorStats: stats };
    }, [auditList]);

    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
        isOpen: false,
        id: null,
        message: '',
    });

    // Calendar logic
    const [viewDate, setViewDate] = useState(new Date());

    const changeMonth = (offset: number) => {
        setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const maxAudits = useMemo(() => {
        const counts = Object.values(vendorStats);
        return counts.length > 0 ? Math.max(...counts) : 1;
    }, [vendorStats]);

    // Prepare Base Data for Table
    // If Searching: Include all (filtered by vendor if selected)
    // If Not Searching: Include current Month only (filtered by vendor if selected)
    const tableBaseData = useMemo(() => {
        let data = auditList;

        if (selectedVendorFilter) {
            data = data.filter(item => item.contractor === selectedVendorFilter);
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            data = data.filter(item =>
                (item.auditNo && item.auditNo.toLowerCase().includes(query)) ||
                (item.title && item.title.toLowerCase().includes(query)) ||
                (item.auditor && item.auditor.toLowerCase().includes(query)) ||
                (item.location && item.location.toLowerCase().includes(query)) ||
                (item.date && item.date.toLowerCase().includes(query)) ||
                (item.contractor && item.contractor.toLowerCase().includes(query)) ||
                (item.status && item.status.toLowerCase().includes(query))
            );
        } else {
            // Default: filter by current month/year if no search query
            data = data.filter(item => {
                const dateObj = new Date(item.date);
                return dateObj.getMonth() === viewDate.getMonth() &&
                    dateObj.getFullYear() === viewDate.getFullYear();
            });
        }

        return data;
    }, [auditList, searchQuery, selectedVendorFilter, viewDate]);

    // Matrix Logic (Filtered for Matrix View - which respects Search and Vendor, but crucially Month)
    // Actually, Matrix view is explicitly a Month View.
    // It should probably respect Vendor Filter.
    // It should separate from Table Search?
    // The original code used `filteredList` for Matrix, which INCLUDED SearchQuery.
    // I will replicate that behavior by creating a specific list for Matrix.
    const matrixList = useMemo(() => {
        // Matrix should ALWAYS be the viewDate month, filtered by Vendor.
        // If Search is active, should it limit the Matrix?
        // Original code: filteredList included date filter (if no search) OR search filter.
        // If I search "John", I might see items from other months. The Matrix would break/be weird if it tried to show them?
        // The Matrix Headers are derived from `matrixDates`, which comes from `filteredList`.
        // If `filteredList` has dates outside the month (due to search), the Matrix grows horizontally.
        // It seems safer to use `tableBaseData` for consistency, as `tableBaseData` mimics previous behavior.

        return tableBaseData;
    }, [tableBaseData]);

    const matrixDates = useMemo(() => {
        // Extract unique dates from the FILTERED list to show only relevant columns
        const uniqueDates = Array.from(new Set(matrixList.map(a => a.date)))
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

        return uniqueDates.map(dateStr => {
            const date = new Date(dateStr);
            return {
                date,
                isToday: date.toDateString() === new Date().toDateString(),
                isWeekend: date.getDay() === 0 || date.getDay() === 6,
                dayLabel: date.toLocaleDateString('en-US', { weekday: 'short' }),
                dateLabel: `${date.getMonth() + 1}/${date.getDate()}`
            };
        });
    }, [matrixList]);

    const getAuditForMatrix = (vendorName: string, date: Date) => {
        const dateStr = date.toISOString().split('T')[0];
        return auditList.find(a => a.contractor === vendorName && a.date === dateStr);
    };

    const handleAddNew = () => {
        const newId = String(Date.now());
        setCurrentAuditId(newId);
        setIsEditModalOpen(true);
    };

    const handleSaveAudit = async (updates: Partial<AuditItem>) => {
        if (currentAuditId) {
            const existingItem = auditList.find(item => item.id === currentAuditId);
            if (existingItem) {
                // 更新現有項目
                await updateAudit(currentAuditId, updates);
            } else {
                // 新增項目
                const newItem: Omit<AuditItem, 'id'> = {
                    auditNo: updates.auditNo || '', // 讓後端自動依規則產生
                    title: updates.title || '',
                    date: updates.date || '',
                    auditor: updates.auditor || '',
                    status: updates.status || 'Planned',
                    location: updates.location || '',
                    findings: updates.findings || '',
                    contractor: updates.contractor || '',
                };
                await addAudit(newItem);
            }
        }
    };

    const handleEdit = (id: string) => {
        setCurrentAuditId(id);
        setIsEditModalOpen(true);
    };

    const handleReport = (id: string) => {
        // TODO: Navigate to Audit Report page or open report modal
        console.log('Open report for audit:', id);
        // For now, you can navigate to a report page:
        // navigate(`/audit/${id}/report`);
        alert(`Audit Report for ID: ${id}`);
    };

    const handleDeleteClick = (id: string) => {
        setDeleteModal({ isOpen: true, id, message: t('audit.confirmDelete') || 'Are you sure you want to delete this audit?' });
    };

    const handleDeleteConfirm = async () => {
        if (deleteModal.id) {
            await deleteAudit(deleteModal.id);
            setDeleteModal({ isOpen: false, id: null, message: '' });
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <BackButton />
                    <h1>{t('audit.title')}</h1>
                </div>
                <div className={styles.headerRight}>
                    {/* Status filter moved to TableHeader, visual vendor filter remains. */}
                    <div className={styles.searchContainer}>
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder={t('audit.searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className={styles.topSection}>
                {/* Left: Vendor Statistics (Visual) */}
                <div className={styles.panel}>
                    <div className={styles.panelTitle}>
                        <span>{t('common.contractor') || 'Vendors'}</span>
                        <span style={{ fontSize: '12px', fontWeight: 400 }}>{t('audit.total')}: {auditList.length}</span>
                    </div>
                    <div className={styles.vendorList}>
                        <div
                            className={`${styles.vendorItem} ${selectedVendorFilter === null ? styles.active : ''}`}
                            onClick={() => setSelectedVendorFilter(null)}
                        >
                            <div className={styles.vendorHeader}>
                                <span className={styles.vendorName}>{t('common.all')}</span>
                                <span className={styles.auditCount}>{auditList.length}</span>
                            </div>
                            <div className={styles.chartTrack}>
                                <div className={styles.chartBar} style={{ width: '100%' }}></div>
                            </div>
                        </div>
                        {activeContractors.map(vendor => {
                            const count = vendorStats[vendor.name] || 0;
                            const percentage = (count / maxAudits) * 100;
                            return (
                                <div
                                    key={vendor.id}
                                    className={`${styles.vendorItem} ${selectedVendorFilter === vendor.name ? styles.active : ''}`}
                                    onClick={() => setSelectedVendorFilter(vendor.name === selectedVendorFilter ? null : vendor.name)}
                                >
                                    <div className={styles.vendorHeader}>
                                        <span className={styles.vendorName}>{vendor.name}</span>
                                        <span className={styles.auditCount}>{count}</span>
                                    </div>
                                    <div className={styles.chartTrack}>
                                        <div
                                            className={styles.chartBar}
                                            style={{
                                                width: `${percentage}%`,
                                                background: selectedVendorFilter === vendor.name ? 'linear-gradient(90deg, #059669, #10b981)' : ''
                                            }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right: Audit Matrix View (Visual) */}
                <div className={styles.panel}>
                    <div className={styles.panelTitle}>
                        <span>{t('audit.schedule')}</span>
                        <div className={styles.navGroup}>
                            <button className={styles.navBtn} onClick={() => changeMonth(-1)}>&lt;</button>
                            <button className={styles.navBtn} onClick={() => setViewDate(new Date())}>{t('common.today')}</button>
                            <button className={styles.navBtn} onClick={() => changeMonth(1)}>&gt;</button>
                        </div>
                    </div>

                    <div className={styles.matrixContainer}>
                        <div className={styles.matrixNav}>
                            <div className={styles.monthDisplay}>
                                {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                            </div>
                        </div>

                        <div className={styles.matrixScroll}>
                            <table className={styles.matrixTable}>
                                <thead>
                                    <tr>
                                        <th className={`${styles.matrixHeaderCell} ${styles.indexCorner}`}>
                                            #
                                        </th>
                                        <th className={`${styles.matrixHeaderCell} ${styles.corner}`}>
                                            {t('common.contractor')}
                                        </th>
                                        {matrixDates.map((d, i) => (
                                            <th key={i} className={`${styles.matrixHeaderCell} ${d.isToday ? styles.today : ''}`}>
                                                <span className={styles.dayLabel}>{d.dayLabel}</span>
                                                <span className={styles.dateLabel}>{d.dateLabel}</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(selectedVendorFilter ? activeContractors.filter(v => v.name === selectedVendorFilter) : activeContractors).map((vendor, vIdx) => (
                                        <tr key={vendor.id} className={styles.matrixRow}>
                                            <td className={styles.indexStickyCell}>{vIdx + 1}</td>
                                            <td className={styles.vendorStickyCell}>{vendor.name}</td>
                                            {matrixDates.map((d, i) => {
                                                const audit = getAuditForMatrix(vendor.name, d.date);
                                                return (
                                                    <td
                                                        key={i}
                                                        className={`${styles.matrixCell} ${d.isToday ? styles.today : ''} ${d.isWeekend ? styles.weekend : ''}`}
                                                    >
                                                        {audit && (
                                                            <div
                                                                className={`${styles.auditIndicator} ${audit.status.toLowerCase().replace(' ', '')} ${styles.iconIndicator}`}
                                                                title={`${audit.auditNo}: ${audit.title}`}
                                                                onClick={() => handleEdit(audit.id)}
                                                            >
                                                                {audit.status === 'Planned' ? (
                                                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                                                        <line x1="16" y1="2" x2="16" y2="6"></line>
                                                                        <line x1="8" y1="2" x2="8" y2="6"></line>
                                                                        <line x1="3" y1="10" x2="21" y2="10"></line>
                                                                    </svg>
                                                                ) : audit.status === 'In Progress' ? (
                                                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                                                                        {/* Left Shoe Print */}
                                                                        <path d="M8 5c-1.8 0-3 1.5-3 4s1.2 3.5 3 3.5 3-1 3-3.5-1.2-4-3-4z" />
                                                                        <path d="M8 13.5c-1.2 0-2 .5-2 1.5s.8 1.5 2 1.5 2-.5 2-1.5-.8-1.5-2-1.5z" />

                                                                        {/* Right Shoe Print */}
                                                                        <path d="M16 10c-1.8 0-3 1.5-3 4s1.2 3.5 3 3.5 3-1 3-3.5-1.2-4-3-4z" />
                                                                        <path d="M16 18.5c-1.2 0-2 .5-2 1.5s.8 1.5 2 1.5 2-.5 2-1.5-.8-1.5-2-1.5z" />
                                                                    </svg>
                                                                ) : audit.status === 'Completed' ? (
                                                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                                        <polyline points="20 6 9 17 4 12"></polyline>
                                                                    </svg>
                                                                ) : audit.status === 'Closed' ? (
                                                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                                                    </svg>
                                                                ) : (
                                                                    audit.auditNo.split('-').pop()
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.content}>
                <DataTable
                    title={t('audit.listTitle')}
                    actions={
                        <button
                            className={styles.addNewButton}
                            onClick={handleAddNew}
                        >
                            {t('audit.addNew')}
                        </button>
                    }
                    columns={createColumns(handleEdit, handleDeleteClick, handleReport, t, activeContractors)}
                    data={tableBaseData}
                    searchKey=""
                    getRowClassName={() => styles.normalRow}
                    getRowId={(row) => row.id}
                    onRowClick={(row) => handleEdit(row.id)}
                />
            </div>

            {
                isEditModalOpen && currentAuditId && (
                    <AuditEditModal
                        auditId={currentAuditId}
                        existingItem={auditList.find(item => item.id === currentAuditId)}
                        onSave={handleSaveAudit}
                        onClose={() => {
                            setIsEditModalOpen(false);
                            setCurrentAuditId(null);
                        }}
                    />
                )
            }

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={t('common.confirmDeleteTitle')}
                message={deleteModal.message}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteModal({ isOpen: false, id: null, message: '' })}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
            />
        </div >
    );
};

export default Audit;
