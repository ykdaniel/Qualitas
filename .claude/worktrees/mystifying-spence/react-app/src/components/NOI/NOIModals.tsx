import React, { useState, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useContractors } from '../../context/ContractorsContext';
import { useITP } from '../../context/ITPContext';
import { useNCR } from '../../context/NCRContext';
import { NOIItem } from '../../context/NOIContext'; // Import NOIItem from context definition if exported, or re-define if strictly local. Usually exported.
// Assuming NOIItem is exported from context.
import { validateStatusTransition, NOIStatusTransitions } from '../../utils/statusValidation';
import FileAttachment from '../Shared/FileAttachment';
import styles from './NOI.module.css';

// Helper functions (duplicated for now to avoid circular deps or moved to utils later)
const formatTime24h = (timeStr: string | undefined): string => {
    if (!timeStr) return '-';
    const match = timeStr.match(/^(\d{1,2}):(\d{1,2})/);
    if (match) {
        const hours = match[1].padStart(2, '0');
        const minutes = match[2].padStart(2, '0');
        return `${hours}:${minutes}`;
    }
    return timeStr;
};

const getLocalizedStatus = (status: string | undefined, t: any) => {
    const s = (status || 'Open').toLowerCase();
    if (s === 'open') return t('noi.status.open');
    if (s === 'closed') return t('noi.status.closed');
    if (s === 'under review') return t('noi.status.underReview');
    if (s === 'reject') return t('noi.status.reject');
    return status || t('noi.status.open');
};

export interface NOIDetailData {
    package: string;
    referenceNo: string;
    issueDate: string;
    inspectionDate: string;
    inspectionTime: string;
    itpNo: string;
    eventNumber: string;
    checkpoint: string;
    type: string;
    contractor: string;
    contacts: string;
    phone: string;
    email: string;
    status: string;
    remark: string;
    closeoutDate: string;
    attachments: string[];
    ncrNumber?: string;
    dueDate?: string;
}

export interface NOIDetailModalProps {
    noiId: string | null;
    existingData?: NOIDetailData;
    existingItem?: NOIItem;
    noiList: NOIItem[];
    onSave: (details: NOIDetailData) => void;
    onClose: () => void;
}

export const NOIDetailModal: React.FC<NOIDetailModalProps> = ({ noiId, existingData, existingItem, noiList, onSave, onClose }) => {
    const { t } = useLanguage();
    const { getActiveContractors } = useContractors();
    const { getITPByVendor } = useITP();
    const { getNCRList } = useNCR();

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

    const handleSave = () => {
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
                                    <select className={styles.formSelect} value={formData.itpNo} onChange={(e) => handleFieldChange('itpNo', e.target.value)} disabled={!formData.contractor}>
                                        <option value="">{formData.contractor ? t('common.selectPlaceholder') : t('pqp.allContractors')}</option>
                                        {filteredITPList.map((itp) => (
                                            <option key={itp.id} value={itp.referenceNo || ''}>{itp.referenceNo || `(${t('common.tbc')})`}</option>
                                        ))}
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
                    <button className={styles.saveButton} onClick={handleSave}>{t('common.save')}</button>
                    <button className={styles.cancelButton} onClick={onClose}>{t('common.cancel')}</button>
                </div>
            </div>
        </div>
    );
};

export interface NOIDetailsViewModalProps {
    noiId: string;
    noiItem?: NOIItem;
    noiDetailData?: NOIDetailData;
    onClose: () => void;
    onPrint: (data: NOIDetailData) => void;
}

export const NOIDetailsViewModal: React.FC<NOIDetailsViewModalProps> = ({ noiId, noiItem, noiDetailData, onClose, onPrint }) => {
    const { t } = useLanguage();
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const displayData: NOIDetailData = {
        package: noiDetailData?.package || noiItem?.package || '',
        referenceNo: noiDetailData?.referenceNo || noiItem?.referenceNo || '',
        issueDate: noiDetailData?.issueDate || noiItem?.issueDate || '',
        inspectionDate: noiDetailData?.inspectionDate || noiItem?.inspectionDate || '',
        inspectionTime: noiDetailData?.inspectionTime || noiItem?.inspectionTime || '',
        itpNo: noiDetailData?.itpNo || noiItem?.itpNo || '',
        eventNumber: noiDetailData?.eventNumber || noiItem?.eventNumber || '',
        checkpoint: noiDetailData?.checkpoint || noiItem?.checkpoint || '',
        type: noiDetailData?.type || noiItem?.type || '',
        contractor: noiDetailData?.contractor || noiItem?.contractor || '',
        contacts: noiDetailData?.contacts || noiItem?.contacts || '',
        phone: noiDetailData?.phone || noiItem?.phone || '',
        email: noiDetailData?.email || noiItem?.email || '',
        status: noiDetailData?.status || noiItem?.status || 'Open',
        remark: noiDetailData?.remark || noiItem?.remark || '',
        closeoutDate: noiDetailData?.closeoutDate || noiItem?.closeoutDate || '',
        attachments: noiItem?.attachments || noiDetailData?.attachments || [],
        ncrNumber: noiDetailData?.ncrNumber || noiItem?.ncrNumber || '',
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{t('noi.detailsTitle')}</h2>
                    <button className={styles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={styles.modalBody}>
                    <div className={styles.formSections}>
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('noi.detailsTitle')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}><label>{t('common.referenceNo')}</label><div className={styles.readOnlyField}>{displayData.referenceNo || '-'}</div></div>
                                <div className={styles.formGroup}><label>{t('common.contractor')}</label><div className={styles.readOnlyField}>{displayData.contractor || '-'}</div></div>
                                <div className={styles.formGroup}><label>{t('noi.ncrReference')}</label><div className={styles.readOnlyField}>{displayData.ncrNumber || '-'}</div></div>
                                <div className={styles.formGroup}><label>{t('noi.package')}</label><div className={styles.readOnlyField}>{displayData.package || '-'}</div></div>
                                <div className={styles.formGroup}><label>{t('noi.itpNo')}</label><div className={styles.readOnlyField}>{displayData.itpNo || '-'}</div></div>
                                <div className={styles.formGroup}><label>{t('noi.issueDate')}</label><div className={styles.readOnlyField}>{displayData.issueDate || '-'}</div></div>
                                <div className={styles.formGroup}><label>{t('noi.inspectionDate')}</label><div className={styles.readOnlyField}>{displayData.inspectionDate || '-'}</div></div>
                                <div className={styles.formGroup}><label>{t('noi.inspectionTime')}</label><div className={styles.readOnlyField}>{formatTime24h(displayData.inspectionTime)}</div></div>
                                <div className={styles.formGroup}><label>{t('noi.eventNo')}</label><div className={styles.readOnlyField}>{displayData.eventNumber || '-'}</div></div>
                                <div className={styles.formGroup}><label>{t('noi.checkpoint')}</label><div className={styles.readOnlyField}>{displayData.checkpoint || '-'}</div></div>
                            </div>
                        </div>
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('common.contactInfo')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}><label>{t('contractors.contact')}</label><div className={styles.readOnlyField}>{displayData.contacts || '-'}</div></div>
                                <div className={styles.formGroup}><label>{t('contractors.phone')}</label><div className={styles.readOnlyField}>{displayData.phone || '-'}</div></div>
                                <div className={styles.formGroupFull}><label>{t('contractors.email')}</label><div className={styles.readOnlyField}>{displayData.email || '-'}</div></div>
                            </div>
                        </div>
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('noi.sectionQuality')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}><label>{t('common.status')}</label><div className={styles.readOnlyField}>{getLocalizedStatus(displayData.status, t)}</div></div>
                                <div className={styles.formGroup}><label>{t('noi.closeoutDate')}</label><div className={styles.readOnlyField}>{displayData.closeoutDate || '-'}</div></div>
                                <div className={styles.formGroupFull}><label>{t('common.remark')}</label><div className={styles.readOnlyField} style={{ whiteSpace: 'pre-wrap', minHeight: '80px' }}>{displayData.remark || '-'}</div></div>
                            </div>
                        </div>
                        <FileAttachment
                            attachments={displayData.attachments || []}
                            onUpload={() => { }}
                            onRemove={() => { }}
                            id="noi-view"
                            readOnly={true}
                        />
                    </div>
                </div>
                <div className={styles.modalActions}>
                    <button className={styles.printButton} onClick={() => onPrint(displayData)}>{t('common.print')}</button>
                    <button className={styles.cancelButton} onClick={onClose}>{t('common.close')}</button>
                </div>
            </div>
            {previewUrl && (
                <div className={styles.previewOverlay} onClick={() => setPreviewUrl(null)}>
                    <div className={styles.previewContent} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.previewCloseButton} onClick={() => setPreviewUrl(null)}>×</button>
                        {previewUrl.startsWith('data:application/pdf') ? <iframe src={previewUrl} className={styles.previewIframe} title="PDF Preview" /> : <img src={previewUrl} alt="Preview" className={styles.previewImage} />}
                        <div className={styles.previewLabel}>{displayData.package || t('itp.selfInspection.attachments')}</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export interface NOIBulkAddModalProps {
    onSave: (nois: Omit<NOIItem, 'id'>[]) => Promise<void>;
    onClose: () => void;
}

export interface BulkNOIRow {
    id: string;
    package: string;
    itpNo: string;
    eventNumber: string;
    checkpoint: string;
    inspectionTime: string;
}

export const NOIBulkAddModal: React.FC<NOIBulkAddModalProps> = ({ onSave, onClose }) => {
    const { t } = useLanguage();
    const { getActiveContractors } = useContractors();
    const { getITPByVendor } = useITP();
    const activeContractors = getActiveContractors();

    const [commonData, setCommonData] = useState({
        contractor: activeContractors.length > 0 ? activeContractors[0].name : '',
        issueDate: new Date().toISOString().split('T')[0],
        inspectionDate: new Date().toISOString().split('T')[0],
        contacts: '',
        phone: '',
        email: '',
    });

    const [rows, setRows] = useState<BulkNOIRow[]>([
        { id: '1', package: '', itpNo: '', eventNumber: '', checkpoint: '', inspectionTime: '09:00' },
    ]);

    const [saving, setSaving] = useState(false);

    const filteredITPList = useMemo(() => {
        if (!commonData.contractor) return [];
        return getITPByVendor(commonData.contractor);
    }, [commonData.contractor, getITPByVendor]);

    const handleCommonChange = (field: string, value: string) => {
        setCommonData(prev => ({ ...prev, [field]: value }));
    };

    const handleRowChange = (rowId: string, field: keyof BulkNOIRow, value: string) => {
        setRows(prev => prev.map(row => row.id === rowId ? { ...row, [field]: value } : row));
    };

    const addRow = () => {
        const newId = String(Date.now());
        setRows(prev => [...prev, { id: newId, package: '', itpNo: '', eventNumber: '', checkpoint: '', inspectionTime: '09:00' }]);
    };

    const removeRow = (rowId: string) => {
        if (rows.length <= 1) return;
        setRows(prev => prev.filter(row => row.id !== rowId));
    };

    const handleSave = async () => {
        if (!commonData.contractor) { alert(t('common.selectContractor')); return; }
        if (!commonData.issueDate) { alert(t('common.selectDate')); return; }

        const validRows = rows.filter(row => row.package.trim() || row.itpNo || row.checkpoint);
        if (validRows.length === 0) { alert(t('common.fillAtLeastOne')); return; }

        setSaving(true);
        try {
            const nois: Omit<NOIItem, 'id'>[] = validRows.map(row => ({
                package: row.package,
                referenceNo: '',
                issueDate: commonData.issueDate,
                inspectionDate: commonData.inspectionDate,
                inspectionTime: row.inspectionTime,
                itpNo: row.itpNo,
                eventNumber: row.eventNumber,
                checkpoint: row.checkpoint,
                type: '',
                contractor: commonData.contractor,
                contacts: commonData.contacts,
                phone: commonData.phone,
                email: commonData.email,
                status: 'Open',
                attachments: [],
            }));
            await onSave(nois);
        } catch (err) {
            console.error('Bulk add failed:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} style={{ maxWidth: '900px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{t('noi.bulkAdd')}</h2>
                    <button className={styles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={styles.modalBody}>
                    <p className={styles.formRequiredHint}>{t('form.requiredHint')}</p>
                    <div className={styles.formSection}>
                        <h3 className={styles.sectionTitle}>{t('noi.print.commonSection')}</h3>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label className={styles.requiredLabel}>{t('common.contractor')}</label>
                                <select className={styles.formSelect} value={commonData.contractor} onChange={(e) => handleCommonChange('contractor', e.target.value)}>
                                    <option value="">{t('common.selectPlaceholder')}</option>
                                    {activeContractors.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.requiredLabel}>{t('noi.issueDate')}</label>
                                <input type="date" lang="en" className={styles.formInput} value={commonData.issueDate} onChange={(e) => handleCommonChange('issueDate', e.target.value)} />
                            </div>
                            <div className={styles.formGroup}>
                                <label>{t('noi.inspectionDate')}</label>
                                <input type="date" lang="en" className={styles.formInput} value={commonData.inspectionDate} onChange={(e) => handleCommonChange('inspectionDate', e.target.value)} />
                            </div>
                            <div className={styles.formGroup}>
                                <label>{t('contractors.contact')}</label>
                                <input type="text" className={styles.formInput} value={commonData.contacts} onChange={(e) => handleCommonChange('contacts', e.target.value)} />
                            </div>
                            <div className={styles.formGroup}>
                                <label>{t('contractors.phone')}</label>
                                <input type="text" className={styles.formInput} value={commonData.phone} onChange={(e) => handleCommonChange('phone', e.target.value)} />
                            </div>
                            <div className={styles.formGroup}>
                                <label>{t('contractors.email')}</label>
                                <input type="email" className={styles.formInput} value={commonData.email} onChange={(e) => handleCommonChange('email', e.target.value)} />
                            </div>
                        </div>
                    </div>
                    <div className={styles.formSection}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h3 className={styles.sectionTitle} style={{ margin: 0 }}>{t('noi.print.listTitle')}</h3>
                            <button type="button" onClick={addRow} style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>{t('common.add')}</button>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f3f4f6' }}>
                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>#</th>
                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', minWidth: '150px' }}>{t('noi.package')}</th>
                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', minWidth: '150px' }}>{t('noi.itpNo')}</th>
                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', minWidth: '80px' }}>{t('noi.eventNo')}</th>
                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', minWidth: '80px' }}>{t('noi.checkpoint')}</th>
                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', minWidth: '100px' }}>{t('noi.inspectionTime')}</th>
                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '50px' }}>{t('common.operations')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, index) => (
                                        <tr key={row.id}>
                                            <td style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>{index + 1}</td>
                                            <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                                                <input type="text" value={row.package} onChange={(e) => handleRowChange(row.id, 'package', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }} placeholder="Subject" />
                                            </td>
                                            <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                                                <select value={row.itpNo} onChange={(e) => handleRowChange(row.id, 'itpNo', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }} disabled={!commonData.contractor}>
                                                    <option value="">{commonData.contractor ? t('common.selectPlaceholder') : t('pqp.allContractors')}</option>
                                                    {filteredITPList.map((itp) => (
                                                        <option key={itp.id} value={itp.referenceNo || ''}>{itp.referenceNo || '(未產生)'}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                                                <input type="text" value={row.eventNumber} onChange={(e) => handleRowChange(row.id, 'eventNumber', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }} placeholder="Event #" />
                                            </td>
                                            <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                                                <select value={row.checkpoint} onChange={(e) => handleRowChange(row.id, 'checkpoint', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }}>
                                                    <option value="">選擇</option>
                                                    <option value="W">W</option>
                                                    <option value="H">H</option>
                                                </select>
                                            </td>
                                            <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                                                <input type="text" className={styles.formInput} style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }} placeholder="HH:mm" value={row.inspectionTime} onChange={(e) => { const val = e.target.value; if (/^[0-9:]*$/.test(val)) handleRowChange(row.id, 'inspectionTime', val); }} />
                                            </td>
                                            <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                                                <button type="button" onClick={() => removeRow(row.id)} disabled={rows.length <= 1} style={{ padding: '4px 8px', backgroundColor: rows.length <= 1 ? '#e5e7eb' : '#ef4444', color: rows.length <= 1 ? '#9ca3af' : 'white', border: 'none', borderRadius: '4px', cursor: rows.length <= 1 ? 'not-allowed' : 'pointer', fontSize: '12px' }}>{t('common.delete')}</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ marginTop: '12px', color: '#6b7280', fontSize: '13px' }}>{t('noi.bulkAddSummary', { count: rows.length })}</div>
                    </div>
                </div>
                <div className={styles.modalActions}>
                    <button className={styles.saveButton} onClick={handleSave} disabled={saving}>{saving ? t('noi.bulkAddSaving') : t('noi.bulkAddAction', { count: rows.length })}</button>
                    <button className={styles.cancelButton} onClick={onClose}>{t('common.cancel')}</button>
                </div>
            </div>
        </div>
    );
};
