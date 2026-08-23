"""Regression test for db_migrations._split_ncr_qty_affected_unit.

NCR.qtyAffected used to be free text ("1 joint", "5.5 m") — unusable for the
monthly-stats aggregation it's meant to feed (BACKLOG #12). This migration
splits it into a numeric qtyAffected + a separate qtyAffectedUnit.
"""
from unittest.mock import patch

import db_migrations
import models


def _make_ncr(db_session, **overrides):
    base = dict(
        id="ncr-1", documentNumber="NCR-1", description="x", rev="0",
        submit="v", status="Open",
    )
    base.update(overrides)
    ncr = models.NCR(**base)
    db_session.add(ncr)
    db_session.commit()
    db_session.refresh(ncr)
    return ncr


def test_split_extracts_number_and_unit(db_session):
    _make_ncr(db_session, qtyAffected="1 joint")

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._split_ncr_qty_affected_unit()

    db_session.expire_all()
    updated = db_session.get(models.NCR, "ncr-1")
    assert updated.qtyAffected == "1"
    assert updated.qtyAffectedUnit == "joint"


def test_split_handles_decimal_quantity_with_multi_word_unit(db_session):
    _make_ncr(db_session, qtyAffected="5.5 linear meters")

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._split_ncr_qty_affected_unit()

    db_session.expire_all()
    updated = db_session.get(models.NCR, "ncr-1")
    assert updated.qtyAffected == "5.5"
    assert updated.qtyAffectedUnit == "linear meters"


def test_split_leaves_bare_number_untouched(db_session):
    _make_ncr(db_session, qtyAffected="12")

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._split_ncr_qty_affected_unit()

    db_session.expire_all()
    updated = db_session.get(models.NCR, "ncr-1")
    assert updated.qtyAffected == "12"
    assert updated.qtyAffectedUnit is None


def test_split_is_idempotent(db_session):
    _make_ncr(db_session, qtyAffected="1 joint")

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._split_ncr_qty_affected_unit()
        db_migrations._split_ncr_qty_affected_unit()

    db_session.expire_all()
    updated = db_session.get(models.NCR, "ncr-1")
    assert updated.qtyAffected == "1"
    assert updated.qtyAffectedUnit == "joint"
