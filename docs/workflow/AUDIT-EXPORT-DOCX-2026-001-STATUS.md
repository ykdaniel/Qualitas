# AUDIT-EXPORT-DOCX-2026-001 — STATUS（R2，PASS）

TASK_ID: AUDIT-EXPORT-DOCX-2026-001
ROUND: R2。基準 HEAD `37d71b03`。差異見 `evidence/G.patch`（SHA-256 `05fec531e07467ed7e3d73a4a7c2e8ce18df367742115ae4bc6e99f2dfbc30e0`，9 個檔案；R1 版本留存為 `G-R1.patch`）。候選樹是 `git archive HEAD` 套上 G.patch，9 個檔案都和工作樹逐位元組相同。
審查結果 R2 PASS（見 REVIEW）。上線紀錄附在文末。

## RESULT
- [x] DONE（交 R2 獨立審查）

## R2 修正（R1 審查 REVISE，原文留存於 `AUDIT-EXPORT-DOCX-2026-001-R1-REVISE-REVIEW-archive.md`）
- **必改項**：查檢項目的 `status` 如果是陣列或物件（新增 API 收 `Any`，能存進去），`_RESULT_TEXT.get(...)` 會丟出 `TypeError: unhashable`，匯出回 500。已修正：`export_docx` 新增 `status_key(item)`，不是字串的一律當成 None，顯示「注意／待改善」，和精靈的算法一致（統計原本就用 `==` 比對，不受影響）。
  - 新測試 `test_a_status_that_is_not_a_string_counts_as_pending`：透過 API 建立含陣列、物件、數字和 pass 四種 status 的紀錄，匯出應為 200，前三項顯示「注意／待改善」，完成率 25%。
- **非阻擋建議，順手處理**：種子腳本在沒有設定 `DATABASE_URL` 時直接拒絕執行（exit 1），不會落到開發資料庫。已實測。
- **非阻擋建議，未處理**：`console.error`（repo 沒有 logger，同檔案原本就這樣寫）；查檢項目編輯框還沒套用時不提醒（這些內容本來就不在已儲存資料裡）。

## 修改
| 檔案 | 內容 |
|---|---|
| `backend/routers/audit.py` | 新增 `GET /audit/{audit_id}/export-docx`（RoleChecker(AUDIT_VIEW)）。service 回 None 時回 404「Audit not found」。不是用 `except ValueError`，所以產生文件時的錯誤不會被誤報成 404。 |
| `backend/services/audit_service.py` | 新增 `AuditService.export_docx`，使用 `get_audit(scope)` 取得紀錄，以 `core/docx_builder` 產生 6 個章節（見 TASK）。新增常數 `_STATUS_TEXT`、`_RESULT_TEXT`、`_ITEM_COLUMN_WIDTHS_CM`、`_XML_UNSAFE`，並新增 `import re`。仍是 CRLF。 |
| `backend/tests/test_audit_export_docx_http.py`（新） | 9 個測試，詳見下方。 |
| `backend/scripts/verification/seed_audit_export_docx_review.py`（新） | 隔離環境用的種子資料：一筆填滿的 Audit `AHB-EXPORT-1`。沒有 `DATABASE_URL` 時拒絕執行。 |
| `react-app/src/components/Audit/AuditWizard.tsx` | 第 4 步「列印報告」旁加入「匯出 Word」按鈕與 `handleExportDocx`。仍是 CRLF。 |
| `react-app/src/components/Shared/LeaveGuard.tsx` | `useDraftGuard` 多回傳 `dirty`，原本的判斷式不變，只是抽成變數。 |
| `react-app/src/context/LanguageContext.tsx` | 中英各新增 3 個 key：`audit.wizard.exporting`、`exportSaveFirst`、`exportFailed`。按鈕文字沿用既有的 `common.exportWord`。仍是 CRLF。 |
| `react-app/src/services/api.ts` | 新增 `exportAuditDocx`，下載方式與 `exportNcrDocx` 相同。 |
| `react-app/tests-browser/audit-export-docx-check.mjs`（新） | 隔離環境的瀏覽器檢查腳本。 |

### 匯出規則與取捨
- **計數方式同精靈**：結果不是 pass 或 fail（包括沒有狀態）的項目都算「注意／待改善」。完成率 = (總數 − 待改善) / 總數，四捨五入。
- **專案名稱**：有 `project_id` 時，取專案資料表的「[代號] 名稱」，和精靈下拉選單的格式相同；沒有時用舊欄位 `project_name`。
- **XML 不允許的字元**：控制字元、單獨的 surrogate、U+FFFE/U+FFFF 會被移除，不讓 python-docx 拋出 ValueError。只是空白的值顯示成「—」。
- **明細表欄寬**：Word 預設各欄等寬，所以設定為 0.9／1.7／6.2／2.3／4.3／2.0 cm，合計 17.4 cm，等於 A4 扣掉頁邊距。
- **簽核欄位**：「受稽核方代表」的姓名留空，由人親筆填寫；`contractor` 是公司名稱，不是人名。日期全部留白。
- **未儲存修改的處理**：前端擋下匯出並提示，不匯出舊內容。NCR 的匯出沒有這道檢查，本輪沒有去改 NCR。

## 證據（`AUDIT-EXPORT-DOCX-2026-001-evidence/`）
- `backend-related-tests.txt`：在 R2 候選樹上執行 6 個相關測試檔（Audit 匯出、Audit hardening、Audit scope、docx 路徑防護兩檔、承包商選項），**86 passed，exit 0**。同一棵候選樹上，前端 `tsc --noEmit -p .` exit 0；eslint（4 個改動的檔案，`--max-warnings 0`）exit 0。
- 新測試 9 個（第 4 項是 R2 新增）：
  1. 完整內容：每個章節的值都在；Content-Type 和檔名正確；統計為 4/50%/1/1/2；明細的順序、結果文字、多行備註、空白欄位顯示「—」；欄寬。
  2. 沒有查檢項目、選填欄位空白時：顯示「尚無查檢項目」，發現欄顯示提示文字。
  3. 舊資料（JSON 壞掉、型別不對、NULL；只有 project_name）匯出仍是 200。
  4. 查檢項目的 status 不是字串（陣列、物件、數字）時，算成「注意／待改善」，不會出錯。
  5. 含 XML 不允許的字元時被移除，不會出錯。
  6. 不存在的紀錄回 404。
  7. 綁定承包商的使用者只能匯出自己承包商的紀錄，別家回 404（不洩漏是否存在）。
  8. 綁定專案的使用者匯出別的專案回 404。
  9. 沒有 audit:view 回 403，未登入回 401。
- `browser-check.txt`（隔離環境 8320/3320，從 R2 候選樹重新啟動，全新資料庫）：7 項 **ALL PASS**。
  - 按鈕只出現在第 4 步、在「列印報告」旁邊，下載的檔案是 `AHB-EXPORT-1.docx`（確認是 zip 格式）。
  - 有未儲存的修改時跳出提示，不下載。
  - 新紀錄在儲存草稿之前沒有按鈕，儲存後可以匯出新編號。
  - 只能檢視的使用者、Void 紀錄都可以匯出。
  - 英文介面的按鈕文字正確；列印時按鈕隱藏。
  - 截圖：`step4-export-button.png`、`unsaved-warning.png`。
- `sample-AHB-EXPORT-1.docx`：隔離環境匯出的樣本。`sample-AHB-EXPORT-1-page1-quicklook.png` 是 macOS Quick Look 產生的第 1 頁縮圖。Quick Look 不畫表格框線，也不套用欄寬，所以只能看內容和章節順序，不代表 Word 裡的實際外觀。
- Python 3.11 完整測試：R1 候選樹那一次跑到一半就停了，因為已有 REVISE。改用 R2 候選樹重跑，結果 **2379 passed、16 skipped，pytest_exit=0**，耗時 48 分 42 秒（`py311-full-suite.txt`）。基準是 `37d71b03`，已含 MATERIAL-API-CLOSE 刪改的材料測試，所以總數不能直接和上一輪的 2386 比較。

## 未做／限制
- 沒有用 Microsoft Word 開啟樣本目視確認，只用 python-docx 讀回內容，再看 Quick Look 縮圖。版面元件和 NCR 匯出相同。
- 部署需要後端重建（sudo）和前端切換。另一個工作階段（登入測試／MATERIAL-API-CLOSE）可能正在部署，要等它結束才能部署本輪。

## 上線紀錄（2026-10-10，依 DECISIONS 的 PASS 後部署授權）
- 提交與推送：`774eb27f`（程式，9 個檔案；staged diff 的 SHA-256 等於 G.patch `05fec531…30e0`）、`dbed9845`（文件），推送到 `ui/sidebar-shell-preview`。
- 部署時機：「登入測試」工作階段的 MATERIAL-API-CLOSE 已在 03:45Z 上線，沒有和本輪混在同一次重建裡。準備前也確認了線上的材料與 Audit 後端檔案都等於 HEAD `37d71b03`。
- NAS 工作目錄：`~/deploy-audit-export-docx-20261010T052217Z`。
  - 準備：線上 2 個後端檔案等於 HEAD `37d71b03`；前端是 CONTRACTOR-OPTIONS 的入口 `93b7672a…`。
  - 備份：資料庫線上備份 integrity ok（`fd3aa04c…`）、`backend-old/`、前端舊入口。
  - 暫存區逐檔 OK（後端 2 檔、前端 106 檔，沒有 `._` 檔）（`nas-prep-output.txt`）。
- 後端：套用 2 個檔案（`apply-backend-output.txt`）。
  - 第一次 sudo 重建因為密碼提示逾時，沒有執行（`sudo: timed out reading password`），正式站仍是舊程式；第二次重建成功。
  - 回退映像：`qualitas-backend:pre-audit-export-docx-20261010T052217Z`。
  - 新容器 `387f0de6e736` 在 2026-10-10 07:24:40Z 啟動，是第 161 次啟動紀錄，部署前為 160 次。啟動時自動備份 `qualitas_20261010_072440.db`，migration 完成，權限同步 72 項，排程啟動。日誌沒有 ERROR、Traceback 或 ABORTED（`backend-startup-check.txt`）。
  - 三個容器都是 Up。
- 前端：07:25Z 新增 67 個資產（另有 38 個原本就有），之後原子替換 `index.html`。dist 的 inode 沒變，106 個候選檔案全部在線上（`apply-frontend-output.txt`）。
- 對外核對（`post-deploy-http-check.txt`）：
  - `/` 與 `/index.html` 都是 200，雜湊為 `cd426c4f…25a6`，等於候選版本。
  - 主 bundle 和 Audit chunk 都是 200，上一版的主 bundle 仍是 200。
  - 未登入時 `/api/user/profile` 回 401。
  - 未登入時 `/api/audit/<id>/export-docx` 回 401，不是 404，表示新路由已經註冊。
- 隔離環境 8320/3320 已關閉。
- 回退：前端用 `rollback-frontend.sh`；後端用 `rollback-backend-code.sh` 再重建，或改用 pre-audit-export-docx 映像。沒有資料庫結構變更。
- 未完成：登入後的唯讀冒煙由使用者執行。請打開任一筆 Audit，到第 4 步按「匯出 Word」，看下載的報告內容和格式。這一步不會建立資料。
