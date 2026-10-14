"""Isolated TEST SEED SCRIPT for FAT-SUPPLIER-NULL-2026-001 (2026-10-13) — writes test fixtures to an isolated
database; it is a seed script, not a read-only script.

Isolated stack only (run through `isolated_stack.py seed`). Uses the stack's own `admin` account; creates no users.

    seed --script scripts/verification/seed_fat_supplier_null_review.py base
        one project and two contractors ("FAT Supplier Co", "FAT Gone Co") and one normal FAT.
    seed --script scripts/verification/seed_fat_supplier_null_review.py drop-contractor
        deletes "FAT Gone Co" straight from the database (the API refuses while a FAT cites it) — the way a record
        loses its contractor outside the app; the FAT that cited it is left with no supplier.
    seed --script scripts/verification/seed_fat_supplier_null_review.py legacy
        legacy rows the list must still show: no supplier, no equipment / start / end date, start after end,
        a start date not in YYYY-MM-DD.
"""
import os
import sys
from datetime import datetime

from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

from sqlalchemy import text  # noqa: E402

import database, models  # noqa: E402

mode = sys.argv[1] if len(sys.argv) > 1 else "base"
d = database.SessionLocal()
now = datetime.now().isoformat()


def _fat(fat_id, **kw):
    row = dict(id=fat_id, project_id="FSN-P1", equipment=f"Equipment {fat_id}", vendor_id="FSN-V1",
               startDate="2026-10-01", endDate="2026-10-05", status="Scheduled", created_at=now, updated_at=now)
    row.update(kw)
    d.add(models.FAT(**row))


if mode == "base":
    d.add(models.Project(id="FSN-P1", name="FAT Review Project", code="FRP"))
    d.add(models.Contractor(id="FSN-V1", name="FAT Supplier Co", abbreviation="FSC"))
    d.add(models.Contractor(id="FSN-V2", name="FAT Gone Co", abbreviation="FGC"))
    d.flush()
    _fat("FSN-OK", equipment="Transformer T1 (normal)")
    _fat("FSN-GONE", equipment="Switchgear S1 (contractor will be deleted)", vendor_id="FSN-V2")
elif mode == "drop-contractor":
    d.execute(text("DELETE FROM contractors WHERE id = 'FSN-V2'"))
elif mode == "legacy":
    _fat("FSN-NOSUP", equipment="Pump P1 (no supplier)", vendor_id=None)
    _fat("FSN-NODATE", equipment=None, startDate=None, endDate=None)
    _fat("FSN-ORDER", equipment="Cable C1 (start after end)", startDate="2026-10-09", endDate="2026-10-02")
    _fat("FSN-FORMAT", equipment="Valve V1 (start date 2026/10/01)", startDate="2026/10/01")
else:
    raise SystemExit(f"unknown mode {mode!r}")

d.commit()
print("SEED", mode, "ok")
print("FAT rows:", [(r.id, r.vendor_id) for r in d.query(models.FAT).order_by(models.FAT.id)])
d.close()
