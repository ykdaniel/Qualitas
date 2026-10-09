import React from 'react';
import type { ApprovedMaterial } from '../../services/materialApi';
import { val } from '../Shared/PrintPrimitives';

/**
 * Approved-material print record (MATERIAL-SUBMITTAL M6) — bilingual, built like the OSD / OBS / NCR reports. Styling lives in
 * Material.print.css (scoped under .msa-print-root). Portal-mounted into <body> while printing; the masthead sits in the outer
 * table's <thead> so it repeats on every printed page.
 */
const RESULT_LABEL: Record<string, string> = { Approved: '核准 Approved', ApprovedWithComments: '附意見核准 Approved with comments' };

const MaterialPrintTemplate: React.FC<{ item: ApprovedMaterial; photos: { url: string; name: string }[] }> = ({ item, photos }) => (
    <div className="msa-print-root">
        <table className="msa-report">
            <thead>
                <tr>
                    <th className="head-cell">
                        <div className="doc-head">
                            <div className="logo-box">LOGO</div>
                            <div className="head-mid">
                                <div className="co">［ 公司名稱 Company Name ］</div>
                                <div className="sub">品質管理 — 核准材料記錄 ｜ Quality Management — Approved Material Record</div>
                            </div>
                            <div className="head-right">
                                <div className="docno">{item.documentNumber}</div>
                                <div><span className="badge b-status">{RESULT_LABEL[item.result] ?? item.result}</span></div>
                            </div>
                        </div>
                        <div className="title">核准材料記錄<span className="en">APPROVED MATERIAL RECORD</span></div>
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td className="body-cell">
                        <div className="sec-head">1. 核准資訊 <span className="en">Approval</span></div>
                        <table>
                            <tbody>
                                <tr>
                                    <td className="lbl">參考編號<small>Reference No.</small></td><td className="val">{val(item.documentNumber)}</td>
                                    <td className="lbl">核准結果<small>Result</small></td><td className="val">{RESULT_LABEL[item.result] ?? item.result}</td>
                                </tr>
                                <tr>
                                    <td className="lbl">核准日<small>Approved On</small></td><td className="val">{val(item.approvedDate ?? undefined)}</td>
                                    <td className="lbl">核准者<small>Approved By</small></td><td className="val">{val(item.decisionMaker ?? undefined)}</td>
                                </tr>
                                <tr>
                                    <td className="lbl">外部核准文號<small>Approval No.</small></td><td className="val">{val(item.externalDocNo ?? undefined)}</td>
                                    <td className="lbl">承包商<small>Contractor</small></td><td className="val">{val(item.vendorName ?? undefined)}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div className="sec-head">2. 材料資料 <span className="en">Material</span></div>
                        <table>
                            <tbody>
                                <tr>
                                    <td className="lbl">材料<small>Material</small></td><td className="val">{val(item.name ?? undefined)}</td>
                                    <td className="lbl">分類<small>Category</small></td><td className="val">{val(item.category ?? undefined)}</td>
                                </tr>
                                <tr>
                                    <td className="lbl">廠牌<small>Brand</small></td><td className="val">{val(item.brand ?? undefined)}</td>
                                    <td className="lbl">型號<small>Model</small></td><td className="val">{val(item.model ?? undefined)}</td>
                                </tr>
                                <tr>
                                    <td className="lbl">規格<small>Specification</small></td><td className="val">{val(item.specification ?? undefined)}</td>
                                    <td className="lbl">製造商<small>Manufacturer</small></td><td className="val">{val(item.manufacturer ?? undefined)}</td>
                                </tr>
                                <tr>
                                    <td className="lbl">供應商<small>Supplier</small></td><td className="val" colSpan={3}>{val(item.supplier ?? undefined)}</td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="sec-head sec-head-sub">依據 <span className="en">Basis (spec section, drawing, contract clause)</span></div>
                        <div className="field-box">{item.specReference || <span className="guide">（無 None）</span>}</div>

                        <div className="sec-head">3. 材料照片 <span className="en">Material Photos</span></div>
                        {photos.length === 0
                            ? <div className="field-box"><span className="guide">（無照片 No photos）</span></div>
                            : (
                                <div className="photo-grid">
                                    {photos.map((p, i) => (
                                        <div key={i} className="photo-item">
                                            <img src={p.url} alt={p.name} />
                                            <div className="photo-name">{p.name}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                        <div className="foot">
                            <span>核准材料記錄｜只登錄已由業主或顧問核准的材料</span>
                            <span>Approved Material Record — registers only materials approved by the owner or consultant</span>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
);

export default MaterialPrintTemplate;
