# AUDIT-LAYOUT-2026-001 — REVIEW（獨立審查）

審查者：獨立 Claude 審查代理（GPT 額度用盡，使用者 2026-10-09 於對話中指定）

TASK_ID: AUDIT-LAYOUT-2026-001
ROUND: R1

## EVIDENCE_CHECK
**差異與部署候選（實測）**
- `E.patch` SHA-256 = `ed576480…83b0`，與 STATUS 相符。從 HEAD `d4950aec` 用 `git archive` 匯出 `react-app/src`、`tests-browser`，`git apply --check` 和 `git apply` 都成功。
- 套用後的 `src/`、`tests-browser/` 與部署候選 `Qualitas-deploy-artifacts/AUDIT-LAYOUT-2026-001/src-export/react-app` 用 `diff -rq` 比對，完全相同。候選中的 `package.json`、`package-lock.json`、`index.html`、`vite.config.js`、`tsconfig*.json`、`postcss.config.js`、`tests-unit/`、`scripts/`、`api/` 都與 HEAD 逐位元組相同。
- 工作樹的 `src/` 也與 HEAD + E.patch 相同。差別只有 `.claude/` 目錄，以及 4 個與本輪無關的 `*-vite-launcher.mjs`（未追蹤）。
- `AuditWizard.tsx`、`LanguageContext.tsx` 目前的 SHA-256 與 `frontend-checks.txt` 記錄的相同。兩個檔都是 CRLF（每行都以 CR 結尾：1120／1120、2976／2976）。

**前端檢查（審查者自己重跑）**
- `npx tsc --noEmit -p .` exit 0；`npm test` 144／144；`npx eslint src/components/Audit` exit 0。

**讀碼：AuditWizard.tsx**
- 步驟改號完整。`WIZARD_STEPS` 有 4 個翻譯鍵，`LAST_STEP = 4`。進度條用 `WIZARD_STEPS.map` 產生，標籤用 `t(labelKey)`，連接線條件是 `i < LAST_STEP`，打勾圖示條件是 `step > i`。`nextStep` 的上限改為 `LAST_STEP`，`prevStep` 下限仍是 1。頁尾在 `step < LAST_STEP` 時顯示「下一步」（type=button），只有最後一步且不是唯讀時才出現送出按鈕（type=submit）。程式裡已經沒有 `step === 5`、`< 5` 或 `[1..5]`。各步驟的判斷依序是 `step === 1/2/3/4`。
- 最後一步的搜尋框仍有 `isPlainEnter` 加上 `preventDefault` 的防護，註解也已改為 "last step"。第 1～3 步的表單裡沒有 submit 按鈕。合併後的第 2 步有 6 個文字輸入框和 1 個 textarea，按 Enter 不會觸發隱含送出，和合併前一樣安全。
- 合併後的第 2 步：原第 2 步的 `projectDirector`、`techLead`、`leadAuditor`、`supportAuditors`，以及原第 3 步的 `location`、`auditCriteria`、`scopeDescription` 都在。name、value、onChange 綁定和 placeholder 都沒變，沒有遺漏，也沒有重複。兩個欄位區塊各自放在 `fieldset disabled={readOnly}` 內，所以唯讀時所有可編輯欄位都會停用。「列印稽核計畫」按鈕在 fieldset 外，唯讀時仍可列印，和 HEAD 的行為一樣。兩個小標題（h3）和兩個 fieldset 都加了 `no-print`。只在列印時出現的計畫摘要仍包含 Step 1 的資訊、4 個人員欄位、地點、準則和範圍。
- 第 1 步的 7 個欄位都在，綁定沒變。Doc No 仍是 `readOnly`，並保留 not-allowed 的樣式。欄位順序依序是：編號、專案、承包商、主旨（整列）、開始日、結束日、狀態。原本的 `md:w-1/2`、`md:w-1/3` 已移除，換成 `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`。
- 其他地方的樣式替換（findings textarea、第 3、4 步的外框內距）只改了內距和圓角，`print:hidden` 和 `disabled={readOnly}` 都保留。第 4 步的搜尋框和第 3 步的查檢項目沒有被改到。
- i18n：`audit.wizard.stepPersonnelScope` 中英文都有（第 872、2342 行）。
- 無障礙：DOM 順序和新的視覺順序一致，Tab 鍵順序跟著畫面走。label 和輸入框的關聯方式維持原狀：原本就沒有 `htmlFor`，本輪沒有讓它變差。
- 最大寬度 1400px 與 `FormShell.module.css` 的 `max-width: 1400px` 一致。

**列印（用 pdfinfo／pdftotext 實查）**
- `print/step2.pdf`：1 頁 A4。內容是「人員與範圍／列印稽核計畫」標題列，加上 Internal Quality Audit Plan 摘要，包括人員、地點、準則和範圍（PRINT-SCOPE）。可編輯欄位沒有印出來。和 AUDIT-POLISH 的 `print-after/step3.pdf` 相比，只有標題列的步驟名稱不同（原本是「地點與範圍」），其他內容相同。
- `step3.pdf`：9 頁，PRINT-ITEM 共 60 個，和上一版一樣是 9 頁。`step4.pdf`：11 頁，60 個項目，把文字接起來後 "document control" 出現 30／30 次。上一版 step5 是 13 頁，表格欄寬沒有變差。

**畫面截圖（實看）與版面檢查腳本**
- 1440：第 1 步是 3 欄。1024：2 欄。390：1 欄。和宣稱的一樣。修正後的 `audit-layout-check.mjs` 用欄位的 `getBoundingClientRect().top` 計算同一列有幾個欄位，不再解析 grid 設定字串，第一次執行時那個錯誤已經不存在，`tops` 的數值也合理。
- **問題 1（版面退步，見 REQUIRED_FIXES 1）**：`screens/step1-1024.png` 的進度條最後一個標籤 "Execution & Review" 被視窗右緣切掉，最後的 "w" 只剩一半（審查者放大截圖確認）。原因是：進度條由 `max-w-4xl`（896px）改成 `max-w-5xl`（1024px），而外層只有 `md:px-8`（32px）。視窗寬度大約 768～1088px 時，進度條會撐滿外框，絕對定位的置中標籤超出按鈕約 36px，比 32px 的內距還寬，所以被切掉。依 HEAD 的寫法計算，1024 寬時標籤右緣離視窗邊約 28px，不會被切。英文是預設語言（`LanguageContext` 預設 `'en'`），所以預設使用者在一般筆電寬度就會看到這個退步。中文標籤比較短，不受影響。
- **問題 2（檢查方式有誤，見 REQUIRED_FIXES 2）**：「no horizontal page scroll」量的是 `document.documentElement.scrollWidth - innerWidth`。但精靈是 `fixed inset-0 overflow-y-auto` 的浮層。fixed 元素的溢出不算在文件的捲動寬度裡，而浮層的 `overflow-y:auto` 會讓 `overflow-x` 變成 auto，溢出會在浮層自己裡面形成橫向捲動。所以這項檢查對精靈內容沒有作用：問題 1 的溢出它量不到，仍判 PASS（`overflow=0px`）。STATUS 寫的「1024 沒有橫向捲動」因此沒有有效證據。
- 次要：版面檢查是在 `audit-smoke-all` 跑完之後重跑的。那時 AHB-DRAFT-1 已經被 A14 改成 Void，所以截圖拍到的是唯讀狀態（狀態顯示 Void），不影響欄數判斷。

## SCOPE_CHECK
- 只動了前端 2 個原始碼檔和 5 個測試腳本（2 個是新檔），都在 TASK 第 1～5 點的範圍內。後端、資料欄位、存檔、鎖定、權限和流程都沒變。第 3、4 步內部只縮小內距，沒有重新設計，也沒有改用 FormShell。
- 工作樹裡另一個工作階段的材料模組改動（`backend/*` 等）不在 E.patch 和部署候選裡。審查者沒有碰這些檔案。
- 次要的過時文字（不要求修，建議順手改）：`audit-polish-check.mjs:93` 的結果標籤仍寫 "step-5 search ignores case"；`audit-smoke-all.mjs:85` 的註解和 `:93` 的 A9 標籤仍寫 "step-5"（實際點的是按鈕 4，邏輯正確）；`AuditWizard.tsx` 列印摘要裡的註解 `Step 2 Info`、`Step 3 Info` 還是舊的步驟編號。

## DECISIONS_CHECK
- 使用者已定案的兩件事都照做了：加寬到 1400px 並改成 3 欄（md 2 欄、xl 3 欄、手機 1 欄），以及把第 2、3 步合併成「人員與範圍」（新翻譯鍵中英都有）。沒有私自擴大成「1～3 合成一頁」，也沒有把未確認的規則變成政策。
- 問題 1 不是設計選擇本身的問題，而是加寬時把進度條的上限一起放大造成的副作用，修正不會影響使用者的決定。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
1. **進度條最後一個標籤在 768～1088px 寬度被切掉（英文，也就是預設語言）**：讓進度條和外框邊緣保留足夠空間，使頭尾標籤完整顯示。例如進度條改回 `max-w-4xl`，或在進度條外層加上至少約 `px-10` 的左右內距。改完後重拍 `screens/step1-1024.png`，確認 "Execution & Review" 完整，左側的 "Project Info" 也沒被切。
2. **修正 `audit-layout-check.mjs` 的橫向捲動檢查**：改量實際會捲動的精靈浮層（例如 `.fixed.inset-0` 的 `scrollWidth - clientWidth`），並加一項檢查：每個進度條標籤的 `getBoundingClientRect()` 都要落在 `[0, innerWidth]` 之內。修正後重跑 1440、1024、390 三種寬度，結果和截圖放進 evidence。1440 和 1024 必須 PASS。390（手機）在 HEAD 時是 5 步，標籤本來就擠，屬於原有問題：可以一起修，或者在 STATUS 明確記為「原有限制，不在本輪」，並讓腳本如實顯示 FAIL 或 KNOWN，不能寫成 PASS。
3. 修完後更新 E.patch、STATUS（附新的 SHA-256），並重新產生部署候選。tsc、單元測試、Audit 的 eslint 要重跑。列印第 2、3、4 步至少重跑一次，確認頁數和內容沒有改變。

## NEXT_STEP
依 REQUIRED_FIXES 1～3 修正後交 R2 審查。R2 會重點看 1024 寬的截圖、新的浮層溢出檢查與標籤邊界檢查的輸出，以及部署候選是否仍等於 HEAD + 新的 E.patch。其餘部分（步驟改號、合併後的欄位與綁定、唯讀鎖定、列印內容、i18n、CRLF）本輪已確認沒有問題，R2 不必全部重審。
