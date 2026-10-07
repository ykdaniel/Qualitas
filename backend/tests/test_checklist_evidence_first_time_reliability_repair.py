"""Regression tests for checklist_evidence_reliability_repair_v4
(2026-09-19), a follow-up fix on top of checklist_evidence_timestamp_repair_v3.

v3 fixed v2's blanket overwrite/clear bug, but v3 ITSELF had a separate,
deeper bug: it treated the EARLIEST audit_logs UPDATE entry whose
new_value showed evidence as a provable "first recorded" moment, without
checking whether that entry's old_value ALREADY had evidence (a
correction, not an introduction), and without accounting for this
codebase's historical missing-commit-after-log_audit bug — meaning
"earliest entry we can find" is not the same as "the first time this
ever happened," even when old_value looks blank.

v3's own flag (`checklist_evidence_timestamp_repair_v3`) already ran and
is NOT touched or reset by this fix — v4 is a separate, additive repair
with its own flag, that re-examines every row v3 marked reliable=True and
downgrades any that cannot actually be proven safe, while leaving alone
any row whose evidence_recorded_at postdates v3's own completion (which
can only have been set by a genuine live save afterward, since v3 never
runs again)."""
import json

import models
from models import AuditLog


def _run_v2_v3_v4(db_session):
    import db_migrations
    from unittest.mock import patch
    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._create_migration_flags_table()
        db_migrations._add_checklist_evidence_marker_column()
        db_migrations._backfill_checklist_evidence_recorded_at()
        db_migrations._add_checklist_evidence_reliability_column()
        db_migrations._repair_checklist_evidence_timestamp_provenance()
        db_migrations._repair_checklist_evidence_first_time_reliability()


def _run_v4_only(db_session):
    import db_migrations
    from unittest.mock import patch
    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._create_migration_flags_table()
        db_migrations._add_checklist_evidence_reliability_column()
        db_migrations._repair_checklist_evidence_first_time_reliability()


def _make_instance(db_session, **overrides):
    base = dict(id="chk-1", recordsNo="CHK-1", status="Ongoing", itrId="itr-1")
    base.update(overrides)
    chk = models.Checklist(**base)
    db_session.add(chk)
    db_session.commit()
    db_session.refresh(chk)
    return chk


def _insert_audit_log(db_session, entity_id, timestamp, old_value, new_value):
    log = AuditLog(
        timestamp=timestamp,
        action="UPDATE",
        entity_type="Checklist",
        entity_id=entity_id,
        old_value=json.dumps(old_value) if old_value is not None else None,
        new_value=json.dumps(new_value) if new_value is not None else None,
    )
    db_session.add(log)
    db_session.commit()


def test_old_value_already_has_evidence_is_not_treated_as_first_save(db_session):
    """The exact reproduced bug: the only visible UPDATE entry's old_value
    ALREADY shows measurement evidence, new_value is merely a corrected
    version of that same evidence. v3 (unmodified, buggy) still marks
    this reliable=True because it only looks at new_value. v4 must detect
    that old_value already had evidence too -- this is a correction, not
    an introduction -- and downgrade it to historical_unknown, preserving
    the original stamped value rather than fabricating or clearing it."""
    instance = _make_instance(
        db_session, id="chk-correction", recordsNo="CHK-CORRECTION", itrId="itr-correction",
        status="Pass", passCount=1, failCount=0,
        detail_data=json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "Measured 19mm (corrected)", "result": "O"}]}),
    )
    _insert_audit_log(
        db_session, instance.id, "2026-09-10T08:00:00",
        old_value={"status": "Pass", "passCount": 1, "failCount": 0,
                   "detail_data": json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "Measured 14mm", "result": "O"}]})},
        new_value={"detail_data": json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "Measured 19mm (corrected)", "result": "O"}]})},
    )

    _run_v2_v3_v4(db_session)
    db_session.expire_all()
    refreshed = db_session.get(models.Checklist, instance.id)

    # v3 alone would have wrongly set reliable=True here -- confirm v4
    # corrected it.
    assert refreshed.evidence_recorded_at_reliable is not True
    assert refreshed.evidence_historical_unknown is True

    from services.checklist_service import _instance_has_historical_evidence
    assert _instance_has_historical_evidence(refreshed) is True


def test_gapped_audit_history_stays_unknown_not_reliable(db_session):
    """No audit_logs entry at all corroborates this row (e.g. it predates
    when audit logging existed, or its entries were lost to the
    historical missing-commit bug) -- v3 leaves whatever value was
    already stamped (from v2's blanket sweep) but should never have
    marked it reliable in the first place. v4 must ensure it is not."""
    instance = _make_instance(
        db_session, id="chk-gapped", recordsNo="CHK-GAPPED", itrId="itr-gapped",
        status="Pass", passCount=1, failCount=0,
        detail_data=json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "Old data", "result": "O"}]}),
    )
    # No audit_logs rows at all for this checklist id.

    _run_v2_v3_v4(db_session)
    db_session.expire_all()
    refreshed = db_session.get(models.Checklist, instance.id)

    assert refreshed.evidence_recorded_at_reliable is not True
    assert refreshed.evidence_historical_unknown is True
    # v2's original stamp (or whatever v3 left) is preserved, not erased.
    assert refreshed.evidence_recorded_at is not None

    from services.checklist_service import _instance_has_historical_evidence
    assert _instance_has_historical_evidence(refreshed) is True


def test_cleared_then_refilled_later_still_not_claimed_reliable(db_session):
    """A row shows evidence, was cleared, then refilled -- multiple audit
    entries exist, including a genuine blank->evidence transition. Even
    so, because this row predates the tracking mechanism (it was in v3's
    scope, i.e. v2 already touched it), v4 must not promote it to
    reliable=True -- an even earlier, unlogged fill-then-clear cycle can
    never be ruled out for legacy data. The transition timestamp may
    still be kept as a known sighting, just not as "first"."""
    instance = _make_instance(
        db_session, id="chk-cleared-refilled", recordsNo="CHK-CLEARED-REFILLED", itrId="itr-cleared-refilled",
        status="Pass", passCount=1, failCount=0,
        detail_data=json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "Refilled value", "result": "O"}]}),
    )
    # Entry 1: genuine blank -> evidence transition (what v3 would call "the first save").
    _insert_audit_log(
        db_session, instance.id, "2026-09-01T08:00:00",
        old_value={"detail_data": json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "", "result": ""}]})},
        new_value={"detail_data": json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "First fill", "result": "O"}]})},
    )
    # Entry 2: cleared back to blank.
    _insert_audit_log(
        db_session, instance.id, "2026-09-05T08:00:00",
        old_value={"detail_data": json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "First fill", "result": "O"}]})},
        new_value={"detail_data": json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "", "result": ""}]})},
    )
    # Entry 3: refilled again.
    _insert_audit_log(
        db_session, instance.id, "2026-09-10T08:00:00",
        old_value={"detail_data": json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "", "result": ""}]})},
        new_value={"detail_data": json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "Refilled value", "result": "O"}]})},
    )

    _run_v2_v3_v4(db_session)
    db_session.expire_all()
    refreshed = db_session.get(models.Checklist, instance.id)

    assert refreshed.evidence_recorded_at_reliable is not True
    assert refreshed.evidence_historical_unknown is True
    # The earliest genuine transition (entry 1) is kept as a known
    # sighting -- more informative than a fabricated timestamp -- but
    # never labeled reliable.
    assert refreshed.evidence_recorded_at == "2026-09-01T08:00:00"

    from services.checklist_service import _instance_has_historical_evidence
    assert _instance_has_historical_evidence(refreshed) is True


def test_legitimate_new_instance_first_real_save_stays_reliable(db_session):
    """A genuinely new instance, created and live-saved AFTER v3 already
    ran (so it was never in v3's scope at all -- untouched, evidence_
    recorded_at started NULL) must still correctly become reliable=True
    via its own real first save, and v4 must not downgrade it."""
    from repositories.checklist_repository import ChecklistRepository
    from services.checklist_service import ChecklistService
    import schemas

    # v3 runs first (simulating it having already happened), on an empty table.
    import db_migrations
    from unittest.mock import patch
    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._create_migration_flags_table()
        db_migrations._add_checklist_evidence_marker_column()
        db_migrations._backfill_checklist_evidence_recorded_at()
        db_migrations._add_checklist_evidence_reliability_column()
        db_migrations._repair_checklist_evidence_timestamp_provenance()

    # A brand-new instance is created and saved AFTER that point.
    chk_svc = ChecklistService(ChecklistRepository(db_session))
    instance = _make_instance(
        db_session, id="chk-new-legit", recordsNo="CHK-NEW-LEGIT", itrId="itr-new-legit",
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
    live_ts = db_session.get(models.Checklist, instance.id).evidence_recorded_at
    assert live_ts is not None

    # v4 now runs.
    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._repair_checklist_evidence_first_time_reliability()
    db_session.expire_all()
    refreshed = db_session.get(models.Checklist, instance.id)

    assert refreshed.evidence_recorded_at == live_ts
    assert refreshed.evidence_recorded_at_reliable is True
    assert not refreshed.evidence_historical_unknown


def test_v4_repair_is_idempotent_across_restarts(db_session):
    """Running v4 repeatedly (simulating restarts) must not change
    anything after the first run, and must not touch v2/v3's own flags."""
    import db_migrations
    from unittest.mock import patch

    instance = _make_instance(
        db_session, id="chk-stable-v4", recordsNo="CHK-STABLE-V4", itrId="itr-stable-v4",
        status="Pass", passCount=1, failCount=0,
        detail_data=json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "Old data", "result": "O"}]}),
    )
    _insert_audit_log(
        db_session, instance.id, "2026-09-10T08:00:00",
        old_value={"status": "Pass", "detail_data": json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "Old data", "result": "O"}]})},
        new_value={"status": "Pass"},
    )

    _run_v2_v3_v4(db_session)
    db_session.expire_all()
    after_first = db_session.get(models.Checklist, instance.id)
    snapshot = (
        after_first.evidence_recorded_at,
        after_first.evidence_recorded_at_reliable,
        after_first.evidence_historical_unknown,
    )

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._repair_checklist_evidence_first_time_reliability()
        db_migrations._repair_checklist_evidence_first_time_reliability()
    db_session.expire_all()
    after_more_restarts = db_session.get(models.Checklist, instance.id)
    assert (
        after_more_restarts.evidence_recorded_at,
        after_more_restarts.evidence_recorded_at_reliable,
        after_more_restarts.evidence_historical_unknown,
    ) == snapshot

    v4_flag_count = db_session.execute(
        __import__("sqlalchemy").text(
            "SELECT COUNT(*) FROM migration_flags WHERE flag_name = 'checklist_evidence_reliability_repair_v4'"
        )
    ).scalar()
    assert v4_flag_count == 1

    v2_flag = db_session.execute(
        __import__("sqlalchemy").text(
            "SELECT completed_at FROM migration_flags WHERE flag_name = 'checklist_evidence_marker_v2'"
        )
    ).fetchone()
    v3_flag = db_session.execute(
        __import__("sqlalchemy").text(
            "SELECT completed_at FROM migration_flags WHERE flag_name = 'checklist_evidence_timestamp_repair_v3'"
        )
    ).fetchone()
    assert v2_flag is not None
    assert v3_flag is not None


def test_v4_no_op_when_v3_never_ran(db_session):
    """If v3's flag is absent entirely (e.g. a fresh DB that goes straight
    to a version of the code where v3's own logic is already correct, or
    a standalone unit scenario), any reliable=True row can only have come
    from a genuine live save -- v4 must leave it alone and simply record
    that it ran."""
    _run_v4_only(db_session)
    # No rows, no v3 flag -- should not raise, should record its own flag.
    flag_count = db_session.execute(
        __import__("sqlalchemy").text(
            "SELECT COUNT(*) FROM migration_flags WHERE flag_name = 'checklist_evidence_reliability_repair_v4'"
        )
    ).scalar()
    assert flag_count == 1
