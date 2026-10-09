"""Q-Workflow "improvement" checkpoint on server-verified photo evidence (2026-09-21) — real logins, real routes, real files and attachment rows.

Before: the checkpoint read the NCR's own improvementPhotos JSON strings — the opposite of the NCR closure rule (measured: a valid attachment closed the
NCR but left the flow stuck; a made-up string, another NCR's path or a soft-deleted photo's path was green there and refused for closure).
Now both use core/ncr_photo_evidence.py. The rules pinned here:
  not Closed : passes only with a verified photo; else blocks with missing / invalid / legacy_unverified (an old string is never counted)
  Closed     : passes either way; "verified" with a valid photo, else "closed_unverified" with the underlying reason kept (never turned into verified)
  reopened   : the not-Closed rule again (a valid photo that is still there stays green)
  Void excluded, every NCR must pass, no NCRs = N/A — unchanged. The percentage formula is unchanged; unverified passes are COUNTED and reported.
Only the PHOTO condition is shared: a Closed NCR passing the tracker never loosens re-closing (asserted below).
"""
import uuid

import pytest
from sqlalchemy import event

import models
from ncr_photos import NOT_AN_IMAGE, add_photo
from test_date_write_guard_http import _add_row, _put, _raw, _snapshot, denv  # noqa: F401  (denv is a fixture)
from test_ncr_closure_photos_http import CLOSE, READY, attachments, upload

RAISE, DUE = "2025-01-02", "2025-01-16"
NCR_COLS = dict(READY, repairMethodStatement="fix")            # everything but a photo: MoC text present, closure-ready otherwise


def flow(env, tag, n=1, statuses=None, **cols):
    """A NOI + its Q-WorkFlow + one non-void ITR + `n` NCRs (each with everything but a photo). Returns (noi_id, [ncr ids])."""
    noi_id, ref = uuid.uuid4().hex, f"NOI-{tag}"
    db = env.Session()
    try:
        db.add(models.NOI(id=noi_id, package=f"P-{tag}", referenceNo=ref, issueDate="2026-03-01", inspectionTime="10:00", itpNo="ITP-X", inspectionDate="2026-03-02",
                          type="site", vendor_id="ACC-V1", status="In Progress"))
        db.add(models.QWorkflow(id=uuid.uuid4().hex, referenceNo=f"Q-WorkFlow-{tag}", noi_id=noi_id, createdAt="2026-03-01T00:00:00"))
        db.add(models.ITR(id=f"itr-{tag}", vendor_id="ACC-V1", documentNumber=f"ITR-{tag}", description="x", rev="A", submit="s", status="In Progress", noiNumber=ref,
                          raiseDate="2026-03-02"))
        db.commit()
    finally:
        db.close()
    ids = [_add_row(env, "ncr", f"NCR-{tag}-{k}", noiNumber=ref, **{**NCR_COLS, **({"status": statuses[k]} if statuses else {}), **cols}) for k in range(n)]
    return noi_id, ids


def improvement(c, noi_id):
    """The improvement checkpoint of that NOI's flow, plus its summary."""
    w = next(x for x in c.get("/api/workflow/", params={"limit": 500}).json() if x["noi_id"] == noi_id)
    return next(cp for cp in w["checkpoints"] if cp["key"] == "improvement"), w


def closure_photo_condition(env, c, rid):
    """Does the NCR CLOSURE accept the photos of this (open) NCR? True only when it closes; a refusal must be about the photos."""
    r = _put(c, "ncr", rid, CLOSE)
    if r.status_code == 200:
        return True
    assert r.status_code == 400 and "improvementPhotos" in r.json()["detail"], r.text[:300]
    return False


# ══ 1. every evidence category on a not-Closed NCR: tracker verdict == closure photo condition ═══════════════════════════════════════

def _valid(env, c, rid):
    add_photo(env, rid)


def _string_only(env, c, rid):
    _put(c, "ncr", rid, {"improvementPhotos": ["totally-made-up"]})


def _other_ncrs_path(env, c, rid):
    _, other = flow(env, "DONOR")
    _, path = add_photo(env, other[0])
    _put(c, "ncr", rid, {"improvementPhotos": [path]})


def _wrong_category(env, c, rid):
    add_photo(env, rid, category="defectPhoto")


def _soft_deleted(env, c, rid):
    aid = upload(c, rid).json()[0]["id"]
    assert c.delete(f"/api/files/{aid}").status_code == 200


def _soft_deleted_path_listed(env, c, rid):
    j = upload(c, rid).json()[0]
    assert c.delete(f"/api/files/{j['id']}").status_code == 200
    _put(c, "ncr", rid, {"improvementPhotos": [j["file_url"].split("/api/files/download/")[1]]})


def _file_missing(env, c, rid):
    add_photo(env, rid, write_file=False, file_name="ghost.png")


def _not_an_image(env, c, rid):
    add_photo(env, rid, content=NOT_AN_IMAGE, file_name="fake.png")


def _valid_and_legacy(env, c, rid):
    add_photo(env, rid)
    _put(c, "ncr", rid, {"improvementPhotos": ["legacy-string"]})


def _nothing(env, c, rid):
    pass


def _invalid_first_valid_second(env, c, rid):
    add_photo(env, rid, write_file=False, file_name="ghost.png", uploaded_at="2026-01-01T00:00:00")     # the FIRST attachment is unusable ...
    add_photo(env, rid, uploaded_at="2026-01-02T00:00:00")                                              # ... the second is fine


def _valid_first_invalid_second(env, c, rid):
    add_photo(env, rid, uploaded_at="2026-01-01T00:00:00")
    add_photo(env, rid, content=NOT_AN_IMAGE, file_name="fake.png", uploaded_at="2026-01-02T00:00:00")


#  case                     builder                 passes  reason of the block
CASES = [
    ("valid attachment, JSON empty", _valid, True, None),
    ("JSON arbitrary string", _string_only, False, "legacy_unverified"),
    ("another NCR's path in JSON", _other_ncrs_path, False, "legacy_unverified"),
    ("wrong category", _wrong_category, False, "missing"),
    ("soft-deleted, JSON empty", _soft_deleted, False, "missing"),
    ("soft-deleted, its path in JSON", _soft_deleted_path_listed, False, "legacy_unverified"),
    ("attachment row, file missing", _file_missing, False, "invalid"),
    ("text content named .png", _not_an_image, False, "invalid"),
    ("valid attachment + legacy JSON", _valid_and_legacy, True, None),
    ("nothing at all", _nothing, False, "missing"),
    ("first attachment unusable, second valid", _invalid_first_valid_second, True, None),
    ("first attachment valid, second unusable", _valid_first_invalid_second, True, None),
]


@pytest.mark.parametrize("label,build,passes,reason", CASES, ids=[c[0] for c in CASES])
def test_an_open_ncr_passes_the_tracker_exactly_when_its_photo_condition_would_let_it_close(denv, label, build, passes, reason):
    c = denv.login("dt_a")
    noi_id, (rid,) = flow(denv, "CASE")
    build(denv, c, rid)
    cp, w = improvement(c, noi_id)
    assert cp["blocking_reason"] == reason and (cp["blocking_ncr_id"] == (None if passes else rid)), cp
    assert cp["state"] == ("done" if passes else "current")                         # the first three checkpoints are done, so this one IS the front
    assert (cp["verified_count"], cp["unverified_count"]) == ((1, 0) if passes else (0, 0))
    assert w["unverified_photo_count"] == 0
    before = _snapshot(denv), attachments(denv)
    assert closure_photo_condition(denv, c, rid) is passes                           # the invariant: same verdict as the NCR closure's photo condition
    if not passes:
        assert (_snapshot(denv), attachments(denv)) == before                        # a refused closure changed nothing


# ══ 2. Closed NCRs: pass on status, never reported as verified unless the photo really is ═══════════════════════════════════════════

def test_a_closed_ncr_with_a_valid_photo_is_verified(denv):
    c = denv.login("dt_a")
    noi_id, (rid,) = flow(denv, "CV")
    add_photo(denv, rid)
    assert _put(c, "ncr", rid, CLOSE).status_code == 200
    cp, w = improvement(c, noi_id)
    assert (cp["state"], cp["verified_count"], cp["unverified_count"], cp["unverified_ncr_ids"], cp["blocking_ncr_id"], cp["blocking_reason"]) == ("done", 1, 0, [], None, None)
    assert w["unverified_photo_count"] == 0 and w["unverified_photo_reasons"] == {}


@pytest.mark.parametrize("build,reason", [(_nothing, "missing"), (_string_only, "legacy_unverified"), (_file_missing, "invalid"), (_wrong_category, "missing"), (_soft_deleted_path_listed, "legacy_unverified")])
def test_a_closed_ncr_without_a_verified_photo_passes_but_is_counted_as_unverified_with_its_real_reason(denv, build, reason):
    c = denv.login("dt_a")
    noi_id, (rid,) = flow(denv, "CU")
    build(denv, c, rid)
    _put(c, "ncr", rid, {"status": "Open"})                                          # no-op: open already
    db = denv.Session()                                                              # a HISTORICAL Closed row: written straight to the database, as an import would
    db.query(models.NCR).filter_by(id=rid).update({"status": "Closed", "closeoutDate": "2025-01-10", "ownerApproval": "Approved"}); db.commit(); db.close()
    cp, w = improvement(c, noi_id)
    assert cp["state"] == "done" and cp["blocking_ncr_id"] is None and cp["blocking_reason"] is None
    assert (cp["verified_count"], cp["unverified_count"], cp["unverified_ncr_ids"], cp["unverified_reasons"]) == (0, 1, [rid], {reason: 1})
    assert (w["unverified_photo_count"], w["unverified_photo_reasons"]) == (1, {reason: 1})


def test_the_percentage_formula_is_unchanged_a_verified_and_an_unverified_closed_flow_score_the_same(denv):
    c = denv.login("dt_a")
    n1, (a,) = flow(denv, "PA", statuses=["Closed"]); add_photo(denv, a)
    n2, (b,) = flow(denv, "PB", statuses=["Closed"])
    _, wa = improvement(c, n1)
    _, wb = improvement(c, n2)
    assert (wa["completion_percent"], wa["done_count"]) == (wb["completion_percent"], wb["done_count"])
    assert (wa["unverified_photo_count"], wb["unverified_photo_count"]) == (0, 1)      # only the count differs


# ══ 3. reopening ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

def test_reopening_keeps_the_pass_while_the_valid_photo_is_still_there_and_the_ncr_can_be_closed_again(denv):
    c = denv.login("dt_a")
    noi_id, (rid,) = flow(denv, "RV")
    add_photo(denv, rid)
    assert _put(c, "ncr", rid, CLOSE).status_code == 200
    assert _put(c, "ncr", rid, {"status": "Open"}).status_code == 200
    cp, _ = improvement(c, noi_id)
    assert (cp["state"], cp["verified_count"], cp["blocking_ncr_id"]) == ("done", 1, None)          # NOT turned orange
    assert _put(c, "ncr", rid, CLOSE).status_code == 200


def test_reopening_a_closed_ncr_that_only_has_an_old_string_blocks_and_re_closing_needs_a_real_photo(denv):
    c = denv.login("dt_a")
    noi_id, (rid,) = flow(denv, "RL", improvementPhotos='["/uploads/old.jpg"]')
    db = denv.Session(); db.query(models.NCR).filter_by(id=rid).update({"status": "Closed", "closeoutDate": "2025-01-10", "ownerApproval": "Approved"}); db.commit(); db.close()
    cp, w = improvement(c, noi_id)
    assert (cp["state"], cp["unverified_reasons"], w["unverified_photo_count"]) == ("done", {"legacy_unverified": 1}, 1)
    assert _put(c, "ncr", rid, {"status": "Open"}).status_code == 200
    cp, w = improvement(c, noi_id)
    assert (cp["state"], cp["blocking_ncr_id"], cp["blocking_reason"], cp["unverified_count"], w["unverified_photo_count"]) == ("current", rid, "legacy_unverified", 0, 0)
    assert closure_photo_condition(denv, c, rid) is False                            # the old string does not close it again
    assert upload(c, rid).status_code == 200
    assert improvement(c, noi_id)[0]["state"] == "done" and closure_photo_condition(denv, c, rid) is True


def test_a_closed_ncr_passing_the_tracker_never_loosens_closing_or_the_locks(denv):
    """'Closed passes the tracker without proof' is a DISPLAY rule. It must not reach the closure check, the photo lock or the re-send of Closed."""
    c = denv.login("dt_a")
    noi_id, (rid,) = flow(denv, "NL")
    db = denv.Session(); db.query(models.NCR).filter_by(id=rid).update({"status": "Closed", "closeoutDate": "2025-01-10", "ownerApproval": "Approved"}); db.commit(); db.close()
    assert improvement(c, noi_id)[0]["state"] == "done"                              # tracker: passes with no proof at all
    assert upload(c, rid).status_code == 409                                         # a Closed NCR's improvement photos stay locked
    assert _put(c, "ncr", rid, {"status": "Open"}).status_code == 200                # reopen -> the strict rule again
    assert improvement(c, noi_id)[0]["state"] == "current" and closure_photo_condition(denv, c, rid) is False


# ══ 4. several NCRs, Void, N/A, stable order ════════════════════════════════════════════════════════════════════════════════════

def test_every_ncr_must_pass_and_the_blocking_link_points_at_the_ncr_that_really_blocks(denv):
    c = denv.login("dt_a")
    noi_id, (a, b, cc) = flow(denv, "MULTI", n=3)                    # NCR-MULTI-0 (valid photo), -1 (old string only), -2 (nothing)
    add_photo(denv, a)
    _put(c, "ncr", b, {"improvementPhotos": ["legacy"]})
    cp, w = improvement(c, noi_id)
    assert (cp["state"], cp["blocking_ncr_id"], cp["blocking_reason"], cp["verified_count"]) == ("current", b, "legacy_unverified", 1)      # NOT the NCR that has evidence
    assert w["ncr_ids"] == [a, b, cc]                                # stable, by document number
    add_photo(denv, b)
    assert improvement(c, noi_id)[0]["blocking_ncr_id"] == cc and improvement(c, noi_id)[0]["blocking_reason"] == "missing"
    add_photo(denv, cc)
    cp, _ = improvement(c, noi_id)
    assert (cp["state"], cp["blocking_ncr_id"], cp["verified_count"]) == ("done", None, 3)


def test_void_ncrs_are_excluded_and_a_flow_without_ncrs_is_not_applicable(denv):
    c = denv.login("dt_a")
    noi_id, (a, v) = flow(denv, "VOID", n=2, statuses=["Open", "Void"])
    add_photo(denv, a)                                               # the Void NCR has nothing: it must not block
    cp, w = improvement(c, noi_id)
    assert (cp["state"], cp["verified_count"], cp["unverified_count"]) == ("done", 1, 0) and v not in w["ncr_ids"]
    empty_noi, none = flow(denv, "EMPTY", n=0)
    cp, w = improvement(c, empty_noi)
    assert none == [] and (cp["state"], cp["blocking_ncr_id"], cp["verified_count"], w["unverified_photo_count"]) == ("done", None, 0, 0)


def test_mixed_evidence_in_one_flow_reports_both_counts(denv):
    c = denv.login("dt_a")
    noi_id, (a, b) = flow(denv, "MIX", n=2, statuses=["Closed", "Closed"])
    add_photo(denv, a)                                               # verified today; b: Closed, nothing to verify
    cp, w = improvement(c, noi_id)
    assert (cp["state"], cp["verified_count"], cp["unverified_count"], cp["unverified_ncr_ids"], w["unverified_photo_reasons"]) == ("done", 1, 1, [b], {"missing": 1})


# ══ 5. the three endpoints agree; reads write nothing; the query count is flat ════════════════════════════════════════════════

def test_list_stats_and_needs_attention_agree_and_reading_writes_nothing(denv):
    c = denv.login("dt_a")
    flows = {}
    flows["verified"] = flow(denv, "E1", statuses=["Open"]); add_photo(denv, flows["verified"][1][0])
    flows["blocked"] = flow(denv, "E2", statuses=["Open"])
    flows["closed_unverified"] = flow(denv, "E3", statuses=["Closed"])
    before = (_snapshot(denv), attachments(denv))
    listed = c.get("/api/workflow/", params={"limit": 500}).json()
    stats = c.get("/api/workflow/stats").json()
    attention = c.get("/api/workflow/needs-attention", params={"limit": 50}).json()
    assert (_snapshot(denv), attachments(denv)) == before
    by_noi = {w["noi_id"]: w for w in listed}
    assert stats["total"] == len(listed)
    for name, lo, hi in (("bucket_0_25", 0, 25), ("bucket_26_50", 26, 50), ("bucket_51_75", 51, 75), ("bucket_76_100", 76, 100)):
        assert stats[name] == sum(1 for w in listed if lo <= w["completion_percent"] <= hi)
    for w in attention:                                              # same verdict, same numbers, same evidence detail as the list
        assert w == by_noi[w["noi_id"]]
    assert by_noi[flows["blocked"][0]]["completion_percent"] < by_noi[flows["verified"][0]]["completion_percent"]
    assert by_noi[flows["closed_unverified"][0]]["unverified_photo_count"] == 1 and by_noi[flows["verified"][0]]["unverified_photo_count"] == 0


def test_the_statement_count_of_the_list_does_not_grow_with_the_number_of_ncrs_and_files_opened_stay_per_ncr(denv, monkeypatch):
    import core.ncr_photo_evidence as ev
    c = denv.login("dt_a")

    def measure(tag, n):
        noi_id, ids = flow(denv, tag, n=n)
        for i in ids:
            add_photo(denv, i)
        opened, statements = [], []
        real = ev.stored_image_problem
        monkeypatch.setattr(ev, "stored_image_problem", lambda p, root=None: (opened.append(p), real(p, root))[1])
        engine = denv.Session().get_bind()
        listener = lambda conn, cursor, statement, *a: statements.append(statement)
        event.listen(engine, "before_cursor_execute", listener)
        try:
            assert c.get("/api/workflow/", params={"limit": 500}).status_code == 200
        finally:
            event.remove(engine, "before_cursor_execute", listener)
            monkeypatch.undo()
        return len(statements), len(opened)
    small = measure("Q3", 3)
    big = measure("Q30", 30)
    assert small[0] == big[0]                                        # the SAME number of SQL statements for 3 and 30 NCRs (the earlier flow adds its 3 NCRs)
    assert big[1] <= 3 + 30 and small[1] <= 3 + 3                    # at most one file per NCR (plus the flows already there)
