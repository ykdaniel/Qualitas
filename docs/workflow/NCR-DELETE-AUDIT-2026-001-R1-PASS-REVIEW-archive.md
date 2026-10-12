# NCR-DELETE-AUDIT-2026-001 — REVIEW

TASK_ID: NCR-DELETE-AUDIT-2026-001
ROUND: R1
審查者：獨立 Claude 審查 subagent（新開的 context，只依證據和自己實際跑的結果判定）
審查對象：工作樹 `.claude/worktrees/angry-newton-4cae58`，基準 HEAD `33b8a1ce`，未提交的 4 個檔案。
- `evidence/R1.patch` 和目前的工作樹差異（含新測試檔）逐行比對過，除了 `index` 行以外完全相同。
- SHA-256 與 `patch-sha256.txt` 一致。

## 結論：**PASS**

缺陷確實修好了：
- 刪除和稽核紀錄在同一筆交易裡，只 commit 一次，稽核用 strict。
- 每一條失敗路徑都會 rollback。
- 上鎖後重新讀取，才做 Void 和 ITR 檢查。
- 兩個拒絕訊息和原本逐字相同。
- 新增的 HTTP 測試在舊程式失敗、在新程式通過（我自己重跑過）。

沒有必改項目。

## 必改
（無）

## 建議（不影響本輪 PASS）
1. **上鎖後沒有再檢查範圍。**
   - 目前的順序是：先讀取、檢查範圍 → 上鎖 → `reload_locked`。重新讀到的列如果剛被別人改了 `project_id` 或 `vendor_id`，不會再判斷一次是否在範圍內。
   - `update_ncr` 是先上鎖再讀、再判斷範圍。
   - 實際影響很小：必須剛好有人在這一瞬間把一張 Void 的 NCR 搬到別的專案或廠商。NOI 的修正也是同樣的順序。
   - 建議：在 `reload_locked` 之後加一行 `if not record_in_scope(db_ncr, scope): rollback; return False`，成本很低。可以和 NOI 一起處理。
2. **PostgreSQL 上的效果有限。**
   - 在 PG 上，`lock_ncr_for_write` 是對 NCR 列加 `FOR UPDATE`，只能和其他也鎖這張 NCR 的寫入（`update_ncr`、`file_router.delete_file`）互相排隊。
   - 新增或修改 ITR 時並不會鎖 NCR 列。所以「並行、還沒提交的 ITR 引用」在 PG 上仍然擋不住；已經提交的 ITR，在 READ COMMITTED 下會被計數查詢看到。
   - 這仍然比 NOI 的 `begin_write_transaction`（在 PG 上什麼都不做）好，所以選 `lock_ncr_for_write` 是合理的。
   - 但程式註解「an ITR citing it saved a moment ago is seen」只在 SQLite（整個資料庫只有一個寫入者）上完全成立。建議日後在註解或 DECISIONS 裡註明。STATUS 已經寫明「未在 PostgreSQL 上測試」。
3. **ITR 競態測試的強度。**
   - `test_an_itr_citing_the_ncr_saved_just_before_the_lock_is_counted` 驗證的是「上鎖在 ITR 計數之前」這個順序；在舊程式上，它只因為 `ran == []` 而失敗。
   - 我做了突變測試：把 `lock_ncr_for_write` 移到檢查之後，這個測試確實會失敗。所以它有意義。
   - 但它不能證明「重新讀取」對 ITR 那條路徑有作用，因為計數本來就是新的查詢。「重新讀取」由另一個測試（NCR 被別的請求先刪掉）證明。
   - Void 是單向的終點狀態，所以狀態在上鎖前改變只會造成「誤擋」，不會造成「誤刪」。不需要另外補測試。
4. STATUS 的「全套測試」還寫著「執行中，完成後補上」，RESULT 也還沒勾。建議補上實際數字，或者改寫成「未執行全套」，再交給協調中心。
5. 前端的 `NCR.tsx` `handleDelete`（第 247 行）沒有 try/catch，STATUS 已經列出來了。現在拒絕改回 400，並帶有清楚的 `detail`。建議下一輪讓前端顯示這個訊息並關閉對話框；這不在本輪範圍。
6. Router 的 `except ValueError` 範圍：
   - 我逐一看過 `delete_ncr` 的 try 區塊裡，會拋出 ValueError 的只有那兩個業務拒絕。
   - `log_audit` 的 `json.dumps(old_val)`：NCR 的欄位都是 String、Text、Boolean 或 Integer，不會出錯。
   - SQLAlchemy／DBAPI 的錯誤都不是 ValueError。
   - 理論上唯一的例外是 path 參數裡有無法編碼的 surrogate 字元（UnicodeEncodeError 是 ValueError 的子類別）。這種情況會變成 400，而不是 500，影響可以忽略，也不算錯。

## 逐項核對（任務要求的檢查點）
1. **正確性**
   - **只 commit 一次**：`db.delete` → `log_audit(strict=True)` → `flush` → `commit`。repository 的 `delete()`（第 125–133 行，`db.delete` 加上 `commit`）不再被呼叫。刪除的語意和以前相同：都是 ORM 的 `db.delete`；NCR 沒有往下串的 relationship，也沒有其他資料表用外鍵參照 `ncr.id`。
   - **rollback**：ValueError 和其他 Exception 兩個分支都會 rollback。
   - **提早 return 的路徑**：
     - 找不到或不在範圍內：發生在上鎖之前，只做過讀取。SQLite 沒有拿到寫入鎖，session 由 `get_db` 關閉。
     - 上鎖後發現紀錄已被刪掉：先 rollback 再 return False。
     - 沒有遺留的鎖或交易。
   - **拒絕訊息**：Void-only 和被 ITR 引用兩則訊息，和 HEAD 逐字相同；HTTP 測試以完全相等的方式斷言。
   - **`UPDATE ncr SET id = id`**：
     - 全專案沒有任何 `CREATE TRIGGER`。
     - `models.py` 沒有 `onupdate` 欄位；就算有，原始 SQL 的 `text()` UPDATE 也不會觸發 ORM 的 onupdate 或 mapper 事件。
     - 沒有其他資料表用外鍵參照 `ncr.id`，所以和外鍵動作無關。
     - 這個 helper 原本就被 `update_ncr` 和 `file_router.delete_file` 使用。
     - 沒有問題。
   - `reload_locked` 會吃掉 `InvalidRequestError`（包含 ObjectDeletedError），在 PG 上 `FOR UPDATE` 查不到列的情況也一樣能正確回 404。
2. **Router**
   - ValueError → 400，`detail=str(e)`。
   - 404、權限（`RoleChecker(NCR_DELETE)`）、範圍（`get_scope` 加上 `record_in_scope`）的行為都不變；HTTP 測試裡的 403、範圍外 404、不存在 404 都通過。
   - 其他可能的 ValueError 來源見建議 6。
3. **測試**
   - 在舊程式失敗、在新程式通過，實測結果見下方。
   - 突變測試：
     - 拿掉 `reload_locked` → 「被別人先刪掉」的測試失敗（1 failed）。
     - 把上鎖移到檢查之後 → ITR 競態測試和被刪測試都失敗（2 failed）。
     - 兩個競態測試都有意義。
   - **汙染**：
     - `_just_before_the_lock` 用 `monkeypatch.setattr`，測試結束時 pytest 會自動還原。
     - 故障注入沿用 `_inject`；flush 那種的 `event.listen`，會在 `finally` 裡用 `undo()` 移除，並呼叫 `monkeypatch.undo()`。`denv` 本身沒有用 monkeypatch，所以中途 undo 不影響這個 fixture。
     - 連同相同 harness 的檔案，換順序重跑 3 次，都全數通過，沒有不穩定的情形。
4. **行尾**
   - `ncr_service.py`：CRLF 820 行、單獨 LF 0 行（HEAD 是 807／0）。
   - `git diff --stat`：+18／−5，沒有整檔翻轉。
   - 其餘 3 個檔案是 LF，和 HEAD 一致。

## 審查者已驗證（實際執行，Python 3.14.6；每次都設拋棄式 `DATABASE_URL=sqlite:///$TMPDIR/rv_*.db`，沒有 import `main`，沒有碰 `backend/qualitas.db` 或任何連接埠）
| # | 內容 | 結果 |
|---|---|---|
| 1 | 新程式：`test_ncr_audit_delete_http.py` + `test_ncr_service.py` | **24 passed** |
| 2 | 舊程式：`$TMPDIR` 複製一份 backend（排除 `*.db`），服務和路由換回 `git show HEAD:...`，跑新的 HTTP 測試檔 | **12 failed、1 passed**（和 `old-code-run.txt` 相同；通過的是 403／404 那一個） |
| 3 | 舊服務 + 新路由：新 HTTP 測試檔 + `test_ncr_service.py` | **8 failed、16 passed**：HTTP 7 個失敗，成功案例 `0 == 1`，也就是沒有稽核紀錄；另外 mock 測試 `test_delete_ncr_success` 失敗。和 `old-service-new-router-run.txt` 的 7 failed／6 passed 一致 |
| 4 | 突變 m1（拿掉 `reload_locked` 區塊） | 1 failed、12 passed |
| 5 | 突變 m2（上鎖移到 Void／ITR 檢查之後） | 2 failed、11 passed |
| 6 | `tests/test_ncr_*.py`、`test_scope_isolation.py`、`test_integration_real_db.py`、`tests/test_audit*.py`、`test_remaining_audit_paths_http.py`、`test_reviewed_audit_paths_http.py`、`test_iam_role_audit_http.py`、`test_itp_checklist_km_project_audit_http.py` | **481 passed、0 failed** |
| 7 | `test_ncr_audit_delete_http` + `test_ncr_audit_atomic_http` + `test_date_write_guard_http`，重跑 2 次；再加上 `test_ncr_service` 和 `test_ncr_router`，換順序跑 1 次 | 202 passed ×2；216 passed |
| 8 | `file` 和位元組計數檢查行尾、`git diff --stat`、R1.patch 與工作樹比對、patch SHA-256 | 都一致 |

**未驗證**：
- PostgreSQL 上的 `FOR UPDATE` 路徑。
- Python 3.11。
- 全部後端測試（只跑了上面列出、和 NCR／稽核相關的檔案）。
- 前端。
