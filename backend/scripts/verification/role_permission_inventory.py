"""
Role permission inventory — checklist update vs close (READ-ONLY)

Lists every role with whether it holds checklist:update:all and
checklist:close:all (the permission that alone allows reopening a closed
Pass/Fail Checklist). Makes NO writes: nothing is granted, revoked or
"corrected" — whether a role SHOULD hold the close permission is an
administrator's decision.

What this report cannot tell you (stated on purpose, not inferred):
  * WHO or WHAT granted a permission that is present. `role_permissions`
    has no timestamp or actor column, and (verified 2026-09-19) role
    create/update made through the IAM API currently leaves NO persisted
    audit entry — user_service.create_role/update_role add the audit row
    but never commit it, so it is lost when the request's session closes.
    An administrator's grant or revocation is therefore not traceable either.
  * Until 2026-09-19 every backend start silently granted
    checklist:close:all to any role holding checklist:update:all
    (db_seeder.py step "1b", now removed). So a non-admin role holding both
    today may have been granted deliberately OR by that backfill — the stored
    data cannot distinguish the two, and this script does not guess.

Usage (from backend/):  PYTHONPATH=. python scripts/verification/role_permission_inventory.py
"""
from typing import Dict, List

from sqlalchemy.orm import Session

import models
from database import SessionLocal

UPDATE = "checklist:update:all"
CLOSE = "checklist:close:all"


def role_update_close_report(db: Session) -> List[Dict]:
    rows = []
    for role in db.query(models.Role).order_by(models.Role.name).all():
        codes = {p.code for p in role.permissions_rel}
        has_update, has_close = UPDATE in codes, CLOSE in codes
        rows.append({
            "role": role.name,
            "is_admin": (role.name or "").lower() == "admin",
            "update": has_update,
            "close": has_close,
            "users": db.query(models.User).filter(models.User.role_id == role.id).count(),
            "provenance_of_close": "unknown (cannot be determined from stored data)" if has_close else "-",
        })
    return rows


def _mark(flag: bool) -> str:
    return "yes" if flag else "no"


def run_inventory(db: Session) -> None:
    rows = role_update_close_report(db)
    print("Role permission inventory: checklist update vs close (read-only)\n")
    print(f"{'role':<28}{'admin':<7}{'update':<8}{'close':<7}{'users':<7}provenance of close")
    for r in rows:
        print(f"{r['role']:<28}{_mark(r['is_admin']):<7}{_mark(r['update']):<8}{_mark(r['close']):<7}{r['users']:<7}{r['provenance_of_close']}")
    both = [r["role"] for r in rows if r["update"] and r["close"] and not r["is_admin"]]
    print(f"\nNon-admin roles holding BOTH update and close: {len(both)}")
    if both:
        print("  " + ", ".join(both))
        print("  (deliberate grant or the removed startup backfill — cannot be told apart; an administrator must confirm who should keep close)")
    print("\nNo roles or permissions were modified — this script only reads.")


if __name__ == "__main__":
    session = SessionLocal()
    try:
        run_inventory(session)
    finally:
        session.close()
