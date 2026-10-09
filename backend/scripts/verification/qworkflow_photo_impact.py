"""READ-ONLY impact inventory for the Q-Workflow "improvement" rule change (2026-09-21): what would move on the tracker when the checkpoint stops reading the
NCR's old improvementPhotos JSON strings and reads server-verified photo evidence instead.

    python scripts/verification/qworkflow_photo_impact.py --db /path/to/a/COPY.db --uploads /path/to/that/copy/uploads [--json]

It never touches the project's own database or uploads: a --db inside this project tree (backend/qualitas.db, backend/**) or a --uploads inside it is
refused BEFORE anything is opened. Point it at a COPY (or an isolated stack's database). The database is opened read-only (sqlite `mode=ro`), the
uploads are only read, and the file's SHA-256 is checked before and after. It does not import `main` and writes nothing anywhere.

What it prints (and what it does NOT know): for the given database only —
  * every NCR that a workflow looks at (Void excluded), by status group x evidence class (verified / invalid / legacy_unverified / missing);
  * per workflow the completion % under the OLD rule (JSON list non-empty) and the NEW rule, and how many workflows go up / down / stay;
  * the improvement cell's change (old state -> new state) and the workflows that get an "unverified" note (Closed NCRs passing on status only);
  * the Dashboard buckets under both rules.
The counts on the developer's or the production database are unknown until someone runs this on a copy of it. The tracker is computed on every
read, so this is a change of DISPLAYED progress; no row is changed (nothing to back-fill or clean).
The photo check looks at the file header only (PNG / JPEG / GIF / WEBP / BMP): it does not prove an image can be decoded.
"""
import argparse
import hashlib
import json
import os
import sys
from collections import Counter
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]


def _inside_project(path: Path) -> bool:
    try:
        path.resolve().relative_to(BACKEND)
        return True
    except ValueError:
        return False


def _sha(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", required=True, help="a COPY of the database (sqlite file); opened read-only")
    ap.add_argument("--uploads", required=True, help="the upload folder that belongs to that copy (read only)")
    ap.add_argument("--json", action="store_true", help="print machine-readable JSON instead of the text report")
    a = ap.parse_args(argv)
    db, uploads = Path(a.db).expanduser(), Path(a.uploads).expanduser()
    if _inside_project(db) or _inside_project(uploads):
        print("REFUSED: --db and --uploads must be OUTSIDE the project tree (never the project's own database or uploads). Use a copy.", file=sys.stderr)
        return 2
    if not db.is_file() or not uploads.is_dir():
        print("REFUSED: --db must be an existing file and --uploads an existing folder.", file=sys.stderr)
        return 2
    before = _sha(db)
    os.environ["DATABASE_URL"] = f"sqlite:///file:{db.resolve()}?mode=ro&uri=true"
    os.environ["QUALITAS_UPLOAD_ROOT"] = str(uploads.resolve())
    os.environ.pop("QUALITAS_REQUIRE_ISOLATED_DB", None)
    sys.path.insert(0, str(BACKEND))
    import database                                              # noqa: E402  (after the environment is set)
    import models                                                # noqa: E402
    from services import workflow_service as ws                  # noqa: E402
    from core.ncr_photo_evidence import photo_list               # noqa: E402

    session = database.SessionLocal()
    try:
        service = ws.WorkflowService(session)

        def run(legacy: bool):
            """All summaries under the NEW rule, or under the OLD one (the JSON list only) — the same code, the per-NCR verdict swapped."""
            real = ws._improvement_result
            if legacy:
                ws._improvement_result = lambda ctx, n: ws._ImprovementResult(bool(photo_list(n.improvementPhotos)), None, None)
            try:
                qwfs = service._load_qworkflows()
                lookups = service._build_lookups(qwfs)
                return qwfs, lookups, {q.id: service._summarise(q, lookups) for q in qwfs}
            finally:
                ws._improvement_result = real

        qwfs, lookups, new = run(False)
        _, _, old = run(True)
        classes = Counter()
        samples = {}
        for q in qwfs:
            ctx = service._make_context(q, lookups)
            for n in ctx.ncrs:
                kind = ws.classify(ctx.photo_evidence.get(n.id, ws.PhotoEvidence(0)), bool(photo_list(n.improvementPhotos)))
                group = "Closed" if (n.status or "").strip() == "Closed" else "not Closed"
                classes[(group, kind)] += 1
                samples.setdefault((group, kind), []).append(n.documentNumber)

        def bucket(p):
            return next(name for name, lo, hi in ws._BUCKETS if lo <= p <= hi)

        def improvement_state(s):
            return next(c["state"] for c in s["checkpoints"] if c["key"] == "improvement")

        moves, cell = Counter(), Counter()
        for qid, n in new.items():
            o = old[qid]
            moves["up" if n["completion_percent"] > o["completion_percent"] else "down" if n["completion_percent"] < o["completion_percent"] else "same"] += 1
            cell[(improvement_state(o), improvement_state(n))] += 1
        report = {
            "read_only": True,
            "workflows": len(new),
            "ncrs_by_status_and_evidence": {f"{g} / {k}": {"count": c, "samples": samples[(g, k)][:5]} for (g, k), c in sorted(classes.items())},
            "completion_percent": {"up": moves["up"], "down": moves["down"], "same": moves["same"]},
            "improvement_cell_old_to_new": {f"{o} -> {n}": c for (o, n), c in sorted(cell.items())},
            "workflows_with_unverified_note": sum(1 for s in new.values() if s["unverified_photo_count"] > 0),
            "unverified_ncrs_by_reason": dict(Counter(r for s in new.values() for r, c in s["unverified_photo_reasons"].items() for _ in range(c))),
            "buckets_old": dict(Counter(bucket(s["completion_percent"]) for s in old.values())),
            "buckets_new": dict(Counter(bucket(s["completion_percent"]) for s in new.values())),
        }
    finally:
        session.close()
        database.engine.dispose()
    after = _sha(db)
    report["database_unchanged"] = before == after
    if a.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"Q-Workflow improvement rule impact (read-only; database unchanged: {report['database_unchanged']})")
        print(f"  workflows: {report['workflows']}   completion %: up {moves['up']}, down {moves['down']}, same {moves['same']}")
        print("  improvement cell old -> new:", report["improvement_cell_old_to_new"])
        print(f"  workflows that would show an 'unverified' note: {report['workflows_with_unverified_note']}  by reason: {report['unverified_ncrs_by_reason']}")
        print("  NCRs looked at (Void excluded), status x evidence:")
        for k, v in report["ncrs_by_status_and_evidence"].items():
            print(f"     {k:34s} {v['count']:6d}   e.g. {', '.join(map(str, v['samples']))}")
        print("  dashboard buckets old:", report["buckets_old"], "\n  dashboard buckets new:", report["buckets_new"])
    return 0 if report["database_unchanged"] else 1


if __name__ == "__main__":
    sys.exit(main())
