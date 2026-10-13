"""Isolated TEST SEED SCRIPT for REF-PROJECT-SEQ-2026-001 batch 1 (2026-10-13) — writes test fixtures to an isolated database;
it is a seed script, not a read-only script.

Isolated stack only. Requires B1_REVIEW_PASSWORD in the environment (no hardcoded or defaulted password).

Two projects and one record per project in each of NCR / OBS, plus four accounts sharing one role (view + create on NCR,
OBS, NOI, ITP, PQP, KM; IAM not included):
  pm_single — bound to Hailong only            → works in it straight away
  pm_multi  — bound to Hailong and TECO        → chooses one after signing in
  pm_none   — bound to no project              → "not a project member", sees nothing
  pm_vendor — contractor account, no project   → also not a project member (D8)
The stack's own `admin` account (isolated_stack.py) is the system administrator.
"""
import os
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import database, models
from core.security import get_password_hash

PW = os.environ.get("B1_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("B1_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _perm(code):
    p = d.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        d.add(p)
        d.flush()
    return p


d.add(models.Project(id="B1-HL", name="Hailong", code="HL"))
d.add(models.Project(id="B1-TECO", name="TECO Substation", code="TECO"))
d.add(models.Contractor(id="B1-V1", name="Formosa Heavy Structural Engineering Co., Ltd.", abbreviation="FHS"))
d.flush()

role = models.Role(name="B1ProjectStaff")
role.permissions_rel = [_perm(c) for c in (
    "ncr:view:all", "ncr:create:all", "obs:view:all", "obs:create:all", "noi:view:all", "noi:create:all",
    "itp:view:all", "pqp:view:all", "km:view:all", "contractors:view:all",
)]
d.add(role)
d.flush()


def _user(username, projects=(), vendor=None):
    u = models.User(username=username, email=f"{username}@example.com", is_active=True, company_name="Rokusumi",
                    hashed_password=get_password_hash(PW), role_id=role.id, full_name=username, vendor_id=vendor)
    d.add(u)
    d.flush()
    for p in projects:
        d.add(models.UserProject(user_id=u.id, project_id=p))


_user("pm_single", ["B1-HL"])
_user("pm_multi", ["B1-HL", "B1-TECO"])
_user("pm_none")
_user("pm_vendor", vendor="B1-V1")

for pid, code in (("B1-HL", "HL"), ("B1-TECO", "TECO")):
    d.add(models.NCR(id=f"b1-ncr-{code}", documentNumber=f"NCR-{code}-REVIEW", project_id=pid, vendor_id="B1-V1",
                     status="Open", description=f"Review NCR in {code}", rev="Rev1.0", submit="2026-10-01"))
    d.add(models.OBS(id=f"b1-obs-{code}", documentNumber=f"OBS-{code}-REVIEW", project_id=pid, vendor_id="B1-V1",
                     status="Open", description=f"Review OBS in {code}", rev="Rev1.0", submit="2026-10-01"))
d.commit()
d.close()
print("SEED OK")
