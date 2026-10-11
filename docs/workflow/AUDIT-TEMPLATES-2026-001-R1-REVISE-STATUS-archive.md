# AUDIT-TEMPLATES-2026-001 — STATUS（R1，待審查）

TASK_ID: AUDIT-TEMPLATES-2026-001
ROUND: R1（第一版實作）
- 基準：HEAD `241cf0ca`。和規格提交時的 `cd71bb26` 相比，中間只多了 MEETING-TABS 的提交，沒有動到本輪的檔案。
- 差異：`evidence/G.patch`（SHA-256 `46ec8718debb5b550fa6a2693d158506cb6dcc99b47cb79c2164835ae8f0d2b2`），共 17 個檔案、新增 7 個。`git diff --cached --summary` 只有 7 行 `create mode 100644`，既有檔案沒有任何 mode 變更。
- 候選樹 = `git archive HEAD` 加上 G.patch。瀏覽器檢查和前端檢查都在這棵樹上跑。
- `LanguageContext.tsx` 也有其他工作階段尚未提交的修改。G.patch 裡的版本是 HEAD 加上本輪的 72 行鍵值，以 `i18n.py` 產生，不含別人的修改。
- 尚未提交，也尚未上線。

## RESULT
- [ ] 待獨立審查

## 依規格實作，以及實作時定下的細節
| 項目 | 實作 |
|---|---|
| 資料表 | `audit_templates`：id、name（唯一）、description、version、is_active、items（JSON `[{id, no, clause, task}]`）、created_at／updated_at。<br>表由啟動時的 `create_all` 建立（`models.AuditTemplate`，不是 migration-owned）。啟動順序是 create_all → run_migrations，所以第 24 步執行時表一定已經存在。 |
| 初始模板（第 24 步） | `_seed_initial_audit_templates`，旗標 `audit_templates_initial_v1`，和既有旗標不重複。<br>• 4 個名稱：ISO 9001:2015（20 條，項目 id 固定為 `iso9001-<條號>`）、ISO 45001、品質管理程序書、供應商評鑑表（後 3 個是空的）。<br>• 同名模板（去空白、不分大小寫）已經存在就跳過。<br>• 旗標和資料在同一個交易內寫入，只執行一次。之後改名、停用或刪除，重啟都不會補回。<br>• best effort：失敗時只記錄 log，不寫入任何資料、不設旗標，下次啟動再試。<br>• 20 條條文的內容放在 `services/audit_template_service.py`（`ISO_9001_CLAUSES`），和精靈的 `ISO_CLAUSES` 逐字相同。 |
| 權限 | `audit:template:manage`，說明為「管理稽核模板」。加進 `ALL_PERMISSIONS` 後，ADMIN 會由 seeder 既有的同步自動取得。<br>`db_seeder.py`、`main.py` 都沒有修改；QA_MANAGER 和其他角色不會被寫入。 |
| API | 規格草案寫的是 `/api/audit-templates`，實作照協調中心核可的計畫，放在 `/api/audit/templates`，並宣告在 `/{audit_id}` 之前：<br>• `GET /api/audit/templates?include_inactive=`：需要 audit:view。<br>• `POST /api/audit/templates`、`PUT /api/audit/templates/{id}`：需要 audit:template:manage。<br>• 名稱重複（去空白、不分大小寫）回 409；找不到回 404。<br>• 沒有 DELETE（回 405），以停用取代。<br>• 新增和修改都會寫一筆 audit_logs（entity_type `AuditTemplate`）。內容沒有變化的儲存不寫 log，也不更新 updated_at。 |
| 項目 id | 每個模板項目都有伺服器配發的 `id`（uuid hex，不會重複使用）。前端送回原本的 id 就保留；新項目沒有 id 時由伺服器配發；同一個 id 出現兩次時，第二個換新。 |
| 帶入欄位名稱 | 規格寫 `templateItemNo`，實作改名為 **`templateItemId`**。存的是上面那個穩定 id，不是條文編號，用 No 會和條文編號 `no` 混淆。 |
| 勾選狀態 | 以**名稱**判定：名稱在 `selected_templates` 裡就是已勾選，這個欄位也是列印和 Word 顯示的內容。<br>晶片的來源有三種：<br>• 模板庫中啟用的模板。<br>• 這筆稽核仍勾選、但已經停用的模板，名稱後面標「（已停用）」。<br>• 模板庫已經沒有的舊名稱，例如模板庫成立前的稽核，或模板改名後留下的舊名。這種晶片只能取消勾選。 |
| 勾選、取消 | • 勾選：複製模板**當下**的項目，每項標記 `templateId`、`templateItemId`。這筆稽核已經有的項目不會重複帶入。<br>• 取消：從 `selected_templates` 移除名稱，同時移除這個模板帶入的、結果不是 pass／fail 而且沒有備註的項目。已填的保留，並提示保留了幾項。<br>• 只有名稱、沒有帶入過項目的舊稽核取消勾選時，只移除名稱。 |
| 已帶入項目的標示 | 第 4 步的項目卡片在條文編號下方加一行小字「來自模板：<名稱>」。**這是規格以外新增的 UI**，用意是讓使用者知道取消勾選時哪些項目會被移除，請審查和使用者確認要不要保留。 |
| 管理分頁 | Audit 頁工具列左側新增兩個分頁「稽核記錄」「模板管理」，沿用 ModuleShell 的 chip 樣式（和 NOI／OSD 的狀態篩選同一種），只有具備 audit:template:manage 的使用者看得到。<br>沒有這個權限的使用者，工具列和原本完全一樣。<br>分頁內容（`AuditTemplatesPanel`）：<br>• 左側是模板清單，可以勾「顯示已停用」。<br>• 右側編輯名稱、版本、說明、啟用，以及項目表：條文編號、條文內容、查檢重點，可上移、下移、刪除、新增。<br>• 空白列在儲存時丟棄；名稱必填；有內容的列一定要填查檢重點。<br>• 有未儲存的修改時，切換到其他模板或按取消，會跳出共用的「未儲存」確認。<br>• 切回「稽核記錄」再回來時，修改仍在，因為面板只是隱藏、沒有卸載。 |

## 修改
| 檔案 | 內容 |
|---|---|
| `backend/models.py` | `AuditTemplate`。 |
| `backend/schemas.py` | `AuditTemplateItem`（task 必填，各欄長度上限）、`AuditTemplateCreate`／`Update`（名稱必填、最多 100 字）、`AuditTemplate`（讀取時寬鬆解析 items）。 |
| `backend/db_migrations.py` | 第 24 步：`_seed_initial_audit_templates`、`AUDIT_TEMPLATES_INITIAL_FLAG`。以二進位寫入，維持 CRLF。 |
| `backend/core/perms.py` | `AUDIT_TEMPLATE_MANAGE` 與 `ALL_PERMISSIONS` 項目。維持 CRLF。 |
| `backend/core/dependencies.py` | `get_audit_template_service`。維持 CRLF。 |
| `backend/routers/audit.py` | 三個模板端點。維持 CRLF。 |
| `backend/services/audit_template_service.py`（新） | `AuditTemplateService`、`AuditTemplateConflict`、`INITIAL_AUDIT_TEMPLATES`、`ISO_9001_CLAUSES`。 |
| `backend/tests/test_audit_templates_http.py`（新） | 8 個測試，見證據。 |
| `backend/tests/test_audit_templates_migration.py`（新） | 6 個測試，見證據。 |
| `backend/scripts/verification/seed_audit_templates_review.py`（新） | 審查用種子資料：帳號 audit_tpl_mgr、AHB-TPL-1、AHB-TPL-LEGACY-1，有 DATABASE_URL 防呆。 |
| `DECISIONS.md` | 新增「稽核查檢模板庫（AUDIT-TEMPLATES-2026-001）」一條，「IAM 角色權限矩陣」原文不改，註明 73／70。 |
| `react-app/src/store/auditTemplateStore.ts`（新） | 模板 store，含 fetch、create、update；一律取包含停用的全部模板。 |
| `react-app/src/components/Audit/AuditTemplatesPanel.tsx`（新） | 管理分頁。 |
| `react-app/src/components/Audit/Audit.tsx` | 分頁、權限判斷、面板只掛載一次。 |
| `react-app/src/components/Audit/AuditWizard.tsx` | 第 4 步改用模板庫：`templateChips`、`toggleTemplate`、「來自模板」小字。維持 CRLF。 |
| `react-app/src/context/LanguageContext.tsx` | `audit.tabRecords`、`audit.tabTemplates`、`audit.templates.*`，en、zh 各 36 個。維持 CRLF。 |
| `react-app/tests-browser/audit-templates-check.mjs`（新） | 31 項，見證據。 |

## 證據（`AUDIT-TEMPLATES-2026-001-evidence/`）
- `G.patch`。
- `backend-tests.txt`：
  - 候選樹上 12 個相關測試檔：**172 passed、14 skipped**，exit 0。包含本輪 2 個新檔、Audit 的 3 個 HTTP 測試檔、seeder 權限、權限代碼遷移、第 23 步、材料 schema、ITR 核准事件、Checklist 證據、啟動隔離。
  - 14 個 skip 都是需要 `git archive` 舊版程式的測試，候選樹不是 git repo，所以跳過，材料測試原本就是這樣。
  - 因此另外在 repo 工作樹跑了這兩個檔案：`test_audit_templates_migration.py` 和 `test_material_schema_migration.py`，**33 passed**，exit 0。工作樹的後端檔案和候選樹逐位元組相同，已用 cmp 確認。
  - 注意：3.11 全套測試是在非 git 的複本上跑，舊資料庫升級這一項在 3.11 會是 skip，它的實際執行證據就是這份工作樹的結果。
- `frontend-checks.txt`：候選樹上 tsc、eslint（`--max-warnings 0`，5 個檔案）、build 都是 0。
- `browser-check.txt`：`audit-templates-check.mjs` 在全新的隔離 stack（8321/3321）上跑，**ALL PASS（31 項）**，exit 0。3320 留給使用者預覽。
  - 沒有管理權限：沒有分頁；GET 拿到 4 個初始模板，ISO 9001 有 20 條（4.1…10.3）；POST 回 403，而且確認是權限拒絕、不是 CSRF；精靈第 4 步顯示 4 個晶片。
  - 管理分頁：兩個分頁，模板清單取代稽核清單；ISO 有 20 列；新增模板時空白列被丟棄，每項都有 id；重複名稱有錯誤訊息；有未儲存的修改時切換模板會先詢問；切到稽核記錄再回來修改仍在；改回原值時儲存鍵停用；停用的模板從清單消失，勾「顯示已停用」後再出現。
  - 精靈：晶片只有啟用中的模板。勾 ISO 帶入 20 項；未填時取消，全部移除。第 5 步填兩項後取消，移除 18 項、保留 2 項，兩則提示都有；再勾一次只補 18 項，沒有重複。第二個模板帶入 2 項。項目顯示來源模板。
  - 儲存後 22 項都有 `templateId`、`templateItemId`，已填的內容完整。之後修改模板、停用 Site QA，稽核內容逐字不變；重新開啟時停用的 Site QA 仍顯示並標示，取消後移除它的項目和晶片。
  - 舊稽核：依名稱顯示已勾選；模板庫沒有的名稱取消後只移除名稱；ISO 取消時手動新增的項目不受影響；再勾選時帶入模板當下的內容。
  - 英文介面：分頁為 Audits／Templates。
- 截圖：`templates-tab-iso.png`、`templates-tab-inactive.png`、`wizard-step4-selected.png`、`wizard-step4-kept.png`。

### 協調中心的 5 項測試要求
| 要求 | 對應測試 |
|---|---|
| 1. 啟動順序：全新資料庫，以及已有正式結構但沒有這張表的資料庫 | `test_fresh_database_gets_the_table_the_four_templates_and_admin_gets_the_permission`：真的以 `import main` 啟動。<br>`test_existing_database_without_the_table_is_upgraded_and_only_admin_is_synced`：先用 `cd71bb26`（模板庫之前）的程式碼 `git archive` 啟動建立資料庫，再用新程式啟動。 |
| 2. 第 24 步可以重複執行；刪除或停用的初始模板不會被補回 | `test_restarts_never_duplicate_or_bring_back_initial_templates`：連續啟動 3 次，中間改名、停用、刪除。<br>`test_the_step_runs_once_even_when_every_template_was_removed`。<br>`test_a_template_already_named_like_an_initial_one_is_left_alone`。<br>`test_a_failure_writes_nothing_and_the_next_start_tries_again`。 |
| 3. 帶入的項目有 templateId，之後修改模板不影響已建立的稽核 | `test_items_copied_into_an_audit_do_not_change_when_the_template_is_edited`（HTTP）；瀏覽器檢查第 3 段。 |
| 4. 只自動同步 ADMIN | 上面兩個啟動測試：新權限只有 admin 角色持有；預先建立的 QA_MANAGER 權限前後完全相同。 |
| 5. 二進位寫入，沒有 mode 變更 | CRLF 檔案都以二進位讀寫，寫入後檢查沒有單獨的 LF。G.patch 的 summary 只有新檔案。 |

## 尚未做（規格列為之後再做）
- 從 Excel／Word 匯入條文。

## 下一步
獨立審查 → 協調中心安排使用者在隔離環境確認 → 3.11 → 提交 → 部署（部署後由使用者在 IAM UI 替 QA_MANAGER 加上 `audit:template:manage`）。
