import React from 'react';
import type { OSDDetailData } from './osdFormSchema';
import { val, SignCell } from '../Shared/PrintPrimitives';

/**
 * OSD (Over/Short/Damage Report) print report — bilingual, standalone sibling
 * of the OBS/NCR reports (records a receiving discrepancy; does not escalate
 * into an NCR). Styling lives in OSD.print.css (scoped under .osd-print-root).
 * The masthead is in the outer table's <thead> so it repeats on every printed
 * page.
 */
interface OSDPrintTemplateProps {
    data: OSDDetailData;
    defectPhotos?: string[];
    improvementPhotos?: string[];
}

const OSDPrintTemplate: React.FC<OSDPrintTemplateProps> = ({ data, defectPhotos = [], improvementPhotos = [] }) => {
    const hasPhotos = defectPhotos.length > 0 || improvementPhotos.length > 0;
    return (
        <div className="osd-print-root">
            <table className="osd-report">
                <thead>
                    <tr>
                        <th className="head-cell">
                            <div className="doc-head">
                                <div className="logo-box">LOGO</div>
                                <div className="head-mid">
                                    <div className="co">［ 公司名稱 Company Name ］</div>
                                    <div className="sub">品質管理 — 到貨短溢損記錄 ｜ Quality Management — Over/Short/Damage Record</div>
                                </div>
                                <div className="head-right">
                                    <div className="docno">{data.osdNumber || '(自動 auto)'}</div>
                                    <div>狀態 <span className="badge b-status">{(data.status || 'Open').toUpperCase()}</span></div>
                                </div>
                            </div>
                            <div className="title">到貨短溢損記錄<span className="en">OVER / SHORT / DAMAGE RECORD</span></div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="body-cell">
                            {/* ===== 1 到貨資訊 ===== */}
                            <div className="sec-head">1. 到貨資訊 <span className="en">Delivery Info</span></div>
                            <table>
                                <tbody>
                                    <tr>
                                        <td className="lbl">編號<small>OSD No.</small></td><td className="val">{val(data.osdNumber)}</td>
                                        <td className="lbl">承包商<small>Contractor</small></td><td className="val">{val(data.contractor)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">送貨單號<small>Delivery Note No.</small></td><td className="val">{val(data.deliveryNoteNo)}</td>
                                        <td className="lbl">採購單號<small>PO Number</small></td><td className="val">{val(data.poNumber)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">提出人<small>Raised By</small></td><td className="val">{val(data.raisedBy)}</td>
                                        <td className="lbl">開立日期<small>Raise Date</small></td><td className="val">{val(data.raiseDate)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">到期日<small>Due Date</small></td><td className="val" colSpan={3}>{val(data.dueDate)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* ===== 2 到貨明細 ===== */}
                            <div className="sec-head">2. 到貨明細 <span className="en">Delivery Detail</span></div>
                            <table>
                                <tbody>
                                    <tr>
                                        <td className="lbl">品項說明<small>Item Description</small></td><td className="val" colSpan={3}>{val(data.itemDescription)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">應收數量<small>Expected Qty</small></td><td className="val">{val(data.expectedQty)}</td>
                                        <td className="lbl">實收數量<small>Received Qty</small></td><td className="val">{val(data.receivedQty)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">單位<small>Unit</small></td><td className="val" colSpan={3}>{val(data.unit)}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <div className="sec-head sec-head-sub">短溢損說明 <span className="en">Discrepancy / Damage Description</span></div>
                            <div className="field-box fb-desc">{data.damageDescription || <span className="guide">（描述短少、溢收或損壞情形 Describe the shortage, overage, or damage）</span>}</div>

                            {/* ===== 3 收斂 ===== */}
                            <div className="sec-head">3. 收斂 <span className="en">Disposition &amp; Corrective Action</span></div>
                            <table>
                                <tbody>
                                    <tr>
                                        <td className="lbl">處置<small>Disposition</small></td><td className="val">{val(data.disposition)}</td>
                                        <td className="lbl">矯正措施負責人<small>CA Owner</small></td><td className="val">{val(data.correctiveActionOwner)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">矯正措施目標日<small>CA Target Date</small></td><td className="val">{val(data.correctiveActionTargetDate)}</td>
                                        <td className="lbl">解決人<small>Resolved By</small></td><td className="val">{val(data.resolvedBy)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">解決日期<small>Resolved Date</small></td><td className="val">{val(data.resolvedDate)}</td>
                                        <td className="lbl">結案日期<small>Closeout Date</small></td><td className="val">{val(data.closeoutDate)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">備註<small>Remark</small></td><td className="val" colSpan={3}>{val(data.remark)}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <div className="field-box fb-action">{data.correctiveAction || <span className="guide">（矯正措施說明 Corrective action taken）</span>}</div>

                            {/* ===== 4 結案簽核 ===== */}
                            <div className="sec-head">4. 結案簽核 <span className="en">Closure Sign-off</span></div>
                            <div className="sign-grid">
                                <SignCell num="4.1" zh="承包商" en="Contractor" />
                                <SignCell num="4.2" zh="開立人" en="Raised by" name={data.raisedBy} date={data.raiseDate} />
                            </div>

                            {/* ===== 照片 ===== */}
                            {hasPhotos && (
                                <>
                                    <div className="sec-head">5. 照片 <span className="en">Photos</span></div>
                                    <div className="photo-grid">
                                        <div>
                                            <div className="subhead">改善前 Before</div>
                                            {defectPhotos.length === 0
                                                ? <div className="field-box"><span className="guide">（無照片 No photos）</span></div>
                                                : defectPhotos.map((u, i) => (
                                                    <div key={i} className="photo-item" style={{ marginBottom: 8 }}>
                                                        <img src={u} alt={`before ${i + 1}`} />
                                                    </div>
                                                ))}
                                        </div>
                                        <div>
                                            <div className="subhead">改善後 After</div>
                                            {improvementPhotos.length === 0
                                                ? <div className="field-box"><span className="guide">（無照片 No photos）</span></div>
                                                : improvementPhotos.map((u, i) => (
                                                    <div key={i} className="photo-item" style={{ marginBottom: 8 }}>
                                                        <img src={u} alt={`after ${i + 1}`} />
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="foot">
                                <span>OSD 到貨短溢損記錄｜標準到貨異常記錄（本模組不升級為 NCR）</span>
                                <span>Over/Short/Damage Record — a standalone receiving-discrepancy record (does not escalate to an NCR)</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default OSDPrintTemplate;
