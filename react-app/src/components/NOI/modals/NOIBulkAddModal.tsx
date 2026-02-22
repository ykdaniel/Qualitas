import React, { useState, useMemo } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { useContractorsStore } from '../../../store/contractorsStore';
import { useITPStore } from '../../../store/itpStore';
import type { NOIItem } from '../../../store/noiStore';
import styles from '../NOI.module.css';
import { BulkNOIRow } from '../NOITypes';

export interface NOIBulkAddModalProps {
    onSave: (nois: Omit<NOIItem, 'id'>[]) => Promise<void>;
    onClose: () => void;
}

export const NOIBulkAddModal: React.FC<NOIBulkAddModalProps> = ({ onSave, onClose }) => {
    const { t } = useLanguage();
    const { getActiveContractors } = useContractorsStore();
    const itpList = useITPStore(state => state.itpList);
    const getITPByVendor = (vendor: string) => itpList.filter(itp => itp.vendor === vendor);
    const activeContractors = getActiveContractors();

    const [commonData, setCommonData] = useState({
        contractor: activeContractors.length > 0 ? activeContractors[0].name : '',
        issueDate: new Date().toISOString().split('T')[0],
        inspectionDate: new Date().toISOString().split('T')[0],
        contacts: '',
        phone: '',
        email: '',
    });

    const [rows, setRows] = useState<BulkNOIRow[]>([
        { id: '1', package: '', itpNo: '', eventNumber: '', checkpoint: '', inspectionTime: '09:00' },
    ]);

    const [saving, setSaving] = useState(false);

    const filteredITPList = useMemo(() => {
        if (!commonData.contractor) return [];
        return getITPByVendor(commonData.contractor);
    }, [commonData.contractor, getITPByVendor]);

    const handleCommonChange = (field: string, value: string) => {
        setCommonData(prev => ({ ...prev, [field]: value }));
    };

    const handleRowChange = (rowId: string, field: keyof BulkNOIRow, value: string) => {
        setRows(prev => prev.map(row => row.id === rowId ? { ...row, [field]: value } : row));
    };

    const addRow = () => {
        const newId = String(Date.now());
        setRows(prev => [...prev, { id: newId, package: '', itpNo: '', eventNumber: '', checkpoint: '', inspectionTime: '09:00' }]);
    };

    const removeRow = (rowId: string) => {
        if (rows.length <= 1) return;
        setRows(prev => prev.filter(row => row.id !== rowId));
    };

    const handleSave = async () => {
        if (!commonData.contractor) { alert(t('common.selectContractor')); return; }
        if (!commonData.issueDate) { alert(t('common.selectDate')); return; }

        const validRows = rows.filter(row => row.package.trim() || row.itpNo || row.checkpoint);
        if (validRows.length === 0) { alert(t('common.fillAtLeastOne')); return; }

        setSaving(true);
        try {
            const nois: Omit<NOIItem, 'id'>[] = validRows.map(row => ({
                package: row.package,
                referenceNo: '',
                issueDate: commonData.issueDate,
                inspectionDate: commonData.inspectionDate,
                inspectionTime: row.inspectionTime,
                itpNo: row.itpNo,
                eventNumber: row.eventNumber,
                checkpoint: row.checkpoint,
                type: '',
                contractor: commonData.contractor,
                contacts: commonData.contacts,
                phone: commonData.phone,
                email: commonData.email,
                status: 'Open',
                attachments: [],
            }));
            await onSave(nois);
        } catch (err) {
            console.error('Bulk add failed:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} style={{ maxWidth: '900px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{t('noi.bulkAdd')}</h2>
                    <button className={styles.closeButton} onClick={onClose}>×</button>
                </div>
                <div className={styles.modalBody}>
                    <p className={styles.formRequiredHint}>{t('form.requiredHint')}</p>
                    <div className={styles.formSection}>
                        <h3 className={styles.sectionTitle}>{t('noi.print.commonSection')}</h3>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label className={styles.requiredLabel}>{t('common.contractor')}</label>
                                <select className={styles.formSelect} value={commonData.contractor} onChange={(e) => handleCommonChange('contractor', e.target.value)}>
                                    <option value="">{t('common.selectPlaceholder')}</option>
                                    {activeContractors.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.requiredLabel}>{t('noi.issueDate')}</label>
                                <input type="date" lang="en" className={styles.formInput} value={commonData.issueDate} onChange={(e) => handleCommonChange('issueDate', e.target.value)} />
                            </div>
                            <div className={styles.formGroup}>
                                <label>{t('noi.inspectionDate')}</label>
                                <input type="date" lang="en" className={styles.formInput} value={commonData.inspectionDate} onChange={(e) => handleCommonChange('inspectionDate', e.target.value)} />
                            </div>
                            <div className={styles.formGroup}>
                                <label>{t('contractors.contact')}</label>
                                <input type="text" className={styles.formInput} value={commonData.contacts} onChange={(e) => handleCommonChange('contacts', e.target.value)} />
                            </div>
                            <div className={styles.formGroup}>
                                <label>{t('contractors.phone')}</label>
                                <input type="text" className={styles.formInput} value={commonData.phone} onChange={(e) => handleCommonChange('phone', e.target.value)} />
                            </div>
                            <div className={styles.formGroup}>
                                <label>{t('contractors.email')}</label>
                                <input type="email" className={styles.formInput} value={commonData.email} onChange={(e) => handleCommonChange('email', e.target.value)} />
                            </div>
                        </div>
                    </div>
                    <div className={styles.formSection}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h3 className={styles.sectionTitle} style={{ margin: 0 }}>{t('noi.print.listTitle')}</h3>
                            <button type="button" onClick={addRow} style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>{t('common.add')}</button>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f3f4f6' }}>
                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>#</th>
                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', minWidth: '150px' }}>{t('noi.package')}</th>
                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', minWidth: '150px' }}>{t('noi.itpNo')}</th>
                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', minWidth: '80px' }}>{t('noi.eventNo')}</th>
                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', minWidth: '80px' }}>{t('noi.checkpoint')}</th>
                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', minWidth: '100px' }}>{t('noi.inspectionTime')}</th>
                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '50px' }}>{t('common.operations')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, index) => (
                                        <tr key={row.id}>
                                            <td style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>{index + 1}</td>
                                            <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                                                <input type="text" value={row.package} onChange={(e) => handleRowChange(row.id, 'package', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }} placeholder="Subject" />
                                            </td>
                                            <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                                                <select value={row.itpNo} onChange={(e) => handleRowChange(row.id, 'itpNo', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }} disabled={!commonData.contractor}>
                                                    <option value="">{commonData.contractor ? t('common.selectPlaceholder') : t('pqp.allContractors')}</option>
                                                    {filteredITPList.map((itp) => (
                                                        <option key={itp.id} value={itp.referenceNo || ''}>{itp.referenceNo || '(未產生)'}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                                                <input type="text" value={row.eventNumber} onChange={(e) => handleRowChange(row.id, 'eventNumber', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }} placeholder="Event #" />
                                            </td>
                                            <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                                                <select value={row.checkpoint} onChange={(e) => handleRowChange(row.id, 'checkpoint', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }}>
                                                    <option value="">選擇</option>
                                                    <option value="W">W</option>
                                                    <option value="H">H</option>
                                                </select>
                                            </td>
                                            <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb' }}>
                                                <input type="text" className={styles.formInput} style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '4px' }} placeholder="HH:mm" value={row.inspectionTime} onChange={(e) => { const val = e.target.value; if (/^[0-9:]*$/.test(val)) handleRowChange(row.id, 'inspectionTime', val); }} />
                                            </td>
                                            <td style={{ padding: '4px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                                                <button type="button" onClick={() => removeRow(row.id)} disabled={rows.length <= 1} style={{ padding: '4px 8px', backgroundColor: rows.length <= 1 ? '#e5e7eb' : '#ef4444', color: rows.length <= 1 ? '#9ca3af' : 'white', border: 'none', borderRadius: '4px', cursor: rows.length <= 1 ? 'not-allowed' : 'pointer', fontSize: '12px' }}>{t('common.delete')}</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ marginTop: '12px', color: '#6b7280', fontSize: '13px' }}>{t('noi.bulkAddSummary', { count: rows.length })}</div>
                    </div>
                </div>
                <div className={styles.modalActions}>
                    <button className={styles.saveButton} onClick={handleSave} disabled={saving}>{saving ? t('noi.bulkAddSaving') : t('noi.bulkAddAction', { count: rows.length })}</button>
                    <button className={styles.cancelButton} onClick={onClose}>{t('common.cancel')}</button>
                </div>
            </div>
        </div>
    );
};
