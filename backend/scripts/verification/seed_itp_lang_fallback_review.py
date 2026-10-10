"""Isolated TEST SEED SCRIPT for ITP-LANG-FALLBACK-2026-001 (2026-10-07) — writes NEW test fixtures into an isolated database that
already holds the ITP-INPUT-UX seed (project IUX-P1, contractor IUX-VA). It is a seed script, not a read-only script.

Isolated stack only. Requires ITP_LANG_FALLBACK_PASSWORD in the environment (no hardcoded or defaulted password).
Adds one fresh ITP (`lang-itp-1`) whose items cover: Chinese-only, English-only, bilingual, whitespace-English + Chinese, mixed-language
criteria within one item, legacy plain-string activity/criteria, and an item with no criteria — plus one account allowed to view/update
ITPs and create/view checklists (for a real Generate Checklist).
"""
import os
from core.startup_guard import guard_if_required

if os.environ.get("QUALITAS_REQUIRE_ISOLATED_DB") != "1":
    raise RuntimeError("Use isolated_stack.py seed")
guard_if_required()

import json
import database, models
from core import perms
from core.security import get_password_hash

PW = os.environ.get("ITP_LANG_FALLBACK_PASSWORD")
if not PW:
    raise RuntimeError("ITP_LANG_FALLBACK_PASSWORD not set — refusing to seed with no password or a hardcoded fallback.")

d = database.SessionLocal()


def _perm(code):
    p = d.query(models.Permission).filter_by(code=code).first()
    if not p:
        p = models.Permission(code=code, description=code)
        d.add(p)
        d.flush()
    return p


role = models.Role(name="LangFallbackTester")
role.permissions_rel = [_perm(c) for c in (perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE, perms.CHECKLIST_VIEW,
                                           perms.CHECKLIST_CREATE, perms.CONTRACTOR_VIEW)]
d.add(role)
d.flush()
user = models.User(username="lang_tester", email="lang@example.com", is_active=True, hashed_password=get_password_hash(PW),
                   role_id=role.id, full_name="Lang Fallback Tester")
d.add(user)
d.flush()
d.add(models.UserProject(user_id=user.id, project_id="IUX-P1"))


def item(iid, activity, standard, criteria):
    return {"phase": "A", "id": iid, "activity": activity, "standard": standard, "criteria": criteria,
            "checkTime": {"en": "", "ch": ""}, "method": {"en": "", "ch": ""}, "frequency": {"en": "", "ch": ""},
            "vp": {"sub": "", "teco": "", "employer": "", "hse": ""}, "record": "-"}


detail_data = {"a": [
    item("A1", {"en": "", "ch": "僅中文活動：核對鋼筋出廠證明"}, {"en": "", "ch": "CNS 560"},
         [{"en": "", "ch": "中文準則一"}, {"en": "", "ch": "中文準則二"}]),
    item("A2", {"en": "English-only activity: check mill certificates", "ch": ""}, {"en": "ASTM A615", "ch": ""},
         [{"en": "EN criterion one", "ch": ""}]),
    item("A3", {"en": "Bilingual activity", "ch": "雙語活動"}, {"en": "ACI 318", "ch": "ACI 318"},
         [{"en": "Bilingual criterion", "ch": "雙語準則"}]),
    item("A4", {"en": "   ", "ch": "英文只有空白、中文有值的活動"}, {"en": "", "ch": "標準"},
         [{"en": "Mixed EN 1", "ch": "混合一"}, {"en": "", "ch": "混合二僅中文"}, {"en": "  ", "ch": "混合三英文空白"},
          {"en": "Mixed EN 4 only", "ch": ""}]),
    item("A5", "Legacy plain-string activity", "Legacy standard", "Legacy plain-string criteria"),
    item("A6", {"en": "", "ch": "無準則的中文活動"}, {"en": "", "ch": "標準"}, []),
], "b": [], "c": []}

d.add(models.ITP(id="lang-itp-1", project_id="IUX-P1", vendor_id="IUX-VA", referenceNo="QTS-IUX1-ITP-LANG01",
                 description="Language fallback review ITP", rev="Rev1.0", submit="Contractor", status="Pending",
                 submissionDate="2026-10-07", dueDate="2026-10-21", hasDetails=True, detail_data=json.dumps(detail_data, ensure_ascii=False)))
d.commit()
d.close()
print("SEED OK")
