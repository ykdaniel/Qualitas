"""Isolated TEST SEED SCRIPT for MATERIAL-SUBMITTAL-M3-2026-001 (2026-10-08): adds ONE account with NO material permission
(m3_nomat: contractor view only, project M3-P1) to check the sidebar entry is hidden. Isolated stack only. Requires M3_REVIEW_PASSWORD."""
import os
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import database, models
from core import perms
from core.security import get_password_hash

PW = os.environ.get("M3_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("M3_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")
d = database.SessionLocal()
p = d.query(models.Permission).filter_by(code=perms.CONTRACTOR_VIEW).first()
role = models.Role(name="M3 no material")
role.permissions_rel = [p]
d.add(role)
d.flush()
u = models.User(username="m3_nomat", email="m3_nomat@example.com", is_active=True, hashed_password=get_password_hash(PW), role_id=role.id, full_name="m3_nomat")
d.add(u)
d.flush()
d.add(models.UserProject(user_id=u.id, project_id="M3-P1"))
d.commit()
print("seeded m3_nomat")
