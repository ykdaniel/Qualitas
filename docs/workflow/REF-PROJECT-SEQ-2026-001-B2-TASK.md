# TASK.md — REF-PROJECT-SEQ 第 2 批：新建一律帶專案、關聯同專案、共用範本

TASK_ID: REF-PROJECT-SEQ-2026-001-B2
SOURCE: 設計 v2（`REF-PROJECT-SEQ-2026-001-DESIGN.md`）第 2、3、5 節，以及 D7、D9、D10、D18。B1 上線後（2be0eaf1，2026-10-13 10:25Z）由協調中心通知開始規劃。
基準：2589c8d6，由協調中心指定。這一批期間，各模組的新建流程和新增 UI 只由本工作階段修改。

## 範圍
1. **新建一律帶專案（G1、D3）**
   - 後端：所有新建端點都要求 `project_id`，**管理者也一樣**。缺少回 400（帶拒絕代碼），不在範圍內回 403。取號一律放在範圍檢查之後（Checklist 目前是先取號，會改正）。
     - 涵蓋模組：NOI（含批次新增）、ITR、NCR、OBS、OSD、PQP、Follow-up、Meeting、Checklist、ITP、FAT、Audit。Material 原本就必填，維持不變。
     - 例外：管理者在「所有專案」下新增的 ITP，就是共用範本（D18）。
   - 前端：新建時一律帶入目前專案，表單上唯讀顯示專案名稱。ITP 和 FAT 原本的專案下拉選單改成唯讀顯示。
2. **管理者選「所有專案」時不能新建（D7）**：「新增」按鈕停用，滑鼠移上去提示「請先在右上角選擇專案」。唯一的例外是 ITP 頁，這時新增的是共用範本（D18）。
3. **從來源單據產生的單據沿用來源的專案，而且必須和目前專案一致**（設計第 2 節的表）：
   - NOI→ITR、ITR→NCR、重新檢驗、ITR→Checklist、手動 Checklist←ITR、Follow-up←來源單據、延續會議←原會議。
   - Q-WorkFlow 建立時補上 project_id，取自 NOI。
4. **關聯必須同專案（G2）**：存檔時後端檢查連結的單據屬於同一個專案；ITP 例外，也可以連到共用範本。
   - 涵蓋：ITR→NOI、NCR→ITR／NOI、Checklist→ITR、Follow-up→來源單據、NOI→ITP。
   - 前端選單只列出同專案的單據；選 ITP 時另外加上共用範本。
5. **共用範本看得到、但只有管理者能改（D9、D10、D18）**：
   - 沒有專案的 ITP，以及 Checklist 裸範本，**所有專案都看得到、都能引用**。
   - 寫入（修改、刪除、核准、作廢、發布、明細）**只有系統管理者**能做；其他人回 403，帶拒絕代碼。
   - 清單：帶 project_id 查詢時，ITP 和 Checklist 範本另外附上共用範本。
6. **再歸類一次（R1 P3-2）**：新增 migration 第 26 步，用新的 flag。B1 上線後、B2 上線前產生的無專案單據，在系統只有一個專案時歸到該專案，規則和第 25 步相同（Checklist 只歸實例）。
7. **IAM**：B2 上線後才允許建立非管理者帳號。程式不需要改，只要在上線說明中寫清楚。

## 使用者決定
- **Q1（使用者 2026-10-13 決定，在本工作階段和協調中心兩邊的回答一致）**：Checklist 共用範本（裸範本、沒有專案）**只有系統管理者能新增和修改**，比照 ITP 共用範本（D18）。專案內的 Checklist 實例照現行權限規則。
- （D18 已定）ITP 共用範本只有系統管理者能新增和修改。
- **Generate Checklist（使用者 2026-10-13 確認）**：ITP 頁的「Generate Checklist」產生的是範本，所以只顯示給系統管理者。

## 預計修改的檔案
**後端**
- `core/scope.py`：
  - 新增 `require_create_project(data, scope)`：管理者也必須提供 project_id；ITP 例外。
  - 共用資料的讀取規則：apply_scope 和 record_in_scope 對 ITP 和裸範本放行 NULL 專案。
  - 新增「共用資料只有管理者能寫」的判斷。
- `core/refusals.py`（REFUSAL 的檔，只新增代碼常數或 helper，不改既有內容；改之前會先通知）。
- **services**：各模組的 create 路徑，以及關聯一致性檢查。
  - noi、itr（含 create_ncr_from_itr、create_reinspection、link-checklist）、ncr、obs、osd、pqp、followup、meeting_minutes（含 create_new_occurrence）、checklist、itp、fat、audit。
  - 另外：itp_service 和 checklist_service 的寫入路徑要加上「共用資料只有管理者能寫」。
- **repositories**：itp_repository、checklist_repository 的 get_all，帶 project_id 時附上共用範本。
- **routers**：上述模組的 create 路由，把新的拒絕情境對應到帶代碼的回應；有既有寫法就沿用。
- `db_migrations.py`：第 26 步。
- `schemas.py`：只有在需要時新增欄位，預計不需要。

**前端**
- **各模組的新增入口和 store**：
  - NOI（NOI.tsx、NOIDetailModal.tsx（CRLF）、NOIBulkAddModal）、ITR（ITR.tsx、ITRModals.tsx）、NCR、OBS、OSD、PQP、FollowUpIssue、MeetingMinutes、Checklist、ITP（ITPModals.tsx）、FAT、Audit（AuditWizard）；
  - 對應的 store：noiStore、itrStore、ncrStore、obsStore、osdStore、pqpStore、followUpStore、meetingMinutesStore、checklistStore、itpStore、fatStore、auditStore；
  - `services/api.ts`。
- `components/Shared/CreationProjectField.tsx`：改成唯讀顯示。
- 新增共用的 hook 或元件：例如 `useCreateProject()`，負責「管理者選所有專案時停用新增，並顯示提示」。
- `context/LanguageContext.tsx`：只新增鍵。
- 選單過濾：NOI 選 ITP 時附上共用範本；Checklist 選範本時附上共用範本。

**測試**
- 新增 `tests/test_ref_project_seq_b2_http.py`。
- 既有測試：預期還會有一輪調整，例如管理者建單時必須帶 project_id、共用範本只有管理者能寫。照 B1 的方式用共用 helper 處理，不放寬斷言。

## 限制
- 依 AGENTS.md 和協調規則：
  - 只在隔離環境測試；
  - 不動 NAS，不推送；
  - 改共用檔（schemas.py、LanguageContext.tsx、db_migrations.py、DECISIONS.md、core/refusals.py）之前先通知協調中心；
  - 碰到和其他工作階段重疊的檔案，依協調中心排定的順序處理。
- 完成後要經過獨立審查、在隔離環境預覽，並請使用者確認，再提交。
