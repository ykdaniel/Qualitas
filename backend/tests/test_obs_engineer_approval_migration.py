"""Regression test for db_migrations._backfill_obs_engineer_approvals.

OBS closure verification was a single `verified` field (Pending/Verified/
Rejected); split 2026-09-01 into independent Quality Engineer + Construction
Engineer sign-offs. Status now derives from BOTH new fields, so any row that
was already Verified needs both backfilled to Approved — otherwise an
already-closed observation would look reopened once the frontend switches to
the new two-field rule.
"""
from unittest.mock import patch

import db_migrations
import models


def _make_obs(db_session, **overrides):
    base = dict(
        id="obs-1", documentNumber="OBS-1", description="x", rev="0",
        submit="v", status="Closed",
    )
    base.update(overrides)
    obs = models.OBS(**base)
    db_session.add(obs)
    db_session.commit()
    db_session.refresh(obs)
    return obs


def test_backfills_verified_row_into_both_engineer_approvals(db_session):
    _make_obs(db_session, verified="Verified", verifiedDate="2026-08-01")

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._backfill_obs_engineer_approvals()

    db_session.expire_all()
    updated = db_session.get(models.OBS, "obs-1")
    assert updated.qualityEngineerApproval == "Approved"
    assert updated.qualityEngineerApprovalDate == "2026-08-01"
    assert updated.constructionEngineerApproval == "Approved"
    assert updated.constructionEngineerApprovalDate == "2026-08-01"


def test_leaves_non_verified_rows_untouched(db_session):
    _make_obs(db_session, verified="Pending", status="Open")

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._backfill_obs_engineer_approvals()

    db_session.expire_all()
    updated = db_session.get(models.OBS, "obs-1")
    assert updated.qualityEngineerApproval is None
    assert updated.constructionEngineerApproval is None


def test_is_idempotent_and_does_not_overwrite_manual_edits(db_session):
    _make_obs(db_session, verified="Verified", verifiedDate="2026-08-01")

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._backfill_obs_engineer_approvals()

    # Simulate the user manually changing the backfilled value afterward —
    # a rerun of the migration must not clobber it back (IS NULL guard).
    db_session.expire_all()
    updated = db_session.get(models.OBS, "obs-1")
    updated.qualityEngineerApproval = "Rejected"
    db_session.commit()

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._backfill_obs_engineer_approvals()

    db_session.expire_all()
    updated = db_session.get(models.OBS, "obs-1")
    assert updated.qualityEngineerApproval == "Rejected"
