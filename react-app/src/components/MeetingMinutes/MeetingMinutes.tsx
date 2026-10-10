import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useMeetingMinutesStore } from '../../store/meetingMinutesStore';
import { useFollowUpStore } from '../../store/followUpStore';
import type { MeetingMinutesItem as ContextMeetingMinutesItem } from '../../store/meetingMinutesStore';
import shellStyles from '../Shared/ModuleShell.module.css';
import ConfirmModal from '../Shared/ConfirmModal';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns, createClosedItemsColumns, type ClosedItemRow } from './columns';
import { MeetingMinutesDetailModal, MeetingMinutesDetailData, ActionItemDraft, MeetingSaveResult, toActionItemPayload } from './MeetingMinutesModals';
import { useDebounce } from '../../hooks/useDebounce';
import { headingsOf, isItem, normalizeDiscussionLog } from './discussionLog';
import api, { uploadFiles } from '../../services/api';
import { getErrorMessage } from '../../utils/errorUtils';
import { describeSaveError } from '../../utils/saveErrors';
import { runSaveFlow, sameWrite } from '../../utils/saveFlow';

type StatusFilter = 'all' | 'draft' | 'published' | 'void';

// Statuses that lock a meeting: its fields are frozen and attachments are refused (core/attachment_access.py).
const LOCKING_STATUSES = ['Published', 'Void'];

const MeetingMinutes: React.FC = () => {
  const { t } = useLanguage();
  const { hasPermission } = useAuth();
  const { getActiveContractors } = useContractorsStore();
  const { meetingList, loading, error, refetch, addMeetingMinutes, updateMeetingMinutes, deleteMeetingMinutes } = useMeetingMinutesStore();

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 500);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [view, setView] = useState<'meetings' | 'closedItems'>('meetings');

  React.useEffect(() => {
    refetch({ search: debouncedSearch });
  }, [debouncedSearch, refetch]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
  // The last successful record write of the open modal (id + serialized payload) — see runSaveFlow / sameWrite.
  const lastWriteRef = useRef<{ id: string; key: string } | null>(null);
  // A meeting created by the open modal: whoever created it may finish its unfinished steps with create permission.
  const [createdHereId, setCreatedHereId] = useState<string | null>(null);
  const resetSaveState = () => {
    lastWriteRef.current = null;
    setCreatedHereId(null);
  };

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
    isOpen: false,
    id: null,
    message: '',
  });
  const [voidModal, setVoidModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
    isOpen: false,
    id: null,
    message: '',
  });

  const filteredList = useMemo(() => {
    if (statusFilter === 'all') return meetingList;
    return meetingList.filter((item) => (item.status || '').toLowerCase() === statusFilter);
  }, [meetingList, statusFilter]);

  // Closed discussion sub-items aggregated across every currently-loaded
  // meeting (client-side only — the data is already in `meetingList`, no
  // backend change needed). Mirrors the level/status filter used in
  // MeetingMinutesModals.tsx's Closed tab and the print report.
  const closedItems = useMemo<ClosedItemRow[]>(() => {
    const rows: ClosedItemRow[] = [];
    for (const meeting of meetingList) {
      // any stored shape (legacy two-level or the current register) — see discussionLog.ts
      const log = normalizeDiscussionLog(meeting.discussionLog);
      for (const item of log.filter(e => isItem(e) && e.status === 'Closed')) {
        rows.push({
          meetingId: meeting.id,
          documentNumber: meeting.documentNumber,
          meetingTitle: meeting.title || '',
          meetingDate: meeting.meetingDate || '',
          itemNo: item.no,
          content: item.content || '',
          owner: item.owner || '',
          topicTitle: headingsOf(log, item.no).join(' / '),
        });
      }
    }
    if (!debouncedSearch.trim()) return rows;
    const q = debouncedSearch.trim().toLowerCase();
    return rows.filter(r =>
      r.content.toLowerCase().includes(q) ||
      r.owner.toLowerCase().includes(q) ||
      r.topicTitle.toLowerCase().includes(q)
    );
  }, [meetingList, debouncedSearch]);

  const closedItemsColumns = useMemo(() => createClosedItemsColumns(t), [t]);

  const handleEdit = React.useCallback((id: string) => {
    // No save state to reset: every way the modal closes runs resetSaveState.
    setCurrentMeetingId(id);
    setIsEditModalOpen(true);
  }, []);

  // ?openId= deep-link support (e.g. clicking through from a Follow Up
  // Issues action item back to the meeting that produced it) — same
  // pattern as NOI.tsx.
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const deepLinkAppliedRef = useRef(false);
  const openedViaDeepLinkRef = useRef(false);
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    const openId = searchParams.get('openId');
    if (!openId) return;
    if (meetingList.length === 0) return;
    const match = meetingList.find(item => item.id === openId || item.documentNumber === openId);
    if (!match) return;
    handleEdit(match.id);
    openedViaDeepLinkRef.current = true;
    deepLinkAppliedRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('openId');
    setSearchParams(next, { replace: true });
  }, [searchParams, meetingList, handleEdit, setSearchParams]);

  const handleAddNew = () => {
    resetSaveState();
    setCurrentMeetingId('new');
    setIsEditModalOpen(true);
  };

  // Write the meeting, upload its attachments, create its action items, then set a Published/Void status — see
  // MeetingSaveResult. Built on the shared runSaveFlow contract (utils/saveFlow.ts, as NCR/OBS/NOI/OSD): once the
  // meeting is written its id replaces 'new' at once, so pressing Save again after a later step failed updates it
  // (or, unchanged, does not write it at all) and never creates a second meeting. It used to stay 'new', and every
  // retry created another meeting with a new number (MEETING-FIX-2026-001).
  const handleSaveMeetingDetails = async (details: MeetingMinutesDetailData, pendingFiles: File[], actionItemsDraft: ActionItemDraft[]): Promise<MeetingSaveResult> => {
    if (!currentMeetingId) return { status: 'failed', message: t('common.saveFailed') };
    const isNew = currentMeetingId === 'new';
    const targetStatus = details.status || 'Draft';
    // Published / Void lock the meeting: attachments would be refused and the form could no longer be saved to
    // finish anything. With attachments or action items still to send, write it as Draft and set the target status
    // only once they went through. Setting it afterwards needs update permission: an account that may only create
    // keeps the old one-step create for action items (they are not refused on a locked meeting), so it is never
    // left with a Draft it cannot publish. Its attachments need update permission anyway.
    const canUpdate = hasPermission('meeting:update:all');
    const deferStatus = LOCKING_STATUSES.includes(targetStatus)
      && (pendingFiles.length > 0 || (canUpdate && actionItemsDraft.length > 0));
    // documentNumber 由後端自動產生，新建時不送
    const payload: Record<string, unknown> = {
      vendor: details.contractor || undefined,
      status: deferStatus ? 'Draft' : targetStatus,
      rev: details.rev.trim() || undefined,
      title: details.title || undefined,
      meetingType: details.meetingType || undefined,
      meetingDate: details.meetingDate || undefined,
      meetingTime: details.meetingTime || undefined,
      meetingEndTime: details.meetingEndTime || undefined,
      location: details.location || undefined,
      organizer: details.organizer || undefined,
      attendees: details.attendees,
      discussionLog: details.discussionLog,
      attachments: details.attachments,
    };
    const describe = (e: unknown) => describeSaveError(e, t);
    const currentId = currentMeetingId;
    let documentNumber = '';
    const outcome = await runSaveFlow({
      writeRecord: async () => {
        if (isNew) {
          const created = await addMeetingMinutes(payload as Omit<ContextMeetingMinutesItem, 'id'>);
          documentNumber = created.documentNumber;
          return created.id;
        }
        await updateMeetingMinutes(currentId, payload);
        return currentId;
      },
      reuseId: sameWrite(lastWriteRef.current, currentId, payload) ? currentId : null,
      uploads: [{ category: 'attachment', files: pendingFiles }],
      deletedFileIds: [],
      upload: (id, group) => uploadFiles('meeting', id, group.files, group.category),
      remove: async () => { /* the meeting form never queues deletions */ },
      // The store already merged the saved record into the list; the list is re-fetched once everything is done.
      reload: async () => true,
      describe,
      onRecordSaved: (id) => {
        lastWriteRef.current = { id, key: JSON.stringify(payload) };
        if (isNew) {
          // The meeting exists now: from here on Save updates it, never creates it again.
          setCreatedHereId(id);
          setCurrentMeetingId(id);
        }
      },
    });
    if (outcome.status === 'failed') return { status: 'failed', message: outcome.message };

    const id = lastWriteRef.current?.id || currentId;
    if (!documentNumber) {
      documentNumber = useMeetingMinutesStore.getState().meetingList.find(m => m.id === id)?.documentNumber || '';
    }
    if (!documentNumber && actionItemsDraft.length > 0) {
      // the list may have been replaced by another fetch meanwhile — ask for the record itself
      try {
        documentNumber = (await api.get(`/meeting-minutes/${id}`)).data?.documentNumber || '';
      } catch { /* reported below as an unfinished step */ }
    }
    const unfinished: string[] = [];
    let attachmentsUploaded = true;
    if (outcome.status === 'saved-incomplete') {
      attachmentsUploaded = outcome.uploadedCategories.includes('attachment');
      for (const f of outcome.failures) {
        unfinished.push(t('saveFlow.step.upload', { what: t('saveFlow.category.attachment'), message: f.message }));
      }
    }

    // One by one, in order: the ones already created are dropped, so a retry never creates an action item twice.
    let remainingActionItems = actionItemsDraft;
    if (remainingActionItems.length > 0 && !documentNumber) {
      // never create a Follow Up that points at no meeting
      unfinished.push(t('meetingMinutes.stepActionItems', { n: remainingActionItems.length, message: t('common.saveFailed') }));
    }
    while (remainingActionItems.length > 0 && documentNumber) {
      try {
        await useFollowUpStore.getState().addFollowUp(toActionItemPayload(remainingActionItems[0], documentNumber, details.contractor) as any);
        remainingActionItems = remainingActionItems.slice(1);
      } catch (e) {
        unfinished.push(t('meetingMinutes.stepActionItems', { n: remainingActionItems.length, message: describe(e) }));
        break;
      }
    }

    if (deferStatus && unfinished.length === 0) {
      try {
        await updateMeetingMinutes(id, { status: targetStatus });
        lastWriteRef.current = null;
      } catch (e) {
        unfinished.push(t('meetingMinutes.stepStatus', { status: t(`meetingMinutes.status${targetStatus}`), message: describe(e) }));
      }
    } else if (deferStatus) {
      unfinished.push(t('meetingMinutes.stepStatus', { status: t(`meetingMinutes.status${targetStatus}`), message: t('meetingMinutes.stepStatusWaiting') }));
    }

    if (unfinished.length > 0) {
      return { status: 'saved-incomplete', documentNumber, unfinished, attachmentsUploaded, remainingActionItems };
    }
    setIsEditModalOpen(false);
    setCurrentMeetingId(null);
    resetSaveState();
    // Refresh so the newly-created meeting's documentNumber is available
    // if the user reopens it to add more action items.
    refetch({ search: debouncedSearch });
    return { status: 'saved' };
  };

  // The form's Void button (Published records): the status alone, like the list row's quick-void.
  const handleVoidFromModal = async () => {
    if (!currentMeetingId || currentMeetingId === 'new') return;
    await updateMeetingMinutes(currentMeetingId, { status: 'Void' });
    setIsEditModalOpen(false);
    setCurrentMeetingId(null);
    resetSaveState();
    refetch({ search: debouncedSearch });
  };

  const confirmDelete = React.useCallback((id: string) => {
    setDeleteModal({
      isOpen: true,
      id,
      message: t('common.deleteConfirmMessage', { item: 'Meeting Minutes' }),
    });
  }, [t]);

  // Quick-void directly from the list row, no need to open the record —
  // solves the common case (a mistaken/unused Draft you just want gone):
  // void then delete are now two clicks from the list instead of opening
  // the modal to change the status dropdown first.
  const confirmVoid = React.useCallback((id: string) => {
    setVoidModal({
      isOpen: true,
      id,
      message: t('meetingMinutes.confirmVoid'),
    });
  }, [t]);

  const columns = useMemo(() => createColumns(confirmDelete, confirmVoid, t, getActiveContractors), [t, getActiveContractors, confirmDelete, confirmVoid]);

  const handleDelete = async () => {
    if (deleteModal.id) {
      try {
        await deleteMeetingMinutes(deleteModal.id);
      } catch (err) {
        console.error('Failed to delete Meeting Minutes:', err);
        toast.error((err as Error)?.message || t('common.deleteFailed'));
      }
      setDeleteModal({ isOpen: false, id: null, message: '' });
    }
  };

  const handleVoid = async () => {
    if (voidModal.id) {
      try {
        await updateMeetingMinutes(voidModal.id, { status: 'Void' });
      } catch (err) {
        console.error('Failed to void Meeting Minutes:', err);
        toast.error(getErrorMessage(err, t('common.saveFailed')));
      }
      setVoidModal({ isOpen: false, id: null, message: '' });
    }
  };

  const chips: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: t('common.all') || 'All', count: meetingList.length },
    { id: 'draft', label: t('meetingMinutes.statusDraft') || 'Draft', count: meetingList.filter(m => (m.status || '').toLowerCase() === 'draft').length },
    { id: 'published', label: t('meetingMinutes.statusPublished') || 'Published', count: meetingList.filter(m => (m.status || '').toLowerCase() === 'published').length },
    { id: 'void', label: t('meetingMinutes.statusVoid') || 'Void', count: meetingList.filter(m => (m.status || '').toLowerCase() === 'void').length },
  ];

  return (
    <div className={shellStyles.container}>
      {error && (
        <div className={shellStyles.errorBanner}>{error}</div>
      )}

      <div className={shellStyles.chipGroup} style={{ marginBottom: 8 }}>
        {(['meetings', 'closedItems'] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={`${shellStyles.chip} ${view === v ? shellStyles.chipActive : ''}`}
            onClick={() => setView(v)}
          >
            {v === 'meetings' ? t('meetingMinutes.viewMeetings') : t('meetingMinutes.viewClosedItems')}
            {v === 'closedItems' && <span className={shellStyles.chipCount}>{closedItems.length}</span>}
          </button>
        ))}
      </div>

      <div className={shellStyles.toolbar}>
        <div className={shellStyles.chipGroup}>
          {view === 'meetings' && chips.map((chip) => (
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
              placeholder={t('meetingMinutes.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {view === 'meetings' && hasPermission('meeting:create:all') && (
            <button className={shellStyles.addNewButton} onClick={handleAddNew}>
              {t('meetingMinutes.addNew')}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className={shellStyles.loadingNote}>{t('common.loading') || 'Loading...'}</div>
      )}

      <div className={shellStyles.content}>
        {view === 'meetings' ? (
          <DataTable
            columns={columns}
            data={filteredList}
            searchKey=""
            getRowClassName={(row) =>
              (row.status || '').toLowerCase() === 'published' ? shellStyles.rowDim : ''
            }
            onRowClick={(row) => handleEdit(row.id)}
          />
        ) : closedItems.length === 0 ? (
          <div className={shellStyles.loadingNote}>{t('meetingMinutes.noClosedItems')}</div>
        ) : (
          <DataTable
            columns={closedItemsColumns}
            data={closedItems}
            searchKey=""
            onRowClick={(row) => handleEdit(row.meetingId)}
          />
        )}
      </div>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={t('common.confirmDelete')}
        message={deleteModal.message}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal({ isOpen: false, id: null, message: '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />

      <ConfirmModal
        isOpen={voidModal.isOpen}
        title={t('meetingMinutes.voidAction')}
        message={voidModal.message}
        onConfirm={handleVoid}
        onCancel={() => setVoidModal({ isOpen: false, id: null, message: '' })}
        confirmText={t('meetingMinutes.voidAction')}
        cancelText={t('common.cancel')}
      />

      {isEditModalOpen && currentMeetingId && (() => {
        const editingItem = currentMeetingId === 'new' ? undefined : meetingList.find(item => item.id === currentMeetingId);
        // Read-only once Published or Void — both are dead ends
        // (WorkflowEngine's MeetingMinutes "Published": ["Void"], "Void":
        // []), so unconditional, no permission escape hatch, matching the
        // backend guard and the NOI/Audit pattern used elsewhere in this
        // app. Published's one exception (voiding it) is handled inside
        // MeetingMinutesModals.tsx via a dedicated button that bypasses
        // this readOnly gate, not by loosening it here.
        const status = (editingItem?.status || '').toLowerCase();
        const locked = status === 'published' || status === 'void';
        // A meeting this modal just created (a later save step failed) can still be finished by its creator.
        const canEdit = locked ? false
          : currentMeetingId === 'new' || createdHereId === currentMeetingId
            ? hasPermission('meeting:create:all')
            : hasPermission('meeting:update:all');
        return (
          <MeetingMinutesDetailModal
            meetingId={currentMeetingId}
            existingItem={editingItem}
            readOnly={!canEdit}
            onSave={handleSaveMeetingDetails}
            onVoid={handleVoidFromModal}
            onClose={() => {
              resetSaveState();
              if (openedViaDeepLinkRef.current) {
                openedViaDeepLinkRef.current = false;
                navigate(-1);
                return;
              }
              setIsEditModalOpen(false);
              setCurrentMeetingId(null);
            }}
            onDismiss={() => {
              // Plain close, skips onClose's deep-link navigate(-1); resets
              // the deep-link guard so a follow-up ?openId= (e.g. for a
              // just-created occurrence) can still be picked up by the
              // effect above.
              openedViaDeepLinkRef.current = false;
              deepLinkAppliedRef.current = false;
              resetSaveState();
              setIsEditModalOpen(false);
              setCurrentMeetingId(null);
            }}
          />
        );
      })()}
    </div>
  );
};

export default MeetingMinutes;
