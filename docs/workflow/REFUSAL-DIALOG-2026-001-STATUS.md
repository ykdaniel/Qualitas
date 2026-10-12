# REFUSAL-DIALOG-2026-001 STATUS

TASK_ID: REFUSAL-DIALOG-2026-001
本輪：第 1 批（共用彈跳視窗＋刪除流程）。設計 v1 由使用者 2026-10-12 選定（DESIGN 第 7 節）。
分支：`feature/refusal-dialog-b1`（worktree nostalgic-roentgen-d70ba9），基準 `07248220`（協調中心指定）。
- worktree 原本在 main 的 `33b8a1ce`，與 07248220 不能 fast-forward。33b8a1ce 的樹和 5bba6665（07248220 的祖先）完全相同，所以用一次無衝突的合併 `6854ce95` 對齊；合併後的樹與 07248220 完全相同（`git diff 07248220` 為空）。
- 本批的提交都疊在 6854ce95 之上，重放時只取本批的提交即可。

## 本輪實際修改

### 後端
| 檔案 | 修改 |
|---|---|
| `core/refusals.py`（新） | `Refusal(ValueError)`（code、params、英文訊息）、`RefusalHTTPException`、`refusal_http()`、`permission_denied()`、`refusal_exception_handler` |
| `main.py` | 只加一行 `add_exception_handler(RefusalHTTPException, …)`；回應 `{detail, code, params}` |
| `core/dependencies.py` | 只改 `RoleChecker`／`AnyPermissionChecker` 的 403 為 `permission_denied`（同一段英文＋`PERMISSION_DENIED`）。**沒有碰 scope 相關程式** |
| `core/validators.py` | `check_references_before_delete`、`check_noi_references` 改丟 `DELETE_REFERENCED`（新 helper `delete_referenced`）；英文訊息不變 |
| `core/attachment_access.py` | 新 `lock_refusal()`（文字＋params），`lock_reason()` 改呼叫它，回傳值不變；附件權限 403 改 `permission_denied` |
| `routers/file_router.py` | 只有**刪除附件**的 409 帶 `ATTACHMENT_LOCKED`（上傳的 409 不動，屬第 2 批） |
| `services/ncr_service.py` | 刪除：`DELETE_NOT_VOID`、`DELETE_REFERENCED`（被 ITR 引用） |
| `services/itr_service.py` | 刪除 6 種＋移除 Checklist 2 種代碼 |
| `services/checklist_service.py` | `CHECKLIST_DELETE_ITR_OWNED`、`CHECKLIST_DELETE_HAS_EVIDENCE` |
| `services/audit_service.py`、`meeting_minutes_service.py`、`followup_service.py` | `DELETE_NOT_VOID`（會議記錄的 `allowed` 含 Draft） |
| `services/contractor_service.py` | `CONTRACTOR_DELETE_HAS_PERSONNEL` |
| `services/user_service.py` | 刪除角色：`ROLE_ADMIN_PROTECTED`（403）、被使用者引用改 `refusal_http` |
| `routers/ncr.py`、`noi.py`、`itr.py`、`checklist.py`、`audit.py`、`meeting_minutes.py`、`followup.py`、`contractors.py` | 只有刪除路由（itr 另含移除 Checklist）的 `HTTPException(400, str(e))` 改 `refusal_http(e)` |
| **`routers/itp.py`、`routers/projects.py`** | **修正既有 500**：刪除被引用時 ValueError 沒有被接住，變成 500。現在回 400＋`DELETE_REFERENCED` |
| `tests/test_refusal_codes_http.py`（新） | 26 個 HTTP 測試 |
| `scripts/verification/seed_refusal_dialog_review.py`（新） | 隔離環境種子；密碼只讀環境變數 `REFUSAL_REVIEW_PASSWORD` |

英文 `detail` 全部和原本一字不差（測試逐字比對 NCR、ITP、專案、承包商、Admin 角色、附件、權限的訊息）。沒有加白名單或改 schema；`schemas.py`、`DECISIONS.md` 沒動。

### 前端
| 檔案 | 修改 |
|---|---|
| `utils/refusal.ts`（新） | `describeRefusal(error, t, action, language)`、`describeCoded()`：代碼翻譯、參考清單條列、404／403／409／422／5xx／網路／401 規則 |
| `store/refusalStore.ts`（新） | `showRefusal(err, action)`、`showCodedRefusal(code, params, action)`；401 不顯示 |
| `components/Shared/RefusalDialog.tsx`＋`.module.css`（新） | portal 到 body、z-index 10000、`role=alertdialog`、焦點在「我知道了」、Esc（capture，不會關到下面的視窗）、Tab 只在視窗內、關閉後焦點回原處；點背景不關閉；列印時隱藏 |
| `App.tsx` | 只在 `<Toaster>` 旁加 `<RefusalDialog />` |
| `context/LanguageContext.tsx` | en、zh 各一段 `refusal.*`（各 59 鍵，R1 後各 60 鍵，緊接在 `saveFlow.conflict` 之後）；CRLF 保留 |
| 15 個 store 的 delete 動作（ncr、noi、itr、itp、pqp、obs、osd、meetingMinutes、audit、checklist、fat、contractors、project、km、followUp） | 不再寫入頁面 `error`，原樣丟出 axios 錯誤（audit、km 原本包成 `new Error(...)`，會丟失狀態碼）。**只改 delete 動作** |
| NCR、NOI、ITR、ITP、PQP、Audit、OBS、OSD、MeetingMinutes、FollowUpIssue、Contractors（承包商＋專案）、KM、RoleManagement、Checklist、FAT | 刪除失敗 → `showRefusal(err, 'delete')`；確認視窗關閉（角色的原因視窗例外，保持開啟、保留原因） |
| `NOI.tsx` | 刪除前檢查被擋 → `showCodedRefusal('DELETE_REFERENCED', …)`（原本是小提示） |
| `ITRModals.tsx` | 移除 Checklist 失敗 → 彈跳視窗（原本是英文小提示）。已事先告知使用者 ITR 前端改動 |
| `Shared/FileAttachment.tsx` | 直接刪除附件失敗 → 彈跳視窗（原本只有 console） |
| `IAM/DeleteAuditModal.tsx` | 按刪除後不再立刻清空原因；由 RoleManagement 以 `key` 重新掛載來清空 |
| `NCR.tsx` | 拿掉 `deleteErrorRef` 的繞法 |
| `tests-unit/refusal.test.ts`（新） | 11 個測試，用真正的字典；另檢查後端每個代碼在中英文都有鍵、兩種語言的 `refusal.*` 鍵一致 |
| `tests-browser/refusal-dialog-vite-launcher.mjs`（新） | 隔離預覽用 vite（8371／3371，自己的 cacheDir） |

### 設計文件更正
- DESIGN 2.1 說 ITR 移除 Checklist「重新整理失敗也被當成移除失敗」，這不正確：`refreshInstances` 會自己接住錯誤，不會拋出。所以沒有改這一點。
- DELETE_REFERENCED 中文由「仍被下列文件引用」改為「仍被下列紀錄引用」：角色的引用者是使用者，不是文件（瀏覽器實測時發現）。

## 證據

### 實測
- `tsc --noEmit`：通過。
- `eslint`（變更的檔案）：沒有新增問題。剩下的 3 個 `react-hooks/set-state-in-effect` 錯誤（MeetingMinutes:120、OBS:94、FileAttachment:79）和 5 個 unused 警告，在 07248220 的同一批檔案上本來就有（已逐一比對）。
- `npm test`（前端單元測試）：184／184 通過，含新 11 個。
- 後端 `tests/test_refusal_codes_http.py`：26 passed（Python 3.14）。
- 後端全套：`python3 -m pytest -q -p no:cacheprovider -rf tests`（Python 3.14、未設 DATABASE_URL、沙箱外執行，因為部分測試會啟動子行程）→ **2603 passed、1 skipped、0 failed**（50 分 20 秒）。這次執行開始時，後端程式已是最終版本；之後 R1 只加了 2 個測試，已另外跑過（28 passed）。
- 隔離環境瀏覽器（後端 8371、前端 3371，`isolated_stack.py`＋本批種子；中文介面，NCR 另測英文）：

| # | 入口 | 結果 |
|---|---|---|
| 1 | NCR Open | 「無法刪除」＋「NCR RFD-NCR-000001 的狀態為「Open」，請先作廢（Void）再刪除。」；焦點在「我知道了」；頁面頂部沒有橫幅、沒有小提示 |
| 1b | 同上（英文介面） | 「Cannot delete」＋「NCR RFD-NCR-000001 is "Open". Void it first, then delete it.」（截圖 01） |
| 2 | NCR 被 ITR 引用 | 條列「1 筆 ITR」 |
| 3 | NOI 刪除前檢查 | 彈跳視窗條列「1 筆 ITR」（原本是小提示） |
| 4 | ITP 被 NOI 引用 | 彈跳視窗條列「1 筆 NOI」（**原本 500**） |
| 5 | ITR Approved | ITR_DELETE_LOCKED 中文 |
| 6 | ITR 的 Checklist 有結果 | ITR_DELETE_CHECKLIST_EVIDENCE 中文 |
| 7 | ITR 視窗內移除 Checklist | ITR_UNLINK_EVIDENCE 中文，顯示在 ITR 視窗之上；按 Esc 只關彈跳視窗，ITR 視窗仍開著（截圖 02） |
| 8 | Checklist（背景先刪掉範本再按刪除） | 「這筆紀錄已不存在…」（**原本沒有任何提示**） |
| 9 | 會議記錄 Published | DELETE_NOT_VOID 的 Draft 版文字；沒有小提示 |
| 10 | Audit（Void，背景先刪） | 「這筆紀錄已不存在…」 |
| 11 | Follow-up（Void，背景先刪） | 同上 |
| 12 | 承包商有人員 | CONTRACTOR_DELETE_HAS_PERSONNEL 中文 |
| 13 | 承包商被引用 | 條列 11 類文件（截圖 03） |
| 14 | 專案被引用 | 條列「1 筆 NCR」（**原本 500 且沒有任何提示**） |
| 15 | 角色仍有使用者 | 條列「1 筆 使用者」；原因視窗保持開啟、原因保留；取消後重開為空白 |
| 16–19 | PQP、FAT、OBS、OSD（只有檢視權限的帳號） | 「您沒有執行此操作的權限（需要 pqp:delete:all）」等（FAT 原本沒有任何提示） |
| — | 點背景 | 視窗不關閉 |
| — | 375px 寬 | 視窗完整顯示、不需橫向捲動（截圖 04） |

- 截圖：`docs/workflow/REFUSAL-DIALOG-2026-001-evidence/`。

### 實測時發生的狀況
種子中的 RFD-ITR-000001 只是引用別人，沒有被引用，所以刪除測試時**真的刪掉了**（這是正確行為，只是隔離資料）。種子已改成讓它帶核准紀錄，給使用者預覽時不會再被刪掉。

### 讀碼（未實測）
- 清單載入失敗時，橫幅與「重試」不變：各 store 的 fetch 沒有改，仍寫入 `error`。
- KM 刪除失敗的路徑：沒有 KM 測試資料，沒有在瀏覽器觸發。
- 會議記錄附件的直接刪除（FileAttachment）：沒有在瀏覽器觸發。後端 `ATTACHMENT_LOCKED` 已有 HTTP 測試。
- 5xx 與網路錯誤的視窗：只有單元測試。

## R1 審查後的修正（見 REVIEW）
- `utils/refusal.ts`：參數為 null 或空字串時顯示「—」，不會留下 `{number}`；多個權限時用 `PERMISSION_DENIED.anyOf`。
- `RefusalDialog.tsx`：沒有可顯示的內容時自己關閉，不會留下看不見、但會吃掉 Esc 的視窗。
- `LanguageContext.tsx`：
  - 新增 `PERMISSION_DENIED.anyOf`（en／zh 各 1 鍵，現在各 60 鍵）。
  - ATTACHMENT_LOCKED 中文去掉多餘空格（改為「這筆…的狀態為」）、PQP 按鈕名稱改為「Publish」；ITR_DELETE_SOURCE_CITED 中文改寫。
- NCR／NOI／ITR／ITP 的刪除 catch 補 `console.error`。
- 測試：前端單元測試 185／185（加 null 參數、anyOf、代碼與參數對照表、ATTACHMENT_LOCKED 各 kind）；後端 `test_refusal_codes_http.py` 28 passed（加 NOI DELETE、main.py 有註冊 handler）。
- **延後到第 2 批**：DESIGN 3.2 第三點的橫幅統一（理由見 REVIEW S1），已記入 TASK。

## 使用者確認（2026-10-12，經協調中心轉告）
- 使用者在 3371 試刪 RFD-NCR-000001、000002，回報「都看到了」，並要求上線。
- 使用者另外的觀察（只記錄，本批不改）：NCR 清單的刪除鈕在表格最右邊，要往右捲才看得到。

## 待補
- Python 3.11 容器測試：由協調中心在合批時跑（照慣例）。
- 獨立 Claude 審查：R1 PASS with notes，已處理（REVIEW）。
- 隔離預覽：使用者已確認（見上）。
