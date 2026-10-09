"""Seed for the ITP standalone detail page parser fix (BACKLOG #35; isolated stack only).

Reproduces and covers the fix for: /itp/:id (ITPDetail.tsx) used its own inline parser that only
understood the older phased {a:[...],b:[...],c:[...]} detail_data shape, while the list-page
modal (ITPModals.tsx / ITPAdvancedEditor.tsx) reads through the shared utils/itpParser.ts, which
also accepts a flat array with per-item `phase` keys. A record whose items were most recently
saved in the flat-array shape rendered an empty inspection plan on the standalone page even
though the data was there. Fixed by making ITPDetail.tsx load through the same
utils/itpParser.ts::parseInspectionItems used by the list-page modal.

    cd backend
    python scripts/verification/isolated_stack.py up --port 8198 --vite-port 3198 \
        --vite-script tests-browser/project-create-vite.mjs > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> \
        --script scripts/verification/seed_itp_detail_parser_fix_review.py
    node ../react-app/tests-browser/itp-detail-parser-fix-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password: Accept-Test-1234

Account:
    dp_full   itp:view/create/update:all, contractors:view:all. Scoped to DP-P1.

Records, each isolating one aspect of the fix:
    QTS-DP-ITP-000001   detail_data as a FLAT ARRAY (list-page modal's write shape), 2 items in
                         phase A + 1 in phase B, each with its own id/phase already set — the
                         exact shape that rendered EMPTY on the standalone page before the fix.
    QTS-DP-ITP-000002   detail_data as the OLD PHASED {a,b,c} object — already worked on both
                         entry points before the fix; kept as a regression check so the fix does
                         not change this still-common shape's behavior.
    QTS-DP-ITP-000003   detail_data as a flat array where one item OMITS `phase` entirely (must
                         default to Phase A, matching the list-page modal's own fallback) and one
                         field (`activity`) is a plain string rather than {en,ch} (legacy shape
                         normalized to {en: value, ch: ''} by the shared parser) — exercises the
                         normalization the standalone page did not previously apply at all.
    QTS-DP-ITP-000004   detail_data is None — must still render an empty plan (Add Item still
                         available), not an error, on both entry points.
"""
import sys, os, json
BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models
from core import perms
from core.security import get_password_hash

PW = "Accept-Test-1234"
d = database.SessionLocal()


def _get_or_create_perm(db, code):
    p = db.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        db.add(p)
        db.flush()
    return p


def role(name, codes):
    r = models.Role(name=name)
    r.permissions_rel = [_get_or_create_perm(d, c) for c in codes]
    d.add(r)
    d.flush()
    return r


full = role("DpFull", [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE, perms.CONTRACTOR_VIEW])

d.add(models.Contractor(id="DP-V1", name="Detail Parser Fix Review Co", abbreviation="DP"))
d.add(models.Project(id="DP-P1", name="Detail Parser Fix Review Project"))

full_user = models.User(username="dp_full", email="dpfull@example.com", is_active=True,
                         hashed_password=get_password_hash(PW), role_id=full.id, full_name="DP Full")
d.add(full_user)
d.commit()

d.add(models.UserProject(user_id=full_user.id, project_id="DP-P1"))
d.commit()


def item(phase, idx, activity, record="-"):
    return {
        "id": f"{phase}{idx}", "phase": phase,
        "activity": {"en": activity, "ch": ""},
        "standard": {"en": "Standard " + activity, "ch": ""},
        "criteria": [{"en": "Criteria " + activity, "ch": ""}],
        "checkTime": {"en": "Before construction", "ch": ""},
        "method": {"en": "Visual", "ch": ""},
        "frequency": {"en": "Each Time", "ch": ""},
        "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"},
        "record": record,
    }


# 1. Flat array (list-page modal's write shape) — the shape that used to render empty.
flat_items = [
    item("A", 1, "Flat A1 sighted"),
    item("A", 2, "Flat A2 sighted"),
    item("B", 1, "Flat B1 sighted"),
]
d.add(models.ITP(id="dp-itp-1", project_id="DP-P1", vendor_id="DP-V1",
                  referenceNo="QTS-DP-ITP-000001", description="Flat-array detail_data (bug repro)",
                  rev="Rev1.0", submit="", status="Pending", submissionDate="2026-09-29",
                  detail_data=json.dumps(flat_items)))

# 2. Old phased {a,b,c} object — regression check, already worked before the fix.
phased_items = {
    "a": [{k: v for k, v in item("A", 1, "Phased A1 sighted").items() if k not in ("id", "phase")}],
    "b": [{k: v for k, v in item("B", 1, "Phased B1 sighted").items() if k not in ("id", "phase")}],
    "c": [],
}
d.add(models.ITP(id="dp-itp-2", project_id="DP-P1", vendor_id="DP-V1",
                  referenceNo="QTS-DP-ITP-000002", description="Phased {a,b,c} detail_data (regression)",
                  rev="Rev1.0", submit="", status="Pending", submissionDate="2026-09-29",
                  detail_data=json.dumps(phased_items)))

# 3. Flat array, one item missing `phase` (defaults to A) and one legacy plain-string `activity`.
mixed_items = [
    {"id": "X1", "activity": "Legacy plain-string activity, no phase key", "standard": "S", "criteria": [],
     "checkTime": "", "method": "", "frequency": "", "vp": {"sub": "", "teco": "", "employer": "", "hse": ""}, "record": "-"},
    item("B", 1, "Mixed B1 sighted, has its own phase"),
]
d.add(models.ITP(id="dp-itp-3", project_id="DP-P1", vendor_id="DP-V1",
                  referenceNo="QTS-DP-ITP-000003", description="Flat array, missing phase + legacy string activity",
                  rev="Rev1.0", submit="", status="Pending", submissionDate="2026-09-29",
                  detail_data=json.dumps(mixed_items)))

# 4. No detail_data at all — must stay an empty, addable plan, not an error.
d.add(models.ITP(id="dp-itp-4", project_id="DP-P1", vendor_id="DP-V1",
                  referenceNo="QTS-DP-ITP-000004", description="No detail_data at all",
                  rev="Rev1.0", submit="", status="Pending", submissionDate="2026-09-29",
                  detail_data=None))

d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
