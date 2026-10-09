"""Seed for the ITP Record-link misrouting fix (2026-09-28; isolated stack only).

Reproduces and covers the fix for: the "Record" column's click handler used to decide ITR vs.
Checklist by checking whether the value's prefix looked like "QTS-..." — but EVERY document
number in this system (ITR, ITP, Checklist, NOI) shares that same "QTS-" convention, so a real
ITR document number was always misrouted to /checklist, landing on an empty list with no
explanation. Fixed by actually looking the value up against both real endpoints
(utils/itpRecordLink.ts) instead of guessing from the string shape.

    cd backend
    python scripts/verification/isolated_stack.py up --port 8099 --vite-port 3099 --vite-script <vite_multi.mjs> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_itp_record_link_fix_review.py
    node ../react-app/tests-browser/itp-record-link-fix-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password: Accept-Test-1234

Accounts:
    rlfix_full     itp:view/create/update:all, itr:view:all, checklist:view:all,
                    contractors:view:all. Scoped to RLF-P1. Can resolve both kinds correctly.
    rlfix_noitr    Same as full EXCEPT no itr:view:all — used to confirm a Record that is
                    genuinely an ITR document, which this account has no permission to look up,
                    is reported as a permission problem, not silently misrouted or claimed "not
                    found".

Records, each isolating one resolution outcome:
    rlf-itp-1   item R1 -> a real ITR document number (QTS-RLF-ITR-000001)
                item R2 -> a real Checklist recordsNo (QTS-RLF-CHK-000001)
                item R3 -> a value that matches neither (QTS-RLF-ITR-999999, dangling/never existed)
                item R4 -> QTS-RLF-AMBIGUOUS-000001, deliberately shared by BOTH a real ITR and a
                           real Checklist row (a genuine numbering collision) to exercise the
                           "ambiguous, cannot tell which" path
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


BASE_PERMS = [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE, perms.CONTRACTOR_VIEW, perms.CHECKLIST_VIEW]

full = role("RlfixFull", BASE_PERMS + [perms.ITR_VIEW])
noitr = role("RlfixNoItr", BASE_PERMS)

d.add(models.Contractor(id="RLF-V1", name="Record Link Fix Review Co", abbreviation="RLF"))
d.add(models.Project(id="RLF-P1", name="Record Link Fix Review Project"))

full_user = models.User(username="rlfix_full", email="rlfixf@example.com", is_active=True,
                         hashed_password=get_password_hash(PW), role_id=full.id, full_name="RLFix Full")
noitr_user = models.User(username="rlfix_noitr", email="rlfixn@example.com", is_active=True,
                          hashed_password=get_password_hash(PW), role_id=noitr.id, full_name="RLFix No ITR View")
d.add(full_user)
d.add(noitr_user)
d.commit()

d.add(models.UserProject(user_id=full_user.id, project_id="RLF-P1"))
d.add(models.UserProject(user_id=noitr_user.id, project_id="RLF-P1"))
d.commit()

d.add(models.ITR(id="rlf-itr-1", project_id="RLF-P1", vendor_id="RLF-V1",
                  documentNumber="QTS-RLF-ITR-000001", description="Real ITR for record-link test",
                  rev="Rev1.0", submit="", status="Approved", type="Hold Point"))
d.add(models.Checklist(id="rlf-chk-1", project_id="RLF-P1", recordsNo="QTS-RLF-CHK-000001", date="2026-09-28",
                        status="Pass", activity="Real checklist for record-link test",
                        detail_data=json.dumps({"items": []})))
# Deliberate numbering collision: one ITR and one Checklist sharing the same document number,
# to exercise the "ambiguous" resolution path.
d.add(models.ITR(id="rlf-itr-ambig", project_id="RLF-P1", vendor_id="RLF-V1",
                  documentNumber="QTS-RLF-AMBIGUOUS-000001", description="Collides with a checklist number",
                  rev="Rev1.0", submit="", status="Approved", type="Witness Point"))
d.add(models.Checklist(id="rlf-chk-ambig", project_id="RLF-P1", recordsNo="QTS-RLF-AMBIGUOUS-000001", date="2026-09-28",
                        status="Pass", activity="Collides with an ITR number",
                        detail_data=json.dumps({"items": []})))
d.commit()


def item(idx, activity_en, record):
    return {
        "id": f"A{idx}", "phase": "A",
        "activity": {"en": activity_en, "ch": ""},
        "standard": {"en": "", "ch": ""},
        "criteria": [],
        "checkTime": {"en": "", "ch": ""},
        "method": {"en": "", "ch": ""},
        "frequency": {"en": "", "ch": ""},
        "vp": {"sub": "", "teco": "", "employer": "", "hse": ""},
        "record": record,
    }


items = [
    item(1, "R1: links to a real ITR", "QTS-RLF-ITR-000001"),
    item(2, "R2: links to a real Checklist", "QTS-RLF-CHK-000001"),
    item(3, "R3: dangling, never existed", "QTS-RLF-ITR-999999"),
    item(4, "R4: ambiguous, collides across ITR and Checklist", "QTS-RLF-AMBIGUOUS-000001"),
]

d.add(models.ITP(id="rlf-itp-1", project_id="RLF-P1", vendor_id="RLF-V1",
                  referenceNo="QTS-RLF-ITP-000001", description="Record link fix review ITP",
                  rev="Rev1.0", submit="", status="Pending", submissionDate="2026-09-28",
                  detail_data=json.dumps(items)))

# The standalone /itp/:id page (ITPDetail.tsx) only understands the older phased
# {a:[...],b:[...],c:[...]} detail_data shape (a separate, narrower parser than the list-page
# modal's shared utils/itpParser.ts, which also accepts a flat array) — a pre-existing format
# split between the two ITP editing surfaces, unrelated to and out of scope for this Record-link
# fix. A second ITP row in that shape is seeded here purely so this batch's fix can be verified
# on that entry point too.
phased_items = {
    "a": [{k: v for k, v in it.items() if k not in ("id", "phase")} for it in items],
    "b": [], "c": [],
}
d.add(models.ITP(id="rlf-itp-2", project_id="RLF-P1", vendor_id="RLF-V1",
                  referenceNo="QTS-RLF-ITP-000002", description="Record link fix review ITP (phased shape, standalone page)",
                  rev="Rev1.0", submit="", status="Pending", submissionDate="2026-09-28",
                  detail_data=json.dumps(phased_items)))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
