import React, { useState } from 'react';
import { toast } from 'sonner';
import { getNextRevision } from '../../utils/revision';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
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
    rev: string;
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
    itrNumber: string;
    projectQualityManager: string;
    defectPhotos: string[];
    improvementPhotos: string[];
    attachments: string[];
    dueDate?: string;
}

export interface PendingUploads {
    category: string;
    files: File[];
}

export interface OBSDetailModalProps {
    obsId: string | null;
    existingData?: OBSDetailData;
    existingItem?: OBSItem;
    onSave: (details: OBSDetailData, pendingUploads: PendingUploads[], deletedFileIds: string[]) => void | Promise<void>;
    onClose: () => void;
}

export const OBSDetailModal: React.FC<OBSDetailModalProps> = ({ obsId: _obsId, existingData, existingItem, onSave, onClose }) => {
    const { t } = useLanguage();
    const { getActiveContractors } = useContractorsStore();

    // Initialize form data from existing data or existing item
    const getInitialData = (): OBSDetailData => {
        if (existingData) {
            return { ...existingData, rev: existingData.rev || '' };
        }
        if (existingItem) {
            return {
                obsNumber: existingItem.documentNumber || '',
                rev: existingItem.rev || '',
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
                itrNumber: '',
                projectQualityManager: '',
                defectPhotos: existingItem.defectPhotos || [],
                improvementPhotos: existingItem.improvementPhotos || [],
                attachments: existingItem.attachments || [],
                dueDate: (existingItem as any).dueDate || '',
            };
        }
        return {
            obsNumber: '',
            rev: '',
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
            itrNumber: '',
            projectQualityManager: '',
            defectPhotos: [],
            improvementPhotos: [],
            attachments: [],
            dueDate: '',
        };
    };

    const [formData, setFormData] = useState<OBSDetailData>(getInitialData());

    // File handling states
    const [pendingDefectPhotos, setPendingDefectPhotos] = useState<File[]>([]);
    const [pendingImprovementPhotos, setPendingImprovementPhotos] = useState<File[]>([]);
    const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
    const [deletedFileIds, setDeletedFileIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    const handleFieldChange = (field: keyof OBSDetailData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleRemoveLegacyPhoto = (index: number, photoType: 'defect' | 'improvement') => {
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

    const handleRemoveLegacyAttachment = (index: number) => {
        setFormData(prev => ({
            ...prev,
            attachments: prev.attachments.filter((_, i) => i !== index)
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(formData, [
                { category: 'defectPhoto', files: pendingDefectPhotos },
                { category: 'improvementPhoto', files: pendingImprovementPhotos },
                { category: 'attachment', files: pendingAttachments }
            ], deletedFileIds);
            onClose();
        } catch (err) {
            toast.error((err as Error)?.message || t('common.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handlePublish = async () => {
        const nextRev = getNextRevision(formData.rev);
        if (window.confirm(`Are you sure you want to publish as Revision ${nextRev}?`)) {
            setSaving(true);
            try {
                await onSave({
                    ...formData,
                    rev: nextRev,
                }, [
                    { category: 'defectPhoto', files: pendingDefectPhotos },
                    { category: 'improvementPhoto', files: pendingImprovementPhotos },
                    { category: 'attachment', files: pendingAttachments }
                ], deletedFileIds);
                onClose();
            } catch (err) {
                toast.error((err as Error)?.message || t('common.saveFailed'));
            } finally {
                setSaving(false);
            }
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{existingData || existingItem ? t('obs.editTitle') : t('obs.addTitle')}</h2>
                    <button className={styles.closeButton} onClick={onClose} disabled={saving}>×</button>
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
                                    <label>Rev</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.rev}
                                        readOnly
                                        placeholder="-"
                                        style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
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
                                    <label>{t('ncr.noiNo')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.noiNumber || ''}
                                        onChange={(e) => handleFieldChange('noiNumber', e.target.value)}
                                        placeholder="Optionally link to NOI"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.itrNo')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.itrNumber || ''}
                                        onChange={(e) => handleFieldChange('itrNumber', e.target.value)}
                                        placeholder="Optionally link to ITR"
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
                            <FileAttachment
                                id="obs-defect-photos"
                                category="defectPhoto"
                                entityType={existingItem ? 'obs' : undefined}
                                entityId={existingItem?.id}
                                title={t('obs.defectPhotos')}
                                legacyAttachments={formData.defectPhotos}
                                onPendingFilesChange={setPendingDefectPhotos}
                                onDeleteExistingFile={(id) => setDeletedFileIds(prev => [...prev, id])}
                                onRemoveLegacy={(index) => handleRemoveLegacyPhoto(index, 'defect')}
                                accept="image/*"
                            />
                        </div>
                        <div className={styles.formSection}>
                            <FileAttachment
                                id="obs-improvement-photos"
                                category="improvementPhoto"
                                entityType={existingItem ? 'obs' : undefined}
                                entityId={existingItem?.id}
                                title={t('obs.improvementPhotos')}
                                legacyAttachments={formData.improvementPhotos}
                                onPendingFilesChange={setPendingImprovementPhotos}
                                onDeleteExistingFile={(id) => setDeletedFileIds(prev => [...prev, id])}
                                onRemoveLegacy={(index) => handleRemoveLegacyPhoto(index, 'improvement')}
                                accept="image/*"
                            />
                        </div>

                        {/* Attachments */}
                        <div className={styles.formSection}>
                            <FileAttachment
                                id="obs-attachments"
                                category="attachment"
                                entityType={existingItem ? 'obs' : undefined}
                                entityId={existingItem?.id}
                                title={t('obs.attachments')}
                                legacyAttachments={formData.attachments}
                                onPendingFilesChange={setPendingAttachments}
                                onDeleteExistingFile={(id) => setDeletedFileIds(prev => [...prev, id])}
                                onRemoveLegacy={handleRemoveLegacyAttachment}
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
                                        <option value="In Progress">In Progress</option>
                                        <option value="Resolved">Resolved</option>
                                        <option value="Closed">{t('status.closed')}</option>
                                        <option value="Void">{t('status.void')}</option>
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
                    <button
                        type="button"
                        className={styles.saveButton}
                        onClick={handlePublish}
                        style={{ backgroundColor: '#4f46e5' }}
                        title="Publish as next revision"
                        disabled={saving}
                    >
                        Publish
                    </button>
                    <button type="button" className={styles.saveButton} onClick={handleSave} style={{ marginLeft: '12px' }} disabled={saving}>
                        {saving ? t('obs.saving') : t('common.save')}
                    </button>
                    <button type="button" className={styles.printButton} onClick={handlePrint} disabled={saving}>
                        {t('common.print')}
                    </button>
                    <button type="button" className={styles.cancelButton} onClick={onClose} disabled={saving}>
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
                        {/* 關聯追溯 */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('ncr.sectionReinspection') || 'Related Links'}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.noiNo')}</label>
                                    <div className={styles.readOnlyField}>{(obsItem as any).noiNumber || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('ncr.itrNo')}</label>
                                    <div className={styles.readOnlyField}>{(obsItem as any).itrNumber || '-'}</div>
                                </div>
                            </div>
                        </div>
                        <div className={styles.formSection}>
                            <FileAttachment
                                id="obs-defect-photos-view"
                                category="defectPhoto"
                                entityType="obs"
                                entityId={obsItem.id}
                                title={t('obs.defectPhotos')}
                                legacyAttachments={obsItem.defectPhotos || []}
                                readOnly={true}
                                accept="image/*"
                            />
                        </div>
                        <div className={styles.formSection}>
                            <FileAttachment
                                id="obs-improvement-photos-view"
                                category="improvementPhoto"
                                entityType="obs"
                                entityId={obsItem.id}
                                title={t('obs.improvementPhotos')}
                                legacyAttachments={obsItem.improvementPhotos || []}
                                readOnly={true}
                                accept="image/*"
                            />
                        </div>
                        <div className={styles.formSection}>
                            <FileAttachment
                                id="obs-attachments-view"
                                category="attachment"
                                entityType="obs"
                                entityId={obsItem.id}
                                title={t('obs.attachments')}
                                legacyAttachments={obsItem.attachments || []}
                                readOnly={true}
                            />
                        </div>
                    </div>
                </div>
                <div className={styles.modalActions}>
                    <button type="button" className={styles.cancelButton} onClick={onClose}>{t('common.cancel')}</button>
                </div>
            </div>
        </div>
    );
};
