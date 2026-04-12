import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '../ui/BackButton';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { ITPItem } from '../../store/itpStore';
import { ITPAdvancedEditor, ITPAdvancedEditorRef } from './ITPAdvancedEditor';
import ReactDOM from 'react-dom';
import { ITPPrintTemplate } from './ITPPrintTemplate';
import { InspectionItem } from '../../types/itp';
import FileAttachment from '../Shared/FileAttachment';
import RelatedDocuments from '../ui/RelatedDocuments';
import styles from './ITP.module.css';
import { getNextRevision } from '../../utils/revision';
import { parseInspectionItems } from '../../utils/itpParser';
import ConfirmModal from '../Shared/ConfirmModal';


import { Printer, ShieldCheck, Save, LayoutTemplate, Plus, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';

export interface ITPDetailModalProps {
    itpId: string;
    existingItem?: ITPItem;
    onSave: (updates: Partial<ITPItem>, details?: any, pendingFiles?: File[], deletedFileIds?: string[]) => Promise<void>;
    onApplyItems?: (detailPayload: any) => Promise<void>;
    onClose: () => void;
}

export const ITPDetailModal: React.FC<ITPDetailModalProps> = ({ itpId, existingItem, onSave, onApplyItems, onClose }) => {
    const editorRef = useRef<ITPAdvancedEditorRef>(null);
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { getActiveContractors } = useContractorsStore();
    const REV_OPTIONS = ['Rev1.0', 'Rev2.0', 'Rev3.0', 'Rev4.0'];

    const [activeTab, setActiveTab] = useState<'general' | 'plan'>('general');



    const [saving, setSaving] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [closeConfirm, setCloseConfirm] = useState(false);

    // Print Handling
    useEffect(() => {
        if (isPrinting) {
            const timer = setTimeout(() => {
                window.print();
            }, 100);
            const onAfterPrint = () => setIsPrinting(false);
            window.addEventListener('afterprint', onAfterPrint);
            return () => {
                clearTimeout(timer);
                window.removeEventListener('afterprint', onAfterPrint);
            };
        }
    }, [isPrinting]);

    const handlePrint = () => {
        setIsPrinting(true);
    };

    const [formData, setFormData] = useState<Partial<ITPItem>>({
        vendor: existingItem?.vendor || '',
        referenceNo: existingItem?.referenceNo || '',
        description: existingItem?.description || '',
        rev: existingItem?.rev || 'Rev1.0',
        submit: existingItem?.submit || '',
        status: existingItem?.status || 'Pending',
        remark: existingItem?.remark || '',
        submissionDate: existingItem?.submissionDate || new Date().toISOString().split('T')[0],
        attachments: existingItem?.attachments || [],
        dueDate: (existingItem as any)?.dueDate || '',
        detail_data: existingItem?.detail_data || [],
        hasDetails: true
    });

    const [advancedItems, setAdvancedItems] = useState<InspectionItem[]>([]);

    // Header Data for Print/Preview
    const headerData = useMemo(() => ({
        referenceNo: formData.referenceNo || '',
        description: formData.description || '',
        rev: formData.rev || '',
        vendor: formData.vendor || '',
        submissionDate: formData.submissionDate || ''
    }), [formData.referenceNo, formData.description, formData.rev, formData.vendor, formData.submissionDate]);

    useEffect(() => {
        if (existingItem?.detail_data) {
            setAdvancedItems(parseInspectionItems(existingItem.detail_data));
        }
    }, [existingItem]);


    const [errors, setErrors] = useState<{ [key: string]: string }>({});
    const [revMode, setRevMode] = useState<'select' | 'custom'>(() => {
        const currentRev = existingItem?.rev;
        if (currentRev && !REV_OPTIONS.includes(currentRev)) {
            return 'custom';
        }
        return 'select';
    });

    const handleFieldChange = (field: keyof ITPItem, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setIsDirty(true);
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
        }
    };

    const handleDateButton = (field: keyof ITPItem) => {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}_`;
        setFormData(prev => ({
            ...prev,
            [field]: prev[field] ? `${prev[field]}\n${dateStr}` : dateStr
        }));
    };

    const validate = () => {
        const newErrors: { [key: string]: string } = {};
        if (!formData.vendor) newErrors.vendor = 'Contractor is required';

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const prepareDetailPayload = (src: InspectionItem[] = advancedItems) => {
        return {
            a: src.filter(i => i.phase === 'A').map(({ phase: _phase, ...rest }) => rest),
            b: src.filter(i => i.phase === 'B').map(({ phase: _phase, ...rest }) => rest),
            c: src.filter(i => i.phase === 'C').map(({ phase: _phase, ...rest }) => rest),
            checklist: [],
            self_inspection: null
        };
    };

    const handleItemsChange = async (newItems: InspectionItem[]) => {
        setAdvancedItems(newItems);
        setIsDirty(true);
        if (onApplyItems && itpId) {
            try {
                await onApplyItems(prepareDetailPayload(newItems));
            } catch (_) {
                // error handled in parent (toast shown there)
            }
        }
    };

    const handleClose = () => {
        if (isDirty) {
            setCloseConfirm(true);
        } else {
            onClose();
        }
    };

    const handleSave = async () => {
        if (validate()) {
            setSaving(true);
            try {
                const payload = { ...formData };
                delete payload.detail_data;
                const detailPayload = itpId ? prepareDetailPayload() : undefined;
                await onSave(payload, detailPayload, pendingFiles, deletedFileIds);
                setIsDirty(false);
            } catch (err) {
                toast.error((err as Error)?.message || t('common.saveFailed'));
            } finally {
                setSaving(false);
            }
        }
    };

    const handlePublish = async () => {
        if (!window.confirm("Are you sure you want to publish this ITP? This will update the revision and status.")) return;

        if (validate()) {
            setSaving(true);
            try {
                const nextRev = getNextRevision(formData.rev || '');
                const payload = {
                    ...formData,
                    rev: nextRev,
                    status: 'Approved'
                };
                delete payload.detail_data;
                const detailPayload = itpId ? prepareDetailPayload() : undefined;

                await onSave(payload, detailPayload, pendingFiles, deletedFileIds);
            } finally {
                setSaving(false);
            }
        }
    };



    const [generatingChecklist, setGeneratingChecklist] = useState(false);

    const handleGenerateChecklist = async () => {
        if (!itpId) {
            toast.error('Please save the ITP first.');
            return;
        }
        if (advancedItems.length === 0) {
            toast.error('No inspection items to generate checklist from.');
            return;
        }

        const checklistItems = advancedItems.map((item, idx) => {
            const activityText = typeof item.activity === 'string' ? item.activity : (item.activity.en || '');
            const criteriaText = Array.isArray(item.criteria)
                ? item.criteria.map((c: any) => typeof c === 'string' ? c : c.en || '').filter(Boolean).join('; ')
                : typeof item.criteria === 'string' ? item.criteria : '';

            return {
                id: idx + 1,
                item: `[${item.id}] ${activityText}`,
                criteria: criteriaText || activityText,
                situation: '',
                result: '-'
            };
        });

        const detailData = JSON.stringify({
            projectTitle: formData.description || '',
            recordsNo: '',
            packageName: '',
            inspectionDate: new Date().toISOString().split('T')[0],
            location: '',
            stage: '',
            items: checklistItems,
            remarks: '',
            signatures: { siteEngineer: '', constructionLeader: '', subcontractorRep: '' }
        });

        setGeneratingChecklist(true);
        try {
            const res = await api.post('/checklist/', {
                date: new Date().toISOString().split('T')[0],
                status: 'Ongoing',
                activity: formData.description || 'ITP Checklist',
                itpId: itpId,
                itpVersion: formData.rev || '',
                contractor: formData.vendor || '',
                detail_data: detailData,
            });

            const newRecordNo = res.data.recordsNo || res.data.records_no;
            toast.success(`Checklist ${newRecordNo} created successfully`);
            navigate(`/checklist?recordNo=${newRecordNo}&from=itp`);
        } catch (err: any) {
            toast.error(err?.response?.data?.detail || 'Failed to generate checklist');
        } finally {
            setGeneratingChecklist(false);
        }
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
            attachments: (prev.attachments || []).filter(a => typeof a !== 'string' && a.id !== fileId)
        }));
    };

    const handleRemoveLegacyAttachment = (index: number) => {
        setFormData(prev => ({
            ...prev,
            attachments: (prev.attachments || []).filter((_, i) => i !== index)
        }));
    };

    return (
        <>
        <div className={styles.modalOverlay} style={{ padding: 0 }}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '100%', width: '100%', height: '100%', maxHeight: 'none', borderRadius: 0 }}>
                <div className={styles.modalHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <BackButton onClick={handleClose} label={t('common.back')} />
                        <h2>{existingItem ? t('itp.editTitle') : t('itp.addTitle')}</h2>
                    </div>
                    <button className={styles.closeButton} onClick={handleClose}>×</button>
                </div>

                <div className={styles.tabsContainer}>
                    <button
                        className={`${styles.tabButton} ${activeTab === 'general' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('general')}
                    >
                        {t('itp.tab.generalInfo') || 'General Info'}
                    </button>
                    <button
                        className={`${styles.tabButton} ${activeTab === 'plan' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('plan')}
                    >
                        {t('itp.tab.inspectionPlan') || 'Inspection Plan'}
                        {` (${advancedItems.length})`}
                    </button>

                </div>

                <div className={styles.modalBody}>
                    <p className={styles.formRequiredHint}>{t('form.requiredHint')}</p>

                    {activeTab === 'general' && (
                        <div className={styles.formSections}>
                            <div className={styles.formSection}>
                                <h3 className={styles.sectionTitle}>{t('itp.infoSection')}</h3>
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label>{t('itp.referenceNo')}</label>
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            value={formData.referenceNo || t('form.autoGenerated')}
                                            readOnly
                                            style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: formData.referenceNo ? '#000000' : '#666666' }}
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label>{t('itp.description')}</label>
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            value={formData.description || ''}
                                            onChange={(e) => handleFieldChange('description', e.target.value)}
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.requiredLabel}>{t('itp.vendor')}</label>
                                        <select
                                            className={`${styles.formSelect} ${errors.vendor ? styles.errorInput : ''}`}
                                            value={formData.vendor || ''}
                                            onChange={(e) => handleFieldChange('vendor', e.target.value)}
                                        >
                                            <option value="">{t('itp.selectContractor')}</option>
                                            {getActiveContractors().map((contractor) => (
                                                <option key={contractor.id} value={contractor.name}>
                                                    {contractor.name}
                                                </option>
                                            ))}
                                        </select>
                                        {errors.vendor && <span className={styles.errorMessage}>{errors.vendor}</span>}
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label>{t('itp.submissionDate')}</label>
                                        <input
                                            type={formData.submissionDate ? 'date' : 'text'}
                                            placeholder="mm/dd/yyyy"
                                            lang="en"
                                            onFocus={(e) => (e.target.type = 'date')}
                                            onBlur={(e) => {
                                                if (!e.target.value) e.target.type = 'text';
                                            }}
                                            className={styles.formInput}
                                            value={formData.submissionDate || ''}
                                            onChange={(e) => handleFieldChange('submissionDate', e.target.value)}
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label>{t('common.dueDate')}</label>
                                        <input
                                            type="date"
                                            lang="en"
                                            className={styles.formInput}
                                            value={(formData as any).dueDate || ''}
                                            onChange={(e) => handleFieldChange('dueDate' as any, e.target.value)}
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label>{t('itp.rev')}</label>
                                        {revMode === 'select' && (
                                            <select
                                                className={styles.formSelect}
                                                value={REV_OPTIONS.includes(formData.rev || '') ? formData.rev : 'Rev1.0'}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    if (value === 'custom') {
                                                        setRevMode('custom');
                                                        handleFieldChange('rev', '');
                                                    } else {
                                                        setRevMode('select');
                                                        handleFieldChange('rev', value);
                                                    }
                                                }}
                                            >
                                                {REV_OPTIONS.map((r) => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                                <option value="custom">{t('itp.revSelectCustom')}</option>
                                            </select>
                                        )}
                                        {revMode === 'custom' && (
                                            <input
                                                type="text"
                                                className={styles.formInput}
                                                value={formData.rev || ''}
                                                onChange={(e) => handleFieldChange('rev', e.target.value)}
                                                placeholder={t('itp.revPlaceholder')}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Attachments */}
                            <div className={styles.formSection}>
                                <FileAttachment
                                    attachments={formData.attachments || []}
                                    onPendingFilesChange={handlePendingFilesChange}
                                    onDeleteExistingFile={handleDeleteExistingFile}
                                    onRemoveLegacy={handleRemoveLegacyAttachment}
                                    entityType="itp"
                                    entityId={existingItem?.id}
                                    category="attachment"
                                    id="attachment"
                                />
                            </div>

                            {/* Quality Assessment */}
                            <div className={styles.formSection}>
                                <h3 className={styles.sectionTitle}>{t('pqp.qualityAssessment')}</h3>
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label>{t('itp.status')}</label>
                                        <select
                                            className={styles.formSelect}
                                            value={formData.status || 'Pending'}
                                            onChange={(e) => handleFieldChange('status', e.target.value)}
                                        >
                                            <option value="Approved">{t('itp.status.approved')}</option>
                                            <option value="Approved with comments">{t('itp.status.approvedWithComments')}</option>
                                            <option value="Revise & Resubmit">{t('itp.status.reviseResubmit')}</option>
                                            <option value="Rejected">{t('itp.status.rejected')}</option>
                                            <option value="Pending">{t('itp.status.pending')}</option>
                                            <option value="No submit">{t('itp.status.noSubmit')}</option>
                                            <option value="Void">{t('itp.status.void')}</option>
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
                                            value={formData.remark || ''}
                                            onChange={(e) => handleFieldChange('remark', e.target.value)}
                                            rows={3}
                                        />
                                    </div>
                                </div>
                            </div>

                            {existingItem?.id && (
                                <RelatedDocuments entityType="itp" entityId={existingItem.id} />
                            )}
                        </div>
                    )}

                    {activeTab === 'plan' && (
                        <div className={`${styles.formSections} p-0!`}>
                            <ITPAdvancedEditor
                                ref={editorRef}
                                items={advancedItems}
                                onItemsChange={handleItemsChange}
                                onViewRecord={() => {
                                    navigate('/itr');
                                }}
                                headerData={headerData}
                            />
                            {/* <div className="mt-2 text-center text-xs text-slate-500 print:hidden">
                                Note: Changes to the inspection plan are saved when you click "Save" below.
                            </div> */}
                        </div>
                    )}
                </div>

                <div className={styles.modalActions}>
                    {activeTab === 'plan' && (
                        <button
                            type="button"
                            className="px-4 py-2 text-sm font-semibold bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 shadow-sm mr-auto flex items-center gap-2 print:hidden"
                            onClick={handlePrint}
                        >
                            <Printer size={16} /> Print
                        </button>
                    )}

                    {activeTab === 'plan' && (
                        <button
                            type="button"
                            className="px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm flex items-center gap-2 print:hidden disabled:opacity-50"
                            onClick={handleGenerateChecklist}
                            disabled={generatingChecklist || advancedItems.length === 0}
                        >
                            <ClipboardList size={16} /> {generatingChecklist ? 'Generating...' : 'Generate Checklist'}
                        </button>
                    )}

                    {activeTab === 'plan' && (
                        <button
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide hover:bg-blue-700 shadow-sm flex items-center gap-2 print:hidden ml-auto"
                            onClick={() => editorRef.current?.handleAddNew()}
                        >
                            <Plus size={16} strokeWidth={3} /> Add New Item
                        </button>
                    )}

                    <button
                        className="px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm flex items-center gap-2 disabled:opacity-50"
                        onClick={handlePublish}
                        disabled={saving}
                    >
                        <ShieldCheck size={16} /> Publish
                    </button>

                    <button className={styles.saveButton} onClick={handleSave} disabled={saving}>
                        {saving ? <LayoutTemplate size={16} className="animate-spin" /> : <Save size={16} />}
                        {t('common.save')}
                    </button>
                    <button className={styles.cancelButton} onClick={handleClose} disabled={saving}>
                        {t('common.cancel')}
                    </button>
                </div>
                {/* Print Portal */}
                {isPrinting && ReactDOM.createPortal(
                    <ITPPrintTemplate
                        items={advancedItems}
                        headerData={headerData}
                    />,
                    document.body
                )}

            </div>




        </div >

        <ConfirmModal
            isOpen={closeConfirm}
            title={t('common.unsavedChanges') || 'Unsaved Changes'}
            message={t('itp.unsavedChangesMsg') || 'You have unsaved changes. Are you sure you want to leave? All changes will be lost.'}
            confirmText={t('common.leave') || 'Leave'}
            cancelText={t('common.stayAndSave') || 'Stay'}
            onConfirm={() => { setCloseConfirm(false); onClose(); }}
            onCancel={() => setCloseConfirm(false)}
        />
        </>
    );
};
