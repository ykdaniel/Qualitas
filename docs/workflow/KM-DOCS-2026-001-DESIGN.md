# KM-DOCS-2026-001 — 公司文件、範本與專案文件：設計草案

狀態：v1.2（2026-10-18，協調中心「主要調度」依使用者 2026-10-18 方向撰寫並補正 §3.2；Q1–Q6 使用者同日決定；D1 落地時由 KM 工作階段補註 §5／§8 Q5 與 §10）
取代：KM-BILINGUAL-2026-001（中英分欄）、KM-STATUS-2026-001（狀態語意）——兩者的問題在本方案下消失；A-1 commit 74d85e60 保留為備案，不部署。

## 1. 背景與問題

- 程序文件在 Word 撰寫、審核、簽核。現行 KM 把 Word 轉成 HTML 放進富文本編輯器，再轉回 Word：排版流失、中英靠 `<br>` 配對、匯入匯出兩條路結果不一致、搜尋在前端做、Draft／Archived 沒有行為。
- PQP 已經是「登錄模式」（編號、版次、狀態、附件、歷史＋變更摘要、列印封面），沒有上述問題。
- 使用者 2026-10-18 的方向：
  1. 公司文件與專案文件分開。
  2. **PQP 範本放在 KM；PQP 模組拿 KM 範本套用專案資料**產生專案文件（補正見 §3.2：只取現行版、來源編號與版次固定記錄、範本改版不自動覆蓋、PQP 主檔仍為既有 `pqp` 表）。
  3. ITP 維持結構化（144 份全為內部資料庫，供 ITR／Checklist 取用），不在本方案範圍。

## 2. 目標

| 層 | 內容 | 範圍 | 生命週期 | 被誰引用 |
|---|---|---|---|---|
| **公司文件（KM）** | 程序書、作業標準、定義、**範本**（PQP、施工計畫、各類表單） | 全公司，不分專案／承包商 | 草稿 → 現行 → 作廢，編輯者切換 | ITP 範本項目、NCR 根因、專案文件的「依據」 |
| **專案文件** | PQP、施工計畫、圖說、合約規範、證明文件、核准函 | 綁專案（可綁承包商） | 登錄／送審／核准／作廢，核准後鎖定 | ITP 實例、ITR、NCR、Q-Workflow 檢查點 |

兩層共用同一套「登錄機制」：編號、版次歷史、Word＋PDF、PDF 內嵌閱讀、抽文字搜尋、被引用。文件本身**不轉換**：Word 原稿與 PDF 原樣儲存，排版不會跑掉；只抽純文字供搜尋。

## 3. 資料模型（提案）

### 3.1 共用：`documents` ＋ `document_versions`

```
documents
  id, doc_no (依命名規則), scope ('company' | 'project'), project_id (scope=project 必填),
  vendor_id (可選), doc_type (見 3.3), title_zh, title_en, category, tags,
  status, current_version_id, effective_date, owner_user_id,
  is_template (bool), template_fields (JSON，範本佔位符清單，僅 is_template),
  created_at, updated_at, row_version, is_deleted

document_versions
  id, document_id, version_label ('Rev1.0' …), version_no (int, 遞增),
  change_summary, word_attachment_id, pdf_attachment_id,
  extracted_text (純文字，供搜尋，可為 NULL), extracted_at,
  source_template_document_id, source_template_version_id  (由範本產生時記錄),
  submitted_at, approved_at, approved_by_user_id, status_at_version,
  created_by_user_id, created_at
```

- 檔案沿用既有 `attachments` 表（entity_type='document_version'），上傳、magic bytes 檢查、路徑守衛沿用 file_router。
- 狀態：公司文件 `draft / current / archived`；專案文件 `draft / submitted / approved / superseded / void`。`current`／`approved` 版次只能有一個，新版核准時舊版自動 `superseded`。
- 樂觀鎖：沿用 OPTIMISTIC-LOCK 的 `row_version`。
- 編號：公司文件沿用 `QTS-KM-######`（命名規則既有 km 例外）；專案文件依 `doc_type` 各一條命名規則（PQP 既有 `QTS-RKS-[PROJECT]-PQP-`，其餘新增：PLN 施工計畫、DWG 圖說、SPC 規範、CER 證明、APR 核准函）。

### 3.2 範本套用（PQP 產生）

**目的（使用者 2026-10-18 澄清）**：KM 存放全公司共用的 PQP 標準範本；專案啟動時從 KM 取用最新「已發布／生效」版作為基準，填入專案資料後形成該專案自己的 PQP。目的在統一格式、架構與品質標準，**避免非必要的格式、架構與品質標準差異**，不消除工程內容應有的專案差異。

- 範本＝`is_template=true` 的公司文件，Word 檔內用佔位符 `{{project_name}}`、`{{project_code}}`、`{{contractor_name}}`、`{{employer}}`、`{{doc_no}}`、`{{rev}}`、`{{effective_date}}`、`{{prepared_by}}`；`template_fields` 記錄範本用到哪些。
- **只取現行／生效版**：套用時一律取範本的 `current` 版次；草稿（draft）與已封存（archived）的範本版次不可取用，介面不列出、API 拒絕（refusal 代碼待定）。
- 「從範本建立」：使用者選範本、選專案（與承包商），後端以 python-docx 開啟範本 Word、替換佔位符（段落、表格、頁首頁尾，保留 run 格式）、產生 Word 檔，登錄為該專案 PQP Rev1.0 的 Word；PDF 由使用者在 Word 補內容後另存上傳（系統不自動轉，避免在 NAS 裝 LibreOffice）。
- **來源固定記錄**：專案 PQP 記錄來源範本的**文件編號與固定版次**（`source_template_document_id`＋`source_template_version_id`，另存當時的 `version_label` 供顯示），建立後不變。
- **範本改版不自動覆蓋**：範本發布新版後，已建立的專案 PQP 內容不變、來源版次不變；清單與詳情只顯示提示「範本已有新版 RevX」。是否跟版由專案自行決定：跟版＝以新版範本再套一次專案資料，登錄為該專案 PQP 的**新修訂版次**（走專案 PQP 既有的修訂與送審流程），舊版次保留；不跟版則維持原版。系統不提供自動合併。
- **PQP 主檔仍以既有 `pqp`／`pqp_history` 為準**（§8 Q1）：本節不因範本套用另建一筆與之同步的 `documents` 主檔。範本來源欄位、版次 Word／PDF 與 `document_versions` 的對應，以及 `pqp_history` 與版次記錄的映射方式，**待設計（D3 TASK 定案前提出選項）**，本草案不先定。

### 3.3 文件類型與流程

| doc_type | 層 | 需送審核准 | 備註 |
|---|---|---|---|
| procedure 程序書 / standard 標準 / definition 定義 / guideline 指引 | 公司 | 否 | 現行 KM 分類 |
| template 範本 | 公司 | 否 | `is_template` |
| pqp | 專案 | 是 | 既有 PQP 流程與 publish_pqp 權限 |
| plan 施工計畫 | 專案 | 是 | |
| drawing 圖說 / spec 合約規範 / certificate 證明 / approval 核准函 | 專案 | 否（只登錄） | |

## 4. 功能

- **清單**：依層分兩個入口（側欄「知識管理」＝公司文件、「專案文件」＝專案文件，PQP 為其中一種類型並保留現有入口），欄位：編號、標題、類型、版次、狀態、生效日、更新時間；篩選類型／狀態；預設隱藏作廢。
- **詳情**：內嵌 PDF 閱讀（`<iframe>`／pdf.js），右側版次歷史與變更摘要、下載 Word／PDF、被引用清單。
- **新版次**：上傳 Word＋PDF（PDF 必填於送審／設為現行時）、填變更摘要；專案文件可「送審」→「核准」（沿用 PQP 既有流程）。
- **搜尋**（後端）：編號、標題、標籤精準；`extracted_text` LIKE／FTS5（SQLite 內建，可選）；回傳命中片段。抽文字用 python-docx（Word）或 PDF 文字層（pypdf，若已在 requirements；否則只抽 Word）。
- **列印**：就是 PDF；PQP 既有的列印封面保留作為「登錄封面頁」。
- **跨模組引用**：新增 `document_references(from_type, from_id, document_id, version_id|NULL, section_ref 文字)`；ITP 項目「規範依據」、NCR「依據文件」、Checklist 可選文件＋章節號；Related Documents 顯示並可點開現行版 PDF。relationships.py 加 `document` 節點與 edge。
- **權限**：公司文件沿用 `km:*:all`（全域）；專案文件沿用專案範圍（core/scope）與 PQP 的 `publish_pqp`；範本只有管理者可建立／改版（比照 ITP 共用範本 D18）。

## 5. 遷移

1. 既有 KM 文章（含章節）：以既有 Word 匯出功能各產一份 Word（`scripts/migrate_km_articles_to_documents.py`，D1 已寫、D2 才執行），PDF 來源依 Q5（待決）；登錄為公司文件 Rev1.0，`change_summary`＝「自 KM 文章遷移」；原 `km_articles` 保留唯讀（歷史與差異比對仍可看），不再編輯。遷移腳本先唯讀統計：文章數、章節數、附件數、無法匯出的篇數。
2. 既有 PQP：資料表不動（或映射到 `documents`，二擇一，見 §8 Q1），附件沿用；版次歷史既有 `pqp_history` 對應 `document_versions`。
3. 命名規則：新增專案文件各類型規則，第一筆編號測試（AGENTS.md 要求）。

## 6. 分批（每批獨立審查、3.11、預覽、部署）

1. **D1 後端登錄核心**：`documents`／`document_versions`／`document_references` 表與遷移、附件接線、版次／狀態流程、抽文字、搜尋 API、命名規則、測試。不動前端。
2. **D2 公司文件前端**：KM 入口改為登錄清單＋詳情（PDF 內嵌、版次、新版次上傳）；舊文章唯讀入口；KM 遷移腳本執行。
3. **D3 範本與 PQP 套用**：範本類型、佔位符替換、「從範本建立 PQP」；PQP 詳情接登錄元件（送審核准流程保留）。
4. **D4 專案文件入口與其他類型**：施工計畫、圖說、規範、證明、核准函；專案文件清單。
5. **D5 跨模組引用**：ITP 項目、NCR、Checklist 選文件；Related Documents；relationships 節點。
6. 收尾：移除富文本編輯器與 Word 匯入匯出轉換碼、清翻譯鍵、BACKLOG 歸檔（#44–#49 相關項結案或作廢）。

預估：D1 中（後端約 20 檔）、D2 中、D3 中（佔位符替換要對表格與頁首頁尾測試）、D4 小、D5 中。與 OPTIMISTIC-LOCK B3b／B4 的 KMModals 改動重疊：**D2 之後 KMModals 將被移除**，B3b 對 KM 視窗的改動可縮減為最小（只保主檔 409），建議 B3b 先完成再開 D2。

## 7. 不在範圍

- 伺服器自動 Word→PDF 轉換（需 LibreOffice）。
- 站內富文本編輯、逐章差異比對（既有文章唯讀保留功能）。
- 電子簽核（P1 路線圖項目，另案）。
- ITP 內容整理（照鋼筋 STD 樣板逐份進行，內容工作）。

## 8. 使用者決定（2026-10-18，原話：「KM-DOCS 草案 6 個問題先照建議值：Q1 維持 pqp 表、Q2 八個佔位符、Q3 類型照 3.3 承包商選填、Q4 先 LIKE、Q5 系統產 PDF、Q6 同意 B3b 縮減」）

- **Q1 ✔** 維持 `pqp` 表，只在其上接登錄元件（版次歷史對應 `pqp_history`）。
- **Q2 ✔** 佔位符 8 個：`{{project_name}}`、`{{project_code}}`、`{{contractor_name}}`、`{{employer}}`、`{{doc_no}}`、`{{rev}}`、`{{effective_date}}`、`{{prepared_by}}`。
- **Q3 ✔** 類型照 §3.3；專案文件的承包商為選填。
- **Q4 ✔** 搜尋先用 LIKE（標題／編號／標籤／抽出文字）；FTS5 列為日後選項。
- **Q5 ✔→待決** 使用者原選「系統以現有列印版面產生 PDF」；D1 核對後發現後端沒有任何 PDF 產生器（列印版面只在前端 window.print），系統產生需新增 LibreOffice 等依賴（§7 原排除）。已於 2026-10-18 交使用者在 A 系統產生／B 人工匯出（瀏覽器列印另存或 Word 另存）／C 暫不遷移中重選；在此之前遷移腳本只產 Word、版次留草稿，PDF 日後以「補綁檔案」端點掛上。
- **Q6 ✔** OPTIMISTIC-LOCK B3b 的 KM 視窗改動縮到最小（主檔 409 即可），因 D2 將移除該視窗。

## 9. 風險

- 佔位符替換在 Word 的 run 分割下可能漏替換（同一佔位符被拆成多個 run）；需先合併 run 再替換，並以測試範本覆蓋表格、頁首頁尾。
- 既有 KM 文章匯出為 Word 的品質取決於現行匯出器；遷移前先抽樣檢查，差的篇由人工重整。
- 兩個入口共用一套表，權限判斷要以 `scope` 嚴格分流，避免專案文件經公司入口外洩。

## 10. D1 落地紀錄（2026-10-18，KM 工作階段）
- 表與欄位見 `backend/models.py` Document／DocumentVersion／DocumentReference；版次另帶 `status`（draft／submitted／current／approved／superseded／archived／void）與 scope／project_id／vendor_id 快照，附件範圍檢查不必 join。
- 公司層文件對所有專案、承包商可見：`core/scope.is_company_wide`／`company_wide_clause`（新 hook）；寫入權限仍由 document_service 的 km:* 檢查決定。
- 附件：`entity_type='document_version'`、category `word`／`pdf`；通用 `/api/files` 路徑用 document:* 權限，公司文件的檔案由 `/api/documents/{id}/versions/{vid}/download` 依記錄層權限提供。PDF 上限 `DOCUMENT_PDF_MAX_MB`（預設 50）。
- 搜尋：LIKE 於 doc_no／title_zh／title_en／tags／現行版 extracted_text，回傳命中片段；只有 PDF 的版次 `searchable=false`。
- 版次已帶 `source_template_document_id`／`source_template_version_id`（§3.2 來源固定記錄用，D1 只存不寫）；§3.2 的「只取現行版」拒絕代碼與 `pqp_history` 映射留 D3 TASK。
- 本批不做：遷移執行、前端、範本套用、引用呼叫端、relationships 節點（D2–D5）。

