"""Regression tests for checklist_evidence_timestamp_repair_v3
(2026-09-19), a follow-up fix on top of checklist_evidence_marker_v2.

v2 fixed the "re-stamps brand-new rows on every restart" bug, but v2
ITSELF had a separate, deeper bug: its one-time sweep classified every
Checklist instance based purely on CURRENT content —

  - currently has evidence -> evidence_recorded_at = v2's own run time,
    UNCONDITIONALLY OVERWRITING whatever was already stored there, even
    if it was a real timestamp from an actual prior update_checklist
    save (which always creates a corroborating audit_logs entry).
  - currently blank -> evidence_recorded_at forced to NULL, ERASING
    whatever was there, even if real.

v2's own flag (`checklist_evidence_marker_v2`) already ran and is NOT
touched or reset by this fix — v3 is a separate, additive repair with
its own flag, that reconstructs real timestamps from audit_logs where
possible and otherwise preserves whatever v2 left behind, unchanged,
just relabeled as unreliable rather than silently overwritten again.
"""
import json
from unittest.mock import patch

import db_migrations
import models
import schemas


def _run_v2_and_v3(db_session):
    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._create_migration_flags_table()
        db_migrations._add_checklist_evidence_marker_column()
        db_migrations._backfill_checklist_evidence_recorded_at()
        db_migrations._add_checklist_evidence_reliability_column()
        db_migrations._repair_checklist_evidence_timestamp_provenance()


def _run_v3_only(db_session):
    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._create_migration_flags_table()
        db_migrations._add_checklist_evidence_reliability_column()
        db_migrations._repair_checklist_evidence_timestamp_provenance()


def _make_instance(db_session, **overrides):
    base = dict(id="chk-1", recordsNo="CHK-1", status="Ongoing", itrId="itr-1")
    base.update(overrides)
    chk = models.Checklist(**base)
    db_session.add(chk)
    db_session.commit()
    db_session.refresh(chk)
    return chk


def test_existing_reliable_timestamp_not_overwritten_by_v2_then_repaired_by_v3(db_session):
    """The exact bug: a real save creates a real evidence_recorded_at (T1)
    and a corroborating audit log. v2's own (unmodified) blanket-overwrite
    logic then stamps it with its own run time (T2 != T1) because v2
    never checks whether a value already existed. v3 must detect this via
    audit_logs and restore T1, not leave T2 sitting there."""
    from repositories.checklist_repository import ChecklistRepository
    from services.checklist_service import ChecklistService

    chk_svc = ChecklistService(ChecklistRepository(db_session))
    instance = _make_instance(
        db_session, id="chk-real", recordsNo="CHK-REAL", itrId="itr-real",
        detail_data=json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "", "result": ""}]}),
    )
    chk_svc.update_checklist(
        instance.id,
        schemas.ChecklistUpdate(detail_data=json.dumps(
            {"items": [{"item": "x", "criteria": "y", "situation": "Measured 14mm", "result": ""}]}
        )),
        user_id=1, username="tester",
    )
    db_session.expire_all()
    real_ts = db_session.get(models.Checklist, instance.id).evidence_recorded_at
    assert real_ts is not None

    # The audit log's own timestamp is the ground truth v3 reconstructs
    # from — note it's a few microseconds off from real_ts above, since
    # update_checklist's own `evidence_recorded_at` and log_audit's
    # `timestamp` are two independent `datetime.now()` calls within the
    # same save; v3 can only recover the audit log's value, not bit-for-
    # bit reproduce the (already-destroyed-by-v2) original Checklist
    # column value — that's the correct, best-achievable outcome, not a
    # bug in the repair.
    audit_entry = db_session.execute(
        __import__("sqlalchemy").text(
            "SELECT timestamp FROM audit_logs WHERE entity_type='Checklist' "
            "AND entity_id=:id AND action='UPDATE' ORDER BY timestamp ASC LIMIT 1"
        ), {"id": instance.id}
    ).fetchone()
    audit_ts = audit_entry[0]

    # v2's own blanket sweep (unmodified — per the user's explicit
    # instruction not to alter v2's already-shipped logic) overwrites it.
    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._create_migration_flags_table()
        db_migrations._add_checklist_evidence_marker_column()
        db_migrations._backfill_checklist_evidence_recorded_at()
    db_session.expire_all()
    after_v2 = db_session.get(models.Checklist, instance.id).evidence_recorded_at
    assert after_v2 != real_ts  # confirms the bug actually reproduces here first

    # v3 repairs it using the audit trail.
    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._add_checklist_evidence_reliability_column()
        db_migrations._repair_checklist_evidence_timestamp_provenance()
    db_session.expire_all()
    refreshed = db_session.get(models.Checklist, instance.id)
    assert refreshed.evidence_recorded_at == audit_ts  # restored from the reliable audit trail
    assert refreshed.evidence_recorded_at != after_v2  # no longer v2's fabricated run-time guess
    assert refreshed.evidence_recorded_at_reliable is True
    assert not refreshed.evidence_historical_unknown


def test_reliable_timestamp_preserved_after_clearing_content(db_session):
    """Once v3 confirms a timestamp is reliable, clearing the observation
    afterward must not lose it — same guarantee as before, now verified
    to survive a v2+v3 migration pass in between too."""
    from repositories.checklist_repository import ChecklistRepository
    from services.checklist_service import ChecklistService

    chk_svc = ChecklistService(ChecklistRepository(db_session))
    instance = _make_instance(
        db_session, id="chk-clear", recordsNo="CHK-CLEAR", itrId="itr-clear",
        detail_data=json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "", "result": ""}]}),
    )
    chk_svc.update_checklist(
        instance.id,
        schemas.ChecklistUpdate(detail_data=json.dumps(
            {"items": [{"item": "x", "criteria": "y", "situation": "Measured 14mm", "result": ""}]}
        )),
        user_id=1, username="tester",
    )
    _run_v2_and_v3(db_session)
    db_session.expire_all()
    reliable_ts = db_session.get(models.Checklist, instance.id).evidence_recorded_at
    assert reliable_ts is not None

    chk_svc.update_checklist(
        instance.id,
        schemas.ChecklistUpdate(detail_data=json.dumps(
            {"items": [{"item": "x", "criteria": "y", "situation": "", "result": ""}]}
        )),
        user_id=1, username="tester",
    )
    db_session.expire_all()
    refreshed = db_session.get(models.Checklist, instance.id)
    assert refreshed.evidence_recorded_at == reliable_ts
    assert refreshed.evidence_recorded_at_reliable is True

    from services.checklist_service import _instance_has_historical_evidence
    assert _instance_has_historical_evidence(refreshed) is True


def test_no_corroborating_history_does_not_fabricate_a_timestamp(db_session):
    """A row with no audit trail at all (e.g. seeded directly, like real
    legacy production data) — whether it currently looks filled or blank
    — must never end up with evidence_recorded_at_reliable=True. If it
    has no evidence_recorded_at at all, v3 must not invent one; if v2
    already stamped one, v3 preserves that value but marks it
    unreliable, never silently confirms it as real."""
    _make_instance(
        db_session, id="chk-blank-legacy", recordsNo="CHK-BLANK-LEGACY", itrId="itr-blank-legacy",
        detail_data=json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "", "result": ""}]}),
        evidence_historical_unknown=True,  # simulates v2 having already processed this row
    )
    stamped_legacy = _make_instance(
        db_session, id="chk-stamped-legacy", recordsNo="CHK-STAMPED-LEGACY", itrId="itr-stamped-legacy",
        status="Pass", passCount=1, failCount=0,
        detail_data=json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "Old data", "result": "O"}]}),
        evidence_recorded_at="2020-01-01T00:00:00",  # simulates a v2-stamped value with no audit trail behind it
    )

    _run_v3_only(db_session)  # v2's column/flag not present yet — v3 must still work standalone
    db_session.expire_all()

    blank = db_session.get(models.Checklist, "chk-blank-legacy")
    assert blank.evidence_recorded_at is None
    assert blank.evidence_recorded_at_reliable is not True
    assert blank.evidence_historical_unknown is True

    stamped = db_session.get(models.Checklist, stamped_legacy.id)
    assert stamped.evidence_recorded_at == "2020-01-01T00:00:00"  # preserved, not cleared or replaced
    assert stamped.evidence_recorded_at_reliable is not True  # but never confirmed as real either
    assert stamped.evidence_historical_unknown is True

    from services.checklist_service import _instance_has_historical_evidence
    assert _instance_has_historical_evidence(blank) is True
    assert _instance_has_historical_evidence(stamped) is True


def test_repair_is_idempotent_across_restarts(db_session):
    """Running v3 repeatedly (simulating restarts) must not change
    anything after the first run — same one-time-flag contract as v2."""
    from repositories.checklist_repository import ChecklistRepository
    from services.checklist_service import ChecklistService

    chk_svc = ChecklistService(ChecklistRepository(db_session))
    instance = _make_instance(
        db_session, id="chk-stable", recordsNo="CHK-STABLE", itrId="itr-stable",
        detail_data=json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "", "result": ""}]}),
    )
    chk_svc.update_checklist(
        instance.id,
        schemas.ChecklistUpdate(detail_data=json.dumps(
            {"items": [{"item": "x", "criteria": "y", "situation": "Measured 14mm", "result": ""}]}
        )),
        user_id=1, username="tester",
    )
    _run_v2_and_v3(db_session)
    db_session.expire_all()
    after_first = db_session.get(models.Checklist, instance.id)
    snapshot = (after_first.evidence_recorded_at, after_first.evidence_recorded_at_reliable, after_first.evidence_historical_unknown)

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._repair_checklist_evidence_timestamp_provenance()
        db_migrations._repair_checklist_evidence_timestamp_provenance()
    db_session.expire_all()
    after_more_restarts = db_session.get(models.Checklist, instance.id)
    assert (after_more_restarts.evidence_recorded_at, after_more_restarts.evidence_recorded_at_reliable, after_more_restarts.evidence_historical_unknown) == snapshot

    flag_count = db_session.execute(
        __import__("sqlalchemy").text(
            "SELECT COUNT(*) FROM migration_flags WHERE flag_name = 'checklist_evidence_timestamp_repair_v3'"
        )
    ).scalar()
    assert flag_count == 1


def test_v2_flag_untouched_by_v3(db_session):
    """v3 must not delete/reset v2's own completion flag."""
    _make_instance(db_session)
    _run_v2_and_v3(db_session)

    v2_flag = db_session.execute(
        __import__("sqlalchemy").text(
            "SELECT completed_at FROM migration_flags WHERE flag_name = 'checklist_evidence_marker_v2'"
        )
    ).fetchone()
    assert v2_flag is not None
