"""Isolated TEST SEED SCRIPT for NOI-CONTACT-AUTOFILL-2026-002 (2026-10-04) — writes test
fixtures to an isolated database; it is a seed script, not a read-only script.

Isolated stack only. Requires NOI_CONTACT_AUTOFILL_PASSWORD in the environment (no hardcoded
or defaulted password). Enforces QUALITAS_REQUIRE_ISOLATED_DB=1 via core.startup_guard
(R3 of the NOI-CONTACT-AUTOFILL-2026-001 review — see NOI-CONTACT-AUTOFILL-2026-001-archive.md).

Three active contractors with distinct, real-looking contact info (so a contractor switch is
visibly different), plus a third with a deliberately BLANK phone (NOT the default-seeded
"廠商C", which already has a phone on file — db_seeder.py's seed_default_contractors()),
and two existing NOI records:
  - QTS-NCAF1-NOI-000001 (marker "NCAF-SAVE-MARK"): contractor A, all three contact fields
    filled (non-trivial values, not blank/short placeholders) — used for the save-then-
    independently-reread scenario (R2 scenario f).
  - QTS-NCAF1-NOI-000002 (marker "NCAF-BLANK-MARK"): contractor A, but `contacts` left blank
    on the record itself — used to verify the accepted design difference: an existing record's
    blank contact field stays blank after a contractor switch (it is NOT auto-filled the way a
    brand-new record would be; R2 scenario e).
"""
import os
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
# Actually validates DATABASE_URL/LOG_DIR/upload root against this process's own run
# root (core.startup_guard.enforce_from_environment) — the check above only confirms the
# flag string is "1", it does not by itself stop a DATABASE_URL pointing at the project's
# own qualitas.db. This must run BEFORE `database` (and the engine it creates) is imported.
guard_if_required()

import database, models
from core.security import get_password_hash

PW = os.environ.get("NOI_CONTACT_AUTOFILL_PASSWORD")
if not PW:
    raise RuntimeError("NOI_CONTACT_AUTOFILL_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _get_or_create_perm(db, code):
    p = db.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        db.add(p)
        db.flush()
    return p


role = models.Role(name="NOIContactAutofillFull")
role.permissions_rel = [_get_or_create_perm(d, c) for c in [
    "noi:view:all", "noi:create:all", "noi:update:all", "contractors:view:all", "itp:view:all",
]]
d.add(role)
d.flush()

user = models.User(username="ncaf_full", email="ncaf@example.com", is_active=True,
                    hashed_password=get_password_hash(PW), role_id=role.id, full_name="NOI Contact Autofill Full")
d.add(user)
d.add(models.Project(id="NCAF-P1", name="NOI Contact Autofill Review", code="NCAF1"))

# Contractor A is the first active contractor alphabetically/by insertion order, so it is the
# one NOIDetailModal.getInitialData() pre-selects for a brand-new record.
d.add(models.Contractor(id="NCAF-VA", name="Yungchang Construction Co.", abbreviation="YCC",
                         package="Civil Works", scope="General", status="active",
                         contactPerson="Wang Xiaoming", email="wang@yungchang.example.com",
                         phone="0912-345-678", address="1 Yungchang Rd."))
d.add(models.Contractor(id="NCAF-VB", name="Yungchang Construction Co. (North)", abbreviation="YCCN",
                         package="Civil Works", scope="General", status="active",
                         contactPerson="Li Dahua", email="li@yungchang-north.example.com",
                         phone="0923-456-789", address="1 Yungchang North Rd."))
# Deliberately blank phone: switching to this contractor must actually CLEAR a stale
# system-sourced phone value, not just leave it (R2 scenario c — the previous round only
# tested filling in a value, never clearing one back out to blank).
d.add(models.Contractor(id="NCAF-VC", name="Yungchang Construction Co. (No Phone On File)", abbreviation="YCCNP",
                         package="Civil Works", scope="General", status="active",
                         contactPerson="Chen Mingde", email="chen@yungchang-nophone.example.com",
                         phone="", address="1 Yungchang Annex Rd."))
d.commit()
d.add(models.UserProject(user_id=user.id, project_id="NCAF-P1"))
d.commit()


def make_noi(noi_id, ref, package, event, contacts, phone, email):
    n = models.NOI(id=noi_id, project_id="NCAF-P1", vendor_id="NCAF-VA", package=package,
                    referenceNo=ref, issueDate="2026-10-01", inspectionDate="2026-10-01",
                    inspectionTime="09:00", eventNumber=event, checkpoint="H", type="Rebar",
                    contacts=contacts, phone=phone, email=email, status="Open")
    d.add(n)
    d.flush()
    return n


# 1. Existing record, all three contact fields already filled with real values. Used as the
#    save-then-independently-reread target (R2 scenario f) — the marker is unique text in the
#    Subject field, not the auto-generated/renumbered referenceNo.
make_noi("ncaf-noi-1", "QTS-NCAF1-NOI-000001",
         "NCAF-SAVE-MARK — existing record with filled-in contact info for the re-inspection of the east wing foundation rebar",
         "EV1", "Chen Weilun", "0934-111-222", "chen.weilun@site.example.com")

# 2. Existing record, `contacts` deliberately left blank on the record itself (R2 scenario e).
make_noi("ncaf-noi-2", "QTS-NCAF1-NOI-000002",
         "NCAF-BLANK-MARK — existing record with a blank contact person field for the west wing column pour inspection",
         "EV2", "", "0934-333-444", "existing.contact@site.example.com")

# One ITP per default-seeded contractor (廠商A / 廠商B), so the NOI form's required
# "ITP no." field has a real option while verifying the save flow in this round.
for vendor_name, itp_id, ref in (("廠商A", "ncaf-itp-a", "QTS-NCAF1-ITP-000001"),
                                  ("廠商B", "ncaf-itp-b", "QTS-NCAF1-ITP-000002")):
    vendor = d.query(models.Contractor).filter(models.Contractor.name == vendor_name).first()
    if vendor:
        d.add(models.ITP(id=itp_id, project_id="NCAF-P1", vendor_id=vendor.id,
                          referenceNo=ref, status="Draft"))

d.commit()
d.close()
print("SEED OK")
