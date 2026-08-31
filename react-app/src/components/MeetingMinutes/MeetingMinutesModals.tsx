import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useFollowUpStore } from '../../store/followUpStore';
import { useMeetingMinutesStore } from '../../store/meetingMinutesStore';
import { getUsers, formatUserLabel, bulkCreateFollowUps, getEntityFiles, getAuthenticatedFileUrl, createMeetingMinutesOccurrence, type User as ApiUser } from '../../services/api';
import api from '../../services/api';
import type { MeetingMinutesItem, Attendee, DiscussionLogEntry } from '../../store/meetingMinutesStore';
import FileAttachment from '../Shared/FileAttachment';
import MeetingMinutesPrintTemplate from './MeetingMinutesPrintTemplate';
import formStyles from '../Shared/FormShell.module.css';
import './MeetingMinutes.print.css';

export interface ActionItemDraft {
    title: string;
    description?: string;
    assignedTo?: string;
    assignedToUserId?: number | null;
    dueDate?: string;
    priority?: string;
}

export interface MeetingMinutesDetailData {
    rev: string;
    status: string;
    title: string;
    meetingType: string;
    meetingDate: string;
    meetingTime: string;
    location: string;
    organizer: string;
    contractor: string;
    attendees: Attendee[];
    discussionLog: DiscussionLogEntry[];
    attachments: string[];
}

interface LinkedActionItem {
    id: string;
    issueNo: string;
    title: string;
    assignedTo?: string;
    dueDate?: string;
    status: string;
}

export interface MeetingMinutesDetailModalProps {
    meetingId: string | null;
    existingItem?: MeetingMinutesItem;
    readOnly?: boolean;
    onSave: (details: MeetingMinutesDetailData, pendingFiles: File[], actionItemsDraft: ActionItemDraft[]) => void | Promise<void>;
    onClose: () => void;
    /** Plain close, skipping onClose's deep-link navigate(-1) — used after
     * spawning a new occurrence so that navigate() to the new record isn't
     * raced by an unrelated back-navigation. Mirrors ITRModals.tsx. */
    onDismiss?: () => void;
}

export const MeetingMinutesDetailModal: React.FC<MeetingMinutesDetailModalProps> = ({ existingItem, readOnly = false, onSave, onClose, onDismiss }) => {
    const { t } = useLanguage();
    const { hasPermission } = useAuth();
    const { getActiveContractors } = useContractorsStore();
    const { addFollowUp } = useFollowUpStore();
    const navigate = useNavigate();
    const [spawningOccurrence, setSpawningOccurrence] = useState(false);

    const [formData, setFormData] = useState({
        rev: existingItem?.rev || '',
        status: existingItem?.status || 'Draft',
        title: existingItem?.title || '',
        meetingType: existingItem?.meetingType || '',
        meetingDate: existingItem?.meetingDate || '',
        meetingTime: existingItem?.meetingTime || '',
        location: existingItem?.location || '',
        organizer: existingItem?.organizer || '',
        contractor: existingItem?.vendor || '',
    });
    const [attendees, setAttendees] = useState<Attendee[]>(existingItem?.attendees || []);
    const [newAttendee, setNewAttendee] = useState<Attendee>({ name: '', company: '', role: '' });
    const [discussionLog, setDiscussionLog] = useState<DiscussionLogEntry[]>(existingItem?.discussionLog || []);
    const [newTopicTitle, setNewTopicTitle] = useState('');
    const [subItemDrafts, setSubItemDrafts] = useState<Record<string, { content: string; owner: string; status: string }>>({});
    const [discussionTab, setDiscussionTab] = useState<'active' | 'closed'>('active');
    const getSubDraft = (parentNo: string) => subItemDrafts[parentNo] || { content: '', owner: '', status: 'Open' };
    const setSubDraft = (parentNo: string, patch: Partial<{ content: string; owner: string; status: string }>) => {
        setSubItemDrafts(prev => ({ ...prev, [parentNo]: { ...getSubDraft(parentNo), ...patch } }));
    };

    // Action items: a brand-new meeting has no documentNumber yet, so drafts
    // are held locally and bulk-submitted right after the meeting itself is
    // created (see MeetingMinutes.tsx's handleSaveMeetingDetails). An
    // existing meeting already has real FollowUp rows — those are fetched
    // and shown read-only; adding one more posts immediately instead of
    // waiting for the meeting's own Save button.
    const [actionItemsDraft, setActionItemsDraft] = useState<ActionItemDraft[]>([]);
    const [linkedActionItems, setLinkedActionItems] = useState<LinkedActionItem[]>([]);
    const [loadingActionItems, setLoadingActionItems] = useState(false);
    const [newAction, setNewAction] = useState<ActionItemDraft>({ title: '', description: '', assignedTo: '', assignedToUserId: null, dueDate: '', priority: '' });

    const [users, setUsers] = useState<ApiUser[]>([]);
    useEffect(() => {
        let alive = true;
        getUsers().then(u => { if (alive) setUsers(u); }).catch(() => {/* non-fatal */});
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        if (!existingItem?.documentNumber) return;
        let alive = true;
        setLoadingActionItems(true);
        api.get('/followup/', { params: { sourceModule: 'MEETING', sourceReferenceNo: existingItem.documentNumber } })
            .then(res => { if (alive) setLinkedActionItems(res.data || []); })
            .catch(() => {/* non-fatal */})
            .finally(() => { if (alive) setLoadingActionItems(false); });
        return () => { alive = false; };
    }, [existingItem?.documentNumber]);

    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [saving, setSaving] = useState(false);

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

    const addMajorTopic = () => {
        if (!newTopicTitle.trim()) return;
        const topLevelCount = discussionLog.filter(d => (d.level ?? 0) === 0).length;
        setDiscussionLog(prev => [...prev, { no: String(topLevelCount + 1), level: 0, content: newTopicTitle }]);
        setNewTopicTitle('');
    };
    const addSubItem = (parentNo: string) => {
        const draft = getSubDraft(parentNo);
        if (!draft.content.trim()) return;
        const siblingCount = discussionLog.filter(d => d.level === 1 && d.no.startsWith(`${parentNo}.`)).length;
        setDiscussionLog(prev => [...prev, { no: `${parentNo}.${siblingCount + 1}`, level: 1, content: draft.content, owner: draft.owner, status: draft.status || 'Open' }]);
        setSubItemDrafts(prev => {
            const next = { ...prev };
            delete next[parentNo];
            return next;
        });
    };
    // Removing by `no` (not array index, since items are now rendered nested
    // under their major topic and filtered by tab) — always fully renumbers
    // from scratch so numbering stays contiguous, mirroring the old flat
    // behavior extended to the major/sub hierarchy. Removing a major topic
    // also removes its sub-items.
    const removeDiscussionRow = (no: string) => {
        setDiscussionLog(prev => {
            const target = prev.find(d => d.no === no);
            if (!target) return prev;
            const isMajor = (target.level ?? 0) === 0;
            const remaining = isMajor
                ? prev.filter(d => d.no !== no && !(d.level === 1 && d.no.startsWith(`${no}.`)))
                : prev.filter(d => d.no !== no);
            const majors = remaining.filter(d => (d.level ?? 0) === 0);
            const renumbered: DiscussionLogEntry[] = [];
            majors.forEach((major, mi) => {
                const newMajorNo = String(mi + 1);
                renumbered.push({ ...major, no: newMajorNo });
                remaining
                    .filter(d => d.level === 1 && d.no.startsWith(`${major.no}.`))
                    .forEach((child, ci) => renumbered.push({ ...child, no: `${newMajorNo}.${ci + 1}` }));
            });
            return renumbered;
        });
    };

    const handleActionAssigneeChange = (userId: string) => {
        if (!userId) {
            setNewAction(prev => ({ ...prev, assignedToUserId: null }));
            return;
        }
        const picked = users.find(u => u.id === Number(userId));
        setNewAction(prev => ({
            ...prev,
            assignedToUserId: Number(userId),
            assignedTo: picked ? (formatUserLabel(picked).split(' / ')[0]) : prev.assignedTo,
        }));
    };

    const addActionItemDraft = () => {
        if (!newAction.title.trim()) return;
        setActionItemsDraft(prev => [...prev, newAction]);
        setNewAction({ title: '', description: '', assignedTo: '', assignedToUserId: null, dueDate: '', priority: '' });
    };
    const removeActionItemDraft = (idx: number) => {
        setActionItemsDraft(prev => prev.filter((_, i) => i !== idx));
    };

    const addActionItemNow = async () => {
        if (!newAction.title.trim() || !existingItem?.documentNumber) return;
        try {
            const now = new Date().toISOString();
            const created = await addFollowUp({
                title: newAction.title,
                description: newAction.description || '',
                status: 'Open',
                priority: newAction.priority || undefined,
                assignedTo: newAction.assignedTo || undefined,
                assignedToUserId: newAction.assignedToUserId ?? undefined,
                vendor: formData.contractor || undefined,
                dueDate: newAction.dueDate || undefined,
                createdAt: now,
                updatedAt: now,
                sourceModule: 'MEETING',
                sourceReferenceNo: existingItem.documentNumber,
            } as any);
            setLinkedActionItems(prev => [...prev, created as unknown as LinkedActionItem]);
            setNewAction({ title: '', description: '', assignedTo: '', assignedToUserId: null, dueDate: '', priority: '' });
        } catch (err: any) {
            toast.error(err?.response?.data?.detail || (err as Error)?.message || t('common.saveFailed'));
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(
                { ...formData, attendees, discussionLog, attachments: [] },
                pendingFiles,
                actionItemsDraft,
            );
        } catch (err: any) {
            toast.error(err?.response?.data?.detail || (err as Error)?.message || t('common.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    // Voiding a Published record is the one change its otherwise-locked
    // fieldset can't reach (the whole form is disabled once Published —
    // see the readOnly prop passed in from MeetingMinutes.tsx). This sends
    // the same unchanged formData as a normal save, just with status
    // flipped to Void — the backend's diff-check (meeting_minutes_service.py
    // update_meeting_minutes) only allows exactly this one field to change
    // on a Published record, so nothing else can sneak through even though
    // formData is sent in full.
    const handleVoidClick = async () => {
        if (!window.confirm(t('meetingMinutes.confirmVoid') || 'Void this meeting minute? This cannot be undone.')) return;
        setSaving(true);
        try {
            await onSave(
                { ...formData, status: 'Void', attendees, discussionLog, attachments: [] },
                [],
                [],
            );
        } catch (err: any) {
            toast.error(err?.response?.data?.detail || (err as Error)?.message || t('common.saveFailed'));
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
    const [printAttachments, setPrintAttachments] = useState<{ name: string; url: string }[]>([]);
    useEffect(() => {
        if (!isPrinting) return;
        const timer = setTimeout(() => window.print(), 200);
        const onAfterPrint = () => setIsPrinting(false);
        window.addEventListener('afterprint', onAfterPrint);
        return () => { clearTimeout(timer); window.removeEventListener('afterprint', onAfterPrint); };
    }, [isPrinting]);

    const handlePrintClick = async () => {
        let files: { name: string; url: string }[] = [];
        if (existingItem?.id) {
            try {
                const a = await getEntityFiles('meeting', existingItem.id, 'attachment');
                files = a.map(f => ({ name: f.file_name, url: getAuthenticatedFileUrl(f.file_url) }));
            } catch {/* no attachments to show */}
        }
        setPrintAttachments(files);
        setIsPrinting(true);
    };

    return (
        <div className={formStyles.modalOverlay}>
            <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={formStyles.modalHeader}>
                    <h2>{readOnly ? t('meetingMinutes.viewTitle') : existingItem ? t('meetingMinutes.editTitle') : t('meetingMinutes.addTitle')}</h2>
                    <button type="button" className={formStyles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={formStyles.modalBody}>
                    <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }}>
                        <div className={formStyles.formSections}>
                            {/* 基本資料 */}
                            <div className={formStyles.formSection}>
                                <h3 className={formStyles.sectionTitle}>{t('meetingMinutes.infoSection')}</h3>
                                <div className={formStyles.formGrid}>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('meetingMinutes.refNo')}</label>
                                        <input type="text" className={formStyles.formInput} value={existingItem?.documentNumber || t('form.autoGenerated')} readOnly style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed' }} />
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('meetingMinutes.status')}</label>
                                        <select className={formStyles.formSelect} value={formData.status} onChange={(e) => handleFieldChange('status', e.target.value)}>
                                            <option value="Draft">Draft</option>
                                            <option value="Published">Published</option>
                                            <option value="Void">Void</option>
                                        </select>
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('meetingMinutes.rev')}</label>
                                        <input type="text" className={formStyles.formInput} value={formData.rev} onChange={(e) => handleFieldChange('rev', e.target.value)} />
                                    </div>
                                    <div className={formStyles.formGroupFull}>
                                        <label>{t('meetingMinutes.meetingTitle')}</label>
                                        <input type="text" className={formStyles.formInput} value={formData.title} onChange={(e) => handleFieldChange('title', e.target.value)} />
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('meetingMinutes.meetingType')}</label>
                                        <select className={formStyles.formSelect} value={formData.meetingType} onChange={(e) => handleFieldChange('meetingType', e.target.value)}>
                                            <option value="">-- {t('common.pleaseSelect') || 'Select'} --</option>
                                            <option value="週會">{t('meetingMinutes.typeWeekly')}</option>
                                            <option value="月會">{t('meetingMinutes.typeMonthly')}</option>
                                        </select>
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('common.contractor')}</label>
                                        <select className={formStyles.formSelect} value={formData.contractor} onChange={(e) => handleFieldChange('contractor', e.target.value)}>
                                            <option value="">-- {t('common.selectContractor')} --</option>
                                            {getActiveContractors().map(c => (
                                                <option key={c.id} value={c.name}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('meetingMinutes.meetingDate')}</label>
                                        <input type="date" className={formStyles.formInput} value={formData.meetingDate} onChange={(e) => handleFieldChange('meetingDate', e.target.value)} />
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('meetingMinutes.meetingTime')}</label>
                                        <input type="time" className={formStyles.formInput} value={formData.meetingTime} onChange={(e) => handleFieldChange('meetingTime', e.target.value)} />
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('meetingMinutes.location')}</label>
                                        <input type="text" className={formStyles.formInput} value={formData.location} onChange={(e) => handleFieldChange('location', e.target.value)} />
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        <label>{t('meetingMinutes.organizer')}</label>
                                        <input type="text" className={formStyles.formInput} value={formData.organizer} onChange={(e) => handleFieldChange('organizer', e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            {/* 與會人員 */}
                            <div className={formStyles.formSection}>
                                <h3 className={formStyles.sectionTitle}>{t('meetingMinutes.attendeesSection')}</h3>
                                {attendees.map((a, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                        <span style={{ flex: 2 }}>{a.name}</span>
                                        <span style={{ flex: 2, color: '#64748b' }}>{a.company || '-'}</span>
                                        <span style={{ flex: 1, color: '#64748b' }}>{a.role || '-'}</span>
                                        <button type="button" onClick={() => removeAttendeeRow(idx)} style={{ color: '#ef4444' }}><Trash2 size={16} /></button>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input className={formStyles.formInput} list="meeting-attendee-people" placeholder={t('meetingMinutes.attendeeName')} value={newAttendee.name} onChange={(e) => setNewAttendee(prev => ({ ...prev, name: e.target.value }))} style={{ flex: 2 }} />
                                    <input className={formStyles.formInput} placeholder={t('meetingMinutes.attendeeCompany')} value={newAttendee.company} onChange={(e) => setNewAttendee(prev => ({ ...prev, company: e.target.value }))} style={{ flex: 2 }} />
                                    <input className={formStyles.formInput} placeholder={t('meetingMinutes.attendeeRole')} value={newAttendee.role} onChange={(e) => setNewAttendee(prev => ({ ...prev, role: e.target.value }))} style={{ flex: 1 }} />
                                    <button type="button" onClick={addAttendeeRow} className={formStyles.printButton}><Plus size={16} /></button>
                                </div>
                            </div>

                            {/* 討論/決議紀錄 */}
                            <div className={formStyles.formSection}>
                                <h3 className={formStyles.sectionTitle}>{t('meetingMinutes.discussionSection')}</h3>

                                <div style={{ display: 'flex', gap: 4, marginBottom: 10, borderBottom: '1px solid #e2e8f0' }}>
                                    {(['active', 'closed'] as const).map(tab => (
                                        <button
                                            key={tab}
                                            type="button"
                                            onClick={() => setDiscussionTab(tab)}
                                            style={{
                                                padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer',
                                                fontWeight: discussionTab === tab ? 700 : 400,
                                                borderBottom: discussionTab === tab ? '2px solid #92702a' : '2px solid transparent',
                                                color: discussionTab === tab ? '#92702a' : '#64748b',
                                            }}
                                        >
                                            {tab === 'active' ? t('meetingMinutes.tabActive') : t('meetingMinutes.tabClosed')}
                                        </button>
                                    ))}
                                </div>

                                {discussionLog.filter(d => (d.level ?? 0) === 0).map((major) => {
                                    const allSubs = discussionLog.filter(d => d.level === 1 && d.no.startsWith(`${major.no}.`));
                                    const visibleSubs = allSubs.filter(d => discussionTab === 'active' ? d.status !== 'Closed' : d.status === 'Closed');
                                    // Skip a topic in the Closed tab if none of its items are closed; in the
                                    // Active tab, still show topics with zero sub-items yet so the user can
                                    // add the first one.
                                    if (discussionTab === 'closed' && visibleSubs.length === 0) return null;
                                    const draft = getSubDraft(major.no);
                                    return (
                                        <div key={major.no} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <strong>{major.no}. {major.content}</strong>
                                                {!readOnly && (
                                                    <button type="button" onClick={() => removeDiscussionRow(major.no)} style={{ color: '#ef4444' }}><Trash2 size={16} /></button>
                                                )}
                                            </div>
                                            {visibleSubs.map(sub => (
                                                <div key={sub.no} style={{ marginTop: 8, paddingLeft: 14, borderLeft: '2px solid #e2e8f0' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ fontWeight: 600 }}>{sub.no}</span>
                                                        {!readOnly && (
                                                            <button type="button" onClick={() => removeDiscussionRow(sub.no)} style={{ color: '#ef4444' }}><Trash2 size={14} /></button>
                                                        )}
                                                    </div>
                                                    {sub.content && <p style={{ margin: '4px 0', color: '#334155', whiteSpace: 'pre-wrap' }}>{sub.content}</p>}
                                                    <p style={{ margin: '4px 0', color: '#64748b', fontSize: 13 }}>
                                                        {sub.owner && <>{t('meetingMinutes.itemOwner')}: {sub.owner}　</>}
                                                        {t('meetingMinutes.itemStatus')}: {sub.status === 'Closed' ? t('meetingMinutes.itemStatusClosed') : t('meetingMinutes.itemStatusOpen')}
                                                    </p>
                                                </div>
                                            ))}
                                            {!readOnly && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, paddingLeft: 14, borderLeft: '2px dashed #cbd5e1' }}>
                                                    <textarea className={formStyles.formTextarea} placeholder={t('meetingMinutes.topicDiscussion')} rows={2} value={draft.content} onChange={(e) => setSubDraft(major.no, { content: e.target.value })} />
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <input className={formStyles.formInput} list="meeting-attendee-people" placeholder={t('meetingMinutes.itemOwner')} value={draft.owner} onChange={(e) => setSubDraft(major.no, { owner: e.target.value })} style={{ flex: 2 }} />
                                                        <select className={formStyles.formSelect} value={draft.status} onChange={(e) => setSubDraft(major.no, { status: e.target.value })} style={{ flex: 1 }}>
                                                            <option value="Open">{t('meetingMinutes.itemStatusOpen')}</option>
                                                            <option value="Closed">{t('meetingMinutes.itemStatusClosed')}</option>
                                                        </select>
                                                    </div>
                                                    <button type="button" onClick={() => addSubItem(major.no)} className={formStyles.printButton} style={{ alignSelf: 'flex-start' }}><Plus size={14} /> {t('meetingMinutes.addSubItem')}</button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {!readOnly && (
                                    <div style={{ display: 'flex', gap: 8, border: '1px dashed #cbd5e1', borderRadius: 8, padding: 10 }}>
                                        <input className={formStyles.formInput} placeholder={t('meetingMinutes.addMajorTopic')} value={newTopicTitle} onChange={(e) => setNewTopicTitle(e.target.value)} style={{ flex: 1 }} />
                                        <button type="button" onClick={addMajorTopic} className={formStyles.printButton}><Plus size={16} /> {t('meetingMinutes.addMajorTopic')}</button>
                                    </div>
                                )}
                            </div>

                            {/* 行動項目 */}
                            <div className={formStyles.formSection}>
                                <h3 className={formStyles.sectionTitle}>{t('meetingMinutes.actionItemsSection')}</h3>
                                {!existingItem ? (
                                    <>
                                        {actionItemsDraft.map((a, idx) => (
                                            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                                <span style={{ flex: 2 }}>{a.title}</span>
                                                <span style={{ flex: 1, color: '#64748b' }}>{a.assignedTo || '-'}</span>
                                                <span style={{ flex: 1, color: '#64748b' }}>{a.dueDate || '-'}</span>
                                                <button type="button" onClick={() => removeActionItemDraft(idx)} style={{ color: '#ef4444' }}><Trash2 size={16} /></button>
                                            </div>
                                        ))}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                            <input className={formStyles.formInput} placeholder={t('meetingMinutes.actionTitle')} value={newAction.title} onChange={(e) => setNewAction(prev => ({ ...prev, title: e.target.value }))} style={{ flex: 2 }} />
                                            <input className={formStyles.formInput} placeholder={t('followup.assignedTo')} value={newAction.assignedTo} onChange={(e) => setNewAction(prev => ({ ...prev, assignedTo: e.target.value }))} style={{ flex: 1 }} />
                                            <select className={formStyles.formSelect} value={newAction.assignedToUserId ?? ''} onChange={(e) => handleActionAssigneeChange(e.target.value)} style={{ flex: 1 }}>
                                                <option value="">{t('common.selectPlaceholder') || 'Select user...'}</option>
                                                {users.map(u => (<option key={u.id} value={u.id}>{formatUserLabel(u)}</option>))}
                                            </select>
                                            <input type="date" className={formStyles.formInput} value={newAction.dueDate} onChange={(e) => setNewAction(prev => ({ ...prev, dueDate: e.target.value }))} style={{ flex: 1 }} />
                                            <button type="button" onClick={addActionItemDraft} className={formStyles.printButton}><Plus size={16} /></button>
                                        </div>
                                        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>{t('meetingMinutes.actionItemsHint')}</p>
                                    </>
                                ) : (
                                    <>
                                        {loadingActionItems ? (
                                            <p>{t('common.loading')}</p>
                                        ) : linkedActionItems.length === 0 ? (
                                            <p style={{ color: '#94a3b8' }}>{t('meetingMinutes.noActionItems')}</p>
                                        ) : (
                                            linkedActionItems.map((a) => (
                                                <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                                    <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}>{a.issueNo}</span>
                                                    <span style={{ flex: 2 }}>{a.title}</span>
                                                    <span style={{ flex: 1, color: '#64748b' }}>{a.assignedTo || '-'}</span>
                                                    <span style={{ flex: 1, color: '#64748b' }}>{a.status}</span>
                                                </div>
                                            ))
                                        )}
                                        {!readOnly && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                                                <input className={formStyles.formInput} placeholder={t('meetingMinutes.actionTitle')} value={newAction.title} onChange={(e) => setNewAction(prev => ({ ...prev, title: e.target.value }))} style={{ flex: 2 }} />
                                                <input className={formStyles.formInput} placeholder={t('followup.assignedTo')} value={newAction.assignedTo} onChange={(e) => setNewAction(prev => ({ ...prev, assignedTo: e.target.value }))} style={{ flex: 1 }} />
                                                <select className={formStyles.formSelect} value={newAction.assignedToUserId ?? ''} onChange={(e) => handleActionAssigneeChange(e.target.value)} style={{ flex: 1 }}>
                                                    <option value="">{t('common.selectPlaceholder') || 'Select user...'}</option>
                                                    {users.map(u => (<option key={u.id} value={u.id}>{formatUserLabel(u)}</option>))}
                                                </select>
                                                <input type="date" className={formStyles.formInput} value={newAction.dueDate} onChange={(e) => setNewAction(prev => ({ ...prev, dueDate: e.target.value }))} style={{ flex: 1 }} />
                                                <button type="button" onClick={addActionItemNow} className={formStyles.printButton}><Plus size={16} /></button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* 附件 */}
                            <div className={formStyles.formSection}>
                                <h3 className={formStyles.sectionTitle}>{t('common.attachments')}</h3>
                                <FileAttachment
                                    id="meeting-attachments"
                                    entityType={existingItem ? 'meeting' : undefined}
                                    entityId={existingItem?.id}
                                    category="attachment"
                                    onPendingFilesChange={setPendingFiles}
                                    readOnly={readOnly}
                                    hideTitle
                                />
                            </div>
                        </div>
                    </fieldset>
                    <datalist id="meeting-attendee-people">
                        {Array.from(new Set(users.map(u => u.full_name || u.username).filter(Boolean))).map(name => (
                            <option key={name} value={name} />
                        ))}
                    </datalist>
                </div>
                <div className={formStyles.modalActions}>
                    {!readOnly && (
                        <button type="button" className={formStyles.saveButton} onClick={handleSave} disabled={saving}>
                            {saving ? t('common.saving') : t('common.save')}
                        </button>
                    )}
                    {readOnly && existingItem?.status === 'Published' && hasPermission('meeting:update:all') && (
                        <button type="button" className={formStyles.cancelButton} onClick={handleVoidClick} disabled={saving} title={t('meetingMinutes.voidAction') || 'Void'}>
                            {t('meetingMinutes.voidAction') || 'Void'}
                        </button>
                    )}
                    {existingItem?.id && (
                        <button type="button" className={formStyles.printButton} onClick={handlePrintClick} disabled={saving} title={t('common.print') || 'Print'}>
                            {t('common.print') || 'Print'}
                        </button>
                    )}
                    {existingItem?.id && hasPermission('meeting:create:all') && (
                        <button type="button" className={formStyles.printButton} onClick={handleNewOccurrenceClick} disabled={saving || spawningOccurrence} title={t('meetingMinutes.newOccurrenceTitle') || 'Create the next occurrence of this recurring meeting, reusing its document number'}>
                            {spawningOccurrence ? (t('common.saving') || '...') : (t('meetingMinutes.newOccurrence') || 'New Occurrence')}
                        </button>
                    )}
                    <button type="button" className={formStyles.cancelButton} onClick={onClose} disabled={saving}>
                        {t('common.cancel')}
                    </button>
                </div>
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
                        location: formData.location,
                        organizer: formData.organizer,
                    }}
                    attendees={attendees}
                    discussionLog={discussionLog}
                    attachmentFiles={printAttachments}
                />,
                document.body
            )}
        </div>
    );
};

export const submitActionItemsDraft = async (drafts: ActionItemDraft[], documentNumber: string, vendor?: string): Promise<void> => {
    if (drafts.length === 0) return;
    const now = new Date().toISOString();
    await bulkCreateFollowUps(drafts.map(d => ({
        title: d.title,
        description: d.description || '',
        status: 'Open',
        priority: d.priority || undefined,
        assignedTo: d.assignedTo || undefined,
        assignedToUserId: d.assignedToUserId ?? undefined,
        vendor: vendor || undefined,
        dueDate: d.dueDate || undefined,
        createdAt: now,
        updatedAt: now,
        sourceModule: 'MEETING',
        sourceReferenceNo: documentNumber,
    })));
};
