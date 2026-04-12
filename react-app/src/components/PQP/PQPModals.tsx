import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { usePQPStore } from '../../store/pqpStore';
import type { PQPItem, PQPHistoryItem } from '../../store/pqpStore';
import FileAttachment from '../Shared/FileAttachment';
import styles from './PQP.module.css';

const getLocalizedStatus = (status: string, t: (key: string) => string) => {
    const s = (status || '').toLowerCase();
    if (s === 'approved') return t('pqp.status.approved');
    if (s === 'reject' || s === 'rejected') return t('pqp.status.reject');
    if (s === 'revise & resubmit') return t('pqp.status.reviseResubmit');
    if (s === 'not submit' || s === 'not submitted') return t('pqp.status.notSubmitted');
    if (s === 'under review') return t('pqp.status.underReview');
    return status;
};

export interface PQPDetailModalProps {
    pqpId: string;
    existingItem?: PQPItem;
    onSave: (updates: Partial<PQPItem>, pendingFiles: File[], deletedFileIds: string[], removedAttachments?: string[]) => void | Promise<void>;
    onPublish?: (id: string, changeSummary?: string) => Promise<void>;
    onClose: () => void;
}

export const PQPDetailModal: React.FC<PQPDetailModalProps> = ({ pqpId: _pqpId, existingItem, onSave, onPublish, onClose }) => {
    const { t } = useLanguage();
    const { getActiveContractors } = useContractorsStore();
    const VERSION_OPTIONS = ['Rev1.0', 'Rev2.0', 'Rev3.0', 'Rev4.0'];
    const [formData, setFormData] = useState<Partial<PQPItem>>({
        pqpNo: existingItem?.pqpNo || '',
        title: existingItem?.title || '',
        description: existingItem?.description || '',
        vendor: existingItem?.vendor || '',
        status: existingItem?.status || 'Not Submit',
        // 將舊資料的 "V1.0" 正規化為 "Rev1.0"
        version: existingItem
            ? (existingItem.version === 'V1.0' ? 'Rev1.0' : existingItem.version)
            : 'Rev1.0',
        attachments: existingItem?.attachments || [],
        dueDate: existingItem?.dueDate || '',
    });

    const [errors, setErrors] = useState<{ [key: string]: string }>({});
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [pendingUploads, setPendingUploads] = useState<File[]>([]);
    const [deletedFileIds, setDeletedFileIds] = useState<string[]>([]);
    const [versionMode, setVersionMode] = useState<'select' | 'custom'>(() => {
        let currentVersion = existingItem?.version;
        if (currentVersion === 'V1.0') {
            currentVersion = 'Rev1.0';
        }
        if (currentVersion && !VERSION_OPTIONS.includes(currentVersion)) {
            return 'custom';
        }
        return 'select';
    });

    const handleFieldChange = (field: keyof PQPItem, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        // Clear error when user types
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
        }
    };

    const handleDateButton = (field: keyof PQPItem) => {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}_`;
        setFormData(prev => ({
            ...prev,
            [field]: prev[field] ? `${prev[field]}\n${dateStr}` : dateStr
        }));
    };

    // Replaced by FileAttachment component props

    const validate = () => {
        const newErrors: { [key: string]: string } = {};
        if (!formData.title?.trim()) newErrors.title = t('pqp.titleRequired');
        if (!formData.vendor) newErrors.vendor = t('pqp.vendorRequired');
        if (!formData.version?.trim()) {
            newErrors.version = t('pqp.versionRequired');
        } else if (versionMode === 'custom') {
            // 防呆：必須是 Rev5.0 以上，例如 "Rev5.0", "Rev6.0"
            const match = /^Rev(\d+)(\.\\d+)?$/.exec(formData.version.trim());
            if (!match) {
                newErrors.version = t('pqp.revFormatError');
            } else {
                const major = parseInt(match[1], 10);
                if (isNaN(major) || major < 5) {
                    newErrors.version = t('pqp.revMinError');
                }
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = async () => {
        if (!validate()) return;
        setSaving(true);
        setSaveError('');
        try {
            await onSave(formData, pendingUploads, deletedFileIds);
            onClose();
        } catch (err) {
            setSaveError((err as Error)?.message || t('pqp.saveError'));
        } finally {
            setSaving(false);
        }
    };

    // Version history
    const { getHistory } = usePQPStore();
    const [historyItems, setHistoryItems] = useState<PQPHistoryItem[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    useEffect(() => {
        if (existingItem?.id) {
            getHistory(existingItem.id).then(setHistoryItems).catch(() => {});
        }
    }, [existingItem?.id, getHistory]);

    const handlePublish = async () => {
        if (!existingItem) {
            // Must save first before publishing
            setSaveError(t('pqp.saveBeforePublish') || 'Please save before publishing');
            return;
        }
        if (!validate()) return;
        const changeSummary = window.prompt(t('pqp.publishChangeSummary') || 'Change summary (optional):');
        if (changeSummary === null) return; // cancelled
        setSaving(true);
        try {
            if (onPublish) {
                await onPublish(existingItem.id, changeSummary || undefined);
            }
            onClose();
        } catch (err) {
            setSaveError((err as Error)?.message || t('pqp.saveError'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{existingItem ? t('pqp.editTitle') : t('pqp.addTitle')}</h2>
                    <button type="button" className={styles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={styles.modalBody}>
                    <p className={styles.formRequiredHint}>{t('form.requiredHint')}</p>
                    <div className={styles.formSections}>
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('pqp.infoSection')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('pqp.referenceNo')}</label>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        value={formData.pqpNo || t('form.autoGenerated')}
                                        readOnly
                                        style={{ backgroundColor: '#D9D9D9', cursor: 'not-allowed', color: formData.pqpNo ? '#000000' : '#666666' }}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.requiredLabel}>{t('pqp.subject')}</label>
                                    <input
                                        type="text"
                                        className={`${styles.formInput} ${errors.title ? styles.errorInput : ''}`}
                                        value={formData.title || ''}
                                        onChange={(e) => handleFieldChange('title', e.target.value)}
                                    />
                                    {errors.title && <span className={styles.errorMessage}>{errors.title}</span>}
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.requiredLabel}>{t('pqp.contractor')}</label>
                                    <select
                                        className={`${styles.formSelect} ${errors.vendor ? styles.errorInput : ''}`}
                                        value={formData.vendor || ''}
                                        onChange={(e) => handleFieldChange('vendor', e.target.value)}
                                    >
                                        <option value="">{t('common.selectContractor') || 'Select Contractor'}</option>
                                        {getActiveContractors().map((contractor) => (
                                            <option key={contractor.id} value={contractor.name}>
                                                {contractor.name}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.vendor && <span className={styles.errorMessage}>{errors.vendor}</span>}
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.requiredLabel}>{t('pqp.version')}</label>
                                    {versionMode === 'select' && (
                                        <select
                                            className={`${styles.formSelect} ${errors.version ? styles.errorInput : ''}`}
                                            value={
                                                VERSION_OPTIONS.includes(formData.version || '')
                                                    ? formData.version
                                                    : 'Rev1.0'
                                            }
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                if (value === 'custom') {
                                                    setVersionMode('custom');
                                                    handleFieldChange('version', '');
                                                } else {
                                                    setVersionMode('select');
                                                    handleFieldChange('version', value);
                                                }
                                            }}
                                        >
                                            {VERSION_OPTIONS.map((v) => (
                                                <option key={v} value={v}>{v}</option>
                                            ))}
                                            <option value="custom">{t('pqp.revSelectCustom')}</option>
                                        </select>
                                    )}
                                    {versionMode === 'custom' && (
                                        <input
                                            type="text"
                                            className={`${styles.formInput} ${errors.version ? styles.errorInput : ''}`}
                                            value={formData.version || ''}
                                            onChange={(e) => handleFieldChange('version', e.target.value)}
                                            placeholder={t('pqp.revPlaceholder')}
                                        />
                                    )}
                                    {errors.version && <span className={styles.errorMessage}>{errors.version}</span>}
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
                            </div>
                        </div>


                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('common.attachments')}</h3>
                            <FileAttachment
                                attachments={formData.attachments || [] as any[]}
                                onPendingFilesChange={(files) => setPendingUploads(files)}
                                onDeleteExistingFile={async (id) => setDeletedFileIds(prev => [...prev, id])}
                                id="pqp"
                                entityType="pqp"
                                category="attachment"
                            />
                        </div>

                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('pqp.qualityAssessment')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('common.status')}</label>
                                    <select
                                        className={styles.formSelect}
                                        value={formData.status || 'Approved'}
                                        onChange={(e) => handleFieldChange('status', e.target.value)}
                                    >
                                        <option value="Not Submit">{t('pqp.status.notSubmitted')}</option>
                                        <option value="Under Review">{t('pqp.status.underReview')}</option>
                                        <option value="Approved">{t('pqp.status.approved')}</option>
                                        <option value="Reject">{t('pqp.status.reject')}</option>
                                        <option value="Revise & Resubmit">{t('pqp.status.reviseResubmit')}</option>
                                    </select>
                                </div>
                                <div className={styles.formGroupFull}>
                                    <div className={styles.labelWithButton}>
                                        <label>{t('pqp.remark')}</label>
                                        <button
                                            type="button"
                                            className={styles.tbcButton}
                                            onClick={() => handleDateButton('description')}
                                        >
                                            {t('pqp.addDate')}
                                        </button>
                                    </div>
                                    <textarea
                                        className={styles.formTextarea}
                                        value={formData.description || ''}
                                        onChange={(e) => handleFieldChange('description', e.target.value)}
                                        rows={4}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                {existingItem && historyItems.length > 0 && (
                    <div className={styles.formSection} style={{ margin: '0 24px' }}>
                        <h3
                            className={styles.sectionTitle}
                            style={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => setShowHistory(!showHistory)}
                        >
                            {t('pqp.versionHistory') || 'Version History'} ({historyItems.length})
                            <span style={{ marginLeft: 8, fontSize: 12 }}>{showHistory ? '▲' : '▼'}</span>
                        </h3>
                        {showHistory && (
                            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                                        <th style={{ padding: '6px 8px' }}>{t('pqp.version')}</th>
                                        <th style={{ padding: '6px 8px' }}>{t('common.status')}</th>
                                        <th style={{ padding: '6px 8px' }}>{t('pqp.subject')}</th>
                                        <th style={{ padding: '6px 8px' }}>{t('pqp.changeSummary') || 'Change Summary'}</th>
                                        <th style={{ padding: '6px 8px' }}>{t('pqp.createdDate')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyItems.map((h) => (
                                        <tr key={h.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '6px 8px' }}>{h.version}</td>
                                            <td style={{ padding: '6px 8px' }}>{h.status}</td>
                                            <td style={{ padding: '6px 8px' }}>{h.title}</td>
                                            <td style={{ padding: '6px 8px' }}>{h.change_summary || '-'}</td>
                                            <td style={{ padding: '6px 8px' }}>{h.created_at?.split('T')[0]}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
                {saveError && <p className={styles.saveError}>{saveError}</p>}
                <div className={styles.modalActions}>
                    <button
                        type="button"
                        className={styles.saveButton}
                        onClick={handlePublish}
                        disabled={saving}
                        style={{ backgroundColor: '#4f46e5' }}
                        title="Publish as next revision"
                    >
                        Publish
                    </button>
                    <button type="button" className={styles.saveButton} onClick={handleSave} disabled={saving} style={{ marginLeft: '12px' }}>
                        {saving ? t('pqp.saving') : t('common.save')}
                    </button>
                    <button type="button" className={styles.cancelButton} onClick={onClose} disabled={saving}>
                        {t('common.cancel')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export interface PQPDetailsViewModalProps {
    pqpId: string;
    pqpItem?: PQPItem;
    onClose: () => void;
}

export const PQPDetailsViewModal: React.FC<PQPDetailsViewModalProps> = ({ pqpId: _pqpId, pqpItem, onClose }) => {
    const { t } = useLanguage();
    const handlePrint = () => {
        window.print();
    };

    if (!pqpItem) {
        return null;
    }

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{t('pqp.detail.title')}</h2>
                    <button className={styles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={styles.modalBody}>
                    <div className={styles.formSections}>
                        <div className={styles.formSection}>
                            <h3 className={styles.sectionTitle}>{t('pqp.infoSection')}</h3>
                            <div className={styles.formGrid}>
                                <div className={styles.formGroup}>
                                    <label>{t('pqp.referenceNo')}</label>
                                    <div className={styles.readOnlyField}>{pqpItem.pqpNo || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('pqp.subject')}</label>
                                    <div className={styles.readOnlyField}>{pqpItem.title || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('common.status')}</label>
                                    <div className={styles.readOnlyField}>{getLocalizedStatus(pqpItem.status, t) || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('pqp.contractor')}</label>
                                    <div className={styles.readOnlyField}>{pqpItem.vendor || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('pqp.version')}</label>
                                    <div className={styles.readOnlyField}>{pqpItem.version || '-'}</div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('pqp.createdDate')}</label>
                                    <div className={styles.readOnlyField}>{pqpItem.createdAt || '-'}</div>
                                </div>
                                {pqpItem.updatedAt && (
                                    <div className={styles.formGroup}>
                                        <label>{t('pqp.updatedDate')}</label>
                                        <div className={styles.readOnlyField}>{pqpItem.updatedAt}</div>
                                    </div>
                                )}
                                <div className={styles.formGroupFull}>
                                    <label>{t('pqp.remark')}</label>
                                    <div className={styles.readOnlyField}>{pqpItem.description || '-'}</div>
                                </div>
                            </div>
                        </div>

                        <FileAttachment
                            attachments={pqpItem.attachments || [] as any[]}
                            id="pqp-view"
                            entityType="pqp"
                            category="attachment"
                            readOnly={true}
                        />
                    </div>
                </div>
            </div>
            <div className={styles.modalActions}>
                <button className={styles.printButton} onClick={handlePrint}>
                    {t('common.print') || 'Print'}
                </button>
                <button className={styles.cancelButton} onClick={onClose}>
                    {t('common.close') || 'Close'}
                </button>
            </div>
        </div>
    );
};
