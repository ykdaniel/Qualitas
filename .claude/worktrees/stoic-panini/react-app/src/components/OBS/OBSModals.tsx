import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useContractors } from '../../context/ContractorsContext';
import FileAttachment from '../Shared/FileAttachment';
import styles from './OBS.module.css';

// OBSItem interface - 應該從 OBSContext 導入，但為了相容性暫時在此定義
export interface OBSItem {
    id: string;
    vendor: string;
    documentNumber: string;
    description: string;
    rev: string;
    submit: string;
    status: string;
    remark: string;
    hasDetails?: boolean;
    raiseDate?: string;
    closeoutDate?: string;
    aconex?: string;
    type?: string;
    subject?: string;
    foundBy?: string;
    raisedBy?: string;
    foundLocation?: string;
    productDisposition?: string;
    productIntegrityRelated?: string;
    permanentProductDeviation?: string;
    impactToOM?: string;
    defectPhotos?: string[];
    improvementPhotos?: string[];
    attachments?: string[];
}

export interface OBSDetailData {
    obsNumber: string;
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
    foundBy: string;
    raisedBy: string;
    serialNumbers: string;
    productDisposition: string;
    repairMethodStatement: string;
    immediateCorrectionAction: string;
    rootCauseAnalysis: string;
    correctiveActions: string;
    preventiveAction: string;
    finalProductIntegrityStatement: string;
    reInspectionNumber: string;
    noiNumber: string;
    projectQualityManager: string;
    defectPhotos: string[];
    improvementPhotos: string[];
    attachments: string[];
    dueDate?: string;
}

export interface OBSDetailModalProps {
    obsId: string | null;
    existingData?: OBSDetailData;
    existingItem?: OBSItem;
    onSave: (details: OBSDetailData) => void;
    onClose: () => void;
}

export const OBSDetailModal: React.FC<OBSDetailModalProps> = ({ obsId, existingData, existingItem, onSave, onClose }) => {
    const { t } = useLanguage();
    const { getActiveContractors } = useContractors();

    // Initialize form data from existing data or existing item
    const getInitialData = (): OBSDetailData => {
        if (existingData) {
            return existingData;
        }
        if (existingItem) {
            return {
                obsNumber: existingItem.documentNumber || '',
                status: existingItem.status || 'Open',
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
                foundBy: existingItem.foundBy || '',
                raisedBy: existingItem.raisedBy || '',
                serialNumbers: '',
                productDisposition: existingItem.productDisposition || '',
                repairMethodStatement: '',
                immediateCorrectionAction: '',
                rootCauseAnalysis: '',
                correctiveActions: '',
                preventiveAction: '',
                finalProductIntegrityStatement: '',
                reInspectionNumber: '',
                noiNumber: '',
                projectQualityManager: '',
                defectPhotos: existingItem.defectPhotos || [],
                improvementPhotos: existingItem.improvementPhotos || [],
                attachments: existingItem.attachments || [],
                dueDate: (existingItem as any).dueDate || '',
            };
        }
        return {
            obsNumber: '',
            status: 'Open',
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
            foundBy: '',
            raisedBy: '',
            serialNumbers: '',
            productDisposition: '',
            repairMethodStatement: '',
            immediateCorrectionAction: '',
            rootCauseAnalysis: '',
            correctiveActions: '',
            preventiveAction: '',
            finalProductIntegrityStatement: '',
            reInspectionNumber: '',
            noiNumber: '',
            projectQualityManager: '',
            defectPhotos: [],
            improvementPhotos: [],
            attachments: [],
            dueDate: '',
        };
    };

    const [formData, setFormData] = useState<OBSDetailData>(getInitialData());

    const handleFieldChange = (field: keyof OBSDetailData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleNAButton = (field: keyof OBSDetailData) => {
        setFormData(prev => ({ ...prev, [field]: 'Not Applicable' }));
    };

    const handleTBCButton = (field: keyof OBSDetailData) => {
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

    const handleSave = () => {
        onSave(formData);
        onClose();
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{existingData || existingItem ? t('obs.editTitle') : t('obs.addTitle')}</h2>
                    <button className={styles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={styles.modalBody}>
                    <p className={styles.formRequiredHint}>{t('form.requiredHint')}</p>
                    <div className={styles.formSections}>
                        {/* 不符合項目資訊 */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('obs.sectionInfo')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.refNo')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.obsNumber || t('form.autoGenerated')}
                                        readOnly
                                        style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: formData.obsNumber ? '#000000' : '#666666' }}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.subject')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.subject}
                                        onChange={(e) => handleFieldChange('subject', e.target.value)}
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label>{t('obs.raiseDate')}</label>
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
                                    <label>{t('obs.closeoutDate')}</label>
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
                                <div className={styles.formGroup}>
                                    <label>{t('obs.type')}</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.type}
                                        onChange={(e) => handleFieldChange('type', e.target.value)}
                                    >
                                        <option value="">{t('obs.typePlaceholder')}</option>
                                        <option value="Design">{t('ncr.type.design')}</option>
                                        <option value="Material">{t('ncr.type.material')}</option>
                                        <option value="Workmanship">{t('ncr.type.workmanship')}</option>
                                        <option value="Document">{t('ncr.type.document')}</option>
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.contractor')}</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.contractor}
                                        onChange={(e) => handleFieldChange('contractor', e.target.value)}
                                    >
                                        <option value="">{t('obs.contractorPlaceholder')}</option>
                                        {getActiveContractors().map((contractor) => (
                                            <option key={contractor.id} value={contractor.name}>
                                                {contractor.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.refStandards')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.referenceStandards}
                                        onChange={(e) => handleFieldChange('referenceStandards', e.target.value)}
                                    />
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label>{t('obs.detailsDescription')}</label>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={formData.detailsDescription}
                                        onChange={(e) => handleFieldChange('detailsDescription', e.target.value)}
                                        rows={4}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.foundLocation')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.foundLocation}
                                        onChange={(e) => handleFieldChange('foundLocation', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 照片上傳 */}
                        <div className={styles.formSection}>
                            <div className={styles.photoSectionContainer}>
                                <div className={styles.photoSection}>
                                    <h3 className={styles.sectionTitle}>{t('obs.defectPhotos')}</h3>
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
                                            <span>{t('obs.uploadPhotos')}</span>
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
                                                            aria-label="Remove photo"
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
                                    <h3 className={styles.sectionTitle}>{t('obs.improvementPhotos')}</h3>
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
                                            <span>{t('obs.uploadPhotos')}</span>
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
                                                            aria-label="Remove photo"
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
                            <FileAttachment
                                attachments={formData.attachments}
                                onUpload={handleAttachmentUpload}
                                onRemove={handleRemoveAttachment}
                                id="obs"
                                title={t('obs.attachments')}
                            />
                        </div>

                        {/* 人員與位置資訊 */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('obs.sectionPersonnelLocation')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.foundBy')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.foundBy}
                                        onChange={(e) => handleFieldChange('foundBy', e.target.value)}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.raisedBy')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.raisedBy}
                                        onChange={(e) => handleFieldChange('raisedBy', e.target.value)}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.serialNumbers')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.serialNumbers}
                                        onChange={(e) => handleFieldChange('serialNumbers', e.target.value)}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.productDisposition')}</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.productDisposition}
                                        onChange={(e) => handleFieldChange('productDisposition', e.target.value)}
                                    >
                                        <option value="">{t('obs.productDispositionPlaceholder')}</option>
                                        <option value="Use As Is">Use As Is</option>
                                        <option value="Repair">Repair</option>
                                        <option value="Rework">Rework</option>
                                        <option value="Reject">Reject</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Quality Assessment */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('pqp.qualityAssessment')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.status')}</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.status}
                                        onChange={(e) => handleFieldChange('status', e.target.value)}
                                    >
                                        <option value="Open">{t('status.open')}</option>
                                        <option value="Closed">{t('status.closed')}</option>
                                    </select>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <div className={styles.labelWithButton}>
                                        <label className={styles.optionalLabel}>{t('common.remark')}</label>
                                        <button
                                            type="button"
                                            className={styles.tbcButton}
                                            onClick={() => {
                                                const dateStr = new Date().toLocaleDateString();
                                                const newRemark = formData.remark ? `${formData.remark}\n${dateStr}: ` : `${dateStr}: `;
                                                handleFieldChange('remark', newRemark);
                                            }}
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
                            </div>
                        </div>
                    </div>
                </div>
                <div className={styles.modalActions}>
                    <button type="button" className={styles.saveButton} onClick={handleSave}>
                        {t('common.save')}
                    </button>
                    <button type="button" className={styles.printButton} onClick={handlePrint}>
                        {t('common.print')}
                    </button>
                    <button type="button" className={styles.cancelButton} onClick={onClose}>
                        {t('common.cancel')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export interface OBSDetailsViewModalProps {
    obsId: string;
    obsItem: OBSItem | undefined;
    obsDetailData?: OBSDetailData;
    onClose: () => void;
}

export const OBSDetailsViewModal: React.FC<OBSDetailsViewModalProps> = ({ obsItem, onClose }) => {
    const { t } = useLanguage();
    if (!obsItem) return null;
    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{t('obs.viewTitle')}</h2>
                    <button type="button" className={styles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={styles.modalBody}>
                    <div className={styles.formSections}>
                        <div className={styles.formSection}>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}><label>{t('obs.refNo')}</label><div className={styles.readOnlyField}>{obsItem.documentNumber}</div></div>
                                <div className={styles.formGroup}><label>{t('obs.status')}</label><div className={styles.readOnlyField}>{obsItem.status}</div></div>
                                <div className={styles.formGroup}><label>{t('obs.contractor')}</label><div className={styles.readOnlyField}>{obsItem.vendor}</div></div>
                                <div className={styles.formGroup}><label>{t('obs.type')}</label><div className={styles.readOnlyField}>{obsItem.type || '-'}</div></div>
                                <div className={styles.formGroup}><label>{t('obs.subject')}</label><div className={styles.readOnlyField}>{obsItem.subject || obsItem.description || '-'}</div></div>
                                <div className={styles.formGroup}><label>{t('obs.raiseDate')}</label><div className={styles.readOnlyField}>{obsItem.raiseDate || '-'}</div></div>
                                <div className={styles.formGroup}><label>{t('obs.closeoutDate')}</label><div className={styles.readOnlyField}>{obsItem.closeoutDate || '-'}</div></div>
                                <div className={styles.formGroup}><label>{t('obs.foundBy')}</label><div className={styles.readOnlyField}>{obsItem.foundBy || '-'}</div></div>
                                <div className={styles.formGroup}><label>{t('obs.raisedBy')}</label><div className={styles.readOnlyField}>{obsItem.raisedBy || '-'}</div></div>
                                <div className={styles.formGroup}><label>{t('obs.productDisposition')}</label><div className={styles.readOnlyField}>{obsItem.productDisposition || '-'}</div></div>
                            </div>
                        </div>
                    </div>
                    <FileAttachment
                        attachments={obsItem.attachments || []}
                        onUpload={() => { }}
                        onRemove={() => { }}
                        id="obs-view"
                        readOnly={true}
                        title={t('obs.attachments')}
                    />
                </div>
                <div className={styles.modalActions}>
                    <button type="button" className={styles.cancelButton} onClick={onClose}>{t('common.cancel')}</button>
                </div>
            </div>
        </div>
    );
};
