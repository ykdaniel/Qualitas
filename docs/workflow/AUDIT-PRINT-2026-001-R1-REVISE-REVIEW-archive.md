# AUDIT-PRINT-2026-001 — REVIEW（R1 獨立審查）

- 審查者：獨立 Claude 審查（GPT 額度用盡，使用者指定）
- TASK_ID: AUDIT-PRINT-2026-001
- ROUND: R1
- 審查日期：2026-10-10
- 基準：部署候選 = `git archive 688d87b3` + `evidence/G.patch`；另以 `git archive HEAD`（`3665860e`）交叉套用。分支 `ui/sidebar-shell-preview`。工作樹內其他未提交檔案（ITR、LanguageContext、backend 等）不屬本輪，未審。

## EVIDENCE_CHECK

**實測**＝本審查自行執行；**讀碼**＝只讀程式判斷。

1. **補丁完整性（實測）**
   - `G.patch` 的 SHA-256 = `173b2e1a3d547b35be8739401e1fe83e0cde18d2dc2319dbb71c769ed424cefa`，和 STATUS 相符。
   - 共 4 個檔案：`Audit.print.css`（新）、`AuditPrintTemplate.tsx`（新）、`AuditWizard.tsx`、`tests-browser/audit-print-template-check.mjs`（新）。
   - 在 `$TMPDIR` 分別用 `git archive 688d87b3` 和 `git archive HEAD` 解開後套用，兩者都能乾淨套上。套用後 4 個檔案都和工作樹逐位元組相同（`cmp`）。
   - `688d87b3..HEAD` 之間只差 ITR 的 2 個檔案，不碰 Audit。
   - 正在跑的隔離環境（8320/3320）從 `Qualitas-deploy-artifacts/AUDIT-PRINT-2026-001/cand-live` 啟動。它的 `react-app/src` 和「688d87b3 + G.patch」完全相同（`diff -rq`）。資料庫是暫存目錄裡的 `stack.db`，不是開發資料庫。
2. **CRLF 與 hooks（實測＋讀碼）**
   - `AuditWizard.tsx` 共 1193 行，全部是 CRLF（改版前 1151 行，也全部是 CRLF）。兩個新檔是 LF，沒有影響。
   - 新增的 `useState`、`useEffect` 放在元件最上層，和其他 hooks 一起，前面沒有任何條件式 return，hooks 順序穩定。
3. **列印內容和 Word（`audit_service.export_docx`）逐項比對（讀碼，有 2 處由實測確認）**
   - **一致的部分**：
     - 6 個章節的順序、標題和中英文標籤。
     - `STATUS_TEXT`、`RESULT_TEXT` 和 Word 用相同字串。
     - 非字串的 status 一律算待改善（實測：status 為物件 `{odd:1}` 時，列印顯示「注意／待改善 Attention」）。
     - 統計方式（total／passed／failed，其餘都算 pending）。
     - 只有空白的值視為空，顯示「—」。
     - 選用模板只取非空字串，用「、」連接。
     - 查檢項目只取物件。
     - 專案標籤格式為「[代號] 名稱」，沒有代號時只顯示名稱。
     - 範圍和發現欄留空時的提示文字。
     - 簽核欄 6.1／6.2／6.3 的人名來源（主任稽核員、專案經理）。
   - **不一致①：完成率的四捨五入方式不同（實測確認）**
     - Word 用 Python `round()`，遇到剛好 .5 會取偶數；列印用 JS `Math.round()`，.5 一律進位。
     - 實測：在隔離資料庫建立 8 題、1 題 pass 的稽核 `QTS-RV-AUDIT-000002`（暫存資料庫）。
       - 列印報告的「完成率」：**13%**
       - 同一筆資料匯出 Word，`document.xml` 裡的「完成率 Progress」：**12%**
       - 精靈畫面上的統計卡：13%
     - 會出問題的情況：完成比例剛好是 x.5%，例如 8 題完成 1 或 5 題、40 題完成 1、3、5…題。
     - 本輪的瀏覽器檢查用的是 5 題、完成 3 題（60%），所以沒測到。這違反 TASK「統計算法和 Word 一致」的驗收條件，STATUS「算法相同」的說法也不成立。
     - 另外：精靈畫面和 Word 原本就不一致，這是 AUDIT-EXPORT-DOCX 那輪留下的問題，不是本輪造成的。
   - **不一致②：只有條文、沒有查檢重點的題目（實測確認）**
     - Word 用換行把條文和查檢重點接起來，兩者都空時才顯示「—」，所以這種題目只印出條文。
     - 列印在條文下面又多印一行「—」。實測：列印為「Clause only, no task」加一行「—」，Word 只有「Clause only, no task」。
   - **輕微差異（不阻擋）**：
     - 抬頭寫法不同。Word 的副標是「品質管理 — Quality Management」，另有「版次 Rev：—」，標題只有一行；列印的副標多了「內部稽核」，狀態用徽章顯示，標題分兩行。
     - 狀態空白時，Word 抬頭留空，列印顯示「—」。
     - 只有 vendor_id、沒有 contractor 文字的舊紀錄：Word 會改用 `vendor_ref.name`，列印取表單的 `contractor`，會顯示「—」。
     - 只存專案名稱的舊紀錄：列印會用名稱對到專案，顯示「[代號] 名稱」；Word 在存檔補上 project_id 之前只顯示名稱。這是因為列印依畫面內容，可以接受。
4. **CSS 影響範圍（讀碼＋實測）**
   - 除了 `:root` 的 `--audit-*` 自訂屬性（只是變數，無害）和 `@page`，其餘規則都限定在 `.audit-print-root` 之下。
   - `.audit-print-root td` 的框線會被 `.head-cell` 和 `.body-cell` 蓋掉（後者 specificity 較高）。
   - `createPortal(..., document.body)` 產生的 `.audit-print-root` 是 body 的直接子節點（實測 `parentElement === body`），所以 `body:has(> .audit-print-root) #root` 的寫法正確。
   - **實測：三份列印都不會再是空白頁**。先用 SPA 依序開過 NCR、OSD、OBS、PQP、FAT、材料、會議紀錄、NOI、ITR、ITP、Checklist、KM，再回到 Audit 列印：`#root` 隱藏，列印內容為 `display:block`、`visibility:visible`、`position:static`，並且輸出了 PDF。
   - **實測：其他頁面不會變空白**。開過 Audit 之後切到 Dashboard，列印時 `#root` 仍是 `block`，頁面上也沒有殘留列印內容。
   - **實測：thead 會重複**。用 60 題的 AHB-DRAFT-1 產生 PDF：查檢表 4 頁、報告 5 頁，每一頁都有抬頭（稽核編號）和題目表頭（Clause No.）。
   - **實測：`@page` 會跨模組互相影響（既有問題，本輪新增了一個觸發來源，不阻擋）**。以下用 `page.pdf({preferCSSPageSize:true})` 測得：
     - Audit → ITP 清單 → 再回 Audit 列印報告：變成 **Letter 橫向**。
     - Audit → Checklist → 再回 Audit：變成 **Letter、邊界 0**。原因是 `Checklist.print.module.css` 的 `@page` 寫在 `@media print` 外面，而且沒有限定範圍。
     - 反方向：只開 ITP 時，該頁列印是 Letter 橫向；ITP → Audit → ITP 之後變成 A4 直向。不過 ITP → NCR → ITP 也一樣會變，NCR、OSD 等 8 個模組本來就有這個問題。
     - 改版前 Audit 沒有任何 `@page`，所以「開過 Audit 會改變 ITP 的列印方向」是本輪新增的觸發來源。STATUS 寫「不會影響其他模組的列印」，只適用於空白頁問題。
5. **AuditWizard 的列印流程（讀碼＋實測，`window.print` 用 stub 取代）**
   - 連按不同按鈕時，effect 的 cleanup 會清掉舊的計時器，改用最新的種類。真實瀏覽器裡 `window.print()` 會阻塞，對話框開著時無法再按。
   - 元件卸載時，cleanup 會清掉計時器和 `afterprint` 監聽，portal 也會跟著卸載（讀碼）。我嘗試實測「計時器還沒到就關閉精靈」，但關閉後頁面導回 `/` 並重新載入，無法在同一份文件中觀察，所以這點以讀碼結論為準。
   - **邊界情況（實測，不阻擋）**：如果 `afterprint` 沒有觸發（例如瀏覽器忽略了 `print()`），`printKind` 會一直停在原值。這時再按同一個按鈕，state 不會改變，也就不會再列印（實測：連按兩次只多列印一次），而且隱藏的列印內容會一直掛著。
   - 未儲存標示使用 `leaveGuard.dirty`。它只比較 `formData`，唯讀時一定是 false，符合預期。
   - 外層改成 fragment 後，`audit-layout-check` 的回歸測試沒有異常（見下）；原本的 `print:` class 都保留了。
6. **重跑瀏覽器檢查（實測）**
   - 8320/3320 目前是 smoke 種子（hardening_b + polish），沒有 `ahb-export-1`，所以 `audit-print-template-check.mjs` 在第 23 行等不到畫面而逾時。原因是資料不同，不是程式失敗。
   - 我改用現有資料自己寫腳本驗證（上面第 3～5 點）；種子相同時的完整結果，沿用 evidence 裡的 `browser-check.txt`（ALL PASS）。
   - evidence 裡的 PDF/PNG 看起來和 TASK 描述一致：report 2 頁、第 2 頁有重複抬頭；plan 有 1～3 段和計畫簽核；checklist 是空白勾選框加備註欄。
   - 我的腳本和輸出放在 scratchpad，沒有寫進 repo。
7. **3.11（讀碼＋實測）**
   - `37d71b03` 的後端加上 AUDIT-EXPORT-DOCX 的 `G.patch`（`05fec531…30e0`，正是 `py311-full-suite.txt` 所記的候選），和 `688d87b3` 的 `backend/` 完全相同（實測 `diff -rq`）。
   - 本輪的補丁不含任何後端檔案。

## SCOPE_CHECK

- 只動了前端 4 個檔案，和 TASK 一致；後端、Word 匯出、其他模組的 CSS 都沒改。
- 部署候選以 `688d87b3` 為基準，排除另一個工作階段的 ITR 修正，做法正確。
- **沿用 3.11 結果的做法合理**：候選的後端和已跑過 3.11 完整測試（2379 passed、16 skipped）的樹完全相同，本輪的補丁也不含後端檔案，重跑不會有新資訊。
  - 但如果修正①選擇改後端，就必須重跑 3.11，並且要部署後端。
- 測試腳本 `tests-browser/audit-print-template-check.mjs` 不會打包進正式站。
- 審查期間我在隔離環境的暫存資料庫新增了一筆 `QTS-RV-AUDIT-000002`，只是測試資料，沒有碰 8198/3198、8240/3240 或正式站。

## DECISIONS_CHECK

- 沒有違反 `DECISIONS.md` 現行決策。
- 部署可以適用「每批 PASS 後完成準備即提交、推送及部署」，前提是本輪 PASS。
- 「列印取自畫面內容（含未儲存的修改並標示）；Word 取自已儲存資料」，以及查檢表「空白勾選框、備註留白」的設計，都只記在 TASK 和 STATUS，沒有升格成 DECISIONS。目前不需要升格；如果使用者要把它定為長期規則，再另外記錄。
- 修正①要改哪一邊的四捨五入，會影響畫面上的數字，屬於需要使用者選擇的 UI／數值決定（見 REQUIRED_FIXES）。

## VERDICT

- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES

1. **完成率要和 Word 相同**（TASK 驗收條件）
   - 現況：剛好 .5 的情況，列印進位（13%），Word 取偶數（12%）。
   - 動手前請先讓使用者選擇做法：
     - **(a) 只改前端（建議）**：寫一個和 Python `round()` 相同、.5 取偶數的 helper，用在 `AuditPrintTemplate`。建議同時用在精靈的統計卡（`AuditWizard` 的 `stats`），讓畫面、列印、Word 三者一致。後端不動，可以沿用 3.11 結果。
     - **(b) 改後端**：改成一律進位，和畫面一致。這會擴大範圍，需要重跑 3.11 並部署後端。
   - 在瀏覽器檢查中加入「8 題完成 1 題」的案例，比對列印和 Word 的完成率。
2. **只有條文的題目不要多印「—」**
   - 在 `AuditPrintTemplate` 的報告明細和查檢表中，只有條文和查檢重點都空白時才顯示「—」，和 Word 的寫法一致。
   - 在瀏覽器檢查中加入這個案例。
3. 修正後重新產生 `G.patch` 並更新 SHA-256，再重跑以下檢查，證據放進 evidence：
   - `tsc`、eslint、build
   - `audit-print-template-check.mjs`，以及 `audit-export-docx-check.mjs`、`audit-layout-check.mjs`、`audit-smoke-all.mjs` 三項回歸測試

**非阻擋建議**（可以在本次修正一起處理，也可以另開一輪）：

- **`@page` 跨模組影響**：建議改用具名頁面，例如 `.audit-print-root { page: audit; }` 加上 `@page audit { size: A4; margin: 13mm 12mm; }`，並移除沒有名稱的 `@page`。這樣 Audit 列印不會被 ITP 或 Checklist 改成橫向或零邊界，也不會再改變 ITP 的列印方向。其他模組的同類問題可以另開一輪。STATUS 中「不影響其他模組列印」的說法，應該限定為「不會造成空白頁」。
- **`afterprint` 沒有觸發時的保險**：例如在 `window.print()` 返回後也清除 `printKind`（Chrome 的 `print()` 是同步的），或改用遞增的 nonce 觸發，避免同一個按鈕失效。
- 舊紀錄只有 vendor_id 時，列印的廠商欄可以比照 Word，用 `vendorId` 查出廠商名稱作為備援。
- 抬頭的副標和 Rev 行和 Word 不同，可以視需要統一。
- 尚未在 Safari 和 Firefox 實測（STATUS 已註明）。

## NEXT_STEP

1. 實作者先問使用者修正①要選 (a) 還是 (b)（如果採用 (a)，也確認精靈統計卡是否一起改），再完成修正 1～3。
2. 依規則把本 R1 的 REVIEW 封存到 `docs/workflow/`，STATUS 更新為 R2，交 R2 獨立審查。
3. R2 PASS 之後，依 DECISIONS 的持續授權，以 `688d87b3` 加新的 `G.patch` 為部署候選，部署前端（若選 (a)，不需要重建後端）。
