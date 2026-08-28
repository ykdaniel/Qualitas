import React, { useState, useMemo } from 'react';
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
import RelatedDocuments from '../../ui/RelatedDocuments';
import styles from '../NOI.module.css';
import formStyles from '../../Shared/FormShell.module.css';
import { NOIDetailData } from '../NOITypes';

export interface NOIDetailModalProps {
    noiId: string | null;
    readOnly?: boolean;
    existingData?: NOIDetailData;
    existingItem?: NOIItem;
    noiList: NOIItem[];
    onSave: (details: NOIDetailData, pendingFiles: File[], deletedFileIds: string[]) => void | Promise<void>;
    onClose: () => void;
    onPrint?: (data: NOIDetailData) => void;
}

export const NOIDetailModal: React.FC<NOIDetailModalProps> = ({ noiId: _noiId, readOnly = false, existingData, existingItem, noiList: _noiList, onSave, onClose, onPrint }) => {
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
        const defaultContractor = activeContractors.length > 0 ? activeContractors[0].name : '';
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
            contractor: defaultContractor,
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

    const [formData, setFormData] = useState<NOIDetailData>(getInitialData());

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

    const [saving, setSaving] = useState(false);

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
            const dataToSave: NOIDetailData = {
                ...formData,
                ncrNumber: formData.ncrNumber === 'N/A' ? '' : formData.ncrNumber,
            };
            await onSave(dataToSave, pendingFiles, deletedFileIds);
            onClose();
        } catch (err) {
            toast.error((err as Error)?.message || t('common.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={formStyles.modalOverlay}>
            <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={formStyles.modalHeader}>
                    <h2>{readOnly ? t('noi.viewTitle') : existingData || existingItem ? t('noi.editTitle') : t('noi.addTitle')}</h2>
                    <button className={formStyles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={formStyles.modalBody}>
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
                                            const selected = getActiveContractors().find(c => c.name === e.target.value);
                                            setFormData(prev => ({
                                                ...prev,
                                                contractor: e.target.value,
                                                itpNo: '',
                                                // Default from the contractor's own contact info instead of
                                                // making the user retype it on every NOI — only fills empty
                                                // fields, never overwrites a contact already typed for this
                                                // specific inspection.
                                                contacts: prev.contacts || selected?.contactPerson || '',
                                                phone: prev.phone || selected?.phone || '',
                                                email: prev.email || selected?.email || '',
                                            }));
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
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.requiredLabel}>{t('contractors.phone')}</label>
                                    <input type="tel" className={`${formStyles.formInput}${errors.phone ? ' ' + formStyles.errorInput : ''}`} value={formData.phone} onChange={(e) => handleFieldChange('phone', e.target.value)} />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label className={formStyles.requiredLabel}>{t('contractors.email')}</label>
                                    <input type="email" className={`${formStyles.formInput}${errors.email ? ' ' + formStyles.errorInput : ''}`} value={formData.email} onChange={(e) => handleFieldChange('email', e.target.value)} />
                                </div>
                            </div>
                        </div>
                        <div className={formStyles.formSection}>
                            <FileAttachment
                                attachments={formData.attachments}
                                onPendingFilesChange={handlePendingFilesChange}
                                onRemoveLegacy={handleRemoveLegacyAttachment}
                                onDeleteExistingFile={handleDeleteExistingFile}
                                onPreview={handlePreview}
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
                                        <button type="button" className={styles.addDateBtn} style={{ padding: '4px 12px', fontSize: '12px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' }} onClick={() => { const dateStr = new Date().toLocaleDateString(); const newRemark = formData.remark ? `${formData.remark}\n${dateStr}: ` : `${dateStr}: `; handleFieldChange('remark', newRemark); }}>{t('common.addDate')}</button>
                                    </div>
                                    <textarea className={formStyles.formTextarea} value={formData.remark} onChange={(e) => handleFieldChange('remark', e.target.value)} rows={4} />
                                </div>
                            </div>
                        </div>
                        {existingItem?.id && (
                            <RelatedDocuments entityType="noi" entityId={existingItem.id} />
                        )}
                    </div>
                    </fieldset>
                </div>
                <div className={formStyles.modalActions}>
                    {onPrint && (
                        <button
                            className={formStyles.printButton}
                            onClick={() => onPrint(formData)}
                            style={{ marginRight: 'auto' }} // Push to left
                        >
                            {t('common.print')}
                        </button>
                    )}
                    {!readOnly && (
                        <button className={formStyles.saveButton} onClick={handleSave} disabled={saving || !isFormValid} title={!isFormValid ? t('form.requiredHint') : undefined}>{saving ? t('common.saving') || 'Saving...' : t('common.save')}</button>
                    )}
                    <button className={formStyles.cancelButton} onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
                </div>
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
