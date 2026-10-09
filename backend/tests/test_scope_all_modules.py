"""P0 data-isolation — cross-module enforcement.

For every scoped module, verify end-to-end (service → repo → DB) that:
  * the list query is filtered to the caller's project scope, and
  * single-record get is gated (out-of-scope → None).

This exercises the actual wiring, not just that imports resolve.
"""

import pytest

import models
from core.scope import Scope, UNSCOPED

from repositories.ncr_repository import NCRRepository
from services.ncr_service import NCRService
from repositories.noi_repository import NOIRepository
from services.noi_service import NOIService
from repositories.itr_repository import ITRRepository
from services.itr_service import ITRService
from repositories.itp_repository import ITPRepository
from services.itp_service import ITPService
from repositories.obs_repository import OBSRepository
from services.obs_service import OBSService
from repositories.pqp_repository import PQPRepository
from services.pqp_service import PQPService
from repositories.fat_repository import FATRepository
from services.fat_service import FATService
from repositories.followup_repository import FollowUpRepository
from services.followup_service import FollowUpService
from repositories.audit_repository import AuditRepository
from services.audit_service import AuditService
from repositories.checklist_repository import ChecklistRepository
from services.checklist_service import ChecklistService

# (label, Model, RepoCls, ServiceCls, list_method, get_method)
MODULES = [
    ("ncr", models.NCR, NCRRepository, NCRService, "get_ncrs", "get_ncr"),
    ("noi", models.NOI, NOIRepository, NOIService, "get_nois", "get_noi"),
    ("itr", models.ITR, ITRRepository, ITRService, "get_itrs", "get_itr"),
    ("itp", models.ITP, ITPRepository, ITPService, "get_itps", "get_itp"),
    ("obs", models.OBS, OBSRepository, OBSService, "get_obss", "get_obs"),
    ("pqp", models.PQP, PQPRepository, PQPService, "get_pqps", "get_pqp"),
    ("fat", models.FAT, FATRepository, FATService, "get_fats", "get_fat"),
    ("followup", models.FollowUp, FollowUpRepository, FollowUpService, "get_followups", "get_followup"),
    ("audit", models.Audit, AuditRepository, AuditService, "get_audits", "get_audit"),
    ("checklist", models.Checklist, ChecklistRepository, ChecklistService, "get_checklists", "get_checklist"),
]


def _seed_refs(db):
    for pid, name in [("P1", "Project 1"), ("P2", "Project 2")]:
        db.add(models.Project(id=pid, name=name))
    for vid, name in [("V1", "Vendor 1"), ("V2", "Vendor 2")]:
        db.add(models.Contractor(id=vid, name=name))
    db.commit()


@pytest.mark.parametrize("label,Model,RepoCls,ServiceCls,list_m,get_m", MODULES,
                         ids=[m[0] for m in MODULES])
def test_module_scope(db_session, label, Model, RepoCls, ServiceCls, list_m, get_m):
    _seed_refs(db_session)

    # The contractor FK is exposed as `contractor_id` on Checklist, `vendor_id`
    # elsewhere (Checklist's `vendor_id` is a read-only property).
    attr_keys = {a.key for a in __import__("sqlalchemy").inspect(Model).column_attrs}
    vendor_key = "contractor_id" if "contractor_id" in attr_keys else "vendor_id"

    def _row(rid, pid):
        kwargs = {"id": rid, "project_id": pid, vendor_key: "V1"}
        # Fill any NOT NULL column (without default) so the insert succeeds,
        # regardless of per-module required fields.
        for col in Model.__table__.columns:
            if col.name in kwargs or col.primary_key:
                continue
            if not col.nullable and col.default is None and col.server_default is None:
                t = col.type.python_type
                kwargs[col.name] = rid if t is str else (0 if t in (int, float) else "x")
        return Model(**kwargs)

    def _row2(rid, pid, vid):
        r = _row(rid, pid)
        setattr(r, vendor_key, vid)
        return r

    db_session.add(_row2(f"{label}-1", "P1", "V1"))   # in P1, vendor V1
    db_session.add(_row2(f"{label}-2", "P2", "V1"))   # other project
    db_session.add(_row2(f"{label}-3", "P1", "V2"))   # same project, other vendor
    db_session.commit()

    svc = ServiceCls(RepoCls(db_session))
    list_fn = getattr(svc, list_m)
    get_fn = getattr(svc, get_m)

    p1_scope = Scope(project_ids=frozenset({"P1"}), vendor_id=None)
    contractor_scope = Scope(project_ids=frozenset({"P1"}), vendor_id="V1")

    # Project scope: only P1 records (both vendors), not P2.
    seen = {x.id for x in list_fn(scope=p1_scope)}
    assert seen == {f"{label}-1", f"{label}-3"}, f"{label}: project-scope list wrong: {seen}"

    # Contractor scope: only P1 + V1.
    seen_c = {x.id for x in list_fn(scope=contractor_scope)}
    assert seen_c == {f"{label}-1"}, f"{label}: contractor-scope list wrong: {seen_c}"

    # Unscoped sees all three.
    seen_all = {x.id for x in list_fn(scope=UNSCOPED)}
    assert {f"{label}-1", f"{label}-2", f"{label}-3"} <= seen_all, f"{label}: unscoped list incomplete"

    # Single-record get is gated on both dimensions.
    assert get_fn(f"{label}-1", scope=contractor_scope) is not None, f"{label}: in-scope get returned None"
    assert get_fn(f"{label}-2", scope=contractor_scope) is None, f"{label}: other-project get leaked"
    assert get_fn(f"{label}-3", scope=contractor_scope) is None, f"{label}: other-vendor get leaked"
