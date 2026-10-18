"""Isolated TEST SEED SCRIPT for ITP-TEMPLATE-REVISION-2026-001 (2026-10-17) — writes test fixtures to an isolated
database; it is a seed script, not a read-only script.

Isolated stack only (enforces QUALITAS_REQUIRE_ISOLATED_DB=1 via core.startup_guard). Creates no users: log in as the
stack's own admin (run directory's admin-password).

Two shared (no project) ITP templates side by side for comparison, both numbered on the STD counter:
  1. the current Rebar Works plan, from a read-only production snapshot, unchanged;
  2. the revised plan built from the revision table (rebar-std-itp-000001.md section 5).

Usage (from backend/):
    python scripts/verification/isolated_stack.py seed --root RUN_DIR \
        --script scripts/verification/seed_itp_template_revision_review.py CURRENT.json REVISED.json
"""
import os
import sys
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import json
import database, models
from core.utils import generate_reference_no

if len(sys.argv) != 3:
    raise SystemExit("usage: seed_itp_template_revision_review.py CURRENT.json REVISED.json")
current_path, revised_path = sys.argv[1], sys.argv[2]
with open(current_path, encoding="utf-8") as fh:
    current = json.load(fh)
with open(revised_path, encoding="utf-8") as fh:
    revised = json.load(fh)

d = database.SessionLocal()
created = []
for detail, description, rev, remark in (
    (current, "Rebar Works（現行，正式站 STD-ITP-000001 快照）", "Rev2.0",
     "ITP-TEMPLATE-REVISION-2026-001: production snapshot 2026-10-17, unchanged"),
    (revised, "Rebar Works（修訂版草案）", "Rev3.0 draft v2",
     "ITP-TEMPLATE-REVISION-2026-001 v2: revision table section 5 (user's decisions 2026-10-17: D1 甲, D2 甲 per batch "
     "before use, D3 conditional kept, Main H only B9 / C1). If the design of a project ITP does not permit rebar "
     "welding, delete A11/A12 and state that welding is not permitted."),
):
    number = generate_reference_no(d, "", "ITP", project_id=None)
    d.add(models.ITP(id=f"itp-rev-{len(created) + 1}", referenceNo=number, description=description, rev=rev,
                     status="Pending", remark=remark, hasDetails=True,
                     detail_data=json.dumps(detail, ensure_ascii=False), attachments="[]"))
    d.flush()
    created.append(number)
d.commit()
d.close()
print("SEED OK", " ".join(created))
