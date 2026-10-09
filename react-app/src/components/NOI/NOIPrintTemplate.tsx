import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { getAuthenticatedFileUrl } from '../../services/api';
import { formatTime24h } from '../../utils/formatters';
import type { NOIItem } from '../../store/noiStore';
import styles from './NOI.print.module.css';

interface NOIPrintTemplateProps {
    groupedByContractor: Record<string, NOIItem[]>;
}

const NOIPrintTemplate: React.FC<NOIPrintTemplateProps> = ({ groupedByContractor }) => {
    const { t } = useLanguage();

    return (
        <div id="noi-batch-print-root" className={styles.noiBatchPrintRoot}>
            {Object.entries(groupedByContractor).map(([contractor, items], pageIndex) => (
                <div
                    key={contractor}
                    className={styles.noiBatchPrintPage}
                    style={pageIndex > 0 ? { pageBreakBefore: 'always' } : undefined}
                >
                    <div className={styles.noiBatchPrintTitle}>
                        <h1>批次檢驗通知 (NOI)</h1>
                        {/* BACKLOG #25 (2026-10-06): was `toLocaleDateString('zh-TW')` →
                            "2026/2/6", the only place in the app using that format — every
                            other date display uses the YYYY-MM-DD convention. Built from local
                            date parts (not `toISOString()`) to avoid a UTC-shift day boundary
                            bug, same pattern already used elsewhere (e.g. OBSModals.tsx's
                            approval-date stamping). */}
                        <p>列印日期：{(() => {
                            const d = new Date();
                            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        })()}</p>
                    </div>

                    <div className={styles.noiBatchPrintCommon}>
                        <div className={styles.noiBatchPrintGrid}>
                            <div className={styles.noiBatchPrintField}>
                                <label>承包商</label>
                                <div className={styles.noiBatchPrintValue}>{contractor}</div>
                            </div>
                            <div className={styles.noiBatchPrintField}>
                                <label>發出日期 (Issue Date)</label>
                                <div className={styles.noiBatchPrintValue}>{items[0]?.issueDate ?? '-'}</div>
                            </div>
                            <div className={styles.noiBatchPrintField}>
                                <label>檢驗日期 (Inspection Date)</label>
                                <div className={styles.noiBatchPrintValue}>{items[0]?.inspectionDate ?? '-'}</div>
                            </div>
                            <div className={styles.noiBatchPrintField}>
                                <label>聯絡人</label>
                                <div className={styles.noiBatchPrintValue}>{items[0]?.contacts ?? '-'}</div>
                            </div>
                            <div className={styles.noiBatchPrintField}>
                                <label>電話</label>
                                <div className={styles.noiBatchPrintValue}>{items[0]?.phone ?? '-'}</div>
                            </div>
                            <div className={styles.noiBatchPrintField}>
                                <label>Email</label>
                                <div className={styles.noiBatchPrintValue}>{items[0]?.email ?? '-'}</div>
                            </div>
                        </div>
                    </div>

                    <div className={styles.noiBatchPrintList}>
                        <h3>各筆 NOI 資料</h3>
                        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>共 {items.length} 筆</p>
                        <table className={styles.noiBatchPrintListTable}>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Subject</th>
                                    <th>ITP no.</th>
                                    <th>Event #</th>
                                    <th>Checkpoint</th>
                                    <th>檢驗時間</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((noi, index) => (
                                    <tr key={noi.id}>
                                        <td>{index + 1}</td>
                                        <td>{noi.package}</td>
                                        <td>{noi.itpNo}</td>
                                        <td>{noi.eventNumber ?? '-'}</td>
                                        <td>{noi.checkpoint ?? '-'}</td>
                                        <td>{formatTime24h(noi.inspectionTime)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {items.some(n => n.attachments && n.attachments.length > 0) && (
                        <div className={styles.noiBatchPrintPhotoSection}>
                            <h3>{t('itp.selfInspection.attachments')} (Photo Record)</h3>
                            <div className={styles.noiBatchPrintPhotoGrid}>
                                {items.flatMap(n =>
                                    (n.attachments || []).map((img, imgIdx) => ({
                                        img,
                                        label: `${n.package} - #${imgIdx + 1}`,
                                    }))
                                ).map((item, idx) => (
                                    <div key={idx} className={styles.noiBatchPrintPhotoItem}>
                                        <img src={getAuthenticatedFileUrl(typeof item.img === 'string' ? item.img : item.img.file_url)} alt={item.label} className={styles.noiBatchPrintPhoto} />
                                        <div className={styles.noiBatchPrintPhotoLabel}>{item.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default NOIPrintTemplate;
