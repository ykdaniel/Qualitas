"""Isolated TEST / PREVIEW SEED SCRIPT for MEETING-TABS-2026-001 (2026-10-11) — writes test fixtures to an isolated
database; it is a seed script, not a read-only script.

Isolated stack only. Requires MTG_TABS_REVIEW_PASSWORD in the environment (no hardcoded or defaulted password).

Creates one contractor, a reviewer (Meeting Minutes view / create / update / delete, Follow Up view / create) and three meetings
the user can look at in the new tabbed form:
  * MOM-DEMO-001 rev 1.0 "Weekly 110 (legacy format)" — Draft, discussion register in the OLD two-level shape (no
    `kind`, level 0 topics / level 1 sub-items, one Closed), as meetings saved before this task are stored. Opening
    and saving it writes it back in the new shape.
  * MOM-DEMO-002 rev 1.0 "Meeting Minutes - 111" — Published, laid out like the company's minutes: 1.0 Technical
    Issues > 1.1 Civil OB > 1.1.1 safety-lifeline item (raised 14 Jul, Open, with a dated progress update) and 1.1.2 (Closed),
    2.0 Safety > 2.1 item (Open), attendees by Company / Name / Position, venue, 15:00 ~ 17:15, recorded by.
    "New Occurrence" on it shows the carry-forward of unfinished items.
  * MOM-DEMO-003 rev 1.0 "Monthly (legacy, published)" — Published, old two-level shape: how locked legacy records read.
"""
import os
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import json
import uuid
from datetime import datetime

import database, models
from core.security import get_password_hash

PW = os.environ.get("MTG_TABS_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("MTG_TABS_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _perm(code):
    p = d.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        d.add(p)
        d.flush()
    return p


role = models.Role(name="MeetingTabsReview")
role.permissions_rel = [_perm(c) for c in ("meeting:view:all", "meeting:create:all", "meeting:update:all", "meeting:delete:all",
                                            "followup:view:all", "followup:create:all", "contractors:view:all",
                                            "iam:user:view")]
d.add(role)
d.flush()
d.add(models.User(username="mtg_reviewer", email="mtg.reviewer@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=role.id, full_name="Daniel Huang"))
d.add(models.Contractor(id="MTB-V1", name="Hailong Construction", abbreviation="HL", status="active"))
d.flush()

ATTENDEES = [
    {"company": "TECO", "name": "陳韋向(Mac Chen)", "role": "Project Manager & Contract Manager"},
    {"company": "TECO", "name": "曾耀葦(Toby Tseng)", "role": "QAQC Manager"},
    {"company": "TECO", "name": "謝明倫(ML Hsieh)", "role": "Site Manager"},
    {"company": "HL", "name": "Breeze Yeh", "role": "PM"},
    {"company": "HL", "name": "Daniel Huang", "role": "Quality Manager"},
    {"company": "HL", "name": "Dennis Luo", "role": "MEP Engineer"},
]
LEGACY = [
    {"no": "1", "level": 0, "content": "技術議題 Technical Issues"},
    {"no": "1.1", "level": 1, "content": "CVL-00198 屋頂排水坡度不足，請 TECO 提送修正圖。", "owner": "TECO", "status": "Open"},
    {"no": "1.2", "level": 1, "content": "CVL-00201 已完成複測。", "owner": "HL", "status": "Closed"},
    {"no": "2", "level": 0, "content": "安全議題 Safety"},
    {"no": "2.1", "level": 1, "content": "高架作業平台每日點檢紀錄缺漏。", "owner": "HL - Breeze", "status": "Open"},
]
REGISTER = [
    {"no": "1", "kind": "category", "level": 0, "content": "技術議題 Technical Issues"},
    {"no": "1.1", "kind": "subcategory", "level": 1, "content": "土木觀察事項 Civil OB"},
    {"no": "1.1.1", "kind": "item", "level": 2, "owner": "TECO", "targetDate": "2026-08-15", "status": "Open", "raisedDate": "2026-07-14",
     "content": "CVL-00209_ONS 屋頂之安全母索缺少相關設計文件及合格／認證證明。業主要求 TECO 提供安全母索相關材料證明文件 (Hailong - Voon)\n"
                "The safety lifeline on the ONS roof lacks the relevant design documentation and qualification/certification proof. "
                "The Employer requested that TECO provide material certification documents for the safety lifeline. (Raised by Hailong - Voon)",
     "updates": [{"date": "2026-07-21", "content": "補充相關圖號為 HL-ONS-TECO-STR-DWG-08119，並與現場工安業主確認相關疑義。\n"
                  "TECO supplemented the relevant drawing No. HL-ONS-TECO-STR-DWG-08119. The Site Employer Representative indicated "
                  "that the relevant information would be further reviewed and responded to."}]},
    {"no": "1.1.2", "kind": "item", "level": 2, "owner": "HL", "targetDate": "2026-07-31", "status": "Closed",
     "content": "CVL-00205 模板支撐間距已改善並複驗合格。", "updates": []},
    {"no": "2", "kind": "category", "level": 0, "content": "安全議題 Safety"},
    {"no": "2.1", "kind": "item", "level": 1, "owner": "HL - Breeze", "targetDate": "2026-08-08", "status": "Open", "raisedDate": "2026-07-28",
     "content": "高架作業平台每日點檢紀錄缺漏，請補齊。", "updates": []},
]
now = datetime.now().isoformat()


def meeting(doc, title, status, log, **kw):
    d.add(models.MeetingMinutes(
        id=str(uuid.uuid4()), vendor_id="MTB-V1", documentNumber=doc, rev="1.0", status=status, title=title,
        meetingType=kw.get("meetingType", "週會"), meetingDate=kw.get("meetingDate", "2026-08-04"),
        meetingTime=kw.get("meetingTime"), meetingEndTime=kw.get("meetingEndTime"), location=kw.get("location"),
        organizer=kw.get("organizer"), attendees=json.dumps(kw.get("attendees", []), ensure_ascii=False),
        discussionLog=json.dumps(log, ensure_ascii=False), attachments=None, createdAt=now, updatedAt=now))


meeting("MOM-DEMO-001", "Weekly 110 (legacy format)", "Draft", LEGACY, meetingDate="2026-07-28", meetingTime="15:00",
        location="HL Office Meeting Room", organizer="Daniel Huang", attendees=ATTENDEES[:4])
meeting("MOM-DEMO-002", "Meeting Minutes - 111", "Published", REGISTER, meetingTime="15:00", meetingEndTime="17:15",
        location="HL Office Meeting Room", organizer="Daniel Huang", attendees=ATTENDEES)
meeting("MOM-DEMO-003", "Monthly (legacy, published)", "Published", LEGACY, meetingType="月會", meetingDate="2026-07-01",
        location="Site Office", organizer="Daniel Huang", attendees=ATTENDEES[3:])
d.commit()
print("seeded: mtg_reviewer, contractor Hailong Construction, MOM-DEMO-001 (legacy Draft), MOM-DEMO-002 (Published register), "
      "MOM-DEMO-003 (legacy Published)")
