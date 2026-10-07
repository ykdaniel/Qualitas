"""A legacy NULL ITP reference must not break the entire NOI read response."""
import pytest
import runpy
from pathlib import Path
from sqlalchemy.orm import sessionmaker
import database
import models
import schemas

from test_date_write_guard_http import denv, _add_row, _body  # noqa: F401


@pytest.mark.parametrize("endpoint", ["list", "detail"])
def test_legacy_null_itp_reference_is_readable(denv, endpoint):
    legacy_id = _add_row(denv, "noi", "LEGACY-NO-ITP", itpNo=None)
    normal_id = _add_row(denv, "noi", "NORMAL-WITH-ITP")
    client = denv.login("dt_a")
    response = client.get("/api/noi/" if endpoint == "list" else f"/api/noi/{legacy_id}/")
    assert response.status_code == 200, response.text
    rows = response.json() if endpoint == "list" else [response.json()]
    assert next(row for row in rows if row["id"] == legacy_id)["itpNo"] is None
    if endpoint == "list":
        assert next(row for row in rows if row["id"] == normal_id)["itpNo"] == "QTS-ACC-ITP-000001"


def test_create_still_rejects_null_itp_reference(denv):
    response = denv.login("dt_a").post("/api/noi/", json=_body("noi", itpNo=None))
    assert response.status_code == 422, response.text


def test_workflow_pagination_seed_produces_readable_nois(db_session, monkeypatch):
    """The pagination fixture must also satisfy the NOI read contract."""
    db_session.add(models.Project(id="DW-P2", name="Fixture project"))
    db_session.add(models.Contractor(id="DW-V1", name="Fixture contractor"))
    db_session.add(models.ITP(id="dw-itp-1", referenceNo="QTS-DRC-ITP-000001", vendor_id="DW-V1"))
    db_session.commit()
    monkeypatch.setenv("QUALITAS_REQUIRE_ISOLATED_DB", "1")
    monkeypatch.setattr(database, "SessionLocal", sessionmaker(bind=db_session.get_bind()))
    runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/verification/seed_workflow_pagination_review.py"))
    rows = db_session.query(models.NOI).all()
    assert len(rows) == 201
    assert db_session.query(models.QWorkflow).count() == 201
    for row in rows:
        assert schemas.NOI.model_validate(row).itpNo == "QTS-DRC-ITP-000001"
