"""Isolated TEST SEED SCRIPT for MEETING-FIX-2026-001 (2026-10-11) — writes test fixtures to an isolated database; it is
a seed script, not a read-only script.

Isolated stack only. Requires MTG_FIX_REVIEW_PASSWORD in the environment (no hardcoded or defaulted password).
Creates one contractor, one reviewer with Meeting Minutes view / create / update and Follow Up view / create, and
one create-only account (Meeting Minutes view / create, Follow Up view / create — no meeting update).
"""
import os
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import database, models
from core.security import get_password_hash

PW = os.environ.get("MTG_FIX_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("MTG_FIX_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _perm(code):
    p = d.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        d.add(p)
        d.flush()
    return p


role = models.Role(name="MeetingFixReview")
role.permissions_rel = [_perm(c) for c in ("meeting:view:all", "meeting:create:all", "meeting:update:all",
                                            "followup:view:all", "followup:create:all", "contractors:view:all",
                                            "iam:user:view")]
d.add(role)
d.flush()
d.add(models.User(username="mtg_reviewer", email="mtg.reviewer@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=role.id, full_name="Meeting Reviewer"))
creator = models.Role(name="MeetingFixCreateOnly")
creator.permissions_rel = [_perm(c) for c in ("meeting:view:all", "meeting:create:all", "followup:view:all",
                                               "followup:create:all", "contractors:view:all")]
d.add(creator)
d.flush()
d.add(models.User(username="mtg_creator", email="mtg.creator@example.com", is_active=True,
                  hashed_password=get_password_hash(PW), role_id=creator.id, full_name="Meeting Creator"))
d.add(models.Contractor(id="MFX-V1", name="Hailong Construction", abbreviation="HL", status="active"))
d.commit()
print("seeded: mtg_reviewer, mtg_creator, contractor Hailong Construction")
