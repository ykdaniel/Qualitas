# REVIEW — CHECKLIST-BACK-LABEL-2026-001

TASK_ID: CHECKLIST-BACK-LABEL-2026-001

## R1：PASS（2026-10-12，獨立 Claude 審查，只讀）
1. 標籤與返回條件一致：`backToItp = fromSource === 'itp' && !!returnItpId`（Checklist.tsx:105），handleBack（:108）與按鈕標籤（:911-913）共用；空字串 returnItp、只有 returnItp 沒有 from=itp 時兩邊都為 false。存檔回清單後網址仍帶 returnItp 的路徑，標籤與去處仍一致（PR #8 既有行為，讀碼）。
2. 行為不變：onClick 仍為 requestCancel → LeaveGuard；handleBack 四個分支內容與順序未變。
3. 入口：Record 連結（ITPAdvancedEditor.tsx:67）與 Generate Checklist（ITPModals.tsx:519）經 checklistFromItpPath 帶 returnItp；ITPDetail.tsx:68 與 ITRModals.tsx:919 不帶，顯示 Cancel。範本、結果欄實例、唯讀歷史範本皆涵蓋。
4. LanguageContext.tsx：+2／-0（:456 en、:2838 zh），全檔 CRLF（3374／3374），鍵名不重複。Checklist.tsx 仍全檔 CRLF、權限 100755。
5. 範圍：只改 Checklist.tsx、LanguageContext.tsx；無後端變更；seed 未動。
6. 測試腳本：密碼只從環境變數讀；不碰 qualitas.db；獨立 cacheDir。
審查者重跑：tsc exit 0、eslint 0 錯、npm test 173／0。

必須修：無。
建議與處理：
1. 提交時避開 `react-app/node_modules`（symlink）與 `.vite-chkback-3374/` → 提交時逐檔加入。
2. STATUS「已知」段落開頭措辭 → **已改**為「從 ITP（帶 returnItp）開範本、存檔後回到範本清單」。
3. E 項說明誤寫 Generate Checklist 不帶 returnItp → **已改**（TASK、STATUS、測試標籤）。
4. 範圍外：從 ITP 進入後存檔回到 Checklist 清單、不回 ITP（原有行為）→ 轉交協調中心參考，本輪不改。
5. tests-browser 腳本直接跑 eslint 有 `process` no-undef 等，與既有腳本相同，不在 `npm run lint` 範圍 → 不改。

## R2 第一次審查：REVISE（2026-10-12，獨立 Claude，只讀）
範圍：按鈕列重排＋Word 匯出（見 TASK「R2」）。
通過項目：
1. 後端權限與範圍：`RoleChecker(CHECKLIST_VIEW)`＋`get_scope`，同 read_checklist；範圍外與不存在皆 404、無寫入；測試涵蓋 200＋內容、404、他專案 404、403、401。
2. Word 內容對照列印版（使用者選 B）：順序、結果文字（與 utils/checklistResult.ts 一致）、N/A 原因、agreementChecked 的 N/A、空白列與 -END-、簽名；detail_data 為 null／壞 JSON／非物件、items 非陣列或混入非物件元素時皆不出錯（審查者另以拋棄式 SQLite 直接呼叫實測）。
3. 前端匯出：新範本或 dirty 時提示請先儲存、不送請求；匯出中停用並防重入；失敗 console.error＋toast；只經 services/api。
4. 按鈕列順序與說明條件正確；`.webEditor` 的 container 不影響編輯器內定位與其他使用 Checklist.module.css 之處。
5. CRLF 全數保留，api.ts 維持 LF；LanguageContext +4／-0。
6. 範圍：僅 6 個追蹤檔；列印版、ResultSelect、共用元件、schemas、models、migration 未動。
7. 密碼與資料庫：無寫死密碼，不碰 qualitas.db。
審查者重跑：後端 export 測試 6 passed、`-k checklist` 310 passed；tsc、eslint exit 0；npm test 173／0。

必須修：
1. 編輯器寬約 901–943px（視窗約 1229–1271px）時，英文介面從 ITP 開範本，說明文字 nowrap 撐寬左側群組，「儲存範本」掉到第二列。→ **已修**：`.saveHint` 改為 `flex: 1 1 0; width: 0; min-width: 0`（不計入左側寬度，只填剩餘空間），斷點提高到 1000px；瀏覽器腳本加 1280／1260／1240 寬。

建議：
1. 範本 Result 欄為「未填 Not filled」而非空白（與列印版相同）→ 測試 docstring 已改正；請協調中心預覽時向使用者確認。
2. Word 與列印版的樣式小差異（docx_builder 既有樣式）→ 記入 STATUS，未改。
3. 提交時排除 `react-app/.vite-chkback-3374/` 與 `react-app/node_modules`（symlink）→ 提交時逐檔加入。

## R2 差異複審：PASS（2026-10-12，同一審查者）
- `Checklist.module.css:41-61`：寬版不計入按鈕群寬度；≤1000px 為按鈕下方獨立一列且仍 `width: 0`；CRLF 431／431。
- 審查者以靜態複製頁在 600、696、900、920、943、960、999、1000、1001、1010、1060、1100px 重驗：儲存皆與第一顆按鈕同列，說明不與儲存重疊（≤1000 在下方一行，≥1001 同列一行）。
- evidence：90 PASS／0 FAIL；1240／1260／1280／1024 四顆按鈕同 y，說明在下方一行；1440 同列。
- 測試 docstring 已更正；export 測試重跑 6 passed。
遺留：建議 2、3 同上；「範本 Result 顯示未填」請使用者確認。

## 使用者預覽（2026-10-12，協調中心轉達）
- Word 內容：使用者看過 3374 R2 後表示「word 內容目前可以」；範本 Result 欄維持「未填 Not filled」，不改為空白。
- 底部按鈕列排版：協調中心把 `[← 返回 ITP][列印][匯出 Word] …… [儲存範本]` 與說明文字的排法貼給使用者確認，使用者回「ok」。R1＋R2 確認，提交後交協調中心（與 NOI／NCR 合成一次後端重建，部署前跑 3.11 全套）。
