# ITP-CRITERIA-LAYOUT-2026-001 — 瀏覽器驗收實際結果（2026-10-07，約 14:38–14:55Z）

環境：隔離堆疊 backend `127.0.0.1:8260`、vite `127.0.0.1:3260`（run 目錄 `/private/var/folders/l3/76bnxp9x47159snm4w96_r6w0000gn/T/qualitas-manual-o0cbz3ml`），
種子 `backend/scripts/verification/seed_itp_input_ux_review.py`（帳號 `itpux_full`，一次性密碼存於 scratchpad、不入 repo）。
前端為工作樹版本（兩個檔案的 SHA-256 見 `tsc.txt` 等檔頭）。未使用 8240／3240、8198／3198。

量測方式：在頁面內以 JavaScript 讀 `getBoundingClientRect()`、`scrollWidth/clientWidth` 與 textarea `value`；
每條 Criteria 外框有 `data-criteria-row` 屬性供定位。以下數值為工具回傳的實際結果（節錄）。

## 1. 寬桌面（Claude in Chrome，視埠 1920×770；`/itp/iux-itp-1` 編輯 B1）
- 面板內容寬 1498px；`bodyOverflowX = 0`。
- 3 條 Criteria：每條 `sameTop = true`、`enLeftOfCh = true`；EN 框 x 269–935、中文框 x 947–1614；編號 1／2／3 與刪除鈕皆在該條外框內（`badgeInsideRow`、`delInsideRow` 皆 true）。
- Phase（編輯模式）：grid `705.5px 705.5px`，下拉選單寬 706／面板 1435，比例 0.49。
- 長多行文字（第 2 條 EN 329 字元、中文 94 字元，各 2 個換行）：`overflowX = 0`；兩框各自 `scrollHeight` 96／76 > `clientHeight` 56，即超過兩行時在框內捲動，可往下拉高（`resize-y`）。
- 截圖：`01`（Criteria）、`02`（Phase 半列）、`03`（長多行）。
- 注意：曾嘗試把 Chrome 視窗調為 1440／1280 寬，但視埠仍為 1920（視窗為全螢幕或最大化），故一般桌面改用內建瀏覽器模擬（§2）。

## 2. 一般桌面（內建瀏覽器，視埠模擬 1366×768）
- `/itp/iux-itp-1` 編輯 B1：`overflowX = 0`，面板 1317px；3 條皆 `sameTop`、`enLeftOfCh`，EN／中文框各 576px，編號與刪除在框內。截圖 `06`（此時第 2 條已是儲存後重新載入的多行內容）。
- `/itp/iux-itp-1` 新增（標題「Add New Inspection Item」）：Phase 與 Insert After 同列（grid `615px 615px`，`sameRow`、`phaseLeftOfInsert` 皆 true）；新增 3 條長文字 Criteria，3 條皆 `sameTop`、`enLeftOfCh`、編號 1／2／3 與刪除在框內；`overflowX = 0`。截圖 `07`。
- 清單頁 `/itp` → 列點擊開「Edit ITP」→「Inspection Plan (2)」→ B1 的 Edit（`ITPAdvancedEditor`）：3 條同上全部符合；Phase 比例 0.49；`overflowX = 0`。截圖 `08`。
- 清單頁「Add New Item」（`ITPAdvancedEditor` 新增）：Phase 與「Insert After (插入位置)」同列；3 條 Criteria 全部符合；`overflowX = 0`。截圖 `09`。

## 3. Cancel 不套用（寬桌面，`/itp/:id` 編輯 B1）
- 修改第 2 條中英文後按 Cancel → 出現既有「Unsaved Changes」對話框（截圖 `04`）→ 選 Leave。
- 面板關閉；表格內不含新文字（`tableHasNewText = false`、`tableHasCh = false`）。
- 重新開啟 B1：3 條 Criteria 與修改前快照逐字相同（`identicalToOriginal = true`）。
- 另外兩次（新增面板、清單頁新增）以 Cancel → Leave 關閉，表格無新文字，皆未儲存。

## 4. 底部按鈕不遮住最後欄位（寬桌面）
- 捲到最底（`atBottom = true`）：最後一個可見欄位為 HSE 下拉，底邊 y=718；內容區底邊 777；底部按鈕列（Cancel／Apply）頂邊 777 → `lastFullyVisibleAboveFooter = true`。截圖 `05`。

## 5. Apply → Save → 重新開啟（寬桌面，`/itp/:id`）
- 修改第 2 條：EN 3 行（2 個 `\n`），中文 3 行（2 個 `\n`）。
- Apply：面板關閉，表格出現新文字。Save Document：toast「Saved successfully!」。
- 重新載入頁面（從伺服器讀取）→ 開 B1：`row2EN_exact = true`、`row2CH_exact = true`、換行數 EN 2／中文 2；`row1Unchanged = true`、`row3Unchanged = true`。
- 清單頁 `ITPAdvancedEditor` 開同一筆 B1 時也顯示相同多行內容（截圖 `08`）。

## 未驗證／限制
- 手機與窄螢幕（< 640px，`sm` 以下會改回上下堆疊）：依指示延期，未驗收。
- 寬桌面只驗了 `ITPDetail`；`ITPAdvancedEditor` 只在 1366 驗（兩者相同 class，未在 1920 另截圖）。
- 往返儲存只在 `ITPDetail` 入口做；`ITPAdvancedEditor` 的 Apply→Save 未在本輪重做（本批未改其保存邏輯）。
- 內建瀏覽器截圖為縮小後的 800px 寬影像。
- 隔離資料庫內 B1 第 2 條已被改成測試文字（僅隔離環境）。
