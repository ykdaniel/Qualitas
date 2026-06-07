import React from 'react';
import type { FATItem, FATDetailItem, FATResult } from '../../store/fatStore';

/**
 * FAT (Factory Acceptance Test) print report — bilingual. Styling in
 * FAT.print.css (scoped under .fat-print-root). Masthead in the outer table's
 * <thead> repeats on every printed page. The overall result is derived from the
 * item judgments (passed in via `result`).
 */
interface FATPrintTemplateProps {
    fat: FATItem;
    details: FATDetailItem[];
    result: FATResult;
}

const DASH = '—';
const val = (v?: string) => (v ? <>{v}</> : <span className="blank">{DASH}</span>);

const FATPrintTemplate: React.FC<FATPrintTemplateProps> = ({ fat, details, result }) => {
    const resultBadge =
        result === 'Pass' ? <span className="badge b-pass">PASS 通過</span>
            : result === 'Fail' ? <span className="badge b-fail">FAIL 不通過</span>
                : <span className="badge b-pending">PENDING 尚未完成</span>;

    return (
        <div className="fat-print-root">
            <table className="fat-report">
                <thead>
                    <tr>
                        <th className="head-cell">
                            <div className="doc-head">
                                <div className="logo-box">LOGO</div>
                                <div className="head-mid">
                                    <div className="co">［ 公司名稱 Company Name ］</div>
                                    <div className="sub">品質管理 — 工廠驗收測試 ｜ Quality Management — Factory Acceptance Test</div>
                                </div>
                                <div className="head-right">
                                    <div className="docno">{fat.equipment || '(設備 equipment)'}</div>
                                    <div>狀態 <span className="badge b-status">{(fat.status || 'Scheduled').toUpperCase()}</span></div>
                                    <div style={{ marginTop: 2 }}>結果 {resultBadge}</div>
                                </div>
                            </div>
                            <div className="title">工廠驗收測試報告<span className="en">FACTORY ACCEPTANCE TEST</span></div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="body-cell">
                            {/* ===== 1 基本資訊 ===== */}
                            <div className="sec-head">1. 基本資訊 <span className="en">Information</span></div>
                            <table>
                                <tbody>
                                    <tr>
                                        <td className="lbl">設備<small>Equipment</small></td><td className="val">{val(fat.equipment)}</td>
                                        <td className="lbl">供應商<small>Supplier</small></td><td className="val">{val(fat.supplier)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">程序<small>Procedure</small></td><td className="val">{val(fat.procedure)}</td>
                                        <td className="lbl">地點<small>Location</small></td><td className="val">{val(fat.location)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">開始日期<small>Start Date</small></td><td className="val">{val(fat.startDate)}</td>
                                        <td className="lbl">結束日期<small>End Date</small></td><td className="val">{val(fat.endDate)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">交付自<small>Delivery From</small></td><td className="val">{val(fat.deliveryFrom)}</td>
                                        <td className="lbl">交付至<small>Delivery To</small></td><td className="val">{val(fat.deliveryTo)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">場地準備<small>Site Readiness</small></td><td className="val">{val(fat.siteReadiness)}</td>
                                        <td className="lbl">進場日期<small>Move-in Date</small></td><td className="val">{val(fat.moveInDate)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">狀態<small>Status</small></td><td className="val">{val(fat.status)}</td>
                                        <td className="lbl">整體結果<small>Overall Result</small></td><td className="val">{resultBadge}</td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* ===== 2 驗收項目 ===== */}
                            <div className="sec-head">2. 驗收項目 <span className="en">Acceptance Items</span></div>
                            <table className="items">
                                <thead>
                                    <tr>
                                        <th>S/No</th>
                                        <th>項目 Item</th>
                                        <th>規格 Spec.</th>
                                        <th>數量 Qty</th>
                                        <th>單位 Unit</th>
                                        <th>驗收標準 Acceptance Criteria</th>
                                        <th>實測值 Actual</th>
                                        <th>判定 Judgment</th>
                                        <th>備註 Remarks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {details.length === 0 ? (
                                        <tr><td colSpan={9}><span className="blank">（無項目 No items）</span></td></tr>
                                    ) : details.map((d) => (
                                        <tr key={d.id}>
                                            <td>{val(d.sNo)}</td>
                                            <td>{val(d.itemName)}</td>
                                            <td>{val(d.specification)}</td>
                                            <td>{val(d.qty)}</td>
                                            <td>{val(d.unit)}</td>
                                            <td>{val(d.acceptanceCriteria)}</td>
                                            <td>{val(d.fatActualValue)}</td>
                                            <td className={d.fatJudgment === 'Pass' ? 'j-pass' : d.fatJudgment === 'Fail' ? 'j-fail' : ''}>{val(d.fatJudgment)}</td>
                                            <td>{val(d.remarks)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="foot">
                                <span>整體結果由各驗收項目的判定自動彙整（任一不通過即不通過）。</span>
                                <span>Overall result is aggregated from item judgments (any Fail → Fail).</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default FATPrintTemplate;
