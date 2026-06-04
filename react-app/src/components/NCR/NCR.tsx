import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Clock, CheckCircle2, BarChart3, Zap, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

import { useNCRStore } from '../../store/ncrStore';
import type { NCRItem } from '../../store/ncrStore';
import { useITRStore } from '../../store/itrStore';
import { checkNCRReferences, generateDeleteMessage } from '../../utils/cascadeDelete';
import ConfirmModal from '../Shared/ConfirmModal';
import shellStyles from '../Shared/ModuleShell.module.css';
import { NCRDetailModal, NCRDetailData, PendingUploads } from './NCRModals';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { useDebounce } from '../../hooks/useDebounce';
import { uploadFiles, deleteFile } from '../../services/api';
import { useNCRStats } from '../../hooks/useNCRStats';
import { getErrorMessage } from '../../utils/errorUtils';

type StatusFilter = 'all' | 'open' | 'inProgress' | 'resolved' | 'closed' | 'void';

const NCR: React.FC = () => {
  const { t } = useLanguage();

  const { ncrList, loading, error, refetch, addNCR, updateNCR, deleteNCR } = useNCRStore();
  const itrList = useITRStore(state => state.itrList);

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 500);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  React.useEffect(() => {
    refetch({ search: debouncedSearch });
  }, [debouncedSearch, refetch]);

  const filteredList = useMemo(() => {
    if (statusFilter === 'all') return ncrList;
    const target = ({
      open: 'open',
      inProgress: 'in progress',
      resolved: 'resolved',
      closed: 'closed',
      void: 'void',
    } as const)[statusFilter];
    return ncrList.filter((item) => (item.status || '').toLowerCase() === target);
  }, [ncrList, statusFilter]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentNcrId, setCurrentNcrId] = useState<string | null>(null);

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
    isOpen: false,
    id: null,
    message: '',
  });

  const statistics = useNCRStats(ncrList);

  const handleEdit = React.useCallback((id: string) => {
    setCurrentNcrId(id);
    setIsEditModalOpen(true);
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    const openId = searchParams.get('openId');
    if (!openId) return;
    if (ncrList.length === 0) return;
    const match = ncrList.find(item => item.id === openId || item.documentNumber === openId);
    if (!match) return;
    handleEdit(match.id);
    deepLinkAppliedRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('openId');
    setSearchParams(next, { replace: true });
  }, [searchParams, ncrList, handleEdit, setSearchParams]);

  const handleAddNew = () => {
    setCurrentNcrId('new');
    setIsEditModalOpen(true);
  };

  const handleSaveNCRDetails = async (details: NCRDetailData, pendingUploads: PendingUploads[], deletedFileIds: string[]) => {
    if (currentNcrId) {
      const isNew = currentNcrId === 'new';
      const existingItem = isNew ? undefined : ncrList.find(item => item.id === currentNcrId);

      const updatedItem: Record<string, unknown> = {
        vendor: details.contractor || '',
        description: details.subject || details.detailsDescription || '',
        rev: '',
        submit: 'v',
        status: details.status || 'Open',
        remark: details.remark || '',
        hasDetails: true,
        raiseDate: details.raiseDate,
        closeoutDate: details.closeoutDate,
        aconex: details.aconex,
        type: details.type,
        subject: details.subject,
        foundBy: details.foundBy,
        raisedBy: details.raisedBy,
        foundLocation: details.foundLocation,
        productDisposition: details.productDisposition,
        productIntegrityRelated: details.productIntegrityRelated,
        permanentProductDeviation: details.permanentProductDeviation,
        impactToOM: details.impactToOM,
        noiNumber: details.noiNumber,
        itrNumber: details.itrNumber,
        defectPhotos: details.defectPhotos,
        improvementPhotos: details.improvementPhotos,
        attachments: details.attachments,
        referenceStandards: details.referenceStandards,
        serialNumbers: details.serialNumbers,
        repairMethodStatement: details.repairMethodStatement,
        immediateCorrectionAction: details.immediateCorrectionAction,
        rootCauseAnalysis: details.rootCauseAnalysis,
        correctiveActions: details.correctiveActions,
        preventiveAction: details.preventiveAction,
        finalProductIntegrityStatement: details.finalProductIntegrityStatement,
        reInspectionNumber: details.reInspectionNumber,
        projectQualityManager: details.projectQualityManager,
        // NCR field-model improvements (BACKLOG #13). closedBy / verifiedBy /
        // effectivenessVerifiedBy are stamped server-side, so not sent here.
        severity: details.severity || undefined,
        discipline: details.discipline || undefined,
        assignedTo: details.assignedTo ?? undefined,
        effectivenessVerified: details.effectivenessVerified || undefined,
        effectivenessVerifiedDate: details.effectivenessVerifiedDate || undefined,
        effectivenessNotes: details.effectivenessNotes || undefined,
        // NCR formal-report fields (BACKLOG #15)
        drawingNo: details.drawingNo || undefined,
        specNo: details.specNo || undefined,
        poContract: details.poContract || undefined,
        wbs: details.wbs || undefined,
        lineNo: details.lineNo || undefined,
        weldJointNo: details.weldJointNo || undefined,
        heatBatchNo: details.heatBatchNo || undefined,
        qtyAffected: details.qtyAffected || undefined,
        extent: details.extent || undefined,
        costScheduleImpact: details.costScheduleImpact || undefined,
        requirement: details.requirement || undefined,
        asFound: details.asFound || undefined,
        deviation: details.deviation || undefined,
        concessionNo: details.concessionNo || undefined,
        rcaMethod: details.rcaMethod || undefined,
        directCause: details.directCause || undefined,
        recurrence: details.recurrence || undefined,
        recurrenceRef: details.recurrenceRef || undefined,
        correctiveActionOwner: details.correctiveActionOwner || undefined,
        correctiveActionTargetDate: details.correctiveActionTargetDate || undefined,
        preventiveActionOwner: details.preventiveActionOwner || undefined,
        preventiveActionTargetDate: details.preventiveActionTargetDate || undefined,
      };

      try {
        let targetId = currentNcrId;
        if (existingItem) {
          await updateNCR(currentNcrId, updatedItem);
        } else {
          const newNCR = await addNCR(updatedItem as Omit<NCRItem, 'id'>);
          targetId = newNCR.id;
        }

        if (deletedFileIds && deletedFileIds.length > 0) {
          for (const fileId of deletedFileIds) {
            try {
              await deleteFile(fileId);
            } catch (error) {
              console.error('Error deleting file:', fileId, error);
            }
          }
        }

        if (pendingUploads && pendingUploads.length > 0) {
          for (const uploadGroup of pendingUploads) {
            if (uploadGroup.files.length > 0) {
              try {
                await uploadFiles('ncr', targetId, uploadGroup.files, uploadGroup.category);
              } catch (error) {
                console.error(`Error uploading files for category ${uploadGroup.category}:`, error);
                toast.error(`Failed to upload some files for ${uploadGroup.category}.`);
              }
            }
          }
        }

        await refetch();

        setIsEditModalOpen(false);
        setCurrentNcrId(null);
      } catch (error: any) {
        const detail = getErrorMessage(error, t('common.saveFailed'));
        toast.error(detail);
      }
    }
  };

  const confirmDelete = React.useCallback((id: string) => {
    const ncr = ncrList.find(item => item.id === id);
    if (!ncr) return;

    const references = checkNCRReferences(id, ncr.documentNumber, itrList);
    const message = generateDeleteMessage('NCR', ncr.documentNumber, references.references, t);

    setDeleteModal({ isOpen: true, id, message });
  }, [ncrList, itrList, t]);

  const handleDelete = async () => {
    if (deleteModal.id) {
      await deleteNCR(deleteModal.id);
      setDeleteModal({ isOpen: false, id: null, message: '' });
    }
  };

  const columns = useMemo(() => createColumns(confirmDelete, t), [t, confirmDelete]);

  const chips: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: t('common.all') || 'All', count: statistics.total },
    { id: 'open', label: t('obs.statOpen') || 'Open', count: statistics.open },
    { id: 'inProgress', label: t('status.inProgress') || 'In Progress', count: statistics.inProgress },
    { id: 'resolved', label: t('status.resolved') || 'Resolved', count: statistics.resolved },
    { id: 'closed', label: t('obs.statClosed') || 'Closed', count: statistics.closed },
    { id: 'void', label: t('itp.status.void') || 'Void', count: statistics.void },
  ];

  const summary = [
    {
      key: 'open',
      label: t('obs.statOpen') || 'Open',
      value: statistics.opening,
      icon: <Clock size={18} strokeWidth={1.8} />,
      accent: '#c8753f',
    },
    {
      key: 'closed',
      label: t('obs.statClosed') || 'Closed',
      value: statistics.closed,
      icon: <CheckCircle2 size={18} strokeWidth={1.8} />,
      accent: '#7a8f5a',
    },
    {
      key: 'total',
      label: t('obs.statTotal') || 'Total',
      value: statistics.total,
      icon: <BarChart3 size={18} strokeWidth={1.8} />,
      accent: '#8a6a3a',
    },
    {
      key: 'rate',
      label: t('obs.statOpenRate') || 'Open Rate',
      value: `${statistics.openRate}%`,
      icon: <Zap size={18} strokeWidth={1.8} />,
      accent: '#b8945a',
    },
  ];

  return (
    <div className={shellStyles.container}>
      {error && (
        <div className={shellStyles.errorBanner}>
          <span>{error}</span>
          <button type="button" className={shellStyles.retryButton} onClick={() => refetch()}>
            {t('common.retry')}
          </button>
        </div>
      )}

      <section className={shellStyles.summaryGrid}>
        {summary.map((card) => (
          <div
            key={card.key}
            className={shellStyles.summaryCard}
            style={{ '--accent': card.accent } as React.CSSProperties}
          >
            <div className={shellStyles.summaryIcon}>{card.icon}</div>
            <div className={shellStyles.summaryBody}>
              <div className={shellStyles.summaryLabel}>{card.label}</div>
              <div className={shellStyles.summaryValue}>{card.value}</div>
            </div>
          </div>
        ))}
      </section>

      <div className={shellStyles.toolbar}>
        <div className={shellStyles.chipGroup}>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`${shellStyles.chip} ${statusFilter === chip.id ? shellStyles.chipActive : ''}`}
              onClick={() => setStatusFilter(chip.id)}
            >
              {chip.label}
              <span className={shellStyles.chipCount}>{chip.count}</span>
            </button>
          ))}
        </div>
        <div className={shellStyles.toolbarRight}>
          <div className={shellStyles.searchWrap}>
            <Search size={15} className={shellStyles.searchIcon} strokeWidth={2} />
            <input
              type="text"
              className={shellStyles.searchInput}
              placeholder={t('ncr.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button type="button" className={shellStyles.addNewButton} onClick={handleAddNew}>
            {t('ncr.addNew')}
          </button>
        </div>
      </div>

      {loading && (
        <div className={shellStyles.loadingNote}>{t('common.loading')}</div>
      )}

      <div className={shellStyles.content}>
        <DataTable
          columns={columns}
          data={filteredList}
          searchKey=""
          getRowClassName={(row) => {
            const s = (row.status || '').toLowerCase();
            if (s === 'closed') return shellStyles.rowDim;
            if (s === 'void') return shellStyles.rowDim;
            return '';
          }}
          onRowClick={(row) => handleEdit(row.id)}
        />
      </div>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={t('common.confirmDeleteTitle')}
        message={deleteModal.message || t('ncr.confirmDelete')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal({ isOpen: false, id: null, message: '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />

      {isEditModalOpen && currentNcrId && (
        <NCRDetailModal
          ncrId={currentNcrId}
          existingItem={currentNcrId !== 'new' ? ncrList.find(item => item.id === currentNcrId) : undefined}
          onSave={handleSaveNCRDetails}
          onClose={() => {
            setIsEditModalOpen(false);
            setCurrentNcrId(null);
          }}
        />
      )}
    </div>
  );
};

export default NCR;
