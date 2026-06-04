import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { getUsers, type User as ApiUser } from '../../services/api';
import { getNextRevision } from '../../utils/revision';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useNOIStore } from '../../store/noiStore';
import { useITRStore } from '../../store/itrStore';
import type { NCRItem } from '../../store/ncrStore';
import FileAttachment from '../Shared/FileAttachment';
import ImagePreviewOverlay from '../Shared/ImagePreviewOverlay';
import RelatedDocuments from '../ui/RelatedDocuments';
import styles from './NCR.module.css';

import formStyles from '../Shared/FormShell.module.css';
export interface NCRDetailData {
    ncrNumber: string;
    itrNumber: string;
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
    productIntegrityRelated: string;
    permanentProductDeviation: string;
    impactToOM: string;
    projectQualityManager: string;
    defectPhotos: string[];
    improvementPhotos: string[];
    attachments: string[];
    dueDate: string;
    // NCR field-model improvements (BACKLOG #13)
    severity: string;            // Major / Minor
    discipline: string;          // Civil / Structural / ...
    assignedTo: number | null;   // FK users.id — person responsible to close
    closedBy: number | null;     // read-only, stamped server-side
    verifiedBy: number | null;   // read-only, stamped server-side
    effectivenessVerified: string;       // Pending / Yes / No
    effectivenessVerifiedBy: number | null;
    effectivenessVerifiedDate: string;
    effectivenessNotes: string;
}

export interface PendingUploads {
    category: string;
    files: File[];
}

export interface NCRDetailModalProps {
    ncrId: string | null;
    existingItem?: NCRItem;
    onSave: (details: NCRDetailData, pendingUploads: PendingUploads[], deletedFileIds: string[]) => void | Promise<void>;
    onClose: () => void;
}

export const NCRDetailModal: React.FC<NCRDetailModalProps> = ({ ncrId: _ncrId, existingItem, onSave, onClose }) => {
    const { t } = useLanguage();
    const { getActiveContractors } = useContractorsStore();
    const noiList = useNOIStore(state => state.noiList);
    const getNOIList = () => noiList;
    const itrList = useITRStore(state => state.itrList);

    // Initialize form data from existing item
    const getInitialData = (): NCRDetailData => {
        if (existingItem) {
            return {
                ncrNumber: existingItem.documentNumber || '',  // 既有編號，顯示用
                itrNumber: existingItem.itrNumber || '',
                rev: existingItem.rev || '',
                status: existingItem.status || 'Open',
                raiseDate: existingItem.raiseDate || '',
                closeoutDate: existingItem.closeoutDate || '',
                aconex: existingItem.aconex || '',
                type: existingItem.type || '',
                contractor: existingItem.vendor || '',
                remark: existingItem.remark || '',
                subject: existingItem.subject || existingItem.description || '',
                referenceStandards: existingItem.referenceStandards || '',
                detailsDescription: existingItem.description || '',
                foundLocation: existingItem.foundLocation || '',
                foundBy: existingItem.foundBy || '',
                raisedBy: existingItem.raisedBy || '',
                serialNumbers: existingItem.serialNumbers || '',
                productDisposition: existingItem.productDisposition || '',
                repairMethodStatement: existingItem.repairMethodStatement || '',
                immediateCorrectionAction: existingItem.immediateCorrectionAction || '',
                rootCauseAnalysis: existingItem.rootCauseAnalysis || '',
                correctiveActions: existingItem.correctiveActions || '',
                preventiveAction: existingItem.preventiveAction || '',
                finalProductIntegrityStatement: existingItem.finalProductIntegrityStatement || '',
                reInspectionNumber: existingItem.reInspectionNumber || '',
                noiNumber: existingItem.noiNumber || '',
                productIntegrityRelated: existingItem.productIntegrityRelated || '',
                permanentProductDeviation: existingItem.permanentProductDeviation || '',
                impactToOM: existingItem.impactToOM || '',
                projectQualityManager: existingItem.projectQualityManager || '',
                defectPhotos: existingItem.defectPhotos || [],
                improvementPhotos: existingItem.improvementPhotos || [],
                attachments: existingItem.attachments || [],
                dueDate: (existingItem as any).dueDate || '',
                severity: existingItem.severity || '',
                discipline: existingItem.discipline || '',
                assignedTo: existingItem.assignedTo ?? null,
                closedBy: existingItem.closedBy ?? null,
                verifiedBy: existingItem.verifiedBy ?? null,
                effectivenessVerified: existingItem.effectivenessVerified || '',
                effectivenessVerifiedBy: existingItem.effectivenessVerifiedBy ?? null,
                effectivenessVerifiedDate: existingItem.effectivenessVerifiedDate || '',
                effectivenessNotes: existingItem.effectivenessNotes || '',
            };
        }
        // 新項目：ncrNumber 留空，由後端自動產生
        return {
            ncrNumber: '',  // 由後端產生
            itrNumber: '',
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
            productIntegrityRelated: '',
            permanentProductDeviation: '',
            impactToOM: '',
            projectQualityManager: '',
            defectPhotos: [],
            improvementPhotos: [],
            attachments: [],
            dueDate: '',
            severity: '',
            discipline: '',
            assignedTo: null,
            closedBy: null,
            verifiedBy: null,
            effectivenessVerified: 'Pending',
            effectivenessVerifiedBy: null,
            effectivenessVerifiedDate: '',
            effectivenessNotes: '',
        };
    };

    const [formData, setFormData] = useState<NCRDetailData>(getInitialData());

    // File handling states
    const [pendingDefectPhotos, setPendingDefectPhotos] = useState<File[]>([]);
    const [pendingImprovementPhotos, setPendingImprovementPhotos] = useState<File[]>([]);
    const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
    const [deletedFileIds, setDeletedFileIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    // Users for the assignedTo person picker (BACKLOG #13 #2 — FK to users)
    const [users, setUsers] = useState<ApiUser[]>([]);
    useEffect(() => {
        let alive = true;
        getUsers().then(u => { if (alive) setUsers(u); }).catch(() => {/* non-fatal */});
        return () => { alive = false; };
    }, []);
    const userLabel = (id: number | null) => {
        if (id == null) return '-';
        const u = users.find(x => x.id === id);
        return u ? (u.full_name || u.username) : `#${id}`;
    };

    // 附件預覽
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState<string>('');
    const handlePreview = (url: string, name?: string) => {
        setPreviewUrl(url);
        setPreviewName(name || '');
    };

    const handleFieldChange = (field: keyof NCRDetailData, value: string) => {
        // 勾稽聯動：NCR 關閉後提示 NOI 可轉為 Resolved
        if (field === 'status' && value === 'Closed' && formData.noiNumber) {
            toast.info(`NCR closed. You may now update NOI ${formData.noiNumber} status to "Resolved".`);
        }
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
        if (!formData.itrNumber && !formData.noiNumber) {
            // Warn if no link to origin
            if (!window.confirm('This NCR is not linked to any ITR or NOI. Do you want to continue?')) {
                return;
            }
        }

        // Strict QC Logic: Determine Closure Eligibility
        if (formData.status === 'Closed') {
            // Must have Disposition
            if (!formData.productDisposition) {
                toast.warning("Cannot close NCR without Product Disposition.");
                return;
            }
            // Must have Re-Inspection info (either number or link to new NOI)
            if (!formData.reInspectionNumber) {
                toast.warning("Cannot close NCR without Re-Inspection / Verification Reference (Strict QC Process).");
                return;
            }
            // BACKLOG #13 #3: effectiveness must be verified before closing
            if (formData.effectivenessVerified !== 'Yes') {
                toast.warning(t('ncr.closeNeedsEffectiveness') || "Cannot close NCR until corrective-action effectiveness is verified (set Effectiveness Verified = 'Yes').");
                return;
            }
        }

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

    const handlePublish = async () => {
        const nextRev = getNextRevision(formData.rev);
        if (window.confirm(`Are you sure you want to publish as Revision ${nextRev}?`)) {
            setSaving(true);
            try {
                await onSave({
                    ...formData,
                    rev: nextRev,
                    // Keep current status — don't force Closed (must go through workflow)
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
        <div className={formStyles.modalOverlay}>
            <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={formStyles.modalHeader}>
                    <h2>{existingItem ? t('ncr.editTitle') : t('ncr.addTitle')}</h2>
                    <button className={formStyles.closeButton} onClick={onClose} disabled={saving}>×</button>
                </div>
                <div className={formStyles.modalBody}>
                    <p className={formStyles.formRequiredHint}>{t('form.requiredHint')}</p>
                    <div className={formStyles.formSections}>
                        {/* 不符合項目資訊 */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('obs.sectionInfo')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.documentNumber')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={formData.ncrNumber || t('form.autoGenerated')}
                                        readOnly
                                        style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: formData.ncrNumber ? '#000000' : '#666666' }}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>Rev</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={formData.rev}
                                        readOnly
                                        placeholder="-"
                                        style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.itrNo')}</label>
                                    <select
                                        className={formStyles.formSelect}
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
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.subject')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={formData.subject}
                                        onChange={(e) => handleFieldChange('subject', e.target.value)}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.raiseDate')}</label>
                                    <input
                                        type={formData.raiseDate ? 'date' : 'text'}
                                        placeholder="mm/dd/yyyy"
                                        lang="en"
                                        onFocus={(e) => (e.target.type = 'date')}
                                        onBlur={(e) => {
                                            if (!e.target.value) e.target.type = 'text';
                                        }}
                                        className={formStyles.formInput}
                                        value={formData.raiseDate}
                                        onChange={(e) => handleFieldChange('raiseDate', e.target.value)}
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
                                        value={formData.dueDate}
                                        onChange={(e) => handleFieldChange('dueDate', e.target.value)}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.type')}</label>
                                    <select
                                        className={formStyles.formSelect}
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
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.severity') || 'Severity'}</label>
                                    <select
                                        className={formStyles.formSelect}
                                        value={formData.severity}
                                        onChange={(e) => handleFieldChange('severity', e.target.value)}
                                    >
                                        <option value="">{t('common.selectPlaceholder') || 'Select...'}</option>
                                        <option value="Major">{t('ncr.severity.major') || 'Major 重大'}</option>
                                        <option value="Minor">{t('ncr.severity.minor') || 'Minor 輕微'}</option>
                                    </select>
                                    <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0', lineHeight: 1.4 }}>
                                        {t('ncr.severity.hint') || 'Major: affects fitness-for-purpose / safety / code or contract compliance, or is a repeat/systemic issue — needs PQM/owner sign-off (SLA 7 days). Minor: isolated, easily corrected, no impact on function — contractor corrects + QA verifies (SLA 14 days).'}
                                    </p>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.discipline') || 'Discipline'}</label>
                                    <select
                                        className={formStyles.formSelect}
                                        value={formData.discipline}
                                        onChange={(e) => handleFieldChange('discipline', e.target.value)}
                                    >
                                        <option value="">{t('common.selectPlaceholder') || 'Select...'}</option>
                                        <option value="Civil">{t('ncr.discipline.civil') || 'Civil 土建'}</option>
                                        <option value="Structural">{t('ncr.discipline.structural') || 'Structural 結構'}</option>
                                        <option value="Mechanical">{t('ncr.discipline.mechanical') || 'Mechanical 機械'}</option>
                                        <option value="Electrical">{t('ncr.discipline.electrical') || 'Electrical 電氣'}</option>
                                        <option value="Piping">{t('ncr.discipline.piping') || 'Piping 管路'}</option>
                                        <option value="Architectural">{t('ncr.discipline.architectural') || 'Architectural 建築'}</option>
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.contractor')}</label>
                                    <select
                                        className={formStyles.formSelect}
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
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.refStandards')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={formData.referenceStandards}
                                        onChange={(e) => handleFieldChange('referenceStandards', e.target.value)}
                                    />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('obs.detailsDescription')}</label>
                                    <textarea
                                        className={formStyles.formTextarea}
                                        value={formData.detailsDescription}
                                        onChange={(e) => handleFieldChange('detailsDescription', e.target.value)}
                                        rows={4}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.foundLocation')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={formData.foundLocation}
                                        onChange={(e) => handleFieldChange('foundLocation', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 照片上傳 */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('obs.defectPhotos')}</h3>
                            <FileAttachment
                                id="ncr-defect-photos"
                                category="defectPhoto"
                                entityType={existingItem ? 'ncr' : undefined}
                                entityId={existingItem?.id}
                                title={t('obs.defectPhotos')}
                                legacyAttachments={formData.defectPhotos}
                                onPendingFilesChange={setPendingDefectPhotos}
                                onDeleteExistingFile={(id) => {
                                    setDeletedFileIds(prev => [...prev, id]);
                                    setFormData(prev => ({ ...prev, defectPhotos: (prev.defectPhotos || []).filter((a: any) => typeof a === 'string' || a?.id !== id) }));
                                }}
                                onRemoveLegacy={(index) => handleRemoveLegacyPhoto(index, 'defect')}
                                onPreview={handlePreview}
                                accept="image/*"
                            />
                        </div>
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('obs.improvementPhotos')}</h3>
                            <FileAttachment
                                id="ncr-improvement-photos"
                                category="improvementPhoto"
                                entityType={existingItem ? 'ncr' : undefined}
                                entityId={existingItem?.id}
                                title={t('obs.improvementPhotos')}
                                legacyAttachments={formData.improvementPhotos}
                                onPendingFilesChange={setPendingImprovementPhotos}
                                onDeleteExistingFile={(id) => {
                                    setDeletedFileIds(prev => [...prev, id]);
                                    setFormData(prev => ({ ...prev, improvementPhotos: (prev.improvementPhotos || []).filter((a: any) => typeof a === 'string' || a?.id !== id) }));
                                }}
                                onRemoveLegacy={(index) => handleRemoveLegacyPhoto(index, 'improvement')}
                                onPreview={handlePreview}
                                accept="image/*"
                            />
                        </div>

                        {/* Attachments */}
                        <div className={formStyles.formSection}>
                            <FileAttachment
                                id="ncr-attachments"
                                category="attachment"
                                entityType={existingItem ? 'ncr' : undefined}
                                entityId={existingItem?.id}
                                title={t('obs.attachments')}
                                legacyAttachments={formData.attachments}
                                onPendingFilesChange={setPendingAttachments}
                                onDeleteExistingFile={(id) => {
                                    setDeletedFileIds(prev => [...prev, id]);
                                    setFormData(prev => ({ ...prev, attachments: (prev.attachments || []).filter((a: any) => typeof a === 'string' || a?.id !== id) }));
                                }}
                                onRemoveLegacy={handleRemoveLegacyAttachment}
                                onPreview={handlePreview}
                            />
                        </div>

                        {/* {t('obs.sectionPersonnelLocation')} */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('obs.sectionPersonnelLocation')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.foundBy')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={formData.foundBy}
                                        onChange={(e) => handleFieldChange('foundBy', e.target.value)}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.raisedBy')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={formData.raisedBy}
                                        onChange={(e) => handleFieldChange('raisedBy', e.target.value)}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.assignedTo') || 'Assigned To'}</label>
                                    <select
                                        className={formStyles.formSelect}
                                        value={formData.assignedTo ?? ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value ? Number(e.target.value) : null }))}
                                    >
                                        <option value="">{t('common.selectPlaceholder') || 'Select...'}</option>
                                        {users.map(u => (
                                            <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.serialNumbers')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={formData.serialNumbers}
                                        onChange={(e) => handleFieldChange('serialNumbers', e.target.value)}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.productDisposition')}</label>
                                    <select
                                        className={formStyles.formSelect}
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
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionDisposition')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>{t('ncr.repairMethod')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button
                                                type="button"
                                                className={formStyles.tbcButton}
                                                onClick={() => handleTBCButton('repairMethodStatement')}
                                            >
                                                {t('common.tbc')}
                                            </button>
                                            <button
                                                type="button"
                                                className={formStyles.naButton}
                                                onClick={() => handleNAButton('repairMethodStatement')}
                                            >
                                                {t('common.na')}
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        className={formStyles.formTextarea}
                                        value={formData.repairMethodStatement}
                                        onChange={(e) => handleFieldChange('repairMethodStatement', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>{t('ncr.correctionAction')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button
                                                type="button"
                                                className={formStyles.tbcButton}
                                                onClick={() => handleTBCButton('immediateCorrectionAction')}
                                            >
                                                {t('common.tbc')}
                                            </button>
                                            <button
                                                type="button"
                                                className={formStyles.naButton}
                                                onClick={() => handleNAButton('immediateCorrectionAction')}
                                            >
                                                {t('common.na')}
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        className={formStyles.formTextarea}
                                        value={formData.immediateCorrectionAction}
                                        onChange={(e) => handleFieldChange('immediateCorrectionAction', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>{t('ncr.rootCause')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button
                                                type="button"
                                                className={formStyles.tbcButton}
                                                onClick={() => handleTBCButton('rootCauseAnalysis')}
                                            >
                                                {t('common.tbc')}
                                            </button>
                                            <button
                                                type="button"
                                                className={formStyles.naButton}
                                                onClick={() => handleNAButton('rootCauseAnalysis')}
                                            >
                                                {t('common.na')}
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        className={formStyles.formTextarea}
                                        value={formData.rootCauseAnalysis}
                                        onChange={(e) => handleFieldChange('rootCauseAnalysis', e.target.value)}
                                        rows={4}
                                    />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>{t('ncr.correctiveActions')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button
                                                type="button"
                                                className={formStyles.tbcButton}
                                                onClick={() => handleTBCButton('correctiveActions')}
                                            >
                                                {t('common.tbc')}
                                            </button>
                                            <button
                                                type="button"
                                                className={formStyles.naButton}
                                                onClick={() => handleNAButton('correctiveActions')}
                                            >
                                                {t('common.na')}
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        className={formStyles.formTextarea}
                                        value={formData.correctiveActions}
                                        onChange={(e) => handleFieldChange('correctiveActions', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>{t('ncr.preventiveAction')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button
                                                type="button"
                                                className={formStyles.tbcButton}
                                                onClick={() => handleTBCButton('preventiveAction')}
                                            >
                                                {t('common.tbc')}
                                            </button>
                                            <button
                                                type="button"
                                                className={formStyles.naButton}
                                                onClick={() => handleNAButton('preventiveAction')}
                                            >
                                                {t('common.na')}
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        className={formStyles.formTextarea}
                                        value={formData.preventiveAction}
                                        onChange={(e) => handleFieldChange('preventiveAction', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label>{t('ncr.integrityStatement')}</label>
                                        <div className={styles.buttonGroup}>
                                            <button
                                                type="button"
                                                className={formStyles.tbcButton}
                                                onClick={() => handleTBCButton('finalProductIntegrityStatement')}
                                            >
                                                {t('common.tbc')}
                                            </button>
                                            <button
                                                type="button"
                                                className={formStyles.naButton}
                                                onClick={() => handleNAButton('finalProductIntegrityStatement')}
                                            >
                                                {t('common.na')}
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        className={formStyles.formTextarea}
                                        value={formData.finalProductIntegrityStatement}
                                        onChange={(e) => handleFieldChange('finalProductIntegrityStatement', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Effectiveness verification (BACKLOG #13 #3) */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionEffectiveness') || 'Effectiveness Verification'}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.effectivenessVerified') || 'Effectiveness Verified'}</label>
                                    <select
                                        className={formStyles.formSelect}
                                        value={formData.effectivenessVerified}
                                        onChange={(e) => handleFieldChange('effectivenessVerified', e.target.value)}
                                    >
                                        <option value="">{t('common.selectPlaceholder') || 'Select...'}</option>
                                        <option value="Pending">{t('ncr.effectiveness.pending') || 'Pending 待驗證'}</option>
                                        <option value="Yes">{t('ncr.effectiveness.yes') || 'Yes 有效'}</option>
                                        <option value="No">{t('ncr.effectiveness.no') || 'No 無效'}</option>
                                    </select>
                                    <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0', lineHeight: 1.4 }}>
                                        {t('ncr.effectiveness.hint') || 'Confirm the corrective action prevented recurrence. An NCR cannot be Closed until this is "Yes"; "No" routes it back to In Progress.'}
                                    </p>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('ncr.effectivenessVerifiedDate') || 'Verified Date'}</label>
                                    <input
                                        type="date"
                                        lang="en"
                                        className={formStyles.formInput}
                                        value={formData.effectivenessVerifiedDate}
                                        onChange={(e) => handleFieldChange('effectivenessVerifiedDate', e.target.value)}
                                    />
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label className={formStyles.optionalLabel}>{t('ncr.effectivenessNotes') || 'Verification Notes'}</label>
                                    <textarea
                                        className={formStyles.formTextarea}
                                        value={formData.effectivenessNotes}
                                        onChange={(e) => handleFieldChange('effectivenessNotes', e.target.value)}
                                        rows={2}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* {t('ncr.sectionReinspection')} */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionReinspection')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.itrNo')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={formData.itrNumber}
                                        onChange={(e) => handleFieldChange('itrNumber', e.target.value)}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.noiNo')}</label>
                                    <select
                                        className={formStyles.formInput}
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
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.reinspectionNo')}</label>
                                    <input
                                        type="text"
                                        className={formStyles.formInput}
                                        value={formData.reInspectionNumber}
                                        onChange={(e) => handleFieldChange('reInspectionNumber', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* {t('ncr.sectionQuality')} */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionQuality')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('common.status')}</label>
                                    <select
                                        className={formStyles.formSelect}
                                        value={formData.status}
                                        onChange={(e) => handleFieldChange('status', e.target.value)}
                                    >
                                        <option value="Open">{t('status.open')}</option>
                                        <option value="In Progress">{t('status.inProgress')}</option>
                                        <option value="Resolved">{t('status.resolved')}</option>
                                        <option value="Closed">{t('status.closed')}</option>
                                        <option value="Void">{t('status.void')}</option>
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label className={formStyles.optionalLabel}>{t('obs.closeoutDate')}</label>
                                    <input
                                        type="date"
                                        lang="en"
                                        className={formStyles.formInput}
                                        value={formData.closeoutDate}
                                        onChange={(e) => handleFieldChange('closeoutDate', e.target.value)}
                                    />
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.integrityRelated')}</label>
                                    <select
                                        className={formStyles.formSelect}
                                        value={formData.productIntegrityRelated}
                                        onChange={(e) => handleFieldChange('productIntegrityRelated', e.target.value)}
                                    >
                                        <option value="">{t('common.selectPlaceholder')}</option>
                                        <option value="Yes">{t('common.yes')}</option>
                                        <option value="No">{t('common.no')}</option>
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.permanentDeviation')}</label>
                                    <select
                                        className={formStyles.formSelect}
                                        value={formData.permanentProductDeviation}
                                        onChange={(e) => handleFieldChange('permanentProductDeviation', e.target.value)}
                                    >
                                        <option value="">{t('common.selectPlaceholder')}</option>
                                        <option value="Yes">{t('common.yes')}</option>
                                        <option value="No">{t('common.no')}</option>
                                    </select>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.impactOM')}</label>
                                    <select
                                        className={formStyles.formSelect}
                                        value={formData.impactToOM}
                                        onChange={(e) => handleFieldChange('impactToOM', e.target.value)}
                                    >
                                        <option value="">{t('common.selectPlaceholder')}</option>
                                        <option value="Yes">{t('common.yes')}</option>
                                        <option value="No">{t('common.no')}</option>
                                    </select>
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <div className={formStyles.labelWithButton}>
                                        <label className={formStyles.optionalLabel}>{t('common.remark')}</label>
                                        <button
                                            type="button"
                                            className={formStyles.tbcButton}
                                            onClick={() => handleDateButton('remark')}
                                        >
                                            {t('common.addDate')}
                                        </button>
                                    </div>
                                    <textarea
                                        className={formStyles.formTextarea}
                                        value={formData.remark}
                                        onChange={(e) => handleFieldChange('remark', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                            </div>
                        </div>
                        {existingItem?.id && (
                            <RelatedDocuments entityType="ncr" entityId={existingItem.id} />
                        )}
                    </div>
                    <div className={formStyles.modalActions}>
                        <button
                            className={formStyles.saveButton}
                            onClick={handlePublish}
                            style={{ backgroundColor: '#4f46e5' }}
                            title="Publish as next revision"
                            disabled={saving}
                        >
                            Publish
                        </button>
                        <button className={formStyles.saveButton} onClick={handleSave} style={{ marginLeft: '12px' }} disabled={saving}>
                            {saving ? t('obs.saving') : t('common.save')}
                        </button>
                        <button className={formStyles.cancelButton} onClick={onClose} disabled={saving}>
                            {t('common.cancel')}
                        </button>
                    </div>
                </div >
            </div >
            {previewUrl && (
                <ImagePreviewOverlay key={previewUrl} url={previewUrl} name={previewName} onClose={() => setPreviewUrl(null)} />
            )}
        </div >
    );
};

export interface NCRDetailsViewModalProps {
    ncrId: string;
    ncrItem?: NCRItem;
    ncrDetailData?: NCRDetailData;
    onClose: () => void;
}

export const NCRDetailsViewModal: React.FC<NCRDetailsViewModalProps> = ({ ncrId: _ncrId, ncrItem, ncrDetailData, onClose }) => {
    const { t } = useLanguage();
    // Combine data from both sources, with detailData taking precedence
    const displayData: NCRDetailData = {
        ncrNumber: ncrDetailData?.ncrNumber || ncrItem?.documentNumber || '',
        itrNumber: ncrDetailData?.itrNumber || '',
        rev: ncrDetailData?.rev || (ncrItem as any)?.rev || '',
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
        severity: ncrDetailData?.severity || ncrItem?.severity || '',
        discipline: ncrDetailData?.discipline || ncrItem?.discipline || '',
        assignedTo: ncrDetailData?.assignedTo ?? ncrItem?.assignedTo ?? null,
        closedBy: ncrDetailData?.closedBy ?? ncrItem?.closedBy ?? null,
        verifiedBy: ncrDetailData?.verifiedBy ?? ncrItem?.verifiedBy ?? null,
        effectivenessVerified: ncrDetailData?.effectivenessVerified || ncrItem?.effectivenessVerified || '',
        effectivenessVerifiedBy: ncrDetailData?.effectivenessVerifiedBy ?? ncrItem?.effectivenessVerifiedBy ?? null,
        effectivenessVerifiedDate: ncrDetailData?.effectivenessVerifiedDate || ncrItem?.effectivenessVerifiedDate || '',
        effectivenessNotes: ncrDetailData?.effectivenessNotes || ncrItem?.effectivenessNotes || '',
    };

    const handlePrint = () => {
        window.print();
    };

    // 附件預覽
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState<string>('');
    const handlePreview = (url: string, name?: string) => {
        setPreviewUrl(url);
        setPreviewName(name || '');
    };

    return (
        <div className={formStyles.modalOverlay}>
            <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={formStyles.modalHeader}>
                    <h2>{t('ncr.viewTitle')}</h2>
                    <button className={formStyles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={formStyles.modalBody}>
                    <div className={formStyles.formSections}>
                        {/* 不符合項目資訊 */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('obs.sectionInfo')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.itrNo')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.itrNumber || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('itr.ncrNo')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.ncrNumber || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.subject')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.subject || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.raiseDate')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.raiseDate || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.type')}</label>
                                    <div className={formStyles.readOnlyField}>
                                        {displayData.type ? t(`ncr.type.${displayData.type.toLowerCase()}`) : '-'}
                                    </div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.severity') || 'Severity'}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.severity || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.discipline') || 'Discipline'}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.discipline || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('common.contractor')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.contractor || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.refStandards')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.referenceStandards || '-'}</div>
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('obs.detailsDescription')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.detailsDescription || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.foundLocation')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.foundLocation || '-'}</div>
                                </div>
                            </div>
                        </div>

                        {/* 照片 */}
                        <div className={formStyles.formSection}>
                            <FileAttachment
                                id="ncr-defect-photos-view"
                                category="defectPhoto"
                                entityType="ncr"
                                entityId={ncrItem?.id}
                                title={t('obs.defectPhotos')}
                                legacyAttachments={displayData.defectPhotos || []}
                                readOnly={true}
                                onPreview={handlePreview}
                                accept="image/*"
                            />
                        </div>
                        <div className={formStyles.formSection}>
                            <FileAttachment
                                id="ncr-improvement-photos-view"
                                category="improvementPhoto"
                                entityType="ncr"
                                entityId={ncrItem?.id}
                                title={t('obs.improvementPhotos')}
                                legacyAttachments={displayData.improvementPhotos || []}
                                readOnly={true}
                                onPreview={handlePreview}
                                accept="image/*"
                            />
                        </div>

                        {/* {t('obs.sectionPersonnelLocation')} */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('obs.sectionPersonnelLocation')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.foundBy')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.foundBy || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.raisedBy')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.raisedBy || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.serialNumbers')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.serialNumbers || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.productDisposition')}</label>
                                    <div className={formStyles.readOnlyField}>
                                        {displayData.productDisposition ? t(`ncr.disposition.${displayData.productDisposition.replace(/\s+/g, '').replace(/^./, str => str.toLowerCase())}`) : '-'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* {t('ncr.sectionDisposition')} */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionDisposition')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('ncr.repairMethod')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.repairMethodStatement || '-'}</div>
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('ncr.correctionAction')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.immediateCorrectionAction || '-'}</div>
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('ncr.rootCause')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.rootCauseAnalysis || '-'}</div>
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('ncr.correctiveActions')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.correctiveActions || '-'}</div>
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('ncr.preventiveAction')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.preventiveAction || '-'}</div>
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('ncr.integrityStatement')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.finalProductIntegrityStatement || '-'}</div>
                                </div>
                            </div>
                        </div>

                        {/* {t('ncr.sectionReinspection')} */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionReinspection')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.itrNo')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.itrNumber || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('itr.ncrNo')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.ncrNumber || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.reinspectionNo')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.reInspectionNumber || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.noiNo')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.noiNumber || '-'}</div>
                                </div>
                            </div>
                        </div>

                        {/* {t('ncr.sectionQuality')} */}
                        <div className={formStyles.formSection}>
                            <h3 className={formStyles.sectionTitle}>{t('ncr.sectionQuality')}</h3>
                            <div className={formStyles.formGrid}>
                                <div className={formStyles.formGroup}>
                                    <label>{t('common.status')}</label>
                                    <div className={formStyles.readOnlyField}>
                                        {({
                                            'open': t('status.open'),
                                            'in progress': t('status.inProgress'),
                                            'resolved': t('status.resolved'),
                                            'closed': t('status.closed'),
                                            'void': t('status.void'),
                                        } as Record<string, string>)[displayData.status.toLowerCase()] || displayData.status || '-'}
                                    </div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('obs.closeoutDate')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.closeoutDate || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.effectivenessVerified') || 'Effectiveness Verified'}</label>
                                    <div className={formStyles.readOnlyField}>
                                        {displayData.effectivenessVerified || '-'}
                                        {displayData.effectivenessVerifiedDate ? ` (${displayData.effectivenessVerifiedDate})` : ''}
                                    </div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.integrityRelated')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.productIntegrityRelated || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.permanentDeviation')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.permanentProductDeviation || '-'}</div>
                                </div>
                                <div className={formStyles.formGroup}>
                                    <label>{t('ncr.impactOM')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.impactToOM || '-'}</div>
                                </div>
                                <div className={formStyles.formGroupFull}>
                                    <label>{t('common.remark')}</label>
                                    <div className={formStyles.readOnlyField}>{displayData.remark || '-'}</div>
                                </div>
                            </div>
                        </div>

                        <div className={formStyles.formSection}>
                            <FileAttachment
                                id="ncr-attachments-view"
                                category="attachment"
                                entityType="ncr"
                                entityId={ncrItem?.id}
                                title={t('obs.attachments')}
                                legacyAttachments={displayData.attachments || []}
                                readOnly={true}
                                onPreview={handlePreview}
                            />
                        </div>
                    </div>
                </div>
                <div className={formStyles.modalActions}>
                    <button className={formStyles.printButton} onClick={handlePrint}>
                        {t('common.print')}
                    </button>
                    <button className={formStyles.cancelButton} onClick={onClose}>
                        {t('common.close')}
                    </button>
                </div>
            </div>
            {previewUrl && (
                <ImagePreviewOverlay key={previewUrl} url={previewUrl} name={previewName} onClose={() => setPreviewUrl(null)} />
            )}
        </div>
    );
};
