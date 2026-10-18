# STATUS.md — Claude 執行結果

TASK_ID: KM-DOCS-2026-001-D1
ROUND: 1（2026-10-18）
基準：e651f87a（樂觀鎖 B3a；backend 與 b8fb529e 相同），detached worktree，未推送、未部署。

## RESULT
- [x] 後端登錄核心完成：三表（migration_owned，第 33 步 IF NOT EXISTS＋add-if-missing）、文件／版次／引用 API、狀態流程、Word 抽文字＋LIKE 搜尋、公司／專案編號、附件接線、審計。前端 0 檔。
- [x] 本機 Python 3.14：新測試 4 檔 21 項（test_documents_http 13、test_document_text 3、test_km_articles_migration_script 3、demo 腳本另計）＋受影響既有套件（B3／B4 編號、樂觀鎖、seeder、refusal 2b、KM、scope、material）通過；附件授權套件矩陣補 `document_version` 後重跑 **280 passed**（原 269＋新類型 11 個參數化案例）。
- [x] **3.11 全套 PASS：2905 passed／17 skipped／0 failed**（第 2 輪，最終樹，11:12–12:13Z，docker python:3.11-slim，`docs/workflow/py311-full-suite.sh`），輸出 `KM-DOCS-2026-001-D1-evidence/py311-full-d1.txt`（sha256 前 16 碼 8c15e07acd04f924）。第 1 輪 2900 passed／5 failed 的輸出留存為 `py311-full-d1-round1-5failed.txt`（根因與修正見下節）；3.11 容器單跑文件＋附件套件 293 passed（`py311-documents-attachments-after-mime-fix.txt`）。
- [x] 獨立審查 R1（獨立代理人，唯讀）：**REVISE** 1 P1＋3 P2＋3 P3 → 全部修正或說明（見 REVIEW）；修正後 test_documents_http 13 passed（含新增的公司層 /api/files 權限與 PNG-as-PDF 斷言）。待 R1 複核或主要調度認可。修正後受影響套件重跑（附件授權、B3 編號、KM 上傳安全、refusal 2b、抽文字、遷移腳本）**354 passed**。
- [x] API 示範紀錄：`docs/workflow/KM-DOCS-2026-001-D1-evidence/api-demo.md`（建立公司／專案文件 → 上傳版次（Word＋PDF）→ 無 PDF 版次設現行被拒 400 → 設現行 → 搜尋命中片段 → 引用＋由來源查 → 已發行版次檔案鎖 409 → 封存後改欄位 409 → 刪除已發行 409 → 專案文件送審／核准 → 下載 PDF → 詳情）。產生腳本 `backend/scripts/verification/km_docs_d1_api_demo.py`（throw-away DB）。
- [ ] 既有 KM 文章遷移：**本批不執行**（主要調度指示；Q5 PDF 來源待使用者）。腳本已完成並有測試。

## 決定
DECISIONS「KM 改為受控文件登錄」（本批新增一條，含 Q1–Q6、D1 八點裁定、Q5 待決、取代 KM-BILINGUAL／KM-STATUS）。Q5 另列入「尚未決策」。

## 本輪修改：產品程式

### 後端（新增）
| 檔案 | 內容 |
|---|---|
| `models.py` | `Document`／`DocumentVersion`／`DocumentReference`（migration_owned；版次帶 status 與 scope／project_id／vendor_id 快照；`documents.source_km_article_id` 供遷移去重）。 |
| `core/document_text.py` | python-docx 抽段落／表格／頁首頁尾文字；`snippet()` 命中片段。非 docx 回 None。 |
| `repositories/document_repository.py` | 清單（scope 分流、apply_scope、LIKE 於五欄含現行版 extracted_text）、版次、附件列、引用。 |
| `services/document_service.py` | 權限（company km:*／project document:*；範本僅管理員 403 SHARED_TEMPLATE_ADMIN_ONLY）、建立（取號在 begin_write_transaction 內）、更新（claim_row_version、鎖定欄位 409 RECORD_LOCKED）、版次（單一交易：版次列＋檔案＋Attachment 列＋抽文字；失敗刪檔回滾；Word 必須是 ZIP／OLE）、補綁檔案、下載（realpath 守衛）、狀態流程（company current／archived／draft；project submitted／approved／draft／void；PDF 必填 400 DOCUMENT_PDF_REQUIRED；作廢理由 400 REASON_REQUIRED）、軟刪除（409 RECORD_LOCKED／400 REFERENCE_IN_USE）、引用 CRUD。全部 log_audit strict。 |
| `routers/documents.py` | `/api/documents` 12 個端點；Refusal→409（VERSION_CONFLICT／RECORD_LOCKED／INVALID_TRANSITION）或 400；ScopeForbidden／PermissionDenied→403。 |
| `scripts/migrate_km_articles_to_documents.py` | 一次性：每本 KM 書→公司文件草稿＋版次 1（Word 來自既有 export_docx；extracted_text 來自章節 HTML 去標籤；無 PDF）；`--dry-run`；以 `source_km_article_id` 去重；需 DATABASE_URL。 |
| `scripts/verification/km_docs_d1_api_demo.py` | API 示範紀錄產生器。 |

### 後端（修改）
| 檔案 | 內容 |
|---|---|
| `schemas.py` | Document*／DocumentVersionOut／DocumentReference*／DocumentTransition；型別清單常數。 |
| `db_migrations.py`（CRLF 保留） | 第 33 步 `_create_document_registry_schema()`（由模型 DDL CREATE IF NOT EXISTS、索引、缺欄補、驗證不符即 MigrationError）；`ROW_VERSION_TABLES` 加 `documents`。 |
| `core/perms.py` | `DOCUMENT_VIEW/CREATE/UPDATE/APPROVE`＋ALL_PERMISSIONS 四筆（seeder 自動補碼、admin 全有）。 |
| `core/scope.py`（清單外，照准） | `is_company_wide`／`company_wide_clause`：公司層文件與版次對所有專案／承包商可見；`_ENTITY_MODELS` 加 `document_version`。 |
| `core/attachment_access.py` | `document_version`：權限 (DOCUMENT_VIEW, DOCUMENT_UPDATE)、類別 word／pdf、鎖定狀態 current／approved／superseded／archived／void；`permission_entity_type()`：公司層版次改以 km:* 管（R1 P1-1）。 |
| `routers/file_router.py` | `_VALID_ENTITY_TYPES` 加 `document_version`；五個端點的權限檢查改用 `permission_entity_type`（R1 P1-1）；`max_upload_bytes()`：document_version 的 pdf 用 `DOCUMENT_PDF_MAX_MB`（預設 50），其餘 20MB 不變。 |
| `core/config.py`（清單外，照准） | `DOCUMENT_PDF_MAX_MB`。 |
| `core/utils.py`（CRLF 保留） | `generate_company_doc_no()`（自 KMRepository 搬出，同計數器）；`_DOC_LABELS` 加 PLN／DWG／SPC／CER／APR（規則表未補種時的 fallback 與規則一致）。 |
| `repositories/km_repository.py` | `get_next_km_no` 改呼叫 `generate_company_doc_no`。 |
| `routers/settings.py` | DEFAULT_NAMING_RULES 加 plan／drawing／spec／certificate／approval。 |
| `core/dependencies.py`、`main.py` | `get_document_service`；掛 `documents` router。 |

### 測試
- 新增：`tests/test_documents_http.py`（13：編號與計數器共用、類型／層檢查、scope 必填與專案範圍、範本管理員、版次上傳與型別檢查、/api/files 補綁、公司流程、專案送審核准作廢、登錄型直接核准、搜尋、樂觀鎖、軟刪除、引用）、`tests/test_document_text.py`（3）、`tests/test_km_articles_migration_script.py`（3）。
- 依設計改變：`tests/test_ref_project_seq_b3_http.py`（規則數 13→18、14→19；審計 10→15、13→18）、`tests/test_attachment_authorization_http.py`（矩陣與種子加 `document_version`／`dv-1`，類別 pdf）。

### 文件
- `BACKLOG.md` #61（KM-DOCS，含 D1–D5 子項、KM-SEARCH／KM-XREF 併入、待使用者確認清單）。
- `DECISIONS.md`：新增「KM 改為受控文件登錄」、「尚未決策」加 Q5。
- `docs/workflow/KM-DOCS-2026-001-DESIGN.md`（自主要調度草案 v1 →v1.1：Q5 改待決、§10 落地紀錄）、`-D1-TASK.md`、`-D1-STATUS.md`、`-D1-REVIEW.md`、`-D1-evidence/`。

## 3.11 專屬問題與修正（第 1 輪 3.11 全套 5 failed → 已修）
- 第 1 輪 3.11 全套（修正 R1 後的樹）：2900 passed／5 failed，五個都在 test_documents_http，本機 3.14 全過。根因：python:3.11-slim 沒有系統 MIME 資料庫，`mimetypes.guess_type("x.docx")` 回 None，通用驗證把真正的 .docx 判成 application/zip，被服務層的 Word 檢查擋下。
- 修正：`document_service.word_or_pdf_mime()` 直接以檔頭判定（%PDF／PK＝docx／OLE＝doc），`_check_file` 與 `bind_files`（R1 P2-2）都改用它；`routers/file_router.py` 模組載入時 `mimetypes.add_type` 註冊 .docx／.xlsx／.pptx（既有通用上傳在正式站也因此把 .docx 存成 application/zip，順帶修正）。本機 18 項通過；3.11 容器單跑 test_documents_http＋附件授權套件 293 passed；全套第 2 輪 2905 passed（RESULT）。

## 未測／注意
- 50MB PDF 上限只有單元層檢查（max_upload_bytes），未實際上傳大檔。
- `/api/files` 對 document_version 的權限依文件層決定：公司層 km:*、專案層 document:*（R1 P1-1 修正後）；D2 前端下載建議仍用 `/api/documents/{id}/versions/{vid}/download`。
- 第 33 步在正式站是新表（無舊資料），驗證只檢查欄位存在；型別不符不會自動修。
- 遷移腳本未在正式複本演練（本批不執行）。
