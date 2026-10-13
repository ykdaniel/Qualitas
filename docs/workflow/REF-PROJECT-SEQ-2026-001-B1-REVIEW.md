# REVIEW.md — 獨立審查

TASK_ID: REF-PROJECT-SEQ-2026-001-B1

- 審查者：獨立 Claude 審查代理（general-purpose 子代理，唯讀）。GPT 審查依協調規則暫停。
- 範圍：工作樹 diff，對照 HEAD 15612688，包括未追蹤的新檔。不是部署驗收。

## R1（2026-10-13）：REVISE

### P1-1（必修）：名為「Administrator」的角色會變成不受限
- **問題**：scope 和 IAM 對「誰是管理者」用的是兩套規則。
  - scope：`ADMIN_ROLE_NAMES = {admin, administrator}`。
  - IAM：`is_admin_role_name` 只認 "admin"。
- **影響**：沒有 admin 身分、但有角色管理和使用者管理權限的人，可以建立「Administrator」角色並指派給別人。拿到這個角色的帳號不受範圍限制，看得到所有專案。審查員用 probe 實測已重現。
- B1 把清空專案這條路堵掉之後，這是唯一還能讓非管理者看到全部資料的方法。

### P2-1（建議修）：第 25 步會把 Checklist 裸範本也歸到唯一專案
- 和 D9（Checklist 範本庫是共用主檔）衝突，而且這一步只執行一次，事後要改得另寫反向 migration。

### P3（小問題）
1. 第 25 步先查出 ids、再用 `WHERE project_id IS NULL` 更新，audit 記錄的 ids 可能和實際更新的列不一致。
2. 第 25 步跑完後、第 2 批上線前，管理者在「所有專案」下建立的單據仍然沒有專案，之後也不會再被自動歸類。
3. UserScopeSection：只綁承包商、沒綁專案的帳號實際上什麼都看不到，畫面卻標示為「受限」。
4. 缺一條回歸測試：選專案之後，舊的 token 應該失效（probe 已確認會回 401）。
5. 有 km:view 的非專案人員，透過 API 仍然讀得到 KM。這和 D9、既有 KM 行為一致，但和 D6「什麼都看不到」的字面有出入，建議請使用者確認。
6. 用同一個 token 同時送出兩次 select-project，可能拿到兩組不同專案的 token。兩個都是他綁定的專案，不是安全問題。

### 已確認沒問題
- 空範圍在所有使用處都是拒絕方向，沒有任何地方把空集合當成「全部」。
- jti、refresh、黑名單機制正確，沒有 jti 的舊 token 仍可使用。
- select-project、profile 的狀態判斷正確。
- IAM 的專案檢查和交易處理正確。
- PQP history、KM 圖片例外（只放行固定路徑樣式）、related_service、第 25 步的交易與 flag 都正確。
- 前端各項修改正確；CRLF 都保留。
- 抽查的測試沒有被放寬；被拒絕的測試仍是因為原本的理由。
- 審查時實跑：後端 11 個檔 391 passed、前端 tsc 0、npm test 185 pass。

## R1 之後的修正（待 R2）
| 項目 | 修正 |
|---|---|
| P1-1 | `core/scope.py`：`is_admin_user` 改用 `UserRepository.is_admin_role_name`，只認名稱為 admin 的角色（不分大小寫），`ADMIN_ROLE_NAMES` 改成 `{"admin"}`。前端 `UserModal.tsx` 的管理者判斷也只認 admin。<br>回歸測試：`test_a_role_merely_named_administrator_is_an_ordinary_scoped_role`。<br>`test_ncr_close_permission_http`：dt_adminish（角色名稱 Administrator）綁 P-A，403 仍然來自缺少 close 權限。 |
| P2-1 | `db_migrations.py` 第 25 步：checklist 只搬實例（itrId 或 template_id 不為空），裸範本保持沒有專案。B1 遷移測試新增斷言：範本仍然是 NULL，實例歸到專案。 |
| P3-1 | 更新時改用 `WHERE id IN :ids AND project_id IS NULL`（expanding bindparam），和 audit 記錄的 ids 一致。 |
| P3-3 | `UserScopeSection`：沒有專案時就標示「未指派專案」，不管有沒有綁承包商。 |
| P3-4 | 新增 `test_choosing_a_project_ends_the_project_less_session`：舊的 access token 和 refresh token 都回 401。 |
| P3-2、P3-5、P3-6 | 不改程式，列入 STATUS 的「上線影響／後續項目」並告知協調中心：P3-2 在第 2 批處理；P3-5 請協調中心向使用者說明；P3-6 可接受。 |

## R2（只審 R1 之後的修正，2026-10-13）：PASS
- **P1-1**：
  - 用 R1 的 probe 重跑攻擊流程：Administrator 角色的帳號現在是 is_admin=False、project_status=working，只看得到自己專案的 NCR。漏洞已經堵上。
  - 管理者判斷收窄後，沒有其他程式把 "administrator" 當成管理者：
    - db_seeder 建立的角色名稱是 "admin"；
    - 前端只剩 `=== 'admin'` 的判斷；
    - ProjectSelector 和 ProjectGate 用的是伺服器回傳的 is_admin。
- **P2-1**：只搬 checklist 實例，判斷條件和第 23 步判斷裸範本的條件互為反面，一致。
- **P3-1、P3-3、P3-4**：都已正確修正。
- **CRLF**：db_migrations.py 的 CRLF 行數仍等於總行數，格式保留。
- **實跑**：後端 137 passed；前端 tsc 0、npm test 185。
- **備註**（不影響 PASS）：第 25 步的原始 SQL 直接寫 `itrId`，沒有加引號，和第 23 步相同。在 SQLite 沒問題；將來若換成 Postgres，這一步會記錄錯誤並在每次啟動時重試，資料不會被改壞。
