"""KM-DOCS-2026-001 D1 — API walk-through on a throw-away database (create document → upload version → set current →
search hit → reference), written as a Markdown log for the STATUS evidence. Nothing here touches a real database or the
project's uploads: an in-memory SQLite file under a temp directory and QUALITAS_UPLOAD_ROOT pointed at a temp folder.

    cd backend && DATABASE_URL=sqlite:///:memory: python scripts/verification/km_docs_d1_api_demo.py <output.md>
"""
import importlib
import io
import json
import os
import secrets
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


def main(out_path: str) -> int:
    tmp = tempfile.mkdtemp(prefix="km-docs-demo-")
    os.environ["QUALITAS_UPLOAD_ROOT"] = os.path.join(tmp, "uploads")
    from docx import Document as Docx
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    import db_migrations
    import models
    from core import perms
    from core.refusals import RefusalHTTPException, refusal_exception_handler
    from core.security import get_password_hash
    from database import Base, get_db
    import core.security as security

    engine = create_engine(f"sqlite:///{tmp}/demo.db", connect_args={"check_same_thread": False})
    models.create_all_except_migration_owned(bind=engine)
    db_migrations.engine = engine
    db_migrations._create_migration_flags_table()
    db_migrations._create_document_registry_schema()          # step 33, as start-up runs it
    S = sessionmaker(bind=engine, autoflush=False)
    security.SessionLocal = S
    password = secrets.token_urlsafe(16)
    with S() as db:
        db.add(models.Project(id="P-DEMO", name="Demo project", code="DM"))
        db.add(models.Contractor(id="c1", name="Demo Contractor", abbreviation="DC"))
        role = models.Role(name="DocWriter")
        role.permissions_rel = [models.Permission(code=c, description=c) for c in
                                (perms.KM_VIEW, perms.KM_CREATE, perms.KM_UPDATE, perms.KM_DELETE, perms.DOCUMENT_VIEW,
                                 perms.DOCUMENT_CREATE, perms.DOCUMENT_UPDATE, perms.DOCUMENT_APPROVE)]
        db.add(role)
        db.flush()
        u = models.User(username="demo", email="demo@example.com", is_active=True, role_id=role.id, hashed_password=get_password_hash(password))
        db.add(u)
        db.flush()
        db.add(models.UserProject(user_id=u.id, project_id="P-DEMO"))
        db.commit()

    app = FastAPI()
    for name in ("auth", "documents", "file_router"):
        app.include_router(importlib.import_module("routers." + name).router, prefix="/api")
    app.add_exception_handler(RefusalHTTPException, refusal_exception_handler)

    def session():
        with S() as db:
            yield db
    app.dependency_overrides[get_db] = session

    log = ["# KM-DOCS-2026-001 D1 — API walk-through (throw-away DB, TestClient)", ""]

    def step(title, resp, body_keys=None):
        log.append(f"## {title}")
        query = resp.request.url.query
        query = query.decode() if isinstance(query, bytes) else (query or "")
        log.append(f"`{resp.request.method} {resp.request.url.path}{('?' + query) if query else ''}` → **{resp.status_code}**")
        try:
            data = resp.json()
        except Exception:
            log.append(f"(binary, {len(resp.content)} bytes)")
            log.append("")
            return None
        shown = data if body_keys is None else ({k: data.get(k) for k in body_keys} if isinstance(data, dict) else data)
        log.append("```json")
        log.append(json.dumps(shown, ensure_ascii=False, indent=2)[:1800])
        log.append("```")
        log.append("")
        return data

    with TestClient(app) as c:
        r = c.post("/api/auth/login", data={"username": "demo", "password": password})
        assert r.status_code == 200, r.text
        doc = step("1. 建立公司文件（程序書）", c.post("/api/documents/", json={
            "scope": "company", "doc_type": "procedure", "title_zh": "焊接作業程序書", "title_en": "Welding Procedure", "tags": "welding,wps"}),
            ["id", "doc_no", "scope", "doc_type", "status", "title_zh", "row_version"])
        plan = step("1b. 建立專案文件（施工計畫，依專案命名規則取號）", c.post("/api/documents/", json={
            "scope": "project", "doc_type": "plan", "title_zh": "鋼筋施工計畫", "project_id": "P-DEMO", "vendor_id": "c1"}),
            ["id", "doc_no", "scope", "project_id", "vendor_id", "status"])
        word = Docx()
        word.add_paragraph("焊接前檢查：預熱溫度不得低於 150°C。")
        word.add_paragraph("Pre-weld inspection: preheat temperature shall be 150°C minimum.")
        buf = io.BytesIO()
        word.save(buf)
        pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
        ver = step("2. 上傳版次（Word＋PDF，一次交易；Word 抽文字）", c.post(f"/api/documents/{doc['id']}/versions",
                   files={"word": ("WPS.docx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                          "pdf": ("WPS.pdf", pdf, "application/pdf")}, data={"change_summary": "初版"}),
                   ["id", "version_no", "version_label", "status", "word_file_name", "pdf_file_name", "searchable"])
        step("3a. 設為現行前先看：沒有 PDF 的版次會被拒（示範用第二個草稿版次）",
             c.post(f"/api/documents/{doc['id']}/versions", files={"word": ("v2.docx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                    data={"change_summary": "只有 Word"}), ["id", "version_no", "searchable"])
        step("3b. 把只有 Word 的版次設為現行 → 400 DOCUMENT_PDF_REQUIRED",
             c.post(f"/api/documents/{doc['id']}/transition", json={"to": "current"}))
        cur = step("3c. 設第 1 版為現行 → current，effective_date 自動帶入",
                   c.post(f"/api/documents/{doc['id']}/transition", json={"to": "current", "version_id": ver["id"]}),
                   ["status", "current_version_id", "effective_date", "row_version"])
        step("4. 搜尋命中抽出文字並回傳片段", c.get("/api/documents/", params={"scope": "company", "q": "preheat"}))
        step("4b. 搜尋編號", c.get("/api/documents/", params={"scope": "company", "q": doc["doc_no"]}))
        ref = step("5. 跨模組引用（NCR 根因引用第 4.2 節；指向現行版、記錄建立時版次）",
                   c.post("/api/documents/references", json={"from_type": "ncr", "from_id": "ncr-demo-1", "document_id": doc["id"], "section_ref": "4.2"}))
        step("5b. 由來源查引用", c.get("/api/documents/references/by-source", params={"from_type": "ncr", "from_id": "ncr-demo-1"}))
        step("6. 已發行版次的檔案鎖定：/api/files/upload 回 409 ATTACHMENT_LOCKED",
             c.post("/api/files/upload", data={"entity_type": "document_version", "entity_id": ver["id"], "category": "pdf"},
                    files={"files": ("again.pdf", pdf, "application/pdf")}))
        step("7. 封存後改標題 → 409 RECORD_LOCKED（只有 tags 可改）", (c.post(f"/api/documents/{doc['id']}/transition", json={"to": "archived"}),
             c.patch(f"/api/documents/{doc['id']}", json={"title_zh": "改名", "row_version": cur["row_version"] + 1}))[1])
        step("8. 刪除已發行文件 → 409；刪除有引用的草稿 → 400 REFERENCE_IN_USE", c.delete(f"/api/documents/{doc['id']}"))
        step("9a. 專案文件上傳版次", c.post(f"/api/documents/{plan['id']}/versions", files={"pdf": ("plan.pdf", pdf, "application/pdf")},
                                        data={"change_summary": "初版"}), ["id", "version_no", "status", "searchable"])
        step("9b. 專案文件送審 → submitted；核准（approve 權限）→ approved，effective_date 帶入",
             (c.post(f"/api/documents/{plan['id']}/transition", json={"to": "submitted"}),
              c.post(f"/api/documents/{plan['id']}/transition", json={"to": "approved"}))[1], ["doc_no", "status", "effective_date", "versions"])
        step("10. 下載現行版 PDF", c.get(f"/api/documents/{doc['id']}/versions/{ver['id']}/download", params={"kind": "pdf"}))
        step("11. 文件詳情（版次＋引用）", c.get(f"/api/documents/{doc['id']}"), ["doc_no", "status", "latest_version_no", "versions", "references"])

    Path(out_path).write_text("\n".join(log) + "\n", encoding="utf-8")
    print(f"written {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "km_docs_d1_api_demo.md"))
