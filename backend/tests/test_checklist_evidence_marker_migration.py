"""Regression tests for the checklist_evidence_marker_v2 migration
rewrite (2026-09-19), fixing an independently-reproduced bug:

    First run of _backfill_checklist_evidence_recorded_at -> create a
    brand-new blank ITR instance (evidence_recorded_at=None) -> run the
    backfill again -> the new instance got incorrectly stamped.

Root cause: the old guard was `WHERE itrId IS NOT NULL AND
evidence_recorded_at IS NULL` — a per-row check that can't tell "this row
predates the whole feature" from "this row is brand new and correctly
still has no marker yet", since NULL is the normal starting state for
both. run_migrations() calls this function on every app startup, so every
restart re-swept and re-protected genuinely untouched new rows.

Fix: a persistent `migration_flags` table tracks whether the one-time
sweep has already run, checked BEFORE touching any Checklist row. The
sweep and the flag insert commit together, in one connection/transaction
— either both persist or neither does, so a failure partway through is
always safely retryable from scratch.
"""
import json
from unittest.mock import patch

import db_migrations
import models


def _make_instance(db_session, **overrides):
    base = dict(
        id="chk-1", recordsNo="CHK-1", status="Ongoing", itrId="itr-1",
        detail_data=json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "", "result": ""}]}),
    )
    base.update(overrides)
    chk = models.Checklist(**base)
    db_session.add(chk)
    db_session.commit()
    db_session.refresh(chk)
    return chk


def _run_migration(db_session):
    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._create_migration_flags_table()
        db_migrations._add_checklist_evidence_marker_column()
        db_migrations._backfill_checklist_evidence_recorded_at()


def test_first_run_then_new_blank_instance_survives_second_and_third_restart(db_session):
    """The exact bug scenario: first migration run, then a brand-new
    blank instance is created, then the backfill runs two more times
    (simulating restarts) — the new instance must stay unmarked, and
    still be removable under the existing "no evidence" unlink rule."""
    _make_instance(db_session, id="chk-legacy", recordsNo="CHK-LEGACY", itrId="itr-legacy")
    _run_migration(db_session)  # 1st "startup" — the one-time sweep

    new_instance = _make_instance(
        db_session, id="chk-new", recordsNo="CHK-NEW", itrId="itr-new",
        detail_data=json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "", "result": ""}]}),
    )

    _run_migration(db_session)  # 2nd "startup"
    _run_migration(db_session)  # 3rd "startup"

    db_session.expire_all()
    refreshed = db_session.get(models.Checklist, "chk-new")
    assert refreshed.evidence_recorded_at is None
    assert not refreshed.evidence_historical_unknown

    from services.checklist_service import _instance_has_historical_evidence
    assert _instance_has_historical_evidence(refreshed) is False


def test_migration_flag_row_count_stays_one_across_restarts(db_session):
    _make_instance(db_session)
    _run_migration(db_session)
    _run_migration(db_session)
    _run_migration(db_session)

    count = db_session.execute(
        __import__("sqlalchemy").text(
            "SELECT COUNT(*) FROM migration_flags WHERE flag_name = 'checklist_evidence_marker_v2'"
        )
    ).scalar()
    assert count == 1


def test_old_historical_unknown_instance_stays_protected(db_session):
    """A pre-existing instance that was blank at first-migration time gets
    evidence_historical_unknown=True, no fabricated timestamp — and stays
    protected (cannot be hard-deleted / unlinked) exactly like a real
    evidence_recorded_at would protect it."""
    _make_instance(db_session, id="chk-blank-legacy", recordsNo="CHK-BLANK-LEGACY", itrId="itr-blank-legacy")
    _run_migration(db_session)

    db_session.expire_all()
    refreshed = db_session.get(models.Checklist, "chk-blank-legacy")
    assert refreshed.evidence_recorded_at is None  # no fabricated "first recorded" moment
    assert refreshed.evidence_historical_unknown is True

    from services.checklist_service import _instance_has_historical_evidence
    assert _instance_has_historical_evidence(refreshed) is True


def test_new_instance_with_real_evidence_stays_protected_after_clearing(db_session):
    """A brand-new (post-migration) instance that genuinely saves evidence
    gets a REAL evidence_recorded_at from update_checklist — and clearing
    it afterward must not lose that protection, same as the pre-migration
    rewrite's guarantee, now verified to also hold across a migration
    re-run in between."""
    from repositories.checklist_repository import ChecklistRepository
    from services.checklist_service import ChecklistService
    import schemas

    _run_migration(db_session)  # migration already "done" before this instance ever existed

    chk_svc = ChecklistService(ChecklistRepository(db_session))
    instance = _make_instance(db_session, id="chk-new-evidenced", recordsNo="CHK-NEW-EVIDENCED", itrId="itr-new-evidenced")

    chk_svc.update_checklist(
        instance.id,
        schemas.ChecklistUpdate(detail_data=json.dumps(
            {"items": [{"item": "x", "criteria": "y", "situation": "Measured 14mm", "result": ""}]}
        )),
        user_id=1, username="tester",
    )
    _run_migration(db_session)  # another "restart" in between — must not disturb the real marker

    chk_svc.update_checklist(
        instance.id,
        schemas.ChecklistUpdate(detail_data=json.dumps(
            {"items": [{"item": "x", "criteria": "y", "situation": "", "result": ""}]}
        )),
        user_id=1, username="tester",
    )

    db_session.expire_all()
    refreshed = db_session.get(models.Checklist, instance.id)
    assert refreshed.evidence_recorded_at is not None  # real marker, survived both the clear and the migration re-run
    assert not refreshed.evidence_historical_unknown  # this one has a REAL timestamp, not the "unknown" fallback

    from services.checklist_service import _instance_has_historical_evidence
    assert _instance_has_historical_evidence(refreshed) is True


def test_failed_migration_is_safely_retryable(db_session):
    """If the backfill fails partway through (simulated here as the
    _touched_fields_carry_results import itself raising), nothing should
    be half-committed — no migration_flags row, no Checklist row
    touched — and a subsequent successful run must complete normally."""
    _make_instance(db_session, id="chk-retry", recordsNo="CHK-RETRY", itrId="itr-retry")

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._create_migration_flags_table()
        db_migrations._add_checklist_evidence_marker_column()

    with patch("db_migrations.engine", db_session.get_bind()), \
         patch("services.checklist_service._touched_fields_carry_results", side_effect=RuntimeError("simulated failure")):
        db_migrations._backfill_checklist_evidence_recorded_at()  # logs a warning, does not raise

    db_session.expire_all()
    mid_flag_count = db_session.execute(
        __import__("sqlalchemy").text("SELECT COUNT(*) FROM migration_flags")
    ).scalar()
    assert mid_flag_count == 0  # failed run left no flag behind
    mid_row = db_session.get(models.Checklist, "chk-retry")
    assert mid_row.evidence_recorded_at is None
    assert not mid_row.evidence_historical_unknown  # untouched by the failed attempt

    # Retry, this time for real.
    _run_migration(db_session)

    db_session.expire_all()
    final_flag_count = db_session.execute(
        __import__("sqlalchemy").text("SELECT COUNT(*) FROM migration_flags")
    ).scalar()
    assert final_flag_count == 1
    final_row = db_session.get(models.Checklist, "chk-retry")
    assert final_row.evidence_historical_unknown is True  # blank instance, correctly classified this time
