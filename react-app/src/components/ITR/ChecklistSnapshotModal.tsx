import React, { useState } from 'react';
import styles from './ITR.module.css'; // Corrected import
import { ChecklistRecord } from '../../store/checklistStore';
import { useLanguage } from '../../context/LanguageContext';
import { CheckCircle, XCircle, HelpCircle, Trash2, Plus, AlertCircle } from 'lucide-react';

interface ChecklistSnapshotModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (updatedSnapshot: any) => void;
    initialData: any;
    readOnly?: boolean;
}

export const ChecklistSnapshotModal: React.FC<ChecklistSnapshotModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialData,
    readOnly = false
}) => {
    const { t } = useLanguage();
    // Local state for the snapshot being edited
    const [activeTab, setActiveTab] = useState<'general' | 'items'>('general');
    const [formData, setFormData] = useState<any>(() => {
        if (initialData) {
            // Flatten data.items if available
            return {
                ...initialData,
                items: initialData.data?.items || initialData.items || [],
                // Ensure other flattened fields are available if needed
                ...initialData.data
            };
        }
        return {};
    });

    if (!isOpen) return null;

    const handleFieldChange = (field: string, value: any) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        // Packing items back into data property to maintain structure
        const payload = {
            ...formData,
            data: {
                ...(formData.data || {}),
                items: formData.items
            }
        };
        onSave(payload);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className={`${styles.modalContent} w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl rounded-lg bg-white`}> {/* Increased width and fixed height behavior */}
                <div className="flex justify-between items-center p-4 border-b border-slate-200 shrink-0">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        {t('checklist.editSnapshot')}
                        <span className="text-xs font-normal px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full border border-amber-200">
                            Snapshot
                        </span>
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <XCircle size={24} />
                    </button>
                </div>

                <div className="p-4 bg-blue-50 border-b border-blue-100 text-sm text-blue-700 flex items-start gap-2 shrink-0">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    {t('checklist.snapshotEditNote')}
                </div>

                <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-4 gap-4 shrink-0">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`pb-3 px-2 text-sm font-semibold transition-colors border-b-2 ${activeTab === 'general'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        {t('checklist.tabGeneral')}
                    </button>
                    <button
                        onClick={() => setActiveTab('items')}
                        className={`pb-3 px-2 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'items'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        {t('checklist.tabItems')}
                        <span className="text-xs bg-slate-200 text-slate-600 px-1.5 rounded-full">
                            {formData.items?.length || 0}
                        </span>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 bg-white">
                    {activeTab === 'general' && (
                        <div className="grid grid-cols-2 gap-6">
                            {/* ... Content ... */}
                            <div className="space-y-4">
                                <div className={styles.formGroup}>
                                    <label className={styles.requiredLabel}>{t('common.referenceNo')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.recordsNo || ''}
                                        readOnly // Usually ref no is fixed or auto-gen
                                        disabled
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.requiredLabel}>{t('common.status')}</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.status || 'Ongoing'}
                                        onChange={(e) => handleFieldChange('status', e.target.value)}
                                        disabled={readOnly}
                                    >
                                        <option value="Ongoing">{t('checklist.status.ongoing')}</option>
                                        <option value="Pass">{t('checklist.status.pass')}</option>
                                        <option value="Fail">{t('checklist.status.fail')}</option>
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.requiredLabel}>{t('common.location')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.location || ''}
                                        onChange={(e) => handleFieldChange('location', e.target.value)}
                                        placeholder="Specific location for this check"
                                        disabled={readOnly}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('common.remark')}</label>
                                    <textarea
                                        className={`${styles.formInput} min-h-[100px] resize-none`}
                                        value={formData.remarks || ''}
                                        onChange={(e) => handleFieldChange('remarks', e.target.value)}
                                        placeholder="Add observations or remarks..."
                                        disabled={readOnly}
                                    />
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className={styles.formGroup}>
                                    <label className={styles.requiredLabel}>{t('checklist.activity')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.activity || ''}
                                        readOnly
                                        disabled
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.requiredLabel}>{t('itr.inspectionDate')}</label>
                                    <input
                                        type="date"
                                        className={styles.formInput}
                                        value={formData.date ? formData.date.split('T')[0] : ''}
                                        onChange={(e) => handleFieldChange('date', e.target.value)}
                                        disabled={readOnly}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.requiredLabel}>NOI No.</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.aconexNumber || ''}
                                        readOnly
                                        disabled
                                    />
                                </div>
                            </div>
                        </div>
                    )} {/* Closing activeTab === 'general' */}

                    {activeTab === 'items' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-slate-700">{t('checklist.itemsList')}</h3>
                                <button
                                    onClick={() => {
                                        const newId = formData.items?.length > 0 ? Math.max(...formData.items.map((i: any) => i.id)) + 1 : 1;
                                        setFormData({
                                            ...formData,
                                            items: [
                                                ...(formData.items || []),
                                                { id: newId, item: "New Item", criteria: "", situation: "", result: "O" }
                                            ]
                                        });
                                    }}
                                    className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                                    disabled={readOnly}
                                >
                                    <Plus size={16} /> {t('common.add')}
                                </button>
                            </div>

                            {formData.items && formData.items.length > 0 ? (
                                <div className="overflow-x-auto border rounded-lg">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-600 font-bold border-b">
                                            <tr>
                                                <th className="px-3 py-2 w-10">#</th>
                                                <th className="px-3 py-2">{t('checklist.item')}</th>
                                                <th className="px-3 py-2 w-1/4">{t('checklist.criteria')}</th>
                                                <th className="px-3 py-2 w-1/4">{t('checklist.situation')}</th>
                                                <th className="px-3 py-2 w-24 text-center">{t('checklist.result')}</th>
                                                {!readOnly && <th className="px-3 py-2 w-10"></th>}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {formData.items.map((item: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-slate-50">
                                                    <td className="px-3 py-2 text-center text-slate-500">{item.id}</td>
                                                    <td className="px-3 py-2">
                                                        <div className="font-medium text-slate-800">{item.item}</div>
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-600">{item.criteria}</td>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="text"
                                                            className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none transition-colors"
                                                            value={item.situation || ''}
                                                            placeholder="..."
                                                            onChange={(e) => {
                                                                const newItems = [...formData.items];
                                                                newItems[idx] = { ...newItems[idx], situation: e.target.value };
                                                                setFormData({ ...formData, items: newItems });
                                                            }}
                                                            disabled={readOnly}
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        <button
                                                            onClick={() => {
                                                                if (readOnly) return;
                                                                const newItems = [...formData.items];
                                                                const nextResult = item.result === 'O' ? 'X' : (item.result === 'X' ? '/' : 'O');
                                                                newItems[idx] = { ...newItems[idx], result: nextResult };
                                                                setFormData({ ...formData, items: newItems });
                                                            }}
                                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition-colors ${item.result === 'O' ? 'bg-green-100 text-green-700' :
                                                                item.result === 'X' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                                                                }`}
                                                            disabled={readOnly}
                                                        >
                                                            {item.result === 'O' ? <CheckCircle size={14} /> : (item.result === 'X' ? <XCircle size={14} /> : <HelpCircle size={14} />)}
                                                            {item.result === 'O' ? 'Pass' : (item.result === 'X' ? 'Fail' : 'N/A')}
                                                        </button>
                                                    </td>
                                                    {!readOnly && (
                                                        <td className="px-3 py-2">
                                                            <button
                                                                onClick={() => {
                                                                    const newItems = formData.items.filter((_: any, i: number) => i !== idx);
                                                                    setFormData({ ...formData, items: newItems });
                                                                }}
                                                                className="text-slate-400 hover:text-red-500"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed text-slate-400">
                                    {t('checklist.noItems')}
                                </div>
                            )}
                        </div>
                    )} {/* Closing activeTab === 'items' */}
                </div>

                <div className="p-4 border-t border-slate-200 bg-gray-50 flex justify-end gap-3 shrink-0">
                    <button
                        className="px-4 py-2 bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 font-medium transition-colors"
                        onClick={onClose}
                    >
                        {t('common.cancel')}
                    </button>
                    {!readOnly && (
                        <button
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition-colors shadow-sm"
                            onClick={handleSave}
                        >
                            {t('common.save')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
