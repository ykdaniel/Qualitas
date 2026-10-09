"""Tests for the document naming rules settings endpoints.

Covers the 2026-08-25 hardening: OSD was missing from DEFAULT_NAMING_RULES
(so it could never be customized), and update_naming_rules had no
validation at all (empty prefix, missing [ABBREV] placeholder, or two doc
types sharing a prefix would all silently save).
"""
import pytest
from fastapi import HTTPException

import models
import schemas
from routers.settings import get_naming_rules, update_naming_rules, DEFAULT_NAMING_RULES


def test_osd_is_in_default_naming_rules():
    doc_types = {r["doc_type"] for r in DEFAULT_NAMING_RULES}
    assert "osd" in doc_types


def test_get_naming_rules_seeds_missing_doc_type_on_partially_populated_table(db_session):
    # Simulate a deployment whose table was already populated before "osd"
    # existed in DEFAULT_NAMING_RULES — only insert the non-osd defaults.
    for r in DEFAULT_NAMING_RULES:
        if r["doc_type"] != "osd":
            db_session.add(models.DocumentNamingRule(**r))
    db_session.commit()

    result = get_naming_rules(db=db_session, current_user=None)
    doc_types = {r.doc_type for r in result}
    assert "osd" in doc_types


def test_update_naming_rules_rejects_empty_prefix(db_session):
    rules = [schemas.NamingRuleBase(doc_type="ncr", prefix="", sequence_digits=6)]
    with pytest.raises(HTTPException) as excinfo:
        update_naming_rules(rules=rules, db=db_session, _user=None)
    assert excinfo.value.status_code == 400
    assert "empty" in excinfo.value.detail.lower()


def test_update_naming_rules_rejects_missing_abbrev_placeholder(db_session):
    rules = [schemas.NamingRuleBase(doc_type="ncr", prefix="QTS-RKS-NCR-", sequence_digits=6)]
    with pytest.raises(HTTPException) as excinfo:
        update_naming_rules(rules=rules, db=db_session, _user=None)
    assert excinfo.value.status_code == 400
    assert "abbrev" in excinfo.value.detail.lower()


def test_update_naming_rules_rejects_duplicate_prefix(db_session):
    rules = [
        schemas.NamingRuleBase(doc_type="ncr", prefix="QTS-RKS-[ABBREV]-DUP-", sequence_digits=6),
        schemas.NamingRuleBase(doc_type="obs", prefix="QTS-RKS-[ABBREV]-DUP-", sequence_digits=6),
    ]
    with pytest.raises(HTTPException) as excinfo:
        update_naming_rules(rules=rules, db=db_session, _user=None)
    assert excinfo.value.status_code == 400
    assert "collide" in excinfo.value.detail.lower()


def test_update_naming_rules_accepts_valid_rules(db_session):
    rules = [
        schemas.NamingRuleBase(doc_type="ncr", prefix="QTS-RKS-[ABBREV]-NCR-", sequence_digits=6),
        schemas.NamingRuleBase(doc_type="osd", prefix="QTS-RKS-[ABBREV]-OSD-", sequence_digits=6),
    ]
    result = update_naming_rules(rules=rules, db=db_session, _user=None)
    doc_types = {r.doc_type: r.prefix for r in result}
    assert doc_types["ncr"] == "QTS-RKS-[ABBREV]-NCR-"
    assert doc_types["osd"] == "QTS-RKS-[ABBREV]-OSD-"
