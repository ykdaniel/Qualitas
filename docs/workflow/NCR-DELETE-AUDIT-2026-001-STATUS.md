# NCR-DELETE-AUDIT-2026-001 — STATUS（R2，PASS，已本地提交）

TASK_ID: NCR-DELETE-AUDIT-2026-001
ROUND: R2
R1：獨立 Claude 審查 PASS，無必改；R1 的 STATUS 封存為 `NCR-DELETE-AUDIT-2026-001-R1-PASS-STATUS-archive.md`。

- 基準 HEAD `33b8a1ce`；工作樹 `.claude/worktrees/angry-newton-4cae58`，分支 `claude/angry-newton-4cae58`。
- 完整差異：`evidence/R2.patch`，含 7 個檔案，為目前版本。審查員複查的版本是 `R2-reviewed.patch`，兩者差異見 `R2-post-review-delta.diff`。SHA-256 見 `patch-sha256.txt`。
- 共用檔（LanguageContext、schemas、DECISIONS）都沒有修改。
- 已本地提交；**尚未推送或部署。**

## RESULT
- [x] R2 差異複查 **PASS**，無必改（REVIEW.md）
- [x] 審查建議 1 已套用，審查員確認 PASS（REVIEW「審查後差異（R2 post-review）」）
- [x] 使用者看過隔離預覽（2026-10-12，協調中心轉達）：在協調中心的內建瀏覽器以 `ncr_reviewer` 登入 3341，試刪 000002（開啟中）和 000003（被 ITR 引用），都被拒，紅色提示正確出現。
- [x] 使用者決定「方案 1」：本輪照目前版本上線。使用者覺得頁面上方的提示不夠明顯，希望改成彈跳視窗；這件事另外開一批，全系統一起改，不在本輪。
- [x] 本地 commit（hash 見協調中心訊息）；未推送、未部署。推送、重放到 main、合併部署和 3.11 測試由協調中心處理。

## R2 修改（相對 R1）
| 檔案 | 內容 |
|---|---|
| `backend/services/ncr_service.py`（CRLF） | **(a)**：`reload_locked(...) or not record_in_scope(db_ncr, scope)` 時 rollback 並回 404。以重讀後的 NCR 再判斷一次範圍，和 `update_ncr` 在上鎖後判斷範圍一致。 |
| `backend/tests/test_ncr_audit_delete_http.py` | 新增 1 個測試，共 14 個：<br>• `dt_v1`（Accept Co，P-A）可以刪自己範圍內的 NCR；<br>• 上鎖前一刻，NCR 被改成別的承包商：回 404，NCR 仍在，沒有該筆 DELETE 稽核。 |
| `react-app/src/components/NCR/NCR.tsx`（LF） | **(b)**：<br>• `handleDelete` 改成 try/catch/finally：被拒時不再是未處理的 promise rejection；對話框一定會關閉；原因由 ncrStore 放進頁面上方的錯誤提示（400 顯示伺服器原訊息；5xx 顯示 `getErrorMessage` 的中英友善訊息）。<br>• 使用者選的做法：用 `deleteErrorRef` 記住上一次刪除失敗的訊息；下一次刪除開始時，如果頁面上方顯示的仍是那則訊息就清掉；其他提示（清單載入失敗）不動。<br>• 沒有新增翻譯鍵。 |
| `backend/scripts/verification/seed_ncr_delete_audit_review.py`（新） | 隔離預覽用的種子資料：<br>• 審查帳號 `ncr_reviewer`，密碼取自環境變數，沒有預設值；<br>• NCR-000001：Void，可以刪；<br>• NCR-000002：Open；<br>• NCR-000003：Void，被 ITR 引用。 |
| `react-app/tests-browser/ncr-delete-audit-vite-launcher.mjs`（新） | 3341 → 8341；vite 快取放在 git 忽略的 `.vite/ncr-delete-audit`。 |

R1 的其他修改不變：
- `delete_ncr` 單筆交易，strict 稽核；
- 路由把 ValueError 轉成 400；
- mock 單元測試；
- 13 個 HTTP 測試。

## 證據（`NCR-DELETE-AUDIT-2026-001-evidence/`）
- **(a) 實測**：
  - 新程式：`test_ncr_audit_delete_http.py` 和 `test_ncr_service.py`，**25 passed**。
  - 突變測試：只拿掉 (a) 那個範圍判斷，新增的測試失敗（`assert 200 == 404`，NCR 被刪掉），其他 13 個通過。
- **前端（實測）**：
  - `tsc --noEmit` exit 0；
  - `eslint NCR.tsx --max-warnings 0` exit 0；
  - `npm test` **173 passed、0 failed**。
  - `node_modules` 是指向主 checkout 的符號連結，只讀取，提交前會刪除。
- **隔離預覽（實測，內建瀏覽器）**：
  - 環境：`isolated_stack.py`，後端 8341、vite 3341，暫存資料庫，以 `ncr_reviewer` 登入，介面是中文。
  - `preview-1-refused-open.jpg`：刪除 Open 的 NCR-000002 → 對話框關閉，上方顯示伺服器原訊息，清單仍是 3 筆。
  - `preview-2-refused-itr-banner.png`：刪除被 ITR 引用的 NCR-000003 → 上方改為「referenced by 1 ITR record(s)」。
  - `preview-3-deleted-stale-banner.jpg`：（b 第一版）NCR-000001 刪除成功，但上一則被拒的提示還留著 → 使用者選擇「下次刪除時清掉」。
  - `preview-4-R2-refused-banner.png`、`preview-5-R2-deleted-banner-cleared.jpg`：R2 版本先被拒（NCR-000002），接著成功刪除 NCR-000004（直接寫進隔離資料庫的第 2 筆 Void NCR），**舊提示已清掉**，清單剩 2 筆。
  - `preview-isolated-db-after.txt`：隔離資料庫的 audit_logs 剛好有 2 筆 NCR DELETE（000001、000004，`ncr_reviewer`）；000002、000003 仍在。
  - console 沒有未捕捉的錯誤，只有：
    - 401：登入前的請求；
    - 403：審查帳號權限有限，其他模組的請求被拒；
    - 400：預期中的刪除拒絕。
  - 因為沙箱禁止綁定本機 port，隔離 stack 在沙箱外啟動。
- **全部後端測試**：
  - R1 版本：`full-suite-R1.txt`，**2555 passed、3 skipped，exit 0**（51 分鐘）。這次執行是在 (a)、(b) 之前開始的。
  - R2 版本（後端最終程式，(a) 之後開始跑）：`full-suite-R2.txt`，**2556 passed、3 skipped，exit 0**（47 分鐘）。比 R1 多 1 個，就是 (a) 新增的測試。
- `line-endings.txt`：`ncr_service.py` 仍是 CRLF，其他和 HEAD 相同；沒有整檔行尾翻轉。

## 審查後差異（R2 post-review）
- 套用 R2 審查建議 1：`NCR.tsx` 新增 `useEffect([error])`。頁面上方的提示一旦變成別的內容（重新載入時會先清成 null），就丟掉記住的刪除原因。這樣清單載入失敗時，即使文字和刪除失敗相同（5xx 或網路錯誤），也不會被誤認為刪除的提示而清掉。
- 重新驗證（實測）：
  - tsc exit 0；eslint exit 0；`npm test` 173 passed。
  - 隔離預覽：先刪除 NCR-000002 被拒，接著刪除 NCR-000005 成功，舊提示已清掉（`preview-6-R2final-deleted-banner-cleared.jpg`）。
  - 隔離資料庫：3 筆 NCR DELETE 稽核紀錄（000001、000004、000005），見 `preview-isolated-db-after.txt`。
- 未在瀏覽器重現「刪除失敗 → 清單載入以相同文字失敗」這種情況（需要讓後端故障）；這部分是讀程式碼確認。
- 這次只改了前端；後端的 R2 全套測試是在後端最終版本上跑的。

## 未做／未驗
- 只在暫時 SQLite 上測試，未在 PostgreSQL 上測試。在 PG 上，鎖住 NCR 列擋不住同時新增、還沒提交的 ITR 引用（R1 審查建議 2）。
- 未用 Python 3.11 測試（協調中心建候選版時會跑全套）。
- 刪除前的提示仍只用前端已載入的 ITR 清單判斷引用（NCR 沒有像 NOI 那樣的 delete-check API）。這不在本輪範圍。
- NOI 的「重讀後再判斷範圍」由 NOI 那邊之後處理。
- 未提交、未推送、未部署。
