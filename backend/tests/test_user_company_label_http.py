"""IAM-USER-COMPANY-LABEL-2026-001 — "Name / Company" labels and the company-name rule.

A. `display_company` (what every "Name / Company" picker shows) is the company's
   abbreviation from the Contractors list, or its full name when it has none:
   the bound vendor for contractor-scoped users, otherwise the cosmetic
   company_name looked up by name; a name not on the list is shown as typed.
B. Creating an account requires a company name; an existing one may not be
   blanked. Accounts that predate the rule (no company) can still be edited —
   deactivated, password reset — without adding one.

Same harness as test_iam_user_security_http.py: real routes, real logins, one
session per request, assertions through a brand-new session.
"""
import models
from test_iam_user_security_http import (   # noqa: F401  (env is a fixture, re-exported on purpose)
    NEW_PW, PW, _new_user_body, env,
)


def _add_contractor(env, cid, name, abbreviation):
    db = env.Session()
    try:
        db.add(models.Contractor(id=cid, name=name, abbreviation=abbreviation))
        db.commit()
    finally:
        db.close()


def _set_user(env, username, **fields):
    """Test setup only (direct write, no audit)."""
    db = env.Session()
    try:
        u = db.query(models.User).filter_by(username=username).one()
        for k, v in fields.items():
            setattr(u, k, v)
        db.commit()
    finally:
        db.close()


def _labels(env):
    boss = env.login("theadmin")
    r = boss.get("/api/iam/users/?active_only=false")
    assert r.status_code == 200, r.text
    return {u["username"]: u["display_company"] for u in r.json()}


# ── A. display label ───────────────────────────────────────────────────────────

def test_label_uses_contractor_abbreviation_full_name_or_typed_text(env):
    _add_contractor(env, "c-hl", "Hailong", "HL")
    _add_contractor(env, "c-tbc", "TBC", None)
    _add_contractor(env, "c-blank", "Blank Abbrev Co", "   ")
    _set_user(env, "usermgr", vendor_id="c-hl", company_name="Stale Label")   # bound vendor wins over company_name
    _set_user(env, "roleusermgr", company_name="Hailong")                      # picked from the list -> its abbreviation
    _set_user(env, "ordinary", company_name="RKS")                             # typed, not on the list -> as typed
    boss = env.login("theadmin")
    for name, company in (("tbc_person", "TBC"), ("blank_person", "Blank Abbrev Co")):
        assert boss.post("/api/iam/users/", json=_new_user_body(env, name, role="Ordinary",
                                                                 company_name=company)).status_code == 200

    labels = _labels(env)

    assert labels["usermgr"] == "HL"
    assert labels["roleusermgr"] == "HL"
    assert labels["ordinary"] == "RKS"
    assert labels["tbc_person"] == "TBC"              # no abbreviation -> full name
    assert labels["blank_person"] == "Blank Abbrev Co"  # whitespace abbreviation counts as none
    assert labels["theadmin"] is None                 # predates the rule: no company at all


def test_label_for_bound_vendor_without_abbreviation_is_its_name(env):
    _add_contractor(env, "c-tbc", "TBC", None)
    _set_user(env, "usermgr", vendor_id="c-tbc")

    assert _labels(env)["usermgr"] == "TBC"


# ── B. company-name rule ──────────────────────────────────────────────────────

def test_create_without_company_is_refused_and_writes_nothing(env):
    boss = env.login("theadmin")
    before = env.state()
    for company in (None, "", "   "):
        body = _new_user_body(env, "nocompany", role="Ordinary")
        if company is None:
            body.pop("company_name")
        else:
            body["company_name"] = company
        r = boss.post("/api/iam/users/", json=body)
        assert r.status_code == 400, r.text
        assert r.json()["detail"] == "Company name is required"
    after = env.state()
    assert after["users"] == before["users"]
    assert len(after["audits"]) == len(before["audits"])


def test_create_stores_company_trimmed(env):
    boss = env.login("theadmin")
    r = boss.post("/api/iam/users/", json=_new_user_body(env, "trimmed", role="Ordinary", company_name="  Hailong  "))
    assert r.status_code == 200, r.text
    assert env.state()["users"]["trimmed"]["company_name"] == "Hailong"


def test_existing_company_cannot_be_blanked(env):
    _set_user(env, "ordinary", company_name="RKS")
    boss = env.login("theadmin")
    uid = env.user_id("ordinary")
    before = env.state()
    for blank in ("", "   "):
        r = boss.put(f"/api/iam/users/{uid}/", json={"company_name": blank, "reason": "clear it"})
        assert r.status_code == 400, r.text
        assert r.json()["detail"] == "Company name cannot be cleared"
    after = env.state()
    assert after["users"] == before["users"]
    assert len(after["audits"]) == len(before["audits"])


def test_company_can_be_changed(env):
    _set_user(env, "ordinary", company_name="RKS")
    boss = env.login("theadmin")
    r = boss.put(f"/api/iam/users/{env.user_id('ordinary')}/", json={"company_name": " Hailong ", "reason": "moved"})
    assert r.status_code == 200, r.text
    assert env.state()["users"]["ordinary"]["company_name"] == "Hailong"


def test_account_without_company_can_still_be_deactivated(env):
    boss = env.login("theadmin")
    uid = env.user_id("ordinary")
    assert env.state()["users"]["ordinary"]["company_name"] is None
    # The edit form resends the whole record; with no company, company_name is simply omitted.
    r = boss.put(f"/api/iam/users/{uid}/", json={"username": "ordinary", "email": "ordinary@example.com",
                                                 "is_active": False, "reason": "left the company"})
    assert r.status_code == 200, r.text
    after = env.state()
    assert after["users"]["ordinary"]["is_active"] is False
    assert after["audits"][-1].action == "DEACTIVATE"


def test_blank_company_resent_for_account_without_one_is_not_a_change(env):
    boss = env.login("theadmin")
    uid = env.user_id("ordinary")
    r = boss.put(f"/api/iam/users/{uid}/", json={"company_name": "", "is_active": False, "reason": "left"})
    assert r.status_code == 200, r.text
    after = env.state()["users"]["ordinary"]
    assert after["is_active"] is False and after["company_name"] is None


def test_account_without_company_can_still_have_password_reset(env):
    boss = env.login("theadmin")
    uid = env.user_id("ordinary")
    before = env.state()["users"]["ordinary"]["hashed_password"]
    r = boss.put(f"/api/iam/users/{uid}/", json={"password": NEW_PW, "reason": "forgot password"})
    assert r.status_code == 200, r.text
    assert env.state()["users"]["ordinary"]["hashed_password"] != before
    env.login("ordinary", NEW_PW)
