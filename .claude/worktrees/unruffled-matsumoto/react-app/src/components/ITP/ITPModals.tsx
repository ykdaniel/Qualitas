import React, { useState, useEffect, useMemo, useRef } from 'react';

import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useContractors } from '../../context/ContractorsContext';
import { ITPItem, ITPInspectionItem } from '../../context/ITPContext';
import { ITPAdvancedEditor, ITPAdvancedEditorRef } from './ITPAdvancedEditor';
import ReactDOM from 'react-dom';
import { ITPPrintTemplate } from './ITPPrintTemplate';
import { InspectionItem } from '../../types/itp';
import FileAttachment from '../Shared/FileAttachment';
import styles from './ITP.module.css';
import { getNextRevision } from '../../utils/revision';
import { useITR } from '../../context/ITRContext';
import { ITRDetailsViewModal } from '../ITR/ITRModals';
import { Printer, ShieldCheck, Save, LayoutTemplate, Plus } from 'lucide-react';
import { PHASES } from '../../constants/itp';

// VP Badge for Print View
const VPBadge = ({ type }: { type: string }) => {
    const badgeStyles: { [key: string]: string } = {
        H: "bg-rose-100 text-rose-700 border-rose-200 font-bold ring-1 ring-rose-200 shadow-sm",
        W: "bg-amber-100 text-amber-700 border-amber-200 font-bold ring-1 ring-amber-200 shadow-sm",
        R: "bg-sky-100 text-sky-700 border-sky-200 font-bold ring-1 ring-sky-200 shadow-sm",
        "※": "bg-slate-100 text-slate-600 border-slate-200 font-medium ring-1 ring-slate-200"
    };

    if (!type) return <span className="text-slate-200 font-light">-</span>;

    return (
        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-all ${badgeStyles[type] || ""}`}>
            {type}
        </span>
    );
};

export interface ITPDetailModalProps {
    itpId: string;
    existingItem?: ITPItem;
    onSave: (updates: Partial<ITPItem>, details?: any) => Promise<void>;
    onClose: () => void;
}

export const ITPDetailModal: React.FC<ITPDetailModalProps> = ({ itpId, existingItem, onSave, onClose }) => {
    const editorRef = useRef<ITPAdvancedEditorRef>(null);
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { getActiveContractors } = useContractors();
    const { itrList } = useITR();
    const REV_OPTIONS = ['Rev1.0', 'Rev2.0', 'Rev3.0', 'Rev4.0'];

    const [activeTab, setActiveTab] = useState<'general' | 'plan'>('general');
    const [viewingItrItem, setViewingItrItem] = useState<any | null>(null);

    const [saving, setSaving] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);

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
            let data = existingItem.detail_data as any;
            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    console.error("Failed to parse detail_data", e);
                    data = [];
                }
            }
            let parsedItems: InspectionItem[] = [];

            // Check if it is a complex object (Phases)
            if (!Array.isArray(data) && typeof data === 'object' && ('a' in data || 'b' in data || 'c' in data)) {
                ['a', 'b', 'c'].forEach(phaseKey => {
                    if (Array.isArray(data[phaseKey])) {
                        parsedItems.push(...data[phaseKey].map((item: any) => ({
                            ...item,
                            phase: phaseKey.toUpperCase() // Ensure phase is 'A', 'B', 'C'
                        })));
                    }
                });
            } else if (Array.isArray(data)) {
                // Convert simple array to items, default to Phase A if missing
                parsedItems = data.map((item: any, index: number) => ({
                    ...item,
                    id: item.id || `A${index + 1}`,
                    phase: item.phase || 'A',
                    // Ensure other required fields exist
                    activity: typeof item.activity === 'object' ? item.activity : { en: item.activity || '', ch: '' },
                    checkTime: typeof item.checkTime === 'object' ? item.checkTime : { en: item.checkTime || '', ch: '' },
                    method: typeof item.method === 'object' ? item.method : { en: item.method || '', ch: '' },
                    vp: item.vp || { sub: '', teco: '', employer: '', hse: '' }
                }));
            }
            setAdvancedItems(parsedItems);
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

    const prepareDetailPayload = () => {
        return {
            a: advancedItems.filter(i => i.phase === 'A').map(({ phase, ...rest }) => rest),
            b: advancedItems.filter(i => i.phase === 'B').map(({ phase, ...rest }) => rest),
            c: advancedItems.filter(i => i.phase === 'C').map(({ phase, ...rest }) => rest),
            checklist: [],
            self_inspection: null
        };
    };

    const handleSave = async () => {
        if (validate()) {
            setSaving(true);
            try {
                const payload = { ...formData };
                delete payload.detail_data;
                const detailPayload = itpId ? prepareDetailPayload() : undefined;
                await onSave(payload, detailPayload);
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

                await onSave(payload, detailPayload);
            } finally {
                setSaving(false);
            }
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
                        attachments: [...(prev.attachments || []), result]
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
            attachments: (prev.attachments || []).filter((_, i) => i !== index)
        }));
    };

    return (
        <div className={styles.modalOverlay} style={{ padding: 0 }}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '100%', width: '100%', height: '100%', maxHeight: 'none', borderRadius: 0 }}>
                <div className={styles.modalHeader}>
                    <h2>{existingItem ? t('itp.editTitle') : t('itp.addTitle')}</h2>
                    <button className={styles.closeButton} onClick={onClose}>×</button>
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
                                    onUpload={handleAttachmentUpload}
                                    onRemove={handleRemoveAttachment}
                                    id="itp"
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
                                            <option value="Approved with comments">Approved with comments</option>
                                            <option value="Revise & Resubmit">Revise & Resubmit</option>
                                            <option value="Rejected">Rejected</option>
                                            <option value="Pending">Pending</option>
                                            <option value="No submit">No submit</option>
                                            <option value="Void">Void</option>
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
                        </div>
                    )}

                    {activeTab === 'plan' && (
                        <div className={`${styles.formSections} !p-0`}>
                            <ITPAdvancedEditor
                                ref={editorRef}
                                items={advancedItems}
                                onItemsChange={setAdvancedItems}
                                onViewRecord={(itr) => setViewingItrItem(itr)}
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
                    <button className={styles.cancelButton} onClick={onClose} disabled={saving}>
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



            {/* ITR Details Modal (Nested) */}
            {viewingItrItem && (
                <ITRDetailsViewModal
                    itrId={viewingItrItem.id}
                    itrItem={viewingItrItem}
                    onPrint={() => window.print()}
                    onClose={() => setViewingItrItem(null)}
                />
            )}
        </div >
    );
};
