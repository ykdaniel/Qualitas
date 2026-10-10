import React from 'react';
import { val, SignCell } from '../Shared/PrintPrimitives';
import type { Attendee, DiscussionLogEntry } from '../../store/meetingMinutesStore';
import { displayNo, formatMinutesDate, isItem, normalizeDiscussionLog } from './discussionLog';

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
    meetingEndTime?: string;
    location?: string;
    organizer?: string;
}

interface MeetingMinutesPrintTemplateProps {
    data: MeetingMinutesPrintData;
    attendees?: Attendee[];
    discussionLog?: DiscussionLogEntry[];
    /** every stored attachment; the images among them are also printed on the landscape photo pages */
    attachmentFiles?: { name: string; url: string; isImage?: boolean }[];
}

const MeetingMinutesPrintTemplate: React.FC<MeetingMinutesPrintTemplateProps> = ({
    data, attendees = [], discussionLog = [], attachmentFiles = [],
}) => {
    const register = normalizeDiscussionLog(discussionLog);
    const timeRange = [data.meetingTime, data.meetingEndTime].filter(Boolean).join(' ~ ');
    const photos = attachmentFiles.filter(f => f.isImage);
    const photoPages: (typeof photos)[] = [];
    for (let i = 0; i < photos.length; i += 4) photoPages.push(photos.slice(i, i + 4));
    const docRef = `${data.documentNumber || ''}${data.rev ? ` (${data.rev})` : ''}`;
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
                            {/* ===== 1 基本資料：版面同公司會議記錄（SUBJECT / VENUE & TIME / RECORDED BY / Attendees） ===== */}
                            <div className="sec-head">1. 基本資料 <span className="en">Basic Information</span></div>
                            <table className="mom-header">
                                <tbody>
                                    <tr>
                                        <td className="lbl">主題<small>SUBJECT</small></td>
                                        <td className="val center" colSpan={4}>{val(data.title)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">日期／類型<small>DATE / TYPE</small></td>
                                        <td className="val center" colSpan={2}>{val([formatMinutesDate(data.meetingDate), data.meetingType].filter(Boolean).join('　'))}</td>
                                        <td className="lbl">廠商<small>CONTRACTOR</small></td>
                                        <td className="val center">{val(data.vendor)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl">地點與時間<small>VENUE &amp; TIME</small></td>
                                        <td className="val center" colSpan={2}>
                                            {val(data.location)}
                                            {timeRange && <div>{timeRange}</div>}
                                        </td>
                                        <td className="lbl">記錄人<small>RECORDED BY</small></td>
                                        <td className="val center">{val(data.organizer)}</td>
                                    </tr>
                                    <tr>
                                        <td className="lbl" rowSpan={Math.max(attendees.length, 1) + 1}>出席人員<small>ATTENDEES</small></td>
                                        <th>公司 Company</th>
                                        <th colSpan={2}>姓名 Name</th>
                                        <th>職稱 Position</th>
                                    </tr>
                                    {attendees.length === 0
                                        ? <tr><td colSpan={4}><span className="blank">（無資料 No attendees）</span></td></tr>
                                        : attendees.map((a, i) => (
                                            <tr key={i}>
                                                <td className="center">{val(a.company)}</td>
                                                <td className="center" colSpan={2}>{val(a.name)}</td>
                                                <td className="center">{val(a.role)}</td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>

                            {/* ===== 2/3 討論事項：# / DISCUSSIONS / ACTIONS / Action by / Target Date / Status ===== */}
                            <div className="sec-head">2. 討論事項 <span className="en">Discussions / Actions</span></div>
                            <table className="list-table register">
                                <tbody>
                                    <tr>
                                        <th style={{ width: '8%' }}>#</th>
                                        <th style={{ width: '62%', textAlign: 'center' }}>DISCUSSIONS / ACTIONS</th>
                                        <th style={{ width: '14%' }}>Action by</th>
                                        <th style={{ width: '16%' }}>Target Date / Status</th>
                                    </tr>
                                    {register.length === 0
                                        ? <tr><td colSpan={4}><span className="blank">（無資料 No discussion items）</span></td></tr>
                                        : register.map(e => isItem(e) ? (
                                            <tr key={e.no}>
                                                <td>{e.no}</td>
                                                <td>
                                                    {e.raisedDate && <div className="raised-date">{formatMinutesDate(e.raisedDate)}</div>}
                                                    <div style={{ whiteSpace: 'pre-wrap' }}>{val(e.content)}</div>
                                                    {(e.updates || []).map((u, i) => (
                                                        <div key={i} className={u.carried ? 'update carried' : 'update'}>
                                                            {u.date && <div className="update-date">{formatMinutesDate(u.date)}</div>}
                                                            <div className="update-text">{u.content}</div>
                                                        </div>
                                                    ))}
                                                </td>
                                                <td>{val(e.owner)}</td>
                                                <td>
                                                    {e.targetDate && <div>{formatMinutesDate(e.targetDate)}</div>}
                                                    <div>{e.status === 'Closed' ? 'Closed' : 'Open'}</div>
                                                </td>
                                            </tr>
                                        ) : (
                                            <tr key={e.no} className={e.kind === 'subcategory' ? 'sub-row' : 'cat-row'}>
                                                <td>{displayNo(e)}</td>
                                                <td>{e.content}</td>
                                                <td></td>
                                                <td></td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>

                            {/* ===== 3 附件 ===== */}
                            <div className="sec-head">3. 附件 <span className="en">Attachments</span></div>
                            <table>
                                <tbody>
                                    <tr><th className="lbl" style={{ width: 40, textAlign: 'left' }}>項次</th>
                                        <th className="lbl" style={{ textAlign: 'left' }}>檔名／編號 File / Ref.</th></tr>
                                    {attachmentFiles.length === 0
                                        ? <tr><td>1</td><td><span className="blank">（無附件 No attachments）</span></td></tr>
                                        : attachmentFiles.map((f, i) => (
                                            <tr key={i}>
                                                <td>{i + 1}</td>
                                                <td>
                                                    <a href={f.url} target="_blank" rel="noreferrer">{f.name}</a>
                                                    {f.isImage && <span className="blank">{'\u3000'}（照片 {photos.indexOf(f) + 1}，見照片附頁 See photo pages）</span>}
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>

                            {/* ===== 4 簽核 ===== */}
                            <div className="sec-head">4. 簽核 <span className="en">Sign-off</span></div>
                            <div className="sign-grid">
                                <SignCell num="4.1" zh="記錄人" en="Recorded By" name={data.organizer} date={formatMinutesDate(data.meetingDate)} />
                                <SignCell num="4.2" zh="廠商代表" en="Contractor Rep." name={data.vendor} />
                            </div>

                            <div className="foot">
                                <span>會議記錄｜一經發布不可修改，如需修正請建立新版次</span>
                                <span>Meeting Minutes — locked once Published; create a new occurrence to amend</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* Photo pages: landscape A4, four photos (2 × 2) per page — the rest of the minutes is portrait. */}
            {photoPages.map((group, pi) => (
                <div className="photo-page" key={pi}>
                    <div className="photo-head">
                        <span>照片 Photos — {docRef}</span>
                        <span>{pi + 1} / {photoPages.length}</span>
                    </div>
                    <div className="photo-grid-2x2">
                        {group.map((f, i) => (
                            <figure className="photo-cell" key={i}>
                                <img src={f.url} alt={f.name} />
                                <figcaption>照片 Photo {pi * 4 + i + 1}{'\u3000'}{f.name}</figcaption>
                            </figure>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default MeetingMinutesPrintTemplate;
