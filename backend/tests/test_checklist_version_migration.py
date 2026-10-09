"""Regression test for db_migrations._add_checklist_version_columns /
_log_checklist_legacy_version_baseline (§17 isolation/traceability
hardening, 2026-09-19).

`version`/`source_template_version` are new, additive, nullable-or-defaulted
columns — the migration must not touch any existing row's data, and every
pre-existing instance must read back source_template_version=NULL (the
"historical version unknown" sentinel), never a fabricated number.
"""
from unittest.mock import patch

import db_migrations
import models


def _make_checklist(db_session, **overrides):
    base = dict(id="chk-1", recordsNo="CHK-1", status="Ongoing")
    base.update(overrides)
    chk = models.Checklist(**base)
    db_session.add(chk)
    db_session.commit()
    db_session.refresh(chk)
    return chk


def test_add_checklist_version_columns_is_idempotent(db_session):
    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._add_checklist_version_columns()
        db_migrations._add_checklist_version_columns()  # rerun must not error

    result = db_session.execute(db_migrations.text("PRAGMA table_info(checklist)"))
    columns = {row[1] for row in result}
    assert "version" in columns
    assert "source_template_version" in columns


def test_pre_existing_instance_reads_source_template_version_as_null(db_session):
    """A row created before the migration must never have a number
    fabricated for it — NULL is the correct, intentional sentinel."""
    instance = _make_checklist(db_session, id="chk-legacy", recordsNo="CHK-LEGACY", itrId="itr-1")

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._add_checklist_version_columns()

    db_session.expire_all()
    refreshed = db_session.get(models.Checklist, "chk-legacy")
    assert refreshed.source_template_version is None


def test_legacy_version_baseline_log_does_not_modify_any_row(db_session):
    _make_checklist(db_session, id="chk-legacy", recordsNo="CHK-LEGACY", itrId="itr-1")

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._add_checklist_version_columns()
        db_migrations._log_checklist_legacy_version_baseline()  # must not raise, must not write

    db_session.expire_all()
    refreshed = db_session.get(models.Checklist, "chk-legacy")
    assert refreshed.status == "Ongoing"
    assert refreshed.source_template_version is None
