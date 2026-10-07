import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, CheckCircle2, BarChart3, Zap, Search, Ban } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';

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
import { runSaveFlow, sameWrite, SaveOutcome } from '../../utils/saveFlow';
import { describeSaveError } from '../../utils/saveErrors';

type StatusFilter = 'all' | 'open' | 'inProgress' | 'resolved' | 'closed' | 'void';

const NCR: React.FC = () => {
  const { t } = useLanguage();
  const { hasPermission } = useAuth();

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
  // The last successful record write of the open modal (id + serialized payload) — see runSaveFlow / sameWrite.
  const lastWriteRef = useRef<{ id: string; key: string } | null>(null);

  const handleEdit = React.useCallback((id: string) => {
    lastWriteRef.current = null;
    setCurrentNcrId(id);
    setIsEditModalOpen(true);
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const deepLinkAppliedRef = useRef(false);
  // Set true only when the currently-open modal was reached via ?openId=
  // (e.g. from Follow Up Issues) — lets onClose send the user back where
  // they came from via browser history instead of just landing on this
  // page's plain list, which is otherwise indistinguishable from having
  // navigated here directly from the sidebar.
  const openedViaDeepLinkRef = useRef(false);
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    const openId = searchParams.get('openId');
    if (!openId) return;
    if (ncrList.length === 0) return;
    const match = ncrList.find(item => item.id === openId || item.documentNumber === openId);
    if (!match) return;
    handleEdit(match.id);
    openedViaDeepLinkRef.current = true;
    deepLinkAppliedRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('openId');
    setSearchParams(next, { replace: true });
  }, [searchParams, ncrList, handleEdit, setSearchParams]);

  const handleAddNew = () => {
    lastWriteRef.current = null;
    setCurrentNcrId('new');
    setIsEditModalOpen(true);
  };

  const fileSteps = {
    upload: (id: string, group: { category: string; files: File[] }) => uploadFiles('ncr', id, group.files, group.category),
    remove: deleteFile,
    reload: async () => { await refetch(); return !useNCRStore.getState().error; },
    describe: (e: unknown) => describeSaveError(e, t),
  };

  // Retry of the unfinished file steps only. The record is stored already; it is NOT written again (an account with create but
  // without update permission could not do that anyway, and the retry must never create it a second time).
  const handleRetryNCRFiles = async (pendingUploads: PendingUploads[], deletedFileIds: string[]): Promise<SaveOutcome> => {
    const id = lastWriteRef.current?.id;
    if (!id) return { status: 'failed', message: t('common.saveFailed') };
    return runSaveFlow({
      writeRecord: async () => { throw new Error('a file retry never writes the record'); },
      reuseId: id,
      uploads: pendingUploads,
      deletedFileIds,
      ...fileSteps,
    });
  };

  const handleSaveNCRDetails = async (details: NCRDetailData, pendingUploads: PendingUploads[], deletedFileIds: string[]): Promise<SaveOutcome> => {
    if (currentNcrId) {
      const isNew = currentNcrId === 'new';
      const existingItem = isNew ? undefined : ncrList.find(item => item.id === currentNcrId);

      const updatedItem: Record<string, unknown> = {
        vendor: details.contractor || '',
        description: details.subject || details.deviation || details.detailsDescription || '',
        rev: '',
        submit: 'v',
        status: details.status || 'Open',
        remark: details.remark || '',
        hasDetails: true,
        raiseDate: details.raiseDate,
        dueDate: details.dueDate,
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
        progressPhotos: details.progressPhotos,
        improvementPhotos: details.improvementPhotos,
        attachments: details.attachments,
        referenceStandards: details.referenceStandards,
        serialNumbers: details.serialNumbers,
        repairMethodStatement: details.repairMethodStatement,
        // Sent as-is (not `|| undefined`) so clearing a status to '' actually
        // reaches the backend — axios drops undefined keys entirely, which
        // would make the auto-clear-on-type behavior never persist.
        repairMethodStatementStatus: details.repairMethodStatementStatus,
        immediateCorrectionAction: details.immediateCorrectionAction,
        immediateCorrectionActionStatus: details.immediateCorrectionActionStatus,
        rootCauseAnalysis: details.rootCauseAnalysis,
        rootCauseAnalysisStatus: details.rootCauseAnalysisStatus,
        correctiveActions: details.correctiveActions,
        correctiveActionsStatus: details.correctiveActionsStatus,
        preventiveAction: details.preventiveAction,
        preventiveActionStatus: details.preventiveActionStatus,
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
        effectivenessNotesStatus: details.effectivenessNotesStatus,
        // NCR formal-report fields (BACKLOG #15)
        drawingNo: details.drawingNo || undefined,
        specNo: details.specNo || undefined,
        poContract: details.poContract || undefined,
        wbs: details.wbs || undefined,
        lineNo: details.lineNo || undefined,
        weldJointNo: details.weldJointNo || undefined,
        heatBatchNo: details.heatBatchNo || undefined,
        qtyAffected: details.qtyAffected || undefined,
        // No `|| undefined` below: these can be legitimately cleared back to
        // '' (e.g. the disposition-change effect resets ownerApproval*), and
        // axios drops `undefined` keys entirely — that silently kept the old
        // stale value on the backend instead of persisting the clear.
        qtyAffectedUnit: details.qtyAffectedUnit,
        extent: details.extent || undefined,
        costScheduleImpact: details.costScheduleImpact || undefined,
        requirement: details.requirement || undefined,
        asFound: details.asFound || undefined,
        deviation: details.deviation || undefined,
        concessionNo: details.concessionNo || undefined,
        ownerApproval: details.ownerApproval,
        ownerApprovalBy: details.ownerApprovalBy,
        ownerApprovalDate: details.ownerApprovalDate,
        ownerApprovalNotes: details.ownerApprovalNotes,
        rcaMethod: details.rcaMethod || undefined,
        directCause: details.directCause || undefined,
        directCauseStatus: details.directCauseStatus,
        recurrence: details.recurrence || undefined,
        recurrenceRef: details.recurrenceRef || undefined,
        correctiveActionOwner: details.correctiveActionOwner || undefined,
        correctiveActionTargetDate: details.correctiveActionTargetDate || undefined,
        preventiveActionOwner: details.preventiveActionOwner || undefined,
        preventiveActionTargetDate: details.preventiveActionTargetDate || undefined,
      };

      // A retry after "saved, but a file step failed" with unchanged content must not write the record again.
      const outcome = await runSaveFlow({
        writeRecord: async () => {
          if (existingItem) {
            await updateNCR(currentNcrId, updatedItem);
            return currentNcrId;
          }
          return (await addNCR(updatedItem as Omit<NCRItem, 'id'>)).id;
        },
        reuseId: sameWrite(lastWriteRef.current, currentNcrId, updatedItem) ? currentNcrId : null,
        uploads: pendingUploads,
        deletedFileIds,
        ...fileSteps,
        onRecordSaved: (id) => { lastWriteRef.current = { id, key: JSON.stringify(updatedItem) }; },
      });
      // The record exists now: a retry must update it, never create it again.
      if (outcome.status === 'saved-incomplete' && isNew) setCurrentNcrId(outcome.id);
      return outcome;
    }
    return { status: 'failed', message: t('common.saveFailed') };
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

  // A failed load is not "zero records": with an error and nothing loaded the counts are unknown and are shown as "—".
  const loadFailed = !!error && ncrList.length === 0;
  const shown = <T,>(v: T): T | string => (loadFailed ? '—' : v);

  const chips: { id: StatusFilter; label: string; count: number | string }[] = [
    { id: 'all', label: t('common.all') || 'All', count: shown(statistics.total) },
    { id: 'open', label: t('obs.statOpen') || 'Open', count: shown(statistics.open) },
    { id: 'inProgress', label: t('status.inProgress') || 'In Progress', count: shown(statistics.inProgress) },
    { id: 'resolved', label: t('status.resolved') || 'Resolved', count: shown(statistics.resolved) },
    { id: 'closed', label: t('obs.statClosed') || 'Closed', count: shown(statistics.closed) },
    { id: 'void', label: t('itp.status.void') || 'Void', count: shown(statistics.void) },
  ];

  const summary = [
    {
      key: 'open',
      label: t('obs.statOpen') || 'Open',
      value: shown(statistics.opening),
      icon: <Clock size={18} strokeWidth={1.8} />,
      accent: '#c8753f',
    },
    {
      key: 'closed',
      label: t('obs.statClosed') || 'Closed',
      value: shown(statistics.closed),
      icon: <CheckCircle2 size={18} strokeWidth={1.8} />,
      accent: '#7a8f5a',
    },
    {
      key: 'void',
      label: t('itp.status.void') || 'Void',
      value: shown(statistics.void),
      icon: <Ban size={18} strokeWidth={1.8} />,
      accent: '#9aa0a8',
    },
    {
      key: 'total',
      label: t('obs.statTotal') || 'Total',
      value: shown(statistics.total),
      icon: <BarChart3 size={18} strokeWidth={1.8} />,
      accent: '#8a6a3a',
    },
    {
      key: 'rate',
      label: t('obs.statOpenRate') || 'Open Rate',
      value: shown(`${statistics.openRate}%`),
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
          {hasPermission('ncr:create:all') && (
            <button type="button" className={shellStyles.addNewButton} onClick={handleAddNew}>
              {t('ncr.addNew')}
            </button>
          )}
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

      {isEditModalOpen && currentNcrId && (() => {
        const editingItem = currentNcrId !== 'new' ? ncrList.find(item => item.id === currentNcrId) : undefined;
        // Read-only when the user lacks edit rights, or the record is locked
        // (Closed/Void) and they lack the higher close/reopen permission.
        const status = (editingItem?.status || '').toLowerCase();
        const locked = status === 'closed' || status === 'void';
        const canEdit = currentNcrId === 'new'
          ? hasPermission('ncr:create:all')
          : locked ? hasPermission('ncr:close:all') : hasPermission('ncr:update:all');
        return (
          <NCRDetailModal
            ncrId={currentNcrId}
            existingItem={editingItem}
            readOnly={!canEdit}
            onSave={handleSaveNCRDetails}
            onRetryFiles={handleRetryNCRFiles}
            attachmentsAllowed={hasPermission('ncr:update:all')}
            onClose={() => {
              lastWriteRef.current = null;
              if (openedViaDeepLinkRef.current) {
                openedViaDeepLinkRef.current = false;
                navigate(-1);
                return;
              }
              setIsEditModalOpen(false);
              setCurrentNcrId(null);
            }}
          />
        );
      })()}
    </div>
  );
};

export default NCR;
