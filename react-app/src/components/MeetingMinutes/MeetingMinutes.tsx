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
import { createColumns } from './columns';
import { MeetingMinutesDetailModal, MeetingMinutesDetailData, ActionItemDraft, submitActionItemsDraft } from './MeetingMinutesModals';
import { useDebounce } from '../../hooks/useDebounce';
import { uploadFiles } from '../../services/api';
import { getErrorMessage } from '../../utils/errorUtils';

type StatusFilter = 'all' | 'draft' | 'published';

const MeetingMinutes: React.FC = () => {
  const { t } = useLanguage();
  const { hasPermission } = useAuth();
  const { getActiveContractors } = useContractorsStore();
  const { meetingList, loading, error, refetch, addMeetingMinutes, updateMeetingMinutes, deleteMeetingMinutes } = useMeetingMinutesStore();

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 500);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

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
  ];

  return (
    <div className={shellStyles.container}>
      {error && (
        <div className={shellStyles.errorBanner}>{error}</div>
      )}

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
              placeholder={t('meetingMinutes.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {hasPermission('meeting:create:all') && (
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
        <DataTable
          columns={columns}
          data={filteredList}
          searchKey=""
          getRowClassName={(row) =>
            (row.status || '').toLowerCase() === 'published' ? shellStyles.rowDim : ''
          }
          onRowClick={(row) => handleEdit(row.id)}
        />
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
        // Read-only once Published — a true dead end (WorkflowEngine's
        // MeetingMinutes "Published": []), so unconditional, no permission
        // escape hatch, matching the backend guard and the NOI/Audit
        // pattern used elsewhere in this app.
        const status = (editingItem?.status || '').toLowerCase();
        const locked = status === 'published';
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
