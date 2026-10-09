import React from 'react';
import { val, SignCell } from '../Shared/PrintPrimitives';
import type { Attendee, DiscussionLogEntry } from '../../store/meetingMinutesStore';

/**
 * Meeting Minutes print report — bilingual, lightweight sibling of the
 * OBS/NCR reports. Styling lives in MeetingMinutes.print.css (scoped under
 * .mom-print-root). The masthead is in the outer table's <thead> so it
 * repeats on every printed page.
 */
interface MeetingMinutesPrintData {
    documentNumber?: string;
    rev?: string;
    status?: string;
    title?: string;
    vendor?: string;
    meetingType?: string;
    meetingDate?: string;
    meetingTime?: string;
    location?: string;
    organizer?: string;
}

interface MeetingMinutesPrintTemplateProps {
    data: MeetingMinutesPrintData;
    attendees?: Attendee[];
    discussionLog?: DiscussionLogEntry[];
    attachmentFiles?: { name: string; url: string }[];
}

const MeetingMinutesPrintTemplate: React.FC<MeetingMinutesPrintTemplateProps> = ({
    data, attendees = [], discussionLog = [], attachmentFiles = [],
}) => {
    return (
        <div className="mom-print-root">
            <table className="mom-report">
                <thead>
                    <tr>
                        <th className="head-cell">
                            <div className="doc-head">
                                <div className="logo-box">LOGO</div>
                                <div className="head-mid">
                                    <div className="co">［ 公司名稱 Company Name ］</div>
                                    <div className="sub">品質管理 — 會議記錄 ｜ Quality Management — Meeting Minutes</div>
                                </div>
                                <div className="head-right">
                                    <div className="docno">{data.documentNumber || '(自動 auto)'}{data.rev ? ` (${data.rev})` : ''}</div>
                                    <div>狀態 <span className="badge b-status">{(data.status || 'Draft').toUpperCase()}</span></div>
                                </div>
                            </div>
                            <div className="title">會議記錄<span className="en">MEETING MINUTES</span></div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="body-cell">
                            {/* ===== 1 基本資料 ===== */}
                            <div className="sec-head">1. 基本資料 <span className="en">Basic Information</span></div>
                            <table>
                                <tbody>
                                    <tr>
                                        <td className="lbl">主旨<small>Title</small></td><td className="val" colSpan={3}>{val(data.title)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">廠商<small>Contractor</small></td><td className="val">{val(data.vendor)}</td>
                                        <td className="lbl">會議類型<small>Meeting Type</small></td><td className="val">{val(data.meetingType)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">會議日期<small>Date</small></td><td className="val">{val(data.meetingDate)}</td>
                                        <td className="lbl">時間<small>Time</small></td><td className="val">{val(data.meetingTime)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">地點<small>Location</small></td><td className="val">{val(data.location)}</td>
                                        <td className="lbl">主持人<small>Organizer</small></td><td className="val">{val(data.organizer)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* ===== 2 出席人員 ===== */}
                            <div className="sec-head">2. 出席人員 <span className="en">Attendees</span></div>
                            <table className="list-table">
                                <tbody>
                                    <tr><th style={{ width: '34%' }}>姓名 Name</th><th style={{ width: '33%' }}>公司 Company</th><th>職稱／角色 Role</th></tr>
                                    {attendees.length === 0
                                        ? <tr><td colSpan={3}><span className="blank">（無資料 No attendees）</span></td></tr>
                                        : attendees.map((a, i) => (
                                            <tr key={i}>
                                                <td>{val(a.name)}</td>
                                                <td>{val(a.company)}</td>
                                                <td>{val(a.role)}</td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>

                            {/* ===== 3 討論與決議 ===== */}
                            <div className="sec-head">3. 討論與決議 <span className="en">Discussion &amp; Decisions</span></div>
                            <table className="list-table">
                                <tbody>
                                    <tr>
                                        <th style={{ width: '6%' }}>項次 No.</th>
                                        <th style={{ width: '76%' }}>議題討論 Topic / Discussion</th>
                                        <th style={{ width: '10%' }}>負責人<span className="en">Owner</span></th>
                                        <th style={{ width: '8%' }}>狀態<span className="en">Status</span></th>
                                    </tr>
                                    {discussionLog.length === 0
                                        ? <tr><td colSpan={4}><span className="blank">（無資料 No discussion items）</span></td></tr>
                                        : discussionLog.filter(d => (d.level ?? 0) === 0).map((major) => {
                                            const subs = discussionLog.filter(d => d.level === 1 && d.no.startsWith(`${major.no}.`));
                                            const openSubs = subs.filter(d => d.status !== 'Closed');
                                            const closedSubs = subs.filter(d => d.status === 'Closed');
                                            return (
                                                <React.Fragment key={major.no}>
                                                    <tr>
                                                        <td colSpan={4} className="topic-row">{major.no}. {major.content || [major.topic, major.discussion, major.decision].filter(Boolean).join(' / ')}</td>
                                                    </tr>
                                                    {[...openSubs, ...closedSubs].map(sub => (
                                                        <tr key={sub.no}>
                                                            <td>{val(sub.no)}</td>
                                                            <td style={{ whiteSpace: 'pre-wrap' }}>{val(sub.content)}</td>
                                                            <td>{val(sub.owner)}</td>
                                                            <td>{sub.status === 'Closed' ? '已完成 Closed' : '待辦 Open'}</td>
                                                        </tr>
                                                    ))}
                                                    {subs.length === 0 && (
                                                        <tr><td colSpan={4}><span className="blank">（無次項目 No sub-items）</span></td></tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                </tbody>
                            </table>

                            {/* ===== 4 附件 ===== */}
                            <div className="sec-head">4. 附件 <span className="en">Attachments</span></div>
                            <table>
                                <tbody>
                                    <tr><th className="lbl" style={{ width: 40, textAlign: 'left' }}>項次</th>
                                        <th className="lbl" style={{ textAlign: 'left' }}>檔名／編號 File / Ref.</th></tr>
                                    {attachmentFiles.length === 0
                                        ? <tr><td>1</td><td><span className="blank">（無附件 No attachments）</span></td></tr>
                                        : attachmentFiles.map((f, i) => (
                                            <tr key={i}>
                                                <td>{i + 1}</td>
                                                <td><a href={f.url} target="_blank" rel="noreferrer">{f.name}</a></td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>

                            {/* ===== 5 簽核 ===== */}
                            <div className="sec-head">5. 簽核 <span className="en">Sign-off</span></div>
                            <div className="sign-grid">
                                <SignCell num="5.1" zh="主持人" en="Organizer" name={data.organizer} date={data.meetingDate} />
                                <SignCell num="5.2" zh="廠商代表" en="Contractor Rep." name={data.vendor} />
                            </div>

                            <div className="foot">
                                <span>會議記錄｜一經發布不可修改，如需修正請建立新版次</span>
                                <span>Meeting Minutes — locked once Published; create a new occurrence to amend</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default MeetingMinutesPrintTemplate;
