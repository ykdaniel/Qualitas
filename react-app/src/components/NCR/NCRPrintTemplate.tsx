import React from 'react';
import type { NCRDetailData } from './NCRModals';

/**
 * Formal NCR print report (BACKLOG #15) — bilingual (zh-Hant + en) template.
 * Styling lives in NCR.print.css (scoped under .ncr-print-root). The masthead is
 * in the outer table's <thead> so it repeats on every printed page. Company
 * header is a placeholder until Stage A branding lands.
 *
 * Fields not in the data model yet (traceability, impact, structured
 * requirement/as-found/deviation, root-cause method, owners, etc.) render as
 * blank/guided boxes — i.e. a form to be completed.
 */
interface NCRPrintTemplateProps {
    data: NCRDetailData;
    resolveUser: (id: number | null) => string;
    defectPhotos?: string[];
    improvementPhotos?: string[];
}

const DASH = '—';
const val = (v?: string) => (v ? <>{v}</> : <span className="blank">{DASH}</span>);

const FieldBox: React.FC<{ value?: string; guide?: string; tall?: boolean }> = ({ value, guide, tall }) => (
    <div className={tall ? 'field-box tall' : 'field-box'}>
        {value ? value : <span className="guide">{guide}</span>}
    </div>
);

const Chk: React.FC<{ on?: boolean; children: React.ReactNode }> = ({ on, children }) => (
    <div className="chk"><span className={on ? 'box on' : 'box'} />{children}</div>
);

const SignCell: React.FC<{ num: string; zh: string; en: string; name?: string; date?: string; req?: string }> = ({ num, zh, en, name, date, req }) => (
    <div className="sign-cell">
        <div className="role">{num} {zh} <span className="en">{en}</span> {req && <span className="req-tag">{req}</span>}</div>
        <div className="sign-line" />
        <div className="sign-meta">
            <span>姓名（職稱）：{name || '____________'}</span>
            <span style={{ textAlign: 'right' }}>日期：{date || '____________'}</span>
        </div>
        <div className="sign-meta"><span>單位 Company：____________</span></div>
    </div>
);

const PhotoColumn: React.FC<{ title: string; urls: string[] }> = ({ title, urls }) => (
    <div>
        <div className="subhead">{title}</div>
        {urls.length === 0
            ? <div className="field-box"><span className="guide">（無照片 No photos）</span></div>
            : urls.map((u, i) => (
                <div key={i} className="photo-item" style={{ marginBottom: 8 }}>
                    <img src={u} alt={`${title} ${i + 1}`} />
                </div>
            ))}
    </div>
);

const NCRPrintTemplate: React.FC<NCRPrintTemplateProps> = ({ data, resolveUser, defectPhotos = [], improvementPhotos = [] }) => {
    const disp = data.productDisposition;
    const sevText = data.severity === 'Major' ? 'MAJOR 重大' : data.severity === 'Minor' ? 'MINOR 輕微' : '';
    // Only print the 1.1 Traceability / 1.2 Impact blocks when they carry data,
    // so NCRs that don't use these formal-report fields print clean instead of
    // showing a wall of empty dashes. ITR/NOI is included so a linked NCR still
    // surfaces its references here.
    const hasTraceability = [
        data.drawingNo, data.specNo, data.poContract, data.wbs,
        data.lineNo, data.weldJointNo, data.heatBatchNo,
        data.itrNumber, data.noiNumber,
    ].some(Boolean);
    const hasImpact = [data.qtyAffected, data.extent, data.costScheduleImpact].some(Boolean);
    const hasPhotos = defectPhotos.length > 0 || improvementPhotos.length > 0;

    return (
        <div className="ncr-print-root">
            <table className="ncr-report">
                <thead>
                    <tr>
                        <th className="head-cell">
                            <div className="doc-head">
                                <div className="logo-box">LOGO</div>
                                <div className="head-mid">
                                    <div className="co">［ 公司名稱 Company Name ］</div>
                                    <div className="sub">品質管理 — 不符合報告　Quality Management — Non-Conformance Report</div>
                                </div>
                                <div className="head-right">
                                    <div className="docno">{data.ncrNumber || '(自動 auto)'}</div>
                                    <div>版次 Rev：{data.rev || DASH}</div>
                                    <div>狀態 <span className="badge b-status">{(data.status || 'Open').toUpperCase()}</span></div>
                                </div>
                            </div>
                            <div className="title">不符合報告<span className="en">NON-CONFORMANCE REPORT</span></div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="body-cell">

                            {/* ===== 1 細節 ===== */}
                            <div className="sec-head">1. 不符合細節 <span className="en">Non-Conformance Details</span></div>
                            <table>
                                <tbody>
                                    <tr>
                                        <td className="lbl">NCR 編號<small>NCR No.</small></td>
                                        <td className="val">{val(data.ncrNumber)}</td>
                                        <td className="lbl">嚴重度<small>Severity</small></td>
                                        <td className="val">{sevText ? <span className="badge b-sev">{sevText}</span> : <span className="blank">{DASH}</span>}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">主旨<small>Subject</small></td>
                                        <td className="val" colSpan={3}>{val(data.subject)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">承包商<small>Contractor</small></td>
                                        <td className="val">{val(data.contractor)}</td>
                                        <td className="lbl">專業類別<small>Discipline</small></td>
                                        <td className="val">{val(data.discipline)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">類型<small>Type</small></td>
                                        <td className="val">{val(data.type)}</td>
                                        <td className="lbl">發現位置<small>Found Location</small></td>
                                        <td className="val">{val(data.foundLocation)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">開立日期<small>Raise Date</small></td>
                                        <td className="val">{val(data.raiseDate)}</td>
                                        <td className="lbl">回覆期限<small>Response Due</small></td>
                                        <td className="val">{data.dueDate ? data.dueDate : <span className="blank">（開立+SLA，可自動帶）</span>}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">提出人<small>Raised By</small></td>
                                        <td className="val">{val(data.raisedBy)}</td>
                                        <td className="lbl">發現人<small>Found By</small></td>
                                        <td className="val">{val(data.foundBy)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            {hasTraceability && (<>
                            <div className="subhead">1.1 追溯資訊 <span className="en">Traceability</span></div>
                            <table>
                                <tbody>
                                    <tr>
                                        <td className="lbl">圖號<small>Drawing No.</small></td><td className="val">{val(data.drawingNo)}</td>
                                        <td className="lbl">規範號<small>Spec No.</small></td><td className="val">{val(data.specNo)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">PO／合約號<small>PO / Contract</small></td><td className="val">{val(data.poContract)}</td>
                                        <td className="lbl">WBS</td><td className="val">{val(data.wbs)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">管線編號<small>Line No.</small></td><td className="val">{val(data.lineNo)}</td>
                                        <td className="lbl">焊道編號<small>Weld / Joint No.</small></td><td className="val">{val(data.weldJointNo)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">材料爐號<small>Heat / Batch No.</small></td><td className="val">{val(data.heatBatchNo)}</td>
                                        <td className="lbl">ITR／NOI 編號<small>ITR / NOI No.</small></td><td className="val">{val([data.itrNumber, data.noiNumber].filter(Boolean).join(' / '))}</td>
                                    </tr>
                                </tbody>
                            </table>
                            </>)}

                            {hasImpact && (<>
                            <div className="subhead">1.2 影響範圍 <span className="en">Impact &amp; Extent</span></div>
                            <table className="three-col">
                                <tbody>
                                    <tr>
                                        <td className="lbl" style={{ width: 'auto' }}>受影響數量<small>Qty Affected</small></td>
                                        <td className="lbl" style={{ width: 'auto' }}>範圍<small>Isolated / Systemic</small></td>
                                        <td className="lbl" style={{ width: 'auto' }}>成本／工期影響<small>Cost / Schedule</small></td>
                                    </tr>
                                    <tr>
                                        <td className="val">{val(data.qtyAffected)}</td>
                                        <td className="val"><div className="chk-row">
                                            <Chk on={data.extent === 'Isolated'}>單一 Isolated</Chk>
                                            <Chk on={data.extent === 'Systemic'}>系統性 Systemic</Chk>
                                        </div></td>
                                        <td className="val">{val(data.costScheduleImpact)}</td>
                                    </tr>
                                </tbody>
                            </table>
                            </>)}

                            <div className="subhead">1.3 不符合描述 <span className="en">Description of Non-Conformance</span></div>
                            <table>
                                <tbody>
                                    <tr><td className="lbl" style={{ width: 96 }}>規範要求<small>Requirement</small></td>
                                        <td><FieldBox value={data.requirement} guide="說明圖面／規範／程序書要求為何" /></td></tr>
                                    <tr><td className="lbl">實際情況<small>As-Found</small></td>
                                        <td><FieldBox value={data.asFound || data.detailsDescription} guide="說明現場實際發現之情況，可附量測值" /></td></tr>
                                    <tr><td className="lbl">偏差說明<small>Deviation</small></td>
                                        <td><FieldBox value={data.deviation} guide="說明實況與要求之差異" /></td></tr>
                                </tbody>
                            </table>

                            {/* ===== 2 處置 ===== */}
                            <div className="sec-head">2. 處置 <span className="en">Disposition</span></div>
                            <div className="subhead">2.1 產品處置 <span className="en">Product Disposition</span></div>
                            <table>
                                <tbody>
                                    <tr><td style={{ padding: '5px 7px' }}>
                                        <div className="chk-row">
                                            <Chk on={disp === 'Use As Is'}>科用 Use As Is</Chk>
                                            <Chk on={disp === 'Rework'}>返工 Rework</Chk>
                                            <Chk on={disp === 'Repair'}>維修 Repair</Chk>
                                            <Chk on={disp === 'Reject'}>報廢 Reject / Scrap</Chk>
                                            <Chk>退回供應商 Return to Supplier</Chk>
                                            <Chk>降級 Regrade</Chk>
                                        </div>
                                        <div className="note-foot">※「科用／維修」屬技術變更，須填變更編號並取得工程／設計權責核可（見 6.3）。</div>
                                    </td></tr>
                                </tbody>
                            </table>
                            <table>
                                <tbody>
                                    <tr><td className="lbl" style={{ width: 120 }}>讓步／偏差核准編號<small>Concession / Deviation No.</small></td>
                                        <td className="val">{val(data.concessionNo)}</td></tr>
                                </tbody>
                            </table>
                            <div className="subhead">2.2 維修方法說明 <span className="en">Repair Method Statement</span></div>
                            <FieldBox value={data.repairMethodStatement} guide="若處置為維修，說明維修方法與驗收標準" tall />

                            {/* ===== 3 根因與矯正 ===== */}
                            <div className="sec-head">3. 根本原因與矯正措施 <span className="en">Root Cause &amp; Corrective Action</span></div>
                            <div className="subhead">3.1 立即處置 <span className="en">Immediate Correction</span></div>
                            <FieldBox value={data.immediateCorrectionAction} guide="為控制當前不符合所採取之立即措施" />

                            <div className="subhead">3.2 根因分析 <span className="en">Root Cause Analysis</span></div>
                            <table>
                                <tbody>
                                    <tr><td className="lbl" style={{ width: 96 }}>分析方法<small>Method</small></td>
                                        <td className="val"><div className="chk-row">
                                            <Chk on={data.rcaMethod === '5 Why'}>5 Why</Chk>
                                            <Chk on={data.rcaMethod === 'Fishbone'}>魚骨圖 Fishbone</Chk>
                                            <Chk on={!!data.rcaMethod && data.rcaMethod !== '5 Why' && data.rcaMethod !== 'Fishbone'}>其他 {data.rcaMethod && data.rcaMethod !== '5 Why' && data.rcaMethod !== 'Fishbone' ? data.rcaMethod : '____________'}</Chk>
                                        </div></td></tr>
                                    <tr><td className="lbl">直接原因<small>Direct Cause</small></td>
                                        <td><FieldBox value={data.directCause} guide="直接導致不符合之原因" /></td></tr>
                                    <tr><td className="lbl">系統性根因<small>Root Cause</small></td>
                                        <td><FieldBox value={data.rootCauseAnalysis} guide="制度／流程層面之根本原因" /></td></tr>
                                    <tr><td className="lbl">重複性<small>Recurrence</small></td>
                                        <td className="val"><div className="chk-row">
                                            <Chk on={data.recurrence === 'No'}>否 No</Chk>
                                            <Chk on={data.recurrence === 'Yes'}>是 Yes</Chk>
                                            <span style={{ alignSelf: 'center' }}>→ 關聯前次 NCR：{data.recurrenceRef || '____________'}</span>
                                        </div></td></tr>
                                </tbody>
                            </table>

                            <div className="subhead">3.3 矯正措施 <span className="en">Corrective Actions</span></div>
                            <table>
                                <tbody>
                                    <tr>
                                        <td style={{ width: '64%' }}><FieldBox value={data.correctiveActions} guide="消除根因之矯正措施" /></td>
                                        <td className="lbl" style={{ width: 'auto' }}>
                                            負責人<small>Owner</small>
                                            <div className="val" style={{ background: '#fff', minHeight: 16, margin: '2px 0 6px' }}>{val(data.correctiveActionOwner)}</div>
                                            目標完成日<small>Target Date</small>
                                            <div className="val" style={{ background: '#fff', minHeight: 16, marginTop: 2 }}>{val(data.correctiveActionTargetDate)}</div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            <div className="subhead">3.4 預防措施 <span className="en">Preventive Action</span></div>
                            <table>
                                <tbody>
                                    <tr>
                                        <td style={{ width: '64%' }}><FieldBox value={data.preventiveAction} guide="防止類似不符合再發之措施" /></td>
                                        <td className="lbl" style={{ width: 'auto' }}>
                                            負責人<small>Owner</small>
                                            <div className="val" style={{ background: '#fff', minHeight: 16, margin: '2px 0 6px' }}>{val(data.preventiveActionOwner)}</div>
                                            目標完成日<small>Target Date</small>
                                            <div className="val" style={{ background: '#fff', minHeight: 16, marginTop: 2 }}>{val(data.preventiveActionTargetDate)}</div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* ===== 4 附件 ===== */}
                            <div className="sec-head">4. 附件與證據 <span className="en">Attachments &amp; Evidence</span></div>
                            <table>
                                <tbody>
                                    <tr><th className="lbl" style={{ width: 40, textAlign: 'left' }}>項次</th>
                                        <th className="lbl" style={{ textAlign: 'left' }}>說明 Description</th>
                                        <th className="lbl" style={{ width: 120, textAlign: 'left' }}>檔名／編號 File / Ref.</th></tr>
                                    <tr><td>1</td><td><span className="blank">（照片／量測報告／ITR…）</span></td><td>&nbsp;</td></tr>
                                    <tr><td>2</td><td>&nbsp;</td><td>&nbsp;</td></tr>
                                </tbody>
                            </table>

                            {/* ===== 5 驗證與結案 ===== */}
                            <div className="sec-head">5. 驗證與結案 <span className="en">Verification &amp; Closure</span></div>
                            <div className="subhead">5.1 最終產品完整性聲明 <span className="en">Final Product Integrity Statement</span></div>
                            <FieldBox value={data.finalProductIntegrityStatement} guide="確認結案後產品符合預期用途之聲明" />
                            <table style={{ marginTop: 5 }}>
                                <tbody>
                                    <tr>
                                        <td className="lbl">有效性已驗證<small>Effectiveness Verified</small></td>
                                        <td className="val"><div className="chk-row">
                                            <Chk on={data.effectivenessVerified === 'Yes'}>是 Yes</Chk>
                                            <Chk on={data.effectivenessVerified === 'No'}>否 No</Chk>
                                        </div></td>
                                        <td className="lbl">結案日期<small>Closeout Date</small></td>
                                        <td className="val">{val(data.closeoutDate)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">複驗編號<small>Re-Inspection No.</small></td>
                                        <td className="val">{val(data.reInspectionNumber)}</td>
                                        <td className="lbl">有效性備註<small>Notes</small></td>
                                        <td className="val">{val(data.effectivenessNotes)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* ===== 6 簽核 ===== */}
                            <div className="sec-head">6. 簽核 <span className="en">Approvals</span></div>
                            <div className="sign-grid">
                                <SignCell num="6.1" zh="開立人" en="Raised by" name={data.raisedBy || data.foundBy} date={data.raiseDate} />
                                <SignCell num="6.2" zh="承包商回覆" en="Contractor Response" name={resolveUser(data.assignedTo) !== '-' ? resolveUser(data.assignedTo) : undefined} />
                                <SignCell num="6.3" zh="工程／設計權責核可" en="Engineering / Design Authority" req="［科用／維修必簽］" />
                                <SignCell num="6.4" zh="處置核可" en="Disposition Approved (PQM)" name={data.projectQualityManager} />
                                <SignCell num="6.5" zh="有效性驗證" en="Effectiveness Verified by (QA)" name={resolveUser(data.effectivenessVerifiedBy) !== '-' ? resolveUser(data.effectivenessVerifiedBy) : undefined} date={data.effectivenessVerifiedDate} />
                            </div>

                            {/* ===== Footer ===== */}
                            <div className="foot">
                                <div className="legend">
                                    <b>縮寫 Abbreviations</b>｜NCR 不符合報告｜ITR 檢驗紀錄表｜NOI 檢驗通知｜PQM 專案品質經理｜CA 矯正措施｜PA 預防措施
                                </div>
                            </div>
                            <table className="rev-table">
                                <tbody>
                                    <tr><th>版次 Rev</th><th>日期 Date</th><th>修訂說明 Description</th><th>核可 Approved</th></tr>
                                    <tr><td>{data.rev || DASH}</td><td>{data.raiseDate || DASH}</td><td>初版 Initial issue</td><td>&nbsp;</td></tr>
                                </tbody>
                            </table>

                            {/* ===== 7 照片頁 ===== */}
                            {hasPhotos && (
                                <div style={{ pageBreakBefore: 'always', breakBefore: 'page' }}>
                                    <div className="sec-head">7. 照片紀錄（改善前／後） <span className="en">Photographic Record (Before / After)</span></div>
                                    <div className="photo-grid">
                                        <PhotoColumn title="缺失（前）Defect (Before)" urls={defectPhotos} />
                                        <PhotoColumn title="改善（後）Improvement (After)" urls={improvementPhotos} />
                                    </div>
                                </div>
                            )}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default NCRPrintTemplate;
