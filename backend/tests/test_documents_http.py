"""Controlled-document register over HTTP (KM-DOCS-2026-001 D1; DECISIONS「KM-DOCS」).

Accounts: admin (unscoped), writer (km:* + document:view/create/update, project P-TEST), approver (document:* incl.
approve, P-TEST), viewer (km:view only, P-TEST). Throwaway SQLite file per test; routers auth + documents + files + km;
uploads land in the suite's throw-away root (conftest). No main import, seeding or scheduler.
"""
import importlib
import io
import secrets
from types import SimpleNamespace

import pytest
from docx import Document as Docx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from core import perms
from core.refusals import RefusalHTTPException, refusal_exception_handler
from core.security import get_password_hash
from database import Base, get_db
from project_membership import TEST_PROJECT_ID, bind, ensure_project

OTHER_PROJECT = "P-OTHER"
KM = [perms.KM_VIEW, perms.KM_CREATE, perms.KM_UPDATE, perms.KM_DELETE]
DOC_RW = [perms.DOCUMENT_VIEW, perms.DOCUMENT_CREATE, perms.DOCUMENT_UPDATE]
ALL_CODES = sorted({p["code"] for p in perms.ALL_PERMISSIONS})
PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def docx_bytes(*paragraphs) -> bytes:
    d = Docx()
    for p in paragraphs:
        d.add_paragraph(p)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def _app(S):
    app = FastAPI()
    for name in ("auth", "documents", "file_router", "km"):
        app.include_router(importlib.import_module("routers." + name).router, prefix="/api")
    app.add_exception_handler(RefusalHTTPException, refusal_exception_handler)

    def session():
        with S() as db:
            yield db
    app.dependency_overrides[get_db] = session
    return app


@pytest.fixture
def env(tmp_path, monkeypatch):
    import db_migrations
    engine = create_engine(f"sqlite:///{tmp_path / 'docs.db'}", connect_args={"check_same_thread": False, "timeout": 30})
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False)
    import core.security as security
    monkeypatch.setattr(security, "SessionLocal", S)
    password = secrets.token_urlsafe(24)
    ids = {}
    with S() as db:
        ensure_project(db, TEST_PROJECT_ID, code="PA")
        ensure_project(db, OTHER_PROJECT, code="PB")
        db.add(models.Contractor(id="v1", name="Hailong", abbreviation="HL", status="active"))
        roles = {
            "admin": ALL_CODES, "writer": KM + DOC_RW, "approver": DOC_RW + [perms.DOCUMENT_APPROVE], "viewer": [perms.KM_VIEW],
        }
        permission = {c: models.Permission(code=c, description=c) for c in ALL_CODES}       # one row per code, shared by the roles
        for name, codes in roles.items():
            role = models.Role(name="admin" if name == "admin" else name.capitalize())
            role.permissions_rel = [permission[c] for c in codes]
            db.add(role)
            db.flush()
            u = models.User(username=name, email=f"{name}@example.com", is_active=True, role_id=role.id,
                            hashed_password=get_password_hash(password), company_name="QA")
            db.add(u)
            db.flush()
            ids[name] = u.id
            if name != "admin":
                bind(db, u)
        db.commit()
    clients = []

    def login(name="writer"):
        c = TestClient(_app(S), raise_server_exceptions=False)
        c.__enter__()
        clients.append(c)
        r = c.post("/api/auth/login", data={"username": name, "password": password})
        assert r.status_code == 200, r.text
        return c

    yield SimpleNamespace(Session=S, login=login, ids=ids, engine=engine)
    for c in clients:
        c.__exit__(None, None, None)
    engine.dispose()


def _create(c, **body):
    body.setdefault("scope", "company")
    body.setdefault("doc_type", "procedure")
    body.setdefault("title_zh", "焊接程序書")
    r = c.post("/api/documents/", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _version(c, doc_id, word=None, pdf=None, summary="first", label=None):
    files = {}
    if word is not None:
        files["word"] = ("proc.docx", word, DOCX_MIME)
    if pdf is not None:
        files["pdf"] = ("proc.pdf", pdf, "application/pdf")
    data = {"change_summary": summary}
    if label:
        data["version_label"] = label
    return c.post(f"/api/documents/{doc_id}/versions", files=files, data=data)


def _to(c, doc_id, to, **extra):
    return c.post(f"/api/documents/{doc_id}/transition", json={"to": to, **extra})


def _audit(env, entity_type, entity_id=None, action=None):
    with env.Session() as db:
        q = db.query(models.AuditLog).filter_by(entity_type=entity_type)
        if entity_id:
            q = q.filter_by(entity_id=entity_id)
        if action:
            q = q.filter_by(action=action)
        return [(a.action, a.user_id, a.username) for a in q.all()]


# ---- numbering ---------------------------------------------------------------------------------------------------------------

def test_company_documents_share_the_km_counter_and_project_types_get_their_first_numbers(env):
    w = env.login()
    a = _create(w)
    assert a["doc_no"] == "QTS-KM-000001" and a["status"] == "draft" and a["scope"] == "company"
    km = w.post("/api/km/", json={"title": "old article", "content": "<p>x</p>"})
    assert km.status_code == 200 and km.json()["articleNo"] == "QTS-KM-000002"          # one counter for both
    assert _create(w, title_zh="second")["doc_no"] == "QTS-KM-000003"
    firsts = {t: _create(w, scope="project", doc_type=t, title_zh=t)["doc_no"]
              for t in ("plan", "drawing", "spec", "certificate", "approval")}
    assert firsts == {"plan": "QTS-RKS-PA-PLN-000001", "drawing": "QTS-RKS-PA-DWG-000001", "spec": "QTS-RKS-PA-SPC-000001",
                      "certificate": "QTS-RKS-PA-CER-000001", "approval": "QTS-RKS-PA-APR-000001"}
    assert _create(w, scope="project", doc_type="plan", title_zh="p2")["doc_no"] == "QTS-RKS-PA-PLN-000002"
    assert _audit(env, "Document", a["id"], "CREATE") == [("CREATE", env.ids["writer"], "writer")]


def test_doc_type_must_match_the_layer_and_pqp_is_reserved(env):
    w = env.login()
    r = w.post("/api/documents/", json={"scope": "project", "doc_type": "pqp", "title_zh": "x"})
    assert r.status_code == 400 and r.json()["code"] == "DOC_TYPE_RESERVED"
    r = w.post("/api/documents/", json={"scope": "company", "doc_type": "plan", "title_zh": "x"})
    assert r.status_code == 400 and r.json()["code"] == "DOC_TYPE_INVALID"
    r = w.post("/api/documents/", json={"scope": "project", "doc_type": "procedure", "title_zh": "x"})
    assert r.status_code == 400 and r.json()["code"] == "DOC_TYPE_INVALID"
    assert w.post("/api/documents/", json={"scope": "nowhere", "doc_type": "plan", "title_zh": "x"}).status_code == 422
    # a company document ignores a project / contractor sent by mistake
    d = _create(w, project_id=TEST_PROJECT_ID, vendor_id="v1")
    assert (d["project_id"], d["vendor_id"]) == (None, None)
    # a project document outside the writer's project is refused; an unknown contractor is refused
    r = w.post("/api/documents/", json={"scope": "project", "doc_type": "plan", "title_zh": "x", "project_id": OTHER_PROJECT})
    assert r.status_code == 403 and r.json()["code"] == "SCOPE_FORBIDDEN"
    r = w.post("/api/documents/", json={"scope": "project", "doc_type": "plan", "title_zh": "x", "vendor_id": "nope"})
    assert r.status_code == 400 and r.json()["code"] == "REFERENCE_NOT_FOUND"


# ---- visibility and permissions ----------------------------------------------------------------------------------------------

def test_list_needs_scope_and_follows_layer_permissions_and_project_scope(env):
    admin, w, viewer = env.login("admin"), env.login("writer"), env.login("viewer")
    _create(w, title_zh="company one")
    _create(w, scope="project", doc_type="drawing", title_zh="PA drawing")
    _create(admin, scope="project", doc_type="drawing", title_zh="PB drawing", project_id=OTHER_PROJECT)
    assert w.get("/api/documents/").status_code == 422                                       # scope is required
    assert [d["title_zh"] for d in w.get("/api/documents/", params={"scope": "project"}).json()] == ["PA drawing"]
    assert sorted(d["title_zh"] for d in admin.get("/api/documents/", params={"scope": "project"}).json()) == ["PA drawing", "PB drawing"]
    assert [d["title_zh"] for d in viewer.get("/api/documents/", params={"scope": "company"}).json()] == ["company one"]
    r = viewer.get("/api/documents/", params={"scope": "project"})
    assert r.status_code == 403 and r.json()["code"] == "PERMISSION_DENIED"
    r = viewer.post("/api/documents/", json={"scope": "company", "doc_type": "procedure", "title_zh": "x"})
    assert r.status_code == 403
    # a project document of another project is 404 for the writer, as if it did not exist
    pb = [d for d in admin.get("/api/documents/", params={"scope": "project"}).json() if d["title_zh"] == "PB drawing"][0]
    assert w.get(f"/api/documents/{pb['id']}").status_code == 404
    assert admin.get(f"/api/documents/{pb['id']}").status_code == 200


def test_templates_are_admin_only(env):
    admin, w = env.login("admin"), env.login("writer")
    r = w.post("/api/documents/", json={"scope": "company", "doc_type": "template", "title_zh": "PQP template", "is_template": True})
    assert r.status_code == 403 and r.json()["code"] == "SHARED_TEMPLATE_ADMIN_ONLY"
    t = _create(admin, doc_type="template", title_zh="PQP template", template_fields=["project_name", "doc_no"])
    assert t["is_template"] is True and t["template_fields"] == ["project_name", "doc_no"]
    r = w.patch(f"/api/documents/{t['id']}", json={"tags": "x", "row_version": t["row_version"]})
    assert r.status_code == 403


# ---- versions ----------------------------------------------------------------------------------------------------------------

def test_version_upload_stores_both_files_extracts_word_text_and_checks_types(env):
    w = env.login()
    d = _create(w)
    r = _version(w, d["id"], word=docx_bytes("焊接前檢查", "Pre-weld inspection"), pdf=PDF)
    assert r.status_code == 200, r.text
    v = r.json()
    assert (v["version_no"], v["version_label"], v["status"], v["searchable"]) == (1, "Rev1.0", "draft", True)
    assert v["word_file_name"] == "proc.docx" and v["pdf_file_name"] == "proc.pdf"
    with env.Session() as db:
        atts = db.query(models.Attachment).filter_by(entity_type="document_version", entity_id=v["id"]).all()
        assert sorted(a.category for a in atts) == ["pdf", "word"]
        assert db.get(models.DocumentVersion, v["id"]).extracted_text == "焊接前檢查\nPre-weld inspection"
    # a second version with only a PDF is not searchable; labels can be given
    r = _version(w, d["id"], pdf=PDF, label="Rev A")
    assert r.status_code == 200 and (r.json()["version_no"], r.json()["version_label"], r.json()["searchable"]) == (2, "Rev A", False)
    # no file at all, a text file as Word, a Word as PDF: refused, no version row left behind
    assert _version(w, d["id"]).status_code == 400
    assert _version(w, d["id"], word=b"just text").status_code == 400
    assert _version(w, d["id"], pdf=docx_bytes("x")).status_code == 400
    with env.Session() as db:
        assert db.query(models.DocumentVersion).filter_by(document_id=d["id"]).count() == 2
    assert _audit(env, "DocumentVersion", v["id"], "CREATE") == [("CREATE", env.ids["writer"], "writer")]
    # download through the register (per-record permission) and through /api/files (document:* permission)
    assert w.get(f"/api/documents/{d['id']}/versions/{v['id']}/download", params={"kind": "pdf"}).content == PDF
    assert w.get(f"/api/documents/{d['id']}/versions/{v['id']}/download", params={"kind": "word"}).status_code == 200
    viewer = env.login("viewer")
    assert viewer.get(f"/api/documents/{d['id']}/versions/{v['id']}/download", params={"kind": "pdf"}).status_code == 200   # km:view on a company document
    with env.Session() as db:
        path = db.query(models.Attachment).filter_by(entity_id=v["id"], category="pdf").one().file_path
    assert w.get(f"/api/files/download/{path}").status_code == 200
    assert viewer.get(f"/api/files/download/{path}").status_code == 200       # a company document's file: km:view governs the generic path too
    approver = env.login("approver")                                          # document:* only, no km:* — cannot touch a COMPANY document's files
    assert approver.get(f"/api/files/download/{path}").status_code == 403
    assert approver.get("/api/files/by-entity", params={"entity_type": "document_version", "entity_id": v["id"]}).status_code == 403
    r = approver.post("/api/files/upload", data={"entity_type": "document_version", "entity_id": v["id"], "category": "pdf"},
                      files={"files": ("x.pdf", PDF, "application/pdf")})
    assert r.status_code == 403 and r.json()["code"] == "PERMISSION_DENIED" and "km:update:all" in r.json()["params"]["permissions"]
    with env.Session() as db:
        word_id = db.query(models.Attachment).filter_by(entity_id=v["id"], category="word").one().id
    assert approver.delete(f"/api/files/{word_id}").status_code == 403
    # ...while a PROJECT document's files stay governed by document:* (the approver may, the km-only viewer may not)
    p = _create(w, scope="project", doc_type="drawing", title_zh="dwg")
    pv = _version(w, p["id"], pdf=PDF).json()
    with env.Session() as db:
        ppath = db.query(models.Attachment).filter_by(entity_id=pv["id"], category="pdf").one().file_path
    assert approver.get(f"/api/files/download/{ppath}").status_code == 200
    assert viewer.get(f"/api/files/download/{ppath}").status_code == 403


def test_files_uploaded_through_api_files_can_be_bound_to_a_draft_version(env):
    w = env.login()
    d = _create(w)
    v = _version(w, d["id"], pdf=PDF).json()
    up = w.post("/api/files/upload", data={"entity_type": "document_version", "entity_id": v["id"], "category": "word"},
                files={"files": ("later.docx", docx_bytes("later text"), DOCX_MIME)})
    assert up.status_code == 200, up.text
    att_id = up.json()[0]["id"]
    r = w.patch(f"/api/documents/{d['id']}/versions/{v['id']}/files", params={"word_attachment_id": att_id})
    assert r.status_code == 200 and r.json()["searchable"] is True and r.json()["word_file_name"] == "later.docx"
    # the pdf slot refuses a word attachment; an unknown category is refused by the files API
    r = w.patch(f"/api/documents/{d['id']}/versions/{v['id']}/files", params={"pdf_attachment_id": att_id})
    assert r.status_code == 400 and r.json()["code"] == "REFERENCE_NOT_FOUND"
    bad = w.post("/api/files/upload", data={"entity_type": "document_version", "entity_id": v["id"], "category": "attachment"},
                 files={"files": ("x.pdf", PDF, "application/pdf")})
    assert bad.status_code == 400
    # a PNG labelled "pdf" passes the generic allow-list but can never become the issued PDF (R1 P2-2)
    png = w.post("/api/files/upload", data={"entity_type": "document_version", "entity_id": v["id"], "category": "pdf"},
                 files={"files": ("x.pdf", b"\x89PNG\r\n\x1a\n" + b"0" * 32, "image/png")})
    assert png.status_code == 200, png.text
    r = w.patch(f"/api/documents/{d['id']}/versions/{v['id']}/files", params={"pdf_attachment_id": png.json()[0]["id"]})
    assert r.status_code == 400 and "not a pdf file" in r.json()["detail"]


# ---- company flow ------------------------------------------------------------------------------------------------------------

def test_company_flow_current_needs_pdf_supersedes_archives_locks_and_unarchives(env):
    w = env.login()
    d = _create(w)
    v1 = _version(w, d["id"], word=docx_bytes("v1")).json()
    r = _to(w, d["id"], "current")
    assert r.status_code == 400 and r.json()["code"] == "DOCUMENT_PDF_REQUIRED"
    assert _to(w, d["id"], "archived").status_code == 409                                  # only a current document archives
    v1 = _version(w, d["id"], pdf=PDF, summary="pdf added").json()                          # v2 carries the PDF
    r = _to(w, d["id"], "current")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "current" and body["current_version_id"] == v1["id"] and body["effective_date"]
    assert [x["status"] for x in body["versions"]] == ["draft", "current"]
    v3 = _version(w, d["id"], word=docx_bytes("v3"), pdf=PDF, summary="revised").json()
    body = _to(w, d["id"], "current", version_id=v3["id"]).json()
    assert [x["status"] for x in body["versions"]] == ["draft", "superseded", "current"]
    assert body["current_version"]["version_no"] == 3
    # the issued version's files are locked for the generic files API
    up = w.post("/api/files/upload", data={"entity_type": "document_version", "entity_id": v3["id"], "category": "pdf"},
                files={"files": ("again.pdf", PDF, "application/pdf")})
    assert up.status_code == 409 and up.json()["code"] == "ATTACHMENT_LOCKED"
    r = w.patch(f"/api/documents/{d['id']}/versions/{v3['id']}/files", params={"pdf_attachment_id": "whatever"})
    assert r.status_code == 409 and r.json()["code"] == "RECORD_LOCKED"
    # archive: fields lock except tags; a version cannot be added; unarchive returns to current
    body = _to(w, d["id"], "archived").json()
    assert body["status"] == "archived"
    r = w.patch(f"/api/documents/{d['id']}", json={"title_zh": "new title", "row_version": body["row_version"]})
    assert r.status_code == 409 and r.json()["code"] == "RECORD_LOCKED" and r.json()["params"]["fields"] == ["title_zh"]
    r = w.patch(f"/api/documents/{d['id']}", json={"tags": "welding", "row_version": body["row_version"]})
    assert r.status_code == 200 and r.json()["tags"] == "welding"
    r = _version(w, d["id"], pdf=PDF)
    assert r.status_code == 409 and r.json()["code"] == "RECORD_LOCKED"
    body = _to(w, d["id"], "draft").json()
    assert body["status"] == "current" and body["current_version"]["version_no"] == 3
    assert _to(w, d["id"], "superseded").status_code == 409                                # never set by hand
    assert _to(w, d["id"], "approved").status_code == 409                                  # not a company status
    assert len(_audit(env, "Document", d["id"], "UPDATE")) >= 5


# ---- project flow ------------------------------------------------------------------------------------------------------------

def test_project_plan_goes_draft_submitted_approved_with_the_approve_permission(env):
    w, approver = env.login("writer"), env.login("approver")
    d = _create(w, scope="project", doc_type="plan", title_zh="施工計畫")
    v = _version(w, d["id"], word=docx_bytes("plan"), pdf=PDF).json()
    assert _to(approver, d["id"], "approved").status_code == 409                           # not submitted yet (state, after permission)
    body = _to(w, d["id"], "submitted").json()
    assert body["status"] == "submitted" and body["versions"][0]["submitted_at"]
    r = _to(w, d["id"], "approved")
    assert r.status_code == 403 and r.json()["code"] == "PERMISSION_DENIED"                 # writer lacks document:approve
    r = _to(approver, d["id"], "draft")                                                    # sent back
    assert r.status_code == 200 and r.json()["status"] == "draft" and r.json()["versions"][0]["status"] == "draft"
    _to(w, d["id"], "submitted")
    body = _to(approver, d["id"], "approved").json()
    assert body["status"] == "approved" and body["current_version_id"] == v["id"]
    assert body["versions"][0]["approved_by_user_id"] == env.ids["approver"] and body["effective_date"]
    # content fields are locked once approved; a new version goes through submit again and supersedes
    r = w.patch(f"/api/documents/{d['id']}", json={"title_zh": "x", "row_version": body["row_version"]})
    assert r.status_code == 409 and r.json()["code"] == "RECORD_LOCKED"
    v2 = _version(w, d["id"], pdf=PDF, summary="rev B").json()
    assert _to(w, d["id"], "submitted", version_id=v2["id"]).json()["status"] == "submitted"
    body = _to(approver, d["id"], "approved", version_id=v2["id"]).json()
    assert [x["status"] for x in body["versions"]] == ["superseded", "approved"]
    # void needs the approve permission and a reason; afterwards nothing moves
    assert _to(w, d["id"], "void", reason="dup").status_code == 403
    r = _to(approver, d["id"], "void")
    assert r.status_code == 400 and r.json()["code"] == "REASON_REQUIRED"
    body = _to(approver, d["id"], "void", reason="duplicate of PLN-000002").json()
    assert body["status"] == "void" and body["versions"][1]["void_reason"] == "duplicate of PLN-000002"
    assert _to(approver, d["id"], "approved").status_code == 409
    assert _version(w, d["id"], pdf=PDF).status_code == 409
    # void documents are hidden from the default list, shown with include_hidden
    assert d["id"] not in [x["id"] for x in w.get("/api/documents/", params={"scope": "project"}).json()]
    assert d["id"] in [x["id"] for x in w.get("/api/documents/", params={"scope": "project", "include_hidden": "true"}).json()]


def test_registered_only_project_types_are_approved_directly_by_the_update_holder(env):
    w = env.login()
    d = _create(w, scope="project", doc_type="drawing", title_zh="圖說", vendor_id="v1")
    assert d["vendor_id"] == "v1"
    r = _to(w, d["id"], "submitted")
    assert r.status_code == 409 and r.json()["code"] == "INVALID_TRANSITION"
    v = _version(w, d["id"], pdf=PDF).json()
    body = _to(w, d["id"], "approved").json()
    assert body["status"] == "approved" and body["current_version_id"] == v["id"]


# ---- search, optimistic lock, delete -----------------------------------------------------------------------------------------

def test_search_matches_number_title_tags_and_current_word_text_with_a_snippet(env):
    w = env.login()
    a = _create(w, title_zh="焊接程序書", tags="welding,wps")
    _to(w, a["id"], "current", version_id=_version(w, a["id"], word=docx_bytes("The preheat temperature shall be 150°C minimum."), pdf=PDF).json()["id"])
    b = _create(w, title_zh="油漆程序書")
    _version(w, b["id"], word=docx_bytes("preheat is not relevant here"), pdf=PDF)          # draft, not current: not searched

    def hits(q):
        return w.get("/api/documents/", params={"scope": "company", "q": q}).json()
    assert [h["doc_no"] for h in hits("preheat")] == [a["doc_no"]]
    assert "150°C" in hits("preheat")[0]["snippet"]
    assert [h["id"] for h in hits("wps")] == [a["id"]]
    assert [h["id"] for h in hits("油漆")] == [b["id"]] and hits("油漆")[0]["snippet"] is None
    assert [h["id"] for h in hits("QTS-KM-000001")] == [a["id"]]
    assert hits("nothing-like-this") == []


def test_update_is_optimistically_locked(env):
    w = env.login()
    d = _create(w)
    r = w.patch(f"/api/documents/{d['id']}", json={"title_en": "Welding Procedure", "row_version": d["row_version"]})
    assert r.status_code == 200 and r.json()["row_version"] == d["row_version"] + 1
    stale = w.patch(f"/api/documents/{d['id']}", json={"title_en": "again", "row_version": d["row_version"]})
    assert stale.status_code == 409 and stale.json()["code"] == "VERSION_CONFLICT"
    assert w.get(f"/api/documents/{d['id']}").json()["title_en"] == "Welding Procedure"


def test_delete_is_soft_draft_only_and_refused_while_referenced_or_issued(env):
    w = env.login()
    draft = _create(w, title_zh="draft")
    issued = _create(w, title_zh="issued")
    _to(w, issued["id"], "current", version_id=_version(w, issued["id"], pdf=PDF).json()["id"])
    r = w.delete(f"/api/documents/{issued['id']}")
    assert r.status_code == 409 and r.json()["code"] == "RECORD_LOCKED"
    ref = w.post("/api/documents/references", json={"from_type": "ncr", "from_id": "ncr-1", "document_id": draft["id"], "section_ref": "4.2"})
    assert ref.status_code == 200
    r = w.delete(f"/api/documents/{draft['id']}")
    assert r.status_code == 400 and r.json()["code"] == "REFERENCE_IN_USE" and r.json()["params"]["count"] == 1
    assert w.delete(f"/api/documents/references/{ref.json()['id']}").status_code == 200
    assert w.delete(f"/api/documents/{draft['id']}").json() == {"ok": True}
    assert w.get(f"/api/documents/{draft['id']}").status_code == 404
    with env.Session() as db:
        assert db.get(models.Document, draft["id"]).is_deleted is True                       # soft: the row stays
    viewer = env.login("viewer")
    assert viewer.delete(f"/api/documents/{issued['id']}").status_code == 403


# ---- references --------------------------------------------------------------------------------------------------------------

def test_references_point_at_the_current_version_remember_the_version_no_and_dedupe(env):
    w, viewer = env.login("writer"), env.login("viewer")
    d = _create(w)
    v1 = _version(w, d["id"], pdf=PDF).json()
    _to(w, d["id"], "current")
    r = w.post("/api/documents/references", json={"from_type": "itp_item", "from_id": "itp-1:3", "document_id": d["id"], "section_ref": "5.1"})
    assert r.status_code == 200, r.text
    ref = r.json()
    assert (ref["version_id"], ref["pinned_version_no"], ref["doc_no"], ref["title_zh"]) == (None, 1, d["doc_no"], "焊接程序書")
    again = w.post("/api/documents/references", json={"from_type": "itp_item", "from_id": "itp-1:3", "document_id": d["id"], "section_ref": "5.1"})
    assert again.json()["id"] == ref["id"]                                                  # same reference, not a duplicate
    pinned = w.post("/api/documents/references", json={"from_type": "ncr", "from_id": "n1", "document_id": d["id"], "pin_version": True}).json()
    assert pinned["version_id"] == v1["id"] and pinned["section_ref"] == ""
    assert [x["section_ref"] for x in w.get(f"/api/documents/{d['id']}/references").json()] == ["5.1", ""]
    by_source = viewer.get("/api/documents/references/by-source", params={"from_type": "itp_item", "from_id": "itp-1:3"}).json()
    assert [x["id"] for x in by_source] == [ref["id"]]                                      # a viewer may read references to visible documents
    assert viewer.post("/api/documents/references", json={"from_type": "ncr", "from_id": "n2", "document_id": d["id"]}).status_code == 200
    assert len(w.get(f"/api/documents/{d['id']}").json()["references"]) == 3
    assert viewer.delete(f"/api/documents/references/{ref['id']}").status_code == 403       # not theirs, no update permission
    assert w.delete(f"/api/documents/references/{ref['id']}").status_code == 200
    assert _audit(env, "DocumentReference", ref["id"]) == [("CREATE", env.ids["writer"], "writer"), ("DELETE", env.ids["writer"], "writer")]
