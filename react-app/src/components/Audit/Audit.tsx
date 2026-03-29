import React, { useState, useMemo, useDeferredValue, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useAuditStore, AuditItem } from '../../store/auditStore';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './Audit.module.css';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import AuditWizard from './AuditWizard';
import { BackButton } from '@/components/ui/BackButton';
import VendorStatsPanel from './VendorStatsPanel';
import ScheduleMatrix from './ScheduleMatrix';
import { Search, Plus, AlertCircle, X } from 'lucide-react';

const Audit: React.FC = () => {
    const { t } = useLanguage();
    const { auditList, deleteAudit, error, clearError, loading } = useAuditStore();
    const [searchQuery, setSearchQuery] = useState<string>('');
    // Deferred value prevents search typing from lagging due to expensive re-renders
    const deferredSearchQuery = useDeferredValue(searchQuery);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentAuditId, setCurrentAuditId] = useState<string | null>(null);
    const { getActiveContractors } = useContractorsStore();
    const [selectedVendorFilter, setSelectedVendorFilter] = useState<string | null>(null);

    // Get active contractors
    const activeContractors = useMemo(() => getActiveContractors(), [getActiveContractors]);

    useEffect(() => {
        useAuditStore.getState().fetchAudits();
        useContractorsStore.getState().fetchContractors();
    }, []);

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

    // Calendar logic
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

    // 3. Matrix Computation
    const matrixDates = useMemo(() => {
        const validDates = Array.from(new Set(filteredData.map(a => a.date)))
            .filter(dateStr => dateStr && !isNaN(new Date(dateStr).getTime()))
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

        return validDates.map(dateStr => {
            const date = new Date(dateStr);
            return {
                date,
                isToday: date.toDateString() === new Date().toDateString(),
                isWeekend: date.getDay() === 0 || date.getDay() === 6,
                dayLabel: date.toLocaleDateString('en-US', { weekday: 'short' }),
                dateLabel: `${date.getMonth() + 1}/${date.getDate()}`
            };
        });
    }, [filteredData]);

    const getAuditForMatrix = useCallback((vendorName: string, date: Date) => {
        const dateStr = date.toISOString().split('T')[0];
        return auditList.find(a => a.contractor === vendorName && a.date === dateStr);
    }, [auditList]);

    // Actions
    const handleAddNew = useCallback(() => {
        setCurrentAuditId(String(Date.now()));
        setIsEditModalOpen(true);
    }, []);

    const handleEdit = useCallback((id: string) => {
        setCurrentAuditId(id);
        setIsEditModalOpen(true);
    }, []);

    const handleReport = useCallback((id: string) => {
        toast.info(`Audit Report for ID: ${id}`);
    }, []);

    const handleDeleteClick = useCallback((id: string) => {
        setDeleteModal({ isOpen: true, id, message: t('audit.confirmDelete') || 'Are you sure you want to delete this audit?' });
    }, [t]);

    const handleDeleteConfirm = async () => {
        if (deleteModal.id) {
            await deleteAudit(deleteModal.id);
            setDeleteModal({ isOpen: false, id: null, message: '' });
        }
    };

    return (
        <div className={styles.container}>
            {/* Header Area */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <BackButton />
                    <h1>{t('audit.title')}</h1>
                </div>
                
                <div className={styles.searchContainer}>
                    <Search className={styles.searchIcon} size={18} />
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder={t('audit.searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Error Notification Toast */}
            {error && (
                <div className={styles.errorAlert}>
                    <div className={styles.errorContent}>
                        <AlertCircle size={20} />
                        <span>{error}</span>
                    </div>
                    <button onClick={clearError} className={styles.closeBtn}>
                        <X size={20} />
                    </button>
                </div>
            )}

            {/* Premium Top Section: Interactive Panels */}
            <div className={styles.topSection}>
                {/* Vendor Stats Glass Panel */}
                <VendorStatsPanel 
                    stats={vendorStats}
                    maxAudits={maxAudits}
                    activeContractors={activeContractors}
                    selectedVendorFilter={selectedVendorFilter}
                    onSelectVendor={setSelectedVendorFilter}
                    totalAudits={auditList.length}
                    t={t}
                />

                {/* Schedule Matrix Glass Panel */}
                <ScheduleMatrix 
                    matrixDates={matrixDates}
                    vendors={selectedVendorFilter 
                        ? activeContractors.filter(v => v.name === selectedVendorFilter)
                        : activeContractors.filter(v => (vendorStats[v.name] || 0) > 0)
                    }
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
            <div className={styles.content}>
                <DataTable
                    title={t('audit.listTitle')}
                    actions={
                        <button className={styles.addNewButton} onClick={handleAddNew}>
                            <Plus size={18} />
                            {t('audit.addNew') || 'Add New'}
                        </button>
                    }
                    columns={createColumns(handleEdit, handleDeleteClick, handleReport, t, activeContractors)}
                    data={filteredData}
                    searchKey=""
                    getRowClassName={() => styles.normalRow}
                    getRowId={(row: AuditItem) => row.id}
                    onRowClick={(row: AuditItem) => handleEdit(row.id)}
                />
            </div>

            {/* Edit / Detail Wizard Modal */}
            {isEditModalOpen && (
                <AuditWizard
                    auditId={currentAuditId}
                    existingItem={auditList.find(item => item.id === currentAuditId)}
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
