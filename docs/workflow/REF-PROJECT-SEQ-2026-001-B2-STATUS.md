# STATUS.md — Claude 執行結果

TASK_ID: REF-PROJECT-SEQ-2026-001-B2
ROUND: 1，加上 R1 之後的修正（2026-10-13）
基準：2589c8d6 起開工；合入 FAT-SUPPLIER-NULL 之後，分支 HEAD 為 d54be8a8（協調中心用 merge-file 合併 FAT.tsx、LanguageContext、refusal.test.ts）。

## RESULT
- [x] DONE：R1 REVISE → 修正 → R2 PASS；使用者確認「專案隔離 2 可以」；後端 3.11 全套 2737 passed、0 failed。

## 使用者決定（本輪）
- **Q1**：Checklist 共用範本只有系統管理者能新增和修改（DECISIONS 第 9 點）。
- **Generate Checklist**：ITP 頁的「Generate Checklist」只顯示給系統管理者（使用者確認「可以，只給管理者」）。

## 本輪修改：產品程式

### 後端
| 檔案 | 內容 |
|---|---|
| `core/scope.py` | **共用範本**<br>• `is_shared_template`：沒有專案的 ITP；Checklist 裸範本（沒有專案、沒有 itrId、沒有 template_id）。<br>• `shared_template_clause`：同一判斷的 SQL 版本。<br>• `apply_scope`、`record_in_scope`：共用範本在每個專案都看得到。<br>• 承包商帳號：看得到沒有指定承包商的共用範本；有指定承包商的範本，只有該承包商看得到。這是測試調整時發現的問題，見下方「實作中發現並修正」。<br>**只有管理者能寫**<br>• `require_shared_template_write`：非管理者寫入共用範本時，回 403 `SHARED_TEMPLATE_ADMIN_ONLY`。<br>**建立時必須有專案（G1、D7）**<br>• `enforce_create_scope`：有 scope 的建立都必須有專案，管理者也一樣，缺少時回 400 `PROJECT_REQUIRED_FOR_CREATE`；`allow_shared=True` 的 ITP 除外。<br>• `scope=None` 的內部呼叫不受影響。<br>**同專案連結（G2）**<br>• `require_same_project`：連結到其他專案的文件時，回 400 `LINK_OTHER_PROJECT`，參數為 `{docType, number}`；共用範本不受限。 |
| `repositories/itp_repository.py`、`checklist_repository.py` | 帶 `project_id` 查詢時，結果包含該專案的資料加上共用範本。 |
| `services/itp_service.py` | `create`：用 `allow_shared=True`，管理者在「所有專案」下建立的是共用範本（D18）。`update`、`delete`、`detail` 都加上 `require_shared_template_write`。 |
| `services/checklist_service.py` | **建立**：`POST /checklist` 只建立範本，所以只有管理者能建，`project_id` 一律為 NULL。範圍檢查和承包商對應改成在取號之前（G1：被拒絕時不會白白用掉號碼）。<br>**寫入**：`update`、`delete` 加上 `require_shared_template_write`。 |
| `services/noi_service.py` | `create`、`update` 的 itpNo 檢查是否同專案或共用範本（只檢查有變更的連結）。Q-WorkFlow 建立時，`project_id` 取自 NOI。 |
| `services/itr_service.py` | `_check_reference_links` 的 NOI、NCR 連結檢查是否同專案。 |
| `services/ncr_service.py` | `create` 的 noiNumber、itrNumber 檢查是否同專案。 |
| `services/followup_service.py` | 新增 `_FOLLOWUP_SOURCES` 對照表，`create` 檢查來源文件是否同專案。 |
| `routers/itp.py` | `update_itp` 遇到 `HTTPException` 時直接拋出，不再被包成 500。這是 B2 測試抓到的問題。 |
| `routers/file_router.py` | `upload_files`：取得 target 之後檢查 `require_shared_template_write`。`delete_file`：取得 record 之後檢查同一條件。 |
| `db_migrations.py`（共用檔） | 第 26 步：重用第 25 步的函式，加上新 flag `projectless_records_to_only_project_b2`，處理 B1 到 B2 之間產生的無專案單據（R1 P3-2）。 |

### 前端
前端由代理完成，逐檔清單見本節最後。
- **共用工具**：
  - `utils/projectFilter.withCurrentProject`
  - `hooks/useCreateGate`（新檔）
  - `CreationProjectField` 改成唯讀顯示目前專案；在「所有專案」下顯示「共用範本」。
- **新建時帶入目前專案**：12 個 store（noi 含批次、itr、ncr、obs、osd、pqp、followUp、meetingMinutes、itp、fat、audit；checklist 範本不帶），以及 FollowUpIssue 直接呼叫的 POST。
- **新增按鈕套用 gate**：NOI（新增和批次新增）、ITR、NCR、OBS、OSD、PQP、FollowUp、MeetingMinutes、FAT、Audit；ITP 使用 `useCreateGate(true)`。
- **只有管理者能用**：Checklist 的「新增範本」、ITP 的「Generate Checklist」。
- **非管理者開啟共用範本時唯讀**：ITP（`sharedTemplateReadOnly`，並隱藏刪除鈕）、Checklist 範本（強制唯讀，並隱藏刪除鈕）。
- **稽核精靈**：專案改成唯讀顯示，仍然送出 project_id。
- **錯誤顯示**：FAT 和 FollowUp 存檔失敗時改用 `showRefusal`，彈出視窗會依拒絕代碼顯示原因。FollowUp 在新增和修改時，視窗都不會自動關閉。
- **FAT.tsx 和 FAT-SUPPLIER-NULL 的重疊**（以 HEAD 為基準的行號）：
  - 第 4 行：移除 import useCreationProjects
  - 第 25 行：import useCreateGate
  - 第 34 行：createGate
  - 第 257 行：新增按鈕的 disabled 和 title
  - 第 574 行：移除 creationProjects
  - 第 612 行：handleSave 移除 creationProjects 檢查
  - 第 616 行：catch 改成 `showRefusal(err,'save')`，只有這一處和 FAT 那邊重疊
  - 第 634–635 行：CreationProjectField 不帶參數
  - 第 778 行：存檔鈕的 disabled 只看 saving
  - **沒有改 `handleSaveFATDetails`**。
- **LanguageContext**（共用檔，只新增）：
  - `project.label`、`project.sharedTemplate`、`project.chooseProjectToCreate`、`project.createSharedTemplate`、`project.sharedTemplateReadOnly`
  - `refusal.code.PROJECT_REQUIRED_FOR_CREATE`、`SHARED_TEMPLATE_ADMIN_ONLY`、`LINK_OTHER_PROJECT`
- **`tests-unit/refusal.test.ts`**（REFUSAL 的測試檔）：掃描後端代碼的正則改成接受單、雙引號，也能處理跨行和一層括號；PARAMS 補上 B1 和 B2 的 7 個代碼。

### 實作中發現並修正
- **承包商帳號看不到沒有指定承包商的共用範本**：由測試調整代理回報。原本承包商條件照舊比對，所以承包商帳號在 ITR 裡無法連結通用範本。修正為：沒有指定承包商的共用範本，所有承包商都看得到；有指定承包商的仍維持隔離。
- **`routers/itp.py`**：共用範本被拒絕時，原本的 403 被包成 500，已修正。

### 已知、未處理
- **`ITP/ITPDetail.tsx`（`/itp/:id`）**：前端找不到任何入口，也沒有唯讀機制，所以沒有改；後端會擋下非管理者的寫入。
- **`services/api.ts` 的 `bulkCreateFollowUps`**：沒有任何地方呼叫，而且改了會形成循環 import，所以沒有包。
- **create_checklist 的拒絕順序**：非管理者建立範本時，itrId、結果欄位、單號存在性這些 400 檢查排在「只有管理者」的 403 之前。屬於輕微問題，沒有改。
- **建立時的 project_id 是否存在**：管理者送出的 `project_id`，後端不檢查專案是否存在（SQLite 沒有啟用 FK）。前端一律帶入目前專案，所以實務上不會發生。
- **其他模組的存檔錯誤訊息**：會顯示後端給的原因，但只有英文句子（依 REFUSAL 現行方式），要等 REFUSAL 第 2 批才會翻譯。

## R1 之後的修正
細節見 REVIEW。
- G2「同專案」改成在修改時也檢查：NCR、Follow-up、Checklist。
- link_checklist 檢查範本和 ITR 是否同專案。
- NOI 只能引用使用者看得到的 ITP；NOI 的建立和批次建立路由把 ValueError 轉成 400（原本會變成 500）。
- 允許共用範本的路徑上，空的 project_id 轉成 None。
- `is_shared_template` 和 SQL 的判斷一致。
- 更新舊註解。
- **使用者決定**：衍生單據沿用來源單據的專案（DECISIONS 第 10 點）。
- B2 新測試增加到 19 項。

## 本輪修改：測試
- **新增** `tests/test_ref_project_seq_b2_http.py`，共 13 項：
  - 管理者在「所有專案」下建立被拒（400），在專案內可以建立；
  - 專案成員自動帶入專案；
  - 管理者建立的 ITP 是共用範本，成員建立的是專案 ITP；
  - 共用範本的可見範圍；
  - ITP、Checklist 範本只有管理者能寫，附件也是；
  - NOI→ITP、ITR→NOI、Follow-up→來源的同專案檢查；
  - Q-WorkFlow 帶入專案；
  - 承包商帳號與共用範本；
  - 第 26 步。
- **既有測試**（代理加上本工作階段，沿用 B1 的 helper 方式，沒有刪除測試、沒有放寬斷言）：
  - 共用 harness 新增 `ensure_template_admin`、`create_template_as_admin`（在 test_itr_revoke_approval_acceptance.py），範本改由管理者帳號建立，內容不變；
  - 涉及的檔案：checklist_pass_integrity、checklist_status_rule、itr_approval_events、itr_write_paths_atomic、itr_checklist_http_e2e、itp_checklist_km_project_audit、scope_instance_contractor、noi_audit_delete_update；
  - 依賴這些 harness 的檔案不需要修改就通過了。
- **依設計改變的斷言**：

| # | 測試 | 原本 | 現在 | 依據 |
|---|---|---|---|---|
| 1 | `test_scope_instance_contractor_http::test_null_ownership…[scP-None-None]` | 404 | 200（沒有專案的範本是共用範本） | D9／D10 |
| 2 | 同上 `[scA-None-None]` | 404 | 200（沒有指定承包商的共用範本，承包商也看得到） | D9（B2 修正） |
| 3 | 各 harness 的範本 helper，以及 itp_checklist_km_project_audit 的 checklist case | 由非管理者建立範本 | 由管理者建立；主旨斷言不變，audit.username 改成比對實際執行的帳號 | 使用者 2026-10-13：Checklist 範本只有系統管理者能建 |
| 4 | `test_noi_audit_delete_update_http` 中管理者建立 NOI | 不帶 project_id | 帶 `project_id="P-A"`；數值斷言不變 | G1／D7 |

## 執行證據
- **後端第一輪全套**（測試調整前）：254 failed、2450 passed。原因幾乎都是「非管理者建立範本」，另有 1 項是「管理者在所有專案下建立 NOI」。
- **調整後**：
  - 代理負責的 14 個檔：342 passed；相關套件：348 passed。
  - B1、B2 新測試加上 scope_instance_contractor：67 passed。
- **後端 3.11 全套（最終）**：**2737 passed、17 skipped、0 failed，pytest_exit=0**，耗時 1:00:05（13:36Z–14:36Z）。
  - 依 2026-10-13 新規則，用 `docs/workflow/py311-full-suite.sh` 執行（docker python:3.11-slim，Python 3.11.17）。
  - 對象是 HEAD d54be8a8 加上 B2 的工作樹。
  - 紀錄在 `REF-PROJECT-SEQ-2026-001-B2-evidence/backend-full-suite-py311.txt`。
  - 開跑之後，backend 和 react-app 沒有任何檔案再被修改（用 find -newer 確認），只改過 STATUS 和 REVIEW 文件。
- **前端**：
  - tsc：0 錯誤；
  - eslint：沒有新增問題（改動的檔案有 2 個 error、4 個 warning，都和 HEAD 相同，屬於既有問題）；
  - npm test：197 pass、0 fail。
- **隔離環境瀏覽器實測**（8295／3295，種子 `seed_ref_project_seq_b2_review.py`）：
  - **pm_hl**（綁 Hailong 的專案成員）：
    - ITP 清單有 ITP-HL-REVIEW 和共用範本，沒有 ITP-TECO；Checklist 範本有 2 份共用範本；
    - 開啟共用 ITP 時唯讀，顯示「共用範本：只有系統管理者可以修改」，只剩「關閉」按鈕；
    - 新增 NOI 時，ITP 選單只有 Hailong 的 ITP 和共用範本；
    - NOI 清單 0 筆，TECO 的 NOI 看不到。
  - **admin**：
    - 在「所有專案」下，「新增 NCR」停用，提示「請先在右上角選擇專案」；
    - ITP 的新增按鈕可以用，提示會建立共用範本；
    - 切到 Hailong 後，「新增 NCR」可以使用。
- **使用者預覽**（2026-10-13）：3295 重啟到 R2 版後，使用者看了 admin 和 pm_hl 兩個帳號，回覆「專案隔離 2 可以」（由協調中心轉達）。
  - 使用者問到「ITP 不是只有管理者可以編輯嗎？」協調中心說明：共用範本只有管理者能改；專案 ITP 由該專案成員依角色權限編輯，要收緊可以從角色權限調整。
  - 使用者確認維持目前的設計。

## 上線影響
- **第 26 步**：只在正式站只有一個專案時執行。會把 B1 上線後在「所有專案」下建立的無專案單據歸到 HL；如果沒有這種單據，就什麼都不做。
- **管理者**：之後在「所有專案」下不能新建單據，但可以新建共用 ITP 範本。
- **Checklist 範本和 Generate Checklist**：只有管理者能用。
- **非管理者帳號**：B2 上線後才可以建立（B1 期間的限制解除）。
- **REFUSAL 第 2 批**：會碰到同一批 store 和 router，要等 B2 提交之後再開始（協調中心安排）。
