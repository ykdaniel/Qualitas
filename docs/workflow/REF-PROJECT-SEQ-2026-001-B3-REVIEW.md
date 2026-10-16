# REVIEW.md — REF-PROJECT-SEQ-2026-001-B3

TASK_ID: REF-PROJECT-SEQ-2026-001-B3
ROUND: R1（獨立審查，2026-10-14）
基準：09f6a688 ＋ 未提交工作區（`git diff 09f6a688 -- backend react-app` ＋ 未追蹤的 `backend/tests/test_ref_project_seq_b3_http.py`）；不含 COORDINATION.md、py311-full-suite.sh。

## 判定：PASS with notes

沒有 P1。依專案取號、STD 改號、命名規則 migration、專案代碼檢查和 next-reference 的實作都符合 TASK 和 DECISIONS 第 1–11 點：
- 沒找到會讓號碼重複、撞號或不帶專案的 HTTP 路徑；
- 每個取號的 create 都先拿到寫入鎖，再讀序號。

有 2 個 P2，建議上線前處理：一個是檔案行尾，一個是部署和回滾的操作步驟。兩個都不影響號碼是否正確。

---

## P1（上線前必修）
無。

## P2（應修）

**P2-1 `backend/services/project_service.py`：行尾從 CRLF 全部變成 LF**
- **現象**：
  - 基準版是 CRLF（103 行都是 CRLF），現在是 0 行 CRLF。
  - 所以 diff 變成整個檔案重寫（+133／−103），實際只改了約 30 行（`normalize_project_code`，以及 create／update 各 1 行）。
  - 審查者和 `git blame` 都看不出真正改了什麼。
- **範圍**：其他 22 個改動過的 CRLF 檔都保留了 CRLF，包括 NOIDetailModal.tsx（671/671）和 LanguageContext.tsx（3590/3590），只有這個檔例外。
- **建議**：用二進位模式把行尾改回 CRLF，再確認 `git diff --stat` 只剩實際改動的行數。

**P2-2 部署和回滾步驟沒寫進 STATUS／部署清單**
- **(a) 舊版程式碼回滾的風險**
  - 第 29 步把規則改成 `QTS-RKS-[PROJECT]-…` 之後，如果直接換回 09f6a688 的映像檔，舊版 `generate_reference_no` 只會替換 `[ABBREV]`。
  - 結果會發出字面上就是 `QTS-RKS-[PROJECT]-NOI-000001` 的號碼。
  - 第 27 步改過的 ITP 號，舊版也不會自動還原。
- **(b) migration 失敗不會擋住啟動**
  - 第 27–29 步都是 best effort：失敗只寫一行 error log，app 照常啟動。
  - 如果第 29 步失敗，取號會退回預設格式，號碼本身沒問題，但「舊計數設成序號起點」那一步沒做到。
  - 如果第 27 步失敗，新建的 STD ITP 會從 1 開始，之後重試時舊範本會排在它們後面，D21 要求的順序就不成立。
- **建議**：在 STATUS「上線影響」或部署清單補上兩件事：
  1. **上線後檢查**：
     - `migration_flags` 有 `shared_itp_std_renumber_v1`、`naming_rules_project_format_v1`；
     - `ux_projects_code_upper` 索引存在；
     - `itp_renumber_map` 是 63 筆；
     - 啟動 log 沒有 "Could not renumber…" 或 "Could not move naming rules…"。
     任何一項不符，就先停止使用，不要開放建單。
  2. **回滾順序**：先用 audit `NamingRule UPDATE` 的 old_value 還原 `document_naming_rules`，再用 `itp_renumber_map` 還原 ITP 號和 `noi.itpNo` 等引用，最後才啟動舊映像檔。或者直接說明回滾一律用部署前的資料庫快照。

## P3（備註，可後續處理）

- **P3-1 `core/utils.py:468-473`：沒有專案的非範本單據會取到 STD 號**
  - `numbering_code(None)` 對所有類型都回傳 STD。所以非範本單據（NOI、ITR、NCR…）只要 `project_id=None`，就會拿到 `QTS-RKS-STD-NCR-…` 這種號碼，而 STD 只應該給範本用。
  - 可能觸發的路徑：
    - 從沒有專案的舊 ITR 開 NCR、重新檢驗、連結 Checklist（itr_service 1087／1307／1429／1482）；
    - `scope=None` 的內部呼叫；
    - P3-2 的稽核修改。
  - HTTP 建立流程碰不到：B2 規定都要有專案，而且第 25、26 步已經把正式站的單據歸到 Hailong。所以目前只是潛在問題。
  - 建議：`project_id is None`，而且類型不是 ITP 或 CHECKLIST 時，拒絕取號（拋出 Refusal）。
- **P3-2 `services/audit_service.py:318`：前端送 null 時會取到 STD 號**
  - 寫法是 `processed_data.get("project_id", db_audit.project_id)`。如果前端明確送 `project_id: null`，就會用 None 取號，得到 STD。
  - 只發生在補發舊稽核（auditNo 是空的）的情況。建議改成 `processed_data.get("project_id") or db_audit.project_id`。
- **P3-3 `services/meeting_minutes_service.py:389`：刪除已提交、audit 卻沒寫**
  - `repo.delete` 已經先 commit，之後 `reclaim_reference_no` → `numbering_code` 才可能拋出 `PROJECT_CODE_MISSING`（專案沒有代碼時）。
  - 結果是會議已經刪掉，卻沒有 DELETE 的 audit 紀錄。B3 之前 reclaim 不會因為這個原因失敗。
  - 正式站唯一的專案有代碼，新專案也必須有代碼，所以目前碰不到。
  - 建議：在 delete 之前先算好前綴，或把 reclaim 包起來，失敗時只記 log。
- **P3-4 `services/project_service.py:39` 和第 28 步索引：檢查方式不一致**
  - 服務層用 `UPPER(code)` 比對，沒有做 TRIM；索引建在 `UPPER(TRIM(code))`。
  - 兩個管理者同時建立同代碼的專案時，由索引擋下，回傳的是 IntegrityError 500，不是 400 `PROJECT_CODE_DUPLICATE`。
  - 影響很小。可以把 IntegrityError 對應成 DUPLICATE。
- **P3-5 `db_migrations.py:994`：`external_doc_no` 的索引在既有資料庫上不會建立**
  - model 宣告了 `index=True`，但 `_add_column_if_missing` 只加欄位，不建索引。
  - 搜尋用的是 `ILIKE '%x%'`，本來就用不到這個索引，所以實際沒有影響。可以拿掉 `index=True`，或在 migration 補上索引，兩者擇一，讓新舊資料庫一致。
- **P3-6 `db_migrations.py:802`：audit 動作記錯**
  - 既有規則的 prefix 是空字串或 NULL 時，被改寫的那筆 audit 會記成 `CREATE`，應該是 `UPDATE`。
  - 正式站 13 筆規則都有值，碰不到。
- **P3-7 Q-WorkFlow：舊格式路徑仍在**
  - 啟動時的 `_backfill_qworkflows`（db_migrations 約 1187 行），以及 noi_service 裡沒有專案的分支，仍然發全域格式 `Q-WorkFlow-######`。
  - 有專案、但沒有 Q-WorkFlow 列的 NOI，下次重啟補列時，拿到的是舊格式，不是 `Q-WorkFlow-<代碼>-`。
  - STATUS 已經說明這點，正式站演練時也沒有補任何列。建議後續讓 backfill 也依專案取號。
- **P3-8 `tests/test_ref_project_seq_b3_http.py:228`：斷言太鬆**
  - 參數化測試裡有一段 `or (refusal == "PROJECT_CODE_DUPLICATE" and status == 400)`，讓修改時的 DUPLICATE 情境只要回 400 就算通過，不檢查代碼。
  - 實測修改時回的就是 DUPLICATE，所以可以直接拿掉這段，斷言不必放寬。
- **P3-9：新專案沒有沿用同名舊承包商的計數**
  - 第 29 步「舊計數設成序號起點」只處理 migration 當時已經有代碼的專案。
  - 之後新建的專案，如果代碼剛好等於某個舊承包商縮寫，只靠 self-heal 比對資料表裡現存的最大號。那個縮寫底下已經刪除的號碼，可能會被重新發出。
  - 機率低，記錄即可。
- **P3-10 `ProjectCreate.id`：客戶端可以指定 id**
  - 管理者可以指定 id = "STD"。這樣該專案的計數 key 會和共用範本相同。
  - 前綴不同，所以不會撞號，只會讓兩邊的號碼互相跳號。可以考慮拒絕這個 id。

## 依設計改變的斷言（STATUS 表格）
逐檔對照 diff：
- NOI 編號不再隨承包商改變（第 3 點）；
- next-reference 改成依專案、拿掉遮罩（第 8 點）；
- Q-WorkFlow 改成 `-PA-` 格式，sequences 從 1 變 2（第 7 點）；
- 號碼不再含承包商縮寫，改成 STD 或專案代碼（D2）；
- 命名規則改成 `[PROJECT]`。

都是改成新的確定值，不是拿掉或放寬斷言。唯一放寬的地方見 P3-8。

`tests/conftest.py` 的 `before_insert` listener：只在 `code is None` 時補代碼，`code=""` 會原樣保留，所以「沒有代碼」的情境仍然測得到。正式程式碼裡只有 project_service 會建立 Project（已用 grep 確認），而且一定會經過 `normalize_project_code`，所以這個 listener 不會掩蓋正式流程的問題。**可以接受。**

## 核對方式

### 實測
| 項目 | 結果 |
|---|---|
| 後端 7 個檔案（B3 新測試、settings_naming_rules、noi_audit_delete_update、noi_contractor_lock、noi_create_atomic、integration_real_db、audit_contractor_scope），本機 Python 3.14，DATABASE_URL 指向 `$TMPDIR` | **96 passed** |
| **反向驗證**（scratchpad 探針）：把 itr、followup、meeting_minutes 的 `begin_write_transaction` 換成空函式 | 3 個競態測試都出現重號（3/3）；STATUS 的反向驗證說法屬實 |
| **探針**：沒有代碼的專案 PN，對 NOI、ITP、ITR、Follow-up、會議記錄建立，以及 GET next-reference | 都回 400 `PROJECT_CODE_MISSING`（6/6），沒有 500 |
| `npx tsc --noEmit` | 通過 |
| `npm test` | 199 passed，含 refusal.test.ts PARAMS 和 namingRules.test.ts |
| **行尾**：逐一比較所有改動檔案，基準和現在的 CRLF 行數 | 見 P2-1 |
| LanguageContext | 只有新增（+22／−0） |

### 只讀碼
- **取號核心**：`core/utils.py` 的格式、key、大寫化、self-heal、preview、pattern、reclaim、QWORKFLOW。
- **所有取號呼叫端**：grep `generate_reference_no`／`preview`／`reclaim`／`reference_pattern`，逐一確認傳入的專案正確，而且取號前已經拿到寫入鎖：
  - ncr、obs、osd、pqp、noi、itp、audit、material_submittal 原本就有 `begin_write_transaction`；
  - itr 的連結 Checklist、開 NCR、重新檢驗用 `lock_itr_for_write`；
  - itr 建立、followup、meeting、checklist 是本批補上的。
- **migration 第 27–29 步**：單一交易、只跑一次的 flag、兩段改號、引用同步、對照表、audit、序號只往上調；以及執行順序（`_add_missing_columns` 在第 27 步之前）。
- **專案代碼**：project_service／projects router 的檢查，以及 Refusal 是 ValueError 子類別，router 會轉成 400。
- **settings.py**：檢查規則和前端 `prefixProblem` 一致（km 例外、空值、`[ABBREV]`、`[PROJECT]`）。
- **ITP external_doc_no**：schema、正規化、搜尋；共用範本仍然用 `require_shared_template_write` 擋下非管理者。
- **前端**：NOIDetailModal、ProjectModal、DocumentNamingRules、ITP 表單和清單。
- **正式資料庫複本演練**：只讀了 `std-renumber-rehearsal.md` 的統計，**沒有**自己重跑。

### 未核對
- Python 3.11 全套（另外執行中）；
- 正式資料庫複本演練（依規定不開正式資料庫）；
- 瀏覽器實際操作和畫面（待隔離環境預覽）；
- 第 28 步在有重複代碼的資料上的實際行為（只讀碼）。

---

## R1-B 第二審查（naming rules）

- **審查者**：「document naming rules」工作階段（Claude），受協調中心指派。只讀，沒有改任何程式。
- **基準**：主 checkout 未提交工作區，對 `09f6a688`（`git diff 09f6a688 -- backend react-app`）＋未追蹤的 `backend/tests/test_ref_project_seq_b3_http.py`。
- **範圍**：命名規則相關。
  - `core/utils.py`：`numbering_code`、`_reference_format`、`_next_sequence`、`generate_reference_no`、`preview_reference_no`、`reference_pattern`、`reclaim_reference_no`、`_DOC_TYPE_TABLES`；
  - `core/constants.py`；
  - `routers/settings.py`；
  - `db_migrations.py` 第 29 步（`_naming_rules_to_project_format`），以及 `_migrate_itr_linked_checklists` 的取號；
  - 各 service 的取號呼叫，以及取號前是否已拿到寫入鎖；
  - 前端 `DocumentNamingRules.tsx`、`namingRules.ts`、`namingRules.test.ts`、LanguageContext 的 namingRules 鍵；
  - 證據 `REF-PROJECT-SEQ-2026-001-B3-evidence/std-renumber-rehearsal.md`。

### 判定：PASS with notes
沒有必改項目。naming rules 工作階段先前盤點的 5 點都已落實（見下表）；以下 5 項為建議或備註，都不影響上線。

### 先前盤點的 5 點
| # | 項目 | 結果 | 依據 |
|---|---|---|---|
| 1 | 13 種 doc_type 都要寫入 | ✅ | 第 29 步依 `DEFAULT_NAMING_RULES` 逐一檢查，缺的就 INSERT 並寫 audit `CREATE`。測試 `test_migration_29_…` 確認 msa 等 10 筆是新建的。演練：正式站原本就有 13 筆（含 meeting、msa），13 筆都改寫，沒有新建。 |
| 2 | 計數鍵跟著換，不跳號、不撞號 | ✅ | key 改成 `(project id 或 'STD', '*', TYPE 大寫)`。self-heal 用新前綴比對實際資料表，補上 FOLLOWUP、QWORKFLOW。舊承包商計數只有在「舊前綴代入代碼後和新前綴文字相同」時才帶入，而且只會往上調。不同文字的舊號不會出現在新前綴底下，所以撞號的條件不存在。演練：Hailong 各類型都接續 HL 的舊計數（例如 NOI 下一號是 000005）。 |
| 3 | 前後端驗證一起改、km 例外 | ✅ | 後端 `update_naming_rules` 和前端 `prefixProblem` 的規則相同：空值不行、必須含 `[PROJECT]`、不准 `[ABBREV]`、km 例外。單元測試和 `test_settings_naming_rules` 都有涵蓋。第 29 步不動 km（測試確認 `QTS-KM-` 沒被改）。 |
| 4 | FAT 維持原樣 | ✅ | 前端仍然鎖住，也不放進 payload。第 29 步把 FAT 前綴改成新的預設值（只改字串，沒有影響），而且明確排除在計數種子之外。 |
| 5 | 會議記錄：同編號換 rev、舊號不改 | ✅ | `create_new_occurrence` 沿用來源的 documentNumber，沒有重新取號（本批沒有改到這段）；第 27 步只動 ITP。`QTS-NA-MEETING-000001` 不在任何改號範圍內。演練顯示下一個新會議系列會是 `QTS-RKS-HL-MOM-000001`（不再是先前預期的 `QTS-RKS-NA-MOM-000002`）。前端備註「同一會議系列共用編號，每次新場次版次加一」仍然正確。刪除草稿時收回號碼改成 best effort，DELETE 的 audit 不會因此遺失（測試涵蓋）。 |

### 其他核對（沒問題）
- **所有取號呼叫都有傳 project_id**：用 grep 逐一核對所有呼叫端（含多行呼叫，以及 `db_migrations._migrate_itr_linked_checklists`）；`project_id` 是必填的 keyword，漏傳時會直接 TypeError。
- **取號前都已拿到寫入鎖**：
  - ITR 的連結 Checklist（1087）、開 NCR（1307）、重新檢驗（1429、1482）都在 `lock_itr_for_write` 之後；
  - ITP 和材料送審原本就有 `begin_write_transaction`；
  - ITR 建立、Follow-up、會議、Checklist 是本批補上的。
- **Checklist 建立只會建範本**：service 會把 project_id 清成 None，並擋下帶 itrId 或 template_id 的建立，所以固定用 STD 是正確的。
- **Q-WorkFlow**：只有 NOI 有專案時才走新格式；舊的全域號 `Q-WorkFlow-000001` 不會落在 `Q-WorkFlow-<code>-` 前綴底下，所以不會被 self-heal 誤算。
- **第 29 步只會成功一次**：單一連線、最後才 commit；任何例外都不會 commit（rollback），flag 和資料寫在同一個交易。重跑時不再動作（測試確認 audit 仍是 13 筆）。
- **前端**：
  - 範例以目前專案代碼顯示（所有專案時用 ABC）；舊規則的 `[ABBREV]` 顯示為 NA，只出現在確認視窗的「改前」欄。
  - 確認視窗的影響說明（「只影響之後新建的文件…流水號接續」）仍然正確。
  - LanguageContext 只有新增。

### 建議與備註
1. **【建議・低】非範本類單據在沒有專案時會被編成 STD 號**
   - **位置**：`core/utils.py` `numbering_code`
   - **說明**：`project_id=None` 一律回傳 `STD`，所以只要內部呼叫（`scope=None` 的衍生單據）碰到沒有專案的舊紀錄，例如舊 ITR 的開 NCR 或重新檢驗，就會編出 `QTS-RKS-STD-NCR-…`。正式站在第 25、26 步之後已經沒有無專案的紀錄，所以目前不會發生。
   - **建議**：STD 只允許 ITP 和 CHECKLIST，其他類型遇到 None 時回 400（例如沿用 `PROJECT_REQUIRED_FOR_CREATE`），以免出現看起來像共用範本的單據號。
2. **【建議・低】前綴存檔時沒有去掉前後空白**
   - **位置**：`routers/settings.py` `update_naming_rules`（檢查時有 strip，寫入時是 `rule.prefix or ""`）；前端送出時也沒有 trim。
   - **說明**：如果輸入「`QTS-RKS-[PROJECT]-NCR- `」，會通過檢查，但編出來的號碼會帶空白。這是既有行為，不是本批造成的。
   - **建議**：寫入時存 strip 後的值（前後端擇一即可）。
3. **【備註】第 29 步會把自訂過的舊規則重設成預設值**
   - **說明**：只要舊前綴含 `[ABBREV]`，就會整個換成預設值，而不是把 `[ABBREV]` 換成 `[PROJECT]`。例如自訂的 `MM` 代碼會變回 `MOM`，舊值有寫在 audit。
   - **影響**：正式站 13 筆都是預設值，演練確認沒有影響；只在將來的其他部署才會遇到。
4. **【備註】舊計數只認「大寫後等於類型名稱」的 doc**
   - **說明**：第 29 步的種子條件是 `UPPER(doc) = TYPE`，所以舊列如果用別名（例如正式站有 `('QTS','HL','AUD')=1` 和 `('QTS','HL','audit')=5`），別名那列不會被採用。
   - **影響**：正式站的別名列數字比較小，而且 self-heal 會以實際資料表為底，所以不會撞號。
5. **【備註，給 B3 之後的 naming rules 工作】**
   - `namingRules.hintContent`、`namingRules.errorMissingAbbrev` 和 `namingRules.desc.*` 現在都沒有地方用，留到 B3 之後一併清理（已分工）。
   - `_reference_format` 碰到「有規則但沒有 `[PROJECT]`」時退回預設格式，此時固定用 6 位、不採用該規則的位數。第 29 步之後這種規則不會存在，所以只是備註。

### 實測（本審查者）
| 項目 | 結果 |
|---|---|
| `pytest tests/test_settings_naming_rules.py tests/test_ref_project_seq_b3_http.py -k "naming / default_naming / migration_29 / numbers_from_1 / contractor_is_no_longer / same_prefix / shared_templates / code_change / without_a_code / qworkflow / meeting / simultaneous / one_transaction"`，本機 Python 3.14，DATABASE_URL 指向 `$TMPDIR` 的拋棄式資料庫 | **24 passed**（15 deselected） |
| `npm test`（react-app） | **199 passed** |

- **只讀碼**：上列範圍。
- **未核對**：Python 3.11 全套（另外執行）；正式資料庫複本演練（只讀了證據統計）；3296／8296 預覽畫面（沒有開，也沒有寫入資料）。
