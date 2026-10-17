import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useMeetingMinutesStore } from '../../store/meetingMinutesStore';
import { showRefusal } from '../../store/refusalStore';
import type { MeetingMinutesItem as ContextMeetingMinutesItem } from '../../store/meetingMinutesStore';
import shellStyles from '../Shared/ModuleShell.module.css';
import ConfirmModal from '../Shared/ConfirmModal';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns, createItemColumns } from './columns';
import { MeetingMinutesDetailModal, MeetingMinutesDetailData, MeetingSaveResult } from './MeetingMinutesModals';
import { useDebounce } from '../../hooks/useDebounce';
import { useCreateGate } from '../../hooks/useCreateGate';
import { collectRegisterItems } from './discussionLog';
import { uploadFiles } from '../../services/api';
import { describeSaveError } from '../../utils/saveErrors';
import { runSaveFlow, sameWrite } from '../../utils/saveFlow';

type StatusFilter = 'all' | 'draft' | 'published' | 'void';

// Statuses that lock a meeting: its fields are frozen and attachments are refused (core/attachment_access.py).
const LOCKING_STATUSES = ['Published', 'Void'];

const MeetingMinutes: React.FC = () => {
  const { t } = useLanguage();
  const createGate = useCreateGate();
  const { hasPermission } = useAuth();
  const { getActiveContractors } = useContractorsStore();
  const { meetingList, loading, error, refetch, addMeetingMinutes, updateMeetingMinutes, deleteMeetingMinutes } = useMeetingMinutesStore();

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 500);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [view, setView] = useState<'meetings' | 'openItems' | 'closedItems'>('meetings');
  // item views: filter by Action by, and (open items) overdue only
  const [ownerFilter, setOwnerFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // The server-side search matches a meeting's number / title only. The item views need every meeting (the newest
  // occurrence of a series decides what is open; an item's text is not in the title), so they load the unfiltered
  // list and search on the items themselves.
  const listSearch = view === 'meetings' ? debouncedSearch : '';
  React.useEffect(() => {
    refetch({ search: listSearch });
  }, [listSearch, refetch]);

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

  // Discussion items across the loaded meetings (client-side only — the data is already in `meetingList`):
  // open ones from the newest occurrence of each meeting, closed ones from every meeting but Void. This is where
  // every item is followed up (Action Items were removed, MEETING-TABS-2026-001 R7).
  const itemWhich = view === 'closedItems' ? 'closed' : 'open';
  const allItems = useMemo(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return collectRegisterItems(meetingList, itemWhich, today);
  }, [meetingList, itemWhich]);
  const owners = useMemo(() => Array.from(new Set(allItems.map(r => r.owner).filter(Boolean))).sort(), [allItems]);
  const itemRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return allItems.filter(r =>
      (!ownerFilter || r.owner === ownerFilter)
      && (itemWhich === 'closed' || !overdueOnly || r.overdue)
      && (!q || r.content.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q) || r.topicTitle.toLowerCase().includes(q)
        || r.documentNumber.toLowerCase().includes(q)));
  }, [allItems, ownerFilter, overdueOnly, itemWhich, debouncedSearch]);
  const openItemTotal = useMemo(() => collectRegisterItems(meetingList, 'open', '9999-12-31').length, [meetingList]);
  const closedItemTotal = useMemo(() => collectRegisterItems(meetingList, 'closed', '9999-12-31').length, [meetingList]);

  const itemColumns = useMemo(() => createItemColumns(t, itemWhich), [t, itemWhich]);

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

  // Write the meeting, upload its attachments, then set a Published/Void status — see
  // MeetingSaveResult. Built on the shared runSaveFlow contract (utils/saveFlow.ts, as NCR/OBS/NOI/OSD): once the
  // meeting is written its id replaces 'new' at once, so pressing Save again after a later step failed updates it
  // (or, unchanged, does not write it at all) and never creates a second meeting. It used to stay 'new', and every
  // retry created another meeting with a new number (MEETING-FIX-2026-001).
  const handleSaveMeetingDetails = async (details: MeetingMinutesDetailData, pendingFiles: File[]): Promise<MeetingSaveResult> => {
    if (!currentMeetingId) return { status: 'failed', message: t('common.saveFailed') };
    const isNew = currentMeetingId === 'new';
    const targetStatus = details.status || 'Draft';
    // Published / Void lock the meeting: attachments would be refused and the form could no longer be saved to
    // finish anything. With attachments still to upload, write it as Draft and set the target status only once they
    // went through (uploading needs update permission, which setting the status afterwards needs too).
    const deferStatus = LOCKING_STATUSES.includes(targetStatus) && pendingFiles.length > 0;
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
    if (outcome.status === 'failed') return { status: 'failed', message: outcome.message, error: outcome.error };

    const id = lastWriteRef.current?.id || currentId;
    if (!documentNumber) {
      documentNumber = useMeetingMinutesStore.getState().meetingList.find(m => m.id === id)?.documentNumber || '';
    }
    const unfinished: string[] = [];
    let attachmentsUploaded = true;
    if (outcome.status === 'saved-incomplete') {
      attachmentsUploaded = outcome.uploadedCategories.includes('attachment');
      for (const f of outcome.failures) {
        unfinished.push(t('saveFlow.step.upload', { what: t('saveFlow.category.attachment'), message: f.message }));
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
      return { status: 'saved-incomplete', documentNumber, unfinished, attachmentsUploaded };
    }
    setIsEditModalOpen(false);
    setCurrentMeetingId(null);
    resetSaveState();
    refetch({ search: listSearch });
    return { status: 'saved' };
  };

  // The form's Void button (Published records): the status alone, like the list row's quick-void.
  const handleVoidFromModal = async () => {
    if (!currentMeetingId || currentMeetingId === 'new') return;
    await updateMeetingMinutes(currentMeetingId, { status: 'Void' });
    setIsEditModalOpen(false);
    setCurrentMeetingId(null);
    resetSaveState();
    refetch({ search: listSearch });
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
        showRefusal(err, 'delete');
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
        showRefusal(err, 'save');
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
        // list loads only (a refused save goes to the refusal dialog) — retry reloads the list, like NCR (REFUSAL-DIALOG-2026-003)
        <div className={shellStyles.errorBanner}>
          <span>{error}</span>
          <button type="button" className={shellStyles.retryButton} onClick={() => refetch({ search: listSearch })}>
            {t('common.retry')}
          </button>
        </div>
      )}

      <div className={shellStyles.chipGroup} style={{ marginBottom: 8 }}>
        {(['meetings', 'openItems', 'closedItems'] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={`${shellStyles.chip} ${view === v ? shellStyles.chipActive : ''}`}
            onClick={() => { setView(v); setOwnerFilter(''); setOverdueOnly(false); }}
          >
            {v === 'meetings' ? t('meetingMinutes.viewMeetings') : v === 'openItems' ? t('meetingMinutes.viewOpenItems') : t('meetingMinutes.viewClosedItems')}
            {v === 'openItems' && <span className={shellStyles.chipCount}>{openItemTotal}</span>}
            {v === 'closedItems' && <span className={shellStyles.chipCount}>{closedItemTotal}</span>}
          </button>
        ))}
      </div>

      <div className={shellStyles.toolbar}>
        <div className={shellStyles.chipGroup}>
          {view !== 'meetings' && (
            <>
              <select className={shellStyles.searchInput} style={{ width: 'auto', paddingLeft: 10 }} value={ownerFilter}
                aria-label={t('meetingMinutes.colActionBy')} onChange={(e) => setOwnerFilter(e.target.value)}>
                <option value="">{t('meetingMinutes.allOwners')}</option>
                {owners.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {view === 'openItems' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                  <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
                  {t('meetingMinutes.overdueOnly')}
                </label>
              )}
            </>
          )}
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
            <button className={shellStyles.addNewButton} onClick={handleAddNew}
              disabled={createGate.disabled} title={createGate.title}>
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
        ) : itemRows.length === 0 ? (
          <div className={shellStyles.loadingNote}>{t(view === 'openItems' ? 'meetingMinutes.noOpenItems' : 'meetingMinutes.noClosedItems')}</div>
        ) : (
          <DataTable
            key={view}
            columns={itemColumns}
            data={itemRows}
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
