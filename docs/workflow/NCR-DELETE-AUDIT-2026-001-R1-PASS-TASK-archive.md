# NCR-DELETE-AUDIT-2026-001 — TASK（NCR 刪除的稽核紀錄遺失）

TASK_ID: NCR-DELETE-AUDIT-2026-001
ROUND: R1
SOURCE: 使用者 2026-10-12 直接交辦（工作階段 worktree `angry-newton-4cae58`，分支 `claude/angry-newton-4cae58`，基準 `33b8a1ce`）。

## 缺陷
`backend/services/ncr_service.py` 的 `delete_ncr` 先呼叫 `self.repo.delete(db_ncr)`（repository 的 delete() 自己就會 commit），之後才呼叫非 strict 的 `log_audit(..., "DELETE", "NCR", ...)`。這筆稽核紀錄之後沒有任何 commit，請求結束時被丟掉：**NCR 刪除從來沒有寫進 `audit_logs`**。

NOI 的同一個缺陷已在 NOI-DEFECTS-2026-001（2026-10-12，主 checkout 尚未提交）修正；NCR 的新增和修改早在 2026-09-21 就改成同一筆交易（`tests/test_ncr_audit_atomic_http.py`）。

## 範圍
1. `delete_ncr` 套用 NOI 的做法：
   - 先取得寫入鎖，重新讀取 NCR，再做檢查；
   - 用 `self.repo.db.delete(obj)` 刪除；
   - `log_audit(..., strict=True)`，flush，**只 commit 一次**；
   - ValueError 和其他例外都 rollback。
2. 保留既有規則和訊息：
   - 只有 Void 的 NCR 可以刪除；
   - 被 ITR 引用時拒絕刪除。
3. 新增 HTTP 測試，必須在舊程式失敗、在新程式通過。
4. 更新斷言 `repo.delete` 被呼叫的 mock 單元測試。

## 限制
- `ncr_service.py` 是 CRLF，要保留行尾（以二進位模式改寫，用 `file` 檢查）。
- 測試只用暫時的 SQLite 和拋棄式 `DATABASE_URL`；不碰 `backend/qualitas.db`，也不碰使用者的 8198／3198、8240／3240。
- 依 `docs/workflow/COORDINATION.md`：推送和部署由協調中心「登入測試」處理。
- 未經使用者指示，不 commit、不 push、不部署。
