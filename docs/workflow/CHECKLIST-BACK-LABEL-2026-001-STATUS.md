# STATUS — CHECKLIST-BACK-LABEL-2026-001

> 本檔先記 R1（Back to ITP 標籤），R2（按鈕列重排＋Word 匯出）見文末「R2」。R1 版本未提交，與 R2 一起提交。

TASK_ID: CHECKLIST-BACK-LABEL-2026-001
基準：worktree `nostalgic-mestorf-ee1943`，分支 `claude/brave-lamport-d2e0fe`。開工前以 `git merge 632cf475` 對齊（合併提交 a5615f06，`git diff 632cf475 a5615f06` 為空，內容與正式站相同）；未用 reset／checkout／stash。

## 本輪修改
| 檔案 | 內容 |
|------|------|
| `react-app/src/components/Checklist/Checklist.tsx` | 新增 `backToItp = fromSource === 'itp' && !!returnItpId`，handleBack 改用同一變數（行為不變）；傳給 ChecklistEditor；底部 cancel 按鈕在 backToItp 時顯示 `<ArrowLeft size={16} /> {t('checklist.backToItp')}`，否則照舊 `t('common.cancel')`。onClick 仍是 `requestCancel`（LeaveGuard）。 |
| `react-app/src/context/LanguageContext.tsx` | 只加 2 行：en `'checklist.backToItp': 'Back to ITP'`、zh `'checklist.backToItp': '返回 ITP'`，各插在 `checklist.reopenHint` 之後；檔案維持 CRLF，diff 只有這 2 行。 |
| `react-app/tests-browser/checklist-back-label-vite-launcher.mjs`（新） | 8374／3374，cacheDir `.vite-chkback-3374`。 |
| `react-app/tests-browser/checklist-back-label-check.mjs`（新） | Playwright 實測腳本。seed 沿用 `seed_checklist_template_layout_review.py`（未改）。 |

## 執行證據
- `npx tsc --noEmit -p .`：exit 0。
- `npx eslint --max-warnings 0 Checklist.tsx LanguageContext.tsx`：exit 0。
- `npm test`：173 pass／0 fail。
- 瀏覽器實測（隔離環境 8374／3374，Chromium headless）：`CHECKLIST-BACK-LABEL-2026-001-evidence/browser-check.txt`，17 PASS／0 FAIL。
  - A：在 ITP 編輯視窗點 Records 連結進入範本（網址 from=itp&returnItp），底部只有「Back to ITP」（含圖示），沒有 Cancel；點擊後經 `/itp?reopenItp=<id>` 重新開啟同一份 ITP（視窗顯示 QTS-CTL1-HL-ITP-000001）。
  - B：改了內容再按 Back to ITP，先出「Unsaved Changes」提醒、仍停在 Checklist；Stay & Save 保留修改；Leave 回到同一份 ITP。
  - C：中文介面 1024 寬顯示「返回 ITP」（含圖示），單行、無頁面溢出；中文沒有 returnItp 時顯示「取消」。
  - D：結果欄模式（有 template_id 無 ITR 的實例）與唯讀的歷史範本，帶 returnItp 時都顯示 Back to ITP；實例按下後回到同一份 ITP。
  - E：範本庫深連結、from=itr、from=itp 無 returnItp（實際來源是 `/itp/:id` 頁 ITPDetail.tsx 的連結；ITP 編輯視窗的 Record 連結與 Generate Checklist 都會帶 returnItp，顯示 Back to ITP）、實例無 returnItp、範本庫 New Template，全部顯示 Cancel。
- 截圖：A-template-from-itp-1440、A-back-reopened-itp-1440、B-unsaved-warning-1440、C-zh-template-from-itp-1024、D-instance-from-itp-1440、E-library-new-template-1440。

## 未測／已知
- 從 ITP（帶 returnItp）開範本、存檔後回到範本清單時，網址仍帶原本的 from=itp&returnItp，所以再從清單點開別的範本或按 New Template，按鈕也會顯示 Back to ITP。這和 PR #8 原本的返回行為一致：這種情況按 Cancel 本來就會回到 ITP，標籤只是如實顯示去處。本輪沒有改這個行為，也沒有實測這條路徑。
- 只測 Chromium。

## 審查
R1 PASS（見 REVIEW）。審查建議 2、3 為措辭修正，已改。

---

# R2：按鈕列重排＋Checklist Word 匯出

## 本輪修改（R2 新增部分）
| 檔案 | 內容 |
|------|------|
| `backend/routers/checklist.py` | 新增 `GET /checklist/{checklist_id}/export-docx`（`RoleChecker(CHECKLIST_VIEW)`＋`get_scope`，ValueError → 404），寫法同 routers/noi.py 的 export。 |
| `backend/services/checklist_service.py` | 新增 `ChecklistService.export_docx`：用 `get_checklist(scope)`（同讀取，範圍外 404），依列印版順序以 docx_builder 產生：masthead（現場檢驗查核表 FIELD INSPECTION CHECKLIST、Doc No.、Rev、狀態）、Activity、Project Title／ITR No.／NOI／Contractor／Insp. Date／Location、項目表（#、Inspection Item、Criteria、Actual Situation、Result，多一列空白再 -END-）、兩個聲明勾選、Re-inspection Date／NCR No.（勾選全部合格時 N/A）、Remarks、三格簽名。結果文字 `_docx_result_label`：O 合格 Pass、X 不合格 Fail、/ 不適用 N/A（附原因或「歷史資料未記錄原因」）、空白「未填 Not filled」、其他「未知值 Unknown value: 原值」——同 utils/checklistResult.ts 與列印版。不分模式（使用者選 B）。兩檔維持 CRLF。 |
| `backend/tests/test_checklist_export_docx_http.py`（新） | 6 個 HTTP 測試：範本 200＋內容（空白表、舊換行保留、空白列＋-END-、N/A）、實例結果與 N/A 原因／未知值、不存在 404、他專案 404（同讀取）、無 checklist:view 403、未登入 401。 |
| `react-app/src/services/api.ts` | 新增 `exportChecklistDocx`（同 exportNoiDocx 的 blob 下載）。 |
| `react-app/src/components/Checklist/Checklist.tsx` | FormActions：返回／取消、列印、匯出 Word 都放 `tools`（左）；`primary`（右）只放儲存；Reopen 仍在 `secondary`（右，儲存左邊，只在 Pass／Fail 實例出現）。`handleExportDocx`：新範本或 `leaveGuard.dirty` → `toast.warning(checklist.exportSaveFirst)` 不匯出；匯出中按鈕停用（與儲存中同）；失敗 `console.error`＋`toast.error(common.exportFailed)`。說明文字移到左側按鈕之後（只在可編輯的既有範本顯示，同原條件加 !readOnly——唯讀時原本整個 primary 區不顯示，說明也不顯示，行為不變）。 |
| `react-app/src/components/Checklist/Checklist.module.css` | `.webEditor` 設 `container: checklist-editor / inline-size`；`.saveHint` 為 `flex: 1 1 0; width: 0; min-width: 0`：不計入左側按鈕群寬度（儲存鈕不會被擠到第二列），只填按鈕列剩餘空間、不足時就地折行；編輯器 ≤1000px 時改為按鈕下方獨立一列（`flex: 0 0 100%`）。（審查 R2-1 指出原本 900px 斷點＋nowrap 在編輯器約 901–943px 會讓儲存換列，已改。） |
| `react-app/src/context/LanguageContext.tsx` | 再加 2 行：`checklist.exportSaveFirst`（en／zh），緊接 `checklist.backToItp`。共 4 行，CRLF 不變。 |
| `react-app/tests-browser/checklist-back-label-check.mjs` | 加 F（按鈕列順序、同列、儲存靠右、說明位置，1440／1024，範本／實例／無 returnItp）與 G（下載 docx 並以 python-docx 讀出檢查、匯出中停用、未存修改與新範本提示請先儲存、唯讀帳號可匯出且右側無儲存）。 |

## R2 執行證據
- `npx tsc --noEmit -p .`：exit 0；`npx eslint --max-warnings 0 Checklist.tsx LanguageContext.tsx api.ts`：exit 0；`npm test`：173／0；`npx vite build`：成功，產出 CSS 含 `container:checklist-editor / inline-size` 與 `@container checklist-editor`。
- 後端（拋棄式 DATABASE_URL，Python 3.14 本機）：`tests/test_checklist_export_docx_http.py` 6 passed；`tests/test_checklist_*.py`＋`test_itr_checklist_http_e2e.py`＋`test_itp_checklist_km_project_audit_http.py` 共 260 passed（含新檔）。3.11 全套由協調中心於部署前執行，本輪未跑。
- 瀏覽器（隔離 8374／3374，重建後端後）：`evidence/browser-check.txt` 90 PASS／0 FAIL（R1 的 A–E 17 項＋R2 的 F、G）。
  - F：1440、1280、1260、1240、1024，範本／實例／無 returnItp，左＝返回 ITP（或 Cancel）、Print、Export Word，右＝只有儲存；四顆按鈕同一列同高、無頁面溢出。範本說明在 1440 與按鈕同列（一行），在 1280／1260／1240／1024 位於按鈕下方獨立一列（一行），都不與儲存鈕重疊。
  - G：範本與實例各下載一次，檔名為 Form ID；以 python-docx 打開，含標題、Form ID、Activity、五欄表頭、項目內容、-END-、簽名；實例含「合格 Pass」「不合格 Fail」與 N/A 原因，範本為「未填 Not filled」。匯出中按鈕為 disabled（兩次都觀察到）。改了內容再按匯出 → 出現「Save first, then export」、沒有下載；New Template 按匯出 → 同提示。唯讀帳號：左側三顆、右側無儲存，可以匯出。
  - 下載的檔案留在 evidence（G-template-….docx、G-instance-….docx）。
- `container-type` 會讓 `.webEditor` 成為固定定位元素的定位基準：讀碼確認編輯器內沒有 fixed 元素（LeaveGuard 的確認視窗由 Provider 繪製在外層），截圖 B-unsaved-warning-1440 的視窗仍置中於視窗。

## R2 未測／已知
- 範本 Result 欄每列顯示「未填 Not filled」，與列印版相同（列印版 resultLabel('') 即 Not filled），符合使用者選的「完全照列印版」；Actual Situation 為空白。
- 與列印版的樣式差異沿用 docx_builder 既有樣式（審查 R2 建議 2，未改）：masthead 為公司名稱佔位並顯示狀態（範本為 ONGOING）；空白欄位顯示「—」；-END- 未跨欄合併；簽名格多姓名／日期／單位三行；items 中非物件元素略過。
- docx 只用 python-docx 讀文字與表格結構檢查，未在 Word／LibreOffice 實際開啟看版面。
- 列印版本身未改；Word 依使用者選 B 與列印版同內容，但字型、格線等版面以 docx_builder 既有樣式為準（與 NOI／ITR 匯出一致），不是逐像素相同。
- 匯出的是已儲存的資料：Activity 欄位名稱等未存修改不會出現在檔案中（因此先提示請先儲存）。
- 只測 Chromium。

## R2 審查
第一次 REVISE（1 項必須修：儲存鈕在約 1229–1271px 寬換列），已修；差異複審 PASS（見 REVIEW）。
