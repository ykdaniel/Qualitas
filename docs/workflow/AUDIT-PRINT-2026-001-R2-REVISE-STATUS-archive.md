# AUDIT-PRINT-2026-001 — STATUS（R2，待獨立審查）

TASK_ID: AUDIT-PRINT-2026-001
ROUND: R2。R1 審查結果為 REVISE，原文留存於 `AUDIT-PRINT-2026-001-R1-REVISE-REVIEW-archive.md`，R1 的補丁留存為 `evidence/G-R1.patch`。

差異見 `evidence/G.patch`：SHA-256 `0a7b9519f8e27c50172d4be3dbf2509351b9bf783feba02cb38320a8a8a5a545`，6 個檔案，其中 2 個是後端。
- 部署候選以 `688d87b3`（正式站目前的版本）為基準套用 G.patch，6 個檔案都和工作樹逐位元組相同；`diff -rq` 與重新套用的結果也相同。
- 另外確認補丁在 HEAD `127d187e` 上也能乾淨套上。
- HEAD 上多出的 `3665860e`、`5b2c67e3`、`4bdc49ec`、`127d187e`（ITR、NOI）是其他工作階段尚未部署的改動，不一起上線。

**未提交、推送或部署。不自填 PASS。**

## RESULT
- [x] DONE（交 R2 獨立審查）

## R2 修正
| R1 審查項目 | 處理 |
|---|---|
| 必改 1：完成率 .5 時 Word 和列印不一致 | 使用者選擇四捨五入。三處改用同一個整數公式：後端 `progress = (200*(total-pending)+total)//(2*total)`；前端新增並共用 `auditProgress()`（`AuditPrintTemplate.tsx` 匯出，`AuditWizard.tsx` 統計卡也改用它）。<br>• 改用整數，是因為 JS 的 `23/40*100` 等於 57.4999…，`Math.round` 會得到 57。我掃過總數 1～200 的所有組合，舊的 JS 算法有 8 組和正確結果不同，Python 的 `round` 有 134 組不同。 |
| 必改 2：只有條文的題目多一行「—」 | 新增 `questionCell()`：條文和查檢重點都空白時，才顯示一個「—」。 |
| 非阻擋：頁面設定跨模組互相影響 | `Audit.print.css` 拿掉不具名的 `@page`，改成 `@page audit { size: A4 portrait; margin: 13mm 12mm }`，並在 `.audit-print-root` 加上 `page: audit`。 |
| 非阻擋：沒有 afterprint 時按鈕失效 | 改成 `printJob {kind, n}`，每按一次 n+1，`useEffect` 會重新執行；portal 的 key 用 n。 |
| 非阻擋：只有廠商 ID 的舊紀錄 | `printData.contractor = formData.contractor ‖ contractorOptions 依 vendorId 查到的名稱`，和 Word 的 `contractor or vendor_ref.name` 相同。 |
| 非阻擋：抬頭寫法不同 | 副標改為「品質管理 — Quality Management」，並加上「版次 Rev：—」，和 Word 相同。 |
| STATUS 用詞 | 改寫為：不會讓其他頁面變成空白頁，頁面設定也不互相影響（見下方「行為變化」）。 |

## 修改（全部檔案）
| 檔案 | 內容 |
|---|---|
| `backend/services/audit_service.py` | 只改了 `export_docx` 的完成率公式和註解，維持 CRLF。 |
| `backend/tests/test_audit_export_docx_http.py` | 新增 `summary_values()` 和 `test_progress_rounds_half_up_like_the_wizard`，測 8 題完成 1 題 → 13%、40 題完成 23 題 → 58%、1/3 → 33%、2/3 → 67%、6/6 → 100%。 |
| `react-app/src/components/Audit/AuditPrintTemplate.tsx`（新） | 3 種列印內容。內容與 Word 一致的做法見 R1 的 STATUS 和上表。 |
| `react-app/src/components/Audit/Audit.print.css`（新） | 所有規則都限定在 `.audit-print-root` 之下。`#root` 只在 `body:has(> .audit-print-root)` 時隱藏；使用具名頁面 `@page audit`。 |
| `react-app/src/components/Audit/AuditWizard.tsx` | 3 個按鈕改為呼叫 `requestPrint(kind)`；新增 `printJob` 和 effect；`printData` 取自目前表單；用 portal 掛載列印內容；統計卡改用 `auditProgress`。維持 CRLF。 |
| `react-app/tests-browser/audit-print-template-check.mjs`（新） | 隔離環境的瀏覽器檢查，R2 加了第 6～8 項。 |

## 證據（`AUDIT-PRINT-2026-001-evidence/`）
- `backend-related-tests.txt`：在部署候選上跑 6 個相關測試檔，**87 passed，exit 0**。
- `frontend-checks.txt`：部署候選上 `tsc`、eslint（`--max-warnings 0`）、`npm run build` 都是 exit 0。建置出的 CSS 含 `body:has(>.audit-print-root)` 和 `@page audit` 各 1 條。
- `browser-check.txt`：隔離環境 8320/3320，從部署候選啟動，全新資料庫。
  - `audit-print-template-check.mjs` **ALL PASS**，共 15 項：
    - 先用 SPA 開 NCR，重現空白頁的情境。三個按鈕各自印出正式內容、`#root` 隱藏、沒有按鈕或圖示、印完卸載。
    - plan 和 checklist 的內容正確。
    - **報告涵蓋 Word 的每一段文字**：106 段，只略過 10 段寫法不同的行（Rev 和狀態那一行、簽核欄的「姓名／日期／單位」行）；章節順序也和 Word 相同。
    - 有未儲存修改時會標示。
    - 連按兩次、沒有 afterprint，仍會列印兩次，且畫面上只有一份列印內容。
    - 具名頁面規則存在，而且 Audit.print.css 沒有不具名的 `@page`。
    - **完成率：8 題完成 1 題時，精靈統計卡、列印、Word 都是 13%；40 題完成 23 題時三者都是 58%。**
    - 只有條文的題目只印條文。
  - 回歸測試：`audit-export-docx-check.mjs`、`audit-layout-check.mjs`、`audit-smoke-all.mjs`（使用 smoke 原本的 hardening_b + polish 種子資料）都是 ALL PASS，每一支都在全新的 stack 上執行。
- 列印成品：`print-report.pdf`、`print-plan.pdf`、`print-checklist.pdf`，以及各自第 1 頁的縮圖 png。改版前的對照：`before-print-report-step4.png`。重現空白頁 bug 的腳本：`blank-page-repro.mjs`。
- Python 3.11 完整測試：在部署候選上執行中（`~/Documents/Qualitas-deploy-artifacts/AUDIT-PRINT-2026-001/py311-full-suite.txt`）。
  - 那次執行使用的補丁 SHA 是 `1f18a981…`，和現在的 G.patch 只差在瀏覽器檢查腳本，後端兩個檔案完全相同。

## 行為變化
- 三個列印按鈕都改成印正式格式。「列印報告」和 Word 內容相同。
- 先開過其他模組再列印，不會再是空白頁。Audit 的頁面設定不會影響其他模組，其他模組的設定也不會影響 Audit。
- 完成率剛好是 .5% 時，畫面、列印、Word 一律進位。例如 12.5% 顯示為 13%；Word 以前會顯示 12%。
- 少數比例在畫面上的數字會變：JS 的浮點誤差會讓少數組合少算 1%，例如 23/40 以前顯示 57%，現在是 58%。

## 未做／限制
- 沒有在 Safari 或 Firefox 實測 `:has()` 和具名頁面。不支援 `:has()` 的舊瀏覽器會把畫面和列印內容一起印出來，但不會是空白頁。
- 部署需要重建後端（sudo）並切換前端。
