"""Regression test for db_migrations._structure_ncr_tbc_na_fields.

The TBC/N/A buttons used to write the literal string "To be confirmed" or
"Not Applicable" directly into free-text NCR fields, making "which NCRs still
have a field marked TBC" unqueryable without fragile string matching. This
migration converts any exact-match legacy value into the companion
`<field>Status` column ('TBC' / 'NA') and clears the text field (BACKLOG
item 6).
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


def test_structures_to_be_confirmed_into_tbc_status(db_session):
    _make_ncr(db_session, repairMethodStatement="To be confirmed")

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._structure_ncr_tbc_na_fields()

    db_session.expire_all()
    updated = db_session.get(models.NCR, "ncr-1")
    assert updated.repairMethodStatement is None
    assert updated.repairMethodStatementStatus == "TBC"


def test_structures_not_applicable_into_na_status(db_session):
    _make_ncr(db_session, directCause="Not Applicable")

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._structure_ncr_tbc_na_fields()

    db_session.expire_all()
    updated = db_session.get(models.NCR, "ncr-1")
    assert updated.directCause is None
    assert updated.directCauseStatus == "NA"


def test_leaves_real_content_untouched(db_session):
    _make_ncr(db_session, rootCauseAnalysis="Weld porosity due to moisture.")

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._structure_ncr_tbc_na_fields()

    db_session.expire_all()
    updated = db_session.get(models.NCR, "ncr-1")
    assert updated.rootCauseAnalysis == "Weld porosity due to moisture."
    assert updated.rootCauseAnalysisStatus is None


def test_handles_all_seven_fields(db_session):
    _make_ncr(
        db_session,
        repairMethodStatement="To be confirmed",
        immediateCorrectionAction="Not Applicable",
        rootCauseAnalysis="To be confirmed",
        correctiveActions="Not Applicable",
        preventiveAction="To be confirmed",
        effectivenessNotes="Not Applicable",
        directCause="To be confirmed",
    )

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._structure_ncr_tbc_na_fields()

    db_session.expire_all()
    updated = db_session.get(models.NCR, "ncr-1")
    assert updated.repairMethodStatement is None and updated.repairMethodStatementStatus == "TBC"
    assert updated.immediateCorrectionAction is None and updated.immediateCorrectionActionStatus == "NA"
    assert updated.rootCauseAnalysis is None and updated.rootCauseAnalysisStatus == "TBC"
    assert updated.correctiveActions is None and updated.correctiveActionsStatus == "NA"
    assert updated.preventiveAction is None and updated.preventiveActionStatus == "TBC"
    assert updated.effectivenessNotes is None and updated.effectivenessNotesStatus == "NA"
    assert updated.directCause is None and updated.directCauseStatus == "TBC"


def test_is_idempotent(db_session):
    _make_ncr(db_session, repairMethodStatement="To be confirmed")

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._structure_ncr_tbc_na_fields()
        db_migrations._structure_ncr_tbc_na_fields()

    db_session.expire_all()
    updated = db_session.get(models.NCR, "ncr-1")
    assert updated.repairMethodStatement is None
    assert updated.repairMethodStatementStatus == "TBC"
