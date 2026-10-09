"""Seed for the ITP -> Checklist -> NOI -> ITR -> approval / NCR / re-inspection end-to-end
business walkthrough (2026-09-29; isolated stack only).

Requested by the user to real-browser-verify the operations checklist compiled from code reading
(docs/workflow/itp-checklist-itr-chain-walkthrough-2026-09-29-handoff.md). This seed gives ONE
account holding every permission the corrected checklist says the chain needs, so the walkthrough
exercises the actual cross-module wiring rather than re-testing permission boundaries (already
verified by code reading in the prior round).

    cd backend
    python scripts/verification/isolated_stack.py up --port 8198 --vite-port 3198 \
        --vite-script ../react-app/tests-browser/project-create-vite.mjs > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> \
        --script scripts/verification/seed_itp_checklist_itr_chain_walkthrough.py
    python scripts/verification/isolated_stack.py down --root <root>

Password: Accept-Test-1234

Account: chain_full — exactly the permissions the corrected walkthrough names as necessary across
the whole chain (itp/checklist/noi/itr/ncr view+create+update+approve/close as applicable,
contractors:view). Scoped to exactly ONE project (CHAIN-P1) via a single UserProject row, per the
walkthrough's point 5 correction (an account with zero UserProject rows is unscoped and would not
exercise the project_id auto-fill path at all).
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


chain_full = role("ChainFull", [
    perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE, perms.ITP_APPROVE,
    perms.CHECKLIST_VIEW, perms.CHECKLIST_CREATE, perms.CHECKLIST_UPDATE, perms.CHECKLIST_CLOSE,
    perms.NOI_VIEW, perms.NOI_CREATE, perms.NOI_UPDATE,
    perms.ITR_VIEW, perms.ITR_CREATE, perms.ITR_UPDATE, perms.ITR_APPROVE,
    perms.NCR_VIEW, perms.NCR_CREATE,
    perms.CONTRACTOR_VIEW,
])

d.add(models.Project(id="CHAIN-P1", name="ITP Chain Walkthrough", code="CHAINP1"))
d.add(models.Contractor(id="CHAIN-V1", name="Chain Walkthrough Contractor Co", abbreviation="CWC"))

chain_user = models.User(username="chain_full", email="chainfull@example.com", is_active=True,
                          hashed_password=get_password_hash(PW), role_id=chain_full.id, full_name="Chain Full")
d.add(chain_user)
d.commit()
d.add(models.UserProject(user_id=chain_user.id, project_id="CHAIN-P1"))
d.commit()
print("SEED " + json.dumps({"ok": True}))
