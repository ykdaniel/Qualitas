import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useContractors } from '../../context/ContractorsContext';
import { useNOI } from '../../context/NOIContext';
import { useITR } from '../../context/ITRContext';
import { useNCR, NCRItem } from '../../context/NCRContext';
import FileAttachment from '../Shared/FileAttachment';
import styles from './NCR.module.css';

export interface NCRDetailData {
    ncrNumber: string;
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
    productIntegrityRelated: string;
    permanentProductDeviation: string;
    impactToOM: string;
    projectQualityManager: string;
    defectPhotos: string[];
    improvementPhotos: string[];
    attachments: string[];
    dueDate: string;
}

export interface NCRDetailModalProps {
    ncrId: string | null;
    existingData?: NCRDetailData;
    existingItem?: NCRItem;
    ncrList: NCRItem[];
    onSave: (details: NCRDetailData) => void;
    onClose: () => void;
}

export const NCRDetailModal: React.FC<NCRDetailModalProps> = ({ ncrId, existingData, existingItem, ncrList: propNcrList, onSave, onClose }) => {
    const { t } = useLanguage();
    const { getActiveContractors } = useContractors();
    const { ncrList: contextNcrList } = useNCR();
    const { getNOIList } = useNOI();
    const { itrList } = useITR();

    // Use context list if available, otherwise use prop
    const ncrList = contextNcrList.length > 0 ? contextNcrList : propNcrList;

    // Initialize form data from existing data or existing item
    const getInitialData = (): NCRDetailData => {
        if (existingData) {
            return { ...existingData, itrNumber: existingData.itrNumber || '' };
        }
        if (existingItem) {
            return {
                ncrNumber: existingItem.documentNumber || '',  // 既有編號，顯示用
                itrNumber: '',
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
                productIntegrityRelated: '',
                permanentProductDeviation: '',
                impactToOM: '',
                projectQualityManager: '',
                defectPhotos: existingItem.defectPhotos || [],
                improvementPhotos: existingItem.improvementPhotos || [],
                attachments: existingItem.attachments || [],
                dueDate: (existingItem as any).dueDate || '',
            };
        }
        // 新項目：ncrNumber 留空，由後端自動產生
        return {
            ncrNumber: '',  // 由後端產生
            itrNumber: '',
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
            productIntegrityRelated: '',
            permanentProductDeviation: '',
            impactToOM: '',
            projectQualityManager: '',
            defectPhotos: [],
            improvementPhotos: [],
            attachments: [],
            dueDate: '',
        };
    };

    const [formData, setFormData] = useState<NCRDetailData>(getInitialData());

    const handleFieldChange = (field: keyof NCRDetailData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleNAButton = (field: keyof NCRDetailData) => {
        setFormData(prev => ({ ...prev, [field]: 'Not Applicable' }));
    };

    const handleDateButton = (field: keyof NCRDetailData) => {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}_`;
        setFormData(prev => ({
            ...prev,
            [field]: prev[field] ? `${prev[field]}\n${dateStr}` : dateStr
        }));
    };

    const handleTBCButton = (field: keyof NCRDetailData) => {
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

    const handleSave = () => {
        onSave(formData);
        onClose();
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{existingData || existingItem ? t('ncr.editTitle') : t('ncr.addTitle')}</h2>
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
                                    <label>{t('ncr.documentNumber')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.ncrNumber || t('form.autoGenerated')}
                                        readOnly
                                        style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: formData.ncrNumber ? '#000000' : '#666666' }}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.itrNo')}</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.itrNumber}
                                        onChange={(e) => handleFieldChange('itrNumber', e.target.value)}
                                    >
                                        <option value="">Select ITR No.</option>
                                        {itrList.map((itr) => (
                                            <option key={itr.id} value={itr.documentNumber}>
                                                {itr.documentNumber}
                                            </option>
                                        ))}
                                    </select>
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
                                    <label>{t('ncr.raiseDate')}</label>
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
                                        value={formData.dueDate}
                                        onChange={(e) => handleFieldChange('dueDate', e.target.value)}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.type')}</label>
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
                                id="ncr"
                            />
                        </div>

                        {/* {t('obs.sectionPersonnelLocation')} */}
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
                                        <option value="">{t('common.selectPlaceholder')}</option>
                                        <option value="Use As Is">{t('ncr.disposition.useAsIs')}</option>
                                        <option value="Repair">{t('ncr.disposition.repair')}</option>
                                        <option value="Rework">{t('ncr.disposition.rework')}</option>
                                        <option value="Reject">{t('ncr.disposition.reject')}</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* {t('ncr.sectionDisposition')} */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('ncr.sectionDisposition')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroupFull}>
                                    <div className={styles.labelWithButton}>
                                        <label>{t('ncr.repairMethod')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button
                                                type="button"
                                                className={styles.tbcButton}
                                                onClick={() => handleTBCButton('repairMethodStatement')}
                                            >
                                                {t('common.tbc')}
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.naButton}
                                                onClick={() => handleNAButton('repairMethodStatement')}
                                            >
                                                {t('common.na')}
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={formData.repairMethodStatement}
                                        onChange={(e) => handleFieldChange('repairMethodStatement', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                                <div className={styles.formGroupFull}>
                                    <div className={styles.labelWithButton}>
                                        <label>{t('ncr.correctionAction')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button
                                                type="button"
                                                className={styles.tbcButton}
                                                onClick={() => handleTBCButton('immediateCorrectionAction')}
                                            >
                                                {t('common.tbc')}
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.naButton}
                                                onClick={() => handleNAButton('immediateCorrectionAction')}
                                            >
                                                {t('common.na')}
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={formData.immediateCorrectionAction}
                                        onChange={(e) => handleFieldChange('immediateCorrectionAction', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                                <div className={styles.formGroupFull}>
                                    <div className={styles.labelWithButton}>
                                        <label>{t('ncr.rootCause')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button
                                                type="button"
                                                className={styles.tbcButton}
                                                onClick={() => handleTBCButton('rootCauseAnalysis')}
                                            >
                                                {t('common.tbc')}
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.naButton}
                                                onClick={() => handleNAButton('rootCauseAnalysis')}
                                            >
                                                {t('common.na')}
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={formData.rootCauseAnalysis}
                                        onChange={(e) => handleFieldChange('rootCauseAnalysis', e.target.value)}
                                        rows={4}
                                    />
                                </div>
                                <div className={styles.formGroupFull}>
                                    <div className={styles.labelWithButton}>
                                        <label>{t('ncr.correctiveActions')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button
                                                type="button"
                                                className={styles.tbcButton}
                                                onClick={() => handleTBCButton('correctiveActions')}
                                            >
                                                {t('common.tbc')}
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.naButton}
                                                onClick={() => handleNAButton('correctiveActions')}
                                            >
                                                {t('common.na')}
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={formData.correctiveActions}
                                        onChange={(e) => handleFieldChange('correctiveActions', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                                <div className={styles.formGroupFull}>
                                    <div className={styles.labelWithButton}>
                                        <label>{t('ncr.preventiveAction')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button
                                                type="button"
                                                className={styles.tbcButton}
                                                onClick={() => handleTBCButton('preventiveAction')}
                                            >
                                                {t('common.tbc')}
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.naButton}
                                                onClick={() => handleNAButton('preventiveAction')}
                                            >
                                                {t('common.na')}
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={formData.preventiveAction}
                                        onChange={(e) => handleFieldChange('preventiveAction', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                                <div className={styles.formGroupFull}>
                                    <div className={styles.labelWithButton}>
                                        <label>{t('ncr.integrityStatement')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button
                                                type="button"
                                                className={styles.tbcButton}
                                                onClick={() => handleTBCButton('finalProductIntegrityStatement')}
                                            >
                                                {t('common.tbc')}
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.naButton}
                                                onClick={() => handleNAButton('finalProductIntegrityStatement')}
                                            >
                                                {t('common.na')}
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={formData.finalProductIntegrityStatement}
                                        onChange={(e) => handleFieldChange('finalProductIntegrityStatement', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* {t('ncr.sectionReinspection')} */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('ncr.sectionReinspection')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.itrNo')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.itrNumber}
                                        onChange={(e) => handleFieldChange('itrNumber', e.target.value)}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.noiNo')}</label>
                                    <select
                                        className={styles.formInput}
                                        value={formData.noiNumber}
                                        onChange={(e) => handleFieldChange('noiNumber', e.target.value)}
                                    >
                                        <option value="">{t('ncr.noiNoPlaceholder')}</option>
                                        {getNOIList().map((noi) => (
                                            <option key={noi.id} value={noi.referenceNo}>
                                                {noi.referenceNo}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.reinspectionNo')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.reInspectionNumber}
                                        onChange={(e) => handleFieldChange('reInspectionNumber', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* {t('ncr.sectionQuality')} */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('ncr.sectionQuality')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('common.status')}</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.status}
                                        onChange={(e) => handleFieldChange('status', e.target.value)}
                                    >
                                        <option value="Open">{t('status.open')}</option>
                                        <option value="Closed">{t('status.closed')}</option>
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.optionalLabel}>{t('obs.closeoutDate')}</label>
                                    <input
                                        type="date"
                                        lang="en"
                                        className={styles.formInput}
                                        value={formData.closeoutDate}
                                        onChange={(e) => handleFieldChange('closeoutDate', e.target.value)}
                                        readOnly
                                        style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.integrityRelated')}</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.productIntegrityRelated}
                                        onChange={(e) => handleFieldChange('productIntegrityRelated', e.target.value)}
                                    >
                                        <option value="">{t('common.selectPlaceholder')}</option>
                                        <option value="Yes">{t('common.yes')}</option>
                                        <option value="No">{t('common.no')}</option>
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.permanentDeviation')}</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.permanentProductDeviation}
                                        onChange={(e) => handleFieldChange('permanentProductDeviation', e.target.value)}
                                    >
                                        <option value="">{t('common.selectPlaceholder')}</option>
                                        <option value="Yes">{t('common.yes')}</option>
                                        <option value="No">{t('common.no')}</option>
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.impactOM')}</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.impactToOM}
                                        onChange={(e) => handleFieldChange('impactToOM', e.target.value)}
                                    >
                                        <option value="">{t('common.selectPlaceholder')}</option>
                                        <option value="Yes">{t('common.yes')}</option>
                                        <option value="No">{t('common.no')}</option>
                                    </select>
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
                            </div>
                        </div>
                    </div>
                    <div className={styles.modalActions}>
                        <button className={styles.saveButton} onClick={handleSave}>
                            {t('common.save')}
                        </button>
                        <button className={styles.cancelButton} onClick={onClose}>
                            {t('common.cancel')}
                        </button>
                    </div>
                </div >
            </div >
        </div >
    );
};

export interface NCRDetailsViewModalProps {
    ncrId: string;
    ncrItem?: NCRItem;
    ncrDetailData?: NCRDetailData;
    onClose: () => void;
}

export const NCRDetailsViewModal: React.FC<NCRDetailsViewModalProps> = ({ ncrId, ncrItem, ncrDetailData, onClose }) => {
    const { t } = useLanguage();
    // Combine data from both sources, with detailData taking precedence
    const displayData: NCRDetailData = {
        ncrNumber: ncrDetailData?.ncrNumber || ncrItem?.documentNumber || '',
        itrNumber: ncrDetailData?.itrNumber || '',
        status: ncrDetailData?.status || ncrItem?.status || 'Open',
        raiseDate: ncrDetailData?.raiseDate || ncrItem?.raiseDate || '',
        closeoutDate: ncrDetailData?.closeoutDate || ncrItem?.closeoutDate || '',
        aconex: ncrDetailData?.aconex || ncrItem?.aconex || '',
        type: ncrDetailData?.type || ncrItem?.type || '',
        contractor: ncrDetailData?.contractor || ncrItem?.vendor || '',
        remark: ncrDetailData?.remark || ncrItem?.remark || '',
        subject: ncrDetailData?.subject || ncrItem?.subject || ncrItem?.description || '',
        referenceStandards: ncrDetailData?.referenceStandards || '',
        detailsDescription: ncrDetailData?.detailsDescription || ncrItem?.description || '',
        foundLocation: ncrDetailData?.foundLocation || ncrItem?.foundLocation || '',
        foundBy: ncrDetailData?.foundBy || ncrItem?.foundBy || '',
        raisedBy: ncrDetailData?.raisedBy || ncrItem?.raisedBy || '',
        serialNumbers: ncrDetailData?.serialNumbers || '',
        productDisposition: ncrDetailData?.productDisposition || ncrItem?.productDisposition || '',
        repairMethodStatement: ncrDetailData?.repairMethodStatement || '',
        immediateCorrectionAction: ncrDetailData?.immediateCorrectionAction || '',
        rootCauseAnalysis: ncrDetailData?.rootCauseAnalysis || '',
        correctiveActions: ncrDetailData?.correctiveActions || '',
        preventiveAction: ncrDetailData?.preventiveAction || '',
        finalProductIntegrityStatement: ncrDetailData?.finalProductIntegrityStatement || '',
        reInspectionNumber: ncrDetailData?.reInspectionNumber || '',
        noiNumber: ncrDetailData?.noiNumber || '',
        productIntegrityRelated: ncrDetailData?.productIntegrityRelated || ncrItem?.productIntegrityRelated || '',
        permanentProductDeviation: ncrDetailData?.permanentProductDeviation || ncrItem?.permanentProductDeviation || '',
        impactToOM: ncrDetailData?.impactToOM || ncrItem?.impactToOM || '',
        projectQualityManager: ncrDetailData?.projectQualityManager || '',
        defectPhotos: ncrDetailData?.defectPhotos || ncrItem?.defectPhotos || [],
        improvementPhotos: ncrDetailData?.improvementPhotos || ncrItem?.improvementPhotos || [],
        attachments: ncrDetailData?.attachments || ncrItem?.attachments || [],
        dueDate: ncrDetailData?.dueDate || (ncrItem as any)?.dueDate || '',
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{t('ncr.viewTitle')}</h2>
                    <button className={styles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={styles.modalBody}>
                    <div className={styles.formSections}>
                        <FileAttachment
                            attachments={displayData.attachments || []}
                            onUpload={() => { }} // Read-only
                            onRemove={() => { }} // Read-only
                            id="ncr-view"
                            readOnly={true}
                        />
                        {/* 不符合項目資訊 */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('obs.sectionInfo')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.itrNo')}</label>
                                    <div className={styles.readOnlyField}>{displayData.itrNumber || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('itr.ncrNo')}</label>
                                    <div className={styles.readOnlyField}>{displayData.ncrNumber || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.subject')}</label>
                                    <div className={styles.readOnlyField}>{displayData.subject || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.raiseDate')}</label>
                                    <div className={styles.readOnlyField}>{displayData.raiseDate || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.type')}</label>
                                    <div className={styles.readOnlyField}>
                                        {displayData.type ? t(`ncr.type.${displayData.type.toLowerCase()}`) : '-'}
                                    </div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('common.contractor')}</label>
                                    <div className={styles.readOnlyField}>{displayData.contractor || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.refStandards')}</label>
                                    <div className={styles.readOnlyField}>{displayData.referenceStandards || '-'}</div>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label>{t('obs.detailsDescription')}</label>
                                    <div className={styles.readOnlyField}>{displayData.detailsDescription || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.foundLocation')}</label>
                                    <div className={styles.readOnlyField}>{displayData.foundLocation || '-'}</div>
                                </div>
                            </div>
                        </div>

                        {/* 照片 */}
                        {(displayData.defectPhotos?.length > 0 || displayData.improvementPhotos?.length > 0) && (
                            <div className={styles.formSection}>
                                <div className={styles.photoSectionContainer}>
                                    {displayData.defectPhotos && displayData.defectPhotos.length > 0 && (
                                        <div className={styles.photoSection}>
                                            <h3 className={styles.sectionTitle}>{t('obs.defectPhotos')}</h3>
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
                                            <h3 className={styles.sectionTitle}>{t('obs.improvementPhotos')}</h3>
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

                        {/* {t('obs.sectionPersonnelLocation')} */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('obs.sectionPersonnelLocation')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.foundBy')}</label>
                                    <div className={styles.readOnlyField}>{displayData.foundBy || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.raisedBy')}</label>
                                    <div className={styles.readOnlyField}>{displayData.raisedBy || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.serialNumbers')}</label>
                                    <div className={styles.readOnlyField}>{displayData.serialNumbers || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.productDisposition')}</label>
                                    <div className={styles.readOnlyField}>
                                        {displayData.productDisposition ? t(`ncr.disposition.${displayData.productDisposition.replace(/\s+/g, '').replace(/^./, str => str.toLowerCase())}`) : '-'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* {t('ncr.sectionDisposition')} */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('ncr.sectionDisposition')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroupFull}>
                                    <label>{t('ncr.repairMethod')}</label>
                                    <div className={styles.readOnlyField}>{displayData.repairMethodStatement || '-'}</div>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label>{t('ncr.correctionAction')}</label>
                                    <div className={styles.readOnlyField}>{displayData.immediateCorrectionAction || '-'}</div>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label>{t('ncr.rootCause')}</label>
                                    <div className={styles.readOnlyField}>{displayData.rootCauseAnalysis || '-'}</div>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label>{t('ncr.correctiveActions')}</label>
                                    <div className={styles.readOnlyField}>{displayData.correctiveActions || '-'}</div>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label>{t('ncr.preventiveAction')}</label>
                                    <div className={styles.readOnlyField}>{displayData.preventiveAction || '-'}</div>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label>{t('ncr.integrityStatement')}</label>
                                    <div className={styles.readOnlyField}>{displayData.finalProductIntegrityStatement || '-'}</div>
                                </div>
                            </div>
                        </div>

                        {/* {t('ncr.sectionReinspection')} */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('ncr.sectionReinspection')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.itrNo')}</label>
                                    <div className={styles.readOnlyField}>{displayData.itrNumber || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('itr.ncrNo')}</label>
                                    <div className={styles.readOnlyField}>{displayData.ncrNumber || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.reinspectionNo')}</label>
                                    <div className={styles.readOnlyField}>{displayData.reInspectionNumber || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.noiNo')}</label>
                                    <div className={styles.readOnlyField}>{displayData.noiNumber || '-'}</div>
                                </div>
                            </div>
                        </div>

                        {/* {t('ncr.sectionQuality')} */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('ncr.sectionQuality')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('common.status')}</label>
                                    <div className={styles.readOnlyField}>
                                        {displayData.status.toLowerCase() === 'open' ? t('status.open') : t('status.closed')}
                                    </div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('obs.closeoutDate')}</label>
                                    <div className={styles.readOnlyField}>{displayData.closeoutDate || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.integrityRelated')}</label>
                                    <div className={styles.readOnlyField}>{displayData.productIntegrityRelated || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.permanentDeviation')}</label>
                                    <div className={styles.readOnlyField}>{displayData.permanentProductDeviation || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.impactOM')}</label>
                                    <div className={styles.readOnlyField}>{displayData.impactToOM || '-'}</div>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label>{t('common.remark')}</label>
                                    <div className={styles.readOnlyField}>{displayData.remark || '-'}</div>
                                </div>
                            </div>
                        </div>
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
