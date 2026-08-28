import React from 'react';
import styles from './Checklist.print.module.css';

interface ChecklistPrintTemplateProps {
    formData: any;
    displayNo: string;
}

// 補足空行邏輯 (A4 列印優化) — 使用者要求：Checklist List 列印時 空白欄只要1蘭就好
const paddingRows = [null];

const ChecklistPrintTemplate: React.FC<ChecklistPrintTemplateProps> = ({ formData, displayNo }) => {
    return (
        <div id="checklist-print-root" className={styles.printablePage}>
            <table className={styles.headerTable}>
                <tbody>
                    <tr>
                        <td className={styles.headerCompanyCol}>
                            <div className="font-bold text-lg">Qualitas</div>
                            <div className="text-[10px] leading-tight text-slate-500 uppercase">Construction Quality Control</div>
                        </td>
                        <td className={styles.headerTitleCol}>
                            <h2 className="text-xl font-black mb-1 uppercase">Field Inspection Checklist</h2>
                            <h3 className="text-sm font-bold text-slate-700 italic">{formData.activity || '[ Activity ]'}</h3>
                        </td>
                        <td className={styles.headerInfoCol}>
                            <div className={styles.headerInfoRow}>
                                <span className={styles.headerInfoLabel}>Doc No.</span>
                                <span className={styles.headerInfoValue}>{displayNo}</span>
                            </div>
                            <div className={styles.headerInfoRow}>
                                <span className={styles.headerInfoLabel}>Revision</span>
                                <span className={styles.headerInfoValue}>Rev.{formData.revision || '0'}</span>
                            </div>
                            <div className={styles.headerInfoRow}>
                                <span className={styles.headerInfoLabel}>Date</span>
                                <span className={styles.headerInfoValue}>{formData.inspectionDate}</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                    <div className={styles.infoLabel}>Project Title</div>
                    <div className={styles.infoValue}>
                        {formData.projectTitle}
                    </div>
                </div>
                <div className={styles.infoItem}>
                    <div className={styles.infoLabel}>ITR No.</div>
                    <div className={styles.infoValue}>
                        {formData.referenceNo}
                    </div>
                </div>

                <div className={styles.infoItem}>
                    <div className={styles.infoLabel}>NOI Number</div>
                    <div className={styles.infoValue}>
                        {formData.noiNumber}
                    </div>
                </div>

                <div className={styles.infoItem}>
                    <div className={styles.infoLabel}>Contractor</div>
                    <div className={styles.infoValue}>
                        {formData.contractor}
                    </div>
                </div>

                <div className={styles.infoItem}>
                    <div className={styles.infoLabel}>Insp. Date</div>
                    <div className={styles.infoValue}>
                        {formData.inspectionDate}
                    </div>
                </div>
                <div className={styles.infoItem}>
                    <div className={styles.infoLabel}>Location</div>
                    <div className={styles.infoValue}>
                        {formData.location}
                    </div>
                </div>
            </div>

            <table className={styles.itemsTable}>
                <thead>
                    <tr>
                        <th style={{ width: '40px' }}>#</th>
                        <th>Inspection Item</th>
                        <th>Criteria</th>
                        <th>Actual Situation</th>
                        <th style={{ width: '80px' }}>Result</th>
                    </tr>
                </thead>
                <tbody>
                    {formData.items.map((item: any, idx: number) => (
                        <tr key={idx}>
                            <td className="text-center">{item.id}</td>
                            <td className="font-bold">{item.item}</td>
                            <td>{item.criteria}</td>
                            <td>{item.situation}</td>
                            <td className="text-center">{item.result}</td>
                        </tr>
                    ))}
                    {paddingRows.map((_, idx) => (
                        <tr key={`pad-${idx}`} style={{ height: '32px' }}>
                            <td className="text-center"></td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td className="text-center text-slate-300">/</td>
                        </tr>
                    ))}
                    <tr>
                        <td colSpan={5} className="text-center font-bold">-END-</td>
                    </tr>
                </tbody>
            </table>

            <div className={styles.footerSection}>
                <div className={styles.statementBox}>
                    <div className="flex flex-col gap-2">
                        <label className="flex items-start gap-2">
                            <input type="checkbox" checked={formData.agreementChecked} readOnly className="mt-1" />
                            <span>All inspection has been done and meet the Drawings, Criteria, Standards.</span>
                        </label>
                        <label className="flex items-start gap-2">
                            <input type="checkbox" checked={!formData.agreementChecked} readOnly className="mt-1" />
                            <span>Unfinished improvement, fill in "Non-Conformity Report" to track improvement.</span>
                        </label>
                    </div>
                </div>

                <table className={styles.signatureTable} style={{ width: '100%', borderBottom: 'none' }}>
                    <tbody>
                        <tr>
                            <td className={styles.signatureLabelCell}>Re-inspection Date</td>
                            <td className={styles.signatureValueCell}>
                                <div className="text-center">{formData.agreementChecked ? 'N/A' : formData.reInspectionDate}</div>
                            </td>
                            <td className={styles.signatureLabelCell}>NCR No.</td>
                            <td className={styles.signatureValueCell}>
                                <div className="text-center">{formData.agreementChecked ? 'N/A' : formData.ncrNo}</div>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div className={styles.bottomLayout} style={{ marginTop: '-1pt' }}>
                    <div className={styles.remarkSection}>
                        <div className="font-bold mb-1">Remarks:</div>
                        <div className="text-xs">{formData.remarks}</div>
                    </div>

                    <table className={styles.signatureTable} style={{ width: '70%', borderLeft: 'none' }}>
                        <tbody>
                            <tr>
                                <td className={styles.signatureHeaderCell}>Site Engineer</td>
                                <td className={styles.signatureHeaderCell}>Construction Leader</td>
                            </tr>
                            <tr style={{ height: '60px' }}>
                                <td></td>
                                <td></td>
                            </tr>
                            <tr>
                                <td colSpan={2} className={styles.signatureHeaderCell}>Subcontractor Representative</td>
                            </tr>
                            <tr style={{ height: '60px' }}>
                                <td colSpan={2}></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div className={styles.watermark}>
                Generated by Qualitas Digital Inspection System
            </div>
        </div>
    );
};

export default ChecklistPrintTemplate;
