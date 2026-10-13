# STATUS.md — Claude 執行結果

TASK_ID: REF-PROJECT-SEQ-2026-001-B1
ROUND: 1，加上 R1 之後的修正（2026-10-13）
基準：`ui/sidebar-shell-preview` 15612688（REFUSAL-DIALOG 第 1 批）。07248220 起開工；REFUSAL 前推時，user_service.py、App.tsx、LanguageContext.tsx 由協調中心三方合併（0 衝突）。

## RESULT
- [x] DONE：R1 REVISE → 修正 → R2 PASS（見 REVIEW）。
  - 使用者 2026-10-13 在 3294 預覽後回覆「專案隔離可以」（由協調中心幫忙依序登入 pm_multi 選 Hailong、pm_none、pm_vendor、admin）。
  - 合併 89c5ac08（OBS-PRINT 和 OBS-ATTACH-LOCK）之後，後端全套 2692 passed、0 failed。
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪修改：產品程式

### 後端
| 檔案 | 內容 |
|---|---|
| `core/scope.py` | **範圍計算**：<br>• 新增 `is_admin_user`、`bound_project_ids`、`working_project_id`。<br>• `compute_scope`：管理者不受限。<br>• 非管理者只在一個專案作業：token 裡的專案，而且必須仍是他綁定的專案；沒有 token 專案時，只綁一個專案就用那個；其餘情況（包括沒綁專案）都是**空範圍**（D6，安全修正）。<br>• 有 vendor_id 時，再加上承包商限制。<br>**建立單據**：`enforce_create_scope` 遇到空範圍時，回傳明確的拒絕訊息。 |
| `core/security.py` | `authenticate_access_token` 把 token 的 `project_id` claim 放進 `user.token_project_id`（只是物件屬性，不是資料庫欄位）。access／refresh token 加上 `jti`（範圍追加 10）。 |
| `routers/auth.py` | **登入**：只綁一個專案的非管理者，發出帶 `project_id` 的 token。<br>**refresh**：沿用原本的專案。<br>**新增 `POST /auth/select-project`**（D5、D20）：<br>• 管理者 → 400 `ADMIN_NO_PROJECT_SELECTION`<br>• 已選過專案 → 409 `PROJECT_ALREADY_CHOSEN`<br>• 不是該專案成員 → 403 `NOT_PROJECT_MEMBER`<br>• 成功時把提出的舊 token 列入黑名單、發新 token、寫入 audit `SELECT_PROJECT`。<br>**`/user/profile`** 改回 `UserProfile`，新增 is_admin、projects、current_project_id、project_status（admin／working／choose／relogin／non_member）。 |
| `schemas.py` | 只新增：`ProjectBrief`、`UserProfile`、`SelectProjectRequest`，以及 `UserCreate.project_ids`。 |
| `services/user_service.py` | 非管理者帳號必須有專案（D8，`PROJECT_REQUIRED`）：<br>• `create_user`：專案和帳號在同一個交易內寫入，audit 記錄 project_ids。<br>• `set_user_scope`：不能清空專案。<br>• `update_user`：改成非管理者角色、但沒有專案時拒絕；這項檢查放在「最後一個管理者」檢查**之後**（範圍追加 12）。<br>新增 `_require_known_projects`。**沒有動**刪除角色那段（REFUSAL）。 |
| `routers/iam.py` | `set_user_scope` 的 ValueError 改用 `refusal_http`（帶代碼）。 |
| `routers/pqp.py` | 只改 `GET /{id}/history`：先做範圍檢查（G4，安全修正）。 |
| `routers/file_router.py` | **只改 `serve_upload` 的範圍判斷那一段**（原第 491–494 行 → 新第 489–500 行）：沒有 Attachment 列的 KM 文章圖片不受專案範圍限制，但仍然要 km:view（範圍追加 11，D9）。其他沒有 Attachment 列的檔案照舊 404。合併時要和 OBS-ATTACH-LOCK 對齊。 |
| `services/related_service.py` | 關聯文件只顯示 root 記錄所在專案的資料（G5）；沒有專案的 ITP（共用範本）可以出現在任何專案。 |
| `db_migrations.py` | 第 25 步 `_assign_projectless_records_to_the_only_project`（D13），用 migration_flags 確保只跑一次：<br>• 系統恰好只有一個專案時，把 noi／itr／ncr／checklist／obs／osd／pqp／followup／meeting_minutes／audits／fat／qworkflow 中 `project_id IS NULL` 的資料歸到這個專案；**不動 ITP**，號碼不改。<br>• 每張表寫一筆 audit `ASSIGN_PROJECT`，記錄被移動的 ids，所以可以逆轉。<br>• 沒有專案或有多個專案時不執行，記錄 log 後下次啟動再試。 |

### 前端
| 檔案 | 內容 |
|---|---|
| `components/Shared/ProjectGate.tsx`、`.module.css`（新） | 依 project_status 顯示畫面：<br>• choose → 選專案頁；<br>• non_member → 非專案人員提示；<br>• relogin → 提示重新登入。<br>失敗時，有拒絕代碼就顯示翻譯後的文字。 |
| `App.tsx` | PrivateRoute 內包一層 ProjectGate。REFUSAL 的 `<RefusalDialog />` 保留。 |
| `components/Shared/ProjectSelector.tsx`、`.module.css` | 非管理者只看到「目前專案：XXX」，滑鼠移上去提示切換專案要重新登入（D4）；前綴不截斷。 |
| `context/AuthContext.tsx` | 讀取 profile 後，非管理者的目前專案以伺服器回傳的為準。登出時清除 `qualitas_current_project`（G7）。新增 `refreshUser`。 |
| `components/Shared/AppProviders.tsx` | 切換專案時一併重抓 OSD、FAT、會議記錄（G3）。管理者存的專案如果已經看不到，就清掉。 |
| `utils/itpRecordLink.ts` | 查詢時帶上目前專案（G6）。 |
| `components/IAM/UserModal.tsx`、`UserScopeSection.tsx`、`store/iamStore.ts`、`services/api.ts` | 建立非管理者帳號時專案必填，project_ids 和帳號一起送出。「範圍」區塊的說明和沒有專案時的標示都改正。帶代碼的拒絕用 RefusalDialog 顯示。api.ts 新增 `selectProject`，以及 User 的 profile 欄位。 |
| `context/LanguageContext.tsx` | 只新增鍵，中英文各一份：`project.switchNeedsRelogin`、`project.gate.*`、`iam.scope.noProject`、`iam.projectRequired`、`refusal.code.{PROJECT_REQUIRED, NOT_PROJECT_MEMBER, PROJECT_ALREADY_CHOSEN, ADMIN_NO_PROJECT_SELECTION}`；並修改 `iam.scope.hint`。 |

## 本輪修改：測試
- **新增測試**：
  - `tests/test_ref_project_seq_b1_http.py`，16 項。
  - `tests/project_membership.py`：共用 helper，提供 `bind`、`ensure_project`。
  - `Env.login(username, project=None)` 加上 `default_projects`，給綁了多個專案的帳號用（在 test_itr_revoke_approval_acceptance.py）。
- **既有測試的修改方式**：依協調中心要求，在共用 harness 或 seed 處理。
  - 不刪測試、不放寬斷言；
  - 原本被拒絕的測試，確認仍是因為原本的理由被拒絕。
  - 自己修改的檔案，以及三組代理（Audit／NOI·會議·材料／ITR·Checklist）的逐檔紀錄，見下方「測試修改明細」。
- **attachment_authorization 第一輪 117 項失敗的分類**：
  - **115 項**：權限矩陣的 6 個帳號（noperm、viewer、create_only、updater、mat_manage、mat_view）原本沒有專案、不受限；現在綁到 P-A，矩陣資料都在 P-A。修正前，原本預期 403 的測試因為空範圍而拿到 404，理由不對；綁定後回到權限造成的 403。
    - `without_the_update_permission…`：39 項
    - `without_the_view_permission…`：26 項
    - `view_permission_alone…`：26 項
    - `update_permission_alone…`：13 項
    - 材料相關：8 項
    - `create_only…`：3 項
  - **1 項**：`legitimate_scoped_user…`。sV 原本只綁承包商（D8），改綁 P-A 和 P-B，預設在 P-A 作業，上傳 ncr-b 時選 P-B。修好這項也需要 jti 修正，因為同一秒內重新登入的 token 原本完全相同。
  - **1 項**：`KM_images…`。viewer 改綁專案後，碰到範圍追加 11（KM 內嵌圖片）的問題，修正產品程式後通過。

## 依設計改變的斷言
共 7 處。都在測試的說明中註明了原因，對應的 D 編號如下：

| # | 測試 | 原本斷言 | 現在斷言 | 依據 |
|---|---|---|---|---|
| 1 | `test_scope_isolation::test_user_without_config_is_unscoped` → 改名為 `…_is_not_a_project_member_and_sees_nothing` | 沒有任何設定的帳號不受限 | 空範圍 | D6 |
| 2 | `test_iam_admin_takeover_http::test_non_admin_cannot_change_an_admin_accounts_data_scope` 最後一行 | 一般帳號的專案可以清空 → 200 | 改成設定為另一個有效專案 → 200 | D8（清空現在回 400） |
| 3 | `test_iam_user_security_http::test_role_manager_can_still_create_with_a_role_and_it_is_audited` | — | 建立帳號的 audit 多了 `project_ids` 欄位，屬於擴充，原有欄位不變 | D8 |
| 4 | `test_attachment_hardening_http::test_scoped_accounts_keep_the_existing_rule_no_row_no_download` → 改名為 `…km_images_but_no_other_row_less_file` | 限定專案的帳號拿 KM 圖片 → 404 | → 200；其他沒有 Attachment 列的檔案仍是 404 | D9／範圍追加 11 |
| 5 | `test_itr_integrity_guards_http::test_the_related_graph_hides_records_outside_the_callers_scope` | 不受限的帳號看得到 P-A ITR 連到的 P-B NOI | admin 也看不到；另外新增同專案、不同承包商的情境，保留原本的意圖 | G5 |
| 6 | `test_noi_audit_delete_update_http` 的兩處 next-reference | 由「沒綁專案的一般帳號」查詢，看得到號碼 | 改由 admin（noi_admin）查詢，斷言不變 | D6 |
| 7 | 「看得到全部」的情境改由 admin 帳號執行 | — | workflow_project_filter（dt_admin）、scope_instance_contractor（scU）、audit export／void_lock（login_admin）、materials（role 改名為 admin）。斷言不變 | D6：只有管理者不受限 |

## 執行證據
- **後端全套**（基準 15612688 加上本批，本機 Python 3.14）：2599 passed、20 failed、3 skipped，耗時 50 分 52 秒。
  - 20 項失敗全部在 `test_refusal_codes_http.py`。這個檔是 REFUSAL 前推時新進來的，失敗原因和其他檔相同：沒綁專案的帳號，加上沒有專案的測試資料。
  - 修正後這個檔單獨重跑：28 passed、0 failed。
  - 全套開跑後，只再改過這個測試檔和前端的 ProjectSelector 樣式，後端產品程式沒有再動。
  - 3.11 全套由協調中心在部署前執行。
- **第一輪全套**（測試修正前，基準 07248220 加上本批）：975 failed、1600 passed、3 skipped，耗時 56 分鐘，全部都是本節說明的同一個原因。
- **分組實測**（全部 0 failed）：

| 範圍 | 結果 |
|---|---|
| 本工作階段處理的檔案 | IAM 五檔 338 passed；attachment 兩檔 434 passed；denv 共 11 檔 341 passed；itp_checklist_km 34；itr_approval_authority 8；scope_isolation 16；workflow_photo_evidence 27；新測試 16 |
| Audit 組（代理） | 195 passed |
| NOI·會議·材料組（代理） | 177 passed |
| ITR·Checklist 組（代理） | 352 passed |

- **前端**：
  - `npx tsc --noEmit`：0 錯誤。App.tsx 同時有 ProjectGate 和 RefusalDialog，仍可通過。
  - eslint（改動的元件）：0 問題。
  - `npm test`：185 pass、0 fail。
- **重現測試**（範圍追加 10–12）：
  - jti：`test_two_sign_ins_in_the_same_second_get_distinct_tokens…`、`test_a_token_issued_before_jti_existed_is_still_accepted`（沒有 jti 的舊 token 仍然可用）。
  - KM 圖片：`test_a_project_member_with_km_view_sees_km_article_images`，以及上表第 4 項。
  - IAM 檢查順序：既有的 `test_last_admin_rule_itself_still_refuses_a_demotion_when_reached_directly`；修正前會被專案檢查搶先擋下。
- **隔離環境瀏覽器實測**：
  - 環境：`isolated_stack.py`，8294／3294，種子為 `seed_ref_project_seq_b1_review.py`，專案有 Hailong 和 TECO。
  - pm_multi（綁 2 個專案）：登入後出現「選擇要進入的專案」頁；選 TECO 後，NCR 清單只有 NCR-TECO-REVIEW；右上角唯讀顯示「目前專案：TECO TECO Substation」；在瀏覽器直接請求 `/api/ncr/?project_id=B1-HL` 也回 0 筆。
  - 登出：`qualitas_current_project` 已清除。
  - pm_none（沒綁專案）：顯示「非專案人員」畫面；請求 `/api/ncr/` 回 200 但 0 筆。
  - pm_single（綁 1 個專案）：直接進入 Hailong，OBS 清單只有 OBS-HL-REVIEW。
  - admin：專案選單有所有專案、Hailong、TECO 三個選項，NCR 兩筆都看得到。
  - 實測時修正：非管理者右上角的「目前專案：」原本會被截斷，已改成不截斷，專案名稱太長時才截斷（ProjectSelector 的 module.css 加上 currentPrefix）。tsc 0、eslint 0。
- **使用者預覽**：還沒請使用者看。

## R1 之後的修正
細節見 REVIEW。
- **P1-1**：只有名稱為 admin 的角色不受限，規則和 IAM 一致（core/scope.py、UserModal.tsx）。
- **P2-1**：第 25 步不再移動 Checklist 裸範本（D9）。
- **P3-1**：第 25 步只更新查出來的那些 id。
- **P3-3**：IAM 範圍區塊的標示改正。
- **P3-4**：補上「選專案後舊 token 失效」的回歸測試。
- **測試**：新增或調整的測試 3 項：test_ref_project_seq_b1_http 新增 2 項並擴充遷移測試，test_ncr_close_permission_http 的 dt_adminish 綁專案。和 test_iam_admin_role_boundary 合起來共 137 passed。
- **前端**：tsc 0、eslint 0、npm test 185 pass。
- **後端全套**（R1 修正後，基準 15612688 加上本批，本機 Python 3.14）：**2621 passed、3 skipped、0 failed，exit 0**，耗時 48 分 30 秒。紀錄在 `REF-PROJECT-SEQ-2026-001-B1-evidence/backend-full-suite-after-r1.txt`。

## 合併 89c5ac08 後的驗證
- 協調中心用 merge-file 合併 OBS-PRINT 和 OBS-ATTACH-LOCK，共 6 個重疊檔：db_migrations.py、schemas.py、3 個測試檔、DECISIONS.md。0 衝突，CRLF 保留。
- 確認：第 25 步仍是最後一步；file_router 本批那一段沒變。
- **後端全套**（本機 Python 3.14）：**2692 passed、3 skipped、0 failed，exit 0**，耗時 48 分 37 秒。紀錄在 `REF-PROJECT-SEQ-2026-001-B1-evidence/backend-full-suite-on-89c5ac08.txt`。
- **前端**：tsc 0；npm test 197 pass、0 fail。

## 上線影響
- **正式站**（協調中心唯讀查詢）：專案 1 筆（Hailong，HL）；啟用中的帳號只有 1 個 ADMIN；user_projects 是空的。**沒有任何啟用中的非管理者會因為 D6 突然看不到資料。** 第 25 步會把約 16 筆沒有專案的單據歸到 Hailong；ITP 144 筆不動。
- **已知限制，在第 2 批上線前有效**：
  - 限定專案的帳號看不到沒有專案的**共用 ITP 範本**和 **Checklist 裸範本**（D10、D9 屬於第 2 批）。
  - **第 2 批上線前，不能建立非管理者帳號**，因為建了也看不到範本、無法建立 NOI。協調中心會在上線時告知使用者。
- **登入相容性**：
  - 沒有 jti 的舊 token 仍然可用。
  - 綁多個專案的非管理者，上線後原本的 session 會進入「選擇專案」畫面。正式站目前沒有這種帳號。
- **R1 P3-2**：第 25 步執行之後、第 2 批上線之前，管理者在「所有專案」下建立的單據仍然沒有專案，而且不會再被自動歸類。第 2 批需要再歸類一次，或者讓新建單據一律必須有專案（G1）。
- **R1 P3-6**：用同一個 token 同時送出兩次選專案的請求，可能拿到兩個不同專案的 token。兩個都是本人綁定的專案，可以接受。
- **KM（R1 P3-5，請協調中心向使用者說明）**：KM API 本身不分範圍，非專案人員透過 API 仍然讀得到 KM，這是既有行為，不屬於 D6 的範圍；在畫面上，ProjectGate 會整個擋下。請審查員判斷是否需要另外處理。

## 其他
- 舊的 `QTS-RKS-HL-*` 號碼和新編號都屬於第 3 批，本批不動編號。
- 「81 筆外部號要不要複製到原始文件號」：使用者尚未回答，本批不涉及。

## 測試修改明細
### 本工作階段
- `test_refusal_codes_http.py`（REFUSAL 的測試檔）：
  - deleter、nobody 綁 P-TEST；
  - `_add` 寫入的單據如果沒有專案，就放進 P-TEST（Project 列本身除外）；
  - 斷言全部不變；ROLE_ADMIN_PROTECTED 仍然是由非管理者觸發。
- `test_itr_revoke_approval_acceptance.py`：只改 `Env.login`，加上 project 參數和 `default_projects`。seed 的部分由 ITR 組代理修改，見下方。
- `test_attachment_authorization_http.py`：
  - 權限矩陣的 6 個帳號綁 P-A。
  - sV 綁 P-A、P-B（`default_projects` 設為 P-A）；`legitimate…` 上傳 ncr-b 時選 P-B。
- `test_attachment_hardening_http.py`：見上表第 4 項。
- `test_iam_user_security_http.py`：
  - seed 新增專案 P-IAM，非管理者帳號綁 P-IAM；
  - `_new_user_body` 建立非管理者時帶 project_ids；
  - audit 斷言加上 project_ids（上表第 3 項）。
- `test_iam_admin_takeover_http.py`：上表第 2 項。
- `test_user_service.py`：create_user 帶 project_ids，並用 mock 回傳專案查詢結果。
- `test_date_write_guard_http.py`（denv）：
  - dt_* 帳號綁 P-A；
  - 新增 dt_admin（角色名稱 admin）；
  - `_add_row` 預設 project_id 為 P-A。
- `test_workflow_project_filter_http.py`：「看得到全部」的部分改由 dt_admin 執行。
- `test_workflow_photo_evidence_http.py`：NOI、ITR 加上 project_id 為 P-A。
- `test_itp_checklist_km_project_audit_http.py`：audit-writer2 綁 P-TEST。
- `test_itr_approval_authority_http.py`：editor、approver 綁 P-TEST；範本放進 P-TEST（共用範本的可見性屬於第 2 批）。
- `test_scope_isolation.py`：上表第 1 項。
### Audit 組（代理回報，8 檔 195 passed／0 failed；修改前 132 failed／63 passed）
- test_audit_hardening_http（harness，33）：
  - auditor 用 bind 綁到 P-TEST；
  - insert_raw 寫入的舊資料預設 project_id=P-TEST；
  - 新增 login_admin：角色名稱 admin，權限與 auditor 相同。
- test_audit_agenda_http（11）：未修改，harness 改好後通過。
- test_audit_contractor_scope_http（2）：承包商帳號綁 P-TEST（D8）；測試重點「編號和名稱用帳號自己的承包商」不變。
- test_audit_export_docx_http：
  - add_user 加上 projects 參數；
  - whole_report：稽核建在 auditor 的專案，並把該專案命名為 [HL] Harbour Line，斷言不變；
  - legacy_rows：刻意使用 project_id=None 的舊資料，改用 login_admin 匯出（D6）；
  - contractor／project-scoped：承包商帳號綁 P-TEST；p2 的資料改用 insert_raw 寫入；被擋的理由仍是「別家承包商」或「其他專案」。
- test_audit_void_lock_http（5）：把稽核從 p1 移到 p2 的測試改用 login_admin，因為只有不受限的帳號能跨專案搬移。
- test_reviewed_audit_paths_http（harness，36）：audit-writer 綁 P-TEST；403 仍然來自權限檢查。
- test_active_assignee_http（11）：test_scope_precedes_assignee_check 原本是替帳號加綁專案，改成把紀錄移到 own 專案。原因是 token 選定的專案固定（D5／D20），登入後加綁不會改變這次的範圍。404 的理由仍是「範圍檢查先於指派對象檢查」。
- test_remaining_audit_paths_http（82）：PQP、OBS、OSD、FAT 的 seed 資料補上 project_id。
- 斷言意義改變：無。改了操作帳號或資料建立方式的測試共 4 項（同上）。
### NOI／會議記錄／材料組（代理回報，14 檔 177 passed／0 failed；修改前 114 failed／63 passed）
- test_noi_create_atomic_http（harness noi_env，16）：
  - noi_a、noi_b、noi_view 綁 P-A；
  - 新增 noi_admin（角色名稱 admin，權限與 NoiUser 相同）；
  - noi_view 的 403 仍然來自沒有建立權限。
- test_noi_audit_delete_update_http：
  - 「不受限的呼叫者看得到下一個號碼」這兩處改由 noi_admin 呼叫（D6／#8：綁了專案的帳號就是限定專案，只會拿到遮罩格式）；
  - _project_only_user、noi_scoped、noi_view 三種情境原意不變。
- test_noi_qworkflow_backfill_rule_http：_thread 直接寫入的 ITR、NCR 加上 project_id=P-A，與 NOI 同專案。
- test_meeting_minutes_rev_http（harness）、test_meeting_minutes_export_docx_http：
  - mtg_a 和 add_user 建立的帳號綁 P-TEST；
  - 結果的理由不變：沒有檢視權限→403、別家承包商→404、同承包商→200。
- test_material_submittals_http（27）、test_materials_http（17）：
  - 使用者 admin 的角色改名為 admin，讓它不受限（權限不變）；
  - manager、viewer、nobody、legacy 綁 P1；
  - 被擋的理由不變：權限不足、承包商帳號不能使用、P2 不在範圍內。
- test_material_schema_migration（27）：舊資料庫種子的 ncr-old 設 project_id=old-p。原因是避開 B1 第 25 步遷移；「材料遷移不動既有資料」的嚴格比對照樣保留。
- test_seeder_permission_persistence（4）：管理腳本先建立 P-SEED，建立使用者時帶 project_ids；建立的 ITR 加上 project_id；Reopen 的 403 仍然只取決於 close 權限。
- test_docx_path_guard_http（2）：editor 綁 P-A。
- test_audit_templates_http（11）：auditor、manager 綁 P-TEST。
- 未修改、靠共用夾具修好：test_noi_contractor_lock_http、test_noi_delete_http、test_meeting_minutes_carry_forward_http。
- 斷言意義改變：只有一類，即上述 next-reference 的兩處改由 admin 呼叫（D6）。
### ITR／Checklist 組（代理回報，15 檔 352 passed／0 failed）
- test_itr_revoke_approval_acceptance（harness seed，12）：
  - acc_editor、acc_approver、acc_closer 綁 P-TEST；
  - _mk_itr 新增參數 project_id，預設 P-TEST；
  - Env.login 不變。
- test_itr_approval_events_http（27）：acc_approver2 綁 P-TEST。
- test_itr_write_paths_atomic_http（27）、test_itr_state_protection_http（25）：acc_full 綁 P-TEST。
- test_scope_instance_contractor_http（36）：
  - 新增 scU（角色名稱 admin，權限複製 AcceptEditor）；
  - 原本扮演「不受限」的 acc_editor 全部改由 scU 執行（D6）；
  - nobody 綁 P-A，讓 403 只來自權限；
  - scA、scP 等的 NULL 擁有者 404，理由不變。
- test_itr_approval_history_api_http（9）：hist* 帳號綁 P-TEST，404／403 的理由（承包商／權限）不變。
- test_itr_integrity_guards_http（32）：
  - _noi、_ncr 預設放在 P-TEST，OBS 補上 project_id；
  - delete 被拒的理由回到原本的「被引用」（改之前因為沒專案，變成被「範圍外」擋下）。
- test_itr_checklist_http_e2e（4）：editor、approver 綁 P-TEST。
- 未修改、靠共用夾具修好：test_checklist_pass_integrity_http（47）、test_checklist_status_rule_http（73）、test_checklist_na_reason_http（17）、test_checklist_reopen_http（4）、test_itr_history_preservation_http（14）。
- 斷言意義改變（1 處，G5）：test_itr_integrity_guards_http::test_the_related_graph_hides_records_outside_the_callers_scope
  - 原本：不受限的帳號看得到 P-A ITR 連到的 P-B NOI。
  - 現在：admin 也看不到，因為關聯文件只顯示 root 記錄所在專案的資料。
  - 原意保留：新增同專案、不同承包商的 NOI，scA 看不到、scU 看得到。
