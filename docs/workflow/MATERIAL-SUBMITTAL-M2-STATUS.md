# MATERIAL-SUBMITTAL-M2 — STATUS（Claude 執行結果，待獨立審查）

TASK_ID: MATERIAL-SUBMITTAL-M2-2026-001
範圍：`MATERIAL-SUBMITTAL-M2-TASK.md`；規格：`docs/planning/MATERIAL-SUBMITTAL-V1-SPEC-2026-10-08.md`。
前一批封存：`MATERIAL-SUBMITTAL-M1-R2-PASS-*-archive.md`（R1-REVISE 封存保留）。根目錄 DEPLOY-EXEC 控制文件未改。
**未提交、未推送、未部署、未進 M3。不自填 PASS。**

## RESULT
- [x] DONE（M2 獨立審查 **PASS**，見 `MATERIAL-SUBMITTAL-M2-REVIEW.md`）。範圍限 M2 後端；不是部署核准，也不表示最新版本已重跑全套或已通過前端驗收。
- [ ] PARTIAL
- [ ] BLOCKED

（歷史：審查前本欄曾標 PARTIAL。原因依序是：先前全套 1 項失敗、矩陣補正後 2 項失敗、方案 A 補正後最新版本未重跑全套。前兩項失敗已由矩陣補正與方案 A 處理，紀錄保留於下方「歷次測試紀錄」。）

## 本輪實際修改
**新增**
- `backend/core/material_access.py`：
  - `refuse_vendor_scope`（由 M1 的 router 移入）、`project_visible`（由 M1 的 service 移入）；
  - `lock_material_submittal_for_write`。
- `backend/services/material_submittal_service.py`：建立、列表、詳細、草稿編輯、送交、外部結果、更正、新版次；推導現行核准版。
- `backend/routers/material_submittals.py`：無 DELETE、無內部核准端點。
- `backend/tests/test_material_submittals_http.py`：128 項。

**修改**
| 檔案 | 內容 |
|---|---|
| `models.py` | 結果登錄的 ORM 保護 `AppendOnlyViolation`：只允許 `superseded_by_entry_id` 從 NULL 寫入一次；禁止刪除 |
| `schemas.py` | 送審、版次、送交、結果、更正、新版次的輸入與輸出 schema（camelCase、`extra=forbid`、date 驗證、四種結果的 Literal） |
| `main.py` | 註冊 material_submittals router |
| `core/attachment_access.py` | `material_rev` 權限：view＝material:view，送審 5 類需 manage，`replyDocument` 需 record_result（`CATEGORY_UPDATE_PERMISSIONS`，只適用這個類型）；帶 vendor 範圍的帳號一律 403（`VENDOR_REFUSED_ENTITY_TYPES`）；分類白名單；三種狀態的鎖；`require_attachment_permission` 新增選用的 `category` 參數，**其他類型的行為不變** |
| `core/scope.py` | `_ENTITY_MODELS["material_rev"]` 對應到版次 model |
| `routers/file_router.py`（CRLF，維持整份 CRLF） | `_VALID_ENTITY_TYPES` 加入 `material_rev`。上傳與刪除時把 category 傳給權限檢查。**只對 `material_rev`**：上傳在檔案驗證之後、寫入之前，刪除在判斷之前，取得送審寫入鎖，`expire_all` 後重新讀取並判斷 |
| `routers/settings.py`、`core/utils.py`（CRLF） | 預設編號規則 `msa`（`QTS-RKS-[ABBREV]-MSA-`），self-heal 對照表 `MSA` |
| `routers/materials.py`、`services/material_service.py` | 改從 `core/material_access` 匯入（行為不變；M1 的 33 項重跑通過） |

雜湊：`MATERIAL-SUBMITTAL-M2-evidence/file-hashes.txt`（20 個來源檔、CRLF 檢查、diff stat）。

## M2 測試（`tests/test_material_submittals_http.py`，最終 128 passed、0 skipped）
規格驗收對照：
- 建立：
  - AC-M2-1：編號 `QTS-V1-MSA-000001`、Rev 0 Draft、快照等於材料資料。
  - AC-R2-4：materialId 不可見回 404，可見但屬其他專案回 400。
  - 專案不可見或不存在、承包商不存在，都回 404。
  - materialId 與 newMaterial 同時給或都不給，回 422。
  - 以上都零寫入。
- 草稿：AC-M2-3 送交後快照凍結，修改材料資料不影響快照，並列出差異欄位；AC-R2-5 受控欄位與空白名稱回 422。
- 送交：AC-M2-4 週六 2026-10-03＋14 天＝2026-10-17、可覆寫；專案沒有天數時必填（未填回 400）；不合法日期回 422。
- 結果：
  - AC-M2-5：未知結果代碼、`NotApproved`、空白決定者、錯誤日期、`internalApprover` 欄位，都回 422。
  - AC-M2-6：決定者與登錄人分開保存。
- 現行核准版：AC-R2-10a–d 為各自獨立的情境；同一份送審跨版次維持同號、同卡。
- 狀態規則：AC-M2-8。另確認新版次被擋下時，是 **service 規則**（錯誤訊息）擋下，不只靠索引。
- 父子歸屬：AC-R2-1 A 的路徑帶 B 的 revId（put、submit、result）回 404，零寫入；AC-R2-2 跨專案回 404；AC-R2-3 偽造父子不一致回 409，零寫入。
- 併發（執行緒＋barrier，同時發出）：
  - AC-R2-6 新版次 [200, 409]；
  - AC-R2-7 初次登錄 [200, 409]；
  - AC-R4-3 更正 [200, 409]；
  - 部分唯一索引作為最後一道防線的 IntegrityError。
- 稽核失敗回滾：AC-R2-8，六種動作在注入 `log_audit` 失敗後，8 張表與失敗前完全相同。
- 不變條件：AC-R2-9，6 個版次加 2 次更正的序列中，每一步的快取都等於獨立重新計算的結果。
- 更正：
  - AC-R4-1：新增一筆更正、標記取代關係；原登錄的結果與登錄人保留；稽核原因已寫入。
  - AC-R4-2：已有後續版次回 409，零寫入。
  - AC-R4-6：過期的 entry、尚未登錄、無權限、空白原因、缺原因、vendor 帳號，都被拒絕且零寫入。
  - AC-R4-7：Rev 2 核准後更正為拒絕，現行核准版**依規則推導**回到 Rev 1。
  - ORM 只能追加：修改與刪除都拋出例外。
- 附件：
  - AC-R1-1–4：上傳矩陣 4 種角色 × 3 種狀態 × 3 種分類（36 組）；刪除矩陣 4 × 5 組合（20 組；草稿不可能有回覆文件，所以不產生該組合，不用 skip）。
  - vendor 帳號與無權限帳號：上傳、列出、刪除都回 403。
  - 跨專案回 404；未知分類回 400。
- 競態（AC-R1-6）：
  - (a) 上傳通過第一次檢查後才送交 → 409，沒有附件列，也沒有遺留檔案；刪除同理。
  - (b) **在鎖內完成狀態判斷之後**，另一個連線嘗試直接把版次改為送交 → 被寫入鎖擋下，版次仍是 Draft（上傳與刪除各一項）。
- 兩段式保存（AC-R1-7，伺服器端）：回覆文件上傳後，結果登錄失敗（500）→ 附件仍在、版次仍是 Submitted → 重試只送結果並成功 → 附件數量不變 → 之後再上傳回 409。
- API 範圍：AC-M2-12，material 相關路由清單完全符合預期，沒有任何 approve 字樣，也沒有 DELETE。

## 開發中發現並修正的錯誤
- 登錄「附意見核准」後，`currentApprovedResult` 被寫成 `Submitted`。原因是狀態以 bulk UPDATE 修改（`synchronize_session=False`），重新計算時讀到記憶體中的 ORM 舊值。已改為只查欄位值（`_recompute_current_approved`）。由 `test_logger_and_external_decision_maker_are_stored_separately` 抓到。

## 反向檢查（`MATERIAL-SUBMITTAL-M2-evidence/mutation-checks.txt`）
- **第一次**，13 項中 **11 項 CAUGHT、2 項 MISSED**：
  1. **刪除路徑的寫入鎖**被拿掉後，競態測試仍然通過。原因是測試把「送交」插在讀取狀態之前，所以就算沒有鎖，重新讀取時也會看到送交而拒絕，沒有測到「判斷之後到寫入之間」的空檔。
  2. **新版次的 service 狀態檢查**被拿掉後，`test_state_rules` 仍然通過。原因是部分唯一索引也會回 409，測試沒有區分是哪一層擋下的。
- **補強**：
  - 新增 `test_state_cannot_change_between_the_locked_check_and_the_write`（上傳與刪除）：在鎖內判斷之後，用另一個連線（timeout 1 秒）嘗試寫入，必須被擋下。
  - `test_state_rules` 改為同時檢查 service 規則的錯誤訊息。
- **補強後重新檢查**：上述 2 項，以及上傳路徑的鎖，**3 項都 CAUGHT**。
- 每次修改都以位元組副本還原，並核對 SHA-256。

## 先前全套測試（補正前版本；`MATERIAL-SUBMITTAL-M2-evidence/full-suite.txt`，完整輸出，原樣保留）
- **結果：1 failed、2402 passed、3 skipped，退出碼 1**。耗時 43 分 49 秒，Python 3.14.6。
  - 背景工作的通知顯示退出碼 0，那是管線最後 `tail` 的退出碼。**檔案中記錄的真實 pytest 退出碼是 1。**
- **失敗項目**：既有的 `tests/test_attachment_authorization_http.py::test_the_permission_table_covers_exactly_the_legal_entity_types`。
  - 它要求 `ENTITY_PERMISSIONS`、`file_router._VALID_ENTITY_TYPES` 與該檔通用附件權限矩陣 `MATRIX` 三者完全一致。這是刻意設的警戒線：新的附件類型必須同時被納入那套通用附件測試。
  - 我加入了 `material_rev`，但沒有加進 `MATRIX`。
  - **判斷**：這不是其他模組的附件行為被改變（該檔其他模組的上傳、列出、下載、刪除、範圍與鎖等測試全部通過），但它確實表示 **`material_rev` 尚未被通用附件矩陣涵蓋**。
  - 因此**不能宣稱「共用附件流程對其他模組無影響」已由全套測試完整證明**。現有證據是：其他類型的既有測試全過，加上 M2 自己的矩陣測試。
- **建議修正**（當時未執行；後來已依指示執行，見「補正輪」）：
  - 在 `test_attachment_authorization_http.py` 的 `MATRIX` 與種子資料中加入 `material_rev`，並調整該矩陣在這個類型上的假設：分類不能用 `attachment`，`replyDocument` 改用 record_result 權限，帶 vendor 範圍的帳號一律 403。
  - 之後只重跑該檔與 M2 測試檔即可，不必再跑全套。
- 3 個 skipped 都是既有項目，與 M1 時相同：`test_isolated_stack_tool` 2 項（沙箱無法使用 `ps`）、`test_validation_fixes` 1 項。
- **來源雜湊**：執行前後 20 個來源檔的 SHA-256 **完全相同**（`file-hashes.txt` 末段），測試期間程式沒有變動。

## 證據措辭更正（M1 R2）
M1 R2 的錯誤型別測試（NUMERIC、REAL 等）證明的是：**migration 拒絕該結構，且沒有再改變準備完成時的值與 typeof**。它不代表錯誤型別的欄位曾保留字串「00123」——SQLite 在準備測試資料、執行 INSERT 時，就可能已經把它轉成數字；migration 也無法還原先前的轉型。

## 未驗證／限制
- 全套第 1 輪的歷史失敗（`material_rev` 未納入通用矩陣），已由矩陣補正與方案 A 處理；最新版本受影響的兩個測試檔 392 passed、PYTEST EXIT CODE 0。**最新版本沒有重跑全套。**
- **Python 3.11 未執行**（部署前必做）。
- 前端（M3、M4）未做。兩段式保存的 UI 提示，以及「結果未知時先重新讀取」（§9.3）屬 M3 驗收；本批只驗證伺服器端。
- 專案刪除透過 HTTP 回 500 的既有限制不變（M1 已列）。
- 併發測試在 SQLite 檔案資料庫與執行緒上執行；正式環境也是 SQLite（`FOR UPDATE` 分支未在 PostgreSQL 驗證）。
- 前端 `DocumentNamingRules.tsx` 的清單尚未加入 `msa`（M3）。

## 補正輪：把 `material_rev` 納入通用附件矩陣（依指示，2026-10-08）
**只改了測試**：`backend/tests/test_attachment_authorization_http.py`（+89／−3）。
- HEAD 與修改前副本的 SHA-256 都是 `a67f643a…f814`；修改後為 `43e20f8d…29dc`。
- 20 個產品與 M2 來源檔的雜湊和全套測試前完全相同（`file-hashes.txt` 末段）。本輪**沒有修改任何產品程式**。

調整內容（只調整測試資料與通用假設，不改變預期規則）：
- **警戒線 `test_the_permission_table_covers_exactly_the_legal_entity_types` 原封不動**，仍要求三份清單完全一致；沒有排除任何類型、沒有放寬斷言、沒有使用 skip。
- `MATRIX` 加入 `material_rev`，並在種子資料中加入同專案、同承包商（P-A、C1）的材料、送審與 Draft 版次。
- `VIEW_UPDATE` 的「更新類權限」加入 `material:manage:all`、`material:record_result:all`：依規格 §3.4，這兩個就是材料版次的更新類權限（同理，既有的 contractor 類型用的是 `contractors:manage:all`）。
- 通用矩陣上傳時的預設分類，材料版次改用 `catalogue`（`MATRIX_CATEGORY`）：材料版次沒有 `attachment` 這個分類，`catalogue` 是送審分類，在 Draft 狀態時由 manage 權限控管。
- 新增材料版次專屬的測試：
  - 送審 5 類需要 manage，不能只有 record_result（回 403，並檢查 Required 訊息）；
  - `replyDocument` 的上傳與刪除需要 record_result，不能只有 manage；
  - 狀態鎖的上傳與刪除共 10 組（Draft、Submitted、四種結果）；
  - 承包商範圍帳號（sA、sV、sB）在五個附件端點上的拒絕。

**補正後受影響的測試結果**（`affected-tests-after-matrix-fix.txt`，完整 `-v` 輸出；退出碼是 pytest 本身的 `$?`，不經過管線）：
- `tests/test_attachment_authorization_http.py` 加 `tests/test_material_submittals_http.py`：**2 failed、377 passed，PYTEST EXIT CODE: 1**，耗時 14 分 54 秒。
  - 背景通知顯示的 exit code 0 是 shell 外層的退出碼；以檔案中的 `PYTEST EXIT CODE: 1` 為準。
- 警戒線測試**已通過**。通用矩陣對 `material_rev` 的各項測試（無更新權限、無檢視權限、只有檢視權限、只有更新權限、完整帳號、開放狀態可上傳）都通過。其他類型的結果與先前相同。
- **失敗**：`test_contractor_scoped_accounts_are_refused_on_material_revisions_whatever_their_permissions[sV]`、`[sB]`。

### 發現：承包商範圍帳號在依 id 存取的附件端點上回 404，而不是規格寫的 403
- **具體原因**：
  - 上傳與列出清單（`/upload`、`/by-entity`）先檢查權限，所以承包商範圍帳號得到 **403**「Not available to contractor-scoped accounts.」，符合規格。
  - 依 id 存取的 `GET /api/files/{id}`、`DELETE /api/files/{id}`、`GET /api/files/download/{path}`，在**既有設計**中先檢查「附件存在、而且在呼叫者範圍內」，不符合就回 **404**（`file_router.py` 的 get_file／delete_file／serve_upload，目的是不透露 id 是否存在），之後才檢查權限。
  - sV（C2）與 sB（C2、P-B）不在 P-A／C1 這筆版次的範圍內，所以先得到 404「Attachment not found」。
  - sA 屬於這筆版次自己的專案與承包商，又有全部材料權限：五個端點都回 403，**通過**。這證明拒絕不是靠資料範圍造成的。
- **影響**：
  - 兩種回應都拒絕存取，**沒有讀到或寫入任何資料**；測試失敗是因為狀態碼斷言不符，執行到失敗前沒有任何寫入。
  - 實際差別只有狀態碼，以及 404 不透露 id 是否存在。
  - 與規格 §9.2「本模組所有端點一律回 403」的文字**不一致**。
- **沒有用修改測試來掩蓋**：兩項失敗原樣保留。
- **可選處理**（**當時的歷史狀態**：待審查決定、未執行。之後使用者決定採 **A**，已完成，見「方案 A 輪」）：
  - **A（建議）**：補充規格。對依 id 存取的附件端點，「不存在或在範圍外回 404」優先於承包商拒絕；在範圍內的承包商帳號一律 403。理由是與既有附件 API 一致，也不透露其他承包商的附件 id 是否存在。確認後只需把 sV、sB 的這三個端點斷言改為 404，sA 維持 403。
  - **B**：改產品。在這三個端點中，先查附件的 entity type，對 `material_rev` 在範圍檢查之前就回 403。缺點是承包商帳號可以藉此探知「某個 id 是材料版次的附件」。

## 方案 A 輪（使用者 2026-10-08 決定：保留範圍外回 404，補充規格與測試，不改產品）
- **規格**：§9.2 補充。依附件 id 或檔案路徑存取（metadata、delete、download）時，不存在或範圍外回 **404**，且優先；在範圍內的承包商範圍帳號回 **403**。上傳與依 entity 列表維持「權限優先」，承包商帳號一律 403。
- **測試**（只改 `tests/test_attachment_authorization_http.py`）：
  - 原本一個測試迴圈跑五個端點，第一個斷言失敗就停止，**因此先前 sV、sB 的刪除與下載其實沒有被實測到**。
  - 現在改成 `test_contractor_scoped_accounts_cannot_reach_material_revision_attachments[帳號-端點]`：3 個帳號 × 5 個端點，**每個案例獨立執行**，各自有**精確的**狀態碼與 detail，不接受「403 或 404 都算」。

    | 帳號 | upload | by-entity | metadata | delete | download |
    |---|---|---|---|---|---|
    | sA（同專案、同承包商） | 403 | 403 | 403 | 403 | 403 |
    | sV、sB（其他承包商） | 403 | 403 | 404 Attachment not found | 404 Attachment not found | 404 File not found |
  - 每個案例都確認沒有新增或刪除任何附件列或檔案。delete 案例另外確認附件紀錄仍在、`is_deleted=False`、磁碟上的檔案仍在，而且管理員仍能下載原內容。
  - 另外確認同一個 sA 帳號存取 NCR 附件仍是 200：拒絕只針對材料版次。
  - 警戒線 `test_the_permission_table_covers_exactly_the_legal_entity_types` **未改**。產品程式**未改**：20 個檔案的雜湊相同（`file-hashes.txt` 末段）。權限與專案範圍都沒有放寬。
- **結果**（退出碼都是 pytest 本身的 `$?`，外層指令也回傳同一個值）：
  - 第 1 步，只跑受影響的案例（`plan-a-step1-affected-cases.txt`）：**17 passed，PYTEST EXIT CODE 0**。
  - 第 2 步，通用附件權限測試檔加 M2 測試檔（`plan-a-step2-two-files.txt`）：**392 passed、0 failed、0 skipped，PYTEST EXIT CODE 0**，耗時 15 分 24 秒；背景工作外層的退出碼也是 0。

## 歷次測試紀錄（全部保留；不得解讀為最新版全套通過）
| 輪次 | 範圍 | 結果 | 退出碼 | 證據 |
|---|---|---|---|---|
| 1. 全套（補正前版本） | 全部後端測試 | 1 failed／2402 passed／3 skipped（`material_rev` 未納入通用矩陣） | 1（背景通知的 0 是 tail 的） | `full-suite.txt` |
| 2. 矩陣補正後 | 通用附件測試檔＋M2 | 2 failed／377 passed（sV、sB 拿到 404 而非 403；只測到第一個端點） | 1 | `affected-tests-after-matrix-fix.txt` |
| 3. 方案 A 第 1 步 | 受影響案例 | 17 passed | 0 | `plan-a-step1-affected-cases.txt` |
| 4. 方案 A 第 2 步 | 通用附件測試檔＋M2 | 392 passed | 0 | `plan-a-step2-two-files.txt` |
- **最新版本沒有重跑全套。** 自第 1 輪以來，產品程式沒有變動，只改了 `test_attachment_authorization_http.py`。其他測試檔在第 1 輪的結果（除了已處理的那 1 項，其餘全部通過）可作為參考，但**不代表最新版本已全套驗證**。

## 下一步
- 交 M2 獨立審查（方案 A 只確認狀態碼的處理方向，不代表 M2 整體 PASS）。審查通過前不進 M3、不部署。
