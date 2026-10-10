# ITP-SUBJECT-WIDTH-2026-001 — 瀏覽器驗收實際結果（2026-10-07，約 15:20–15:30Z）

環境：隔離堆疊 backend `127.0.0.1:8280`、vite `127.0.0.1:3280`（run `f9d0b096`，目錄 `qualitas-manual-vuzvhkp2`）；種子 `seed_itp_input_ux_review.py`，帳號 `itpux_full`（一次性密碼存 scratchpad，不入 repo）。
瀏覽器：Claude 內建瀏覽器，視埠模擬 1366×768（一般桌面）、1920×1080（寬桌面），另量測 1024×768。未使用 8240／3240、8198／3198。
量測：頁內 JavaScript 讀 General Information 的 `formGrid` 各欄位 `getBoundingClientRect()`、Subject 輸入框 `clientWidth`／`scrollWidth`、彈窗內容區與整頁的 `scrollWidth − clientWidth`。以下為工具回傳的實際值（節錄）。

## 1. 編輯（清單列點擊開 `QTS-IUX1-ITP-000001`，共用元件 `ITPDetailModal`）

| 視埠 | 欄位排列（依列） | Subject 輸入框／內容列 | 水平溢出（內容區／整頁） |
|---|---|---|---|
| 1366×768 | ① Reference no. 402px＋Contractor 823px ② Subject 1243px ③ Updated Date、Due Date、Version 各 402px | 1243／1243（比例 1.000），單獨一列 | 0／0 |
| 1920×1080 | ① 587＋1192 ② Subject 1797 ③ 587×3 | 1797／1797（1.000），單獨一列 | 0／0 |

（畫面上 Submission Date 的標籤為既有文字「Updated Date」、Rev 為「Version」，本批未改標籤。）

長主旨（206 字元，中英混合真實長度）：`Structural Rebar Installation, Lap Splice, Concrete Cover and Stirrup Spacing Inspection and Test Plan for East Wing Foundation Pile Caps, Columns and Transfer Beams (Levels B2–3F) – 東翼基礎樁帽、柱及轉換梁鋼筋組立檢驗與試驗計畫`
- 1366：文字寬 1434px > 輸入框 1241px → 仍需在單行框內捲動（原本可見寬度約 402px）。截圖 `02`。
- 1920：文字寬 1795px ≤ 輸入框 1795px → 一行完整顯示。截圖 `03`。

## 2. 新增（「+ Add ITP」，同一元件）
- 1920：排列與編輯相同（587＋1192／1797／587×3），溢出 0／0。截圖 `04`。
- 1366：① 397＋813 ② Subject 1228（1.000）③ 397×3，溢出 0／0。截圖 `05`。新增模式上方另有既有的 Project 欄位（未改）。
- 兩次都以 Cancel 關閉，未建立紀錄（清單仍 1 筆）。

## 3. 保存往返（1366，編輯）
- 填入上述 206 字元主旨 → 底部 Save → 彈窗關閉（本次未擷取到 toast）。
- 強制重新載入 → `GET /api/itp/iux-itp-1` 的 `description` 與輸入值逐字相同（`apiDescriptionExact = true`）；重新開啟後輸入框值逐字相同（`reopenedInputExact = true`，長度 206）；清單列顯示新主旨開頭。

## 4. Cancel 不保存（1366，編輯）
- 把主旨改為 `CANCEL TEST – this edit must not be saved` → Cancel → 出現既有未儲存提示 → Leave。
- `GET /api/itp/iux-itp-1` 仍為 206 字元主旨（`apiStillLong = true`）；重新開啟仍為原值（`reopenedStillLong = true`）；清單無 CANCEL TEST 文字。

## 5. 1024×768（量測，非本批要求寬度）
- 共用 `formGrid` 在 ≤1024px 變兩欄（既有 CSS）。排列：① Reference no.＋Contractor ② Subject（整列）③ Updated Date＋Due Date ④ Version 單獨，**右側空一格**。改動前 6 欄在兩欄時剛好排滿，此空格為本批新產生。溢出 0／0。未截圖。

## 未測
- 手機（延期）。
- 中文介面的欄位排列（標籤文字較短，排列邏輯相同，未實測）。
- 鍵盤 Tab 順序（DOM 順序改為 Reference no.→Contractor→Subject→日期→Version，未實際以鍵盤操作驗證）。
