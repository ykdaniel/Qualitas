# TASK.md — KM-DOCS 第 1 批：後端登錄核心（主要調度 2026-10-18 核定）

TASK_ID: KM-DOCS-2026-001-D1
SOURCE: `docs/workflow/KM-DOCS-2026-001-DESIGN-draft.md` v1（主要調度依使用者 2026-10-18 方向撰寫；Q1–Q6 使用者同日照建議值決定）。本草稿把 KM-DIRECTION 草案可用的部分併入（引用表、材料送審 rev 模式手法、A-1 回收），**資料表名稱一律用 DESIGN 的 `documents`／`document_versions`／`document_references`**。
基準：**e651f87a**（樂觀鎖 B3a，主要調度 2026-10-18 指定；backend 與 b8fb529e 相同）。
取代：KM-BILINGUAL-2026-001 A-1（f965b6fb 作廢保留、不送審不部署）、KM-STATUS-2026-001。A-1 的 history author／import audit 小修**不另拆批**，於本批新模型內一併實現（版次由 `created_by_user_id` 記錄；寫入皆 log_audit）。
範圍原則：**不動前端**；不動 `pqp` 表（Q1）；不加 PDF 抽文字依賴（只抽 Word）；不做範本套用（D3）、引用的呼叫端（D5）——但 D1 要把表與 API 做到 D3／D5 能直接接。

## 1. 資料模型（DESIGN §3.1 為準，以下為落地細節與補充）
### `documents`
| 欄 | 型別／規則 |
|---|---|
| id | String PK（uuid） |
| doc_no | String, unique index；company 層 `QTS-KM-######`；project 層依 doc_type 命名規則 |
| scope | `company` / `project`（CHECK 於服務層） |
| project_id | FK projects.id, nullable；scope=project 必填（服務層驗證＋`require_same_project`） |
| vendor_id | FK contractors.id, nullable（Q3 選填） |
| doc_type | §3.3 的代碼：procedure / standard / definition / guideline / template / pqp / plan / drawing / spec / certificate / approval（D1 只讓 `pqp` 以外的類型建立；pqp 類型保留給 D3 接線，D1 拒絕建立 `doc_type='pqp'` 的 documents 列，避免與 `pqp` 表並存兩套） |
| title_zh, title_en, category, tags | String；title_zh 必填，title_en 選填 |
| status | company：`draft` / `current` / `archived`；project：`draft` / `submitted` / `approved` / `superseded` / `void` |
| current_version_id | FK document_versions.id, nullable（快取，與 `material_submittals.current_approved_rev_no` 同手法：由服務層在狀態轉換時維護，無 DB 觸發） |
| effective_date | String（ISO 日期） |
| owner_user_id | FK users.id, SET NULL |
| is_template | Boolean default 0；只允許 scope=company |
| template_fields | Text(JSON)；D1 只存不解析（D3 用） |
| created_at, updated_at | String |
| row_version | Integer NOT NULL DEFAULT 0（OPTIMISTIC-LOCK；加進 `ROW_VERSION_TABLES`） |
| is_deleted | Boolean default 0（軟刪除；D1 不提供硬刪） |

### `document_versions`
| 欄 | 規則 |
|---|---|
| id, document_id (FK, CASCADE 於 ORM 層；SQLite FK 不啟用，刪除走服務層) | |
| version_no | Integer，從 1 遞增，`(document_id, version_no)` unique |
| version_label | String，預設 `Rev{version_no}.0`，可改 |
| change_summary | Text |
| word_attachment_id, pdf_attachment_id | FK attachments.id, nullable；**設為 current／approved 時 PDF 必填**（DESIGN §4） |
| extracted_text, extracted_at | Text／String；Word 上傳或綁定時由 python-docx 抽段落＋表格文字；PDF 不抽（Q4） |
| source_template_document_id, source_template_version_id | nullable（D3 寫） |
| status_at_version | 建立時的文件狀態快照 |
| submitted_at, approved_at, approved_by_user_id | project 層流程用 |
| created_by_user_id, created_at | **＝A-1「history author 改本次修改人」的落地** |

### `document_references`（KM-DIRECTION 的 `km_document_refs` 併入，名稱從 DESIGN）
| 欄 | 規則 |
|---|---|
| id | |
| from_type, from_id | 來源模組（itp / itp_item / ncr / checklist / checklist_item / pqp …），D1 只定義表＋CRUD API，不接呼叫端 |
| document_id | FK documents.id |
| version_id | nullable：NULL＝永遠指向現行版（**建議預設**，引用列另存 `pinned_version_no` 供顯示「建立時為 Rev x」） |
| section_ref | String（章節號／頁碼文字） |
| created_by_user_id, created_at | |
| unique | `(from_type, from_id, document_id, section_ref)` |

### 建表方式
- 三張表 `migration_owned`（比照材料送審四表），由 `db_migrations._create_document_registry_schema()` 以 `CREATE TABLE IF NOT EXISTS`＋add-if-missing 建立（idempotent、無旗標）；索引：documents(scope, project_id, status, doc_type, doc_no)、document_versions(document_id, version_no)、document_references(from_type, from_id)、(document_id)。
- `ROW_VERSION_TABLES` 加 `documents`。
- `attachments.entity_type` 新值 `document_version`；`file_router._VALID_ENTITY_TYPES` 與 `core/attachment_access.ENTITY_PERMISSIONS` 加一筆；category 用 `word` / `pdf`（`validate_category` 加白名單）。上傳順序：先建版次列（draft）→ 上傳檔案綁 `entity_id=version.id` → PATCH 版次把 attachment id 寫進 `word_attachment_id`／`pdf_attachment_id` 並抽文字；或單一 `POST /documents/{id}/versions`（multipart：word、pdf、change_summary）一步完成——**草稿採後者**（一次交易、少一步失敗面），同時保留 file_router 路徑供補檔。

## 2. 狀態流程（服務層，狀態字串小寫；非法轉換回 409 `INVALID_TRANSITION`，沿用既有代碼）
- company：`draft → current`（需 PDF；前一個 current 版次所屬 documents.status 不變，但 `current_version_id` 切到新版，舊版次 `status_at_version` 不改）、`current → archived`、`archived → current`（解封）。文件層只有一個 current。
- project：`draft → submitted → approved`（approved 需 PDF；核准時同 document 其他 approved 版次自動 `superseded`）、任何 → `void`（需 reason）。`approved`／`void` 後版次唯讀（新內容只能開新版次），文件主檔欄位除 status／tags 外鎖定（409 `RECORD_LOCKED`）。
- 版次建立＝`version_no = max+1`，在 `begin_write_transaction` 內取號（沿用 B3 的競態防護）。
- 權限：company 走 `km:view/create/update/delete:all`；project 走新四碼 `document:view/create/update/approve:all`（**待裁**：新增代碼並加進 `ALL_PERMISSIONS`／`ENTITY_PERMISSIONS`，或沿用 `pqp:*`？草稿建議新增 `document:*`，因 plan／drawing 等不是 PQP）＋`core/scope` 專案範圍過濾；範本（is_template）建立／改版只限 admin（比照 D18）。
- 審計：create / new version / transition / reference 皆 `log_audit(strict=True)`，與 KM 同一提交。

## 3. 編號
- company：沿用 `KMRepository.get_next_km_no` 的做法（規則 doc_type `km`，預設 `QTS-KM-`，序號 key `(QTS, SYS, km)`），搬到 `core/utils` 成 `generate_company_doc_no(db)`；**不經 `_reference_format`**（它在 project_id=None 時只放行 ITP／CHECKLIST）。
- project：`generate_reference_no(db, "", <TYPE>, project_id=...)`；`DEFAULT_NAMING_RULES` 新增 `plan→PLN`、`drawing→DWG`、`spec→SPC`、`certificate→CER`、`approval→APR`（pqp 既有）。**每一新類型附第一筆編號格式測試**（AGENTS.md）：`QTS-RKS-<CODE>-PLN-000001` 等。
- 既有 `_naming_rules_to_project_format` 第 29 步已跑過，新規則靠 settings 的「缺少即補種」邏輯進表；B4 的 `continue_counters_from_legacy_abbreviation` 對新類型無舊計數，略過。

## 4. API（`routers/documents.py`，prefix `/documents`，全部 Depends 權限）
| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/documents/` | 參數 scope（必填）、project_id、doc_type、status、is_template、q（LIKE 於 doc_no／title_zh／title_en／tags／current 版次 extracted_text）、skip/limit（`sanitize_pagination`）；預設不含 archived／void／is_deleted；回傳含 current 版次摘要與命中片段（extracted_text 前後 80 字） |
| POST | `/documents/` | 建立文件（draft，無版次）；scope=project 驗 project、vendor 選填；doc_type=pqp 拒絕（D3） |
| GET | `/documents/{id}` | 文件＋全部版次（含 attachments 的下載 URL）＋被引用清單 |
| PATCH | `/documents/{id}` | 主檔欄位；帶 `row_version`；鎖定規則見 §2 |
| POST | `/documents/{id}/versions` | multipart：word（選）、pdf（選）、change_summary、version_label（選）→ 建版次、抽文字 |
| PATCH | `/documents/{id}/versions/{vid}/files` | 補綁 word／pdf attachment id（給 file_router 路徑用） |
| POST | `/documents/{id}/transition` | body `{to, reason?, version_id?}`：依 §2 |
| DELETE | `/documents/{id}` | 軟刪除；有引用或非 draft 時 400 coded refusal |
| GET/POST/DELETE | `/documents/{id}/references`、`/documents/references/by-source?from_type&from_id` | D5 的呼叫端用；D1 先提供 |
| GET | `/documents/{id}/versions/{vid}/download?kind=word|pdf` | 轉 file_router 既有授權下載 |

## 5. 既有 KM 文章遷移（§5 簡化：正式站只有 1 本 Draft 書、26 章、0 附件）
- 一次性腳本 `scripts/migrate_km_articles_to_documents.py`（不是啟動遷移；由主要調度在 NAS 以隔離方式對正式 DB 執行一次，先在複本演練）：每本書 → `documents(scope=company, doc_type 依 category 對映, status=draft)`＋版次 1，Word 由 `KMService.export_docx(lang='both')`（b8fb529e 上為既有 export_docx）產生並以 `attachments(entity_type=document_version, category=word)` 儲存，`change_summary="自 KM 文章遷移"`，extracted_text 由章節 HTML 去標籤而得（比 Word 再抽更準）。
- **PDF：見不一致第 1 點**；腳本先不產 PDF，版次留 draft（current 需 PDF）。
- `km_articles` 不動；router 既有 create/update/delete/import 在 D1 **不關**（D2 前端唯讀化時再把寫入端點改 410 或移除）。
- 腳本有 `--dry-run` 印清單；重跑以 `documents.doc_no` 或新增 `source_km_article_id` 欄去重（草稿：加 `documents.source_km_article_id` nullable unique）。

## 6. 不一致／待裁 → **主要調度 2026-10-18 裁定**：1 改 (a) 人工（其後使用者要求 Q5 回到待決，見 DESIGN §8）；2–8 照草稿建議；另同意拒建 pqp 列、單一 multipart 端點、PDF 50MB 設定值。原文如下——
1. **Q5「系統產 PDF 以現有列印版面」在後端做不到**：現有列印是前端 `window.print()`，後端沒有 HTML→PDF 或 Word→PDF 的函式庫（requirements 只有 python-docx／mammoth／htmldocx），DESIGN §7 又排除 LibreOffice。選項：(a) D1 不產 PDF，遷移版次留 draft，由使用者對那 1 本書在 Word 另存 PDF 上傳（量極小）；(b) 加 `docx2pdf`（需 Word 安裝，NAS 無）或 `weasyprint`（系統依賴重）——不建議。**建議 (a)**，Q5 改記為「人工補」。
2. **範本套用的佔位符替換需要「Word 原稿留在系統」**：DESIGN 已如此；但 D1 抽文字只抽 Word，若使用者只上傳 PDF（允許），搜尋就搜不到內文——D1 回應中標 `searchable: false`，前端 D2 顯示提示。要不要在 D1 就強制 current／approved 版次必有 Word？草稿：**不強制**（圖說／核准函常只有 PDF）。
3. **company 層編號不走 `_reference_format`**（它拒絕無專案的非 ITP/CHECKLIST 類型，B4 D-B4-1）；用 KM 既有 `(QTS, SYS, km)` 計數器。若希望公司文件各類型分前綴（如 QTS-PRC-、QTS-STD-），要改命名規則與 D-B4-1 例外清單——草稿維持單一 `QTS-KM-`。
4. **project 層權限碼**：DESIGN 寫「沿用專案範圍與 PQP 的 publish_pqp」；plan／drawing 等不是 PQP，草稿建議新增 `document:view/create/update/approve:all`（IAM 權限清單＋ENTITY_PERMISSIONS），pqp 類型在 D3 仍走 `pqp:*`。
5. **DESIGN §3.1 的 `vendor_id`／`project_id` 與 scope 的約束**只能在服務層做（SQLite 無跨欄 CHECK 便利）；`documents.scope` 由 router 以 query 必填分流，避免公司入口漏出專案文件（DESIGN §9 第 3 點）。
6. **`document_references.version_id` 語意**：DESIGN 寫 `version_id|NULL`；草稿定 NULL＝指向現行版並另存 `pinned_version_no`。
7. **`documents.is_deleted` 與 DECISIONS「重要資料不得硬刪」**：D1 只軟刪、且非 draft 或有引用時拒絕。
8. A-1 的兩條 DECISIONS（中英分欄、狀態語意）在本批 commit 改寫為「由 KM-DOCS-2026-001 取代（使用者 2026-10-18）」；BACKLOG #61 改為 SUPERSEDED，#62 起依 REFUSAL 實際編號接續，KM-DOCS 用下一個號、KM-SEARCH／KM-XREF 併入該條子項（在 D 模型上做）。

## 7. 預計修改的檔案（獨佔請求）
**後端**
- `models.py`：Document、DocumentVersion、DocumentReference（migration_owned）；`attachments` 註解加 entity_type。
- `schemas.py`：DocumentCreate／Update／Out、DocumentVersionOut、TransitionRequest、ReferenceCreate／Out、搜尋結果。
- `db_migrations.py`：`_create_document_registry_schema()`（步驟 33）、`ROW_VERSION_TABLES` 加 documents；不動既有步驟。
- `core/perms.py`：`DOCUMENT_VIEW/CREATE/UPDATE/APPROVE`＋描述（待裁第 4 點）。
- `core/attachment_access.py`：ENTITY_PERMISSIONS、validate_category 加 `document_version`（word／pdf）；`lock_refusal` 加 approved／void／archived 鎖。
- `routers/file_router.py`：`_VALID_ENTITY_TYPES` 加 `document_version`。
- `core/utils.py`：`generate_company_doc_no`（自 km_repository 搬出）；`core/document_text.py`（新）：python-docx 抽段落＋表格文字。
- `repositories/document_repository.py`（新）、`services/document_service.py`（新）、`routers/documents.py`（新）；`main.py` 掛 router；`core/dependencies.py` 加 `get_document_service`。
- `routers/settings.py`：DEFAULT_NAMING_RULES 加 PLN／DWG／SPC／CER／APR。
- `workflows/relationships.py`：**不改**（D5）。
- `scripts/migrate_km_articles_to_documents.py`（新，一次性）。
**測試（新）**
- `tests/test_documents_http.py`：建立／列表 scope 分流與專案範圍／搜尋 LIKE 命中片段／版次上傳抽文字／狀態流程（含 PDF 必填、唯一 current、approved 鎖定、void）／row_version 409／軟刪拒絕／引用 CRUD／權限 403／審計列。
- `tests/test_documents_numbering.py`：五個新類型第一筆編號格式；company 第一筆 `QTS-KM-000001`（空庫）與接續 KM 既有計數。
- `tests/test_document_text.py`：Word 抽文字（段落、表格、頁首頁尾）。
- `tests/test_km_articles_migration_script.py`：對測試 DB 跑腳本 dry-run／實跑／重跑去重。
- 既有：`test_optimistic_lock_http.py` 若斷言 ROW_VERSION_TABLES 清單需補 documents；`test_attachment_*` 若枚舉 entity types 需補。
**文件**：BACKLOG（#61 SUPERSEDED＋KM-DOCS 新條）、DECISIONS（改寫兩條＋新增 KM-DOCS 一條：Q1–Q6＋本批待裁結果）、`docs/workflow/KM-DOCS-2026-001-{DESIGN,D1-TASK,D1-STATUS,D1-REVIEW}.md`。
**前端**：0 檔。

## 8. 驗證
- pytest 新測試＋既有全套本機；3.11 全套（`docs/workflow/py311-full-suite.sh`，sandbox 外）；R1 獨立審查；遷移腳本在正式 DB 複本 dry-run 與實跑各一次，輸出進 evidence。
- 部署後唯讀檢查：三表存在、`ROW_VERSION_TABLES` 加欄、命名規則 18 筆、`/api/documents/?scope=company` 未登入 401。

## 9. 交付
commit hash、3.11 指紋、STATUS、遷移腳本路徑與演練輸出。

## 10. 開工後補充（2026-10-18）
- 清單外動到 `core/scope.py`（公司層文件可見 hook）與 `core/config.py`（PDF 上限設定），主要調度照准。
- 既有測試依設計改變：`test_ref_project_seq_b3_http.py` 命名規則數 13→18、14→19、審計 10→15、13→18；`test_attachment_authorization_http.py` 矩陣加 `document_version`。
- 遷移腳本 `scripts/migrate_km_articles_to_documents.py` 只產 Word＋草稿版次，**D1 不執行**（Q5 待使用者）。

