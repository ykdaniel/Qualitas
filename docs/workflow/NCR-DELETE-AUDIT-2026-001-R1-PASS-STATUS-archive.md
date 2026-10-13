# NCR-DELETE-AUDIT-2026-001 — STATUS（R1，待審查）

TASK_ID: NCR-DELETE-AUDIT-2026-001
ROUND: R1
- 基準 HEAD `33b8a1ce`；工作樹 `.claude/worktrees/angry-newton-4cae58`（分支 `claude/angry-newton-4cae58`）。不是主 checkout。
- 差異：`NCR-DELETE-AUDIT-2026-001-evidence/R1.patch`（SHA-256 見 `patch-sha256.txt`）。
- 只動 4 個檔案，都是本任務的修改。主 checkout 對這 4 個檔案沒有未提交的修改（2026-10-12 以 `git status` 核對）。
- **尚未提交、推送或部署。**

## RESULT
- [x] 獨立 Claude 審查 **PASS**，無必改（見 REVIEW.md；GPT 審查暫停，依 COORDINATION 規則 6）
- [ ] 已提交（等使用者指示）

## 修改
| 檔案 | 內容 |
|---|---|
| `backend/services/ncr_service.py`（CRLF，已保留） | `delete_ncr`：<br>• 先讀取並檢查範圍（不在範圍內不上鎖，直接 404）。<br>• 之後依序：`lock_ncr_for_write` → `reload_locked` 重新讀取 → Void 檢查 → ITR 引用檢查。紀錄已被別的請求刪掉時，rollback 後回 404。<br>• `self.repo.db.delete` → `log_audit(strict=True)` → flush → 只 commit 一次。<br>• ValueError（預期中的拒絕）rollback 後原樣拋出，不記錯誤日誌；其他例外 rollback，記錄錯誤後拋出。<br>• 匯入 `reload_locked`。 |
| `backend/routers/ncr.py`（LF） | DELETE 路由把 `ValueError` 轉成 **400**，`detail` 保留原訊息。之前沒有這個轉換，兩種拒絕都以 500 傳出（正式站只顯示 "Internal Server Error"）。NOI 的路由已有相同轉換。 |
| `backend/tests/test_ncr_service.py`（LF） | `test_delete_ncr_success`：改為斷言以下各點：<br>• `db.delete(obj)` 被呼叫；<br>• `repo.delete` 沒被呼叫；<br>• commit 一次；<br>• `strict=True`。<br>兩個拒絕測試另外斷言 `db.delete` 和 `commit` 都沒被呼叫。 |
| `backend/tests/test_ncr_audit_delete_http.py`（新） | 13 個 HTTP 測試，使用 `denv`、真實登入和路由，每次資料庫斷言都開新的 Session：<br>• 成功：1 筆 DELETE 稽核紀錄，包含 entity_name、user_id、username，`old` 是被刪的那一列。<br>• 非 Void（4 種狀態）、被 ITR 引用：回 400，訊息與原本完全相同，資料和稽核都不變。<br>• 權限 403、範圍外 404、不存在 404：都不寫入任何東西。<br>• 故障注入（construction／audit-object／flush／commit，沿用 `test_ncr_audit_atomic_http` 的 `_inject`）：NCR 仍在、沒有 DELETE 紀錄；之後同一個刪除可以成功，並且剛好 1 筆稽核紀錄。<br>• 上鎖前一刻有 ITR 引用了這張 NCR：會被計入，回 400。<br>• 上鎖前一刻 NCR 被別的請求刪掉：回 404，不是 500。 |

## 和 NOI 做法的差異（刻意）
NOI 用 `begin_write_transaction`；NCR 改用同檔 `update_ncr`、`file_router.delete_file` 已在用的 `lock_ncr_for_write`：
- 在 SQLite 上，兩者都是用 no-op UPDATE 提早取得寫入鎖，效果相同。
- 在其他資料庫上，`lock_ncr_for_write` 會對該 NCR 列加 `FOR UPDATE`，和 NCR 的修改共用同一把鎖；`begin_write_transaction` 在其他資料庫上什麼都不做。

## 證據（`NCR-DELETE-AUDIT-2026-001-evidence/`）
- `line-endings.txt`：`ncr_service.py` 仍是 CRLF，其他 3 個檔案是 LF（和 HEAD 相同）；`git diff --stat` 為 +36／−11，沒有整檔行尾翻轉。
- **新程式（實測）**：`test_ncr_audit_delete_http.py` 加上 `test_ncr_service.py`，**24 passed**。
- **舊程式（實測）**：在 scratchpad 複製一份 `backend/`，把服務和路由換回 HEAD 版本，跑新的測試檔：
  - `old-code-run.txt`：12 failed、1 passed。通過的是 403／404 那一個，因為這部分的行為本來就沒變。
  - `old-service-new-router-run.txt`：舊服務配新路由，7 failed、6 passed。**稽核相關的 7 個仍然失敗**，成功案例為 "expected 1, got 0"（沒有稽核紀錄），所以失敗不是只因為 400 轉換。
- 全部後端測試：見下方「全套測試」。

## 全套測試
（執行中，完成後補上）

## 未做／未驗
- 只在暫時 SQLite 上測試，**未在 PostgreSQL 上測試** `FOR UPDATE` 那條路徑。
- 前端未修改：
  - `NCR.tsx` 的 `handleDelete` 沒有 try/catch，刪除被拒時錯誤沒有被處理，對話框也不會關閉。這和 NOI 第 3 項是同一種問題。
  - 刪除前的提示只用前端已載入的 ITR 清單判斷引用。
  - 以上不在本輪範圍，列為建議。
- 未用 Python 3.11 測試（部署前必須做，由協調中心排程）。
- 未提交、未推送、未部署。
