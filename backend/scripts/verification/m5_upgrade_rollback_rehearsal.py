"""MATERIAL-SUBMITTAL M5 R2 — upgrade / rollback rehearsal on a THROWAWAY SQLite file (never the live database).

R2 (2026-10-09): rewritten for the M6 approved-material register (register / edit / approved / stats routes, two material
permissions, migration step 21 with client_request_id, step 22 retiring material:record_result:all). R1 drove the removed
submittal workflow and expected three permissions.

Run inside a disposable python:3.11 container, once per phase, with the code tree of that phase as the working directory:
    base       = 056c245c (what production runs before materials; confirmed by the production pre-check)
    candidate  = base + the material overlay (M6 final)

    phase A   (base)       EMPTY-file mode: start the old code, create a project and a contractor through the old API
    phase P   (none)       PRODUCTION-COPY mode instead of A: the file is a copy of the production database. No code is
                           started; a rehearsal-only login is added to the COPY (admin role) so the API can be driven
    phase B   (candidate)  first start = the migration; nothing old may change except permissions / role_permissions
    phase B2  (candidate)  register a material (+ photo), repeat the request (same id → same record), edit it, read it
    phase B3  (candidate)  restart: the migration runs again and must change nothing
    phase C   (base)       ROLLBACK of the code only: old code on the migrated file, old API still works, material data kept
    phase D   (candidate)  roll forward again: the record written before the rollback is still there

Refuses to run unless DATABASE_URL points at /rehearsal/ and M5_REHEARSAL=1. Prints JSON lines; exit 0 = every check of
the phase passed, 1 = a check failed.
"""
import hashlib
import io
import json
import os
import sqlite3
import sys

PHASE = sys.argv[1]
DB_URL = os.environ.get("DATABASE_URL", "")
if os.environ.get("M5_REHEARSAL") != "1" or not DB_URL.startswith("sqlite:////rehearsal/"):
    sys.exit("refusing: M5_REHEARSAL=1 and DATABASE_URL=sqlite:////rehearsal/... are required")
DB_FILE = DB_URL[len("sqlite:///"):]
STATE = "/rehearsal/state.json"
PW = os.environ["INITIAL_ADMIN_PASSWORD"]
REHEARSAL_USER = "m5_rehearsal"
MATERIAL_TABLES = {"materials", "material_submittals", "material_submittal_revisions", "material_submittal_result_entries"}
MATERIAL_PERMS = {"material:view:all", "material:manage:all"}
failures = []


def check(name, ok, detail=None):
    print(json.dumps({"phase": PHASE, "check": name, "ok": bool(ok), "detail": detail}, ensure_ascii=False, default=str))
    if not ok:
        failures.append(name)


def snapshot(columns_by_table=None):
    """{table: {cols, count, sha}} — sha over the rows in rowid order, restricted to `columns_by_table[table]` if given."""
    con = sqlite3.connect(DB_FILE)
    try:
        out = {}
        for (t,) in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
            cols = [r[1] for r in con.execute(f'PRAGMA table_info("{t}")')]
            use = [c for c in (columns_by_table or {}).get(t, cols) if c in cols]
            rows = con.execute(f'SELECT {", ".join(chr(34) + c + chr(34) for c in use)} FROM "{t}" ORDER BY rowid').fetchall() if use else []
            out[t] = {"cols": cols, "count": len(rows), "sha": hashlib.sha256(repr(rows).encode()).hexdigest()}
        return out
    finally:
        con.close()


def diff(before, after, ignore=()):
    """Tables whose content (on BEFORE's columns) changed, plus tables that appeared / disappeared."""
    changed = sorted(t for t in before if t in after and t not in ignore and before[t]["sha"] != after[t]["sha"])
    return {"changed": changed, "added": sorted(set(after) - set(before)), "removed": sorted(set(before) - set(after))}


def load_state():
    return json.load(open(STATE)) if os.path.exists(STATE) else {}


def save_state(s):
    json.dump(s, open(STATE, "w"), indent=1, default=str)


def client():
    from fastapi.testclient import TestClient
    import main  # start-up: backup, create_all, run_migrations, seeding
    c = TestClient(main.app, raise_server_exceptions=False)
    r = c.post("/api/auth/login", data={"username": state["login"], "password": PW})
    assert r.status_code == 200, r.text
    c.headers["x-csrf-token"] = c.cookies.get("csrf_token") or ""
    return c


def start_only():
    import main  # noqa: F401 — the start-up itself is what is being tested


def png():
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (180, 90, 40)).save(buf, format="PNG")
    return buf.getvalue()


def sql(query, params=()):
    con = sqlite3.connect(DB_FILE)
    try:
        return con.execute(query, params).fetchall()
    finally:
        con.close()


state = load_state()

if PHASE == "A":
    state["login"] = "admin"
    c = client()
    r = c.post("/api/projects/", json={"id": "RH-P1", "name": "Rehearsal project", "code": "RH"})
    check("old API: create project", r.status_code == 200, r.status_code)
    r = c.post("/api/contractors/", json={"id": "RH-V1", "name": "Rehearsal vendor", "abbreviation": "RV"})
    check("old API: create contractor", r.status_code == 200, r.status_code)
    r = c.get("/api/settings/naming-rules")
    check("old API: naming rules", r.status_code == 200 and "msa" not in {x["doc_type"] for x in r.json()}, r.status_code)
    state.update(project="RH-P1", vendor="RH-V1", A=snapshot())
    check("old schema has no material tables", not (MATERIAL_TABLES & set(state["A"])), sorted(MATERIAL_TABLES & set(state["A"])))
    save_state(state)

elif PHASE == "P":
    # production copy: record what is there, then add a rehearsal login to the COPY (never to production)
    tables = {t for (t,) in sql("SELECT name FROM sqlite_master WHERE type='table'")}
    check("production copy has no material tables yet", not (MATERIAL_TABLES & tables), sorted(MATERIAL_TABLES & tables))
    check("production copy integrity_check ok", sql("PRAGMA integrity_check") == [("ok",)])
    proj = sql("SELECT id FROM projects ORDER BY id LIMIT 1")
    vend = sql("SELECT id FROM contractors ORDER BY id LIMIT 1")
    check("production copy has a project and a contractor to register against", bool(proj and vend), (len(proj), len(vend)))
    admin = sql("SELECT id FROM roles WHERE lower(name) = 'admin'")
    check("production copy has the admin role", bool(admin))
    from core.security import get_password_hash
    con = sqlite3.connect(DB_FILE)
    cols = {r[1] for r in con.execute("PRAGMA table_info(users)")}
    row = {"username": REHEARSAL_USER, "email": "m5-rehearsal@example.invalid", "hashed_password": get_password_hash(PW),
           "is_active": 1, "role_id": admin[0][0], "full_name": "M5 rehearsal (copy only)"}
    row = {k: v for k, v in row.items() if k in cols}
    con.execute(f"INSERT INTO users ({', '.join(row)}) VALUES ({', '.join('?' for _ in row)})", tuple(row.values()))
    con.commit()
    con.close()
    state.update(login=REHEARSAL_USER, project=proj[0][0], vendor=vend[0][0], A=snapshot(),
                 counts={t: v["count"] for t, v in snapshot().items()})
    save_state(state)

elif PHASE == "B":
    start_only()                                    # FIRST start of the candidate = the migration, no request yet
    a = state["A"]
    after = snapshot({t: v["cols"] for t, v in a.items()})
    d = diff(a, after)
    check("migration added exactly the 4 material tables", set(d["added"]) == MATERIAL_TABLES and not d["removed"], d)
    check("only permissions / role_permissions changed among old tables (old columns compared)",
          set(d["changed"]) <= {"permissions", "role_permissions"}, d["changed"])
    perms = {r[0] for r in sql("SELECT code FROM permissions WHERE code LIKE 'material:%'")}
    check("exactly the 2 material permission codes exist (record_result retired)", perms == MATERIAL_PERMS, sorted(perms))
    col = [r for r in sql("PRAGMA table_info(projects)") if r[1] == "material_reply_days"]
    check("projects.material_reply_days is a nullable INTEGER", bool(col) and col[0][2].upper() == "INTEGER" and col[0][3] == 0, col)
    req = [r for r in sql("PRAGMA table_info(material_submittals)") if r[1] == "client_request_id"]
    check("material_submittals.client_request_id exists (nullable)", bool(req) and req[0][3] == 0, req)
    idx = {r[0] for r in sql("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN (%s)" % ",".join("'%s'" % t for t in MATERIAL_TABLES))}
    import db_migrations
    want = {i[0] for i in db_migrations.MATERIAL_INDEXES}
    check("all 12 named material indexes exist", want <= idx and len(want) == 12, sorted(want - idx))
    state["B"] = snapshot()
    save_state(state)

elif PHASE == "B2":
    c = client()
    body = {"projectId": state["project"], "vendorId": state["vendor"], "name": "M5 rehearsal sealant", "brand": "RB",
            "model": "R-1", "category": "Rehearsal", "resultCode": "Approved", "approvedDate": "2026-10-01",
            "clientRequestId": "m5-rehearsal-0001"}
    r = c.post("/api/material-submittals/register", json=body)
    check("new API: register", r.status_code == 200, (r.status_code, r.text[:200]))
    item = r.json()
    r2 = c.post("/api/material-submittals/register", json={**body, "name": "changed"})
    check("new API: repeated request id returns the same record", r2.status_code == 200 and r2.json()["submittalId"] == item["submittalId"]
          and r2.json()["name"] == "M5 rehearsal sealant", r2.status_code)
    r = c.post("/api/files/upload", data={"entity_type": "material_rev", "entity_id": item["revisionId"], "category": "photo"},
               files={"files": ("rehearsal.png", png(), "image/png")})
    check("new API: photo upload decoded by Pillow on Python 3.11", r.status_code == 200 and r.json()[0]["mime_type"] == "image/png",
          (r.status_code, r.text[:200]))
    r = c.post("/api/files/upload", data={"entity_type": "material_rev", "entity_id": item["revisionId"], "category": "photo"},
               files={"files": ("fake.png", b"not an image", "image/png")})
    check("new API: a non-image photo is refused", r.status_code == 400, r.status_code)
    r = c.put(f"/api/material-submittals/{item['submittalId']}/register", json={"resultCode": "ApprovedWithComments"})
    check("new API: edit appends a correction", r.status_code == 200 and r.json()["result"] == "ApprovedWithComments", r.status_code)
    r = c.get("/api/material-submittals/approved", params={"projectId": state["project"]})
    check("new API: approved list shows the record with its photo", r.status_code == 200 and r.json()["total"] == 1
          and r.json()["items"][0]["photoCount"] == 1, r.json() if r.status_code == 200 else r.status_code)
    r = c.get("/api/material-submittals/stats")
    check("new API: dashboard stats", r.status_code == 200 and r.json()["total"] == 1, r.status_code)
    r = c.get("/api/material-submittals/duplicates", params={"projectId": state["project"], "name": "m5 REHEARSAL sealant",
                                                             "brand": "rb", "model": "r-1"})
    check("new API: duplicate check finds it", r.status_code == 200 and len(r.json()["items"]) == 1, r.status_code)
    state["record"] = {"id": item["submittalId"], "documentNumber": item["documentNumber"]}
    state["B2"] = snapshot()
    save_state(state)

elif PHASE == "B3":
    start_only()                                    # restart of the candidate: the migration runs again, must change nothing
    d = diff(state["B2"], snapshot())
    check("second start of the candidate changes nothing (idempotent)", not any(d.values()), d)

elif PHASE == "C":
    before = state["B2"]
    start_only()                                    # ROLLBACK: the old code starts on the migrated file
    d = diff(before, snapshot({t: v["cols"] for t, v in before.items()}))
    check("old code starts on the migrated file; material tables untouched", not (set(d["changed"]) & MATERIAL_TABLES) and not d["removed"], d)
    check("old start-up changes only role_permissions (admin re-synced to the old code list)", set(d["changed"]) <= {"role_permissions"}, d["changed"])
    c = client()
    r = c.get("/api/projects/")
    check("old API: list projects", r.status_code == 200 and any(p["id"] == state["project"] for p in r.json()), r.status_code)
    r = c.get("/api/settings/naming-rules")
    check("old API: naming rules still readable (msa row may remain)", r.status_code == 200, r.status_code)
    r = c.get("/api/material-submittals/approved", params={"projectId": state["project"]})
    check("old code has no material routes (404, data stays in the file)", r.status_code == 404, r.status_code)
    n = {t: sql(f"SELECT COUNT(*) FROM {t}")[0][0] for t in sorted(MATERIAL_TABLES)}
    check("material rows kept", n["material_submittals"] == 1 and n["materials"] == 1 and n["material_submittal_revisions"] == 1
          and n["material_submittal_result_entries"] == 2, n)
    state["C"] = snapshot()
    save_state(state)

elif PHASE == "D":
    c = client()                                    # roll forward again
    r = c.get("/api/material-submittals/approved", params={"projectId": state["project"]})
    ok = r.status_code == 200 and r.json()["total"] == 1 and r.json()["items"][0]["documentNumber"] == state["record"]["documentNumber"]
    check("roll forward: the record written before the rollback is listed", ok, r.status_code)
    r = c.get(f"/api/material-submittals/{state['record']['id']}")
    entries = r.json()["revisions"][0]["resultEntries"] if r.status_code == 200 else []
    check("roll forward: detail readable with its initial + correction history",
          r.status_code == 200 and [e["entryType"] for e in entries] == ["initial", "correction"], r.status_code)
    admin_material = sql("""SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
                            JOIN permissions p ON p.id = rp.permission_id
                            WHERE lower(r.name) = 'admin' AND p.code LIKE 'material:%'""")[0][0]
    check("roll forward: admin holds the 2 material permissions again", admin_material == 2, admin_material)
    if "counts" in state:                           # production copy: every pre-existing table kept all its rows
        now = {t: v["count"] for t, v in snapshot().items()}
        lost = {t: (n, now.get(t)) for t, n in state["counts"].items() if t not in ("users", "role_permissions") and now.get(t, 0) < n}
        check("roll forward: no pre-existing table lost rows", not lost, lost)
else:
    sys.exit(f"unknown phase {PHASE}")

print(json.dumps({"phase": PHASE, "result": "PASS" if not failures else "FAIL", "failed": failures}))
sys.exit(1 if failures else 0)
