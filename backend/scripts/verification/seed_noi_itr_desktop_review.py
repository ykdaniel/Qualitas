"""Isolated TEST SEED SCRIPT for NOI-ITR-DESKTOP-REVIEW-2026-001 (2026-10-07) — writes test fixtures to an isolated database; it is a
seed script, not a read-only script.

Isolated stack only. Requires NOI_ITR_DESKTOP_REVIEW_PASSWORD in the environment (no hardcoded or defaulted password).

Realistic-length data for a first-time site engineer walkthrough: one project, two contractors, one approved ITP with real inspection
items (so a NEW NOI can pick Project / Contractor / ITP / Event No.), and three existing NOIs:
  1. QTS-NDR1-NOI-000001 — no ITR filed yet.
  2. QTS-NDR1-NOI-000002 — one normal ITR (In Progress).
  3. QTS-NDR1-NOI-000003 — original ITR failed (Reject / Fail) -> NCR -> re-inspection ITR (same shape create_reinspection() produces:
     subject/description copied verbatim, isReInspection, originalItrId, reInspectionCount=1).
"""
import os
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import json
import database, models
from core.security import get_password_hash

PW = os.environ.get("NOI_ITR_DESKTOP_REVIEW_PASSWORD")
if not PW:
    raise RuntimeError("NOI_ITR_DESKTOP_REVIEW_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _perm(code):
    p = d.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        d.add(p)
        d.flush()
    return p


role = models.Role(name="NOIITRDesktopReview")
role.permissions_rel = [_perm(c) for c in (
    "noi:view:all", "noi:create:all", "noi:update:all",
    "itr:view:all", "itr:create:all", "itr:update:all",
    "itp:view:all", "ncr:view:all", "contractors:view:all",
)]
d.add(role)
d.flush()
user = models.User(username="site_engineer", email="site.engineer@example.com", is_active=True,
                   hashed_password=get_password_hash(PW), role_id=role.id, full_name="Lin Site Engineer")
d.add(user)
d.add(models.Project(id="NDR-P1", name="Kaohsiung Harbour Logistics Centre – Phase 2", code="NDR1"))
d.add(models.Contractor(id="NDR-V1", name="Formosa Heavy Structural Engineering Co., Ltd.", abbreviation="FHS",
                         package="Structural Steel & RC Works", scope="Superstructure", status="active",
                         contactPerson="Chen Wei-Ting", email="wt.chen@formosa-hs.example.com", phone="07-555-1234 ext. 208",
                         address="88 Linhai 2nd Rd., Xiaogang Dist., Kaohsiung"))
d.add(models.Contractor(id="NDR-V2", name="Southern MEP Integration Services Ltd.", abbreviation="SMI",
                         package="MEP Works", scope="Building Services", status="active",
                         contactPerson="Huang Mei-Ling", email="ml.huang@southern-mep.example.com", phone="07-555-8899",
                         address="12 Zhonghua 5th Rd., Qianzhen Dist., Kaohsiung"))
d.flush()
d.add(models.UserProject(user_id=user.id, project_id="NDR-P1"))


def item(phase, iid, en, ch, crit_en, crit_ch, vp):
    return {"phase": phase, "id": iid, "activity": {"en": en, "ch": ch},
            "standard": {"en": "Project Specification Section 05 12 00; AWS D1.1/D1.1M:2020", "ch": "專案規範 05 12 00；AWS D1.1/D1.1M:2020"},
            "criteria": [{"en": crit_en, "ch": crit_ch}],
            "checkTime": {"en": "Before erection of each column line", "ch": "每一柱列吊裝前"},
            "method": {"en": "Visual inspection, ultrasonic testing of CJP welds", "ch": "目視檢查，全滲透焊道超音波檢測"},
            "frequency": {"en": "Each column", "ch": "每支柱"}, "vp": vp, "record": "-"}


detail = {"a": [item("A", "A1", "Verify mill certificates and welding procedure specifications for built-up box columns",
                     "核對組合箱型柱之鋼材出廠證明與銲接程序書", "Heat numbers traceable to approved mill certificates",
                     "爐號可追溯至核准之出廠證明", {"sub": "W", "teco": "R", "employer": "", "hse": ""})],
          "b": [item("B", "B1", "Inspect column base plate grouting, anchor bolt projection and plumbness before beam erection",
                     "鋼梁吊裝前檢查柱底板灌漿、錨栓外露長度及柱垂直度", "Plumbness within H/1000 and not more than 25 mm",
                     "垂直度在 H/1000 以內且不超過 25 mm", {"sub": "H", "teco": "H", "employer": "W", "hse": ""}),
                item("B", "B2", "Inspect complete-joint-penetration welds at beam-to-column moment connections, levels 3F to 5F",
                     "檢查 3F 至 5F 梁柱剛接全滲透銲道", "UT acceptance per AWS D1.1 Table 8.2, no rejectable indications",
                     "依 AWS D1.1 表 8.2 超音波檢測無不合格指示", {"sub": "H", "teco": "H", "employer": "H", "hse": ""})],
          "c": []}
d.add(models.ITP(id="ndr-itp-1", project_id="NDR-P1", vendor_id="NDR-V1", referenceNo="QTS-NDR1-ITP-000001",
                 description="Structural Steel Erection and Welding Inspection and Test Plan for Warehouse Block B Superstructure",
                 rev="Rev2.0", submit="Contractor", status="Approved", submissionDate="2026-09-15",
                 hasDetails=True, detail_data=json.dumps(detail, ensure_ascii=False)))
d.commit()


def make_noi(noi_id, ref, package, event, checkpoint, date):
    n = models.NOI(id=noi_id, project_id="NDR-P1", vendor_id="NDR-V1", package=package, referenceNo=ref,
                   issueDate="2026-10-01", inspectionDate=date, inspectionTime="09:30", itpNo="QTS-NDR1-ITP-000001",
                   eventNumber=event, checkpoint=checkpoint, type="Inspection", contacts="Chen Wei-Ting",
                   phone="07-555-1234 ext. 208", email="wt.chen@formosa-hs.example.com", status="Open",
                   foundLocation="Warehouse Block B, Grid C-D / 3-7, Level 3F", discipline="Civil")
    d.add(n)
    d.flush()
    return n


noi1 = make_noi("ndr-noi-1", "QTS-NDR1-NOI-000001",
                "Column base plate grouting, anchor bolt projection and plumbness check before steel beam erection – Block B, Grid C/3 to D/7",
                "B1", "H", "2026-10-09")
noi2 = make_noi("ndr-noi-2", "QTS-NDR1-NOI-000002",
                "Mill certificate and WPS verification for built-up box columns BC-01 to BC-24 delivered on 2026-09-28",
                "A1", "W", "2026-10-02")
d.add(models.ITR(id="ndr-itr-2", project_id="NDR-P1", vendor_id="NDR-V1", documentNumber="QTS-NDR1-ITR-000001",
                 subject="Mill certificate and WPS verification for built-up box columns BC-01 to BC-24",
                 description="Mill certificate and WPS verification for built-up box columns BC-01 to BC-24",
                 rev="0", submit="Contractor", status="In Progress", raiseDate="2026-10-02", noiNumber=noi2.referenceNo))
noi3 = make_noi("ndr-noi-3", "QTS-NDR1-NOI-000003",
                "UT inspection of CJP moment-connection welds, beam-to-column joints levels 3F to 5F, Grid C/3 to D/7",
                "B2", "H", "2026-09-22")
subj = "UT inspection of CJP moment-connection welds, levels 3F to 5F"
d.add(models.ITR(id="ndr-itr-3-orig", project_id="NDR-P1", vendor_id="NDR-V1", documentNumber="QTS-NDR1-ITR-000002",
                 subject=subj, description=subj, rev="0", submit="Contractor", status="Reject", inspectionResult="Fail",
                 raiseDate="2026-09-22", noiNumber=noi3.referenceNo))
d.add(models.NCR(id="ndr-ncr-3", project_id="NDR-P1", vendor_id="NDR-V1", documentNumber="QTS-NDR1-NCR-000001",
                 subject="Rejectable UT indications at C/5 level 4F moment connection",
                 description="Rejectable UT indications at C/5 level 4F moment connection", status="Opening",
                 raiseDate="2026-09-22", noiNumber=noi3.referenceNo, itrNumber="QTS-NDR1-ITR-000002",
                 reInspectionNumber="QTS-NDR1-ITR-000003"))
d.add(models.ITR(id="ndr-itr-3-reinsp", project_id="NDR-P1", vendor_id="NDR-V1", documentNumber="QTS-NDR1-ITR-000003",
                 subject=subj, description=subj, rev="0", submit="", status="In Progress", raiseDate="2026-09-29",
                 noiNumber=noi3.referenceNo, isReInspection=True, originalItrId="ndr-itr-3-orig", reInspectionCount=1))
d.commit()
d.close()
print("SEED OK")
