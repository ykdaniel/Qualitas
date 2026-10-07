"""Seed for the ITP status dropdown / backend transition-map mismatch review (2026-09-28;
isolated stack only).

Reproduces and covers the fix for: ITPModals.tsx's status <select> unconditionally offered
"Rejected" and "No submit" as selectable targets from ANY current status. Neither value appears
anywhere in backend/core/utils.py::WorkflowEngine.TRANSITIONS["ITP"] (not as a source, not as a
target of any transition) — selecting either and saving always got a real 400 "Invalid status
transition" from WorkflowEngine.validate_transition, confirmed live below, not just re-cited from
an old report. The other four transition-only options (Revise & Resubmit / Pending, plus
Approved/Approved with comments/Void which were ALREADY permission-gated by an earlier batch) were
also offered regardless of whether the CURRENT status actually has that target in its own
TRANSITIONS entry — e.g. "Approved with comments" -> "Approved" is asymmetric in the backend map
(the reverse direction IS legal) and was previously offered as if legal in both directions.

Fixed by filtering every non-current option through the same TRANSITIONS table the backend uses
(duplicated as a frontend constant, ITP_STATUS_TRANSITIONS in ITPModals.tsx — this batch does NOT
touch the backend map itself, and does not add any new backend-accepted transition). The current
status is always kept selectable (resend) and always displayed even when it is a value with zero
legal outbound transitions (Void, Rejected, No submit — none of these are keys in the backend map,
so WorkflowEngine.validate_transition's own `rules.get(current_status, [])` fallback already
treats them as dead ends; this fix does not change that, it only stops MISREPRESENTING them as
having live paths out). An entirely unrecognized status string is shown with an explicit
"unrecognized" note rather than being silently coerced to Pending.

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <...> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_itp_status_menu_review.py
    node ../react-app/tests-browser/itp-status-menu-review.mjs stack.json
    python scripts/verification/isolated_stack.py down --root <root>

Password for every account: Accept-Test-1234 (shared, isolated-only test constant).

Accounts, EXACT permissions each holds:

    itp_status_full    itp:view:all, itp:create:all, itp:update:all, itp:approve:all,
                        itp:void:all, contractors:view:all. Scoped to ISM-P1. Used for legal
                        transitions, Publish regression, and ordinary edit regression.
    itp_status_basic   itp:view:all, itp:create:all, itp:update:all, contractors:view:all.
                        Scoped to ISM-P1. Deliberately NO itp:approve:all/itp:void:all — used to
                        confirm Approved/Approved-with-comments/Void are not offered on screen AND
                        a direct API PUT into any of them is still rejected by the backend
                        (unchanged from the earlier ITP approve/void authorization batch).

Records, each isolating one specific transition-map scenario:

    ism-itp-pending               status=Pending — ordinary case, most targets legal.
    ism-itp-approved-w-comments   status="Approved with comments" — TRANSITIONS["Approved with
                                   comments"] = ["Pending","Revise & Resubmit","Void"], NOTABLY
                                   NOT "Approved" (asymmetric with the reverse direction).
    ism-itp-void                  status=Void — TRANSITIONS["Void"] = [] (terminal); dropdown
                                   should offer ONLY "Void" (the current value), nothing else.
    ism-itp-rejected              status=Rejected — NOT a key in TRANSITIONS at all (matches
                                   real historical data this screen must not silently rewrite);
                                   dropdown should offer ONLY "Rejected".
    ism-itp-no-submit             status="No submit" — same situation as Rejected above.
    ism-itp-legacy-unknown        status="LegacyUnknownStatus123" — a value this screen has no
                                   label for at all; must render with an explicit "unrecognized"
                                   note, not be silently coerced to Pending.
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


full = role("IsmFull", [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE, perms.ITP_APPROVE, perms.ITP_VOID, perms.CONTRACTOR_VIEW])
basic = role("IsmBasic", [perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE, perms.CONTRACTOR_VIEW])

d.add(models.Contractor(id="ISM-V1", name="ITP StatusMenu Review Co", abbreviation="ISM"))
d.add(models.Project(id="ISM-P1", name="ITP StatusMenu Review Project 1"))

full_user = models.User(username="itp_status_full", email="ismf@example.com", is_active=True,
                         hashed_password=get_password_hash(PW), role_id=full.id, full_name="ITP Status Menu Full")
basic_user = models.User(username="itp_status_basic", email="ismb@example.com", is_active=True,
                          hashed_password=get_password_hash(PW), role_id=basic.id, full_name="ITP Status Menu Basic")
d.add(full_user)
d.add(basic_user)
d.commit()

d.add(models.UserProject(user_id=full_user.id, project_id="ISM-P1"))
d.add(models.UserProject(user_id=basic_user.id, project_id="ISM-P1"))
d.commit()


def itp(id_, status, ref_suffix):
    return models.ITP(id=id_, project_id="ISM-P1", vendor_id="ISM-V1",
                       referenceNo=f"QTS-ISM-ITP-{ref_suffix}", description=f"Status menu review: {status}",
                       rev="Rev1.0", submit="", status=status, submissionDate="2026-09-28")


d.add(itp("ism-itp-pending", "Pending", "000001"))
d.add(itp("ism-itp-approved-w-comments", "Approved with comments", "000002"))
d.add(itp("ism-itp-void", "Void", "000003"))
d.add(itp("ism-itp-rejected", "Rejected", "000004"))
d.add(itp("ism-itp-no-submit", "No submit", "000005"))
d.add(itp("ism-itp-legacy-unknown", "LegacyUnknownStatus123", "000006"))
d.add(itp("ism-itp-approved", "Approved", "000007"))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
