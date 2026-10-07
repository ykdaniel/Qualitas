"""NCR / OBS / NOI date handling (2026-09-20): strict NEW writes, untouched historical reads.

Turns the investigation matrix into permanent regression tests. Real logins, real routes, brand-new Sessions for every database
assertion, file-backed SQLite.

WRITES accept only a complete, calendar-valid YYYY-MM-DD (no time stamp, no trailing characters, no whitespace, no non-existent
day; nothing truncated). The final content is validated BEFORE anything is numbered, written or audited, so a refusal (422) leaves
data, audit rows and sequences exactly as they were. Updates are judged on the MERGED content and only for what actually changes.

READS never fail because of a date: the stored value is returned untouched (NULL included) with a read-only `date_issues` list.

Named regressions (each was reproduced first on the unfixed code):
  R1  OBS / NOI update answered 500 AFTER saving a bad date (no validator on the update schemas)
  R2  NCR partial update skipped the cross-field rules (only the fields in the request were compared)
  R3  NCR create filled in the SLA due date AFTER the order check, saved, then failed the response with 500
"""
import json
import uuid

import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from core import perms, strict_dates
from core.security import get_password_hash
from test_itr_revoke_approval_acceptance import PW, Env, _get_or_create_perm


# ── harness ──────────────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def denv(tmp_path):
    from database import Base, get_db
    from routers import auth as auth_router, ncr as ncr_router, obs as obs_router, noi as noi_router, workflow as workflow_router, file_router
    import database as database_module
    import db_migrations
    engine = create_engine(f"sqlite:///{tmp_path / 'dates.db'}", connect_args={"check_same_thread": False, "timeout": 20})
    Base.metadata.create_all(engine)
    S = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    _seed(S)
    app = FastAPI()
    for r in (auth_router.router, ncr_router.router, obs_router.router, noi_router.router, workflow_router.router, file_router.router):
        app.include_router(r, prefix="/api")

    def _db():
        s = S()
        try:
            yield s
        finally:
            s.close()
    app.dependency_overrides[get_db] = _db
    orig = (database_module.engine, database_module.SessionLocal, db_migrations.engine)
    database_module.engine, database_module.SessionLocal, db_migrations.engine = engine, S, engine
    try:
        yield Env(app, S)
    finally:
        database_module.engine, database_module.SessionLocal, db_migrations.engine = orig
        Base.metadata.drop_all(engine)
        engine.dispose()


def _seed(S):
    db = S()
    try:
        def role(name, codes):
            r = models.Role(name=name)
            r.permissions_rel = [_get_or_create_perm(db, c) for c in codes]
            db.add(r)
            db.flush()
            return r
        mods = [perms.NCR_VIEW, perms.NCR_CREATE, perms.NCR_UPDATE, perms.OBS_VIEW, perms.OBS_CREATE, perms.OBS_UPDATE,
                perms.NOI_VIEW, perms.NOI_CREATE, perms.NOI_UPDATE, perms.ITP_VIEW, perms.CONTRACTOR_VIEW]
        full = role("DateUser", mods + [perms.NCR_CLOSE])            # may also CLOSE an NCR (2026-09-21: closing needs ncr:close:all)
        no_close = role("DateNoClose", mods)                          # update but NOT close
        close_only = role("DateCloseOnly", [perms.NCR_VIEW, perms.NCR_CLOSE])   # close but NOT update
        create_close = role("DateCreateClose", [perms.NCR_VIEW, perms.NCR_CREATE, perms.NCR_CLOSE])     # create + close, NOT update
        update_close = role("DateUpdateClose", [perms.NCR_VIEW, perms.NCR_UPDATE, perms.NCR_CLOSE])     # update + close, NOT create
        view = role("DateViewer", [perms.NCR_VIEW, perms.OBS_VIEW, perms.NOI_VIEW])
        db.add(models.Contractor(id="ACC-V1", name="Accept Co", abbreviation="ACC"))
        db.add(models.Contractor(id="ACC-V2", name="Beta Co", abbreviation="BET"))
        db.add(models.Project(id="P-A", name="P-A"))
        db.flush()

        def user(username, r, vendor=None, projects=()):
            u = models.User(username=username, email=f"{username}@example.com", is_active=True, hashed_password=get_password_hash(PW),
                            role_id=r.id, vendor_id=vendor)
            db.add(u)
            db.flush()
            for p in projects:
                db.add(models.UserProject(user_id=u.id, project_id=p))
        user("dt_a", full)
        user("dt_view", view)
        user("dt_noclose", no_close)
        user("dt_closeonly", close_only)
        user("dt_createclose", create_close)
        user("dt_updateclose", update_close)
        user("dt_scoped", full, "ACC-V2", ["P-A"])
        user("dt_v1", full, "ACC-V1", ["P-A"])           # scoped like the NCR rows of these tests (contractor ACC-V1)
        db.add(models.ITP(id="itp-1", referenceNo="QTS-ACC-ITP-000001", vendor_id="ACC-V1", project_id="P-A", description="i", rev="R",
                          submit="s", status="Approved"))
        db.commit()
    finally:
        db.close()


ITEM = {
    "ncr": dict(table=models.NCR, path="/api/ncr/", ref="documentNumber", date_field="raiseDate", other_field="closeoutDate"),
    "obs": dict(table=models.OBS, path="/api/obs/", ref="documentNumber", date_field="raiseDate", other_field="dueDate"),
    "noi": dict(table=models.NOI, path="/api/noi/", ref="referenceNo", date_field="issueDate", other_field="dueDate"),
}


def _body(mod, **kw):
    base = {
        "ncr": {"description": "d", "rev": "0", "submit": "", "status": "Open", "vendor": "Accept Co", "severity": "Minor", "raiseDate": "2026-09-05"},
        "obs": {"description": "d", "rev": "0", "submit": "", "status": "Open", "vendor": "Accept Co", "raiseDate": "2026-09-05"},
        "noi": {"package": "p", "issueDate": "2026-09-05", "inspectionTime": "09:00", "itpNo": "QTS-ACC-ITP-000001", "inspectionDate": "2026-09-15",
                "type": "Rebar", "contractor": "Accept Co", "status": "Open"},
    }[mod]
    return {**base, **kw}


def _add_row(env, mod, ref, **cols):
    """A row written straight to the database (a historical import): raw values, exactly as given."""
    m = ITEM[mod]["table"]
    defaults = {
        "ncr": dict(vendor_id="ACC-V1", description="hist", status="Open", rev="0", submit="", raiseDate="2026-09-02"),
        "obs": dict(vendor_id="ACC-V1", description="hist", status="Open", rev="0", submit="", raiseDate="2026-09-02"),
        "noi": dict(vendor_id="ACC-V1", package="p", status="Open", issueDate="2026-09-02", inspectionTime="09:00", itpNo="QTS-ACC-ITP-000001",
                    inspectionDate="2026-09-12", type="Rebar"),
    }[mod]
    rid = uuid.uuid4().hex
    db = env.Session()
    try:
        db.add(m(id=rid, **{ITEM[mod]["ref"]: ref}, **{**defaults, **cols}))
        db.commit()
    finally:
        db.close()
    return rid


def _raw(env, mod, rid, *fields):
    db = env.Session()
    try:
        row = db.get(ITEM[mod]["table"], rid)
        return tuple(getattr(row, f) for f in fields)
    finally:
        db.close()


def _snapshot(env):
    """Every table a write can touch, through a brand-new Session (login audit rows excluded)."""
    db = env.Session()
    try:
        cols = lambda o: json.dumps({c.name: getattr(o, c.name) for c in o.__table__.columns}, default=str, sort_keys=True)
        return {
            "ncr": sorted(cols(x) for x in db.query(models.NCR).all()),
            "obs": sorted(cols(x) for x in db.query(models.OBS).all()),
            "noi": sorted(cols(x) for x in db.query(models.NOI).all()),
            "qworkflow": sorted(cols(x) for x in db.query(models.QWorkflow).all()),
            "sequences": sorted(cols(x) for x in db.query(models.ReferenceSequence).all()),
            "audits": sorted(cols(x) for x in db.query(models.AuditLog).filter(~models.AuditLog.action.like("LOGIN%")).all()),
        }
    finally:
        db.close()


def _detail_fields(resp):
    d = resp.json()["detail"]
    return {e["loc"][-1] for e in d} if isinstance(d, list) else set()


# values that a NEW write must refuse (nothing truncated, nothing normalised)
BAD = ["garbage", "2026/09/20", "2026-9-5", "20260920", " 2026-09-20", "2026-09-20 ", "   ", "0", "2026-02-30", "2026-13-01", "2026-00-10",
       "2026-09-31", "2026-09-20T10:00:00Z", "2026-09-20T10:00:00+08:00", "2026-09-20 10:00:00", "2026-09-20T10:00:00", "2026-09-20abc",
       "2026-09-20\n"]


# ══ 0. the pure rule ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("value,code", [
    ("2026-09-20", None), (None, None), ("", None), ("2028-02-29", None), ("0001-01-01", None),
    ("garbage", "invalid_format"), ("2026/09/20", "invalid_format"), ("2026-9-5", "invalid_format"), ("0", "invalid_format"), (20260920, "invalid_format"),
    (" 2026-09-20", "whitespace"), ("2026-09-20 ", "whitespace"), ("   ", "whitespace_only"),
    ("2026-02-30", "invalid_calendar"), ("2026-13-01", "invalid_calendar"), ("2026-00-10", "invalid_calendar"), ("2026-02-29", "invalid_calendar"),
    ("2026-09-20T10:00:00Z", "timestamp"), ("2026-09-20 10:00:00", "timestamp"), ("2026-09-20T10:00", "timestamp"), ("2026-09-20T10:00:00+08:00", "timestamp"),
    ("2026-09-20abc", "trailing_characters"), ("2026-99-99xyz", "trailing_characters"), ("2026-09-20\n", "invalid_format" if False else "whitespace"),
])
def test_the_strict_rule(value, code):
    assert strict_dates.date_problem(value) == code


# ══ 1. NEW writes: create ══════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("mod", ["ncr", "obs", "noi"])
@pytest.mark.parametrize("value", BAD)
def test_create_refuses_every_bad_date_and_leaves_nothing(denv, mod, value):
    c = denv.login("dt_a")
    before = _snapshot(denv)
    for field in (ITEM[mod]["date_field"], ITEM[mod]["other_field"]):
        r = c.post(ITEM[mod]["path"], json=_body(mod, **{field: value}))
        assert r.status_code == 422, (field, r.status_code, r.text[:200])
        assert field in _detail_fields(r)
    assert _snapshot(denv) == before                         # no row, no Q-WorkFlow, no audit, no sequence consumed


@pytest.mark.parametrize("mod", ["ncr", "obs", "noi"])
def test_create_accepts_valid_dates_and_stores_exactly_what_was_sent(denv, mod):
    c = denv.login("dt_a")
    f, g = ITEM[mod]["date_field"], ITEM[mod]["other_field"]
    late = "2026-09-10" if mod == "ncr" else "2026-12-31"        # NCR: within the SLA due date the service adds (raise + 14 days)
    r = c.post(ITEM[mod]["path"], json=_body(mod, **{f: "2026-09-05", g: late}))
    assert r.status_code == 200, r.text
    assert _raw(denv, mod, r.json()["id"], f, g) == ("2026-09-05", late)
    assert r.json()["date_issues"] == []


def test_create_null_and_empty_follow_each_fields_existing_policy(denv):
    c = denv.login("dt_a")
    # NCR / OBS: every date is optional (NCR fills raiseDate itself); '' and NULL are accepted as before
    for mod, f in (("ncr", "closeoutDate"), ("obs", "raiseDate"), ("obs", "dueDate")):
        for v in (None, ""):
            r = c.post(ITEM[mod]["path"], json=_body(mod, **{f: v}))
            assert r.status_code == 200, (mod, f, v, r.text[:160])
            assert _raw(denv, mod, r.json()["id"], f)[0] == v
    r = c.post("/api/ncr/", json=_body("ncr", raiseDate=None))
    assert r.status_code == 200 and _raw(denv, "ncr", r.json()["id"], "raiseDate")[0]        # the service still fills today
    # NOI: issueDate / inspectionDate are REQUIRED — NULL refused (unchanged), '' accepted (unchanged); the optional ones accept both
    for f in ("issueDate", "inspectionDate"):
        assert c.post("/api/noi/", json=_body("noi", **{f: None})).status_code == 422
        assert c.post("/api/noi/", json=_body("noi", **{f: ""})).status_code == 200
    for f in ("closeoutDate", "dueDate"):
        for v in (None, ""):
            assert c.post("/api/noi/", json=_body("noi", **{f: v})).status_code == 200


# R3 ─ NCR create: the SLA due date is added AFTER the order check. (Since 2026-09-21 a closeout date after the due date is a legal LATE
# closure, so the case R3 was about — closeout later than the SLA-filled due date — no longer needs refusing. What must still hold: the
# final content is what is judged, a real inversion (closeout before raise) is refused BEFORE anything is written, and the SLA due date
# is kept exactly as filled in.)
@pytest.mark.parametrize("severity,due", [("Minor", "2026-09-19"), ("Major", "2026-09-12")])
def test_R3_ncr_create_is_judged_on_the_final_content_after_the_sla_due_date(denv, severity, due):
    c = denv.login("dt_a")
    before = _snapshot(denv)
    r = c.post("/api/ncr/", json=_body("ncr", severity=severity, raiseDate="2026-09-05", closeoutDate="2026-09-01"))
    assert r.status_code == 422 and _detail_fields(r) == {"closeoutDate"} and "before or equal to closeout date" in r.text
    assert _snapshot(denv) == before                         # no row, no number, no audit
    late = c.post("/api/ncr/", json=_body("ncr", severity=severity, raiseDate="2026-09-05", closeoutDate="2026-09-30"))
    assert late.status_code == 200, late.text[:200]          # a late closure is legal now
    assert _raw(denv, "ncr", late.json()["id"], "dueDate", "closeoutDate") == (due, "2026-09-30")     # the SLA due date is untouched
    assert c.get("/api/ncr/").status_code == 200


def test_ncr_create_with_a_non_existent_raise_date_is_422_not_500(denv):
    c = denv.login("dt_a")
    before = _snapshot(denv)
    for v in ("2026-02-30", "2026-13-01"):
        assert c.post("/api/ncr/", json=_body("ncr", raiseDate=v)).status_code == 422       # was: 500 from the SLA computation
    assert _snapshot(denv) == before


def test_ncr_create_order_rules_are_unchanged_and_now_on_the_final_content(denv):
    c = denv.login("dt_a")
    assert c.post("/api/ncr/", json=_body("ncr", raiseDate="2026-09-20", closeoutDate="2026-09-10")).status_code == 422
    assert c.post("/api/ncr/", json=_body("ncr", raiseDate="2026-09-20", dueDate="2026-09-10")).status_code == 422
    assert c.post("/api/ncr/", json=_body("ncr", raiseDate="2026-09-01", closeoutDate="2026-09-10", dueDate="2026-09-05")).status_code == 200      # LATE closure: legal since 2026-09-21
    assert c.post("/api/ncr/", json=_body("ncr", raiseDate="2026-09-01", closeoutDate="2026-09-05", dueDate="2026-09-05")).status_code == 200      # equal is fine


# ══ 2. NEW writes: update ══════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("mod", ["ncr", "obs", "noi"])
@pytest.mark.parametrize("value", BAD)
def test_R1_update_refuses_every_bad_date_and_saves_nothing(denv, mod, value):
    """OBS / NOI used to have NO date validator on update: the value was saved, then the response failed with 500 and the list broke."""
    rid = _add_row(denv, mod, "ROW-1")
    c = denv.login("dt_a")
    before = _snapshot(denv)
    for field in (ITEM[mod]["date_field"], ITEM[mod]["other_field"]):
        r = c.put(f"{ITEM[mod]['path']}{rid}/" if mod != "obs" else f"/api/obs/{rid}", json={field: value})
        assert r.status_code == 422, (mod, field, r.status_code, r.text[:200])
        assert field in _detail_fields(r)
    assert _snapshot(denv) == before                         # row, audit, sequences untouched (checked with a new Session)
    assert c.get(ITEM[mod]["path"]).status_code == 200       # the list still loads


def _put(c, mod, rid, body):
    return c.put(f"/api/obs/{rid}" if mod == "obs" else f"{ITEM[mod]['path']}{rid}/", json=body)


@pytest.mark.parametrize("mod", ["ncr", "obs", "noi"])
def test_update_accepts_valid_dates_exactly_and_blank_per_policy(denv, mod):
    rid = _add_row(denv, mod, "ROW-2")
    c = denv.login("dt_a")
    f, g = ITEM[mod]["date_field"], ITEM[mod]["other_field"]
    late = "2026-09-10" if mod == "ncr" else "2026-12-31"
    assert _put(c, mod, rid, {f: "2026-09-03", g: late}).status_code == 200
    assert _raw(denv, mod, rid, f, g) == ("2026-09-03", late)
    assert _put(c, mod, rid, {g: ""}).status_code == 200 and _raw(denv, mod, rid, g) == ("",)
    assert _put(c, mod, rid, {g: None}).status_code == 200 and _raw(denv, mod, rid, g) == (None,)


def test_noi_required_dates_cannot_be_set_to_null_on_update(denv):
    rid = _add_row(denv, "noi", "ROW-3")
    c = denv.login("dt_a")
    before = _snapshot(denv)
    for f in ("issueDate", "inspectionDate"):
        r = _put(c, "noi", rid, {f: None})
        assert r.status_code == 422 and f in _detail_fields(r)          # was: saved as NULL, then 500 for everyone
    assert _snapshot(denv) == before
    assert _put(c, "noi", rid, {"issueDate": ""}).status_code == 200    # '' stays accepted (existing policy)


# R2 ─ NCR partial update must be judged against the STORED values
def test_R2_ncr_partial_update_is_judged_on_the_merged_content(denv):
    rid = _add_row(denv, "ncr", "NCR-R2", raiseDate="2026-09-02", dueDate="2026-09-19")
    c = denv.login("dt_a")
    before = _snapshot(denv)
    r = _put(c, "ncr", rid, {"closeoutDate": "2026-01-01"})               # earlier than the STORED raise date; the request has no raiseDate
    assert r.status_code == 422 and "closeoutDate" in _detail_fields(r)   # was: saved, then 500 — the NCR list stopped loading
    r = _put(c, "ncr", rid, {"raiseDate": "2026-10-01"})                  # would move the raise date after the STORED due date
    assert r.status_code == 422
    r = _put(c, "ncr", rid, {"dueDate": "2026-08-01"})                    # would move the due date before the STORED raise date
    assert r.status_code == 422
    assert _snapshot(denv) == before and c.get("/api/ncr/").status_code == 200
    assert _put(c, "ncr", rid, {"closeoutDate": "2026-09-10"}).status_code == 200       # a legal value still saves
    assert _put(c, "ncr", rid, {"closeoutDate": "2026-09-30"}).status_code == 200       # later than the STORED due date: a late closure is legal (2026-09-21)


def test_ncr_severity_only_update_survives_a_historical_bad_raise_date(denv):
    rid = _add_row(denv, "ncr", "NCR-SEV", raiseDate="garbage")
    c = denv.login("dt_a")
    r = _put(c, "ncr", rid, {"severity": "Major"})                        # the SLA recomputation used to raise ValueError -> 500
    assert r.status_code == 200
    assert _raw(denv, "ncr", rid, "raiseDate") == ("garbage",)


# ══ 3. historical data: readable, untouched, described ═════════════════════════════════════════════

HIST = [  # (module, field, raw value, expected issue codes for that field)
    ("ncr", "raiseDate", "garbage", ["invalid_format"]), ("ncr", "raiseDate", "2026/09/20", ["invalid_format"]),
    ("ncr", "raiseDate", " 2026-09-20", ["whitespace"]), ("ncr", "raiseDate", "   ", ["whitespace_only"]),
    ("ncr", "raiseDate", "2026-02-30", ["invalid_calendar"]), ("ncr", "raiseDate", "2026-13-01", ["invalid_calendar"]),
    ("ncr", "raiseDate", "2026-09-20T10:00:00Z", ["timestamp"]), ("ncr", "raiseDate", "2026-09-20abc", ["trailing_characters"]),
    ("ncr", "raiseDate", None, []), ("ncr", "raiseDate", "", []), ("ncr", "dueDate", "garbage", ["invalid_format"]),
    ("obs", "raiseDate", "garbage", ["invalid_format"]), ("obs", "raiseDate", "2026/09/20", ["invalid_format"]),
    ("obs", "raiseDate", "   ", ["whitespace_only"]), ("obs", "raiseDate", "2026-02-30", ["invalid_calendar"]),
    ("obs", "raiseDate", "2026-09-20T10:00:00Z", ["timestamp"]), ("obs", "raiseDate", "2026-09-20abc", ["trailing_characters"]),
    ("obs", "raiseDate", None, []), ("obs", "verifiedDate", "garbage", ["invalid_format"]),
    ("noi", "issueDate", "20260920", ["invalid_format"]), ("noi", "issueDate", "garbage", ["invalid_format"]),
    ("noi", "issueDate", "   ", ["whitespace_only"]), ("noi", "issueDate", "2026-02-30", ["invalid_calendar"]),
    ("noi", "issueDate", "2026-09-20T10:00:00Z", ["timestamp"]), ("noi", "issueDate", None, ["missing_required"]),
    ("noi", "issueDate", "", []), ("noi", "inspectionDate", None, ["missing_required"]), ("noi", "dueDate", "garbage", ["invalid_format"]),
    ("noi", "dueDate", None, []),
]


def test_historical_anomalies_are_listed_and_read_untouched_next_to_normal_rows(denv):
    ids = {}
    for i, (mod, f, raw, codes) in enumerate(HIST):
        ids[i] = _add_row(denv, mod, f"HIST-{mod}-{i}", **{f: raw})
    normal = {mod: _add_row(denv, mod, f"OK-{mod}") for mod in ITEM}
    c = denv.login("dt_a")
    before = _snapshot(denv)
    for mod in ITEM:
        lst = c.get(ITEM[mod]["path"])
        assert lst.status_code == 200, (mod, lst.text[:200])                    # was: 500 for the whole page
        rows = {r["id"]: r for r in lst.json()}
        expected = [i for i, h in enumerate(HIST) if h[0] == mod]
        assert len(rows) == len(expected) + 1                                    # nothing dropped: every anomaly + the normal row
        assert rows[normal[mod]]["date_issues"] == []
        for i in expected:
            _, f, raw, codes = HIST[i]
            row = rows[ids[i]]
            assert row[f] == raw                                                 # the stored value, byte for byte (NULL stays null)
            assert [x["code"] for x in row["date_issues"] if x["field"] == f] == codes
            for x in row["date_issues"]:
                assert x["value"] == row[x["field"]]
            one = c.get(f"/api/obs/{ids[i]}" if mod == "obs" else f"{ITEM[mod]['path']}{ids[i]}/")
            assert one.status_code == 200 and one.json()[f] == raw and one.json()["date_issues"] == row["date_issues"]
    assert _snapshot(denv) == before                                             # reading never writes


def test_ncr_order_violations_are_reported_and_do_not_hide_the_row(denv):
    rid = _add_row(denv, "ncr", "NCR-ORDER", raiseDate="2026-09-20", closeoutDate="2026-01-01", dueDate="2026-01-05")
    c = denv.login("dt_a")
    r = c.get("/api/ncr/")
    assert r.status_code == 200 and len(r.json()) == 1
    issues = {(x["field"], x["code"], x["related_field"]) for x in r.json()[0]["date_issues"]}
    assert issues == {("closeoutDate", "raise_after_closeout", "raiseDate"), ("dueDate", "raise_after_due", "raiseDate")}
    assert r.json()[0]["closeoutDate"] == "2026-01-01"                          # untouched


def test_pagination_and_counts_are_not_distorted_by_anomalies(denv):
    for i in range(7):
        _add_row(denv, "ncr", f"NCR-P{i}", raiseDate="garbage" if i % 3 == 0 else f"2026-09-0{i + 1}")
    c = denv.login("dt_a")
    pages = [c.get("/api/ncr/", params={"skip": s, "limit": 3}).json() for s in (0, 3, 6)]
    assert [len(p) for p in pages] == [3, 3, 1]
    ids = [r["id"] for p in pages for r in p]
    assert len(ids) == len(set(ids)) == 7
    assert sum(1 for p in pages for r in p if r["date_issues"]) == 3            # the three anomalies, in the right places


def test_a_normal_row_keeps_its_existing_fields_and_only_gains_date_issues(denv):
    rid = _add_row(denv, "ncr", "NCR-SHAPE")
    c = denv.login("dt_a")
    import schemas
    row = c.get(f"/api/ncr/{rid}/").json()
    assert set(row) == set(schemas.NCR.model_fields) | {"date_issues"}
    assert row["raiseDate"] == "2026-09-02" and row["date_issues"] == []


# ══ 4. editing historical rows ═════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("mod,field,raw", [("ncr", "raiseDate", "garbage"), ("obs", "raiseDate", "2026/09/20"), ("noi", "issueDate", "20260920"),
                                             ("ncr", "raiseDate", "2026-02-30"), ("obs", "dueDate", "2026-09-20T10:00:00Z"), ("noi", "issueDate", None)])
def test_unrelated_edits_and_unchanged_resends_are_not_blocked_by_a_bad_historical_date(denv, mod, field, raw):
    rid = _add_row(denv, mod, "ROW-HIST", **{field: raw})
    c = denv.login("dt_a")
    assert _put(c, mod, rid, {"remark": "edited"}).status_code == 200                      # an unrelated field
    assert _put(c, mod, rid, {field: raw, "remark": "again"}).status_code == 200           # the historical value re-sent unchanged (the UI resends the record)
    assert _raw(denv, mod, rid, field, "remark") == (raw, "again")                          # original value preserved
    row = _put(c, mod, rid, {"remark": "third"}).json()
    assert row[field] == raw and any(x["field"] == field for x in row["date_issues"])       # still described, still untouched


@pytest.mark.parametrize("mod,field,raw", [("ncr", "raiseDate", "garbage"), ("obs", "raiseDate", "2026/09/20"), ("noi", "issueDate", "20260920")])
def test_a_real_change_must_be_valid_and_a_valid_one_repairs_the_row(denv, mod, field, raw):
    rid = _add_row(denv, mod, "ROW-FIX", **{field: raw})
    c = denv.login("dt_a")
    before = _snapshot(denv)
    assert _put(c, mod, rid, {field: "2026-99-99"}).status_code == 422                       # another bad value is a new bad write
    assert _put(c, mod, rid, {field: "2026-09-04T00:00:00Z"}).status_code == 422
    assert _snapshot(denv) == before
    r = _put(c, mod, rid, {field: "2026-09-04"})
    assert r.status_code == 200 and r.json()["date_issues"] == []
    assert _raw(denv, mod, rid, field) == ("2026-09-04",)


def test_ncr_only_relations_touched_by_the_edit_are_checked(denv):
    rid = _add_row(denv, "ncr", "NCR-REL", raiseDate="2026-09-20", closeoutDate="2026-01-01", dueDate="2026-01-05")     # two old violations
    c = denv.login("dt_a")
    assert _put(c, "ncr", rid, {"remark": "x"}).status_code == 200                           # untouched old inconsistency: not a new write
    assert _put(c, "ncr", rid, {"dueDate": "2026-01-03"}).status_code == 422                 # touches raise<=due, which is still violated
    assert _put(c, "ncr", rid, {"closeoutDate": "2026-01-01", "dueDate": "2026-01-05"}).status_code == 200      # unchanged resend
    assert _put(c, "ncr", rid, {"closeoutDate": "2026-09-25", "dueDate": "2026-10-01"}).status_code == 200      # a full, consistent repair
    assert c.get(f"/api/ncr/{rid}/").json()["date_issues"] == []


# ══ 5. protections stay ════════════════════════════════════════════════════════════════════════════

def test_a_date_repair_is_not_a_way_around_the_closed_ncr_lock(denv):
    rid = _add_row(denv, "ncr", "NCR-CLOSED", status="Closed", raiseDate="garbage", reInspectionNumber="ITR-1")
    c = denv.login("dt_a")
    before = _snapshot(denv)
    r = _put(c, "ncr", rid, {"raiseDate": "2026-09-02", "reInspectionNumber": "CHANGED"})
    assert r.status_code == 400 and "Closed" in r.text                                       # the locked quality field is still locked
    assert _snapshot(denv) == before                                                         # ... and the date was NOT saved alongside it


def test_scope_and_permission_still_decide_who_may_fix_a_date(denv):
    rid = _add_row(denv, "obs", "OBS-SCOPE", raiseDate="garbage")
    view, scoped = denv.login("dt_view"), denv.login("dt_scoped")
    before = _snapshot(denv)
    assert _put(view, "obs", rid, {"raiseDate": "2026-09-04"}).status_code == 403            # no update permission
    assert _put(scoped, "obs", rid, {"raiseDate": "2026-09-04"}).status_code == 404          # outside the account's contractor / project scope
    assert _snapshot(denv) == before


def test_a_closed_noi_is_still_locked_against_a_date_repair(denv):
    rid = _add_row(denv, "noi", "NOI-CLOSED", status="Closed", issueDate="garbage")
    c = denv.login("dt_a")
    before = _snapshot(denv)
    r = _put(c, "noi", rid, {"issueDate": "2026-09-04"})
    assert r.status_code == 400 and _snapshot(denv) == before


# ══ 6. batch endpoint keeps its semantics ══════════════════════════════════════════════════════════

def test_noi_bulk_a_bad_item_refuses_the_whole_request_before_anything_is_created(denv):
    c = denv.login("dt_a")
    before = _snapshot(denv)
    r = c.post("/api/noi/bulk/", json=[_body("noi", package="B1"), _body("noi", package="B2", issueDate="2026-02-30")])
    assert r.status_code == 422
    assert _snapshot(denv) == before                                                         # the good item was NOT created either


def test_noi_bulk_valid_items_each_get_their_row_workflow_and_audit(denv):
    c = denv.login("dt_a")
    r = c.post("/api/noi/bulk/", json=[_body("noi", package="B1"), _body("noi", package="B2", dueDate="2026-12-31")])
    assert r.status_code == 200 and len(r.json()) == 2
    s = _snapshot(denv)
    assert (len(s["noi"]), len(s["qworkflow"]), len(s["audits"])) == (2, 2, 2)


# ══ 7. the inventory only reads ════════════════════════════════════════════════════════════════════

def test_inventory_lists_anomalies_with_the_api_codes_and_changes_nothing(denv):
    from scripts.verification.date_inventory import find_date_issues
    _add_row(denv, "ncr", "NCR-I1", raiseDate="garbage")
    _add_row(denv, "ncr", "NCR-I2", raiseDate="2026-09-20", closeoutDate="2026-01-01")
    _add_row(denv, "obs", "OBS-I1", dueDate="2026-02-30")
    _add_row(denv, "noi", "NOI-I1", issueDate=None)
    _add_row(denv, "noi", "NOI-OK")
    before = _snapshot(denv)
    db = denv.Session()
    try:
        out = find_date_issues(db)
    finally:
        db.close()
    assert {ref: [i["code"] for i in issues] for ref, issues in out["NCR"]} == {"NCR-I1": ["invalid_format"], "NCR-I2": ["raise_after_closeout"]}
    assert {ref: [i["code"] for i in issues] for ref, issues in out["OBS"]} == {"OBS-I1": ["invalid_calendar"]}
    assert {ref: [i["code"] for i in issues] for ref, issues in out["NOI"]} == {"NOI-I1": ["missing_required"]}
    assert _snapshot(denv) == before


# ══ 8. mutation check ══════════════════════════════════════════════════════════════════════════════

def test_without_the_service_side_validation_the_original_holes_reopen(denv, monkeypatch):
    """Neutralise validate_date_write and R1/R2/R3 are possible again (each of them saves a bad value / order)."""
    rid_obs = _add_row(denv, "obs", "OBS-MUT")
    rid_ncr = _add_row(denv, "ncr", "NCR-MUT", raiseDate="2026-09-02", dueDate="2026-09-19")
    c = denv.login("dt_a")
    assert _put(c, "obs", rid_obs, {"raiseDate": "garbage"}).status_code == 422
    assert _put(c, "ncr", rid_ncr, {"closeoutDate": "2026-01-01"}).status_code == 422
    monkeypatch.setattr(strict_dates, "validate_date_write", lambda *a, **k: None)
    assert _put(c, "obs", rid_obs, {"raiseDate": "garbage"}).status_code == 200                 # R1 reopened (and reads are now safe)
    assert _put(c, "ncr", rid_ncr, {"closeoutDate": "2026-01-01"}).status_code == 200           # R2 reopened
    assert _raw(denv, "obs", rid_obs, "raiseDate") == ("garbage",)
