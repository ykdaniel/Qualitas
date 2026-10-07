"""scripts/verification/qworkflow_photo_impact.py — the READ-ONLY impact inventory for the Q-Workflow photo rule (2026-09-21).

A throw-away database FILE outside the project tree plus the run's temporary upload root; the script runs as a child process, exactly as it would
against a copy. Pinned: it refuses the project's own database / uploads before opening anything, it opens read-only (the file is byte-identical
afterwards), and its numbers are the ones the rule produces (old = JSON list, new = server-verified evidence)."""
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from database import Base
from ncr_photos import add_photo

BACKEND = Path(__file__).resolve().parents[1]
SCRIPT = BACKEND / "scripts" / "verification" / "qworkflow_photo_impact.py"


def _run(*args):
    env = {k: v for k, v in os.environ.items() if k not in ("DATABASE_URL",)}
    return subprocess.run([sys.executable, str(SCRIPT), *args], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=120)


@pytest.fixture
def copy_db(tmp_path):
    """A COPY-like database: 4 flows — verified open, old string open, Closed with an old string, Closed with nothing."""
    path = tmp_path / "copy.db"
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine)
    d = S()
    d.add(models.Contractor(id="V", name="V", abbreviation="V"))
    d.flush()
    for tag, status, photos, attach in (("A", "Open", None, True), ("B", "Open", '["/uploads/old.jpg"]', False), ("C", "Closed", '["/uploads/old.jpg"]', False), ("D", "Closed", None, False)):
        ref = f"NOI-{tag}"
        d.add(models.NOI(id=f"noi-{tag}", package=f"P-{tag}", referenceNo=ref, issueDate="2026-03-01", inspectionTime="10:00", itpNo="X", inspectionDate="2026-03-02", type="site",
                         vendor_id="V", status="In Progress"))
        d.add(models.QWorkflow(id=f"q-{tag}", referenceNo=f"Q-WorkFlow-{tag}", noi_id=f"noi-{tag}", createdAt="2026-03-01"))
        d.add(models.ITR(id=f"itr-{tag}", vendor_id="V", documentNumber=f"ITR-{tag}", description="x", rev="A", submit="s", status="In Progress", noiNumber=ref, raiseDate="2026-03-02"))
        d.add(models.NCR(id=f"ncr-{tag}", vendor_id="V", documentNumber=f"NCR-{tag}", description="x", rev="A", submit="s", status=status, raiseDate="2026-03-03", noiNumber=ref,
                         repairMethodStatement="fix", improvementPhotos=photos))
    d.commit()
    add_photo(d, "ncr-A")
    d.close()
    engine.dispose()
    return path


def _sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def test_it_reports_what_the_rule_change_moves_and_leaves_the_database_byte_identical(copy_db):
    uploads = os.environ["QUALITAS_UPLOAD_ROOT"]
    before = _sha(copy_db)
    r = _run("--db", str(copy_db), "--uploads", uploads, "--json")
    assert r.returncode == 0, r.stderr[-500:]
    out = json.loads(r.stdout)
    assert out["read_only"] is True and out["database_unchanged"] is True and _sha(copy_db) == before
    assert out["workflows"] == 4
    e = {k: v["count"] for k, v in out["ncrs_by_status_and_evidence"].items()}
    assert e == {"not Closed / verified": 1, "not Closed / legacy_unverified": 1, "Closed / legacy_unverified": 1, "Closed / missing": 1}
    # old rule: A (no string) blocks, B (string) passes, C passes (string), D (nothing) blocks. New rule: A passes (verified), B blocks, C and D pass on Closed status.
    assert out["completion_percent"] == {"up": 2, "down": 1, "same": 1}                 # A up, D up, B down, C same
    assert out["improvement_cell_old_to_new"] == {"current -> done": 2, "done -> current": 1, "done -> done": 1}
    assert sum(out["buckets_old"].values()) == sum(out["buckets_new"].values()) == 4
    assert out["workflows_with_unverified_note"] == 2 and out["unverified_ncrs_by_reason"] == {"legacy_unverified": 1, "missing": 1}


def test_it_refuses_the_projects_own_database_and_uploads_before_opening_anything(copy_db):
    uploads = os.environ["QUALITAS_UPLOAD_ROOT"]
    for db, up in ((str(BACKEND / "qualitas.db"), uploads), (str(copy_db), str(BACKEND / "uploads")), (str(BACKEND / "tests" / "x.db"), uploads)):
        r = _run("--db", db, "--uploads", up)
        assert r.returncode == 2 and "REFUSED" in r.stderr and "OUTSIDE the project tree" in r.stderr, (db, up, r.stderr[-300:])
    assert _run("--db", str(copy_db) + ".missing", "--uploads", uploads).returncode == 2


def test_the_text_report_carries_the_caveats():
    doc = SCRIPT.read_text()
    assert "file header only" in doc and "counts on the developer's or the production database are unknown" in doc
