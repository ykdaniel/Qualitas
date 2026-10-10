# AUDIT-EXPORT-DOCX-2026-001 — REVIEW（Audit 匯出 Word 完整報告）

審查者：獨立 Claude 審查（GPT 額度用盡，使用者指定）
TASK_ID: AUDIT-EXPORT-DOCX-2026-001
ROUND: R2（R1 為 REVISE，原文見 `AUDIT-EXPORT-DOCX-2026-001-R1-REVISE-REVIEW-archive.md`）
審查日期：2026-10-10；基準 HEAD `37d71b03`（`ui/sidebar-shell-preview`），候選樹是 `git archive HEAD` 套上 R2 的 `evidence/G.patch`

## EVIDENCE_CHECK

以下都是審查者自己重做的，沒有引用 STATUS 的結論。

1. **G.patch 雜湊**：用 `shasum -a 256` 算出來是 `05fec531e07467ed7e3d73a4a7c2e8ce18df367742115ae4bc6e99f2dfbc30e0`，和 STATUS 寫的相同。`G-R1.patch` 算出來是 `b5d11c94…3463`，和 R1 審查時一樣。R1 的審查文件已原文留存在 `-R1-REVISE-REVIEW-archive.md`。
2. **套用**：在 `$TMPDIR/aedr2/cand` 解開 `git archive HEAD`（`37d71b03…`），`git apply --check` 通過，9 個檔案都乾淨套上，沒有檔案權限（mode）的變更。用 `cmp` 比對，9 個檔案和工作樹逐位元組相同。repo 裡追蹤中的檔案，只有本輪的 6 個有修改。
3. **換行字元**：`audit_service.py`（543/543 行）、`routers/audit.py`（129/129）、`AuditWizard.tsx`（1151/1151）、`LanguageContext.tsx`（2982/2982）仍然整檔都是 CRLF。`api.ts` 和 `LeaveGuard.tsx` 原本是 LF，現在也還是 LF。
4. **R1 → R2 改了什麼**：分別把 G-R1.patch 和 G.patch 套到兩棵樹上，再用 `diff -r` 比較。只改了 3 處：
   - `audit_service.py`：新增 `status_key(item)`，status 不是字串時回傳 None；明細表的結果文字改用 `_RESULT_TEXT.get(status_key(item), pending)`。
   - 測試檔新增 1 個測試。
   - 種子腳本新增 DATABASE_URL 檢查。
   - 前端 4 個檔案、router、瀏覽器檢查腳本都和 R1 逐位元組相同，所以 R1 檢查過的前端行為（tsc 和 eslint 都 exit 0、dirty 判斷、按鈕顯示條件、列印時隱藏、useDraftGuard 的其他呼叫端）仍然成立。
5. **必改項是否修好**：
   - 審查者另外寫了邊界測試，放在候選樹裡的暫存檔，跑完已刪除，沒有寫進 repo。直接寫入 7 種 status 的項目：陣列 `["pass"]`、物件 `{"a":1}`、`null`、`true`、`1.5`、`"fail"`、`"PASS"`。結果匯出回 200，前 5 項顯示「注意／待改善」，`"fail"` 顯示「不符合」，`"PASS"`（大寫）顯示「注意／待改善」，完成率 14%。這和精靈的 `=== 'pass'` 判斷一致。
   - 執行者新增的測試 `test_a_status_that_is_not_a_string_counts_as_pending` 是走一般的建立 API，涵蓋陣列、物件、數字三種，匯出回 200、完成率 25%。
   - 統計那段原本就用 `==` 比對，不會因為無法雜湊的值出錯，不必改。
6. **R1 的邊界測試重跑**：值不是字串、SQLite 欄位實際存成整數、auditNo 含 CRLF 時 Content-Disposition 標頭沒有換行、專案和承包商名稱含控制字元、產生文件時出錯回 500 而不是 404。5 個全部通過。
7. **相關測試**：在 R2 候選樹上用本機 Python 3.14.6，`DATABASE_URL` 指向 `$TMPDIR/aedr2/throwaway.db`，跑 6 個相關測試檔，**86 passed**（R1 是 85 個，加上新的 1 個）。開發資料庫 `backend/qualitas.db` 的修改時間仍是 Oct 6，沒有被動到。
8. **種子腳本的檢查**：在候選樹的副本裡，不設 `DATABASE_URL` 直接執行，會印出 "refusing to seed…" 並以 exit 1 結束，也沒有產生 `qualitas.db`。這個檢查寫在 `import database` 之前，所以不會先連到資料庫。
9. **隔離環境 8320（R2 候選樹重新啟動，只讀取）**：
   - 先確認變數有值，cookie 檔放在 scratchpad，沒有寫進 repo。
   - 用 `audit_viewer` 登入後匯出 `ahb-export-1`，回 200 docx；不存在的 id 回 404；未登入回 401。
   - 用 python-docx 讀出下載的檔案，文字和 `evidence/sample-AHB-EXPORT-1.docx` 以及 R1 時的樣本完全相同。種子資料沒有不正常的 status，所以 R2 不應該改變輸出，結果也確實沒變。
   - 執行者的 `browser-check.txt` 註明是 R2 候選樹，7 項 ALL PASS；前端程式和 R1 相同，結果合理。

## SCOPE_CHECK
- R2 只改了必改項本身、對應的測試，以及種子腳本的安全檢查（R1 提出的非阻擋建議）。沒有擴大範圍，也沒有動到其他模組、資料結構、列印功能或 `core/docx_builder.py`。
- 整輪的範圍和 R1 審查時相同，都在 TASK 列出的項目內。

## DECISIONS_CHECK
- 和 DECISIONS.md 沒有衝突，也沒有新增政策。公司名稱和標誌仍用佔位文字，這是 BACKLOG #15 尚未決定的事，TASK 已排除在本輪之外。
- 符合 AGENTS.md：業務邏輯放在 service；原始例外不會回給 client；前端透過 api service 呼叫，並用 try/catch 顯示友善訊息。
- `console.error` 沿用檔案裡原本的寫法（repo 沒有 logger），R1 已判定不阻擋。
- 沒有提交、推送或部署。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無。

非阻擋建議（沿用 R1，可以之後再處理）：
- 精靈只用主表單（formData）判斷有沒有未儲存的修改。如果 step 3 的項目編輯框開著還沒套用，或「新增項目」欄位裡有字，匯出前不會提醒。這些內容本來就不在已儲存的資料裡，影響很小。

## NEXT_STEP
1. **部署前提：Python 3.11 完整測試要全數通過。** 審查時，R2 候選樹的 `~/Documents/Qualitas-deploy-artifacts/AUDIT-EXPORT-DOCX-2026-001/py311-full-suite.txt` 只跑到 `pip_exit=0`，pytest 結果還沒出來。要等它顯示全部通過、pytest exit 0，才可以進行下一步。
2. 3.11 通過後，依「每批 PASS 後完成準備即提交、推送及部署」的決策，只提交本輪的 9 個檔案和本輪文件，不要把工作樹裡 NOI-* 等其他工作的檔案帶進來。
3. 部署要後端重建加前端切換，而且要等其他工作階段的部署結束，不能混在同一次重建裡。
