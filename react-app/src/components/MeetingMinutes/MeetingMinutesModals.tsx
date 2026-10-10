import { useDraftGuard } from '../Shared/LeaveGuard';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Trash2, Printer } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useMeetingMinutesStore } from '../../store/meetingMinutesStore';
import { describeSaveError } from '../../utils/saveErrors';
import api, { getUsers, getEntityFiles, getAuthenticatedFileUrl, createMeetingMinutesOccurrence, uploadFiles, deleteFile, type User as ApiUser } from '../../services/api';
import type { MeetingMinutesItem, Attendee, DiscussionLogEntry, PhotoRef } from '../../store/meetingMinutesStore';
import FileAttachment from '../Shared/FileAttachment';
import { BackButton } from '../ui/BackButton';
import DiscussionRegister, { isEditDirty, type RegisterEdit } from './DiscussionRegister';
import { allPhotoIds, normalizeDiscussionLog, numberPhotos, openItemCount } from './discussionLog';
import ImagePreviewOverlay from '../Shared/ImagePreviewOverlay';
import MeetingMinutesPrintTemplate from './MeetingMinutesPrintTemplate';
import formStyles from '../Shared/FormShell.module.css';
import './MeetingMinutes.print.css';

export interface MeetingMinutesDetailData {
    rev: string;
    status: string;
    title: string;
    meetingType: string;
    meetingDate: string;
    meetingTime: string;
    meetingEndTime: string;
    location: string;
    organizer: string;
    contractor: string;
    attendees: Attendee[];
    discussionLog: DiscussionLogEntry[];
    attachments: string[];
}

/**
 * What a save of the meeting form achieved (MeetingMinutes.tsx's handleSaveMeetingDetails). A save is up to three
 * steps — write the meeting, upload attachments, then set a Published/Void status (deferred until the attachments
 * are in, since those statuses lock the record). Once the meeting is written it is never created
 * again: a later step that fails leaves the modal open with only the unfinished work, and Save finishes it.
 */
export type MeetingSaveResult =
    | { status: 'saved' }
    | {
        status: 'saved-incomplete';
        documentNumber: string;
        /** already user-friendly, one line per unfinished step */
        unfinished: string[];
        /** the pending files reached the server — drop them so a retry does not upload them twice */
        attachmentsUploaded: boolean;
    }
    | { status: 'failed'; message: string };

// Four tabs: Action Items was removed (MEETING-TABS-2026-001 R7, user decision 2026-10-11) — every discussion item is
// tracked in the register itself and "Action by" names who acts; Follow-ups opened from meetings before stay in Follow Up.
type MeetingTab = 'general' | 'attendees' | 'discussion' | 'attachments';
const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface MeetingMinutesDetailModalProps {
    meetingId: string | null;
    existingItem?: MeetingMinutesItem;
    readOnly?: boolean;
    /** `removedPhotoIds`: this meeting's own discussion photos taken off the register — the page deletes them once saved */
    onSave: (details: MeetingMinutesDetailData, pendingFiles: File[], removedPhotoIds: string[]) => Promise<MeetingSaveResult>;
    /** Voids the (Published) record: sends the status change alone — the record is locked, so resending its fields is refused. */
    onVoid?: () => Promise<void>;
    onClose: () => void;
    /** Plain close, skipping onClose's deep-link navigate(-1) — used after
     * spawning a new occurrence so that navigate() to the new record isn't
     * raced by an unrelated back-navigation. Mirrors ITRModals.tsx. */
    onDismiss?: () => void;
}

export const MeetingMinutesDetailModal: React.FC<MeetingMinutesDetailModalProps> = ({ existingItem, readOnly = false, onSave, onVoid, onClose, onDismiss }) => {
    const { t, language } = useLanguage();
    const { hasPermission } = useAuth();
    const { getActiveContractors } = useContractorsStore();
    const navigate = useNavigate();
    const [spawningOccurrence, setSpawningOccurrence] = useState(false);
    // Attachment preview (BACKLOG #23, 2026-10-05): FileAttachment's thumbnail click only fires
    // if the parent supplies onPreview — this never did, so clicking a photo silently did
    // nothing. Same handlePreview/ImagePreviewOverlay pattern already used by OBS/NCR/OSD/NOI.
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState<string>('');
    const handlePreview = (url: string, name?: string) => {
        setPreviewUrl(url);
        setPreviewName(name || '');
    };

    const [formData, setFormData] = useState({
        rev: existingItem?.rev || '',
        status: existingItem?.status || 'Draft',
        title: existingItem?.title || '',
        meetingType: existingItem?.meetingType || '',
        meetingDate: existingItem?.meetingDate || '',
        meetingTime: existingItem?.meetingTime || '',
        meetingEndTime: existingItem?.meetingEndTime || '',
        location: existingItem?.location || '',
        organizer: existingItem?.organizer || '',
        contractor: existingItem?.vendor || '',
    });
    const [attendees, setAttendees] = useState<Attendee[]>(existingItem?.attendees || []);
    const [newAttendee, setNewAttendee] = useState<Attendee>({ name: '', company: '', role: '' });
    // Read in the current register shape whatever was stored (legacy two-level rows included — see discussionLog.ts).
    const [discussionLog, setDiscussionLog] = useState<DiscussionLogEntry[]>(() => normalizeDiscussionLog(existingItem?.discussionLog));
    const [registerEdit, setRegisterEdit] = useState<RegisterEdit | null>(null);
    const [activeTab, setActiveTab] = useState<MeetingTab>('general');

    const [users, setUsers] = useState<ApiUser[]>([]);
    useEffect(() => {
        let alive = true;
        getUsers().then(u => { if (alive) setUsers(u); }).catch(() => {/* non-fatal */});
        return () => { alive = false; };
    }, []);

    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    // Bumped once the pending files reached the server, so FileAttachment drops them (see its syncToken prop).
    const [attachmentSync, setAttachmentSync] = useState(0);
    // Set while a save stored the meeting but left steps unfinished; cleared by the next save.
    const [incompleteNotice, setIncompleteNotice] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    // A register row being edited in place (✏️) or added counts as unsaved input only when it holds a change (same rule as
    // the Save check below). This week's updates are written straight into discussionLog, so they are covered by it.
    const registerEditDirty = isEditDirty(registerEdit, discussionLog);
    const leaveGuard = useDraftGuard({ formData, attendees, newAttendee, discussionLog, registerEditDirty, pendingFiles }, saving || spawningOccurrence, !readOnly);

    // ── discussion photos (R9) ──
    // Uploaded as the meeting's "discussionPhoto" attachments the moment they are pasted (a saved Draft only: the upload needs
    // the meeting's id); the register keeps their ids. Photos uploaded in this sitting and then abandoned (Cancel / Back /
    // closing without saving) are deleted again, best effort — only a browser closed mid-edit can leave an orphan file.
    const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
    const uploadedHere = useRef(new Set<string>());
    const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);
    const photoIdsKey = allPhotoIds(discussionLog).join(',');
    useEffect(() => {
        const missing = photoIdsKey.split(',').filter(id => id && !(id in photoUrls));
        if (missing.length === 0) return;
        let alive = true;
        // carried photos belong to an earlier occurrence: read them by id (same contractor / project, so in scope)
        Promise.all(missing.map(id => api.get(`/files/${id}`)
            .then(r => [id, getAuthenticatedFileUrl(r.data?.file_url || '')] as const)
            .catch(() => [id, ''] as const)))
            .then(pairs => { if (alive) setPhotoUrls(prev => ({ ...prev, ...Object.fromEntries(pairs) })); });
        return () => { alive = false; };
    }, [photoIdsKey, photoUrls]);
    const canAddPhotos = !!existingItem?.id && !readOnly && hasPermission('meeting:update:all');
    const uploadPhotos = async (files: File[]): Promise<PhotoRef[]> => {
        const stored = await uploadFiles('meeting', existingItem!.id, files, 'discussionPhoto');
        setPhotoUrls(prev => ({ ...prev, ...Object.fromEntries(stored.map(f => [f.id, getAuthenticatedFileUrl(f.file_url)])) }));
        stored.forEach(f => uploadedHere.current.add(f.id));
        return stored.map(f => ({ id: f.id }));
    };
    const onPhotoRemoved = (id: string) => {
        if (uploadedHere.current.has(id)) {                        // never saved anywhere: delete it now
            uploadedHere.current.delete(id);
            deleteFile(id).catch(() => { /* best effort: an orphan file, no broken reference */ });
        } else {
            setRemovedPhotos(prev => [...prev, id]);               // saved before: deleted once this save goes through
        }
    };
    // Ids of the register last handed to Save: while that save runs (or once it stored them) they are referenced, never orphans.
    const submittedPhotoIds = useRef<Set<string> | null>(null);
    const discardUploadedPhotos = () => {
        uploadedHere.current.forEach(id => {
            if (!submittedPhotoIds.current?.has(id)) deleteFile(id).catch(() => { /* best effort */ });
        });
        uploadedHere.current.clear();
    };
    // Any other way out (e.g. a route change the leave guard let through) unmounts the form: same clean-up.
    const discardRef = useRef(discardUploadedPhotos);
    discardRef.current = discardUploadedPhotos;
    useEffect(() => () => discardRef.current(), []);
    const requestClose = () => leaveGuard.requestClose(() => { discardUploadedPhotos(); onClose(); });

    const handleFieldChange = (field: keyof typeof formData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const addAttendeeRow = () => {
        if (!newAttendee.name.trim()) return;
        setAttendees(prev => [...prev, newAttendee]);
        setNewAttendee({ name: '', company: '', role: '' });
    };
    const removeAttendeeRow = (idx: number) => {
        setAttendees(prev => prev.filter((_, i) => i !== idx));
    };

    // Any sub-editor (attendee, a register row being edited) that has content
    // typed but was never Added / applied is not part of formData/attendees/discussionLog
    // — saving now would silently discard it. Block and guide the user instead.
    // Must compare EVERY editable field against its own initial value, not just the
    // "primary" one (title/name) — a user can type only a company, an owner, an
    // assignee, or a due date without ever touching the primary field, and that would
    // still be silently dropped. subItemDrafts' `status` defaults to 'Open' on read
    // (via getSubDraft) even when no entry exists yet, so a plain default must NOT
    // count as unconfirmed input — only an explicit change away from it does.
    const isAttendeeDraftDirty = () =>
        !!(newAttendee.name.trim() || newAttendee.company.trim() || newAttendee.role.trim());
    const isRegisterDraftDirty = () => registerEditDirty;
    const unconfirmedSubDraft = (): { label: string; tab: MeetingTab } | null => {
        if (isAttendeeDraftDirty()) return { label: t('meetingMinutes.attendeesSection'), tab: 'attendees' };
        if (isRegisterDraftDirty()) return { label: t('meetingMinutes.tabDiscussion'), tab: 'discussion' };
        return null;
    };
    const blockSaveForUnconfirmedDraft = () => {
        const draft = unconfirmedSubDraft();
        if (!draft) return false;
        setActiveTab(draft.tab);                    // the input is on another tab: show it
        toast.error(t('meetingMinutes.unconfirmedDraft', { label: draft.label }));
        return true;
    };

    const handleSave = async () => {
        if (blockSaveForUnconfirmedDraft()) return;
        setSaving(true);
        setIncompleteNotice(null);
        submittedPhotoIds.current = new Set(allPhotoIds(discussionLog));
        try {
            const result = await onSave(
                { ...formData, attendees, discussionLog, attachments: [] },
                pendingFiles,
                removedPhotos,
            );
            if (result.status !== 'failed') {                      // the register (with its photo ids) is stored now
                uploadedHere.current.clear();
                setRemovedPhotos([]);
            } else {
                submittedPhotoIds.current = null;                  // nothing stored: they are this sitting's uploads again
            }
            if (result.status === 'failed') {
                toast.error(t('saveFlow.failedKeep', { message: result.message }), { duration: 10000 });
            } else if (result.status === 'saved-incomplete') {
                // The meeting exists now: keep only what is left, so Save finishes it without redoing anything.
                if (result.attachmentsUploaded) {
                    setPendingFiles([]);
                    setAttachmentSync(n => n + 1);
                }
                const notice = t('meetingMinutes.saveIncomplete', { docNo: result.documentNumber, details: result.unfinished.join(language === 'zh' ? '；' : '; ') });
                setIncompleteNotice(notice);
                toast.warning(notice, { duration: 10000 });
            }
            // 'saved': the page closes the modal.
        } catch (err) {
            submittedPhotoIds.current = null;
            toast.error(t('saveFlow.failedKeep', { message: describeSaveError(err, t) }), { duration: 10000 });
        } finally {
            setSaving(false);
        }
    };

    // Voiding a Published record is the one change its otherwise-locked
    // fieldset can't reach (the whole form is disabled once Published —
    // see the readOnly prop passed in from MeetingMinutes.tsx). Only the
    // status is sent, like the list row's quick-void: resending the full
    // form was refused by the backend's Published lock whenever the form's
    // shape differed from the stored row (contractor name vs vendor_id,
    // attachments, an empty discussion log — MEETING-FIX-2026-001).
    const handleVoidClick = async () => {
        if (!onVoid) return;
        if (!window.confirm(t('meetingMinutes.confirmVoid') || 'Void this meeting minute? This cannot be undone.')) return;
        setSaving(true);
        try {
            await onVoid();
        } catch (err) {
            toast.error(describeSaveError(err, t));
        } finally {
            setSaving(false);
        }
    };

    // BACKLOG #18: create the next occurrence of this recurring meeting —
    // backend reuses this record's documentNumber and bumps rev.
    const handleNewOccurrenceClick = async () => {
        if (!existingItem?.id || spawningOccurrence) return;
        setSpawningOccurrence(true);
        try {
            const created = await createMeetingMinutesOccurrence(existingItem.id);
            toast.success(t('meetingMinutes.occurrenceCreated') || `New occurrence created (rev ${created.rev})`);
            await useMeetingMinutesStore.getState().refetch();
            leaveGuard.release();
            discardUploadedPhotos();                               // unsaved changes were confirmed away by the leave guard
            (onDismiss || onClose)();
            navigate(`/meeting-minutes?openId=${created.id}`);
        } catch (err: any) {
            toast.error(err?.response?.data?.detail || t('common.saveFailed'));
        } finally {
            setSpawningOccurrence(false);
        }
    };

    // Print: mount the report portal, print, unmount (same pattern as NCR/OBS).
    const [isPrinting, setIsPrinting] = useState(false);
    const [printAttachments, setPrintAttachments] = useState<{ name: string; url: string; isImage: boolean }[]>([]);
    const [printRegisterPhotos, setPrintRegisterPhotos] = useState<{ n: number; url: string; itemNo: string; date: string; updateIndex: number }[]>([]);
    useEffect(() => {
        if (!isPrinting) return;
        // wait for the photo pages' images (up to 8 s), or they print blank
        let cancelled = false;
        const timer = setTimeout(async () => {
            const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.mom-print-root img'));
            await Promise.race([
                Promise.all(imgs.map(img => (img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = () => r(undefined); })))),
                new Promise(r => setTimeout(r, 8000)),
            ]);
            if (!cancelled) window.print();
        }, 200);
        const onAfterPrint = () => setIsPrinting(false);
        window.addEventListener('afterprint', onAfterPrint);
        return () => { cancelled = true; clearTimeout(timer); window.removeEventListener('afterprint', onAfterPrint); };
    }, [isPrinting]);

    const handlePrintClick = async () => {
        let files: { name: string; url: string; isImage: boolean }[] = [];
        if (existingItem?.id) {
            try {
                const a = await getEntityFiles('meeting', existingItem.id, 'attachment');
                // in upload order, so photo numbers follow the order they were taken / added
                files = [...a].sort((x, y) => (x.uploaded_at || '').localeCompare(y.uploaded_at || '')).map(f => ({
                    name: f.file_name,
                    url: getAuthenticatedFileUrl(f.file_url),
                    isImage: (f.mime_type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.file_name),
                }));
            } catch {/* no attachments to show */}
        }
        setPrintAttachments(files);
        setPrintRegisterPhotos(numberPhotos(discussionLog).map(p => ({ ...p, url: photoUrls[p.id] || '' })));
        setIsPrinting(true);
    };

    const tabs: { key: MeetingTab; label: string; count?: number }[] = [
        { key: 'general', label: t('meetingMinutes.tabGeneral') },
        { key: 'attendees', label: t('meetingMinutes.attendeesSection'), count: attendees.length },
        { key: 'discussion', label: t('meetingMinutes.tabDiscussion'), count: openItemCount(discussionLog) },
        { key: 'attachments', label: t('common.attachments') },
    ];
    const field = (label: string, control: React.ReactNode, full = false) => (
        <div className={full ? formStyles.formGroupFull : formStyles.formGroup}>
            <label>{label}</label>
            {control}
        </div>
    );

    // Full-screen with tabs, like the ITP form (MEETING-TABS-2026-001). Every tab stays mounted (only hidden), so
    // switching tabs never drops typed input or queued files; the unsaved-input guard covers all of them.
    return (
        <div className={formStyles.modalOverlay} style={{ padding: 0 }}>
            <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '100%', width: '100%', height: '100%', maxHeight: 'none', borderRadius: 0 }}>
                <div className={formStyles.modalHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <BackButton onClick={requestClose} label={t('common.back')} />
                        <h2>{readOnly ? t('meetingMinutes.viewTitle') : existingItem ? t('meetingMinutes.editTitle') : t('meetingMinutes.addTitle')}</h2>
                    </div>
                    <button type="button" className={formStyles.closeButton} aria-label={t('common.close')} title={t('common.close')} onClick={requestClose}>×</button>
                </div>

                <div className={formStyles.tabsContainer} role="tablist">
                    {tabs.map(tab => (
                        <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key}
                            className={`${formStyles.tabButton} ${activeTab === tab.key ? formStyles.activeTab : ''}`}
                            onClick={() => setActiveTab(tab.key)}>
                            {tab.label}{tab.count !== undefined && ` (${tab.count})`}
                        </button>
                    ))}
                </div>

                <div className={formStyles.modalBody}>
                    {incompleteNotice && (
                        <div role="alert" style={{ margin: '0 0 12px', padding: '10px 14px', borderRadius: 8, border: '1px solid #f59e0b', background: '#fffbeb', color: '#92400e', fontSize: 13 }}>
                            {incompleteNotice}
                        </div>
                    )}
                    <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }}>
                        <div className={formStyles.formSections} hidden={activeTab !== 'general'}>
                            <div className={formStyles.formSection}>
                                <h3 className={formStyles.sectionTitle}>{t('meetingMinutes.infoSection')}</h3>
                                <div className={formStyles.formGrid}>
                                    {field(t('meetingMinutes.refNo'),
                                        <input type="text" className={formStyles.formInput} value={existingItem?.documentNumber || t('form.autoGenerated')} readOnly style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed' }} />)}
                                    {field(t('meetingMinutes.rev'),
                                        <input type="text" className={formStyles.formInput} value={formData.rev} onChange={(e) => handleFieldChange('rev', e.target.value)} />)}
                                    {field(t('meetingMinutes.status'),
                                        <select className={formStyles.formSelect} value={formData.status} onChange={(e) => handleFieldChange('status', e.target.value)}>
                                            <option value="Draft">Draft</option>
                                            <option value="Published">Published</option>
                                            <option value="Void">Void</option>
                                        </select>)}
                                    {field(t('meetingMinutes.meetingTitle'),
                                        <input type="text" className={formStyles.formInput} value={formData.title} onChange={(e) => handleFieldChange('title', e.target.value)} />, true)}
                                    {field(t('meetingMinutes.meetingType'),
                                        <select className={formStyles.formSelect} value={formData.meetingType} onChange={(e) => handleFieldChange('meetingType', e.target.value)}>
                                            <option value="">-- {t('common.pleaseSelect')} --</option>
                                            <option value="週會">{t('meetingMinutes.typeWeekly')}</option>
                                            <option value="月會">{t('meetingMinutes.typeMonthly')}</option>
                                        </select>)}
                                    {field(t('common.contractor'),
                                        <select className={formStyles.formSelect} value={formData.contractor} onChange={(e) => handleFieldChange('contractor', e.target.value)}>
                                            <option value="">-- {t('common.selectContractor')} --</option>
                                            {getActiveContractors().map(c => (
                                                <option key={c.id} value={c.name}>{c.name}</option>
                                            ))}
                                        </select>)}
                                    {field(t('meetingMinutes.meetingDate'),
                                        <input type="date" className={formStyles.formInput} value={formData.meetingDate} onChange={(e) => handleFieldChange('meetingDate', e.target.value)} />)}
                                    {field(t('meetingMinutes.meetingTime'),
                                        <input type="time" className={formStyles.formInput} value={formData.meetingTime} onChange={(e) => handleFieldChange('meetingTime', e.target.value)} />)}
                                    {field(t('meetingMinutes.meetingEndTime'),
                                        <input type="time" className={formStyles.formInput} value={formData.meetingEndTime} onChange={(e) => handleFieldChange('meetingEndTime', e.target.value)} />)}
                                    {field(t('meetingMinutes.location'),
                                        <input type="text" className={formStyles.formInput} value={formData.location} onChange={(e) => handleFieldChange('location', e.target.value)} />)}
                                    {field(t('meetingMinutes.organizer'),
                                        <input type="text" className={formStyles.formInput} list="meeting-attendee-people" value={formData.organizer} onChange={(e) => handleFieldChange('organizer', e.target.value)} />)}
                                </div>
                            </div>
                        </div>

                        <div className={formStyles.formSections} hidden={activeTab !== 'attendees'}>
                            <div className={formStyles.formSection}>
                                <h3 className={formStyles.sectionTitle}>{t('meetingMinutes.attendeesSection')}</h3>
                                <table data-attendees style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 10 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}>{t('meetingMinutes.attendeeCompany')}</th>
                                            <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}>{t('meetingMinutes.attendeeName')}</th>
                                            <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}>{t('meetingMinutes.attendeeRole')}</th>
                                            {!readOnly && <th style={{ border: '1px solid #cbd5e1', width: 44 }} aria-label={t('common.delete')} />}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {attendees.length === 0 && (
                                            <tr><td colSpan={readOnly ? 3 : 4} style={{ border: '1px solid #cbd5e1', padding: '6px 8px', color: '#94a3b8' }}>{t('meetingMinutes.noAttendees')}</td></tr>
                                        )}
                                        {attendees.map((a, idx) => (
                                            <tr key={idx}>
                                                <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{a.company || '-'}</td>
                                                <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{a.name}</td>
                                                <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{a.role || '-'}</td>
                                                {!readOnly && (
                                                    <td style={{ border: '1px solid #cbd5e1', textAlign: 'center' }}>
                                                        <button className={actionStyles.iconDanger} type="button" aria-label={t('common.delete')} onClick={() => removeAttendeeRow(idx)}><Trash2 size={16} /></button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {!readOnly && (
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input className={formStyles.formInput} placeholder={t('meetingMinutes.attendeeCompany')} value={newAttendee.company} onChange={(e) => setNewAttendee(prev => ({ ...prev, company: e.target.value }))} style={{ flex: 1 }} />
                                        <input className={formStyles.formInput} list="meeting-attendee-people" placeholder={t('meetingMinutes.attendeeName')} value={newAttendee.name} onChange={(e) => setNewAttendee(prev => ({ ...prev, name: e.target.value }))} style={{ flex: 2 }} />
                                        <input className={formStyles.formInput} placeholder={t('meetingMinutes.attendeeRole')} value={newAttendee.role} onChange={(e) => setNewAttendee(prev => ({ ...prev, role: e.target.value }))} style={{ flex: 2 }} />
                                        <button type="button" onClick={addAttendeeRow} className={formStyles.printButton} aria-label={t('common.add')}><Plus size={16} /></button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={formStyles.formSections} hidden={activeTab !== 'attachments'}>
                            <div className={formStyles.formSection}>
                                <h3 className={formStyles.sectionTitle}>{t('common.attachments')}</h3>
                                <FileAttachment
                                    id="meeting-attachments"
                                    entityType={existingItem ? 'meeting' : undefined}
                                    entityId={existingItem?.id}
                                    category="attachment"
                                    onPendingFilesChange={setPendingFiles}
                                    syncToken={attachmentSync}
                                    readOnly={readOnly}
                                    hideTitle
                                    onPreview={handlePreview}
                                />
                            </div>
                        </div>
                    </fieldset>
                    {/* Outside the disabled fieldset: the register handles read-only itself, and its Open / Closed / All
                        filter must stay usable on a Published or Void meeting. */}
                        <div className={formStyles.formSections} hidden={activeTab !== 'discussion'}>
                            <div className={formStyles.formSection}>
                                <h3 className={formStyles.sectionTitle}>{t('meetingMinutes.discussionSection')}</h3>
                                <DiscussionRegister
                                    log={discussionLog}
                                    onChange={setDiscussionLog}
                                    readOnly={readOnly}
                                    meetingDate={formData.meetingDate || todayStr()}
                                    edit={registerEdit}
                                    setEdit={setRegisterEdit}
                                    peopleListId="meeting-attendee-people"
                                    photos={{
                                        upload: canAddPhotos ? uploadPhotos : undefined,
                                        blockedReason: !existingItem ? t('meetingMinutes.photoSaveFirst') : t('saveFlow.attachmentsBlocked.edit'),
                                        urls: photoUrls,
                                        onRemoved: onPhotoRemoved,
                                        onPreview: url => handlePreview(url),
                                    }}
                                />
                            </div>
                        </div>

                    <datalist id="meeting-attendee-people">
                        {Array.from(new Set([...attendees.map(a => a.name), ...users.map(u => u.full_name || u.username)].filter(Boolean))).map(name => (
                            <option key={name} value={name} />
                        ))}
                    </datalist>
                </div>
                <FormActions
                    tools={<>
                        {existingItem?.id && (
                            <button className={actionStyles.secondary} type="button" onClick={handlePrintClick} disabled={saving} title={t('common.print') || 'Print'}>
                                <Printer size={16} /> {t('common.print') || 'Print'}
                            </button>
                        )}
                        {existingItem?.id && hasPermission('meeting:create:all') && (
                            <button className={actionStyles.secondary} type="button" onClick={() => leaveGuard.requestAction(handleNewOccurrenceClick)} disabled={saving || spawningOccurrence} title={t('meetingMinutes.newOccurrenceTitle') || 'Create the next occurrence of this recurring meeting, reusing its document number'}>
                                {spawningOccurrence ? (t('common.saving') || '...') : (t('meetingMinutes.newOccurrence') || 'New Occurrence')}
                            </button>
                        )}
                    </>}
                    secondary={<>
                        {readOnly && onVoid && existingItem?.status === 'Published' && hasPermission('meeting:update:all') && (
                            <button className={actionStyles.danger} type="button" onClick={handleVoidClick} disabled={saving} title={t('meetingMinutes.voidAction') || 'Void'}>
                                {t('meetingMinutes.voidAction') || 'Void'}
                            </button>
                        )}
                    </>}
                    cancel={<>
                        <button className={actionStyles.secondary} type="button" onClick={requestClose} disabled={saving}>
                            {t('common.cancel')}
                        </button>
                    </>}
                    primary={<>
                        {!readOnly && (
                            <button className={actionStyles.primary} type="button" onClick={handleSave} disabled={saving}>
                                {saving ? t('common.saving') : t('common.save')}
                            </button>
                        )}
                    </>}
                />
            </div>
            {isPrinting && existingItem && ReactDOM.createPortal(
                <MeetingMinutesPrintTemplate
                    data={{
                        documentNumber: existingItem.documentNumber,
                        rev: formData.rev,
                        status: formData.status,
                        title: formData.title,
                        vendor: formData.contractor,
                        meetingType: formData.meetingType,
                        meetingDate: formData.meetingDate,
                        meetingTime: formData.meetingTime,
                        meetingEndTime: formData.meetingEndTime,
                        location: formData.location,
                        organizer: formData.organizer,
                    }}
                    attendees={attendees}
                    discussionLog={discussionLog}
                    attachmentFiles={printAttachments}
                    registerPhotos={printRegisterPhotos}
                />,
                document.body
            )}
            {previewUrl && (
                <ImagePreviewOverlay key={previewUrl} url={previewUrl} name={previewName} onClose={() => setPreviewUrl(null)} />
            )}
        </div>
    );
};
