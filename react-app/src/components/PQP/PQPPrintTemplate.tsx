import React from 'react';
import type { PQPItem, PQPHistoryItem } from '../../store/pqpStore';
import { val, SignCell } from '../Shared/PrintPrimitives';

/**
 * PQP (Pre-Qualification Package) print report — bilingual, lightweight
 * sibling of the NCR/OBS reports. Styling lives in PQP.print.css (scoped
 * under .pqp-print-root). The masthead is in the outer table's <thead> so
 * it repeats on every printed page.
 */
interface PQPPrintTemplateProps {
    data: PQPItem;
    history?: PQPHistoryItem[];
}

const PQPPrintTemplate: React.FC<PQPPrintTemplateProps> = ({ data, history = [] }) => {
    return (
        <div className="pqp-print-root">
            <table className="pqp-report">
                <thead>
                    <tr>
                        <th className="head-cell">
                            <div className="doc-head">
                                <div className="logo-box">LOGO</div>
                                <div className="head-mid">
                                    <div className="co">［ 公司名稱 Company Name ］</div>
                                    <div className="sub">品質管理 — 資格審查文件 ｜ Quality Management — Pre-Qualification Package</div>
                                </div>
                                <div className="head-right">
                                    <div className="docno">{data.pqpNo || '(自動 auto)'}</div>
                                    <div>狀態 <span className="badge b-status">{(data.status || 'Not Submit').toUpperCase()}</span></div>
                                </div>
                            </div>
                            <div className="title">資格審查文件<span className="en">PRE-QUALIFICATION PACKAGE</span></div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="body-cell">
                            {/* ===== 1 文件資訊 ===== */}
                            <div className="sec-head">1. 文件資訊 <span className="en">Document Info</span></div>
                            <table>
                                <tbody>
                                    <tr>
                                        <td className="lbl">編號<small>PQP No.</small></td><td className="val">{val(data.pqpNo)}</td>
                                        <td className="lbl">版本<small>Version</small></td><td className="val">{val(data.version)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">標題<small>Title</small></td><td className="val" colSpan={3}>{val(data.title)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">廠商<small>Vendor</small></td><td className="val">{val(data.vendor)}</td>
                                        <td className="lbl">狀態<small>Status</small></td><td className="val">{val(data.status)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">建立日期<small>Created</small></td><td className="val">{val(data.createdAt)}</td>
                                        <td className="lbl">更新日期<small>Updated</small></td><td className="val">{val(data.updatedAt)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* ===== 2 說明 ===== */}
                            <div className="sec-head">2. 說明 <span className="en">Description</span></div>
                            <div className="field-box fb-desc">{data.description || <span className="guide">（無說明 No description）</span>}</div>

                            {/* ===== 3 版本歷程 ===== */}
                            {history.length > 0 && (
                                <>
                                    <div className="sec-head">3. 版本歷程 <span className="en">Version History</span></div>
                                    <table>
                                        <thead>
                                            <tr>
                                                <td className="lbl">版本<small>Version</small></td>
                                                <td className="lbl">狀態<small>Status</small></td>
                                                <td className="lbl">變更摘要<small>Change Summary</small></td>
                                                <td className="lbl">日期<small>Date</small></td>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map((h) => (
                                                <tr key={h.id}>
                                                    <td className="val">{val(h.version)}</td>
                                                    <td className="val">{val(h.status || undefined)}</td>
                                                    <td className="val">{val(h.change_summary || undefined)}</td>
                                                    <td className="val">{val(h.created_at?.split('T')[0])}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </>
                            )}

                            {/* ===== 4 核准簽核 ===== */}
                            <div className="sec-head">4. 核准簽核 <span className="en">Approval Sign-off</span></div>
                            <div className="sign-grid">
                                <SignCell num="4.1" zh="廠商" en="Vendor" name={data.vendor} />
                                <SignCell num="4.2" zh="審查人" en="Reviewed by" />
                            </div>

                            <div className="foot">
                                <span>PQP 資格審查文件｜正式核准後如需修訂，請透過 Publish 建立新版本</span>
                                <span>Pre-Qualification Package — revisions after Approval must go through Publish</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default PQPPrintTemplate;
