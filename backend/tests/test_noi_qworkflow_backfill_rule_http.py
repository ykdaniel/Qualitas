"""One rule for "does this NOI get its own Q-WorkFlow row?", used by BOTH the create path and the start-up back-fill (2026-09-20).

Create path (unchanged): a NOI whose `ncrNumber` is falsy (NULL / '') is an ordinary NOI and gets a Q-WorkFlow row; a NOI
with a truthy `ncrNumber` is a RE-INSPECTION NOI and shares the original NOI's tracker (a second row would double-count
the thread). Before this change the back-fill ignored that and gave every NOI without a row one — including re-inspection
NOIs — so a restart quietly created the rows the create path had deliberately not created.

The recognition policy is NOT changed: no trimming, no new normalisation — whatever the create path treats as "has an
ncrNumber" (e.g. '   ' is truthy) the back-fill treats the same way. Existing rows are never deleted, merged or renumbered.
"""
import json
import uuid
from datetime import datetime

import pytest

import models
from test_noi_create_atomic_http import noi_env, _create, _snapshot, _counts   # noqa: F401  (fixture re-export)


def _backfill():
    import db_migrations
    db_migrations._backfill_qworkflows()


def _add_noi(env, ref, ncr=None, with_row=None, package="HIST"):
    """A historical NOI written straight to the database, optionally with an existing Q-WorkFlow row."""
    db = env.Session()
    try:
        n = models.NOI(id=uuid.uuid4().hex, referenceNo=ref, package=package, status="Open", vendor_id="ACC-V1", project_id="P-A",
                       issueDate="2026-01-01", inspectionTime="09:00", itpNo="QTS-ACC-ITP-000001", inspectionDate="2026-01-02",
                       type="Rebar", ncrNumber=ncr)
        db.add(n)
        db.flush()
        if with_row:
            db.add(models.QWorkflow(id=uuid.uuid4().hex, referenceNo=with_row, noi_id=n.id, createdAt="2026-01-03T00:00:00+00:00"))
        db.commit()
        return n.id
    finally:
        db.close()


def _rows(env):
    db = env.Session()
    try:
        return {q.noi_id: (q.id, q.referenceNo, q.createdAt) for q in db.query(models.QWorkflow).all()}
    finally:
        db.close()


# ══ 1-2. the two create cases, then repeated back-fills ═════════════════════════════════════════════

def test_an_ordinary_noi_has_its_row_at_once_and_repeated_backfills_add_nothing(noi_env):
    env, _ = noi_env
    c = env.login("noi_a")
    noi_id = _create(c).json()["id"]
    before = _rows(env)
    assert list(before) == [noi_id] and before[noi_id][1] == "Q-WorkFlow-000001"
    for _ in range(3):
        _backfill()
    assert _rows(env) == before                                                        # same row, same id, same number, same timestamp


def test_a_reinspection_noi_gets_no_row_and_repeated_backfills_do_not_add_one(noi_env):
    env, _ = noi_env
    c = env.login("noi_a")
    assert _create(c, ncrNumber="NCR-1", type="Re-inspection").status_code == 200
    assert _counts(env)["qworkflow"] == 0
    for _ in range(3):
        _backfill()
    assert _counts(env)["qworkflow"] == 0                                              # (was 1 after the first restart before this fix)
    assert c.get("/api/workflow/").json() == []


# ══ 3-5. historical data ════════════════════════════════════════════════════════════════════════════

def test_a_historical_ordinary_noi_without_a_row_is_completed_exactly_once(noi_env):
    env, _ = noi_env
    nid = _add_noi(env, "QTS-ACC-NOI-800001")
    _backfill()
    first = _rows(env)
    assert list(first) == [nid] and first[nid][1] == "Q-WorkFlow-000001"
    _backfill()
    _backfill()
    assert _rows(env) == first


def test_a_historical_reinspection_noi_that_already_has_a_row_keeps_it_untouched(noi_env):
    env, _ = noi_env
    nid = _add_noi(env, "QTS-ACC-NOI-800002", ncr="NCR-7", with_row="Q-WorkFlow-000042")
    before = _snapshot(env)
    _backfill()
    _backfill()
    assert _snapshot(env) == before                                                    # not deleted, merged, renumbered or re-timestamped
    assert _rows(env)[nid][1] == "Q-WorkFlow-000042"


def test_mixed_history_only_genuinely_missing_ordinary_rows_are_added_and_reruns_are_stable(noi_env):
    env, _ = noi_env
    have_ord = _add_noi(env, "QTS-ACC-NOI-800010", with_row="Q-WorkFlow-000005")
    have_re = _add_noi(env, "QTS-ACC-NOI-800011", ncr="NCR-1", with_row="Q-WorkFlow-000009")
    miss_none = _add_noi(env, "QTS-ACC-NOI-800012", ncr=None)
    miss_empty = _add_noi(env, "QTS-ACC-NOI-800013", ncr="")
    miss_re = _add_noi(env, "QTS-ACC-NOI-800014", ncr="NCR-2")
    miss_ws = _add_noi(env, "QTS-ACC-NOI-800015", ncr="   ")                          # truthy for the create path => "has an ncrNumber"
    existing = _rows(env)
    _backfill()
    after = _rows(env)
    assert {k: after[k] for k in existing} == existing                                # everything that was there is byte-identical
    assert set(after) - set(existing) == {miss_none, miss_empty}                       # ONLY the two ordinary ones were added
    assert miss_re not in after and miss_ws not in after
    numbers = sorted(v[1] for k, v in after.items() if k in (miss_none, miss_empty))
    assert numbers == ["Q-WorkFlow-000010", "Q-WorkFlow-000011"]                      # numbering continues after the highest existing
    for _ in range(3):
        _backfill()
    assert _rows(env) == after                                                        # re-running changes nothing


@pytest.mark.parametrize("value", [None, "", "   ", "NCR-1", "0"])
def test_create_and_backfill_decide_identically_for_every_ncrnumber_value(noi_env, value):
    """The recognition policy is shared, not re-implemented: create it through the API, then present the SAME value to
    the back-fill on a row that has no Q-WorkFlow — both must agree (and no trimming/normalising is introduced)."""
    env, _ = noi_env
    created = _create(env.login("noi_a"), **({} if value is None else {"ncrNumber": value})).json()
    create_gave_row = created["id"] in _rows(env)
    hist = _add_noi(env, "QTS-ACC-NOI-810000", ncr=value)
    _backfill()
    backfill_gave_row = hist in _rows(env)
    assert create_gave_row == backfill_gave_row == (not value)


# ══ 6. the original thread can still see its re-inspection progress ═════════════════════════════════

def _thread(env, variant):
    """original NOI X -> ITR-1 (failed, Void) -> NCR (noiNumber X, itrNumber ITR-1) -> re-inspection NOI R (ncrNumber = that NCR)
    -> re-inspection ITR (originalItrId = ITR-1, Pass, Approved). variant 'string': the NCR records the re-inspection ITR's number;
    'typed': it does not (only ITR.originalItrId links them); 'under_R': the re-inspection ITR is filed under R instead of X."""
    c = env.login("noi_a")
    x = _create(c, package="ORIGINAL").json()
    db = env.Session()
    try:
        itr1 = models.ITR(id=uuid.uuid4().hex, vendor_id="ACC-V1", documentNumber="ITR-ORIG", description="d", rev="R", submit="s",
                          status="Void", raiseDate="2026-09-20", noiNumber=x["referenceNo"], inspectionResult="Fail")
        db.add(itr1)
        db.flush()
        ncr = models.NCR(id=uuid.uuid4().hex, documentNumber="NCR-CHAIN-1", vendor_id="ACC-V1", noiNumber=x["referenceNo"], itrNumber="ITR-ORIG",
                         description="d", status="Closed", raiseDate="2026-09-20", rev="0", submit="",
                         repairMethodStatement="rebuild", improvementPhotos=json.dumps(["p.jpg"]),
                         reInspectionNumber="ITR-REINSP" if variant != "typed" else None)
        db.add(ncr)
        db.commit()
        ncr_no, itr1_id = ncr.documentNumber, itr1.id
    finally:
        db.close()
    r = _create(c, package="REINSPECTION", ncrNumber=ncr_no, type="Re-inspection").json()          # the re-inspection NOI (no own row)
    db = env.Session()
    try:
        db.add(models.ITR(id=uuid.uuid4().hex, vendor_id="ACC-V1", documentNumber="ITR-REINSP", description="d", rev="R", submit="s",
                          status="Approved", raiseDate="2026-09-21", inspectionResult="Pass", isReInspection=True, originalItrId=itr1_id,
                          noiNumber=r["referenceNo"] if variant == "under_R" else x["referenceNo"]))
        db.commit()
    finally:
        db.close()
    return c, x, r


def _row_for(c, noi_ref):
    rows = [w for w in c.get("/api/workflow/").json() if w["noi_reference_no"] == noi_ref]
    return rows[0] if rows else None


def _cp(row):
    return {cp["key"]: cp for cp in row["checkpoints"]}


def test_valid_thread_the_original_row_reads_complete_and_the_reinspection_noi_needs_no_row(noi_env):
    """The designed flow: the re-inspection ITR (Pass, Approved) is filed under the ORIGINAL NOI and the NCR records its number."""
    env, _ = noi_env
    c, x, r = _thread(env, "string")
    before = _row_for(c, x["referenceNo"])
    for _ in range(3):
        _backfill()
    after = _row_for(c, x["referenceNo"])
    assert after == before                                                             # no back-fill changes the original's row
    cp = _cp(after)
    assert cp["reinspection"]["state"] == "done" and cp["itr"]["state"] == "done"      # re-inspection progress IS found through the NCR
    assert cp["close_ncr"]["state"] == "done" and cp["accepted"]["state"] == "done" and after["completion_percent"] == 100
    assert _row_for(c, r["referenceNo"]) is None and len(c.get("/api/workflow/").json()) == 1


def test_the_original_row_does_not_depend_on_whether_the_reinspection_noi_has_a_row(noi_env):
    """Control: give the re-inspection NOI a row by hand (what the old back-fill did on every restart). The ORIGINAL's row is identical
    with or without it — so skipping that row loses nothing the original shows."""
    env, _ = noi_env
    c, x, r = _thread(env, "string")
    without = _row_for(c, x["referenceNo"])
    db = env.Session()
    db.add(models.QWorkflow(id=uuid.uuid4().hex, referenceNo="Q-WorkFlow-000099", noi_id=r["id"], createdAt="2026-09-21T00:00:00+00:00"))
    db.commit(); db.close()
    assert _row_for(c, x["referenceNo"]) == without


def test_typed_link_only_the_itr_checkpoint_still_finds_the_reinspection_the_text_checkpoint_waits_for_the_number(noi_env):
    """The NCR does NOT record the re-inspection ITR's number (only ITR.originalItrId links them). Existing rule, unchanged: checkpoint
    'reinspection' needs that text, so the linear front stops there — but the 'itr' rule itself finds the passed re-inspection (no blocking NCR)."""
    env, _ = noi_env
    c, x, r = _thread(env, "typed")
    before = _row_for(c, x["referenceNo"])
    _backfill(); _backfill()
    after = _row_for(c, x["referenceNo"])
    assert after == before
    cp = _cp(after)
    assert cp["reinspection"]["state"] == "current" and cp["reinspection"]["blocking_ncr_id"]      # waiting for the typed number
    assert cp["itr"]["blocking_ncr_id"] is None                                                    # ... the re-inspection ITR is found via originalItrId


def test_break_point_reinspection_itr_filed_under_the_reinspection_noi_the_original_never_reaches_wh_inspection(noi_env):
    """CONCRETE BREAK POINT (reported, not fixed here; independent of the back-fill — the original's row is the same with or without a row for
    the re-inspection NOI): when the re-inspection ITR is filed under the re-inspection NOI R and the original's only ITR is Void, the original's
    'W/H Inspection' (needs a non-Void ITR linked to the ORIGINAL NOI) can never be satisfied, so the tracker stops at column 2. The 'itr'
    rule itself still finds the passed re-inspection through the NCR's number."""
    env, _ = noi_env
    c, x, r = _thread(env, "under_R")
    before = _row_for(c, x["referenceNo"])
    _backfill(); _backfill()
    after = _row_for(c, x["referenceNo"])
    assert after == before
    cp = _cp(after)
    assert cp["wh_inspection"]["state"] == "current" and after["completion_percent"] < 100
    assert cp["itr"]["blocking_ncr_id"] is None
    assert _row_for(c, r["referenceNo"]) is None


# ══ historical extra rows: reported, never changed ═════════════════════════════════════════════════

def test_inventory_reports_existing_rows_of_reinspection_nois_and_changes_nothing(noi_env):
    from scripts.verification.noi_workflow_inventory import find_reinspection_noi_rows
    env, _ = noi_env
    _add_noi(env, "QTS-ACC-NOI-820001", ncr=None, with_row="Q-WorkFlow-000001")
    _add_noi(env, "QTS-ACC-NOI-820002", ncr="NCR-5", with_row="Q-WorkFlow-000002")      # an "extra" row made by an old restart
    _add_noi(env, "QTS-ACC-NOI-820003", ncr="NCR-6")                                     # re-inspection NOI without a row: not reported
    before = _snapshot(env)
    db = env.Session()
    try:
        n, hits = find_reinspection_noi_rows(db)
    finally:
        db.close()
    assert n == 1 and "Q-WorkFlow-000002" in hits[0] and "QTS-ACC-NOI-820002" in hits[0]
    assert _snapshot(env) == before                                                      # read-only
