"""Selected project must intersect existing user scope on every workflow endpoint."""
import pytest
import models
from test_date_write_guard_http import denv  # noqa: F401


@pytest.mark.parametrize("endpoint", ["/api/workflow/", "/api/workflow/stats", "/api/workflow/needs-attention"])
def test_project_filter_applies_to_workflow_list_stats_and_attention(denv, endpoint):
    with denv.Session() as db:
        db.add(models.Project(id="P-B", name="P-B"))
        db.flush()
        for i, project in enumerate(["P-A", "P-B", "P-B", None]):
            noi = models.NOI(id=f"wf-project-noi-{i}", referenceNo=f"WF-NOI-{i}",
                             project_id=project, vendor_id="ACC-V1", status="Open", package="Test")
            db.add(noi)
            db.flush()
            db.add(models.QWorkflow(id=f"wf-project-{i}", referenceNo=f"WF-{i}", noi_id=noi.id))
        db.commit()
    client = denv.login("dt_a")
    def count(params):
        r = client.get(endpoint, params={"limit": 20, **params})
        assert r.status_code == 200, r.text
        return r.json()["total"] if endpoint.endswith("stats") else len(r.json())
    assert count({}) == 4
    assert count({"project_id": "P-A"}) == 1
    assert count({"project_id": "P-B"}) == 2
    assert count({"project_id": "missing"}) == 0
    client = denv.login("dt_v1")
    assert count({}) == 1
    assert count({"project_id": "P-B"}) == 0
    assert count({"project_id": "P-A"}) == 1
