# NCR-DELETE-AUDIT-2026-001 — REVIEW

TASK_ID: NCR-DELETE-AUDIT-2026-001
ROUND: R2（差異複查；R1 的結論見 `NCR-DELETE-AUDIT-2026-001-R1-PASS-REVIEW-archive.md`）
審查者：獨立 Claude 審查 subagent

審查對象：
- 工作樹 `.claude/worktrees/angry-newton-4cae58`，基準 HEAD `33b8a1ce`，未提交。
- `evidence/R2.patch` 共 7 個檔案；拿掉 `index` 行之後，和工作樹差異逐行相同。SHA-256 `1bf959f8…829c` 與 `patch-sha256.txt` 一致。

## 結論：**PASS**

- (a) 正確，而且新增的測試只要拿掉這個範圍判斷就會失敗。
- (b) 的邏輯符合使用者選的行為。我找到一個條件很窄的邊界情況，列在建議 1，不構成必改。
- 種子腳本只能在隔離環境執行，也沒有寫死密碼。
- 前端符合 AGENTS.md 的規則。

## 必改
（無）

## 建議（不影響 PASS）
1. **(b) 同樣文字的清單載入錯誤，可能被當成上一次刪除的錯誤清掉。**
   - 程式只用「文字相等」來判斷是不是上一次刪除的錯誤。`deleteErrorRef` 記住之後，除非下一次刪除開始，否則不會清空。
   - 以下兩種情況，刪除失敗和清單載入失敗的文字會一字不差：
     - 兩者都是同一個狀態碼的 5xx：`getErrorMessage` 對 5xx 一律回傳同一句友善訊息；
     - 兩者都是網路錯誤，訊息都是 `Network Error`。
   - 會出問題的順序：
     1. 刪除失敗，例如 502；
     2. 之後重新載入清單，可能是搜尋、「重試」或存檔後的 reload。`fetchNCRs` 先把錯誤清成 null，接著又以**相同文字**失敗；
     3. 使用者再刪另一張 NCR 時，這則「清單載入失敗」的提示會被清掉。這違反使用者選定的「清單載入失敗不受影響」。
   - 實際影響很小：只會在後端故障又剛好恢復時發生；而且清單只有在同一範圍內重新載入失敗時才保留舊資料，這時也只是提示和「重試」鈕消失。
   - 簡單的修法：加一個 effect，`useEffect(() => { if (error !== deleteErrorRef.current) deleteErrorRef.current = null; }, [error])`。
     - `fetchNCRs` 會先把錯誤清成 null，再設定新的錯誤，中間隔了一個 await，所以會經過一次 null 的 render，記錄會被清掉。
     - 刪除失敗那一次，`catch` 在 React 提交 render 之前就同步寫好 ref，effect 看到的錯誤和 ref 相等，不會誤清。
   - 要不要在 commit 前加，由協調中心或使用者決定。
2. **`ConfirmModal` 沒有傳 `pending`。** 刪除請求還在進行時，「刪除」可以再按一次，「取消」或另一列的刪除也還能操作。這是既有行為，不是本輪造成的：
   - 連按兩下的話，第一次成功之後，第二次會回 404，上方提示顯示「NCR not found」；
   - 前一次的 `finally` 會把剛開啟的另一個對話框關掉。
   - 對 ref 的影響：已逐一推演，最後留下的提示都是「最後結束的那次刪除」的訊息，結果是合理的。
   - 建議下一輪加一個 `pending` 狀態，在請求進行中鎖住按鈕。
3. 提示列的「重試」按鈕實際上是重新載入清單，不是重試刪除。按下去成功後提示會消失，等於「關閉提示」。這是既有的 UI，只提出來，不影響本輪。
4. STATUS 的「R2 全套測試：重跑中」要補上最終數字。協調中心表示自己正在跑全套，我沒有重複執行。
5. `react-app/node_modules` 這個符號連結是未追蹤的檔案。STATUS 已註明 commit 前會刪除，請記得不要把它加進提交。

## 逐項核對
**(a) 上鎖後再判斷範圍**
- 改成 `if not reload_locked(...) or not record_in_scope(db_ncr, scope): rollback; return False`。這是用重新讀到的那一列來判斷，和 `update_ncr` 在上鎖後判斷範圍一致。
- 兩種情況都會 rollback 後回 404，不會留下鎖。
- 新測試 `test_an_ncr_moved_out_of_the_callers_scope_just_before_the_lock_is_a_404_and_stays`：
  - 先證明 `dt_v1` 可以刪自己範圍內的 NCR（正面對照，回 200）；
  - 再在上鎖前一刻把 NCR 改成別的承包商：回 404，NCR 仍在，DELETE 稽核只有對照組那一筆。
- 突變測試：只拿掉這個範圍判斷，這個測試失敗（`assert 200 == 404`），其他 13 個通過。
- `ncr_service.py` 仍是 CRLF（820 行，單獨 LF 0 行）。

**(b) 前端邏輯（`NCR.tsx`）**
- `handleDelete` 改成 try/catch/finally，對話框一定會關閉；被拒時不再出現未處理的 promise rejection。
- 原因由 `ncrStore.deleteNCR` 用 `set({ error })` 放進頁面上方的提示：400 顯示伺服器原訊息；5xx 顯示友善訊息，不會露出原始錯誤。
- 刪除開始時，用 `getState()` 讀取當下的錯誤，不是 render 時的舊值；只有「仍是上一次刪除的錯誤」才清掉。
- `catch` 裡沒有 log，但錯誤已經由 store 顯示出來，不算忽略錯誤。
- `deleteErrorRef` 的 `useRef` 放在 hooks 區，在事件處理函式之前，符合元件結構順序。
- 沒有 `console.log`，也沒有新增翻譯鍵。
- 隔離預覽的截圖：
  - `preview-4`：被拒的英文原訊息出現在上方提示；
  - `preview-5`：成功刪除後提示已清掉，總量是 2。
- `preview-isolated-db-after.txt`：剛好 2 筆 DELETE 稽核，和 STATUS 的描述一致。

**種子腳本 `seed_ncr_delete_audit_review.py`**
- 必須同時有 `QUALITAS_REQUIRE_ISOLATED_DB=1` 和 `guard_if_required()`，也就是要經過 `startup_guard` 檢查資料庫、log 和上傳目錄都在隔離的根目錄內。比同類腳本只檢查「有沒有設定 `DATABASE_URL`」更嚴格。
- 密碼只從 `NCR_DELETE_REVIEW_PASSWORD` 環境變數讀取，沒有預設值。
- 權限代碼和 `core/perms.py` 一致。

**`ncr-delete-audit-vite-launcher.mjs`**
- 只用 3341 → 8341，`strictPort`。
- 快取放在 `.vite/ncr-delete-audit`，`.gitignore` 第 90 行的 `.vite/` 已忽略它（用 `git check-ignore` 確認）。
- 沒有使用規定避開的 port。

## 審查者已驗證
實際執行環境：Python 3.14.6；每次 pytest 都設拋棄式 `DATABASE_URL=sqlite:///$TMPDIR/rv2_*.db`；沒有碰 `qualitas.db`、任何連接埠，也沒有碰 8341／3341 的預覽 stack。

| # | 內容 | 結果 |
|---|---|---|
| 1 | 新程式：`test_ncr_audit_delete_http.py` + `test_ncr_service.py` | **25 passed** |
| 2 | 突變：在 `$TMPDIR` 複製一份，只拿掉 `or not record_in_scope(...)` | **1 failed（新的範圍測試）、13 passed** |
| 3 | NCR 和稽核相關：`tests/test_ncr_*.py`、`test_scope_isolation.py`、`test_integration_real_db.py`、`tests/test_audit*.py`、`test_remaining_audit_paths_http.py`、`test_reviewed_audit_paths_http.py`、`test_date_write_guard_http.py` | **603 passed、0 failed** |
| 4 | `react-app`：`npx tsc --noEmit -p .` | exit 0 |
| 5 | `npx eslint src/components/NCR/NCR.tsx --max-warnings 0` | exit 0 |
| 6 | `npm test` | **173 passed、0 failed** |
| 7 | R2.patch 與工作樹逐行比對、SHA-256、CRLF 位元組計數、`git check-ignore` | 都一致 |

**未驗證**：
- 全部後端測試（協調中心正在跑，我沒有重複）。
- PostgreSQL、Python 3.11。
- 沒有自己操作瀏覽器；前端行為只根據讀程式碼和 STATUS 附的截圖判斷。

## 審查後差異（R2 post-review）

**結論：PASS**（沒有必改）

只複查審查之後的這段差異：`evidence/R2-post-review-delta.diff`。

**比對 patch**
- `R2-reviewed.patch`（SHA `1bf959f8…829c`）和我 R2 審查時看到的內容逐行相同。
- 目前的 `R2.patch`（SHA `5a9a56da…7b439243`）和工作樹逐行相同。
- 兩者唯一的差別是 `NCR.tsx` 多了 5 行：
  ```ts
  useEffect(() => {
    if (error !== deleteErrorRef.current) deleteErrorRef.current = null;
  }, [error]);
  ```
  後端和其他檔案都沒有變動。

**效果和時序**（React 18.3.1、zustand 5.0.11）
- **刪除失敗時**，store 先 `set({ error: msg })` 再 throw，所以兩件事的先後有兩種可能，兩種結果都對：
  - **先 render**：React 在 microtask 裡 render，同步的 passive effect 執行時，ref 還是 null（`handleDelete` 一開始就設成 null），什麼都不做；接著 `catch` 把 ref 設成 msg。effect 的依賴是 `[error]`，錯誤值沒有再變，所以不會再執行，ref 保持 msg。
  - **先 catch**：effect 執行時 `error === ref`，保留。
  - 只有錯誤值真的變了，ref 才會被丟掉，這正是要的行為。
- **建議 1 的情境**：
  1. 刪除失敗，ref 記住 X；
  2. 重新載入清單，`fetchNCRs` 先把錯誤設成 null。中間隔著 `await api.get`，所以一定會有一次 null 的 render，effect 把 ref 丟掉；
  3. 載入又以相同文字 X 失敗，這時 ref 已經是 null；
  4. 下一次刪除時不會清掉這則載入失敗的提示。**已修正。**
- **連續兩次被拒**：每次刪除開始時都會先清掉錯誤和 ref，失敗後再重新記住，行為正確。

**hooks 順序**
- effect 放在 `deleteErrorRef` 的 `useRef` 之後、`useNCRStats` 之前，在 hooks 區、事件處理函式之前，而且不是條件式呼叫。
- `error` 在第 28 行就從 store 取出，effect 用到時已經有值。
- 符合 AGENTS.md 的元件結構順序和 React 的 hooks 規則。

**我實際重跑**
- `react-app` 的 `npx tsc --noEmit -p .`：exit 0。
- `npx eslint src/components/NCR/NCR.tsx --max-warnings 0`：exit 0。
- `npm test`：173 passed、0 failed。

**佐證**：看過 `preview-6-R2final-deleted-banner-cleared.jpg`，刪除後上方已沒有提示，總量是 2。

**未做**：
- 這段差異沒有動後端，所以沒有重跑後端測試。
- 沒有自己操作瀏覽器。
