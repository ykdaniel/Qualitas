import React, { useState, useMemo } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { useContractorsStore } from '../../../store/contractorsStore';
import { useITPStore } from '../../../store/itpStore';
import { useNCRStore } from '../../../store/ncrStore';
import { useOBSStore } from '../../../store/obsStore';
import type { NOIItem } from '../../../store/noiStore';
import { validateStatusTransition, NOIStatusTransitions, validateRequiredFields, NOIValidationRules } from '../../../utils/statusValidation';
import FileAttachment from '../../Shared/FileAttachment';
import styles from '../NOI.module.css';
import { NOIDetailData } from '../NOITypes';

export interface NOIDetailModalProps {
    noiId: string | null;
    existingData?: NOIDetailData;
    existingItem?: NOIItem;
    noiList: NOIItem[];
    onSave: (details: NOIDetailData) => void;
    onClose: () => void;
    onPrint?: (data: NOIDetailData) => void;
}

export const NOIDetailModal: React.FC<NOIDetailModalProps> = ({ noiId, existingData, existingItem, noiList, onSave, onClose, onPrint }) => {
    const { t } = useLanguage();
    const { getActiveContractors } = useContractorsStore();
    const itpList = useITPStore(state => state.itpList);
    const getITPByVendor = (vendor: string) => itpList.filter(itp => itp.vendor === vendor);
    const ncrList = useNCRStore(state => state.ncrList);
    const obsList = useOBSStore(state => state.obsList);
    const getNCRList = () => ncrList;

    const getInitialData = (): NOIDetailData => {
        if (existingData) {
            return { ...existingData, attachments: existingData.attachments || [] };
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
                ncrNumber: existingItem.ncrNumber || '',
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
            ncrNumber: '',
            dueDate: '',
        };
    };

    const [formData, setFormData] = useState<NOIDetailData>(getInitialData());

    const filteredITPList = useMemo(() => {
        if (!formData.contractor) return [];
        return getITPByVendor(formData.contractor);
    }, [formData.contractor, getITPByVendor]);

    const handleFieldChange = (field: keyof NOIDetailData, value: string) => {
        setFormData(prev => {
            const updated = { ...prev, [field]: value };
            if (field === 'status' && prev.status) {
                const validation = validateStatusTransition(prev.status, value, NOIStatusTransitions);
                if (!validation.allowed) {
                    alert(validation.message || t('common.invalidStatusTransition'));
                    return prev;
                }
                if (value !== 'Reject' && updated.ncrNumber) {
                    alert("NOI 含有 NCR，狀態必須為不通過（Reject）");
                    return prev;
                }
            }
            if (field === 'ncrNumber' && value) {
                updated.status = 'Reject';
            }
            // NOTE: 當使用者清除 NCR 綁定時，自動把 Reject 狀態還原為 Open
            if (field === 'ncrNumber' && !value && prev.status === 'Reject') {
                updated.status = 'Open';
            }
            if (field === 'contractor' && value) {
                updated.itpNo = '';
            }
            return updated;
        });
    };

    const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            const fileArray = Array.from(files);
            fileArray.forEach((file) => {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const result = reader.result as string;
                        setFormData(prev => ({ ...prev, attachments: [...prev.attachments, result] }));
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
        e.target.value = '';
    };

    const handleRemoveAttachment = (index: number) => {
        setFormData(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== index) }));
    };

    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState<string>('');

    const handlePreview = (url: string, name?: string) => {
        setPreviewUrl(url);
        setPreviewName(name || '');
    };

    const handleSave = () => {
        // 使用配置式驗證取代硬編碼
        const validation = validateRequiredFields(formData, formData.status, NOIValidationRules);
        if (!validation.valid) {
            const msg = validation.message || 'Error';
            // 嘗試翻譯，若無法翻譯則顯示原訊息 (支援 key 或直接文字)
            alert(t(msg) === msg && msg.includes('.') ? msg : t(msg));
            return;
        }

        // P4: Cascade Validation - Blocks closing NOI if linked NCR or OBS is still Open
        if (formData.status === 'Closed' && formData.referenceNo) {
            const openNcrs = ncrList.filter(ncr => ncr.noiNumber === formData.referenceNo && ncr.status === 'Open');
            const openObs = obsList.filter(obs => obs.noiNumber === formData.referenceNo && obs.status === 'Open');

            if (openNcrs.length > 0 || openObs.length > 0) {
                const totalOpen = openNcrs.length + openObs.length;
                alert(`Cannot close NOI: There are still ${totalOpen} open NCR/OBS associated with this inspection. Please close them first.`);
                return;
            }
        }

        onSave(formData);
        onClose();
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{existingData || existingItem ? t('noi.editTitle') : t('noi.addTitle')}</h2>
                    <button className={styles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={styles.modalBody}>
                    <p className={styles.formRequiredHint}>{t('form.requiredHint')}</p>
                    <div className={styles.formSections}>
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('noi.detailsTitle')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('common.referenceNo')}</label>
                                    <input type="text" className={styles.formInput} value={formData.referenceNo || t('form.autoGenerated')} readOnly style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: formData.referenceNo ? '#000000' : '#666666' }} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('common.contractor')}</label>
                                    <select className={styles.formSelect} value={formData.contractor} onChange={(e) => handleFieldChange('contractor', e.target.value)}>
                                        <option value="">{t('common.selectPlaceholder')}</option>
                                        {getActiveContractors().map((contractor) => (
                                            <option key={contractor.id} value={contractor.name}>{contractor.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('noi.ncrReference')}</label>
                                    <select className={styles.formSelect} value={formData.ncrNumber} onChange={(e) => handleFieldChange('ncrNumber', e.target.value)}>
                                        <option value="">{t('common.na')}</option>
                                        {getNCRList().map((ncr) => (
                                            <option key={ncr.id} value={ncr.documentNumber || ''}>{ncr.documentNumber || `(${t('common.tbc')})`}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('noi.package')}</label>
                                    <input type="text" className={styles.formInput} value={formData.package} onChange={(e) => handleFieldChange('package', e.target.value)} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('noi.itpNo')}</label>
                                    <select className={styles.formSelect} value={formData.itpNo} onChange={(e) => handleFieldChange('itpNo', e.target.value)} disabled={!formData.contractor && !formData.itpNo}>
                                        <option value="">{formData.contractor ? t('common.selectPlaceholder') : t('pqp.allContractors')}</option>
                                        {filteredITPList.map((itp) => (
                                            <option key={itp.id} value={itp.referenceNo || ''}>{itp.referenceNo || `(${t('common.tbc')})`}</option>
                                        ))}
                                        {formData.itpNo && !filteredITPList.some(itp => itp.referenceNo === formData.itpNo) && (
                                            <option key="current-missing" value={formData.itpNo}>{formData.itpNo}</option>
                                        )}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('noi.issueDate')}</label>
                                    <input
                                        type={formData.issueDate ? 'date' : 'text'}
                                        placeholder="mm/dd/yyyy"
                                        lang="en"
                                        onFocus={(e) => (e.target.type = 'date')}
                                        onBlur={(e) => {
                                            if (!e.target.value) e.target.type = 'text';
                                        }}
                                        className={styles.formInput}
                                        value={formData.issueDate}
                                        onChange={(e) => handleFieldChange('issueDate', e.target.value)}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('noi.inspectionDate')}</label>
                                    <input
                                        type={formData.inspectionDate ? 'date' : 'text'}
                                        placeholder="mm/dd/yyyy"
                                        lang="en"
                                        onFocus={(e) => (e.target.type = 'date')}
                                        onBlur={(e) => {
                                            if (!e.target.value) e.target.type = 'text';
                                        }}
                                        className={styles.formInput}
                                        value={formData.inspectionDate}
                                        onChange={(e) => handleFieldChange('inspectionDate', e.target.value)}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('common.dueDate')}</label>
                                    <input
                                        type={formData.dueDate ? 'date' : 'text'}
                                        placeholder="mm/dd/yyyy"
                                        lang="en"
                                        onFocus={(e) => (e.target.type = 'date')}
                                        onBlur={(e) => {
                                            if (!e.target.value) e.target.type = 'text';
                                        }}
                                        className={styles.formInput}
                                        value={formData.dueDate || ''}
                                        onChange={(e) => handleFieldChange('dueDate', e.target.value)}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('noi.inspectionTime')} (24h)</label>
                                    <input type="text" className={styles.formInput} placeholder="HH:mm" value={formData.inspectionTime} onChange={(e) => { const val = e.target.value; if (/^[0-9:]*$/.test(val)) handleFieldChange('inspectionTime', val); }} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('noi.eventNo')}</label>
                                    <input type="text" className={styles.formInput} value={formData.eventNumber} onChange={(e) => handleFieldChange('eventNumber', e.target.value)} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('noi.checkpoint')}</label>
                                    <select className={styles.formSelect} value={formData.checkpoint} onChange={(e) => handleFieldChange('checkpoint', e.target.value)}>
                                        <option value="">{t('common.selectPlaceholder')}</option>
                                        <option value="R">R</option>
                                        <option value="MS">MS</option>
                                        <option value="W">W</option>
                                        <option value="H">H</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('common.contactInfo')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('contractors.contact')}</label>
                                    <input type="text" className={styles.formInput} value={formData.contacts} onChange={(e) => handleFieldChange('contacts', e.target.value)} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('contractors.phone')}</label>
                                    <input type="tel" className={styles.formInput} value={formData.phone} onChange={(e) => handleFieldChange('phone', e.target.value)} />
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label>{t('contractors.email')}</label>
                                    <input type="email" className={styles.formInput} value={formData.email} onChange={(e) => handleFieldChange('email', e.target.value)} />
                                </div>
                            </div>
                        </div>
                        <div className={styles.formSection}>
                            <FileAttachment
                                attachments={formData.attachments}
                                onUpload={handleAttachmentUpload}
                                onRemove={handleRemoveAttachment}
                                id="noi"
                                onPreview={handlePreview}
                            />
                        </div>
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('noi.sectionQuality')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('common.status')}</label>
                                    <select className={styles.formSelect} value={formData.status} onChange={(e) => handleFieldChange('status', e.target.value)}>
                                        <option value="Open">{t('noi.status.open')}</option>
                                        <option value="Under Review">{t('noi.status.underReview')}</option>
                                        <option value="Closed">{t('noi.status.closed')}</option>
                                        <option value="Reject">{t('noi.status.reject')}</option>
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.optionalLabel}>{t('noi.closeoutDate')}</label>
                                    <input
                                        type={formData.closeoutDate ? 'date' : 'text'}
                                        placeholder="mm/dd/yyyy"
                                        lang="en"
                                        onFocus={(e) => (e.target.type = 'date')}
                                        onBlur={(e) => {
                                            if (!e.target.value) e.target.type = 'text';
                                        }}
                                        className={styles.formInput}
                                        value={formData.closeoutDate}
                                        onChange={(e) => handleFieldChange('closeoutDate', e.target.value)}
                                    />
                                </div>
                                <div className={styles.formGroupFull}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <label style={{ marginBottom: 0 }}>{t('common.remark')}</label>
                                        <button type="button" className={styles.addDateBtn} style={{ padding: '4px 12px', fontSize: '12px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' }} onClick={() => { const dateStr = new Date().toLocaleDateString(); const newRemark = formData.remark ? `${formData.remark}\n${dateStr}: ` : `${dateStr}: `; handleFieldChange('remark', newRemark); }}>{t('common.addDate')}</button>
                                    </div>
                                    <textarea className={styles.formTextarea} value={formData.remark} onChange={(e) => handleFieldChange('remark', e.target.value)} rows={4} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className={styles.modalActions}>
                    {onPrint && (
                        <button
                            className={styles.printButton}
                            onClick={() => onPrint(formData)}
                            style={{ marginRight: 'auto' }} // Push to left
                        >
                            {t('common.print')}
                        </button>
                    )}
                    <button className={styles.saveButton} onClick={handleSave}>{t('common.save')}</button>
                    <button className={styles.cancelButton} onClick={onClose}>{t('common.cancel')}</button>
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
