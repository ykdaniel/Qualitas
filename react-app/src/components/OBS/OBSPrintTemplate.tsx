import React from 'react';
import type { OBSDetailData } from './obsFormSchema';

/**
 * OBS (Observation) print report — bilingual, lightweight sibling of the NCR
 * report. Styling lives in OBS.print.css (scoped under .obs-print-root). The
 * masthead is in the outer table's <thead> so it repeats on every printed page.
 */
interface OBSPrintTemplateProps {
    data: OBSDetailData;
    defectPhotos?: string[];
    improvementPhotos?: string[];
}

const DASH = '—';
const val = (v?: string) => (v ? <>{v}</> : <span className="blank">{DASH}</span>);

const OBSPrintTemplate: React.FC<OBSPrintTemplateProps> = ({ data, defectPhotos = [], improvementPhotos = [] }) => {
    const hasPhotos = defectPhotos.length > 0 || improvementPhotos.length > 0;

    return (
        <div className="obs-print-root">
            <table className="obs-report">
                <thead>
                    <tr>
                        <th className="head-cell">
                            <div className="doc-head">
                                <div className="logo-box">LOGO</div>
                                <div className="head-mid">
                                    <div className="co">［ 公司名稱 Company Name ］</div>
                                    <div className="sub">品質管理 — 觀察記錄 ｜ Quality Management — Observation Record</div>
                                </div>
                                <div className="head-right">
                                    <div className="docno">{data.obsNumber || '(自動 auto)'}</div>
                                    <div>狀態 <span className="badge b-status">{(data.status || 'Open').toUpperCase()}</span></div>
                                </div>
                            </div>
                            <div className="title">觀察記錄<span className="en">OBSERVATION RECORD</span></div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="body-cell">
                            {/* ===== 1 觀察資訊 ===== */}
                            <div className="sec-head">1. 觀察資訊 <span className="en">Observation</span></div>
                            <table>
                                <tbody>
                                    <tr>
                                        <td className="lbl">編號<small>OBS No.</small></td><td className="val">{val(data.obsNumber)}</td>
                                        <td className="lbl">類型<small>Type</small></td><td className="val">{val(data.type)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">主旨<small>Subject</small></td><td className="val" colSpan={3}>{val(data.subject)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">承包商<small>Contractor</small></td><td className="val">{val(data.contractor)}</td>
                                        <td className="lbl">發現位置<small>Location</small></td><td className="val">{val(data.foundLocation)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">發現人<small>Found By</small></td><td className="val">{val(data.foundBy)}</td>
                                        <td className="lbl">提出人<small>Raised By</small></td><td className="val">{val(data.raisedBy)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">開立日期<small>Raise Date</small></td><td className="val">{val(data.raiseDate)}</td>
                                        <td className="lbl">到期日<small>Due Date</small></td><td className="val">{val(data.dueDate)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">結案日期<small>Closeout</small></td><td className="val">{val(data.closeoutDate)}</td>
                                        <td className="lbl">狀態<small>Status</small></td><td className="val">{val(data.status)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* ===== 2 觀察描述 ===== */}
                            <div className="sec-head">2. 觀察描述 <span className="en">Description</span></div>
                            <div className="field-box">{data.detailsDescription || <span className="guide">（描述觀察內容 Describe the observation）</span>}</div>

                            {/* ===== 3 處理方式（承攬商） ===== */}
                            <div className="sec-head">3. 處理方式 <span className="en">Action Taken (by Contractor)</span></div>
                            <div className="field-box">{data.productDisposition || <span className="guide">（由承攬商填寫處理方式 Action taken — by contractor）</span>}</div>

                            {data.remark && (<>
                                <div className="sec-head">備註 <span className="en">Remark</span></div>
                                <div className="field-box">{data.remark}</div>
                            </>)}

                            {/* ===== 照片 ===== */}
                            {hasPhotos && (
                                <>
                                    <div className="sec-head">4. 照片 <span className="en">Photos</span></div>
                                    <div className="photo-grid">
                                        <div>
                                            <div className="subhead">觀察照片 Observation</div>
                                            {defectPhotos.length === 0
                                                ? <div className="field-box"><span className="guide">（無照片 No photos）</span></div>
                                                : defectPhotos.map((u, i) => (
                                                    <div key={i} className="photo-item" style={{ marginBottom: 8 }}>
                                                        <img src={u} alt={`observation ${i + 1}`} />
                                                    </div>
                                                ))}
                                        </div>
                                        <div>
                                            <div className="subhead">改善照片 Improvement</div>
                                            {improvementPhotos.length === 0
                                                ? <div className="field-box"><span className="guide">（無照片 No photos）</span></div>
                                                : improvementPhotos.map((u, i) => (
                                                    <div key={i} className="photo-item" style={{ marginBottom: 8 }}>
                                                        <img src={u} alt={`improvement ${i + 1}`} />
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="foot">
                                <span>OBS 觀察記錄｜非正式不符合（如屬正式不符合請開立 NCR）</span>
                                <span>Observation — not a formal non-conformance (raise an NCR if it is)</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default OBSPrintTemplate;
