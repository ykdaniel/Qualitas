"""Isolated TEST SEED SCRIPT for IAM-USER-COMPANY-LABEL-2026-001 — writes test fixtures to an isolated database; it is a
seed script, not a read-only script. Gives the reviewer one account per "Name / Company" case:

  wang     bound to contractor Hailong (abbreviation HL)       -> 王小明 / HL
  lee      company picked from the list: 廠商C (abbreviation C)  -> 李四 / C
  chen     company typed, not on the list: RKS                  -> 陳大華 / RKS
  tbc      company on the list without an abbreviation: TBC     -> TBC Person / TBC
  legacy   no company at all (predates the rule)                -> Legacy User   (form shows the "no company" note)

The seeded admin keeps no company either, like production's admin. Isolated stack only (isolated_stack.py seed); the
extra accounts get random passwords nobody knows — they exist to be picked, not to log in.
"""
import os
import secrets
import uuid

from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

from sqlalchemy import func  # noqa: E402
import database, models  # noqa: E402,E401
from core.security import get_password_hash  # noqa: E402

d = database.SessionLocal()


def _contractor(name, abbreviation):
    c = d.query(models.Contractor).filter_by(name=name).first()
    if c is None:
        c = models.Contractor(id=str(uuid.uuid4()), name=name, abbreviation=abbreviation, status="Active")
        d.add(c)
        d.flush()
    return c


hailong = _contractor("Hailong", "HL")
_contractor("廠商C", "C")
_contractor("TBC", None)

ordinary = d.query(models.Role).filter(func.lower(models.Role.name) == "user").first()
for username, full_name, company, vendor in [
    ("wang", "王小明", None, hailong.id),
    ("lee", "李四", "廠商C", None),
    ("chen", "陳大華", "RKS", None),
    ("tbc", "TBC Person", "TBC", None),
    ("legacy", "Legacy User", None, None),
]:
    if d.query(models.User).filter_by(username=username).first() is None:
        d.add(models.User(username=username, email=f"{username}@example.com", full_name=full_name, is_active=True,
                          hashed_password=get_password_hash(secrets.token_urlsafe(18)),
                          role_id=ordinary.id if ordinary else None, company_name=company, vendor_id=vendor))
d.commit()
for u in d.query(models.User).order_by(models.User.id).all():
    print(f"SEED {u.username}: company_name={u.company_name!r} vendor={'yes' if u.vendor_id else 'no'} "
          f"-> label {u.display_company!r}")
d.close()
