# AUDIT-PRINT-2026-001 — STATUS（R1，待獨立審查）

TASK_ID: AUDIT-PRINT-2026-001
ROUND: R1。差異見 `evidence/G.patch`（SHA-256 `173b2e1a3d547b35be8739401e1fe83e0cde18d2dc2319dbb71c769ed424cefa`，4 個檔案）。
- 補丁在 HEAD `3665860e` 和 `688d87b3`（正式站目前的版本）都能乾淨套上，兩個候選樹的 4 個檔案都和工作樹逐位元組相同。
- 部署候選以 `688d87b3` 為基準，避免把另一個工作階段還沒部署的 ITR 修正（`3665860e`）一起上線。

**未提交、推送或部署。不自填 PASS。**

## RESULT
- [x] DONE（交 R1 獨立審查）

## 修改
| 檔案 | 內容 |
|---|---|
| `react-app/src/components/Audit/AuditPrintTemplate.tsx`（新） | 3 種列印內容，見 TASK。標籤和數值使用與 Word 相同的字串與算法：`STATUS_TEXT`、`RESULT_TEXT`、非 pass/fail 一律算待改善；只有空白的值視為空；查檢項目只取物件；專案標籤格式為「[代號] 名稱」。 |
| `react-app/src/components/Audit/Audit.print.css`（新） | 比照 `OSD.print.css`，所有規則都限定在 `.audit-print-root` 之下。`#root` 只在 `body:has(> .audit-print-root)` 時隱藏。 |
| `react-app/src/components/Audit/AuditWizard.tsx` | 改動如下：<br>• 3 個按鈕改為 `setPrintKind('plan' / 'checklist' / 'report')`。<br>• `useEffect` 在 200ms 後呼叫 `window.print()`，`afterprint` 時清除。<br>• 新增 `printData`，取自目前表單，專案標籤與 Word 相同。<br>• 用 `createPortal` 把列印內容放進 `document.body`，`unsaved` 取自 `leaveGuard.dirty`。<br>• return 外層改為 fragment。原本畫面上的 print: class 都保留，瀏覽器選單直接列印時仍然有效。<br>• 檔案維持 CRLF。 |
| `react-app/tests-browser/audit-print-template-check.mjs`（新） | 隔離環境用的瀏覽器檢查。 |

## 證據（`AUDIT-PRINT-2026-001-evidence/`）
- `frontend-checks.txt`：部署候選（`688d87b3` + G.patch）上，`tsc --noEmit -p .`、eslint（`--max-warnings 0`）、`npm run build` 都是 exit 0；建置出的 CSS 含 `body:has(>.audit-print-root)` 規則。
- `browser-check.txt`：隔離環境 8320/3320，從部署候選啟動，全新資料庫。
  - `audit-print-template-check.mjs` **ALL PASS**：
    - 先用 SPA 開 NCR，確認那條無條件隱藏 `#root` 的規則已經載入，重現原本會空白的情境。
    - 三個按鈕：各呼叫 `window.print()` 一次；列印內容在 `<body>` 下；列印時 `#root` 隱藏、列印內容可見；不含任何 button 或 svg；`afterprint` 後卸載。
    - plan 有 1～3 段和計畫簽核，沒有查檢結果。
    - checklist 有 5 題、每題都有空白勾選框，沒有印出已記錄的結果和備註。
    - **報告內容涵蓋 Word 匯出的每一段文字**（106 段；只略過 11 段寫法不同的行，例如 Rev 行和簽核欄的「姓名／日期／單位」行），章節順序也和 Word 相同。
    - 有未儲存的修改時，印出畫面上的內容並在抬頭標示。
  - 回歸測試：`audit-export-docx-check.mjs`、`audit-layout-check.mjs` ALL PASS；`audit-smoke-all.mjs` 在它原本使用的種子資料（hardening_b + polish）上 ALL PASS。
    - 第一次跑 smoke 時沒有加 polish 種子，A11 少了 `AHB-VOIDONLY-1` 而失敗。那次的紀錄留在 `../AUDIT-PRINT-2026-001` 的工作目錄中，不在本證據內。
- 列印成品（Chromium `page.pdf`，A4）：`print-report.pdf`（2 頁）、`print-plan.pdf`、`print-checklist.pdf`，以及各自第 1 頁的縮圖 png。改版前的對照：`before-print-report-step4.png`。
- `blank-page-repro.mjs`：重現既有空白頁 bug 的腳本，在改版前的程式上執行。結果：剛載入時 `#root` 為 block；SPA 切到 NCR 再回 Audit 後，`#root` 在列印時變成 none。
- Python 3.11：本輪沒有任何後端改動。部署候選的後端等於 `688d87b3`，也就是 AUDIT-EXPORT-DOCX 候選樹（`37d71b03` + 該輪 G.patch）已跑過 3.11 完整測試的同一份程式：2379 passed、16 skipped，見 `../AUDIT-EXPORT-DOCX-2026-001-evidence/py311-full-suite.txt`。本輪不重跑。

## 行為變化
- 「列印報告」：印出與 Word 相同的 6 段正式報告。
- 「列印稽核計畫」：印出正式格式的計畫（第 1～3 段加簽核）。
- 「列印查檢表」：印出可以在現場手寫的空白查檢表。
- 三份都不會再印出按鈕或圖示。先開過其他模組再列印，也不會是空白頁。
- 列印取自畫面上的內容（可能含未儲存的修改，會標示）；Word 取自已儲存的資料。

## 未做／限制
- 沒有在 Safari 或 Firefox 實測 `:has()`。三者目前的版本都支援（Safari 15.4+、Firefox 121+）；不支援的舊瀏覽器會忽略這條規則：畫面和正式列印內容會一起印出來，不會是空白頁。
- 只動前端，部署不需要重建後端。
