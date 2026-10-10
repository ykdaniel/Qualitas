# AUDIT-PRINT-2026-001 — STATUS（R4，PASS；待最終候選重跑 3.11 後部署）

TASK_ID: AUDIT-PRINT-2026-001
ROUND: R4。R1–R3 審查結果都是 REVISE，原文留存於 `AUDIT-PRINT-2026-001-R1/R2/R3-REVISE-*-archive.md`；補丁留存為 `evidence/G-R1/R2/R3.patch`。

差異見 `evidence/G.patch`：SHA-256 `84d30a5f0e822c5262df5a9dedc6c450b87d86e03d46ee83e70b8cfddbf706f3`，6 個檔案，其中 2 個是後端。R3 和 R4 都只改了 `Audit.print.css` 和瀏覽器檢查腳本。
- 部署候選以 `688d87b3`（正式站目前的版本）為基準套用 G.patch，6 個檔案都和工作樹逐位元組相同；`diff -rq` 與重新套用的結果也相同。
- 另外確認補丁在 HEAD `127d187e` 上也能乾淨套上。
- HEAD 上多出的 `3665860e`、`5b2c67e3`、`4bdc49ec`、`127d187e`（ITR、NOI）是其他工作階段尚未部署的改動，不一起上線。

審查結果 R4 PASS（見 REVIEW）。已在本地提交，推送和合併改由協調中心「登入測試」處理。尚未部署，部署順序排在 ITR 之後。

## RESULT
- [x] DONE（R4 PASS）

## R4 修正（R3 審查 REVISE）
| R3 審查項目 | 處理 |
|---|---|
| 必改 1：開過 ITR 後，第 1 頁又變空白 | 新增 `body:has(> .audit-print-root) > #itr-single-print-root { display:none !important }`，用 ID 權重對抗 ITR.module.css 的 `:global(#itr-single-print-root){display:block !important}`。註解寫明原因。 |
| 必改 2：檢查腳本要先開過全部模組 | 列印前依序用 SPA 開 NCR、OSD、OBS、PQP、FAT、材料、會議紀錄、NOI、ITR、ITP、Checklist、KM。新增 setup 檢查：ITR 強制顯示的規則已載入、常駐容器存在、不具名的 `@page` 至少 2 條（實測 12 條）。 |
| 必改 3：3.11 | 仍在 `cand-live2` 上執行，後端雜湊比對見 R3 修正的必改 3。R4 沒有改後端。 |
| 必改 4：STATUS 用詞、重跑全部檢查 | 「行為變化」改為「開過任何其他模組後再列印」，下方證據全部以 R4 重跑。 |

**對照組**：用 R4 的檢查跑 R3 候選（`browser-check-control-on-R3.txt`）：setup 通過，三份 PDF 都多出一頁沒有文字的第 1 頁，報告共 3 頁，檢查全部 FAIL。可見新檢查確實抓得到 R3 的缺陷。原本的 `browser-check-control-on-R2.txt` 已被這份取代。

## R3 修正（R2 審查 REVISE）
| R2 審查項目 | 處理 |
|---|---|
| 必改 1：三份列印的第 1 頁都是空白頁（R2 造成） | 列印時隱藏的對象從 `#root` 改成 `body:has(> .audit-print-root) > :not(.audit-print-root)`，也就是 body 底下除了列印內容以外的所有元素，包括 `index.html` 裡那個空的 `#itr-single-print-root`。<br>瀏覽器檢查改為讀取**實際輸出的 PDF**：使用 `preferCSSPageSize`，逐頁檢查大小、是否有文字。 |
| 必改 2：開過 ITP、Checklist 後，頁面大小仍被它們蓋掉 | `@page audit { size: A4 portrait !important; margin: 13mm 12mm !important }`。瀏覽器檢查在列印前先用 SPA 開過 NCR、ITP、Checklist。 |
| 必改 3：3.11 的後端要能比對 | 3.11 那次測試使用的是 `cand-live2`。它的 2 個後端檔案前 16 碼為 `audit_service.py` `9121011db169b1fe`、`test_audit_export_docx_http.py` `90122160b2d04423`，和 R3 候選、工作樹完全相同。兩個檔案的修改時間是 2026-10-10 15:41:10Z，早於 3.11 開始的 15:43:05Z。R3 沒有改後端。 |
| 必改 4：TASK 文件仍寫「只動前端」 | 已更新：範圍標題、不在本輪的說明，並新增 R2、R3 追加範圍。 |
| 必改 5：重跑全部檢查 | 見下方證據。 |

**對照組**：把 R3 的檢查腳本拿去跑 R2 候選（`browser-check-control-on-R2.txt`），三份 PDF 都抓到問題：第 1 頁是 Letter（612×792）、沒有文字，報告共 3 頁。可見新的 PDF 檢查確實抓得到 R2 的缺陷。

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
- `backend-related-tests.txt`：在 R4 部署候選上跑 6 個相關測試檔，**87 passed，exit 0**。
- `frontend-checks.txt`：R4 部署候選上 `tsc`、eslint（`--max-warnings 0`）、`npm run build` 都是 exit 0。建置出的 CSS 含隱藏其他元素的規則、`#itr-single-print-root` 規則，以及 `@page audit{size:A4 portrait!important;margin:13mm 12mm!important}`。
- `browser-check.txt`：隔離環境 8320/3320，從 R4 部署候選啟動，全新資料庫。
  - `audit-print-template-check.mjs` **ALL PASS**，共 18 項：
    - 先用 SPA 開過 12 個有列印 CSS 的模組，重現空白頁、頁面大小被蓋掉、ITR 常駐容器這三種情境；setup 確認那些規則都已載入。
    - **實際的 PDF**：計畫 1 頁、查檢表 1 頁、報告 2 頁，每一頁都有文字，全部是 A4 直向（595×842pt）。三個按鈕各自印出正式內容、`#root` 隱藏、沒有按鈕或圖示、印完卸載。
    - plan 和 checklist 的內容正確。
    - **報告涵蓋 Word 的每一段文字**：106 段，只略過 10 段寫法不同的行（Rev 和狀態那一行、簽核欄的「姓名／日期／單位」行）；章節順序也和 Word 相同。
    - 有未儲存修改時會標示。
    - 連按兩次、沒有 afterprint，仍會列印兩次，且畫面上只有一份列印內容。
    - 具名頁面規則存在，而且 Audit.print.css 沒有不具名的 `@page`。
    - **完成率：8 題完成 1 題時，精靈統計卡、列印、Word 都是 13%；40 題完成 23 題時三者都是 58%。**
    - 只有條文的題目只印條文。
  - 回歸測試：`audit-export-docx-check.mjs`、`audit-layout-check.mjs`、`audit-smoke-all.mjs`（使用 smoke 原本的 hardening_b + polish 種子資料）都是 ALL PASS，每一支都在全新的 stack 上執行。
- 列印成品（R4，`preferCSSPageSize`，先開過全部模組）：`print-report.pdf`（2 頁）、`print-plan.pdf`（1 頁）、`print-checklist.pdf`（1 頁），以及各自第 1 頁的縮圖 png。改版前的對照：`before-print-report-step4.png`。重現空白頁 bug 的腳本：`blank-page-repro.mjs`。
- Python 3.11 完整測試（在 `cand-live2` 上執行，後端與 R4 相同）：**1 failed、2379 passed、16 skipped，pytest_exit=1**（`py311-full-suite-cand-live2.txt`）。
  - 失敗的是 `test_itr_state_protection_http.py::test_a_result_change_committed_first_is_seen_by_create_ncr_and_reinspection[re-inspect]`，屬於 ITR 的並發競態測試。本輪沒有動到 ITR 的程式或測試；這個測試檔和 `688d87b3` 逐位元組相同。
  - 在同一份候選、同一個 python:3.11-slim 映像上，把這個測試檔重跑 10 次，**10 次都是 24 passed**（`py311-itr-test-rerun-x10.txt`）。
  - 判斷是偶發的計時問題，但第一次執行只保留最後 3 行，沒有失敗訊息，無法證實。
  - **因此還不能部署後端。** 最終部署候選要等 ITR 上線後，以那時正式站的版本（`4bdc49ec`）加上 G.patch 重建，重跑完整的 3.11 並保存完整輸出。如果同一個測試又失敗，就停下來回報，另開一輪處理。

## 行為變化
- 三個列印按鈕都改成印正式格式。「列印報告」和 Word 內容相同。
- 開過任何其他模組後再列印，不會再是空白頁，也不會多出空白的第 1 頁。Audit 的頁面設定不會影響其他模組，其他模組的設定也不會影響 Audit。
- 完成率剛好是 .5% 時，畫面、列印、Word 一律進位。例如 12.5% 顯示為 13%；Word 以前會顯示 12%。
- 少數比例在畫面上的數字會變：JS 的浮點誤差會讓少數組合少算 1%，例如 23/40 以前顯示 57%，現在是 58%。

## 未做／限制
- 沒有在 Safari 或 Firefox 實測 `:has()` 和具名頁面。不支援 `:has()` 的舊瀏覽器會把畫面和列印內容一起印出來，但不會是空白頁。
- `@page` 加 `!important` 是審查實測有效的做法；Chromium 上已用 PDF 驗證，其他瀏覽器沒有驗證。
- 部署需要重建後端（sudo）並切換前端。
