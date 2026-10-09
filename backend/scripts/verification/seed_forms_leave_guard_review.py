"""Seed for FORMS-2026-001: leave-guard / save-failure / delayed-save verification for
OSD, Contractor, Project, Role, DocumentNamingRules (+ Audit / Meeting Minutes sub-draft check).

Isolated stack only — never run against a real DB.

Requires FORMS_TEST_PASSWORD in the environment — this script never hardcodes or defaults a
password. isolated_stack.py's `seed` subcommand runs this script in a DELIBERATELY isolated
child environment (see isolation.isolated_env) that does NOT inherit the caller's shell env —
a plain `export` before the `seed` call is silently ignored. Pass it explicitly via `--env`
instead (isolated_stack.py's own supported mechanism for this exact case). The SAME value must
then be used for every forms-leave-guard-review*.mjs invocation in the rerun (those run as
plain `node` processes and DO read a normal shell env var, so `export` works for them):

    cd backend
    PW="$(openssl rand -base64 18)"
    python scripts/verification/isolated_stack.py up --port 8200 --vite-port 3200 \
        --vite-script <a vite launcher> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> \
        --script scripts/verification/seed_forms_leave_guard_review.py \
        --env FORMS_TEST_PASSWORD="$PW"
    export FORMS_TEST_PASSWORD="$PW"   # for the forms-leave-guard-review*.mjs runs that follow
    python scripts/verification/isolated_stack.py down --root <root>

Account: forms_full — holds exactly the permissions this batch's target forms need:
  contractors:view:all, contractors:manage:all (Contractor + Project modals)
  osd:view:all, osd:create:all, osd:update:all
  iam:role:view, iam:role:manage (Role — a throwaway test role is created below, never a
      real/used role)
  settings:manage:all (Document Naming Rules)
  audit:*, meeting:* (sub-draft-loss check)

Scoped to exactly ONE project (FORMS-P1) via a single UserProject row.
"""
import sys, os, json
BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models
from core.security import get_password_hash
# FORMS-2026-004 (R5): this script used to rely ENTIRELY on its caller (isolated_stack.py's
# `seed` subcommand, which injects `guard_if_required()` into the child's prelude before this
# file ever runs) to refuse an unsafe target. That is real protection when invoked the intended
# way, but this file had no defense of its own — run it directly (`python
# seed_forms_leave_guard_review.py`) with FORMS_TEST_PASSWORD set and a forgotten/wrong
# DATABASE_URL, and it would happily open SessionLocal() against whatever that URL points to,
# password check notwithstanding. Call the same guard explicitly here too, so this script refuses
# on its own even when something upstream of it did not.
from core.startup_guard import ENV_REQUIRE, enforce_from_environment, UnsafeDatabaseError

PW = os.environ.get("FORMS_TEST_PASSWORD")
if not PW:
    print("SEED " + json.dumps({"ok": False, "error": "FORMS_TEST_PASSWORD not set — refusing to seed with no password or a hardcoded fallback. export FORMS_TEST_PASSWORD first."}))
    sys.exit(1)

if os.environ.get(ENV_REQUIRE) != "1":
    print("SEED " + json.dumps({"ok": False, "error": f"{ENV_REQUIRE} is not set to \"1\" — refusing to seed. This script only ever runs against an isolated_stack.py-managed database; it will not guess at a safe target on its own."}))
    sys.exit(1)
try:
    enforce_from_environment()  # re-checks DATABASE_URL/LOG_DIR/upload root against QUALITAS_TEST_DB_ROOT itself — not just trusting ENV_REQUIRE's presence
except UnsafeDatabaseError as e:
    print("SEED " + json.dumps({"ok": False, "error": f"Refusing: {e}"}))
    sys.exit(1)

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


forms_full = role("FormsFull", [
    "contractors:view:all", "contractors:manage:all",
    "osd:view:all", "osd:create:all", "osd:update:all",
    "iam:role:view", "iam:role:manage",
    "settings:manage:all",
    "audit:view:all", "audit:create:all", "audit:update:all",
    "meeting:view:all", "meeting:create:all", "meeting:update:all",
    "followup:view:all", "followup:create:all",  # MM's per-row "add action item now" creates a FollowUp
])

# View-only variant: used to confirm readOnly modes (driven purely by the corresponding
# manage/create/update permission's absence) never expose a save entry point. Covers Role
# (iam:role:manage absent), DocumentNamingRules (settings:manage:all absent), and OSD on a
# Closed/Void record (osd:create:all absent — see OSD.tsx's `locked` branch, which requires
# create, not update, once a record is Closed/Void).
forms_readonly = role("FormsReadOnly", ["iam:role:view", "osd:view:all"])

d.add(models.Project(id="FORMS-P1", name="Forms Leave Guard Review", code="FORMSP1"))
d.add(models.Contractor(id="FORMS-V1", name="Forms Leave Guard Contractor Co", abbreviation="FLG",
                         package="Structural Works", scope="Rebar & formwork", status="active",
                         contactPerson="QA Lead", email="qa@forms-review.example.com", phone="0900000001",
                         address="1 Review St."))

forms_user = models.User(username="forms_full", email="formsfull@example.com", is_active=True,
                          hashed_password=get_password_hash(PW), role_id=forms_full.id, full_name="Forms Full")
d.add(forms_user)
readonly_user = models.User(username="forms_role_readonly", email="formsreadonly@example.com", is_active=True,
                             hashed_password=get_password_hash(PW), role_id=forms_readonly.id, full_name="Forms Role ReadOnly")
d.add(readonly_user)
d.commit()
d.add(models.UserProject(user_id=forms_user.id, project_id="FORMS-P1"))
d.add(models.UserProject(user_id=readonly_user.id, project_id="FORMS-P1"))
d.commit()

# Existing OSD record to edit (for the "existing record" leave-guard / save-failure scenarios).
d.add(models.OSD(
    id="forms-osd-1", project_id="FORMS-P1", vendor_id="FORMS-V1",
    documentNumber="QTS-FLG-OSD-000001", status="Open",
    raiseDate="2026-09-30", deliveryNoteNo="DN-0001", poNumber="PO-0001",
    itemDescription="Rebar bundle", expectedQty="10", receivedQty="9", unit="bundle",
    damageDescription="One bundle short on delivery.",
))
# Closed OSD record — for the readOnly account, this is the "locked without create
# permission" branch (OSD.tsx: locked ? osd:create:all : osd:update:all).
d.add(models.OSD(
    id="forms-osd-closed-1", project_id="FORMS-P1", vendor_id="FORMS-V1",
    documentNumber="QTS-FLG-OSD-000002", status="Closed",
    raiseDate="2026-09-01", closeoutDate="2026-09-15", deliveryNoteNo="DN-0002", poNumber="PO-0002",
    itemDescription="Closed record for read-only verification", expectedQty="5", receivedQty="5", unit="pallet",
    damageDescription="Already resolved and closed.",
))
d.commit()
d.close()
print("SEED " + json.dumps({"ok": True}))
