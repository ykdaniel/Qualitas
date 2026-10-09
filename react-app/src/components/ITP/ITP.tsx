import React, { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, Send, TrendingUp, ShieldCheck, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useITPStore } from '../../store/itpStore';
import type { ITPItem } from '../../store/itpStore';
import { useNOIStore } from '../../store/noiStore';
import { useChecklistStore } from '../../store/checklistStore';
import { checkITPReferences, checkITPChecklistReferences, generateDeleteMessage } from '../../utils/cascadeDelete';
import { uploadFiles, deleteFile } from '../../services/api';
import { classifyDeleteResults } from '../../utils/attachmentOutcome';
import { getErrorMessage } from '../../utils/errorUtils';
import ConfirmModal from '../Shared/ConfirmModal';
import styles from './ITP.module.css';
import shellStyles from '../Shared/ModuleShell.module.css';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns } from './columns';
import { ITPDetailModal, type SaveOutcome, ItpMainSavedError } from './ITPModals';
import { useDebounce } from '../../hooks/useDebounce';
import { useITPStats } from '../../hooks/useITPStats';

type StatusFilter =
  | 'all'
  | 'approved'
  | 'approvedWithComments'
  | 'pending'
  | 'noSubmit'
  | 'reviseResubmit'
  | 'rejected'
  | 'void';

const ITP: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('itp:create:all');
  const canUpdate = hasPermission('itp:update:all');
  const { getActiveContractors } = useContractorsStore();
  const { itpList, loading, error, refetch, addITP, updateITP, updateITPDetail, deleteITP } = useITPStore();
  const noiList = useNOIStore(state => state.noiList);
  const checklistList = useChecklistStore(state => state.records);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const debouncedSearch = useDebounce(searchQuery, 500);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  React.useEffect(() => {
    refetch({ search: debouncedSearch });
  }, [debouncedSearch, refetch]);

  const filteredList = useMemo(() => {
    if (statusFilter === 'all') return itpList;
    return itpList.filter((item) => {
      const s = (item.status || '').toLowerCase();
      switch (statusFilter) {
        case 'approved': return s === 'approved';
        case 'approvedWithComments': return s === 'approved with comments';
        case 'pending': return s === 'pending';
        case 'noSubmit': return s === 'no submit' || s === 'nosubmit';
        case 'reviseResubmit': return s === 'revise & resubmit' || s === 'revise and resubmit';
        case 'rejected': return s === 'rejected';
        case 'void': return s === 'void';
        default: return true;
      }
    });
  }, [itpList, statusFilter]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentItpId, setCurrentItpId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
    isOpen: false,
    id: null,
    message: '',
  });

  const statistics = useITPStats(itpList);

  const handleEdit = React.useCallback((id: string) => {
    setCurrentItpId(id);
    setIsEditModalOpen(true);
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
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
    if (itpList.length === 0) return;
    const match = itpList.find(item => item.id === openId || item.referenceNo === openId);
    if (!match) return;
    handleEdit(match.id);
    openedViaDeepLinkRef.current = true;
    deepLinkAppliedRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('openId');
    setSearchParams(next, { replace: true });
  }, [searchParams, itpList, handleEdit, setSearchParams]);

  // Nothing is written to the backend here — clicking "Add New" only opens a blank form.
  // The record is created on the FIRST Save/Publish click (see onSave below), so opening the
  // form and then Cancelling sends no request and leaves no row behind, and someone who only
  // holds itp:create:all (no itp:update:all) can still complete a create: the first save uses
  // addITP (create), never updateITP.
  const [newItpDefaultVendor, setNewItpDefaultVendor] = useState('');
  const handleAddNew = () => {
    const activeContractors = getActiveContractors();
    setNewItpDefaultVendor(activeContractors.length > 0 ? activeContractors[0].name : '');
    setCurrentItpId(null);
    setIsEditModalOpen(true);
  };

  const confirmDelete = React.useCallback((id: string) => {
    const itp = itpList.find(item => item.id === id);
    if (!itp) return;

    const noiReferences = checkITPReferences(id, noiList);
    const checklistReferences = checkITPChecklistReferences(id, checklistList);
    const allReferences = [
      ...noiReferences.references,
      ...checklistReferences.references,
    ];
    const message = generateDeleteMessage('ITP', itp.referenceNo || itp.id, allReferences, t);

    setDeleteModal({ isOpen: true, id, message });
  }, [itpList, noiList, checklistList, t]);

  const handleDelete = async () => {
    if (deleteModal.id) {
      try {
        await deleteITP(deleteModal.id);
        setDeleteModal({ isOpen: false, id: null, message: '' });
      } catch (error: any) {
        if (error?.response?.status === 401) return;
        toast.error(t('itp.deleteError'));
      }
    }
  };

  const columns = useMemo(() => createColumns(
    confirmDelete,
    navigate,
    t,
    getActiveContractors(),
    noiList,
  ), [t, getActiveContractors, noiList, navigate, confirmDelete]);

  const chips: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: t('common.all') || 'All', count: itpList.length },
    { id: 'approved', label: t('itp.status.approved'), count: statistics.approved },
    { id: 'approvedWithComments', label: t('itp.status.approvedWithComments'), count: statistics.approvedWithComments },
    { id: 'pending', label: t('itp.status.pending'), count: statistics.pending },
    { id: 'noSubmit', label: t('itp.status.noSubmit'), count: statistics.noSubmit },
    { id: 'reviseResubmit', label: t('itp.status.reviseResubmit'), count: statistics.reviseResubmit },
    { id: 'rejected', label: t('itp.status.rejected'), count: statistics.rejected },
    { id: 'void', label: t('itp.status.void'), count: statistics.void },
  ];

  const summary = [
    {
      key: 'total',
      label: t('pqp.total') || 'Total',
      value: statistics.total,
      icon: <BarChart3 size={18} strokeWidth={1.8} />,
      accent: '#8a6a3a',
    },
    {
      key: 'submission',
      label: t('itp.stats.submission'),
      value: statistics.submission,
      icon: <Send size={18} strokeWidth={1.8} />,
      accent: '#7a8f5a',
    },
    {
      key: 'submissionMaturity',
      label: t('itp.stats.submissionMaturity'),
      value: `${statistics.submissionMaturity}%`,
      icon: <TrendingUp size={18} strokeWidth={1.8} />,
      accent: '#b8945a',
    },
    {
      key: 'approvalMaturity',
      label: t('itp.stats.approvalMaturity'),
      value: `${statistics.approvalMaturity}%`,
      icon: <ShieldCheck size={18} strokeWidth={1.8} />,
      accent: '#c8753f',
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
              placeholder={t('itp.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {canCreate && (
            <button type="button" className={shellStyles.addNewButton} onClick={handleAddNew}>
              {t('itp.addNew')}
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
          getRowClassName={(row) =>
            `group ${(row.status || '').toLowerCase() === 'void' ? shellStyles.rowDim : ''}`
          }
          getRowId={(row) => row.id}
          onRowClick={(row) => handleEdit(row.id)}
        />
      </div>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={t('common.confirmDeleteTitle')}
        message={deleteModal.message || t('itp.confirmDelete')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal({ isOpen: false, id: null, message: '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />

      {isEditModalOpen && (
        <ITPDetailModal
          itpId={currentItpId}
          existingItem={currentItpId ? itpList.find(item => item.id === currentItpId) : undefined}
          defaultVendor={newItpDefaultVendor}
          canApprove={hasPermission('itp:approve:all')}
          canVoid={hasPermission('itp:void:all')}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canCreateChecklist={hasPermission('checklist:create:all')}
          onApplyItems={async (detailPayload) => {
            if (!currentItpId) return false; // guarded by the modal itself (itpId falsy skips the call), kept here too for safety
            try {
              await updateITPDetail(currentItpId, detailPayload);
              refetch();
              return true;
            } catch (error: any) {
              if (error?.response?.status === 401) return false;
              toast.error(getErrorMessage(error, t('itp.updateError')));
              return false;
            }
          }}
          onSave={async (updates, details, pendingUploads, deletedFileIds, skipRecordWrite): Promise<SaveOutcome> => {
            // `workingId` — not the outer `currentItpId` — is used for every write below. On a
            // brand-new record's first save, `currentItpId` is still null in THIS closure (the
            // setCurrentItpId call below only takes effect on the next render), so every
            // subsequent step in this same call must use `workingId`, not `currentItpId`.
            let workingId = currentItpId;

            if (!workingId) {
              // Nothing exists on the backend yet — this is the record's first save. `details`
              // is folded directly into the CREATE payload (schemas.ITPCreate.detail_data
              // accepts it, stored as-is) rather than sent via a follow-up PUT /itp/{id}/detail —
              // this is not just simpler, it is REQUIRED: that detail endpoint is gated on
              // itp:update:all (confirmed via real isolated-backend testing), so a create-only
              // account's inspection-plan items would otherwise be silently lost on first save.
              // Folding it into the single POST means only itp:create:all is ever required to
              // complete a brand-new record's full first save (main fields + plan), and the
              // whole write is one atomic backend transaction — there is no "record created,
              // detail failed" partial state possible for a new record at all.
              const created = await addITP({ ...updates, detail_data: details } as Omit<ITPItem, 'id'>);
              workingId = created.id;
              setCurrentItpId(workingId);
            } else if (!skipRecordWrite) {
              // skipRecordWrite (set by ITPModals.tsx via isUnchangedSincePriorWrite: true when
              // JSON.stringify({payload, detailPayload}) is string-equal to the last successfully
              // written attempt's — a serialized-string comparison, not a semantic/deep-equality
              // one, so key order or formatting differences would NOT be treated as "unchanged")
              // — without this, retrying after an attachment-only failure re-sent the identical PUT
              // and created a second, real audit_logs UPDATE/UPDATE_DETAIL pair every time,
              // including for Publish (a confirmed duplicate-event bug: audit_logs rows went 0→2 on
              // the first Publish, then 2→4 on a retry that changed nothing else). A genuinely
              // changed payload produces a different serialized string, so it is never skipped.
              await updateITP(workingId, updates);
              if (details) {
                try {
                  await updateITPDetail(workingId, details);
                } catch (detailErr: any) {
                  // The main record IS already saved at this point — say so explicitly instead of
                  // letting a generic "save failed"/network-error toast imply nothing was saved.
                  // Thrown (not swallowed) so Phase 2 (attachments) below is never attempted this
                  // round: nothing about the pending upload/delete queue is touched or reported as
                  // done, and the modal stays open with isDirty still true (handleSave's own catch
                  // never reaches applyOutcome/setIsEditModalOpen when onSave throws). A retry
                  // resends both updateITP and updateITPDetail (skipRecordWrite's own key is never
                  // recorded on a throw), so it also picks up any further edit made before the
                  // retry, not just the detail write.
                  //
                  // Always uses the "unconfirmed" wording, never "not saved" — a response coming
                  // back (detailErr.response set, e.g. a 4xx/5xx) proves the backend REPLIED, not
                  // that it didn't write: services/itp_service.py::update_itp_detail commits, THEN
                  // logs/returns, so a failure after that commit (e.g. while building the
                  // response) would still reach the client as a 500 despite the write having
                  // already landed. A network failure with no response at all is the same
                  // "genuinely don't know" situation from the client's side. Distinguishing "the
                  // endpoint provably rejected before writing" from "provably wrote, then failed"
                  // would need auditing update_itp_detail's every failure path for exactly where
                  // it can throw relative to its commit — not done this batch, so every failure
                  // here is treated the same, conservative way. Never surfaces the raw underlying
                  // error text (e.g. a bare "Network Error" or a raw 500 body) as if it were a
                  // user-facing explanation.
                  const label = t('itp.mainSavedDetailUnconfirmed') || "The main ITP record was saved; the inspection plan's save result could not be confirmed — please check and retry";
                  throw new ItpMainSavedError(label);
                }
              }
            }

            // Phase 2: attachment housekeeping. The record's own fields are ALREADY saved by
            // this point — this never throws, it always returns a SaveOutcome describing
            // exactly what it confirmed, so the modal can prune its own queues per-item (see
            // PQP.tsx's onSave for the full reasoning on 404-vs-network-failure handling, which
            // this mirrors).
            let errors: string[] = [];
            let deletedIds: string[] = [];
            if (deletedFileIds && deletedFileIds.length > 0) {
              const uniqueIds = [...new Set(deletedFileIds)];
              const results = await Promise.allSettled(uniqueIds.map(id => deleteFile(id)));
              const classified = classifyDeleteResults(uniqueIds, results);
              deletedIds = classified.deletedIds;
              errors = classified.errors;
            }
            let uploadedPending = false;
            if (pendingUploads && pendingUploads.length > 0 && workingId) {
              try {
                await uploadFiles('itp', workingId, pendingUploads, 'attachment');
                uploadedPending = true;
              } catch (err: any) {
                const detail = err?.response?.data?.detail || err?.message;
                errors.push(`上傳附件：${detail || '上傳失敗'}`);
              }
            }

            if (errors.length === 0) {
              setIsEditModalOpen(false);
              setCurrentItpId(null);
            }
            // Reloading the list is a separate concern from whether the save itself succeeded —
            // its failure must not be reported as (or block) the save outcome above.
            try {
              await refetch();
            } catch (err) {
              console.error('ITP list refetch after save failed:', err);
            }
            return { deletedIds, uploadedPending, errors };
          }}
          onClose={() => {
            if (openedViaDeepLinkRef.current) {
              openedViaDeepLinkRef.current = false;
              navigate(-1);
              return;
            }
            setIsEditModalOpen(false);
            setCurrentItpId(null);
          }}
        />
      )}
    </div>
  );
};

export default ITP;
