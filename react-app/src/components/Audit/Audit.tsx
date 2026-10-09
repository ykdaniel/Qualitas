import React, { useState, useMemo, useDeferredValue, useEffect, useCallback } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useAuditStore, AuditItem } from '../../store/auditStore';
import { useProjectStore } from '../../store/projectStore';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './Audit.module.css';
import shellStyles from '../Shared/ModuleShell.module.css';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import AuditWizard from './AuditWizard';
import VendorStatsPanel from './VendorStatsPanel';
import ScheduleMatrix from './ScheduleMatrix';
import { Search, Plus, AlertCircle, X } from 'lucide-react';

const Audit: React.FC = () => {
    const { t } = useLanguage();
    const { hasPermission } = useAuth();
    const { auditList, deleteAudit, error, clearError, loading } = useAuditStore();
    const [searchQuery, setSearchQuery] = useState<string>('');
    // Deferred value prevents search typing from lagging due to expensive re-renders
    const deferredSearchQuery = useDeferredValue(searchQuery);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentAuditId, setCurrentAuditId] = useState<string | null>(null);
    const contractors = useContractorsStore(state => state.contractors);
    const [selectedVendorFilter, setSelectedVendorFilter] = useState<string | null>(null);

    // Get active contractors — depend on the contractors array itself so memo
    // recomputes once the store finishes fetching.
    const activeContractors = useMemo(
        () => contractors.filter(c => c.status === 'active'),
        [contractors]
    );

    useEffect(() => {
        useContractorsStore.getState().fetchContractors();
    }, []);

    // Audits are not part of AppProviders' preloadProjectScopedData, so this page re-fetches its
    // own list whenever the header's project changes (same as FollowUpIssue.tsx); auditStore's
    // fetch sequence discards a superseded response.
    const currentScopeId = useProjectStore(s => s.currentProject?.id ?? '__all__');
    useEffect(() => {
        useAuditStore.getState().fetchAudits();
    }, [currentScopeId]);

    // 1. Compute Vendor Statistics (Unaffected by SearchQuery to keep left panel stable)
    const { vendorStats, maxAudits } = useMemo(() => {
        const stats: Record<string, number> = {};
        auditList.forEach(audit => {
            if (audit.contractor) {
                stats[audit.contractor] = (stats[audit.contractor] || 0) + 1;
            }
        });
        const counts = Object.values(stats);
        return {
            vendorStats: stats,
            maxAudits: counts.length > 0 ? Math.max(...counts) : 1
        };
    }, [auditList]);

    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
        isOpen: false,
        id: null,
        message: '',
    });

    // Calendar logic — month view
    const [viewDate, setViewDate] = useState(new Date());

    const changeMonth = useCallback((offset: number) => {
        setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    }, []);

    const setToday = useCallback(() => {
        setViewDate(new Date());
    }, []);

    // 2. Compute Filtered Data (Affected by vendor select & deferred search query)
    const filteredData = useMemo(() => {
        let data = auditList;

        if (selectedVendorFilter) {
            data = data.filter(item => item.contractor === selectedVendorFilter);
        }

        if (deferredSearchQuery.trim()) {
            const query = deferredSearchQuery.toLowerCase();
            data = data.filter(item =>
                (item.auditNo && item.auditNo.toLowerCase().includes(query)) ||
                (item.title && item.title.toLowerCase().includes(query)) ||
                (item.auditor && item.auditor.toLowerCase().includes(query)) ||
                (item.location && item.location.toLowerCase().includes(query)) ||
                (item.date && item.date.toLowerCase().includes(query)) ||
                (item.contractor && item.contractor.toLowerCase().includes(query)) ||
                (item.status && item.status.toLowerCase().includes(query))
            );
        }

        return data;
    }, [auditList, deferredSearchQuery, selectedVendorFilter]);

    // 3. Matrix Computation — every day of the viewed month
    const matrixDates = useMemo(() => {
        const today = new Date();
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        return Array.from({ length: daysInMonth }, (_, i) => {
            const date = new Date(year, month, i + 1);
            return {
                date,
                isToday: date.toDateString() === today.toDateString(),
                isWeekend: date.getDay() === 0 || date.getDay() === 6,
                dayLabel: date.toLocaleDateString('en-US', { weekday: 'short' }),
                dateLabel: `${date.getDate()}`,
            };
        });
    }, [viewDate]);

    const getAuditForMatrix = useCallback((vendorName: string, date: Date) => {
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return auditList.find(a => a.contractor === vendorName && a.date === dateStr);
    }, [auditList]);

    // Vendors to show as rows: only Active contractors that have at least one audit.
    // Sorted ascending by earliest audit date. Each vendor is also flagged
    // pastUnfinished=true if any of its audits is past-due AND not Completed/Closed,
    // so the matrix can highlight that row.
    const SCHEDULE_VENDOR_LIMIT = 5;
    const FINISHED_STATUSES = new Set(['Completed', 'Closed']);
    const scheduleVendors = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayMs = today.getTime();
        const base = activeContractors.filter(v => (vendorStats[v.name] || 0) > 0);
        const earliestDateMs = (vendorName: string) => {
            const dates = auditList
                .filter(a => a.contractor === vendorName && a.date)
                .map(a => new Date(a.date).getTime())
                .filter(t => !isNaN(t));
            return dates.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...dates);
        };
        const hasPastUnfinished = (vendorName: string) =>
            auditList.some(a =>
                a.contractor === vendorName &&
                a.date &&
                new Date(a.date).getTime() < todayMs &&
                !FINISHED_STATUSES.has(a.status)
            );
        const sorted = [...base]
            .map(v => ({ ...v, pastUnfinished: hasPastUnfinished(v.name) }))
            .sort((a, b) => earliestDateMs(a.name) - earliestDateMs(b.name));
        if (selectedVendorFilter) return sorted.filter(v => v.name === selectedVendorFilter);
        return sorted.slice(0, SCHEDULE_VENDOR_LIMIT);
    }, [vendorStats, selectedVendorFilter, activeContractors, auditList]);

    // Actions
    const handleAddNew = useCallback(() => {
        setCurrentAuditId(null);
        setIsEditModalOpen(true);
    }, []);

    const handleEdit = useCallback((id: string) => {
        setCurrentAuditId(id);
        setIsEditModalOpen(true);
    }, []);

    // handleReport removed — report generation not yet implemented

    const handleDeleteClick = useCallback((id: string) => {
        setDeleteModal({ isOpen: true, id, message: t('audit.confirmDelete') || 'Are you sure you want to delete this audit?' });
    }, [t]);

    const handleDeleteConfirm = async () => {
        if (!deleteModal.id) return;
        try {
            await deleteAudit(deleteModal.id);
        } catch {
            // auditStore has already put the (friendly) reason in this page's error banner
        } finally {
            setDeleteModal({ isOpen: false, id: null, message: '' });
        }
    };

    return (
        <div className={shellStyles.container}>
            {/* Error Notification Toast */}
            {error && (
                <div className={shellStyles.errorBanner}>
                    <div className={styles.errorContent}>
                        <AlertCircle size={18} />
                        <span>{error}</span>
                    </div>
                    <button onClick={clearError} className={styles.closeBtn} aria-label="Dismiss error">
                        <X size={16} />
                    </button>
                </div>
            )}

            <div className={shellStyles.toolbar}>
                <div className={shellStyles.toolbarRight}>
                    <div className={shellStyles.searchWrap}>
                        <Search size={15} className={shellStyles.searchIcon} strokeWidth={2} />
                        <input
                            type="text"
                            className={shellStyles.searchInput}
                            placeholder={t('audit.searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    {hasPermission('audit:create:all') && (
                        <button className={shellStyles.addNewButton} onClick={handleAddNew}>
                            <Plus size={16} />
                            {t('audit.addNew') || 'Add New'}
                        </button>
                    )}
                </div>
            </div>

            {/* Premium Top Section: Interactive Panels */}
            <div className={styles.topSection}>
                <VendorStatsPanel
                    stats={vendorStats}
                    maxAudits={maxAudits}
                    activeContractors={activeContractors}
                    selectedVendorFilter={selectedVendorFilter}
                    onSelectVendor={setSelectedVendorFilter}
                    totalAudits={auditList.length}
                    pastUnfinishedVendors={new Set(scheduleVendors.filter(v => v.pastUnfinished).map(v => v.name))}
                    t={t}
                />

                {/* Schedule Matrix Glass Panel */}
                <ScheduleMatrix
                    matrixDates={matrixDates}
                    vendors={scheduleVendors}
                    getAuditForMatrix={getAuditForMatrix}
                    viewDate={viewDate}
                    onChangeMonth={changeMonth}
                    onSetToday={setToday}
                    onEditAudit={handleEdit}
                    loading={loading}
                    t={t}
                />
            </div>

            {/* Audit Data Table Area */}
            <div className={shellStyles.content}>
                <DataTable
                    title={t('audit.listTitle')}
                    columns={createColumns(handleEdit, handleDeleteClick, t, activeContractors, hasPermission('audit:delete:all'))}
                    data={filteredData}
                    searchKey=""
                    getRowId={(row: AuditItem) => row.id}
                    onRowClick={(row: AuditItem) => handleEdit(row.id)}
                />
            </div>

            {/* Edit / Detail Wizard Modal */}
            {isEditModalOpen && (
                <AuditWizard
                    auditId={currentAuditId}
                    existingItem={currentAuditId ? auditList.find(item => item.id === currentAuditId) : undefined}
                    // Closed / Void are true dead ends (WorkflowEngine's "Closed": [] /
                    // "Void": []) — the wizard locks those itself from the record's
                    // status, unconditionally, matching audit_service.py. Here: an
                    // existing record is also read-only for anyone without
                    // audit:update:all (the backend refuses their save anyway).
                    readOnly={currentAuditId ? !hasPermission('audit:update:all') : false}
                    onClose={() => {
                        setIsEditModalOpen(false);
                        setCurrentAuditId(null);
                    }}
                    onSaveSuccess={() => {
                        setIsEditModalOpen(false);
                        setCurrentAuditId(null);
                    }}
                />
            )}

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={t('common.confirmDeleteTitle')}
                message={deleteModal.message}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteModal({ isOpen: false, id: null, message: '' })}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
            />
        </div>
    );
};

export default Audit;
