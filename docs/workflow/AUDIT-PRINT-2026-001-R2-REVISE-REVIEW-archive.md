# AUDIT-PRINT-2026-001 — REVIEW（R2 獨立審查）

- 審查者：獨立 Claude 審查（GPT 額度用盡，使用者指定）
- TASK_ID: AUDIT-PRINT-2026-001
- ROUND: R2（R1 為 REVISE，原文見 `AUDIT-PRINT-2026-001-R1-REVISE-REVIEW-archive.md`）
- 審查日期：2026-10-10（UTC 16:00 前後）
- 基準：部署候選 = `git archive 688d87b3` + `evidence/G.patch`（R2）。另以 `git archive HEAD`（`127d187e`）交叉套用。工作樹內其他未提交檔案不屬本輪。

## EVIDENCE_CHECK

**實測**＝本審查自行執行；**讀碼**＝只讀程式判斷。

1. **補丁與留存（實測）**
   - `G.patch` 的 SHA-256 = `0a7b9519f8e27c50172d4be3dbf2509351b9bf783feba02cb38320a8a8a5a545`，和 STATUS 相符，共 6 個檔案（後端 2 個、前端 3 個、瀏覽器檢查腳本 1 個）。
   - `G-R1.patch` = `173b2e1a…cefa`，和 R1 審查時相同。R1 的 REVIEW 已留存為 archive（勾選 REVISE）。
   - 在 `688d87b3` 和 `127d187e` 上各自套用都能乾淨套上，6 個檔案都和工作樹逐位元組相同。
   - `audit_service.py` 維持 CRLF。
   - 正在跑的隔離環境（8320/3320）從 `cand-live2` 啟動。它的 `backend/` 和 `react-app/src` 和「688d87b3 + G.patch R2」完全相同（`diff -rq`）。
2. **R1 必改 1：完成率（讀碼＋實測）**
   - 後端 `(200*done + total) // (2*total)` 和前端 `auditProgress()` 是同一個整數公式，等於「100×done/total 四捨五入」。
   - 我把總數 1～2000 的所有組合和精確的四捨五入結果比對，0 組不同。JS 端浮點除法再 `Math.floor`，和整數除法的結果也是 0 組不同。
   - 精靈統計卡也改用 `auditProgress`。Audit 模組裡沒有其他地方計算完成率。
   - 在候選後端跑 `tests/test_audit_export_docx_http.py`（暫存 DATABASE_URL，本機 Python 3.14）：10 passed，包含新加的 13%／58%／33%／67%／100% 測試。
   - 瀏覽器重跑（見第 6 點）：8 題完成 1 題，以及 40 題完成 23 題，精靈統計卡、列印、Word 三處都一致（13%、58%）。
   - **已修正。**
3. **R1 必改 2：只有條文的題目（讀碼＋實測）**
   - `questionCell()` 只有在條文和查檢重點都空白時才顯示「—」，報告和查檢表兩處都套用了。瀏覽器實測只印出條文。
   - **已修正。**
4. **R1 非阻擋建議的處理（讀碼＋實測）**
   - `printJob {kind, n}`：每按一次 n+1，effect 會重新執行，portal 的 key 也跟著換。實測沒有 afterprint 時連按兩次，會列印兩次，畫面上只掛著一份列印內容。cleanup 一樣會清掉計時器和監聽。**OK。**
   - 廠商名稱改成 `formData.contractor || contractorOptions` 依 vendorId 查到的名稱，和 Word 的 `contractor or vendor_ref.name` 相同。（讀碼）**OK。**
   - 抬頭的副標和「版次 Rev：—」已和 Word 對齊。報告文字比對只略過 10 段寫法不同的行。**OK。**
   - **具名頁面 `@page audit`：有 2 個問題，見下方第 5 點。**
5. **新發現：具名頁面造成每份列印第 1 頁空白，而且沒有達到隔離效果（實測）**
   - **(a) 每份 Audit 列印的第 1 頁都是空白頁。**
     - 本輪自己的 evidence 就能看到：`print-report.pdf` 有 3 頁，第 1 頁文字 0 字元（R1 版本是 2 頁）；`print-plan.pdf`、`print-checklist.pdf` 都是 2 頁，第 1 頁 0 字元。
     - 我重跑檢查產生的 `print-report.pdf` 結果相同。另外在新分頁直接列印報告：第 1 頁 Letter 空白，第 2、3 頁才是 A4 的內容。
     - 原因：`index.html` 裡固定有一個空的 `<div id="itr-single-print-root">`（`688d87b3` 就有），它排在列印內容前面，列印時是 block，而且它的 page 是 `auto`。`.audit-print-root` 的 page 是 `audit`，頁名不同，Chrome 就在兩者之間強制換頁。於是第 1 頁只剩那個空的 div。
     - 驗證：在同一個畫面把 `.audit-print-root` 的 page 改回 `auto`，就變成 2 頁、第 1 頁有內容。改加 `body:has(> .audit-print-root) > :not(.audit-print-root) { display:none !important }`，同樣是 2 頁、第 1 頁有內容。
     - 本輪要修的就是「列印出空白頁」，這個空白頁是 R2 新造成的，使用者每次列印都會碰到。**阻擋。**
   - **(b) 具名頁面沒有讓 Audit 擺脫其他模組的頁面設定。** 以下用 `page.pdf({preferCSSPageSize:true})` 測得：
     - Audit → ITP 清單 → 再回 Audit 列印報告：每頁仍是 **Letter 橫向**。
     - Audit → Checklist → 再回 Audit：仍是 **Letter**。
     - Audit → ITP 詳細頁：A4 橫向。
     - 只有 Audit → KM 時是 A4 直向。
     - 先把空白頁的問題排除後（隱藏其他 body 子節點），結果仍相同。
     - 把 `@page audit` 的 size 和 margin 加上 `!important` 後，ITP 和 Checklist 兩種情況都變成 A4 直向、2 頁。
     - 所以目前只是「Audit 不再影響其他模組」做到了：ITP → Audit → ITP 仍是 Letter 橫向，和只開 ITP 時相同。「其他模組不影響 Audit」沒有做到，但 STATUS 和 CSS 註解都寫成已經做到。
     - 瀏覽器檢查第 12 項只檢查 CSS 規則存在，沒有檢查實際輸出的頁面，所以沒有抓到 (a) 和 (b)。
   - 其他頁面不受影響：開過 Audit 之後列印 Dashboard，`#root` 正常印出，沒有空白頁。（實測）
6. **瀏覽器檢查（實測）**
   - 在 8320/3320（R2 候選，種子 hardening_b + export_docx）重跑 `audit-print-template-check.mjs`：15 項 **ALL PASS**，和 evidence 一致。
   - 但這份腳本存下的 PDF 本身就有上面 (a) 的空白第 1 頁，腳本沒有檢查。
   - 我的腳本和輸出都放在 scratchpad，沒有寫進 repo。
7. **Python 3.11（實測）**
   - `py311-full-suite.txt` 在 UTC 16:02 仍只有開頭（`pip_exit=0`），**尚未完成**。上一輪完整跑一次約 49 分鐘。
   - 記錄中的補丁 SHA 是 `1f18a981…1afd`，但這份補丁沒有留存，掛載的「candidate copy」也沒有寫明路徑。所以我無法自行確認「後端和現在的 G.patch 相同」。
   - 現在候選中兩個後端檔案的 SHA-256 前 16 碼：`audit_service.py` 是 `9121011db169b1fe`，`test_audit_export_docx_http.py` 是 `90122160b2d04423`。
8. **文件**
   - TASK 的標題仍寫「範圍（只動前端）」，「不在本輪」也仍寫「後端、Word 匯出都不變」，和 R2 追加範圍（改後端）矛盾。

## SCOPE_CHECK

- 改後端是使用者的選擇（完成率統一四捨五入，TASK R2 有記錄）。改動只有 `export_docx` 的一行公式和註解，加上一個測試，範圍小且明確。
- 前端仍只有 Audit 的 3 個檔案和檢查腳本，沒有動其他模組。
- 部署候選以 `688d87b3` 為基準，排除 HEAD 上其他工作階段的 ITR、NOI 改動，做法正確。
- 因為動到後端，本輪必須有 3.11 通過才能部署後端（DECISIONS 的持續授權也要求 3.11）。目前還沒有結果。
- 審查期間我只讀取了隔離環境的資料，另外產生 PDF；沒有碰 8198/3198、8240/3240 或正式站。

## DECISIONS_CHECK

- 完成率改成四捨五入，是使用者 2026-10-10 的選擇，記在 TASK。畫面上的數字會跟著改變（例如 23/40 從 57% 變成 58%），STATUS 已說明。這屬於本輪的數值修正，不需要另外升格成 DECISIONS。
- 沒有違反現行決策。部署可以適用「每批 PASS 後完成準備即提交、推送及部署」，前提是本輪 PASS 並且 3.11 通過。

## VERDICT

- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES

1. **移除每份列印的空白第 1 頁**（R2 新造成的問題，三份都有）
   - 做法一：在 `Audit.print.css` 的 `@media print` 加上 `body:has(> .audit-print-root) > :not(.audit-print-root) { display: none !important; }`。這只在 Audit 列印內容掛載時生效，可以讓 `#itr-single-print-root` 等兄弟節點不再產生前置頁。我已在畫面上實測，加上後變成 2 頁、第 1 頁有內容。
   - 做法二：放棄具名頁面。
   - 瀏覽器檢查要改成檢查**實際輸出的 PDF**：
     - 第 1 頁要有稽核編號。
     - AHB-EXPORT-1 的報告、計畫、查檢表頁數分別是 2、1、1，或依實際內容訂出預期值。
     - 不能只檢查 CSS 規則存在。
2. **讓 `@page audit` 真的能隔離其他模組，或者撤回這個說法**
   - 實測沒有 `!important` 時，ITP 和 Checklist 的頁面設定會蓋過它。加上 `size: A4 portrait !important; margin: 13mm 12mm !important;` 之後，兩種情況都是 A4 直向。
   - 採用的話，請在檢查中加入「開過 ITP（以及 Checklist）再回 Audit 列印，PDF 為 A4 直向」的實際輸出驗證。
   - 如果不採用，就把 STATUS 和 CSS 註解裡「其他模組不影響 Audit」的說法刪掉。
3. **3.11 證據**
   - 等目前的 3.11 完整測試跑完，並且通過（pytest_exit=0）。
   - 在證據中寫明 3.11 掛載的候選樹裡，兩個後端檔案的 SHA-256，證明它們和最終 G.patch 的後端檔案相同（目前前 16 碼：`9121011db169b1fe`、`90122160b2d04423`）。如果做不到，就用最終的 G.patch 重跑。
   - 修正 1、2 只動前端 CSS 和檢查腳本，後端不會變，所以 3.11 結果可以沿用，但仍須附上上述雜湊。
4. **TASK 文件**：把「範圍（只動前端）」和「後端、Word 匯出都不變」改成符合 R2 的實際範圍。
5. 修正後重新產生 `G.patch` 並更新 SHA-256，再重跑以下檢查，證據放進 evidence；並重新產生三份列印 PDF，確認第 1 頁有內容：
   - `tsc`、eslint、build
   - `audit-print-template-check.mjs`
   - 三支回歸測試

**非阻擋建議**：無新增。R1 其餘建議都已處理；Safari 和 Firefox 仍未實測，STATUS 已註明。

## NEXT_STEP

1. 實作者完成修正 1～5。修正 2 如果決定撤回說法而不是加 `!important`，請在 STATUS 註明。
2. 依規則把本 R2 的 REVIEW 封存到 `docs/workflow/`，STATUS 更新為 R3，交 R3 獨立審查。
3. R3 PASS，並且 3.11 證據完整之後，依 DECISIONS 的持續授權，以 `688d87b3` 加最終的 `G.patch` 為部署候選，部署前端並重建後端。
