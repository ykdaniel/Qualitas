"""Isolated TEST / PREVIEW SEED SCRIPT for CONTRACTOR-PERSONNEL-2026-001 (2026-10-11) — writes test fixtures to an isolated
database; it is a seed script, not a read-only script.

Isolated stack only. Requires CP_REVIEW_PASSWORD in the environment (no hardcoded or defaulted password).

Creates the companies of the company's sample minutes and their people (not system accounts):
  * TECO (owner, short name TECO): 5 active people + 1 who has left (inactive);
  * Hailong Construction (HL): 3 active people;
  * Empty Co (EC): no people yet.
Users:
  * cp_admin — contractors view + manage, Meeting Minutes view / create / update: manages the lists, picks attendees and
    can put a typed name on a company's list;
  * cp_meeting — Meeting Minutes only: picks attendees, never sees the "add to list" box;
  * cp_teco — Meeting Minutes, scoped to TECO: only TECO's people are offered.
Meetings:
  * MOM-CP-001 "Weekly 120 (text attendees)" — Draft whose attendees are plain text (no ids), as every meeting saved
    before this task: they read and save as before.
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

PW = os.environ.get("CP_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("CP_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _perm(code):
    p = d.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        d.add(p)
        d.flush()
    return p


MEETING = ("meeting:view:all", "meeting:create:all", "meeting:update:all", "iam:user:view")


def user(username, full_name, codes, vendor_id=None):
    role = models.Role(name=f"CP-{username}")
    role.permissions_rel = [_perm(c) for c in codes]
    d.add(role)
    d.flush()
    d.add(models.User(username=username, email=f"{username}@example.com", is_active=True, vendor_id=vendor_id,
                      hashed_password=get_password_hash(PW), role_id=role.id, full_name=full_name))


d.add_all([
    models.Contractor(id="CP-TECO", name="TECO", abbreviation="TECO", status="Active"),
    models.Contractor(id="CP-HL", name="Hailong Construction", abbreviation="HL", status="active"),
    models.Contractor(id="CP-EC", name="Empty Co", abbreviation="EC", status="active"),
])
d.flush()
user("cp_admin", "Daniel Huang", MEETING + ("contractors:view:all", "contractors:manage:all"))
user("cp_meeting", "Meeting Only", MEETING)
user("cp_teco", "TECO Clerk", MEETING, vendor_id="CP-TECO")

now = datetime.now().isoformat(timespec="seconds")
PEOPLE = [
    ("CP-TECO", "陳韋向(Mac Chen)", "Project Manager & Contract Manager", True),
    ("CP-TECO", "曾耀葦(Toby Tseng)", "QAQC Manager", True),
    ("CP-TECO", "謝苡渲(Yi-Hsuan Hsieh)", "QA/QC Documentation", True),
    ("CP-TECO", "陳俊維(Arisaka Chen)", "QA/QC MEP Engineer", True),
    ("CP-TECO", "謝明倫(ML Hsieh)", "Site Manager", True),
    ("CP-TECO", "Former Staff", "Site Engineer", False),
    ("CP-HL", "Breeze Yeh", "PM", True),
    ("CP-HL", "Daniel Huang", "Quality Manager", True),
    ("CP-HL", "Dennis Luo", "MEP Engineer", True),
]
for company, name, position, active in PEOPLE:
    d.add(models.ContractorPersonnel(id=str(uuid.uuid4()), contractor_id=company, name=name, position=position,
                                     is_active=active, created_at=now, updated_at=now))

d.add(models.MeetingMinutes(
    id=str(uuid.uuid4()), vendor_id="CP-HL", documentNumber="MOM-CP-001", rev="1.0", status="Draft",
    title="Weekly 120 (text attendees)", meetingType="週會", meetingDate="2026-08-18", meetingTime="15:00",
    location="HL Office Meeting Room", organizer="Daniel Huang",
    attendees=json.dumps([{"company": "TECO", "name": "曾耀葦(Toby Tseng)", "role": "QAQC Manager"},
                          {"company": "HL", "name": "Breeze Yeh", "role": "PM"}], ensure_ascii=False),
    discussionLog=json.dumps([], ensure_ascii=False), attachments=None, createdAt=now, updatedAt=now))
d.commit()
print("seeded: cp_admin / cp_meeting / cp_teco, TECO (5 active + 1 inactive), Hailong Construction (3), Empty Co (0), "
      "MOM-CP-001 (text attendees)")
