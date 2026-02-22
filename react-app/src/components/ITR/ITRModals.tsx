import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChecklistSnapshotModal } from './ChecklistSnapshotModal';
import { ChecklistRecord, useChecklistStore } from '../../store/checklistStore';
import { Printer, ShieldCheck, Save, LayoutTemplate, Plus, ClipboardCheck, ArrowRight, AlertCircle, Info } from 'lucide-react';
import { getNextRevision } from '../../utils/revision';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useNOIStore } from '../../store/noiStore';
import { useNCRStore } from '../../store/ncrStore';
import { useOBSStore } from '../../store/obsStore';
import { useITRStore } from '../../store/itrStore';
import type { ITRItem } from '../../store/itrStore';
import { useITPStore } from '../../store/itpStore';
import { validateStatusTransition, ITRStatusTransitions } from '../../utils/statusValidation';
import { addSevenWorkingDays } from '../../utils/dateUtils';
import { formatDateISO } from '../../utils/formatters';
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
    itpNo: string;
    drawings: string[];
    certificates: string[];
    linkedChecklists: any[]; // Snapshot
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
    console.log("ITRDetailModal mounted", { itrId, existingItem, linkedChecklists: existingItem?.linkedChecklists });
    const { t } = useLanguage();
    const { getActiveContractors, contractors } = useContractorsStore();
    const navigate = useNavigate();

    if (!itrId) {
        return null;
    }
    const noiList = useNOIStore(state => state.noiList);
    const getNOIList = () => noiList;
    const ncrList = useNCRStore(state => state.ncrList);
    const obsList = useOBSStore(state => state.obsList);
    const getNCRList = () => ncrList;
    const contextItrList = useITRStore(state => state.itrList);
    const itpList = useITPStore(state => state.itpList);
    const getITPList = () => itpList;

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
                dueDate: (existingItem as any).dueDate || (existingItem.raiseDate ? addSevenWorkingDays(formatDateISO(existingItem.raiseDate)) : ''),
                itpNo: existingItem.itpNo || '',
                drawings: existingItem.drawings || [],
                certificates: existingItem.certificates || [],
                linkedChecklists: existingItem.linkedChecklists || [],
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
            itpNo: '',
            drawings: [],
            certificates: [],
            linkedChecklists: [],

        };
    };

    const [formData, setFormData] = useState<ITRDetailData>(getInitialData());
    const [showPrintPreview, setShowPrintPreview] = useState(false);

    const allChecklists = useChecklistStore(state => state.records);
    const [editingSnapshotIndex, setEditingSnapshotIndex] = useState<number | null>(null);

    const linkedChecklists = useMemo(() => {
        return formData.linkedChecklists || [];
    }, [formData.linkedChecklists]);

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

                // Checklist sync validation
                if (value === 'Approved' && linkedChecklists.some(c => c.status === 'Fail')) {
                    if (!window.confirm("WARNING: There are failed checklists associated with this ITR. Are you sure you want to approve it?")) {
                        return prev;
                    }
                }
            }

            // Auto-calculate Due Date when Inspection Date (raiseDate) changes
            if (field === 'raiseDate') {
                updated.dueDate = addSevenWorkingDays(value);
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

    const handleGenericUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'drawings' | 'certificates') => {
        const files = e.target.files;
        if (files) {
            const fileArray = Array.from(files);
            fileArray.forEach((file) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const result = reader.result as string;
                    setFormData(prev => ({
                        ...prev,
                        [field]: [...(prev[field] || []), result]
                    }));
                };
                reader.readAsDataURL(file);
            });
        }
        e.target.value = '';
    };

    const handleGenericRemove = (index: number, field: 'drawings' | 'certificates') => {
        setFormData(prev => ({
            ...prev,
            [field]: (prev[field] || []).filter((_, i) => i !== index)
        }));
    };

    const handleSave = async () => {
        console.log("handleSave formData.linkedChecklists", formData.linkedChecklists);
        if (!formData.noiNumber) {
            alert(t('itr.validation.noiRequired') || 'Please select an NOI Number.');
            return;
        }

        // P4: Cascade Validation - Blocks closing ITR if linked NCR or OBS is still Open
        if (formData.status === 'Closed' && formData.itrNumber) {
            const openNcrs = ncrList.filter(ncr => ncr.itrNumber === formData.itrNumber && ncr.status === 'Open');
            const openObs = obsList.filter(obs => obs.itrNumber === formData.itrNumber && obs.status === 'Open');

            if (openNcrs.length > 0 || openObs.length > 0) {
                const totalOpen = openNcrs.length + openObs.length;
                alert(`Cannot close ITR: There are still ${totalOpen} open NCR/OBS associated with this inspection. Please close them first.`);
                return;
            }
        }

        try {
            await onSave(formData);
            onClose();
        } catch (_) {
            // 錯誤已在父層 handleSaveITRDetails 以 alert 顯示，保持 modal 開啟
        }
    };

    const handlePublish = async () => {
        const nextRev = getNextRevision(formData.type || 'Rev0.0'); // Default to Rev0.0 if empty so it becomes Rev1.0
        if (window.confirm(`Are you sure you want to publish as ${nextRev}?`)) {
            try {
                await onSave({
                    ...formData,
                    type: nextRev,
                    status: 'Approved' // ITR usually approves on publish? Or keep existing? Plan says optional.
                    // Let's keep status update optional or implicit. 
                });
                onClose();
            } catch (_) {
                // Error handled in parent
            }
        }
    };

    const handlePrint = () => {
        setShowPrintPreview(true);
    };

    if (showPrintPreview) {
        return (
            <ITRPrintPreview
                data={formData}
                onClose={() => setShowPrintPreview(false)}
                onPrint={() => window.print()}
            />
        );
    }

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
                                                    if (selectedNOI.itpNo) {
                                                        handleFieldChange('itpNo', selectedNOI.itpNo);
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
                                    <label>{t('itr.relatedITP') || 'Related ITP'}</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.itpNo}
                                        onChange={(e) => handleFieldChange('itpNo', e.target.value)}
                                        disabled={!!formData.noiNumber}
                                        style={formData.noiNumber ? { backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: '#000000' } : {}}
                                    >
                                        <option value="">{t('itr.selectITP') || 'Select ITP'}</option>
                                        {getITPList().map((itp) => (
                                            <option key={itp.id} value={itp.referenceNo || ''}>
                                                {itp.referenceNo || itp.description || `(${t('common.notGenerated')})`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
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
                                        value={formatDateISO(formData.raiseDate)}
                                        onChange={(e) => handleFieldChange('raiseDate', e.target.value)}
                                        readOnly={!!formData.noiNumber}
                                        style={formData.noiNumber ? { backgroundColor: '#D9D9D9', cursor: 'not-allowed' } : {}}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('common.dueDate')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.dueDate || ''}
                                        readOnly
                                        style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed' }}
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

                        {/* Linked Checklists Section */}
                        <div className={styles.formSection}>
                            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                                <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
                                    <ClipboardCheck size={18} className="inline-block mr-2" />
                                    {t('itr.sectionLinkedChecklists') || 'Linked Checklists'}
                                </h3>
                                <div className="flex flex-col items-end">
                                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200 mb-2">
                                        ⚠ {t('itr.checklistSnapshotWarning') || 'Editing this list does not affect standard templates.'}
                                    </span>
                                    <select
                                        className="h-8 pl-2 pr-8 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-400 transition-colors cursor-pointer"
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            if (!value) return;

                                            if (value === 'new') {
                                                // Create new is ambiguous in snapshot mode. 
                                                // It implies creating a standard record first? 
                                                // Or just a blank snapshot?
                                                // For now, let's keep it but maybe it should redirect to create a standard checklist, 
                                                // then user comes back and selects it.
                                                // Or just disable 'new' for snapshot mode if it relies on standardizing first.
                                                // User said "Checklist module ... standard data".
                                                // So 'new' probably means creating a new Standard Template.
                                                navigate(`/checklist?from=itr`);
                                            } else {
                                                const selectedOriginal = allChecklists.find(c => c.id === value);
                                                if (selectedOriginal) {
                                                    // Deep copy
                                                    const snapshot = JSON.parse(JSON.stringify(selectedOriginal));
                                                    // Remove ID or keep it as reference? 
                                                    // Ideally generate a new ID for the snapshot to avoid key collisions if we render list,
                                                    // but we might want to know origin.
                                                    // Let's keep a reference to originId if needed, but for react keys we might need unique.
                                                    // If we allow multiple of same template, we need unique keys.
                                                    snapshot._snapshotId = Date.now().toString() + Math.random().toString().slice(2);
                                                    // Clear itrId/itrNumber from snapshot just in case
                                                    snapshot.itrId = itrId;
                                                    snapshot.itrNumber = formData.itrNumber;

                                                    setFormData(prev => ({
                                                        ...prev,
                                                        linkedChecklists: [...(prev.linkedChecklists || []), snapshot]
                                                    }));
                                                }
                                            }
                                            // Reset selection
                                            e.target.value = "";
                                        }}
                                        value=""
                                    >
                                        <option value="" disabled hidden>+ {t('checklist.addOrLink') || 'Checklist'}</option>
                                        <option value="new" className="font-bold text-blue-600 bg-blue-50">
                                            + {t('checklist.createNew') || 'Create New Template...'}
                                        </option>
                                        <optgroup label={t('checklist.available') || 'Available Templates'}>
                                            {allChecklists.map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.recordsNo} - {c.activity} {c.status ? `(${c.status})` : ''}
                                                </option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>
                            </div>

                            {/* Unlink Handler & Snapshot Editor */}
                            {(() => {
                                const handleUnlinkChecklist = (index: number, e: React.MouseEvent) => {
                                    e.stopPropagation(); // Prevent navigation
                                    if (window.confirm(t('itr.confirmUnlinkChecklist') || 'Remove this checklist snapshot?')) {
                                        setFormData(prev => ({
                                            ...prev,
                                            linkedChecklists: prev.linkedChecklists.filter((_, i) => i !== index)
                                        }));
                                    }
                                };

                                const handleSaveSnapshot = (updatedSnapshot: any) => {
                                    if (editingSnapshotIndex === null) return;
                                    setFormData(prev => {
                                        const newList = [...(prev.linkedChecklists || [])];
                                        newList[editingSnapshotIndex] = updatedSnapshot;
                                        return { ...prev, linkedChecklists: newList };
                                    });
                                    setEditingSnapshotIndex(null);
                                };

                                return (
                                    <>
                                        {linkedChecklists.length > 0 ? (
                                            <div className="space-y-3">
                                                {linkedChecklists.map((record, index) => (
                                                    <div
                                                        key={record._snapshotId || record.id || index}
                                                        className="group flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingSnapshotIndex(index);
                                                        }}
                                                    >
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider">{record.recordsNo}</span>
                                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${record.status === 'Pass' ? 'bg-green-100 text-green-700' :
                                                                    record.status === 'Fail' ? 'bg-red-100 text-red-700' :
                                                                        'bg-blue-100 text-blue-700'
                                                                    }`}>
                                                                    {record.status}
                                                                </span>
                                                                <span className="text-[10px] bg-sky-100 text-sky-800 px-1 rounded border border-sky-200">Snapshot</span>
                                                            </div>
                                                            <span className="text-sm font-bold text-slate-800">{record.activity}</span>
                                                            {record.location && (
                                                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                                                    <ArrowRight size={10} /> {record.location}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-3">
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[10px] text-slate-400 font-bold uppercase">{t('itr.inspectionDate')}</span>
                                                                <span className="text-xs font-medium text-slate-600">{record.date}</span>
                                                            </div>

                                                            {/* Unlink Button */}
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleUnlinkChecklist(index, e)}
                                                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors z-10"
                                                                title={t('common.delete') || 'Remove'}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <path d="M3 6h18"></path>
                                                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                                                    <line x1="10" y1="11" x2="10" y2="17"></line>
                                                                    <line x1="14" y1="11" x2="14" y2="17"></line>
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                                <p className="text-sm text-slate-400 font-medium">
                                                    {t('itr.noLinkedChecklists') || 'No checklists linked to this ITR yet.'}
                                                </p>
                                            </div>
                                        )}

                                        {editingSnapshotIndex !== null && (
                                            <ChecklistSnapshotModal
                                                isOpen={true}
                                                initialData={linkedChecklists[editingSnapshotIndex]}
                                                onClose={() => setEditingSnapshotIndex(null)}
                                                onSave={handleSaveSnapshot}
                                            />
                                        )}
                                    </>
                                );
                            })()}
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
                            <h3 className={styles.sectionTitle}>{t('itr.sectionDrawings') || 'Latest Drawings'}</h3>
                            <div className={styles.photoUploadContainer}>
                                <input
                                    type="file"
                                    accept="*"
                                    multiple
                                    onChange={(e) => handleGenericUpload(e, 'drawings')}
                                    className={styles.photoInput}
                                    id="drawings-upload"
                                />
                                <label htmlFor="drawings-upload" className={styles.photoUploadButton}>
                                    <span>{t('obs.uploadFiles')}</span>
                                </label>
                                {formData.drawings && formData.drawings.length > 0 && (
                                    <div className={styles.photoPreviewGrid}>
                                        {formData.drawings.map((_, index) => (
                                            <div key={index} className={styles.photoPreviewItem}>
                                                <span style={{ fontSize: 12, wordBreak: 'break-all' }}>Drawing {index + 1}</span>
                                                <a href={formData.drawings[index]} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, marginLeft: 4 }}>View</a>
                                                <button
                                                    type="button"
                                                    className={styles.photoRemoveButton}
                                                    onClick={() => handleGenericRemove(index, 'drawings')}
                                                    aria-label="Remove drawing"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('itr.sectionCertificates') || 'Calibration Certificates'}</h3>
                            <div className={styles.photoUploadContainer}>
                                <input
                                    type="file"
                                    accept="*"
                                    multiple
                                    onChange={(e) => handleGenericUpload(e, 'certificates')}
                                    className={styles.photoInput}
                                    id="certificates-upload"
                                />
                                <label htmlFor="certificates-upload" className={styles.photoUploadButton}>
                                    <span>{t('obs.uploadFiles')}</span>
                                </label>
                                {formData.certificates && formData.certificates.length > 0 && (
                                    <div className={styles.photoPreviewGrid}>
                                        {formData.certificates.map((_, index) => (
                                            <div key={index} className={styles.photoPreviewItem}>
                                                <span style={{ fontSize: 12, wordBreak: 'break-all' }}>Cert {index + 1}</span>
                                                <a href={formData.certificates[index]} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, marginLeft: 4 }}>View</a>
                                                <button
                                                    type="button"
                                                    className={styles.photoRemoveButton}
                                                    onClick={() => handleGenericRemove(index, 'certificates')}
                                                    aria-label="Remove certificate"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

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



                        {/* 複檢資料 */}


                        {/* 品質評估 */}
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('itr.sectionQuality')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('common.status')}</label>
                                    <div className="flex flex-col gap-2">
                                        <select
                                            className={styles.formSelect}
                                            value={formData.status}
                                            onChange={(e) => handleFieldChange('status', e.target.value)}
                                        >
                                            <option value="Approved">{t('itr.status.approved')}</option>
                                            <option value="Reject">{t('itr.status.reject')}</option>
                                            <option value="In Progress">{t('itr.status.inProgress')}</option>
                                        </select>

                                        {linkedChecklists.length > 0 && (
                                            <div className={`mt-1 flex items-center gap-2 p-2 rounded-md text-xs font-bold border transition-all ${linkedChecklists.some(c => c.status === 'Fail')
                                                ? 'bg-red-50 text-red-600 border-red-100 animate-pulse'
                                                : linkedChecklists.every(c => c.status === 'Pass')
                                                    ? 'bg-green-50 text-green-600 border-green-100'
                                                    : 'bg-blue-50 text-blue-600 border-blue-100'
                                                }`}>
                                                {linkedChecklists.some(c => c.status === 'Fail') ? (
                                                    <>
                                                        <AlertCircle size={14} />
                                                        <span>WARNING: {linkedChecklists.filter(c => c.status === 'Fail').length} FAILED CHECKLISTS</span>
                                                    </>
                                                ) : linkedChecklists.every(c => c.status === 'Pass') ? (
                                                    <>
                                                        <ShieldCheck size={14} />
                                                        <span>ALL CHECKLISTS PASSED</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Info size={14} />
                                                        <span>SOME CHECKLISTS ONGOING</span>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
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

                            </div>
                        </div>
                    </div>
                </div>
                <div className={styles.modalActions}>
                    <button className={styles.printButton} onClick={handlePrint} style={{ marginRight: 'auto' }}>
                        {t('common.print')}
                    </button>
                    <button
                        className={styles.publishButton}
                        onClick={handlePublish}
                        title="Publish as next revision"
                    >
                        Publish
                    </button>
                    <button className={styles.saveButton} onClick={handleSave} style={{ marginLeft: '12px' }}>
                        {t('common.save')}
                    </button>
                    <button className={styles.cancelButton} onClick={onClose}>
                        {t('common.cancel')}
                    </button>
                </div>
            </div>
        </div >
    );
};

export interface ITRPrintPreviewProps {
    data: ITRDetailData;
    onClose: () => void;
    onPrint: () => void;
}

export const ITRPrintPreview: React.FC<ITRPrintPreviewProps> = ({ data: displayData, onClose, onPrint }) => {
    const { t } = useLanguage();

    // Auto-trigger print when component mounts? Or manual? 
    // Usually preview shows first.

    return (
        <div className={styles.modalOverlay} style={{ zIndex: 1100 }}> {/* Higher z-index to overlay Edit modal */}
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{t('itr.detailsTitle') || 'ITR Details (Print Preview)'}</h2>
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
                                    <label>{t('common.dueDate')}</label>
                                    <div className={styles.readOnlyField}>{displayData.dueDate || '-'}</div>
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
                                <div className={styles.formGroup}>
                                    <label>{t('itr.relatedITP') || 'Related ITP'}</label>
                                    <div className={styles.readOnlyField}>{displayData.itpNo || '-'}</div>
                                </div>
                            </div>
                        </div>

                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('itr.sectionDetails') || 'Details Description'}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('itr.referenceStandards') || 'Reference Standards'}</label>
                                    <div className={styles.readOnlyField}>{displayData.referenceStandards || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('itr.foundLocation') || 'Found Location'}</label>
                                    <div className={styles.readOnlyField}>{displayData.foundLocation || '-'}</div>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label>{t('itr.detailsDescription') || 'Details Description'}</label>
                                    <div className={styles.readOnlyField}>{displayData.detailsDescription || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('itr.raisedBy') || 'Raised By'}</label>
                                    <div className={styles.readOnlyField}>{displayData.raisedBy || '-'}</div>
                                </div>
                            </div>
                        </div>

                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('itr.sectionCauseCorrection') || 'Cause & Correction'}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroupFull}>
                                    <label>{t('itr.repairMethodStatement') || 'Repair Method Statement'}</label>
                                    <div className={styles.readOnlyField}>{displayData.repairMethodStatement || '-'}</div>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label>{t('itr.immediateCorrectionAction') || 'Immediate Correction Action'}</label>
                                    <div className={styles.readOnlyField}>{displayData.immediateCorrectionAction || '-'}</div>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label>{t('itr.rootCauseAnalysis') || 'Root Cause Analysis'}</label>
                                    <div className={styles.readOnlyField}>{displayData.rootCauseAnalysis || '-'}</div>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label>{t('itr.correctiveActions') || 'Corrective Actions'}</label>
                                    <div className={styles.readOnlyField}>{displayData.correctiveActions || '-'}</div>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label>{t('itr.preventiveAction') || 'Preventive Action'}</label>
                                    <div className={styles.readOnlyField}>{displayData.preventiveAction || '-'}</div>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <label>{t('itr.finalProductIntegrityStatement') || 'Final Product Integrity Statement'}</label>
                                    <div className={styles.readOnlyField}>{displayData.finalProductIntegrityStatement || '-'}</div>
                                </div>
                            </div>
                        </div>


                        {/* Latest Drawings */}
                        {displayData.drawings && displayData.drawings.length > 0 && (
                            <div className={styles.formSection}>
                                <h3 className={styles.sectionTitle}>{t('itr.sectionDrawings') || 'Latest Drawings'}</h3>
                                <div className={styles.photoPreviewGrid}>
                                    {displayData.drawings.map((drawing, index) => (
                                        <div key={index} className={styles.photoPreviewItem}>
                                            <a href={drawing} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                                                Drawing {index + 1}
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Calibration Certificates */}
                        {displayData.certificates && displayData.certificates.length > 0 && (
                            <div className={styles.formSection}>
                                <h3 className={styles.sectionTitle}>{t('itr.sectionCertificates') || 'Calibration Certificates'}</h3>
                                <div className={styles.photoPreviewGrid}>
                                    {displayData.certificates.map((cert, index) => (
                                        <div key={index} className={styles.photoPreviewItem}>
                                            <a href={cert} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                                                Certificate {index + 1}
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

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
                        {((displayData?.attachments && displayData.attachments.length > 0)) && (
                            <div className={styles.formSection}>
                                <h3 className={styles.sectionTitle}>{t('common.attachments')}</h3>
                                <div className={styles.photoPreviewGrid}>
                                    {(displayData.attachments || []).map((attachment, index) => (
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
                    <button className={styles.printButton} onClick={onPrint}>
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
