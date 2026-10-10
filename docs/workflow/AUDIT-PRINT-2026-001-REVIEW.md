# AUDIT-PRINT-2026-001 — REVIEW（R4 獨立審查）

- 審查者：獨立 Claude 審查（GPT 額度用盡，使用者指定）
- TASK_ID: AUDIT-PRINT-2026-001
- ROUND: R4（R1–R3 為 REVISE，原文見 `AUDIT-PRINT-2026-001-R1/R2/R3-REVISE-REVIEW-archive.md`）
- 審查日期：2026-10-10（UTC 16:20–16:40）
- 基準：部署候選 = `git archive 688d87b3` + `evidence/G.patch`（R4），即 `cand-live4`。另以 `git archive HEAD`（`127d187e`）交叉套用。

## EVIDENCE_CHECK

**實測**＝本審查自行執行；**讀碼**＝只讀程式判斷。

1. **補丁與留存（實測）**
   - 四份補丁的 SHA-256：
     - `G.patch`：`84d30a5f…06f3`，和 STATUS 相符，共 6 個檔案。
     - `G-R3.patch`：`7c7284e2…74fe`
     - `G-R2.patch`：`0a7b9519…a545`
     - `G-R1.patch`：`173b2e1a…cefa`
   - R3 的 REVIEW 已留存為 archive（勾選 REVISE）。
   - `G.patch` 在 `688d87b3` 和 `127d187e` 上都能乾淨套上，6 個檔案都和工作樹逐位元組相同。
   - R3 → R4 只改了 `Audit.print.css`：多一條 `body:has(> .audit-print-root) > #itr-single-print-root { display:none !important }`，並加註解。後端和 R2、R3 完全相同。
   - `cand-live4` 的 `backend/` 和 `react-app/src` 都和「688d87b3 + G.patch」相同（`diff -rq`）。
2. **重跑瀏覽器檢查（實測）**
   - 我用 `cand-live4` 自己啟動隔離環境：8320/3320，`isolated_stack.py up`，全新資料庫，種子 hardening_b + export_docx。
   - `audit-print-template-check.mjs` **18 項 ALL PASS**：
     - setup 確認 ITR 強制顯示的規則已載入、常駐容器存在、12 條不具名 `@page` 都已載入。
     - 計畫 1 頁、查檢表 1 頁、報告 2 頁，每頁 595×842 而且都有文字。
     - 完成率 13% 和 58% 三處一致；只有條文的題目只印條文；連按兩次仍會列印；未儲存修改會標示；報告涵蓋 Word 的每一段文字，章節順序相同。
   - `browser-check-control-on-R3.txt`（對照組）證明新的檢查抓得到 R3 的 ITR 空白頁。
3. **我自己的 PDF 矩陣（實測，用 `preferCSSPageSize` 輸出，逐頁檢查大小和字數）**
   - 下列情況的 Audit 報告全部是 **2 頁、A4 直向，第 1 頁有內容**，每頁字數相同（1756／659 或 663）：
     - 直接列印
     - 開過 ITR 之後（R3 失敗的情況）
     - 開過 NOI、ITP 清單、ITP 詳細頁、Checklist、KM 之後
     - 依序開過 NCR、OSD、OBS、PQP、FAT、材料、會議紀錄、NOI、ITR、ITP、ITP 詳細頁、Checklist、KM 之後
   - 只開 ITP、以及 ITP → Audit → ITP，兩者都是 Letter 橫向，Audit 不會影響 ITP。
   - 開過 Audit 之後列印 Dashboard，內容正常（Letter，`#root` 沒有被隱藏）。
   - 先開 ITR，再列印一份新建的 45 題稽核：查檢表和報告都是 3 頁 A4，每一頁都有抬頭和題目表頭（thead 會重複）。
   - 新加的 ID 規則只在 Audit 列印內容掛載時生效，不影響 ITR 自己的單筆列印。（讀碼）
4. **文件（讀碼）**
   - TASK 新增了 R4 追加範圍。STATUS 新增了 R4 修正表格，「行為變化」也改成實測成立的說法，和實際改動一致。
   - `frontend-checks.txt`（tsc、eslint、build 都是 exit 0）和 `backend-related-tests.txt`（87 passed）都標明是 R4 候選。
5. **Python 3.11（實測）**
   - `cand-live2` 兩個後端檔案的雜湊和 R4 候選相同（`9121011db169b1fe`、`90122160b2d04423`），mtime 15:41:10Z 早於測試開始的 15:43:05Z。
   - **結果已出爐（16:38:19Z）：`1 failed, 2379 passed, 16 skipped`，pytest_exit=1。**
   - 失敗的是 `tests/test_itr_state_protection_http.py::test_a_result_change_committed_first_is_seen_by_create_ncr_and_reinspection[re-inspect]`。
   - 判斷這和本輪無關：
     - 這是 ITR 的並行競態測試：兩個執行緒，用一個時間窗口卡住 `insert into audit_logs`。
     - 本輪只改了 `audit_service.export_docx` 的一行公式和 Audit 的測試，ITR 的程式和測試都沒有動。
     - 「688d87b3 的後端」在 AUDIT-EXPORT-DOCX 那輪跑 3.11 時，同一個測試是通過的（2379 passed，0 failed）。R2 補丁只動 Audit 檔案，所以兩次的 ITR 程式和測試完全相同。
     - 我在候選後端本機重跑這個測試 3 次（暫存 DATABASE_URL，Python 3.14）：每次 2 passed。
   - 推斷是容器內的時序抖動造成 flaky。但 3.11 輸出只保留最後 3 行，沒有失敗訊息，無法證實。
   - **依 DECISIONS 和 DEPLOY 規則「3.11 未通過不得部署後端」，目前不能部署後端。**

## SCOPE_CHECK

- R4 只改了 `Audit.print.css` 一條規則和檢查腳本，在 R3 審查要求的範圍內。
- 整輪最終共 6 個檔案：
  - 前端：Audit 的 3 個檔案和檢查腳本
  - 後端：`export_docx` 完成率公式和它的測試（使用者選擇四捨五入）
- 沒有動其他模組。
- 部署候選以 `688d87b3` 為基準，沒有混入 HEAD 上其他工作階段的 ITR、NOI 改動。
- 審查期間：
  - 我只用自己啟動的隔離環境，資料都是暫存，並在其中新增了測試稽核 `REV-R4-LONG`。
  - 結束時 `isolated_stack.py down` 回報 vite 的身分無法再確認，因此保留了執行目錄 `/private/var/folders/l3/76bnxp9x47159snm4w96_r6w0000gn/T/qualitas-manual-7i9mj_gl`。我確認後端和 vite 兩個行程都已結束，8320/3320 也已釋放。這個目錄只含暫存資料，可以由人工刪除。
  - 沒有碰 8198/3198、8240/3240 或正式站。

## DECISIONS_CHECK

- 沒有違反現行決策。
- 完成率改成四捨五入，是使用者 2026-10-10 的選擇，記在 TASK。
- 依「每批 PASS 後完成準備即提交、推送及部署」：
  - 前端在本輪 PASS 後就可以照流程部署。
  - 後端必須先有通過的 3.11，見 NEXT_STEP。

## VERDICT

- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

這個 PASS 是針對本輪的程式改動與前端證據。後端部署另有前提，見 NEXT_STEP 第 1 點。

## REQUIRED_FIXES

無。

非阻擋建議：
- 3.11 的執行紀錄建議多保留失敗的完整訊息，例如 `pytest -rf --tb=short` 或保存完整的 `/tmp/pt.txt`，方便日後判斷是否為 flaky。
- Safari 和 Firefox 仍未實測，STATUS 已註明。

## NEXT_STEP

1. **後端部署前提**：在最終候選上重跑 Python 3.11 完整測試，並保存失敗訊息。
   - 必須 pytest_exit=0 才能部署後端。
   - 最終候選是 `cand-live4`，或任何後端雜湊等於 `9121011db169b1fe`、`90122160b2d04423` 的候選樹。
   - 如果同一個 ITR 競態測試又失敗，請停下來回報使用者，不要部署後端。這是另一個模組的測試穩定性問題，要另開一輪處理。
2. **前端**：本輪 PASS 後，可以依持續授權以 `688d87b3` + `G.patch` 建置並部署。
   - 建議等 3.11 通過後前後端一起上線。
   - 原因：只上前端時，畫面和列印的完成率是四捨五入，但正式站的 Word 在 .5 的情況仍取偶數（例如 13% 對 12%）。是否先單獨上前端，請使用者決定。
3. 部署後做冒煙檢查：唯讀檢查和既有紀錄的匯出，不新增正式資料。結案時依規則封存 TASK、STATUS、REVIEW。
