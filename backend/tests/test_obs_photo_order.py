"""OBS photo pairing order — obs.photoOrder — and the Closed / Void lock of the record's photo fields (OBS-PRINT-PHOTOS-2026-001).

The order is part of the OBS record and is saved through the normal update; it is locked exactly where the photos are:
a Closed OBS (unless the same save reopens it) and a Void OBS (core.attachment_access.obs_locked) refuse a CHANGED order
with 409 ATTACHMENT_LOCKED (OBSAttachmentsLocked, a coded Refusal), while
re-sending the stored order unchanged is not a change. The same lock covers defectPhotos, improvementPhotos and attachments. Reading bad stored data never fails (default order); writing
refuses anything but {"defectPhoto": [key, ...], "improvementPhoto": [key, ...]}.
"""
import json

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, text

import models
import schemas
from core.attachment_access import obs_locked
from core.refusals import RefusalHTTPException
from repositories.obs_repository import OBSRepository
from services.obs_service import OBSAttachmentsLocked, OBSService

ORDER = {"defectPhoto": ["att:b", "legacy:1a2b3c4d:0", "att:a"], "improvementPhoto": ["att:c"]}


def _make_obs(db_session, **overrides):
    base = dict(id="obs-1", documentNumber="OBS-1", description="x", rev="0", submit="v", status="Open",
                qualityEngineerApproval="Pending", constructionEngineerApproval="Pending")
    base.update(overrides)
    db_session.add(models.OBS(**base))
    db_session.commit()


def _update(db_session, **fields):
    return OBSService(OBSRepository(db_session)).update_obs("obs-1", schemas.OBSUpdate(**fields), user_id=None, username="t")


def _stored(db_session):
    db_session.expire_all()
    return db_session.query(models.OBS).filter(models.OBS.id == "obs-1").one().photoOrder


# ── saving ─────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_open_obs_saves_the_order_as_json_and_reads_it_back_as_an_object(db_session):
    _make_obs(db_session)
    _update(db_session, photoOrder=ORDER)
    assert json.loads(_stored(db_session)) == ORDER
    row = db_session.query(models.OBS).filter(models.OBS.id == "obs-1").one()
    assert schemas.OBS.model_validate(row).photoOrder == ORDER


def test_a_save_without_photoOrder_leaves_the_stored_order_alone(db_session):
    _make_obs(db_session, photoOrder=json.dumps(ORDER))
    _update(db_session, remark="only the remark")
    assert json.loads(_stored(db_session)) == ORDER


def test_create_accepts_an_order(db_session):
    from unittest.mock import patch
    svc = OBSService(OBSRepository(db_session))
    with patch("services.obs_service.generate_reference_no", return_value="OBS-NEW"):
        created = svc.create_obs(schemas.OBSCreate(description="d", rev="0", submit="v", status="Open", photoOrder=ORDER),
                                 user_id=None, username="t")
    assert json.loads(created.photoOrder) == ORDER


# ── lock: Closed / Void ────────────────────────────────────────────────────────────────────────────────────────────

def test_closed_obs_refuses_a_changed_order(db_session):
    _make_obs(db_session, status="Closed", photoOrder=json.dumps(ORDER))
    changed = {"defectPhoto": ["att:a", "legacy:1a2b3c4d:0", "att:b"], "improvementPhoto": ["att:c"]}
    with pytest.raises(OBSAttachmentsLocked) as e:
        _update(db_session, photoOrder=changed)
    assert e.value.params == {"kind": "record", "docType": "OBS", "status": "Closed"}
    assert json.loads(_stored(db_session)) == ORDER


def test_closed_obs_refuses_a_first_order_too(db_session):
    _make_obs(db_session, status="Closed")
    with pytest.raises(OBSAttachmentsLocked):
        _update(db_session, photoOrder=ORDER)
    assert _stored(db_session) is None


def test_closed_obs_accepts_the_same_order_resent_in_another_json_spelling(db_session):
    # stored with different key order / spacing — the same data is not a change
    _make_obs(db_session, status="Closed",
              photoOrder='{ "improvementPhoto": ["att:c"],  "defectPhoto": ["att:b", "legacy:1a2b3c4d:0", "att:a"] }')
    _update(db_session, photoOrder=ORDER, remark="re-save")


def test_closed_obs_treats_empty_lists_and_no_order_alike(db_session):
    _make_obs(db_session, status="Closed")
    _update(db_session, photoOrder={"defectPhoto": [], "improvementPhoto": []})
    _update(db_session, photoOrder=None)


def test_closed_obs_accepts_a_new_order_in_the_save_that_reopens_it(db_session):
    _make_obs(db_session, status="Closed", photoOrder=json.dumps(ORDER))
    reordered = {"defectPhoto": ["att:a"], "improvementPhoto": ["att:c"]}
    _update(db_session, status="Open", photoOrder=reordered)
    assert json.loads(_stored(db_session)) == reordered


def test_void_obs_refuses_a_changed_order(db_session):
    _make_obs(db_session, status="Void", photoOrder=json.dumps(ORDER))
    with pytest.raises(OBSAttachmentsLocked) as e:
        _update(db_session, photoOrder={"defectPhoto": ["att:a"]})
    assert e.value.params["status"] == "Void"
    assert json.loads(_stored(db_session)) == ORDER


def test_router_answers_409_for_a_locked_order():
    from routers import obs as obs_router

    class _Svc:
        def update_obs(self, **_):
            raise OBSAttachmentsLocked("Closed")

    class _User:
        id, username = 1, "t"

    with pytest.raises(HTTPException) as e:
        obs_router.update_obs("obs-1", schemas.OBSUpdate(photoOrder=ORDER), obs_service=_Svc(), scope=None, current_user=_User())
    assert isinstance(e.value, RefusalHTTPException)
    assert e.value.status_code == 409
    assert e.value.code == "ATTACHMENT_LOCKED"
    assert e.value.params == {"kind": "record", "docType": "OBS", "status": "Closed"}
    assert "locked" in e.value.detail


@pytest.mark.parametrize("status, locked", [("Closed", True), ("Void", True), ("Open", False), ("In Progress", False),
                                            ("Resolved", False), (None, False), ("", False)])
def test_obs_locked_is_closed_or_void(status, locked):
    assert obs_locked(status) is locked


# ── shape ──────────────────────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("bad", [
    "not json",
    [["att:a"]],
    {"attachment": ["att:a"]},                       # only the two photo categories
    {"defectPhoto": "att:a"},
    {"defectPhoto": [1, 2]},
    {"defectPhoto": [""]},
    {"defectPhoto": ["x" * 121]},
    {"defectPhoto": ["att:a"] * 501},
])
def test_writes_refuse_any_other_shape(bad):
    with pytest.raises(ValidationError):
        schemas.OBSUpdate(photoOrder=bad)
    with pytest.raises(ValidationError):
        schemas.OBSCreate(description="d", rev="0", submit="v", status="Open", photoOrder=bad)


def test_writes_accept_a_json_string_of_the_right_shape():
    assert schemas.OBSUpdate(photoOrder=json.dumps(ORDER)).photoOrder == ORDER


@pytest.mark.parametrize("stored", ["not json", "[1]", '{"other": ["a"]}', '{"defectPhoto": [1]}'])
def test_reading_bad_stored_data_falls_back_to_no_order(stored):
    row = models.OBS(id="o", documentNumber="O", description="d", rev="0", submit="v", status="Open", photoOrder=stored)
    assert schemas.OBS.model_validate(row).photoOrder is None


# ── migration ──────────────────────────────────────────────────────────────────────────────────────────────────────

def test_migration_adds_the_column_to_an_existing_database(tmp_path, monkeypatch):
    import db_migrations
    from database import Base
    engine = create_engine(f"sqlite:///{tmp_path / 'm.db'}")
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE obs DROP COLUMN photoOrder"))
    assert "photoOrder" not in {c["name"] for c in inspect(engine).get_columns("obs")}
    monkeypatch.setattr(db_migrations, "engine", engine)
    db_migrations._add_missing_columns()
    assert "photoOrder" in {c["name"] for c in inspect(engine).get_columns("obs")}


# ── the four photo / attachment fields: Closed and Void refuse a change, a reopening save may change them ─────────

FIELD_CHANGES = {
    "defectPhotos": (["data:image/png;base64,AAAA"], ["data:image/png;base64,BBBB"]),
    "improvementPhotos": (["data:image/png;base64,AAAA"], []),
    "attachments": (["old.pdf"], ["old.pdf", "new.pdf"]),
    "photoOrder": (ORDER, {"defectPhoto": ["att:a"]}),
}


def _stored_json(field, value):
    return json.dumps(value)


@pytest.mark.parametrize("status", ["Closed", "Void"])
@pytest.mark.parametrize("field", list(FIELD_CHANGES))
def test_locked_obs_refuses_a_change_to_each_photo_field(db_session, status, field):
    old, new = FIELD_CHANGES[field]
    _make_obs(db_session, status=status, **{field: _stored_json(field, old)})
    with pytest.raises(OBSAttachmentsLocked) as e:
        _update(db_session, **{field: new})
    assert str(e.value) == f"Cannot change attachments of a {status} OBS: the record is locked."
    assert e.value.code == "ATTACHMENT_LOCKED"
    assert e.value.params == {"kind": "record", "docType": "OBS", "status": status}
    assert e.value.fields == [field]
    db_session.expire_all()
    assert json.loads(getattr(db_session.query(models.OBS).filter(models.OBS.id == "obs-1").one(), field)) == old


@pytest.mark.parametrize("status", ["Closed", "Void"])
def test_locked_obs_accepts_the_whole_form_resent_unchanged(db_session, status):
    """The form sends every field on each save; unchanged values (also NULL vs []) are not a change."""
    _make_obs(db_session, status=status, defectPhotos='["data:image/png;base64,AAAA"]', improvementPhotos=None,
              attachments="[]", photoOrder=json.dumps(ORDER))
    _update(db_session, defectPhotos=["data:image/png;base64,AAAA"], improvementPhotos=[], attachments=None,
            photoOrder=ORDER, remark="re-save")


def test_closed_obs_reopened_in_the_same_save_may_change_all_four(db_session):
    _make_obs(db_session, status="Closed", **{f: _stored_json(f, old) for f, (old, _) in FIELD_CHANGES.items()})
    _update(db_session, status="Open", **{f: new for f, (_, new) in FIELD_CHANGES.items()})
    db_session.expire_all()
    row = db_session.query(models.OBS).filter(models.OBS.id == "obs-1").one()
    assert row.status == "Open"
    for f, (_, new) in FIELD_CHANGES.items():
        assert json.loads(getattr(row, f)) == new


def test_closed_obs_after_reopen_may_change_them_in_a_later_save(db_session):
    _make_obs(db_session, status="Closed", attachments='["old.pdf"]')
    _update(db_session, status="Open")
    _update(db_session, attachments=["old.pdf", "new.pdf"])
    assert json.loads(_stored(db_session) or "null") is None             # photoOrder untouched
    db_session.expire_all()
    assert json.loads(db_session.query(models.OBS).filter(models.OBS.id == "obs-1").one().attachments) == ["old.pdf", "new.pdf"]


def test_open_obs_is_not_locked(db_session):
    _make_obs(db_session, status="Open", attachments='["old.pdf"]')
    _update(db_session, **{f: new for f, (_, new) in FIELD_CHANGES.items()})


@pytest.mark.parametrize("field", list(FIELD_CHANGES))
def test_closed_to_void_is_not_a_reopen_for_the_photo_fields(db_session, field):
    """Voiding a Closed OBS must not change its evidence on the way (only a reopen to an unlocked status may)."""
    old, new = FIELD_CHANGES[field]
    _make_obs(db_session, status="Closed", **{field: _stored_json(field, old)})
    with pytest.raises(OBSAttachmentsLocked) as e:
        _update(db_session, status="Void", **{field: new})
    assert e.value.params["status"] == "Closed"
    db_session.expire_all()
    row = db_session.query(models.OBS).filter(models.OBS.id == "obs-1").one()
    assert row.status == "Closed"
    assert json.loads(getattr(row, field)) == old


def test_closed_to_void_without_photo_changes_is_allowed(db_session):
    _make_obs(db_session, status="Closed", attachments='["old.pdf"]', photoOrder=json.dumps(ORDER))
    _update(db_session, status="Void", attachments=["old.pdf"], photoOrder=ORDER)
    db_session.expire_all()
    assert db_session.query(models.OBS).filter(models.OBS.id == "obs-1").one().status == "Void"


@pytest.mark.parametrize("target", ["Open"])
def test_closed_reopened_to_an_unlocked_status_may_change_the_photo_fields(db_session, target):
    _make_obs(db_session, status="Closed", attachments='["old.pdf"]')
    _update(db_session, status=target, attachments=["new.pdf"])
    db_session.expire_all()
    assert json.loads(db_session.query(models.OBS).filter(models.OBS.id == "obs-1").one().attachments) == ["new.pdf"]


# ── a blank status is "no status change" (it used to bypass the transition check and the lock) ─────────────────────

@pytest.mark.parametrize("blank", ["", "   "])
def test_blank_status_is_normalised_to_no_change(blank):
    assert schemas.OBSUpdate(status=blank).status is None


@pytest.mark.parametrize("blank", ["", "  "])
@pytest.mark.parametrize("field", list(FIELD_CHANGES))
def test_closed_with_blank_status_still_refuses_photo_field_changes(db_session, blank, field):
    old, new = FIELD_CHANGES[field]
    _make_obs(db_session, status="Closed", **{field: _stored_json(field, old)})
    with pytest.raises(OBSAttachmentsLocked):
        _update(db_session, status=blank, **{field: new})
    db_session.expire_all()
    row = db_session.query(models.OBS).filter(models.OBS.id == "obs-1").one()
    assert row.status == "Closed"
    assert json.loads(getattr(row, field)) == old


@pytest.mark.parametrize("blank", ["", "  "])
def test_closed_with_blank_status_still_refuses_a_product_disposition_change(db_session, blank):
    _make_obs(db_session, status="Closed", productDisposition="Repair")
    with pytest.raises(ValueError) as e:
        _update(db_session, status=blank, productDisposition="Use as is")
    assert not isinstance(e.value, OBSAttachmentsLocked)             # the existing Closed rule (router: 400)
    assert "Closed observation" in str(e.value)
    db_session.expire_all()
    row = db_session.query(models.OBS).filter(models.OBS.id == "obs-1").one()
    assert (row.status, row.productDisposition) == ("Closed", "Repair")


def test_blank_or_null_status_never_stores_an_empty_status(db_session):
    _make_obs(db_session, status="Open")
    _update(db_session, status="", remark="a")
    _update(db_session, status=None, remark="b")
    db_session.expire_all()
    assert db_session.query(models.OBS).filter(models.OBS.id == "obs-1").one().status == "Open"


def test_router_answers_400_for_the_product_disposition_rule_with_blank_status(db_session):
    from routers import obs as obs_router

    class _User:
        id, username = 1, "t"

    _make_obs(db_session, status="Closed", productDisposition="Repair")
    with pytest.raises(HTTPException) as e:
        obs_router.update_obs("obs-1", schemas.OBSUpdate(status="", productDisposition="Use as is"),
                              obs_service=OBSService(OBSRepository(db_session)), scope=None, current_user=_User())
    assert e.value.status_code == 400
