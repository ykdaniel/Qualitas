import React from 'react';
import { val, SignCell, DASH } from '../Shared/PrintPrimitives';

/**
 * Audit printouts (AUDIT-PRINT-2026-001) — the formal NCR-style layout, portal-mounted into <body> so @media print can show
 * it while #root is hidden (printing the wizard itself came out blank once another module's print CSS had been loaded,
 * since those hide #root unconditionally). Styling lives in Audit.print.css, scoped under .audit-print-root.
 *
 * - report:    the same seven sections, labels and values as the Word export (backend audit_service.export_docx) —
 *              keep the two in step. Section 4 is the agenda (AUDIT-AGENDA-2026-001).
 * - plan:      sections 1-4 of the report (information, team, scope & criteria, agenda) plus a plan sign-off.
 * - checklist: audit identity plus the items with blank result / remarks columns, for use on site.
 *
 * Prints what is on screen (the wizard's current form), unlike the Word export, which reads the saved record; unsaved
 * changes are flagged in the masthead.
 */
export type AuditPrintKind = 'report' | 'plan' | 'checklist';

export interface AuditPrintData {
    auditNo: string;
    status: string;
    title: string;
    projectLabel: string;
    contractor: string;
    startDate: string;
    endDate: string;
    location: string;
    projectDirector: string;
    techLead: string;
    leadAuditor: string;
    supportAuditors: string;
    auditCriteria: string;
    scopeDescription: string;
    selectedTemplates: unknown[];
    customCheckItems: unknown[];
    agenda: unknown[];
    findings: string;
}

interface AuditPrintTemplateProps {
    kind: AuditPrintKind;
    data: AuditPrintData;
    unsaved?: boolean;
}

const TITLES: Record<AuditPrintKind, [string, string]> = {
    report: ['內部稽核報告', 'INTERNAL AUDIT REPORT'],
    plan: ['內部稽核計畫', 'INTERNAL AUDIT PLAN'],
    checklist: ['稽核查檢表', 'AUDIT CHECKLIST'],
};
// Same wording as the Word export (_STATUS_TEXT / _RESULT_TEXT in audit_service.py).
const STATUS_TEXT: Record<string, string> = {
    'Draft': '草稿 Draft', 'Planned': '計畫中 Planned', 'In Progress': '進行中 In Progress',
    'Completed': '已完成 Completed', 'Closed': '已關閉 Closed', 'Void': '作廢 Void',
};
const RESULT_TEXT: Record<string, string> = { pass: '符合 Pass', fail: '不符合 Fail', pending: '注意／待改善 Attention' };

// Completion percent rounded half up in integers (12.5 -> 13): the wizard's statistics card, these printouts and the Word
// export all use this formula — Math.round(done / total * 100) gave 57 for 23 of 40 (the float is 57.4999...).
export const auditProgress = (total: number, pending: number) =>
    total === 0 ? 0 : Math.floor((200 * (total - pending) + total) / (2 * total));

type AgendaRow = { date?: unknown; start?: unknown; end?: unknown; item?: unknown; auditee?: unknown; auditor?: unknown; remarks?: unknown };

type CheckItem = { no?: unknown; clause?: unknown; task?: unknown; status?: unknown; note?: unknown; updatedAt?: unknown };

// Whitespace-only counts as empty, as in the Word export.
const clean = (v: unknown): string | undefined => {
    if (v === null || v === undefined) return undefined;
    const s = String(v);
    return s.trim() ? s : undefined;
};

const AuditPrintTemplate: React.FC<AuditPrintTemplateProps> = ({ kind, data, unsaved = false }) => {
    const items = data.customCheckItems.filter((i): i is CheckItem => !!i && typeof i === 'object' && !Array.isArray(i));
    const agenda = data.agenda.filter((a): a is AgendaRow => !!a && typeof a === 'object' && !Array.isArray(a));
    const templates = data.selectedTemplates.filter((t): t is string => typeof t === 'string' && !!t.trim());
    // Same counting as the wizard's statistics cards and the Word export: anything not pass / fail is pending.
    const total = items.length;
    const passed = items.filter(i => i.status === 'pass').length;
    const failed = items.filter(i => i.status === 'fail').length;
    const pending = total - passed - failed;
    const progress = auditProgress(total, pending);
    const resultText = (s: unknown) => RESULT_TEXT[typeof s === 'string' ? s : ''] || RESULT_TEXT.pending;
    const [titleZh, titleEn] = TITLES[kind];
    // Clause (bold) over the question; a single dash only when both are empty — the Word cell joins the two the same way.
    const questionCell = (item: CheckItem) => {
        const clause = clean(item.clause), task = clean(item.task);
        if (!clause && !task) return DASH;
        return <>{clause && <div className="clause">{clause}</div>}{task && <div>{task}</div>}</>;
    };

    const infoSection = (
        <>
            <div className="sec-head">1. 稽核資訊 <span className="en">Audit Information</span></div>
            <table>
                <tbody>
                    <tr>
                        <td className="lbl">稽核編號<small>Audit No.</small></td><td className="val">{val(clean(data.auditNo))}</td>
                        <td className="lbl">狀態<small>Status</small></td><td className="val">{val(STATUS_TEXT[data.status] || clean(data.status))}</td>
                    </tr>
                    <tr>
                        <td className="lbl">稽核標題<small>Audit Title</small></td><td className="val" colSpan={3}>{val(clean(data.title))}</td>
                    </tr>
                    <tr>
                        <td className="lbl">專案<small>Project</small></td><td className="val">{val(clean(data.projectLabel))}</td>
                        <td className="lbl">受稽核廠商<small>Auditee / Contractor</small></td><td className="val">{val(clean(data.contractor))}</td>
                    </tr>
                    <tr>
                        <td className="lbl">開始日期<small>Start Date</small></td><td className="val">{val(clean(data.startDate))}</td>
                        <td className="lbl">結束日期<small>End Date</small></td><td className="val">{val(clean(data.endDate))}</td>
                    </tr>
                    <tr>
                        <td className="lbl">稽核地點<small>Location</small></td><td className="val" colSpan={3}>{val(clean(data.location))}</td>
                    </tr>
                </tbody>
            </table>
        </>
    );

    const teamSection = (
        <>
            <div className="sec-head">2. 稽核團隊 <span className="en">Audit Team</span></div>
            <table>
                <tbody>
                    <tr>
                        <td className="lbl">專案經理<small>Project Director</small></td><td className="val">{val(clean(data.projectDirector))}</td>
                        <td className="lbl">工作包／技術負責人<small>Package / Tech. Lead</small></td><td className="val">{val(clean(data.techLead))}</td>
                    </tr>
                    <tr>
                        <td className="lbl">主任稽核員<small>Lead Auditor</small></td><td className="val">{val(clean(data.leadAuditor))}</td>
                        <td className="lbl">協同稽核員<small>Support Auditor(s)</small></td><td className="val">{val(clean(data.supportAuditors))}</td>
                    </tr>
                </tbody>
            </table>
        </>
    );

    const scopeSection = (
        <>
            <div className="sec-head">3. 稽核範圍與準則 <span className="en">Scope &amp; Criteria</span></div>
            <table>
                <tbody>
                    <tr>
                        <td className="lbl">稽核準則<small>Audit Criteria</small></td><td className="val" colSpan={3}>{val(clean(data.auditCriteria))}</td>
                    </tr>
                    <tr>
                        <td className="lbl">選用模板<small>Templates</small></td><td className="val" colSpan={3}>{val(clean(templates.join('、')))}</td>
                    </tr>
                </tbody>
            </table>
            <div className="sec-head sec-head-sub">3.1 範圍描述 <span className="en">Audit Scope</span></div>
            <div className="field-box">{clean(data.scopeDescription) || <span className="guide">說明本次稽核涵蓋之部門、流程、作業與地點</span>}</div>
        </>
    );

    // 4. Agenda — same columns and wording as the Word export; rows are already in time order
    const agendaSection = (
        <>
            <div className="sec-head">4. 稽核行程 <span className="en">Agenda</span></div>
            {agenda.length > 0 ? (
                <table className="items agenda-items">
                    <thead>
                        <tr>
                            <th className="a-date">日期<small>Date</small></th><th className="a-time">時間<small>Time</small></th>
                            <th className="a-item">稽核項目／流程<small>Audit Item / Process</small></th>
                            <th className="a-who">受稽核對象<small>Auditee</small></th><th className="a-aud">稽核員<small>Auditor</small></th>
                            <th className="a-rem">備註<small>Remarks</small></th>
                        </tr>
                    </thead>
                    <tbody>
                        {agenda.map((row, n) => {
                            const start = clean(row.start), end = clean(row.end);
                            return (
                                <tr key={n}>
                                    <td className="a-date">{clean(row.date) || DASH}</td>
                                    <td className="a-time">{start && end ? `${start}–${end}` : (start || end || DASH)}</td>
                                    <td className="a-item">{clean(row.item) || DASH}</td>
                                    <td className="a-who">{clean(row.auditee) || DASH}</td>
                                    <td className="a-aud">{clean(row.auditor) || DASH}</td>
                                    <td className="a-rem">{clean(row.remarks) || DASH}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            ) : (
                <div className="field-box"><span className="guide">（尚無行程 No agenda）</span></div>
            )}
        </>
    );

    return (
        <div className="audit-print-root" data-print-kind={kind}>
            <table className="audit-report">
                <thead>
                    <tr>
                        <th className="head-cell">
                            <div className="doc-head">
                                <div className="logo-box">LOGO</div>
                                <div className="head-mid">
                                    <div className="co">［ 公司名稱 Company Name ］</div>
                                    <div className="sub">品質管理 — Quality Management</div>
                                </div>
                                <div className="head-right">
                                    <div className="docno">{clean(data.auditNo) || '(自動 auto)'}</div>
                                    <div>版次 Rev：{DASH}</div>
                                    <div>狀態 <span className="badge b-status">{(data.status || '').toUpperCase() || DASH}</span></div>
                                    {unsaved && <div className="unsaved">含未儲存的修改 Unsaved changes</div>}
                                </div>
                            </div>
                            <div className="title">{titleZh}<span className="en">{titleEn}</span></div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="body-cell">
                            {kind === 'checklist' ? (
                                <>
                                    <div className="sec-head">1. 稽核資訊 <span className="en">Audit Information</span></div>
                                    <table>
                                        <tbody>
                                            <tr>
                                                <td className="lbl">稽核編號<small>Audit No.</small></td><td className="val">{val(clean(data.auditNo))}</td>
                                                <td className="lbl">專案<small>Project</small></td><td className="val">{val(clean(data.projectLabel))}</td>
                                            </tr>
                                            <tr>
                                                <td className="lbl">受稽核廠商<small>Auditee / Contractor</small></td><td className="val">{val(clean(data.contractor))}</td>
                                                <td className="lbl">稽核地點<small>Location</small></td><td className="val">{val(clean(data.location))}</td>
                                            </tr>
                                            <tr>
                                                <td className="lbl">稽核日期<small>Audit Date</small></td>
                                                <td className="val">{val([clean(data.startDate), clean(data.endDate)].filter(Boolean).join(' ~ ') || undefined)}</td>
                                                <td className="lbl">主任稽核員<small>Lead Auditor</small></td><td className="val">{val(clean(data.leadAuditor))}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <div className="sec-head">2. 查檢項目 <span className="en">Audit Items</span></div>
                                    {items.length > 0 ? (
                                        <table className="items checklist-items">
                                            <thead>
                                                <tr>
                                                    <th className="c-n">#</th><th className="c-no">條文編號<small>Clause No.</small></th>
                                                    <th className="c-q">條文與查檢重點<small>Clause &amp; Audit Question</small></th>
                                                    <th className="c-r">結果<small>Result</small></th><th className="c-m">備註<small>Remarks</small></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {items.map((item, n) => (
                                                    <tr key={n}>
                                                        <td className="c-n">{n + 1}</td>
                                                        <td className="c-no">{clean(item.no) || DASH}</td>
                                                        <td className="c-q">{questionCell(item)}</td>
                                                        <td className="c-r boxes"><div>☐ 符合 Pass</div><div>☐ 不符合 Fail</div><div>☐ 注意 Attention</div></td>
                                                        <td className="c-m" />
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="field-box"><span className="guide">（尚無查檢項目 No audit items）</span></div>
                                    )}
                                    <div className="sec-head">3. 簽核 <span className="en">Sign-off</span></div>
                                    <div className="sign-grid">
                                        <SignCell num="3.1" zh="主任稽核員" en="Lead Auditor" name={clean(data.leadAuditor)} />
                                        <SignCell num="3.2" zh="受稽核方代表" en="Auditee Representative" />
                                    </div>
                                </>
                            ) : (
                                <>
                                    {infoSection}
                                    {teamSection}
                                    {scopeSection}
                                    {agendaSection}
                                    {kind === 'report' ? (
                                        <>
                                            <div className="sec-head">5. 查檢結果 <span className="en">Checklist Results</span></div>
                                            <table>
                                                <tbody>
                                                    <tr>
                                                        <td className="lbl">查檢項目數<small>Total Items</small></td><td className="val">{total}</td>
                                                        <td className="lbl">完成率<small>Progress</small></td><td className="val">{progress}%</td>
                                                    </tr>
                                                    <tr>
                                                        <td className="lbl">符合<small>Pass</small></td><td className="val">{passed}</td>
                                                        <td className="lbl">不符合<small>Fail</small></td><td className="val">{failed}</td>
                                                    </tr>
                                                    <tr>
                                                        <td className="lbl">注意／待改善<small>Attention / Pending</small></td><td className="val" colSpan={3}>{pending}</td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                            <div className="sec-head sec-head-sub">5.1 查檢明細 <span className="en">Audit Items</span></div>
                                            {items.length > 0 ? (
                                                <table className="items">
                                                    <thead>
                                                        <tr>
                                                            <th className="c-n">#</th><th className="c-no">條文編號<small>Clause No.</small></th>
                                                            <th className="c-q">條文與查檢重點<small>Clause &amp; Audit Question</small></th>
                                                            <th className="c-r">結果<small>Result</small></th><th className="c-m">備註<small>Remarks</small></th>
                                                            <th className="c-d">更新日期<small>Updated</small></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {items.map((item, n) => (
                                                            <tr key={n}>
                                                                <td className="c-n">{n + 1}</td>
                                                                <td className="c-no">{clean(item.no) || DASH}</td>
                                                                <td className="c-q">{questionCell(item)}</td>
                                                                <td className="c-r">{resultText(item.status)}</td>
                                                                <td className="c-m">{clean(item.note) || DASH}</td>
                                                                <td className="c-d">{clean(item.updatedAt) || DASH}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <div className="field-box"><span className="guide">（尚無查檢項目 No audit items）</span></div>
                                            )}
                                            <div className="sec-head">6. 稽核發現與總結 <span className="en">Findings &amp; Summary</span></div>
                                            <div className="field-box fb-tall">{clean(data.findings) || <span className="guide">記錄稽核發現、不符合事項與總結</span>}</div>
                                            <div className="sec-head">7. 簽核 <span className="en">Sign-off</span></div>
                                            <div className="sign-grid three">
                                                <SignCell num="7.1" zh="主任稽核員" en="Lead Auditor" name={clean(data.leadAuditor)} />
                                                <SignCell num="7.2" zh="受稽核方代表" en="Auditee Representative" />
                                                <SignCell num="7.3" zh="專案經理" en="Project Director" name={clean(data.projectDirector)} />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="sec-head">5. 計畫簽核 <span className="en">Plan Sign-off</span></div>
                                            <div className="sign-grid">
                                                <SignCell num="5.1" zh="主任稽核員" en="Lead Auditor" name={clean(data.leadAuditor)} />
                                                <SignCell num="5.2" zh="專案經理" en="Project Director" name={clean(data.projectDirector)} />
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default AuditPrintTemplate;
