import React, { useState, useMemo, useDeferredValue, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
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

// Rows shown in the schedule (all of them when a vendor is selected).
const SCHEDULE_VENDOR_LIMIT = 5;
// Statuses that need no further work: a past-dated audit in any OTHER status flags its contractor
// as overdue. Void (cancelled) is settled too — it is never going to be carried out.
const SETTLED_STATUSES = new Set(['Completed', 'Closed', 'Void']);

// 'YYYY-MM-DD' as a LOCAL date (new Date('YYYY-MM-DD') is UTC midnight: the previous day west of UTC).
const parseLocalDate = (value: string): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

const Audit: React.FC = () => {
    const { t, language } = useLanguage();
    const locale = language === 'zh' ? 'zh-TW' : 'en-US';
    const { hasPermission } = useAuth();
    const { auditList, deleteAudit, error, clearError, loading } = useAuditStore();
    const [searchQuery, setSearchQuery] = useState<string>('');
    // Deferred value prevents search typing from lagging due to expensive re-renders
    const deferredSearchQuery = useDeferredValue(searchQuery);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentAuditId, setCurrentAuditId] = useState<string | null>(null);
    // Contractor names from GET /audit/contractors (audit:view is enough), not the contractors store —
    // that one needs contractors:view:all, so audit-only roles used to get an empty vendor panel/schedule.
    const contractors = useAuditStore(state => state.contractorOptions);
    const [selectedVendorFilter, setSelectedVendorFilter] = useState<string | null>(null);

    // Get active contractors — depend on the contractors array itself so memo
    // recomputes once the store finishes fetching.
    const activeContractors = useMemo(
        () => contractors.filter(c => c.status === 'active'),
        [contractors]
    );

    useEffect(() => {
        useAuditStore.getState().fetchContractorOptions();
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
                dayLabel: date.toLocaleDateString(locale, { weekday: 'short' }),
                dateLabel: `${date.getDate()}`,
            };
        });
    }, [viewDate, locale]);

    const getAuditForMatrix = useCallback((vendorName: string, date: Date) => {
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return auditList.find(a => a.contractor === vendorName && a.date === dateStr);
    }, [auditList]);

    // Contractors with a past-dated audit that is not settled (see SETTLED_STATUSES). Computed over
    // ALL contractors: the stats panel highlights every one of them, not only the schedule's first rows.
    const pastUnfinishedVendors = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const names = new Set<string>();
        auditList.forEach(a => {
            const d = parseLocalDate(a.date);
            if (a.contractor && d && d < today && !SETTLED_STATUSES.has(a.status)) names.add(a.contractor);
        });
        return names;
    }, [auditList]);

    // Vendors to show as rows: only Active contractors that have at least one audit,
    // sorted ascending by earliest audit date and flagged pastUnfinished for highlighting.
    const scheduleVendors = useMemo(() => {
        const base = activeContractors.filter(v => (vendorStats[v.name] || 0) > 0);
        const earliestDateMs = (vendorName: string) => {
            const dates = auditList
                .filter(a => a.contractor === vendorName)
                .map(a => parseLocalDate(a.date)?.getTime())
                .filter((ms): ms is number => ms !== undefined);
            return dates.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...dates);
        };
        const sorted = [...base]
            .map(v => ({ ...v, pastUnfinished: pastUnfinishedVendors.has(v.name) }))
            .sort((a, b) => earliestDateMs(a.name) - earliestDateMs(b.name));
        if (selectedVendorFilter) return sorted.filter(v => v.name === selectedVendorFilter);
        return sorted.slice(0, SCHEDULE_VENDOR_LIMIT);
    }, [vendorStats, selectedVendorFilter, activeContractors, auditList, pastUnfinishedVendors]);

    // Actions
    const handleAddNew = useCallback(() => {
        setCurrentAuditId(null);
        setIsEditModalOpen(true);
    }, []);

    const handleEdit = useCallback((id: string) => {
        setCurrentAuditId(id);
        setIsEditModalOpen(true);
    }, []);

    // ?openId=<id or auditNo> (e.g. from Follow Up Issues) opens that audit once the list has it —
    // same pattern as NOI/NCR/ITR. Closing a deep-linked audit goes back to where the user came from.
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const deepLinkAppliedRef = useRef(false);
    const openedViaDeepLinkRef = useRef(false);
    useEffect(() => {
        if (deepLinkAppliedRef.current) return;
        const openId = searchParams.get('openId');
        if (!openId || auditList.length === 0) return;
        const match = auditList.find(item => item.id === openId || item.auditNo === openId);
        if (!match) return;
        handleEdit(match.id);
        openedViaDeepLinkRef.current = true;
        deepLinkAppliedRef.current = true;
        const next = new URLSearchParams(searchParams);
        next.delete('openId');
        setSearchParams(next, { replace: true });
    }, [searchParams, auditList, handleEdit, setSearchParams]);

    const closeWizard = () => {
        setIsEditModalOpen(false);
        setCurrentAuditId(null);
        if (openedViaDeepLinkRef.current) {
            openedViaDeepLinkRef.current = false;
            navigate(-1);
        }
    };

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

    // While the wizard is open, printing must show only the wizard (it is an overlay ON this page).
    const hideWhenPrintingWizard = isEditModalOpen ? ' no-print' : '';

    return (
        <div className={shellStyles.container}>
            {/* Error Notification Toast */}
            {error && (
                <div className={shellStyles.errorBanner + hideWhenPrintingWizard}>
                    <div className={styles.errorContent}>
                        <AlertCircle size={18} />
                        <span>{error}</span>
                    </div>
                    <button onClick={clearError} className={styles.closeBtn} aria-label="Dismiss error">
                        <X size={16} />
                    </button>
                </div>
            )}

            <div className={shellStyles.toolbar + hideWhenPrintingWizard}>
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
            <div className={styles.topSection + hideWhenPrintingWizard}>
                <VendorStatsPanel
                    stats={vendorStats}
                    maxAudits={maxAudits}
                    activeContractors={activeContractors}
                    selectedVendorFilter={selectedVendorFilter}
                    onSelectVendor={setSelectedVendorFilter}
                    totalAudits={auditList.length}
                    pastUnfinishedVendors={pastUnfinishedVendors}
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
                    locale={locale}
                    t={t}
                />
            </div>

            {/* Audit Data Table Area */}
            <div className={shellStyles.content + hideWhenPrintingWizard}>
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
                    existingItem={currentAuditId ? auditList.find(item => item.id === currentAuditId) : undefined}
                    // Closed / Void are true dead ends (WorkflowEngine's "Closed": [] /
                    // "Void": []) — the wizard locks those itself from the record's
                    // status, unconditionally, matching audit_service.py. Here: an
                    // existing record is also read-only for anyone without
                    // audit:update:all (the backend refuses their save anyway).
                    readOnly={currentAuditId ? !hasPermission('audit:update:all') : false}
                    canUpdate={hasPermission('audit:update:all')}
                    onClose={closeWizard}
                    onSaveSuccess={closeWizard}
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
