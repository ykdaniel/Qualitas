import { useDraftGuard } from '../../Shared/LeaveGuard';
import FormActions from '../../Shared/FormActions';
import actionStyles from '../../Shared/FormActions.module.css';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useLanguage } from '../../../context/LanguageContext';
import { useContractorsStore } from '../../../store/contractorsStore';
import { useITPStore } from '../../../store/itpStore';
import { useNCRStore } from '../../../store/ncrStore';
import { useOBSStore } from '../../../store/obsStore';
import { useITRStore } from '../../../store/itrStore';
import type { NOIItem } from '../../../store/noiStore';
import { validateStatusTransition, NOIStatusTransitions, NOIStatusTransitionList, validateRequiredFields, NOIValidationRules } from '../../../utils/statusValidation';
import { checkDateOrder } from '../../../utils/dateValidation';
import FileAttachment from '../../Shared/FileAttachment';
import { exportNoiDocx, getNoiContractorContact } from '../../../services/api';
import RelatedDocuments from '../../ui/RelatedDocuments';
import styles from '../NOI.module.css';
import formStyles from '../../Shared/FormShell.module.css';
import { NOIDetailData } from '../NOITypes';
import { DateIssueBanner } from '../../Shared/DateIssueMark';
import { AttachmentsBlockedNotice, SaveFollowUpBanner } from '../../Shared/SaveFollowUpBanner';
import { NOI_DATE_FIELDS, preserveHistoricalDates } from '../../../utils/dateIssues';
import { followUpOf } from '../../../utils/saveFlow';
import type { FollowUp, SaveOutcome } from '../../../utils/saveFlow';
import { describeSaveError, presentOutcome } from '../../../utils/saveErrors';

export interface NOIDetailModalProps {
    noiId: string | null;
    readOnly?: boolean;
    /** false when the account may not upload / remove attachments (no update permission): the file controls are read-only and a notice says why. */
    attachmentsAllowed?: boolean;
    existingData?: NOIDetailData;
    existingItem?: NOIItem;
    noiList: NOIItem[];
    onSave: (details: NOIDetailData, pendingFiles: File[], deletedFileIds: string[]) => Promise<SaveOutcome>;
    /** Retries only the unfinished file steps of a record that is already stored (never writes the record). */
    onRetryFiles?: (pendingFiles: File[], deletedFileIds: string[]) => Promise<SaveOutcome>;
    onClose: () => void;
    onPrint?: (data: NOIDetailData) => void;
}

type ContactField = 'contacts' | 'phone' | 'email';
type ContactSource = Record<ContactField, 'system' | 'user'>;
const CONTACT_FIELD_LABEL_KEY: Record<ContactField, string> = {
    contacts: 'contractors.contact',
    phone: 'contractors.phone',
    email: 'contractors.email',
};

export const NOIDetailModal: React.FC<NOIDetailModalProps> = ({ noiId: _noiId, readOnly = false, existingData, existingItem, noiList: _noiList, onSave, onRetryFiles, onClose, onPrint, attachmentsAllowed = true }) => {
    const { t } = useLanguage();
    const { getActiveContractors } = useContractorsStore();
    const itpList = useITPStore(state => state.itpList);
    const getITPByVendor = React.useCallback((vendor: string) => itpList.filter(itp => itp.vendor === vendor), [itpList]);
    const ncrList = useNCRStore(state => state.ncrList);
    const obsList = useOBSStore(state => state.obsList);
    const itrList = useITRStore(state => state.itrList);
    const getNCRList = () => ncrList;

    const getInitialData = (): NOIDetailData => {
        if (existingData) {
            return { ...existingData, attachments: existingData.attachments || [], ncrNumber: existingData.ncrNumber || 'N/A' };
        }
        if (existingItem) {
            return {
                package: existingItem.package || '',
                referenceNo: existingItem.referenceNo || '',
                issueDate: existingItem.issueDate || '',
                inspectionDate: existingItem.inspectionDate || '',
                inspectionTime: existingItem.inspectionTime || '',
                itpNo: existingItem.itpNo || '',
                eventNumber: existingItem.eventNumber || '',
                checkpoint: existingItem.checkpoint || '',
                type: existingItem.type || '',
                contractor: existingItem.contractor || '',
                contacts: existingItem.contacts || '',
                phone: existingItem.phone || '',
                email: existingItem.email || '',
                status: existingItem.status || 'Open',
                remark: existingItem.remark || '',
                closeoutDate: existingItem.closeoutDate || '',
                attachments: existingItem.attachments || [],
                ncrNumber: existingItem.ncrNumber || 'N/A',
                dueDate: (existingItem as any).dueDate || '',
            };
        }
        const activeContractors = getActiveContractors();
        const defaultContractorRecord = activeContractors.length > 0 ? activeContractors[0] : undefined;
        return {
            package: '',
            referenceNo: '',
            issueDate: '',
            inspectionDate: '',
            inspectionTime: '',
            itpNo: '',
            eventNumber: '',
            checkpoint: '',
            type: '',
            contractor: defaultContractorRecord?.name || '',
            // Pre-selecting the first active contractor also pre-fills its contact
            // info — fetched right after mount (the picker list carries no contact
            // details, CONTRACTOR-OPTIONS-2026-001); these three stay marked
            // 'system' so a later contractor change can still safely overwrite them.
            contacts: '',
            phone: '',
            email: '',
            status: 'Open',
            remark: '',
            closeoutDate: '',
            attachments: [],
            ncrNumber: 'N/A',
            dueDate: '',
        };
    };

    // A brand-new record's contact fields came from the pre-selected contractor
    // ('system'); an existing record's contact fields are historical data and
    // must never be silently overwritten by a later contractor change ('user').
    const getInitialContactSource = (): ContactSource => {
        const source: 'system' | 'user' = (existingData || existingItem) ? 'user' : 'system';
        return { contacts: source, phone: source, email: source };
    };

    const [formData, setFormData] = useState<NOIDetailData>(getInitialData());
    const [contactSource, setContactSource] = useState<ContactSource>(getInitialContactSource());
    // The async contact fetch below must see the CURRENT sources (a field the user types into while the
    // request is in flight becomes 'user' and must not be overwritten when the answer arrives).
    const contactSourceRef = useRef(contactSource);
    contactSourceRef.current = contactSource;
    const contactRequestRef = useRef(0);
    const { hasPermission } = useAuth();
    const canReadContacts = hasPermission('noi:create:all') || hasPermission('noi:update:all');

    // Fill the given system-sourced contact fields from the selected contractor's contact details
    // (GET /noi/contractor-contact/{id}, needs NOI create or update). Only the latest request counts,
    // only if the contractor is still the selected one, and only fields still 'system' at that moment.
    const fillContactFromContractor = async (contractorName: string, fields: ContactField[]) => {
        const seq = ++contactRequestRef.current;
        const contractor = getActiveContractors().find(c => c.name === contractorName);
        if (!contractor || fields.length === 0 || !canReadContacts) return;
        try {
            const contact = await getNoiContractorContact(contractor.id);
            if (seq !== contactRequestRef.current) return;
            setFormData(prev => {
                if (prev.contractor !== contractorName) return prev;
                const next = { ...prev };
                fields.forEach(field => {
                    if (contactSourceRef.current[field] !== 'system') return;
                    next[field] = (field === 'contacts' ? contact.contactPerson : contact[field]) || '';
                });
                return next;
            });
        } catch (err) {
            // No auto-fill (the fields stay as they are); the user can type the contact details.
            console.error('Failed to load contractor contact for NOI:', err);
        }
    };

    // A brand-new NOI pre-selects the first active contractor: fetch its contact details once.
    useEffect(() => {
        if (existingData || existingItem || readOnly || !formData.contractor) return;
        void fillContactFromContractor(formData.contractor, ['contacts', 'phone', 'email']);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredITPList = useMemo(() => {
        if (!formData.contractor) return [];
        return getITPByVendor(formData.contractor);
    }, [formData.contractor, getITPByVendor]);

    const validation = useMemo(
        () => validateRequiredFields(formData, formData.status, NOIValidationRules),
        [formData]
    );
    const isFormValid = validation.valid;
    const errors = useMemo(() => {
        const map: Record<string, boolean> = {};
        validation.invalidFields.forEach(f => { map[f] = true; });
        return map;
    }, [validation]);

    const handleFieldChange = (field: keyof NOIDetailData, value: string) => {
        if (field === 'contacts' || field === 'phone' || field === 'email') {
            setContactSource(prev => ({ ...prev, [field]: 'user' }));
        }
        setFormData(prev => {
            const updated = { ...prev, [field]: value };
            if (field === 'status' && prev.status) {
                const validation = validateStatusTransition(prev.status, value, NOIStatusTransitionList);
                if (!validation.allowed) {
                    toast.warning(validation.message || t('common.invalidStatusTransition'));
                    return prev;
                }
                if (value !== 'Reject' && updated.ncrNumber && updated.ncrNumber !== 'N/A') {
                    toast.warning("NOI 含有 NCR，狀態必須為不通過（Reject）");
                    return prev;
                }
            }
            if (field === 'ncrNumber' && value && value !== 'N/A') {
                updated.status = 'Reject';
            }
            if (field === 'ncrNumber' && (!value || value === 'N/A') && prev.status === 'Reject') {
                updated.status = 'Open';
            }
            if (field === 'contractor' && value) {
                updated.itpNo = '';
            }
            if (field === 'issueDate' || field === 'inspectionDate') {
                const check = checkDateOrder(updated.issueDate, updated.inspectionDate, t('noi.issueDate') || 'Issue Date', t('noi.inspectionDate') || 'Inspection Date');
                if (!check.valid) toast.warning(check.message);
            }
            return updated;
        });
    };

    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [deletedFileIds, setDeletedFileIds] = useState<string[]>([]);

    const handlePendingFilesChange = (files: File[]) => {
        setPendingFiles(files);
    };

    const handleDeleteExistingFile = (fileId: string) => {
        setDeletedFileIds(prev => [...prev, fileId]);
        setFormData(prev => ({
            ...prev,
            attachments: prev.attachments.filter(a => typeof a !== 'string' && a.id !== fileId)
        }));
    };

    const handleRemoveLegacyAttachment = (index: number) => {
        setFormData(prev => ({
            ...prev,
            attachments: prev.attachments.filter((_, i) => i !== index)
        }));
    };

    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState<string>('');

    const handlePreview = (url: string, name?: string) => {
        setPreviewUrl(url);
        setPreviewName(name || '');
    };

    const navigate = useNavigate();
    const [saving, setSaving] = useState(false);
    // Contact fields still filled by the system (from the selected contractor) are compared as blank: they arrive
    // asynchronously after the first render (CONTRACTOR-OPTIONS-2026-001), and an auto-fill is not a user change. A field
    // the user edits becomes 'user' and is compared as usual; changing the contractor itself still counts.
    const guardedFormData = {
        ...formData,
        contacts: contactSource.contacts === 'system' ? '' : formData.contacts,
        phone: contactSource.phone === 'system' ? '' : formData.phone,
        email: contactSource.email === 'system' ? '' : formData.email,
    };
    const leaveGuard = useDraftGuard({ formData: guardedFormData, pendingFiles, deletedFileIds }, saving, !readOnly);
    const requestClose = () => leaveGuard.requestClose(onClose);
    // Bumped once the pending files are stored on the server, so FileAttachment forgets them (a retry must not upload them twice).
    const [syncToken, setSyncToken] = useState(0);

    // What is still owed after a "saved, but a file step failed" outcome (see SaveFollowUpBanner).
    const [followUp, setFollowUp] = useState<FollowUp | null>(null);
    // Shared by "Save" and "retry remaining files": trims what already went through, shows the ONE message, closes only when done.
    const applyOutcome = (outcome: SaveOutcome, created: boolean) => {
        if (outcome.status === 'saved-incomplete') {
            // The record is stored. Drop what already went through so a retry only redoes the rest.
            if (outcome.uploadedCategories.includes('attachment')) {
                setPendingFiles([]);
                setSyncToken(n => n + 1);
                // show the files that are on the server now (this modal's list comes from the form, not from a fetch)
                const stored = (outcome.uploaded.attachment ?? []) as NOIDetailData['attachments'];
                setFormData(prev => ({ ...prev, attachments: [...prev.attachments, ...stored] }));
            }
            setDeletedFileIds(outcome.remainingDeletes);
            setFollowUp(prev => followUpOf(outcome, prev?.created ?? created));
        } else if (outcome.status !== 'failed') {
            setFollowUp(null);
        }
        const { close, notice } = presentOutcome(outcome, t);
        if (notice) (notice.level === 'error' ? toast.error : toast.warning)(notice.text, { duration: 10000 });
        if (close) { leaveGuard.release(); onClose(); }
    };

    const handleSave = async () => {
        if (!validation.valid) {
            const msg = validation.message || 'Error';
            toast.error(t(msg) === msg && msg.includes('.') ? msg : t(msg));
            return;
        }

        // P4: Cascade Validation - Blocks closing NOI if linked NCR or OBS is still Open
        if (formData.status === 'Closed' && formData.referenceNo) {
            const openNcrs = ncrList.filter(ncr => ncr.noiNumber === formData.referenceNo && ncr.status === 'Open');
            const openObs = obsList.filter(obs => obs.noiNumber === formData.referenceNo && obs.status === 'Open');

            if (openNcrs.length > 0 || openObs.length > 0) {
                const totalOpen = openNcrs.length + openObs.length;
                toast.warning(`Cannot close NOI: There are still ${totalOpen} open NCR/OBS associated with this inspection. Please close them first.`);
                return;
            }

            // 勾稽鎖定：關閉 NOI 前確認其下所有 ITR 已完結（Approved 或 Void）
            const openItrs = itrList.filter(
                itr => itr.noiNumber === formData.referenceNo &&
                    itr.status !== 'Approved' && itr.status !== 'Void'
            );
            if (openItrs.length > 0) {
                toast.warning(`Cannot close NOI: ${openItrs.length} ITR(s) still in progress. Please ensure all ITRs are Approved or Void first.`);
                return;
            }
        }

        setSaving(true);
        try {
            // an invalid stored date must not be erased by a blank <input type="date"> (it cannot display an invalid string)
            const dataToSave: NOIDetailData = preserveHistoricalDates({
                ...formData,
                ncrNumber: formData.ncrNumber === 'N/A' ? '' : formData.ncrNumber,
            }, existingItem, NOI_DATE_FIELDS);
            applyOutcome(await onSave(dataToSave, pendingFiles, deletedFileIds), !existingItem);
        } catch (err) {
            toast.error(t('saveFlow.failedKeep', { message: describeSaveError(err, t) }), { duration: 10000 });
        } finally {
            setSaving(false);
        }
    };
    // Retries only the unfinished file steps: the record itself is not written (that needs update permission the user may not have).
    const retryFiles = async () => {
        if (!onRetryFiles) return;
        setSaving(true);
        try {
            applyOutcome(await onRetryFiles(pendingFiles, deletedFileIds), false);
        } catch (err) {
            toast.error(t('saveFlow.failedKeep', { message: describeSaveError(err, t) }), { duration: 10000 });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={formStyles.modalOverlay}>
            <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={formStyles.modalHeader}>
                    <h2>{readOnly ? t('noi.viewTitle') : existingData || existingItem ? t('noi.editTitle') : t('noi.addTitle')}</h2>
                    <button className={formStyles.closeButton} aria-label={t('common.close')} title={t('common.close')} onClick={requestClose}>×</button>
                </div>
                <div className={formStyles.modalBody}>
                    <DateIssueBanner item={existingItem} />
                    {!readOnly && !attachmentsAllowed && <AttachmentsBlockedNotice creating={!existingItem} />}
                    <SaveFollowUpBanner followUp={followUp} canEditFields={!readOnly} canRetry={attachmentsAllowed} busy={saving} onRetry={() => { void retryFiles(); }} />
                    {!readOnly && (
                    <p className={formStyles.formRequiredHint}>{t('form.requiredHint')}</p>
                    )}
                    {/* A single disabled fieldset locks every input/select/textarea
                        and inline button below in one shot when readOnly. */}
                    <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }}>
                    <div className={formStyles.formSections}>
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('noi.detailsTitle')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('common.referenceNo')}</label>
                                    <input type="text" className={formStyles.formInput} value={formData.referenceNo || t('form.autoGenerated')} readOnly style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: formData.referenceNo ? '#000000' : '#666666' }} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.requiredLabel}>{t('common.contractor')}</label>
                                    <select
                                        className={`${formStyles.formSelect}${errors.contractor ? ' ' + formStyles.errorInput : ''}`}
                                        value={formData.contractor}
                                        onChange={(e) => {
                                            const newContractorName = e.target.value;
                                            if (!newContractorName) {
                                                // Clearing the contractor selection does not touch the
                                                // contact fields or their source status — those values
                                                // may already be user-confirmed for this inspection.
                                                contactRequestRef.current++;  // an answer still in flight no longer applies
                                                setFormData(prev => ({ ...prev, contractor: '', itpNo: '' }));
                                                return;
                                            }
                                            // Computed from the current contactSource BEFORE calling setFormData:
                                            // the functional updater passed below is not guaranteed to run
                                            // synchronously, so any decision that depends on "what happened in
                                            // the updater" must not be derived from a side effect inside it.
                                            const systemFields = (['contacts', 'phone', 'email'] as ContactField[]).filter(f => contactSource[f] === 'system');
                                            const keptFields = (['contacts', 'phone', 'email'] as ContactField[]).filter(f => contactSource[f] !== 'system');
                                            setFormData(prev => {
                                                const next = { ...prev, contractor: newContractorName, itpNo: '' };
                                                systemFields.forEach(field => {
                                                    // System-sourced fields always follow the newly selected
                                                    // contractor, including when that contractor's own field is
                                                    // blank: cleared now, filled when its contact details arrive.
                                                    next[field] = '';
                                                });
                                                return next;
                                            });
                                            void fillContactFromContractor(newContractorName, systemFields);
                                            if (keptFields.length > 0) {
                                                const fieldLabels = keptFields.map(f => t(CONTACT_FIELD_LABEL_KEY[f])).join('、');
                                                toast.info(t('noi.contactKeptOnContractorChange', { fields: fieldLabels }));
                                            }
                                        }}
                                    >
                                        <option value="">{t('common.selectPlaceholder')}</option>
                                        {getActiveContractors().map((contractor) => (
                                            <option key={contractor.id} value={contractor.name}>{contractor.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.requiredLabel}>{t('noi.ncrReference')}</label>
                                    <select className={`${formStyles.formSelect}${errors.ncrNumber ? ' ' + formStyles.errorInput : ''}`} value={formData.ncrNumber} onChange={(e) => handleFieldChange('ncrNumber', e.target.value)}>
                                        <option value="N/A">{t('common.na')}</option>
                                        {getNCRList().map((ncr) => (
                                            <option key={ncr.id} value={ncr.documentNumber || ''}>{ncr.documentNumber || `(${t('common.tbc')})`}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.requiredLabel}>{t('noi.package')}</label>
                                    <input type="text" className={`${formStyles.formInput}${errors.package ? ' ' + formStyles.errorInput : ''}`} value={formData.package} onChange={(e) => handleFieldChange('package', e.target.value)} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formData.status !== 'Reject' ? formStyles.requiredLabel : undefined}>{t('noi.itpNo')}</label>
                                    <select className={`${formStyles.formSelect}${errors.itpNo ? ' ' + formStyles.errorInput : ''}`} value={formData.itpNo} onChange={(e) => handleFieldChange('itpNo', e.target.value)} disabled={!formData.contractor && !formData.itpNo}>
                                        <option value="">{formData.contractor ? t('common.selectPlaceholder') : t('pqp.allContractors')}</option>
                                        {filteredITPList.map((itp) => (
                                            <option key={itp.id} value={itp.referenceNo || ''}>{itp.referenceNo || `(${t('common.tbc')})`}</option>
                                        ))}
                                        {formData.itpNo && !filteredITPList.some(itp => itp.referenceNo === formData.itpNo) && (
                                            <option key="current-missing" value={formData.itpNo}>{formData.itpNo}</option>
                                        )}
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.requiredLabel}>{t('noi.issueDate')}</label>
                                    <input
                                        type={formData.issueDate ? 'date' : 'text'}
                                        placeholder="mm/dd/yyyy"
                                        lang="en"
                                        onFocus={(e) => (e.target.type = 'date')}
                                        onBlur={(e) => {
                                            if (!e.target.value) e.target.type = 'text';
                                        }}
                                        className={`${formStyles.formInput}${errors.issueDate ? ' ' + formStyles.errorInput : ''}`}
                                        value={formData.issueDate}
                                        onChange={(e) => handleFieldChange('issueDate', e.target.value)}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.requiredLabel}>{t('noi.inspectionDate')}</label>
                                    <input
                                        type={formData.inspectionDate ? 'date' : 'text'}
                                        placeholder="mm/dd/yyyy"
                                        lang="en"
                                        onFocus={(e) => (e.target.type = 'date')}
                                        onBlur={(e) => {
                                            if (!e.target.value) e.target.type = 'text';
                                        }}
                                        className={`${formStyles.formInput}${errors.inspectionDate ? ' ' + formStyles.errorInput : ''}`}
                                        value={formData.inspectionDate}
                                        onChange={(e) => handleFieldChange('inspectionDate', e.target.value)}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('common.dueDate')}</label>
                                    <input
                                        type={formData.dueDate ? 'date' : 'text'}
                                        placeholder="mm/dd/yyyy"
                                        lang="en"
                                        onFocus={(e) => (e.target.type = 'date')}
                                        onBlur={(e) => {
                                            if (!e.target.value) e.target.type = 'text';
                                        }}
                                        className={formStyles.formInput}
                                        value={formData.dueDate || ''}
                                        onChange={(e) => handleFieldChange('dueDate', e.target.value)}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.requiredLabel}>{t('noi.inspectionTime')} (24h)</label>
                                    <input type="text" className={`${formStyles.formInput}${errors.inspectionTime ? ' ' + formStyles.errorInput : ''}`} placeholder="HH:mm" value={formData.inspectionTime} onChange={(e) => { const val = e.target.value; if (/^[0-9:]*$/.test(val)) handleFieldChange('inspectionTime', val); }} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.requiredLabel}>{t('noi.eventNo')}</label>
                                    <input type="text" className={`${formStyles.formInput}${errors.eventNumber ? ' ' + formStyles.errorInput : ''}`} value={formData.eventNumber} onChange={(e) => handleFieldChange('eventNumber', e.target.value)} />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.requiredLabel}>{t('noi.checkpoint')}</label>
                                    <select className={`${formStyles.formSelect}${errors.checkpoint ? ' ' + formStyles.errorInput : ''}`} value={formData.checkpoint} onChange={(e) => handleFieldChange('checkpoint', e.target.value)}>
                                        <option value="">{t('common.selectPlaceholder')}</option>
                                        <option value="R">R</option>
                                        <option value="MS">MS</option>
                                        <option value="W">W</option>
                                        <option value="H">H</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('common.contactInfo')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.requiredLabel}>{t('contractors.contact')}</label>
                                    <input type="text" className={`${formStyles.formInput}${errors.contacts ? ' ' + formStyles.errorInput : ''}`} value={formData.contacts} onChange={(e) => handleFieldChange('contacts', e.target.value)} />
                                    {contactSource.contacts === 'system' && formData.contacts && (
                                        <small className={formStyles.fieldHint}>{t(formData.contractor ? 'noi.contactFromContractor' : 'noi.contactFromPreviousContractor')}</small>
                                    )}
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.requiredLabel}>{t('contractors.phone')}</label>
                                    <input type="tel" className={`${formStyles.formInput}${errors.phone ? ' ' + formStyles.errorInput : ''}`} value={formData.phone} onChange={(e) => handleFieldChange('phone', e.target.value)} />
                                    {contactSource.phone === 'system' && formData.phone && (
                                        <small className={formStyles.fieldHint}>{t(formData.contractor ? 'noi.contactFromContractor' : 'noi.contactFromPreviousContractor')}</small>
                                    )}
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label className={formStyles.requiredLabel}>{t('contractors.email')}</label>
                                    <input type="email" className={`${formStyles.formInput}${errors.email ? ' ' + formStyles.errorInput : ''}`} value={formData.email} onChange={(e) => handleFieldChange('email', e.target.value)} />
                                    {contactSource.email === 'system' && formData.email && (
                                        <small className={formStyles.fieldHint}>{t(formData.contractor ? 'noi.contactFromContractor' : 'noi.contactFromPreviousContractor')}</small>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className={formStyles.formSection}>
                            <FileAttachment
                                readOnly={!attachmentsAllowed}
                                attachments={formData.attachments}
                                onPendingFilesChange={handlePendingFilesChange}
                                onRemoveLegacy={handleRemoveLegacyAttachment}
                                onDeleteExistingFile={handleDeleteExistingFile}
                                onPreview={handlePreview}
                                syncToken={syncToken}
                                entityType="noi"
                                entityId={existingItem?.id}
                                category="attachment"
                                id="attachment"
                            />
                        </div>
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('noi.sectionQuality')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('common.status')}</label>
                                    <select className={formStyles.formSelect} value={formData.status} onChange={(e) => handleFieldChange('status', e.target.value)}>
                                        {/* Current status always selectable */}
                                        <option value={formData.status}>{formData.status}</option>
                                        {/* Only show valid next transitions */}
                                        {(NOIStatusTransitions[formData.status] || []).map((s: string) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('noi.closeoutDate')}</label>
                                    <input
                                        type={formData.closeoutDate ? 'date' : 'text'}
                                        placeholder="mm/dd/yyyy"
                                        lang="en"
                                        onFocus={(e) => (e.target.type = 'date')}
                                        onBlur={(e) => {
                                            if (!e.target.value) e.target.type = 'text';
                                        }}
                                        className={formStyles.formInput}
                                        value={formData.closeoutDate}
                                        onChange={(e) => handleFieldChange('closeoutDate', e.target.value)}
                                    />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <label style={{ marginBottom: 0 }}>{t('common.remark')}</label>
                                        <button className={actionStyles.compact} type="button" onClick={() => { const dateStr = new Date().toLocaleDateString(); const newRemark = formData.remark ? `${formData.remark}\n${dateStr}: ` : `${dateStr}: `; handleFieldChange('remark', newRemark); }}>{t('common.addDate')}</button>
                                    </div>
                                    <textarea className={formStyles.formTextarea} value={formData.remark} onChange={(e) => handleFieldChange('remark', e.target.value)} rows={4} />
                                </div>
                            </div>
                        </div>
                        {existingItem?.id && (
                            <RelatedDocuments
                                entityType="noi"
                                entityId={existingItem.id}
                                onOpen={(entityType, id) => {
                                    // Only ITR has a confirmed, symmetric ?openId= consumer
                                    // (ITR.tsx) plus its own existing navigate(-1) return path.
                                    // Every other related-document type keeps its original
                                    // unfiltered-list navigation — unchanged from before this fix.
                                    if (entityType === 'itr') {
                                        navigate(`/itr?openId=${encodeURIComponent(id)}`);
                                        return;
                                    }
                                    navigate(`/${entityType}`);
                                }}
                            />
                        )}
                    </div>
                    </fieldset>
                </div>
                <FormActions
                    tools={<>
                        {onPrint && (
                            <button className={actionStyles.secondary}
                                onClick={() => onPrint(formData)} // Push to left
                            >
                                {t('common.print')}
                            </button>
                        )}
                        {/* Needs a real saved record id to call the export endpoint — same
                            existingItem?.id gate ITR's "Export Word" button uses. */}
                        {existingItem?.id && (
                            <button className={actionStyles.secondary}
                                onClick={() => exportNoiDocx(existingItem.id, formData.referenceNo || 'NOI')}
                            >
                                {t('itr.exportWord') || 'Export Word'}
                            </button>
                        )}
                    </>}
                    cancel={<>
                        <button className={actionStyles.secondary} onClick={requestClose} disabled={saving}>{t('common.cancel')}</button>
                    </>}
                    primary={<>
                        {!readOnly && (
                            <button className={actionStyles.primary} onClick={handleSave} disabled={saving || !isFormValid} title={!isFormValid ? t('form.requiredHint') : undefined}>{saving ? t('common.saving') || 'Saving...' : t('common.save')}</button>
                        )}
                    </>}
                />
            </div>
            {previewUrl && (
                <div className={styles.previewOverlay} onClick={() => setPreviewUrl(null)}>
                    <div className={styles.previewContent} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.previewCloseButton} onClick={() => setPreviewUrl(null)}>×</button>
                        {previewUrl.startsWith('data:application/pdf') || previewUrl.toLowerCase().endsWith('.pdf') ? (
                            <iframe src={previewUrl} className={styles.previewIframe} title="PDF Preview" />
                        ) : (
                            <img src={previewUrl} alt="Preview" className={styles.previewImage} />
                        )}
                        <div className={styles.previewLabel}>{previewName || t('common.preview')}</div>
                    </div>
                </div>
            )}
        </div>
    );
};
