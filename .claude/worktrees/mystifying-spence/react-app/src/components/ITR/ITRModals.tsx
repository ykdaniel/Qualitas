import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useContractors } from '../../context/ContractorsContext';
import { useNOI } from '../../context/NOIContext';
import { useNCR } from '../../context/NCRContext';
import { useITR, ITRItem } from '../../context/ITRContext';
import { useITP } from '../../context/ITPContext';
import { validateStatusTransition, ITRStatusTransitions } from '../../utils/statusValidation';
import styles from './ITR.module.css';

export interface ITRDetailData {
    itrNumber: string;
    status: string;
    raiseDate: string;
    closeoutDate: string;
    aconex: string;
    type: string;
    contractor: string;
    remark: string;
    subject: string;
    referenceStandards: string;
    detailsDescription: string;
    foundLocation: string;
    ncrNumber: string;  // 若檢驗失敗，連結到產生的 NCR
    raisedBy: string;
    serialNumbers: string;
    repairMethodStatement: string;
    immediateCorrectionAction: string;
    rootCauseAnalysis: string;
    correctiveActions: string;
    preventiveAction: string;
    finalProductIntegrityStatement: string;
    reInspectionNumber: string;
    noiNumber: string;  // 連結到產生此 ITR 的 NOI
    projectQualityManager: string;
    defectPhotos: string[];
    improvementPhotos: string[];
    attachments: string[];
    eventNumber: string;
    checkpoint: string;
    dueDate?: string;
}

export interface ITRDetailModalProps {
    itrId: string | null;
    existingData?: ITRDetailData;
    existingItem?: ITRItem;
    itrList: ITRItem[];
    onSave: (details: ITRDetailData) => void | Promise<void>;
    onClose: () => void;
}

export const ITRDetailModal: React.FC<ITRDetailModalProps> = ({ itrId, existingData, existingItem, itrList: propItrList, onSave, onClose }) => {
    const { t } = useLanguage();
    const { getActiveContractors, contractors } = useContractors();

    if (!itrId) {
        return null;
    }
    const { getNOIList } = useNOI();
    const { getNCRList } = useNCR();
    const { itrList: contextItrList } = useITR();
    const { getITPList } = useITP();

    // Use context list if available, otherwise use prop
    const itrList = contextItrList.length > 0 ? contextItrList : propItrList;

    // Reference No (documentNumber) 由後端自動產生，前端不再處理產號邏輯

    // Initialize form data from existing data or existing item
    const getInitialData = (): ITRDetailData => {
        if (existingData) {
            return { ...existingData };
        }
        if (existingItem) {
            return {
                itrNumber: existingItem.documentNumber || '',  // 既有編號，顯示用
                status: existingItem.status || 'Approved',
                raiseDate: existingItem.raiseDate || '',
                closeoutDate: existingItem.closeoutDate || '',
                aconex: existingItem.aconex || '',
                type: existingItem.type || '',
                contractor: existingItem.vendor || '',
                remark: existingItem.remark || '',
                subject: existingItem.subject || existingItem.description || '',
                referenceStandards: '',
                detailsDescription: existingItem.description || '',
                foundLocation: existingItem.foundLocation || '',
                ncrNumber: existingItem.ncrNumber || '',
                raisedBy: existingItem.raisedBy || '',
                serialNumbers: '',
                repairMethodStatement: '',
                immediateCorrectionAction: '',
                rootCauseAnalysis: '',
                correctiveActions: '',
                preventiveAction: '',
                finalProductIntegrityStatement: '',
                reInspectionNumber: '',
                noiNumber: existingItem.noiNumber || '',  // 連結到產生此 ITR 的 NOI
                eventNumber: existingItem.eventNumber || '',
                checkpoint: existingItem.checkpoint || '',
                projectQualityManager: '',
                defectPhotos: existingItem.defectPhotos || [],
                improvementPhotos: existingItem.improvementPhotos || [],
                attachments: existingItem.attachments || [],
                dueDate: (existingItem as any).dueDate || '',
            };
        }
        // 新項目：itrNumber 留空，由後端自動產生
        return {
            itrNumber: '',  // 由後端產生
            status: 'Approved',
            raiseDate: '',
            closeoutDate: '',
            aconex: '',
            type: '',
            contractor: '',
            remark: '',
            subject: '',
            referenceStandards: '',
            detailsDescription: '',
            foundLocation: '',
            ncrNumber: '',
            raisedBy: '',
            serialNumbers: '',
            repairMethodStatement: '',
            immediateCorrectionAction: '',
            rootCauseAnalysis: '',
            correctiveActions: '',
            preventiveAction: '',
            finalProductIntegrityStatement: '',
            reInspectionNumber: '',
            noiNumber: '',  // 連結到產生此 ITR 的 NOI
            eventNumber: '',
            checkpoint: '',
            projectQualityManager: '',
            defectPhotos: [],
            improvementPhotos: [],
            attachments: [],
            dueDate: '',
        };
    };

    const [formData, setFormData] = useState<ITRDetailData>(getInitialData());

    const VERSION_OPTIONS = ['Rev1.0', 'Rev2.0', 'Rev3.0', 'Rev4.0'];
    const [versionMode, setVersionMode] = useState<'select' | 'custom'>(() => {
        const currentVersion = formData.type;
        if (currentVersion && !VERSION_OPTIONS.includes(currentVersion)) {
            return 'custom';
        }
        return 'select';
    });

    // Reference No 由後端自動產生，不再於前端自動更新

    const handleFieldChange = (field: keyof ITRDetailData, value: string) => {
        setFormData(prev => {
            const updated = { ...prev, [field]: value };

            // Status validation
            if (field === 'status' && prev.status) {
                const validation = validateStatusTransition(prev.status, value, ITRStatusTransitions);
                if (!validation.allowed) {
                    alert(validation.message || t('common.invalidStatusTransition'));
                    return prev;
                }
            }

            return updated;
        });
    };

    const handleDateButton = (field: keyof ITRDetailData) => {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}_`;
        setFormData(prev => ({
            ...prev,
            [field]: prev[field] ? `${prev[field]}\n${dateStr}` : dateStr
        }));
    };

    const handleNAButton = (field: keyof ITRDetailData) => {
        setFormData(prev => ({ ...prev, [field]: 'Not Applicable' }));
    };

    const handleTBCButton = (field: keyof ITRDetailData) => {
        setFormData(prev => ({ ...prev, [field]: 'To be confirmed' }));
    };

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, photoType: 'defect' | 'improvement') => {
        const files = e.target.files;
        if (files) {
            const fileArray = Array.from(files);

            fileArray.forEach((file) => {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const result = reader.result as string;
                        if (photoType === 'defect') {
                            setFormData(prev => ({
                                ...prev,
                                defectPhotos: [...prev.defectPhotos, result]
                            }));
                        } else {
                            setFormData(prev => ({
                                ...prev,
                                improvementPhotos: [...prev.improvementPhotos, result]
                            }));
                        }
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
        // Reset input
        e.target.value = '';
    };

    const handleRemovePhoto = (index: number, photoType: 'defect' | 'improvement') => {
        if (photoType === 'defect') {
            setFormData(prev => ({
                ...prev,
                defectPhotos: prev.defectPhotos.filter((_, i) => i !== index)
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                improvementPhotos: prev.improvementPhotos.filter((_, i) => i !== index)
            }));
        }
    };

    const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            const fileArray = Array.from(files);
            fileArray.forEach((file) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const result = reader.result as string;
                    setFormData(prev => ({
                        ...prev,
                        attachments: [...prev.attachments, result]
                    }));
                };
                reader.readAsDataURL(file);
            });
        }
        e.target.value = '';
    };

    const handleRemoveAttachment = (index: number) => {
        setFormData(prev => ({
            ...prev,
            attachments: prev.attachments.filter((_, i) => i !== index)
        }));
    };

    const handleSave = async () => {
        try {
            await onSave(formData);
            onClose();
        } catch (_) {
            // 錯誤已在父層 handleSaveITRDetails 以 alert 顯示，保持 modal 開啟
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{existingData || existingItem ? t('itr.editTitle') : t('itr.addTitle')}</h2>
                    <button className={styles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={styles.modalBody}>
                    <p className={styles.formRequiredHint}>{t('form.requiredHint')}</p>
                    <div className={styles.formSections}>
                        {/* {t('common.baseInfo') || '基本資訊'} */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('common.baseInfo') || '基本資訊'}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label className={styles.optionalLabel}>{t('common.referenceNo')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.itrNumber || t('form.autoGenerated')}
                                        readOnly
                                        style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed' }}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('itr.noiNo')} ({t('form.source')})</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.noiNumber}
                                        onChange={(e) => {
                                            const selectedRef = e.target.value;
                                            handleFieldChange('noiNumber', selectedRef);

                                            // Auto-fill Inspection Date from selected NOI
                                            if (selectedRef) {
                                                const selectedNOI = getNOIList().find(n => n.referenceNo === selectedRef);
                                                if (selectedNOI) {
                                                    if (selectedNOI.inspectionDate) {
                                                        handleFieldChange('raiseDate', selectedNOI.inspectionDate);
                                                    }
                                                    if (selectedNOI.package) {
                                                        handleFieldChange('subject', `ITR-${selectedNOI.package}`);
                                                    }
                                                    if (selectedNOI.contractor) {
                                                        handleFieldChange('contractor', selectedNOI.contractor);
                                                    }
                                                }
                                            }
                                        }}
                                    >
                                        <option value="">{t('itr.selectNOI')}</option>
                                        {getNOIList().map((noi) => (
                                            <option key={noi.id} value={noi.referenceNo || ''}>
                                                {noi.referenceNo || `(${t('common.notGenerated')})`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={formData.noiNumber ? styles.optionalLabel : ''}>{t('common.contractor')}</label>
                                    {formData.noiNumber ? (
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            value={formData.contractor}
                                            readOnly
                                            style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed' }}
                                        />
                                    ) : (
                                        <select
                                            className={styles.formSelect}
                                            value={formData.contractor}
                                            onChange={(e) => handleFieldChange('contractor', e.target.value)}
                                        >
                                            <option value="">{t('common.selectContractor')}</option>
                                            {getActiveContractors().map((contractor) => (
                                                <option key={contractor.id} value={contractor.name}>
                                                    {contractor.name}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={formData.noiNumber ? styles.optionalLabel : ''}>{t('noi.package')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.subject}
                                        onChange={(e) => handleFieldChange('subject', e.target.value)}
                                        readOnly={!!formData.noiNumber}
                                        style={formData.noiNumber ? { backgroundColor: '#D9D9D9', cursor: 'not-allowed' } : {}}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={formData.noiNumber ? styles.optionalLabel : ''}>{t('itr.inspectionDate')}</label>
                                    <label className={formData.noiNumber ? styles.optionalLabel : ''}>{t('itr.inspectionDate')}</label>
                                    <input
                                        type={formData.raiseDate ? 'date' : 'text'}
                                        placeholder="mm/dd/yyyy"
                                        lang="en"
                                        onFocus={(e) => (e.target.type = 'date')}
                                        onBlur={(e) => {
                                            if (!e.target.value) e.target.type = 'text';
                                        }}
                                        className={styles.formInput}
                                        value={formData.raiseDate}
                                        onChange={(e) => handleFieldChange('raiseDate', e.target.value)}
                                        readOnly={!!formData.noiNumber}
                                        style={formData.noiNumber ? { backgroundColor: '#D9D9D9', cursor: 'not-allowed' } : {}}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('common.dueDate')}</label>
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
                                    <label>{t('common.version')}</label>
                                    {versionMode === 'select' && (
                                        <select
                                            className={styles.formSelect}
                                            value={VERSION_OPTIONS.includes(formData.type || '') ? formData.type : 'Rev1.0'}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                if (value === 'custom') {
                                                    setVersionMode('custom');
                                                    handleFieldChange('type', '');
                                                } else {
                                                    setVersionMode('select');
                                                    handleFieldChange('type', value);
                                                }
                                            }}
                                        >
                                            {VERSION_OPTIONS.map((v) => (
                                                <option key={v} value={v}>{v}</option>
                                            ))}
                                            <option value="custom">{t('itr.revCustom')}</option>
                                        </select>
                                    )}
                                    {versionMode === 'custom' && (
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            value={formData.type || ''}
                                            onChange={(e) => handleFieldChange('type', e.target.value)}
                                            placeholder={t('itr.revCustomPlaceholder')}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 照片上傳 */}
                        <div className={styles.formSection}>
                            <div className={styles.photoSectionContainer}>
                                <div className={styles.photoSection}>
                                    <h3 className={styles.sectionTitle}>{t('itr.photo.defect')}</h3>
                                    <div className={styles.photoUploadContainer}>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            onChange={(e) => handlePhotoUpload(e, 'defect')}
                                            className={styles.photoInput}
                                            id="defect-photo-upload"
                                        />
                                        <label htmlFor="defect-photo-upload" className={styles.photoUploadButton}>
                                            <span>{t('itr.photo.upload')}</span>
                                        </label>
                                        {formData.defectPhotos.length > 0 && (
                                            <div className={styles.photoPreviewGrid}>
                                                {formData.defectPhotos.map((photo, index) => (
                                                    <div key={index} className={styles.photoPreviewItem}>
                                                        <img src={photo} alt={`Defect Photo ${index + 1}`} className={styles.photoPreview} />
                                                        <button
                                                            type="button"
                                                            className={styles.photoRemoveButton}
                                                            onClick={() => handleRemovePhoto(index, 'defect')}
                                                            aria-label={t('common.delete')}
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className={styles.photoSection}>
                                    <h3 className={styles.sectionTitle}>{t('itr.photo.improvement')}</h3>
                                    <div className={styles.photoUploadContainer}>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            onChange={(e) => handlePhotoUpload(e, 'improvement')}
                                            className={styles.photoInput}
                                            id="improvement-photo-upload"
                                        />
                                        <label htmlFor="improvement-photo-upload" className={styles.photoUploadButton}>
                                            <span>{t('itr.photo.upload')}</span>
                                        </label>
                                        {formData.improvementPhotos.length > 0 && (
                                            <div className={styles.photoPreviewGrid}>
                                                {formData.improvementPhotos.map((photo, index) => (
                                                    <div key={index} className={styles.photoPreviewItem}>
                                                        <img src={photo} alt={`Improvement Photo ${index + 1}`} className={styles.photoPreview} />
                                                        <button
                                                            type="button"
                                                            className={styles.photoRemoveButton}
                                                            onClick={() => handleRemovePhoto(index, 'improvement')}
                                                            aria-label={t('common.delete')}
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Attachments */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('common.attachments')}</h3>
                            <div className={styles.photoUploadContainer}>
                                <input
                                    type="file"
                                    accept="*"
                                    multiple
                                    onChange={handleAttachmentUpload}
                                    className={styles.photoInput}
                                    id="attachment-upload"
                                />
                                <label htmlFor="attachment-upload" className={styles.photoUploadButton}>
                                    <span>{t('obs.uploadFiles')}</span>
                                </label>
                                {formData.attachments.length > 0 && (
                                    <div className={styles.photoPreviewGrid}>
                                        {formData.attachments.map((_, index) => (
                                            <div key={index} className={styles.photoPreviewItem}>
                                                <span style={{ fontSize: 12, wordBreak: 'break-all' }}>Attachment {index + 1}</span>
                                                <a href={formData.attachments[index]} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, marginLeft: 4 }}>View</a>
                                                <button
                                                    type="button"
                                                    className={styles.photoRemoveButton}
                                                    onClick={() => handleRemoveAttachment(index)}
                                                    aria-label="Remove attachment"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 人員與位置資訊 */}

                        {/* 複檢資料 */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('itr.sectionReinspection')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('itr.reInspectionNo')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.reInspectionNumber}
                                        onChange={(e) => handleFieldChange('reInspectionNumber', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 品質評估 */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('itr.sectionQuality')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('common.status')}</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.status}
                                        onChange={(e) => handleFieldChange('status', e.target.value)}
                                    >
                                        <option value="Approved">{t('itr.status.approved')}</option>
                                        <option value="Reject">{t('itr.status.reject')}</option>
                                        <option value="In Progress">{t('itr.status.inProgress')}</option>
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.optionalLabel}>{t('itr.closeoutDate')}</label>
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
                                    <div className={styles.labelWithButton}>
                                        <label className={styles.optionalLabel}>{t('common.remark')}</label>
                                        <button
                                            type="button"
                                            className={styles.tbcButton}
                                            onClick={() => handleDateButton('remark')}
                                        >
                                            {t('common.addDate')}
                                        </button>
                                    </div>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={formData.remark}
                                        onChange={(e) => handleFieldChange('remark', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                                <div className={styles.modalActions}>
                                    <button className={styles.saveButton} onClick={handleSave}>
                                        {t('common.save')}
                                    </button>
                                    <button className={styles.cancelButton} onClick={onClose}>
                                        {t('common.cancel')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export interface ITRDetailsViewModalProps {
    itrId: string;
    itrItem?: ITRItem;
    itrDetailData?: ITRDetailData;
    onClose: () => void;
    onPrint: () => void;
}

export const ITRDetailsViewModal: React.FC<ITRDetailsViewModalProps> = ({ itrId, itrItem, itrDetailData, onClose, onPrint }) => {
    const { t } = useLanguage();
    // Combine data from both sources, with detailData taking precedence
    const displayData: ITRDetailData = {
        itrNumber: itrDetailData?.itrNumber || itrItem?.documentNumber || '',
        status: itrDetailData?.status || itrItem?.status || 'Approved',
        raiseDate: itrDetailData?.raiseDate || itrItem?.raiseDate || '',
        closeoutDate: itrDetailData?.closeoutDate || itrItem?.closeoutDate || '',
        aconex: itrDetailData?.aconex || itrItem?.aconex || '',
        type: itrDetailData?.type || itrItem?.type || '',
        contractor: itrDetailData?.contractor || itrItem?.vendor || '',
        remark: itrDetailData?.remark || itrItem?.remark || '',
        subject: itrDetailData?.subject || itrItem?.subject || itrItem?.description || '',
        referenceStandards: itrDetailData?.referenceStandards || '',
        detailsDescription: itrDetailData?.detailsDescription || itrItem?.description || '',
        foundLocation: itrDetailData?.foundLocation || itrItem?.foundLocation || '',
        ncrNumber: itrDetailData?.ncrNumber || itrItem?.ncrNumber || '',
        raisedBy: itrDetailData?.raisedBy || itrItem?.raisedBy || '',
        serialNumbers: itrDetailData?.serialNumbers || '',
        repairMethodStatement: itrDetailData?.repairMethodStatement || '',
        immediateCorrectionAction: itrDetailData?.immediateCorrectionAction || '',
        rootCauseAnalysis: itrDetailData?.rootCauseAnalysis || '',
        correctiveActions: itrDetailData?.correctiveActions || '',
        preventiveAction: itrDetailData?.preventiveAction || '',
        finalProductIntegrityStatement: itrDetailData?.finalProductIntegrityStatement || '',
        reInspectionNumber: itrDetailData?.reInspectionNumber || '',
        noiNumber: itrDetailData?.noiNumber || itrItem?.noiNumber || '',  // 連結到產生此 ITR 的 NOI
        projectQualityManager: itrDetailData?.projectQualityManager || '',
        defectPhotos: itrDetailData?.defectPhotos || [],
        improvementPhotos: itrDetailData?.improvementPhotos || [],
        attachments: itrDetailData?.attachments || itrItem?.attachments || [],
        eventNumber: itrDetailData?.eventNumber || '',
        checkpoint: itrDetailData?.checkpoint || '',
    };

    const handlePrint = () => {
        onPrint();
    };

    const getLocalizedStatus = (status: string) => {
        const s = (status || 'Approved').toLowerCase();
        if (s === 'approved') return t('itr.status.approved');
        if (s === 'reject') return t('itr.status.reject');
        if (s === 'in progress') return t('itr.status.inProgress');
        return status || 'Approved'; // Fallback to 'Approved' if status is undefined or unrecognized
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{t('itr.detailsTitle')}</h2>
                    <button className={styles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={styles.modalBody}>
                    <div className={styles.formSections}>
                        {/* {t('common.baseInfo') || '基本資訊'} */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('itr.sectionInfo')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('common.referenceNo')}</label>
                                    <div className={styles.readOnlyField}>{displayData.itrNumber || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('noi.package')}</label>
                                    <div className={styles.readOnlyField}>{displayData.subject || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('itr.inspectionDate')}</label>
                                    <div className={styles.readOnlyField}>{displayData.raiseDate || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('common.version')}</label>
                                    <div className={styles.readOnlyField}>{displayData.type || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('itr.noiNo')}</label>
                                    <div className={styles.readOnlyField}>{displayData.noiNumber || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('common.contractor')}</label>
                                    <div className={styles.readOnlyField}>{displayData.contractor || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('itr.ncrNo')}</label>
                                    <div className={styles.readOnlyField}>{displayData.ncrNumber || '-'}</div>
                                </div>
                            </div>
                        </div>

                        {/* 照片 */}
                        {(displayData.defectPhotos?.length > 0 || displayData.improvementPhotos?.length > 0) && (
                            <div className={styles.formSection}>
                                <div className={styles.photoSectionContainer}>
                                    {displayData.defectPhotos && displayData.defectPhotos.length > 0 && (
                                        <div className={styles.photoSection}>
                                            <h3 className={styles.sectionTitle}>{t('itr.photo.defect')}</h3>
                                            <div className={styles.photoPreviewGrid}>
                                                {displayData.defectPhotos.map((photo, index) => (
                                                    <div key={index} className={styles.photoPreviewItem}>
                                                        <img src={photo} alt={`Defect Photo ${index + 1}`} className={styles.photoPreview} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {displayData.improvementPhotos && displayData.improvementPhotos.length > 0 && (
                                        <div className={styles.photoSection}>
                                            <h3 className={styles.sectionTitle}>{t('itr.photo.improvement')}</h3>
                                            <div className={styles.photoPreviewGrid}>
                                                {displayData.improvementPhotos.map((photo, index) => (
                                                    <div key={index} className={styles.photoPreviewItem}>
                                                        <img src={photo} alt={`Improvement Photo ${index + 1}`} className={styles.photoPreview} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 人員與位置資訊 */}

                        {/* 複檢資料 */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('itr.sectionReinspection')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('itr.reInspectionNo')}</label>
                                    <div className={styles.readOnlyField}>{displayData.reInspectionNumber || '-'}</div>
                                </div>
                            </div>
                        </div>
                        {((itrDetailData?.attachments && itrDetailData.attachments.length > 0) || (itrItem?.attachments && itrItem.attachments.length > 0)) && (
                            <div className={styles.formSection}>
                                <h3 className={styles.sectionTitle}>{t('common.attachments')}</h3>
                                <div className={styles.photoPreviewGrid}>
                                    {(itrDetailData?.attachments || itrItem?.attachments || []).map((attachment, index) => (
                                        <div key={index} className={styles.photoPreviewItem}>
                                            <span style={{ fontSize: 12, wordBreak: 'break-all' }}>Attachment {index + 1}</span>
                                            <a href={attachment} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, marginLeft: 4 }}>View</a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className={styles.modalActions}>
                    <button className={styles.printButton} onClick={handlePrint}>
                        {t('common.print')}
                    </button>
                    <button className={styles.cancelButton} onClick={onClose}>
                        {t('common.close')}
                    </button>
                </div>
            </div>
        </div>
    );
};
