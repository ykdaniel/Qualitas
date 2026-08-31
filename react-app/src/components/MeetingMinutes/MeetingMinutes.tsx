import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useMeetingMinutesStore } from '../../store/meetingMinutesStore';
import type { MeetingMinutesItem as ContextMeetingMinutesItem } from '../../store/meetingMinutesStore';
import shellStyles from '../Shared/ModuleShell.module.css';
import ConfirmModal from '../Shared/ConfirmModal';
import { DataTable } from '@/components/Shared/DataTable/DataTable';
import { createColumns, createClosedItemsColumns, type ClosedItemRow } from './columns';
import { MeetingMinutesDetailModal, MeetingMinutesDetailData, ActionItemDraft, submitActionItemsDraft } from './MeetingMinutesModals';
import { useDebounce } from '../../hooks/useDebounce';
import { uploadFiles } from '../../services/api';
import { getErrorMessage } from '../../utils/errorUtils';

type StatusFilter = 'all' | 'draft' | 'published' | 'void';

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

  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; message: string }>({
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
      const log = meeting.discussionLog || [];
      const majors = log.filter(d => (d.level ?? 0) === 0);
      const subs = log.filter(d => d.level === 1 && d.status === 'Closed');
      for (const sub of subs) {
        const parentNo = sub.no.split('.')[0];
        const topic = majors.find(m => m.no === parentNo);
        rows.push({
          meetingId: meeting.id,
          documentNumber: meeting.documentNumber,
          meetingTitle: meeting.title || '',
          meetingDate: meeting.meetingDate || '',
          itemNo: sub.no,
          content: sub.content || '',
          owner: sub.owner || '',
          topicTitle: topic?.content || '',
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
    setCurrentMeetingId('new');
    setIsEditModalOpen(true);
  };

  const handleSaveMeetingDetails = async (details: MeetingMinutesDetailData, pendingFiles: File[], actionItemsDraft: ActionItemDraft[]) => {
    if (!currentMeetingId) return;
    const isNew = currentMeetingId === 'new';
    // documentNumber 由後端自動產生，新建時不送
    const payload: Record<string, unknown> = {
      vendor: details.contractor || undefined,
      status: details.status || 'Draft',
      title: details.title || undefined,
      meetingType: details.meetingType || undefined,
      meetingDate: details.meetingDate || undefined,
      meetingTime: details.meetingTime || undefined,
      location: details.location || undefined,
      organizer: details.organizer || undefined,
      attendees: details.attendees,
      discussionLog: details.discussionLog,
      attachments: details.attachments,
    };
    try {
      let targetId = '';
      if (isNew) {
        const created = await addMeetingMinutes(payload as Omit<ContextMeetingMinutesItem, 'id'>);
        targetId = created.id;
        // Action items only ever arrive as a local draft array for a
        // brand-new meeting (an existing one posts each addition
        // immediately, since it already has a documentNumber to tag them
        // with) — bulk-create them now that we have one.
        if (actionItemsDraft.length > 0) {
          await submitActionItemsDraft(actionItemsDraft, created.documentNumber, details.contractor);
        }
      } else {
        await updateMeetingMinutes(currentMeetingId, payload);
        targetId = currentMeetingId;
      }

      if (targetId && pendingFiles.length > 0) {
        try {
          await uploadFiles('meeting', targetId, pendingFiles, 'attachment');
        } catch (err: any) {
          const detail = err?.response?.data?.detail || err?.message;
          throw new Error(detail || 'Failed to upload attachments');
        }
      }

      setIsEditModalOpen(false);
      setCurrentMeetingId(null);
      // Refresh so the newly-created meeting's documentNumber is available
      // if the user reopens it to add more action items.
      refetch({ search: debouncedSearch });
    } catch (error: any) {
      const detail = getErrorMessage(error, t('common.saveFailed'));
      toast.error(detail);
    }
  };

  const confirmDelete = React.useCallback((id: string) => {
    setDeleteModal({
      isOpen: true,
      id,
      message: t('common.deleteConfirmMessage', { item: 'Meeting Minutes' }),
    });
  }, [t]);

  const columns = useMemo(() => createColumns(confirmDelete, t, getActiveContractors), [t, getActiveContractors, confirmDelete]);

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
        const canEdit = currentMeetingId === 'new'
          ? hasPermission('meeting:create:all')
          : locked ? false : hasPermission('meeting:update:all');
        return (
          <MeetingMinutesDetailModal
            meetingId={currentMeetingId}
            existingItem={editingItem}
            readOnly={!canEdit}
            onSave={handleSaveMeetingDetails}
            onClose={() => {
              if (openedViaDeepLinkRef.current) {
                openedViaDeepLinkRef.current = false;
                navigate(-1);
                return;
              }
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
