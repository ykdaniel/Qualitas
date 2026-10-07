"""core/ncr_photo_evidence.py — the ONE read-only photo condition shared by the NCR closure check and the Q-Workflow tracker (2026-09-21).

Real files under the run's temporary upload root and real attachment rows (tests/ncr_photos.py), in-memory database. What is pinned here: the batch answers
exactly what the single-NCR call answers (which is what NCR closure uses), each classification, that nothing is written, that the number of SQL
statements does not grow with the number of NCRs, and that at most one file is opened per NCR when its first photo is usable.
"""
import math
import uuid

import pytest
from sqlalchemy import event

import models
from core import ncr_photo_evidence as ev
from core.ncr_photo_evidence import INVALID, LEGACY_UNVERIFIED, MISSING, VERIFIED, classify, ncr_photo_evidence, photo_list
from ncr_photos import NOT_AN_IMAGE, add_photo
from services.ncr_service import improvement_photo_evidence


def _ncr(db, nid, **cols):
    db.add(models.NCR(id=nid, vendor_id="V", documentNumber=f"NCR-{nid}", description="d", rev="A", submit="s", status="Open", raiseDate="2026-03-01", **cols))
    db.commit()
    return nid


@pytest.fixture
def cases(db_session, sample_contractor):
    """One NCR per situation. Returns {case: ncr id}."""
    d = db_session
    out = {k: _ncr(d, k) for k in ("valid", "other", "wrong_cat", "deleted", "file_missing", "not_image", "outside", "none", "valid_and_bad", "obs_row")}
    add_photo(d, out["valid"])
    add_photo(d, out["other"], entity_type="obs")                         # a row of ANOTHER record type with a different id -> nothing for "other"
    add_photo(d, out["wrong_cat"], category="defectPhoto")
    add_photo(d, out["deleted"], deleted=True)
    add_photo(d, out["file_missing"], write_file=False, file_name="ghost.png")
    add_photo(d, out["not_image"], content=NOT_AN_IMAGE, file_name="fake.png")
    d.add(models.Attachment(id="esc", entity_type="ncr", entity_id=out["outside"], file_name="esc.png", file_path="../esc.png", mime_type="image/png",
                            category="improvementPhoto", uploaded_at="2026-03-01T00:00:00", is_deleted=False)); d.commit()
    add_photo(d, out["valid_and_bad"], write_file=False, file_name="ghost.png")      # an unusable row AND a usable one
    add_photo(d, out["valid_and_bad"])
    add_photo(d, out["obs_row"], entity_type="obs")
    return out


EXPECTED = {"valid": (True, VERIFIED), "other": (False, MISSING), "wrong_cat": (False, MISSING), "deleted": (False, MISSING), "file_missing": (False, INVALID),
            "not_image": (False, INVALID), "outside": (False, INVALID), "none": (False, MISSING), "valid_and_bad": (True, VERIFIED), "obs_row": (False, MISSING)}


def test_every_case_is_classified_as_expected_and_the_batch_agrees_with_the_single_ncr_call_closure_uses(db_session, cases):
    batch = ncr_photo_evidence(db_session, list(cases.values()))
    for name, nid in cases.items():
        verified, kind = EXPECTED[name]
        assert batch[nid].verified is verified and classify(batch[nid], False) == kind, name
        usable, problems = improvement_photo_evidence(db_session, nid)          # what NCR closure reads
        assert (usable > 0, tuple(problems)) == (batch[nid].verified, batch[nid].problems), name


def test_unusable_rows_are_described_and_a_usable_photo_hides_them(db_session, cases):
    batch = ncr_photo_evidence(db_session, list(cases.values()))
    assert "missing on the server" in batch[cases["file_missing"]].problems[0] and "ghost.png" in batch[cases["file_missing"]].problems[0]
    assert "not an image" in batch[cases["not_image"]].problems[0]
    assert "outside the upload folder" in batch[cases["outside"]].problems[0]
    assert batch[cases["valid_and_bad"]].problems == ()                        # the search stopped at the usable photo


def test_a_legacy_claim_only_matters_when_nothing_is_attached():
    assert classify(ev.PhotoEvidence(0), True) == LEGACY_UNVERIFIED
    assert classify(ev.PhotoEvidence(0), False) == MISSING
    assert classify(ev.PhotoEvidence(0, ("x: y",), 1), True) == INVALID           # attachment rows are more specific than an old string
    assert classify(ev.PhotoEvidence(1, (), 1), True) == VERIFIED


def test_photo_list_reads_a_json_string_or_a_list_and_nothing_else_is_a_claim():
    assert photo_list('["a"]') == ["a"] and photo_list(["a"]) == ["a"]
    for nothing in (None, "", "[]", "not json", '{"a": 1}', "null", 5):
        assert photo_list(nothing) == []


def test_the_check_only_reads(db_session, cases):
    def dump():
        return ([tuple(getattr(a, c.name) for c in a.__table__.columns) for a in db_session.query(models.Attachment).order_by(models.Attachment.id)],
                [tuple(getattr(n, c.name) for c in n.__table__.columns) for n in db_session.query(models.NCR).order_by(models.NCR.id)])
    before = dump()
    writes = []
    listener = lambda conn, cursor, statement, *a: writes.append(statement) if statement.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")) else None
    event.listen(db_session.get_bind(), "before_cursor_execute", listener)
    try:
        ncr_photo_evidence(db_session, list(cases.values()))
        improvement_photo_evidence(db_session, cases["valid"])
    finally:
        event.remove(db_session.get_bind(), "before_cursor_execute", listener)
    assert writes == [] and dump() == before and not db_session.new and not db_session.dirty


def test_the_number_of_queries_does_not_grow_with_the_number_of_ncrs(db_session, sample_contractor):
    def run(n):
        ids = [_ncr(db_session, f"q{n}-{i}") for i in range(n)]
        for i in ids:
            add_photo(db_session, i)
        statements = []
        listener = lambda conn, cursor, statement, *a: statements.append(statement)
        event.listen(db_session.get_bind(), "before_cursor_execute", listener)
        try:
            out = ncr_photo_evidence(db_session, ids)
        finally:
            event.remove(db_session.get_bind(), "before_cursor_execute", listener)
        assert all(v.verified for v in out.values())
        return len(statements)
    assert run(3) == run(60) == 1                                                 # one query for up to 400 ids


def test_at_most_one_file_is_opened_per_ncr_when_its_first_photo_is_usable(db_session, sample_contractor, monkeypatch):
    ids = [_ncr(db_session, f"f{i}") for i in range(5)]
    for i in ids:
        add_photo(db_session, i)
        add_photo(db_session, i)                                                  # a second photo that must not be opened
    calls = []
    real = ev.stored_image_problem
    monkeypatch.setattr(ev, "stored_image_problem", lambda p, root=None: (calls.append(p), real(p, root))[1])
    out = ncr_photo_evidence(db_session, ids)
    assert len(calls) == 5 and all(v.verified for v in out.values())


def test_more_ids_than_one_chunk_still_answer_every_id(db_session, sample_contractor, monkeypatch):
    monkeypatch.setattr(ev, "_CHUNK", 2)
    ids = [_ncr(db_session, f"c{i}") for i in range(5)]
    add_photo(db_session, ids[0]); add_photo(db_session, ids[4])
    out = ncr_photo_evidence(db_session, ids + [ids[0], "unknown-id", ""])
    assert [out[i].verified for i in ids] == [True, False, False, False, True] and out["unknown-id"].verified is False and "" not in out


def test_no_ids_no_queries(db_session):
    assert ncr_photo_evidence(db_session, []) == {}


# ══ boundaries added in the integration round (2026-09-21) ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("order", ["invalid_first", "valid_first", "same_timestamp_invalid_id_first", "same_timestamp_valid_id_first"])
def test_a_second_valid_photo_counts_whatever_order_the_rows_come_in(db_session, sample_contractor, order):
    """The first attachment of an NCR may be unusable and the second valid (or the other way round): the NCR is verified, and the single-NCR call the
    closure uses says the same. Rows are read in a fixed order (uploaded_at, then id), so a tie is decided by id — both tie orders are covered."""
    nid = _ncr(db_session, "ord")
    t1, t2 = ("2026-01-01T00:00:00", "2026-01-02T00:00:00") if order in ("invalid_first", "valid_first") else ("2026-01-01T00:00:00",) * 2
    bad_first = order in ("invalid_first", "same_timestamp_invalid_id_first")
    ids = sorted([uuid.uuid4().hex, uuid.uuid4().hex])
    bad_id, good_id = (ids[0], ids[1]) if order == "same_timestamp_invalid_id_first" else (ids[1], ids[0]) if order == "same_timestamp_valid_id_first" else (None, None)
    a, _ = add_photo(db_session, nid, write_file=False, file_name="ghost.png", uploaded_at=t1 if bad_first else t2)
    b, _ = add_photo(db_session, nid, uploaded_at=t2 if bad_first else t1)
    if bad_id:                                                                        # force the id order for the tie cases
        db_session.query(models.Attachment).filter_by(id=a).update({"id": bad_id}); db_session.query(models.Attachment).filter_by(id=b).update({"id": good_id}); db_session.commit()
    rows = db_session.query(models.Attachment).filter_by(entity_id=nid).order_by(models.Attachment.uploaded_at, models.Attachment.id).all()
    assert (rows[0].file_name == "ghost.png") is bad_first                            # the unusable row REALLY is read first (or second) in this case
    e = ncr_photo_evidence(db_session, [nid])[nid]
    assert e.verified and e.problems == () and classify(e, False) == VERIFIED
    assert improvement_photo_evidence(db_session, nid)[0] == 1                        # NCR closure reads the same


def _count_statements(db, fn):
    statements = []
    listener = lambda conn, cursor, statement, *a: statements.append(statement)
    event.listen(db.get_bind(), "before_cursor_execute", listener)
    try:
        out = fn()
    finally:
        event.remove(db.get_bind(), "before_cursor_execute", listener)
    return out, len(statements)


def test_the_batch_rule_is_400_ids_per_query_and_the_boundaries_answer_correctly(db_session, sample_contractor):
    assert ev._CHUNK == 400                                                              # the documented rule ("one query per 400 NCRs")
    ids = [f"b{i:04d}" for i in range(801)]
    for i in (0, 399, 400, 799, 800):                                                    # photos on both sides of every chunk boundary
        add_photo(db_session, ids[i])
    for n in (1, 399, 400, 401, 800, 801):
        out, count = _count_statements(db_session, lambda: ncr_photo_evidence(db_session, ids[:n]))
        assert count == math.ceil(n / 400), (n, count)                                   # 400 -> 1 query, 401 -> 2, 800 -> 2, 801 -> 3: never one per NCR
        assert {i for i in ids[:n] if out[i].verified} == {ids[i] for i in (0, 399, 400, 799, 800) if i < n}, n


def test_the_tracker_reads_evidence_in_400_id_batches_too_and_opens_one_file_per_photographed_ncr(db_session, sample_contractor, monkeypatch):
    """Through the real WorkflowService.list_workflows: the statements of a flow with n NCRs are a fixed number plus ceil(n / 400) — 400 -> 401 adds
    exactly ONE statement — and only the NCRs that have a photo cost a file open."""
    from services.workflow_service import WorkflowService
    counts, opened = {}, {}
    real = ev.stored_image_problem
    for n in (20, 399, 400, 401, 801):
        vid = f"V{n}"
        db_session.add(models.Contractor(id=vid, name=vid, abbreviation=vid[:3]))
        ref = f"NOI-{n}"
        db_session.add(models.NOI(id=f"noi-{n}", package="p", referenceNo=ref, issueDate="2026-03-01", inspectionTime="10:00", itpNo="X", inspectionDate="2026-03-02", type="site",
                                  vendor_id=vid, status="In Progress"))
        db_session.add(models.QWorkflow(id=f"q-{n}", referenceNo=f"Q-{n}", noi_id=f"noi-{n}", createdAt="2026-03-01"))
        db_session.add(models.ITR(id=f"itr-{n}", vendor_id=vid, documentNumber=f"ITR-{n}", description="x", rev="A", submit="s", status="In Progress", noiNumber=ref, raiseDate="2026-03-02"))
        db_session.bulk_save_objects([models.NCR(id=f"n{n}-{i:04d}", vendor_id=vid, documentNumber=f"NCR-{n}-{i:04d}", description="d", rev="A", submit="s", status="Open",
                                                 raiseDate="2026-03-03", noiNumber=ref, repairMethodStatement="fix") for i in range(n)])
        db_session.commit()
        photographed = sorted({0, n // 2, n - 1})
        for i in photographed:
            add_photo(db_session, f"n{n}-{i:04d}")
        calls = []
        monkeypatch.setattr(ev, "stored_image_problem", lambda p, root=None: (calls.append(p), real(p, root))[1])
        (rows), counts[n] = _count_statements(db_session, lambda: WorkflowService(db_session).list_workflows(limit=500, vendor_id=vid))
        monkeypatch.undo()
        opened[n] = len(calls)
        cp = next(c for c in rows[0]["checkpoints"] if c["key"] == "improvement")
        assert cp["verified_count"] == len(photographed) and cp["state"] == "current"        # the NCRs without a photo block
    base = {n: counts[n] - math.ceil(n / 400) for n in counts}
    assert len(set(base.values())) == 1, (counts, base)                                    # a fixed number of statements + one per 400 NCRs, whatever n is
    assert counts[401] == counts[400] + 1 and counts[400] == counts[20] == counts[399]
    assert all(opened[n] == len({0, n // 2, n - 1}) for n in counts), opened               # one file per NCR that has a photo — never one per NCR
