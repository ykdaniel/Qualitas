"""Attachment API authorization audit (2026-09-20) — MEASURES the current behaviour, changes nothing, proposes nothing by itself.

Question: can the /api/files endpoints (upload / list / metadata / download / soft-delete) be used to get around the permission,
data scope and lock rules of the record an attachment belongs to?

How it stays away from everything real
  * Parent process: builds the environment with tests/isolation.py::isolated_env (database file, log dir and run dir all inside ONE
    fresh temp directory, QUALITAS_REQUIRE_ISOLATED_DB=1) — the same boundary the tests and isolated_stack.py use — and starts a
    child Python through core.startup_guard.
  * Upload root: QUALITAS_UPLOAD_ROOT (core/uploads.py) — tests/isolation.py sets it to <run dir>/uploads and the application refuses to
    write anywhere else in an isolated process. (Before 2026-09-20 there was no such setting and this script rebound a module
    constant.) The parent proves afterwards — by SHA-256 of every file — that backend/uploads and backend/logs/app.log are
    byte-identical to what they were before.
  * No stub: a real uvicorn server (thread, 127.0.0.1, free port) runs the real `main:app` — real middleware, CSRF, cookies, routers —
    and every call below is a real HTTP request over a socket.

For every (account, target, operation) it records the HTTP status and what changed: attachment rows added / soft-deleted and files
added / removed on disk. Nothing here decides whether a result is right; the report separates measured facts from anything else.

Usage (from backend/):   python scripts/verification/attachment_authz_audit.py [--out results.json]
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "tests"))

PW = "Audit-Test-1234"


def _manifest(root: Path) -> dict:
    out = {}
    for p in sorted(root.rglob("*")) if root.is_dir() else []:
        if p.is_file():
            out[str(p.relative_to(root))] = hashlib.sha256(p.read_bytes()).hexdigest()
    return out


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else "(missing)"


# ═════════════════════════════════ parent ═════════════════════════════════════════════════════════════════════════════════════
def parent(a) -> int:
    import isolation
    real_uploads, real_log = BACKEND / "uploads", BACKEND / "logs" / "app.log"
    before = (_manifest(real_uploads), _sha(real_log))
    root = isolation.make_run_dir("qualitas-attachaudit-")
    try:
        env = isolation.isolated_env(root / "audit.db", root, {"INITIAL_ADMIN_PASSWORD": PW})
        code = (isolation._CHILD_PRELUDE + "import runpy, sys\nsys.argv = sys.argv[1:]\nrunpy.run_path(sys.argv[0], run_name='__main__')\n")
        r = subprocess.run([sys.executable, "-c", code, str(Path(__file__).resolve()), "--child"], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=900)
        sys.stdout.write(r.stdout.replace(PW, "***"))
        if r.returncode:
            sys.stderr.write(r.stderr[-3000:].replace(PW, "***"))
        if a.out:
            for line in r.stdout.splitlines():
                if line.startswith("RESULT_JSON "):
                    Path(a.out).write_text(line[len("RESULT_JSON "):])
    finally:
        assert root.parent == Path(os.path.realpath(tempfile.gettempdir())) and root.name.startswith("qualitas-attachaudit-")
        shutil.rmtree(root, ignore_errors=True)
    after = (_manifest(real_uploads), _sha(real_log))
    print(f"REAL backend/uploads unchanged (SHA-256 of {len(before[0])} files): {before[0] == after[0]}")
    print(f"REAL backend/logs/app.log unchanged (SHA-256): {before[1] == after[1]}")
    print(f"run directory removed: {not root.exists()}")
    return r.returncode or (0 if before == after else 3)


# ═════════════════════════════════ child (runs inside the isolated environment) ═════════════════════════════════════════════════
def child() -> int:
    import socket
    import threading
    import time
    import httpx
    import uvicorn
    import main
    import database
    import models
    from core import perms
    from core.security import get_password_hash
    from test_itr_revoke_approval_acceptance import _get_or_create_perm

    from core.uploads import upload_root
    run_root = Path(os.environ["QUALITAS_TEST_DB_ROOT"]).resolve()
    up = Path(upload_root())                                                    # set by tests/isolation.py: <run dir>/uploads (validated, or the process refuses)
    up.mkdir(exist_ok=True)
    assert os.path.realpath(up).startswith(os.path.realpath(run_root) + os.sep), "upload root is not inside the run dir"
    assert os.path.realpath(up) != os.path.realpath(BACKEND / "uploads")

    # ── seed (ORM, isolated database) ──────────────────────────────────────────────────────────────────────────────────────────
    db = database.SessionLocal()

    def role(name, codes):
        r = db.query(models.Role).filter_by(name=name).first() or models.Role(name=name)
        r.permissions_rel = [_get_or_create_perm(db, c) for c in codes]
        db.add(r); db.flush()
        return r
    every = [v for k, v in vars(perms).items() if isinstance(v, str) and v.count(":") >= 2 and v.isascii()]
    view_all = [c for c in every if c.endswith(":view:all")]
    create_all = [c for c in every if c.endswith(":create:all")]
    update_all = [c for c in every if c.endswith(":update:all")] + [perms.CONTRACTOR_MANAGE]
    r_admin = role("Admin", every)
    r_none = role("AuditNoPerm", [])
    r_view = role("AuditViewer", view_all)
    r_create = role("AuditCreateOnly", view_all + create_all)                       # view + create, NO update
    r_full = role("AuditFull", view_all + create_all + update_all)                  # every view/create/update: isolates SCOPE and LOCKS
    for cid, cname in (("C1", "C One"), ("C2", "C Two")):
        db.merge(models.Contractor(id=cid, name=cname, abbreviation=cid))
    for pid in ("P-A", "P-B"):
        db.merge(models.Project(id=pid, name=pid))
    db.flush()

    def user(username, r, vendor=None, projects=()):
        u = db.query(models.User).filter_by(username=username).first() or models.User(username=username)
        u.email = f"{username}@example.com"; u.is_active = True; u.hashed_password = get_password_hash(PW); u.role_id = r.id; u.vendor_id = vendor
        db.add(u); db.flush()
        for pid in projects:
            db.add(models.UserProject(user_id=u.id, project_id=pid))
    user("adm", r_admin)                                    # unscoped, every permission
    user("noperm", r_none)                                  # unscoped, NO permission at all
    user("viewer", r_view)                                  # unscoped, view only
    user("create_only", r_create)                           # unscoped, view + create, NO update
    user("sA", r_full, "C1", ["P-A"])                       # scoped to the target's own project AND contractor (the legitimate scoped user)
    user("sP", r_full, None, ["P-B"])                       # another PROJECT only
    user("sV", r_full, "C2", [])                            # another CONTRACTOR only
    user("sB", r_full, "C2", ["P-B"])                       # another project AND contractor
    T = {}                                                  # target name -> (entity_type, entity_id, description)

    def rec(name, etype, model, ident, ref_field, project, vendor, status, **extra):
        rid = f"aud-{name}"
        cols = {"id": rid, ref_field: ident, "project_id": project, "vendor_id": vendor, "status": status, "description": name, "rev": "0", "submit": "", **extra}
        db.add(model(**{k: v for k, v in cols.items() if hasattr(model, k)}))          # not every table has every column (NOI has no description)
        T[name] = (etype, rid, f"{etype.upper()} {status} {project}/{vendor}")
    rec("ncr_open_A", "ncr", models.NCR, "NCR-A", "documentNumber", "P-A", "C1", "Open")
    rec("obs_open_A", "obs", models.OBS, "OBS-A", "documentNumber", "P-A", "C1", "Open")
    rec("noi_open_A", "noi", models.NOI, "NOI-A", "referenceNo", "P-A", "C1", "Open", package="p", issueDate="2026-09-01", inspectionDate="2026-09-10", inspectionTime="09:00", itpNo="", type="Rebar")
    rec("ncr_open_B", "ncr", models.NCR, "NCR-B", "documentNumber", "P-B", "C2", "Open")
    rec("obs_open_B", "obs", models.OBS, "OBS-B", "documentNumber", "P-B", "C2", "Open")
    rec("noi_open_B", "noi", models.NOI, "NOI-B", "referenceNo", "P-B", "C2", "Open", package="p", issueDate="2026-09-01", inspectionDate="2026-09-10", inspectionTime="09:00", itpNo="", type="Rebar")
    rec("ncr_closed_A", "ncr", models.NCR, "NCR-CL", "documentNumber", "P-A", "C1", "Open")          # closed AFTER its seed file exists (below)
    rec("obs_closed_A", "obs", models.OBS, "OBS-CL", "documentNumber", "P-A", "C1", "Open")
    rec("noi_closed_A", "noi", models.NOI, "NOI-CL", "referenceNo", "P-A", "C1", "Open", package="p", issueDate="2026-09-01", inspectionDate="2026-09-10", inspectionTime="09:00", itpNo="", type="Rebar")
    rec("itr_approved_A", "itr", models.ITR, "ITR-AP", "documentNumber", "P-A", "C1", "Open")
    T["missing_ncr"] = ("ncr", "does-not-exist", "NCR that does not exist")
    T["unmapped_contractor"] = ("contractor", "C1", "entity_type 'contractor' (not in the scope map)")
    db.add(models.KMArticle(id="aud-km", articleNo="AUD-KM", title="t", content="c"))
    T["unmapped_km"] = ("km", "aud-km", "entity_type 'km' (not in the scope map)")
    db.commit(); db.close()

    # ── real server ─────────────────────────────────────────────────────────────────────────────────────────────────────────
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(main.app, host="127.0.0.1", port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    for _ in range(200):
        if server.started:
            break
        time.sleep(0.1)
    assert server.started, "server did not start"
    base = f"http://127.0.0.1:{port}"

    class Actor:
        def __init__(self, name):
            self.name = name
            self.c = httpx.Client(base_url=base, timeout=30)
            if name != "anon":
                r = self.c.post("/api/auth/login", data={"username": name, "password": PW})
                assert r.status_code == 200, (name, r.status_code, r.text[:200])

        def req(self, method, url, **kw):
            headers = dict(kw.pop("headers", {}))
            csrf = self.c.cookies.get("csrf_token")
            if method != "GET" and csrf:
                headers["X-CSRF-Token"] = csrf
            return self.c.request(method, url, headers=headers, **kw)

    actors = {n: Actor(n) for n in ("anon", "adm", "noperm", "viewer", "create_only", "sA", "sP", "sV", "sB")}

    def rows():
        s = database.SessionLocal()
        try:
            return {a.id: (a.entity_type, a.entity_id, bool(a.is_deleted), a.file_path) for a in s.query(models.Attachment).all()}
        finally:
            s.close()

    def disk():
        return _manifest(up)

    def measured(fn):
        r0, d0 = rows(), disk()
        res = fn()
        r1, d1 = rows(), disk()
        eff = {"http": res.status_code,
               "rows_added": len([i for i in r1 if i not in r0]),
               "rows_soft_deleted": len([i for i in r1 if i in r0 and r1[i][2] and not r0[i][2]]),
               "rows_removed": len([i for i in r0 if i not in r1]),
               "files_added": len([k for k in d1 if k not in d0]),
               "files_removed": len([k for k in d0 if k not in d1])}
        return eff, res

    def upload(actor, etype, eid, content=b"audit-file", name="a.txt"):
        return actor.req("POST", "/api/files/upload", data={"entity_type": etype, "entity_id": eid, "category": "attachment"}, files=[("files", (name, content, "text/plain"))])

    adm = actors["adm"]
    seeds = {}                                                                   # target -> (file id, file_path, bytes)
    for name, (et, eid, _d) in T.items():
        content = f"SEED::{name}".encode()
        r = upload(adm, et, eid, content)
        if r.status_code != 200:                     # the target does not exist: since 2026-09-20 not even an unrestricted account can attach to it
            assert r.status_code == 404, (name, r.status_code, r.text[:200])
            seeds[name] = None
            continue
        j = r.json()[0]
        seeds[name] = (j["id"], j["file_url"].split("/api/files/download/", 1)[1], content)
    assert len(disk()) == len([1 for v in seeds.values() if v]), "seed files must be in the run dir"
    _s = database.SessionLocal()                                                  # now lock the four records (their seed files were attached while open)
    for model, rid, status in ((models.NCR, "aud-ncr_closed_A", "Closed"), (models.OBS, "aud-obs_closed_A", "Closed"), (models.NOI, "aud-noi_closed_A", "Closed"), (models.ITR, "aud-itr_approved_A", "Approved")):
        _s.query(model).filter_by(id=rid).update({"status": status})
    _s.commit(); _s.close()

    # ── the matrix ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
    results = []
    for an, actor in actors.items():
        for tn, (et, eid, desc) in T.items():
            seed = seeds[tn]
            fid, fpath, content = seed if seed else (None, None, None)
            row = {"actor": an, "target": tn, "desc": desc, "target_exists": bool(seed)}
            eff, res = measured(lambda: upload(actor, et, eid, b"new-by-" + an.encode()))
            row["upload"] = eff
            eff, res = measured(lambda: actor.req("GET", "/api/files/by-entity", params={"entity_type": et, "entity_id": eid}))
            eff["seed_visible"] = res.status_code == 200 and any(x.get("id") == fid for x in (res.json() if res.headers.get("content-type", "").startswith("application/json") else []) if isinstance(x, dict))
            row["list"] = eff
            if not seed:                                                          # no file can exist for a missing target
                results.append(row)
                continue
            eff, res = measured(lambda: actor.req("GET", f"/api/files/{fid}"))
            row["meta"] = eff
            eff, res = measured(lambda: actor.req("GET", f"/api/files/download/{fpath}"))
            eff["content_returned"] = res.status_code == 200 and res.content == content
            row["download"] = eff
            vr = upload(adm, et, eid, b"victim-of-" + an.encode())               # a fresh file for this delete attempt
            vid = vr.json()[0]["id"] if vr.status_code == 200 else fid            # a locked target takes no new file: try to delete the seed file itself
            eff, res = measured(lambda: actor.req("DELETE", f"/api/files/{vid}"))
            row["delete"] = eff
            results.append(row)

    # ── controls: the same accounts against the RECORD itself (does the record's own permission/scope check say no?) ──────────────
    controls = []
    for an in ("noperm", "viewer", "create_only", "sP", "sV", "sB", "sA"):
        for tn, path in (("ncr_open_A", "/api/ncr/aud-ncr_open_A/"), ("obs_open_A", "/api/obs/aud-obs_open_A"), ("noi_open_A", "/api/noi/aud-noi_open_A/")):
            g = actors[an].req("GET", path)
            p = actors[an].req("PUT", path, json={"remark": "audit-control"})
            controls.append({"actor": an, "target": tn, "record_GET": g.status_code, "record_PUT": p.status_code})

    for tn, path in (("ncr_closed_A", "/api/ncr/aud-ncr_closed_A/"), ("obs_closed_A", "/api/obs/aud-obs_closed_A"), ("noi_closed_A", "/api/noi/aud-noi_closed_A/")):
        g = actors["sA"].req("GET", path)
        p = actors["sA"].req("PUT", path, json={"remark": "audit-control-closed"})
        controls.append({"actor": "sA", "target": tn, "record_GET": g.status_code, "record_PUT": p.status_code, "note": "closed record"})

    # ── what an out-of-scope upload leaves behind for the people who DO belong to the target ──────────────────────────────────────
    inj = actors["sA"].req("GET", "/api/files/by-entity", params={"entity_type": "ncr", "entity_id": T["ncr_open_A"][1]}).json()
    injected = {"in_scope_user_sees_files_uploaded_by": sorted({x.get("uploaded_by") for x in inj}), "count": len(inj)}

    # ── a create-only account and its OWN freshly created record (the "retry the attachment" situation) ──────────────────────────
    co, own = actors["create_only"], []
    bodies = {
        "ncr": ("/api/ncr/", dict(vendor="C One", description="own", rev="", submit="v", status="Open", hasDetails=True, raiseDate="2026-09-05", subject="own", type="Design", severity="Minor", discipline="Civil", foundBy="q", raisedBy="q", foundLocation="g", referenceStandards="s", deviation="d")),
        "obs": ("/api/obs/", dict(vendor="C One", description="own", rev="", submit="v", status="Open", hasDetails=True, raiseDate="2026-09-05", subject="own")),
        "noi": ("/api/noi/", dict(package="own", issueDate="2026-09-05", inspectionDate="2026-09-15", inspectionTime="09:00", itpNo="", eventNumber="E", checkpoint="H", type="Rebar", contractor="C One", contacts="b", phone="1", email="b@example.com", status="Open")),
    }
    for et, (path, body) in bodies.items():
        c = co.req("POST", path, json=body)
        entry = {"module": et, "create_POST": c.status_code}
        if c.status_code == 200:
            rid = c.json()["id"]
            put = co.req("PUT", f"{path}{rid}/" if et != "obs" else f"{path}{rid}", json={"remark": "x"})
            entry["record_PUT"] = put.status_code
            eff, res = measured(lambda: upload(co, et, rid, b"own-retry"))
            entry["retry_upload"] = eff
            fid = res.json()[0]["id"] if res.status_code == 200 else None
            eff, _ = measured(lambda: co.req("GET", "/api/files/by-entity", params={"entity_type": et, "entity_id": rid}))
            entry["list"] = eff
            if fid:
                eff, _ = measured(lambda: co.req("DELETE", f"/api/files/{fid}"))
                entry["delete_own_file"] = eff
        own.append(entry)

    # ── soft delete: does the file stay reachable? ───────────────────────────────────────────────────────────────────────────────
    vr = upload(adm, "ncr", T["ncr_open_A"][1], b"to-be-deleted"); v = vr.json()[0]; vpath = v["file_url"].split("/api/files/download/", 1)[1]
    d = adm.req("DELETE", f"/api/files/{v['id']}")
    after = {"delete": d.status_code,
             "download_by_path_admin": adm.req("GET", f"/api/files/download/{vpath}").status_code,
             "download_by_path_sA": actors["sA"].req("GET", f"/api/files/download/{vpath}").status_code,
             "metadata": adm.req("GET", f"/api/files/{v['id']}").status_code,
             "list_contains_it": any(x["id"] == v["id"] for x in adm.req("GET", "/api/files/by-entity", params={"entity_type": "ncr", "entity_id": T["ncr_open_A"][1]}).json()),
             "row_is_deleted": rows()[v["id"]][2], "file_still_on_disk": vpath.replace("/", os.sep) in disk()}

    # ── report ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    def cell(e, extra=""):
        eff = f"{e['http']}"
        if e.get("rows_added"): eff += f"+{e['rows_added']}row+{e['files_added']}file"
        if e.get("rows_soft_deleted"): eff += "+softdel"
        return eff + extra
    print("=" * 110)
    print("MATRIX  (U=upload L=list M=metadata D=download X=delete ; +Nrow+Nfile = rows/files ADDED ; softdel = row flagged deleted ; ")
    print("         'vis' = the seed file was listed ; 'bytes' = the seed file's bytes came back)")
    for an in actors:
        print(f"\n── {an} " + "─" * 90)
        for r in [x for x in results if x["actor"] == an]:
            if "meta" not in r:
                print(f"  {r['target']:<20} U:{cell(r['upload']):<18} L:{cell(r['list']):<12} (target does not exist: no file to read or delete)")
                continue
            print(f"  {r['target']:<20} U:{cell(r['upload']):<18} L:{cell(r['list'], ' vis' if r['list']['seed_visible'] else ''):<12} M:{r['meta']['http']:<4} D:{cell(r['download'], ' bytes' if r['download']['content_returned'] else ''):<12} X:{cell(r['delete'])}")
    print("\nCONTROLS (the record's own endpoint, same accounts):")
    for c in controls:
        print(f"  {c['actor']:<12} {c['target']:<12} record GET {c['record_GET']}  record PUT {c['record_PUT']}")
    print("\nCREATE-ONLY ACCOUNT AND ITS OWN NEW RECORD:")
    for o in own:
        print("  " + json.dumps(o))
    print("\nWHAT sA (in scope) SEES ON ncr_open_A AFTER OUTSIDERS UPLOADED TO IT:", json.dumps(injected))
    print("\nSOFT DELETE:", json.dumps(after))
    print("\nrun-dir uploads at the end:", len(disk()), "files; attachment rows:", len(rows()))
    print("RESULT_JSON " + json.dumps({"matrix": results, "controls": controls, "create_only_own": own, "soft_delete": after, "injected": injected}))
    server.should_exit = True
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--child", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--out", help="write the machine-readable result here (must be outside the repo's uploads/logs)")
    a = ap.parse_args()
    sys.exit(child() if a.child else parent(a))
