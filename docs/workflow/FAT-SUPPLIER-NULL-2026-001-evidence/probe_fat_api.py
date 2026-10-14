"""FAT-SUPPLIER-NULL-2026-001: API probe against an isolated stack (never a real server).

    python probe_fat_api.py <stack.json> <step>

Reads the per-run admin password from the run directory (never prints it). Steps:
    create-empty     POST /api/fat/ with supplier ""
    create-unknown   POST /api/fat/ with supplier "No Such Co"
    update-empty     PUT  /api/fat/FSN-OK with supplier ""
    update-unknown   PUT  /api/fat/FSN-OK with supplier "No Such Co"
    update-null      PUT  /api/fat/FSN-OK with supplier / equipment / startDate / endDate null (one request each)
    list             GET  /api/fat/
    search           GET  /api/fat/?search=Supplier
    get <id>         GET  /api/fat/<id>
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

stack = json.loads(Path(sys.argv[1]).read_text())
step = sys.argv[2]
base = f"http://127.0.0.1:{stack['backend_port']}/api"
password = (Path(stack["root"]) / "admin-password").read_text()


def call(method, path, body=None, token=None, form=None):
    headers = {}
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode(), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(), e.headers


# the JWT comes back only as the httpOnly access_token cookie; the API also accepts it as a Bearer header
status, text, login_headers = call("POST", "/auth/login", form={"username": "admin", "password": password})
assert status == 200, (status, text[:200])
token = next(c.split(";", 1)[0].split("=", 1)[1] for c in login_headers.get_all("Set-Cookie")
             if c.startswith("access_token="))

NEW = {"project_id": "FSN-P1", "equipment": "Probe equipment", "startDate": "2026-10-01", "endDate": "2026-10-02"}


def show(label, method, path, body=None):
    s, t, _ = call(method, path, body, token)
    try:
        parsed = json.loads(t)
        if isinstance(parsed, list):
            t = json.dumps([{k: r.get(k) for k in ("id", "equipment", "supplier", "startDate", "endDate")}
                            for r in parsed], ensure_ascii=False)
        elif isinstance(parsed, dict) and "id" in parsed:
            t = json.dumps({k: parsed.get(k) for k in ("id", "equipment", "supplier", "startDate", "endDate")},
                           ensure_ascii=False)
    except ValueError:
        pass
    print(f"{label}: {method} {path} {json.dumps(body, ensure_ascii=False) if body is not None else ''}")
    print(f"  -> HTTP {s} {t[:600]}")


if step == "create-empty":
    show(step, "POST", "/fat/", {**NEW, "supplier": ""})
elif step == "create-unknown":
    show(step, "POST", "/fat/", {**NEW, "supplier": "No Such Co"})
elif step == "update-empty":
    show(step, "PUT", "/fat/FSN-OK", {"supplier": ""})
elif step == "update-unknown":
    show(step, "PUT", "/fat/FSN-OK", {"supplier": "No Such Co"})
elif step == "update-null":
    for field in ("supplier", "equipment", "startDate", "endDate"):
        show(f"{step}:{field}", "PUT", "/fat/FSN-OK", {field: None})
elif step == "list":
    show(step, "GET", "/fat/")
elif step == "search":
    show(step, "GET", "/fat/?search=Supplier")
elif step == "get":
    show(step, "GET", f"/fat/{sys.argv[3]}")
else:
    raise SystemExit(f"unknown step {step!r}")
