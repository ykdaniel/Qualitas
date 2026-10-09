# ITP 獨立詳情頁解析格式修正 — 2026-09-29（BACKLOG #35）

## 問題

`/itp/:id`（`ITPDetail.tsx`，真實可達路由，非死碼）原本用自己內嵌的解析邏輯讀取
`detail_data`：只認得舊版分階段物件 `{a:[...], b:[...], c:[...]}`，一旦資料是扁平陣列
（每筆項目自帶 `phase` 欄位——列表頁彈窗 `ITPModals.tsx`／`ITPAdvancedEditor.tsx` 透過共用
`utils/itpParser.ts::parseInspectionItems` 讀寫的格式），這個頁面就會判斷「沒有 a/b/c」而
直接顯示空白檢驗計畫，即使該筆記錄實際上有資料。此問題於排查 ITP Record 連結導錯（見
`docs/workflow/itp-record-link-fix-handoff.md`）時發現，記錄為獨立待辦 BACKLOG #35，本輪處理。

## 修正

`react-app/src/components/ITP/ITPDetail.tsx`：移除內嵌的 `if (details.a || details.b ||
details.c)` 專用判斷與逐階段 map，改為呼叫與列表頁彈窗相同的
`utils/itpParser.ts::parseInspectionItems(data.detail_data)`。該函式本來就同時接受兩種格式
（分階段物件、扁平陣列），並額外做雙語欄位正規化（把污染或舊版純字串欄位統一成
`{en, ch}`）、`criteria`／`vp`／`record` 缺省值填補——這些正規化列表頁彈窗本來就有，現在兩個
入口共用同一套邏輯，顯示內容不會再因入口不同而不一致。

保存邏輯（`saveToBackend`／`handlePublish`）未變動：兩者本來就都寫回分階段
`{a,b,c}` 物件（與列表頁彈窗的 `prepareDetailPayload()` 相同），本輪未觸碰。

未移除詳情頁、未改權限判斷、未新增必填規則、未改列表頁彈窗任何邏輯。

## 本輪驗證

真實隔離後端 + Chromium（`isolated_stack.py` 8198/3198、`project-create-vite.mjs`，密碼由隔離堆疊
`admin-password` 讀取，未寫死）。種子腳本
`backend/scripts/verification/seed_itp_detail_parser_fix_review.py` 建立 4 筆涵蓋不同
`detail_data` 形狀的紀錄，審閱腳本
`react-app/tests-browser/itp-detail-parser-fix-review.mjs` 實測：

1. **扁平陣列（原本會顯示空白的格式）**：列表頁彈窗顯示 3 筆項目；修正前 `/itp/:id` 會是 0
   筆——修正後兩個入口顯示的 3 筆項目文字與順序完全一致。
2. **舊版分階段物件（迴歸測試）**：兩入口本來就正常，修正後仍各自正確顯示 2 筆項目、內容一致。
3. **混合情境**：一筆項目缺少 `phase`（應預設為 Phase A，與列表頁彈窗相同）、一筆
   `activity` 是舊版純字串（應正規化為 `{en: 該字串, ch: ''}`）——兩入口顯示的正規化後文字與
   筆數完全一致。
4. **`detail_data` 為 `None`**：`/itp/:id` 顯示空計畫、不報錯，「Add New Item」按鈕仍在。
5. **保存後重開**：在 `/itp/:id` 對情境 1（扁平陣列紀錄）按 Save Document 後重新整理頁面，3
   筆項目內容與順序不變，未遺失任何項目。

以上 5 種情境、共 13 項斷言全數通過（`ALL PASSED`）。另外：

- `tsc --noEmit` 通過。
- 前端單元測試 91 passed（既有回歸，非本輪新增視覺證據）。
- Vite production build 通過，輸出至暫存目錄，未寫入 `react-app/dist`。

沒有重跑 `itp-record-link-fix-review.mjs`（Record 連結導錯那批的審閱腳本，同樣會經過
`ITPDetail.tsx`，但本輪只改了 detail_data 的解析、未動 Record 連結相關程式碼）與
`form-actions-review.mjs`／`form-ux-responsive-review.mjs`（按鈕與響應式那兩批的審閱腳本）；
本輪改動範圍不觸及這些腳本涵蓋的邏輯，但尚未實際重跑確認零迴歸。

## Claude 接續

`utils/itpParser.ts::parseInspectionItems` 現在是 ITP 兩個編輯入口（列表頁彈窗與
`/itp/:id`）共用的唯一 `detail_data` 讀取路徑；未來若要再調整正規化規則或格式相容性，改這一
個檔案即可讓兩邊同步，不要在 `ITPDetail.tsx` 或 `ITPModals.tsx` 各自重寫一份。

驗收腳本使用 `isolated_stack.py`（8198/3198）與 `project-create-vite.mjs`，種子腳本見
`backend/scripts/verification/seed_itp_detail_parser_fix_review.py`，審閱腳本見
`react-app/tests-browser/itp-detail-parser-fix-review.mjs`。修改本輪程式時可重跑對應驗證。

未使用 stash/reset/checkout，未 commit/push/部署，未操作開發資料庫／uploads／日誌。隔離堆疊已於
驗證結束後用 `isolated_stack.py down` 拆除。

---

## Claude 補充驗證 — 2026-09-29（同一批，未新增修正）

以上「修正」與「本輪驗證」段落為既有實作（沿用同一份工作目錄）。本節是 Claude 另開一次隔離
環境對同一份程式碼所做的**獨立複驗**，重點是逐欄內容、項目順序與 phase 歸屬，而不只是筆數或
畫面非空——**沒有再改動 `ITPDetail.tsx` 或任何其他程式碼**，純驗證。

### 逐欄／phase 複驗

新增審閱腳本 `react-app/tests-browser/itp-detail-parser-fix-field-review.mjs`，沿用同一份種子
（`seed_itp_detail_parser_fix_review.py`），對情境 1～3 的每一筆項目：

1. 在兩個入口都點開該筆項目的編輯面板（`PenTool`／`title="Edit"` 按鈕，非用 CSS class 共用選
   取，因兩份編輯面板本無共用 class）。
2. 讀出 Phase `<select>` 的實際值（不是「畫在哪個 phase 分組底下」，而是欄位本身的值），確認
   兩入口皆等於種子資料預期的 phase（含情境 3 缺 `phase` 的項目，兩入口皆正確預設為 `A`）。
3. 讀出面板內其餘所有文字輸入框（activity EN/CH、standard EN/CH、criteria EN/CH、checkTime
   EN/CH、method EN/CH、frequency EN/CH、record）與全部 4 個 VP 下拉值，逐項比對兩入口的值集
   合是否完全一致（兩份編輯面板 DOM 順序不同——`ITPAdvancedEditor.tsx` 是 Activity EN/CH 相鄰、
   `ITPDetail.tsx` 是 Activity EN、Standard EN/CH、Activity CH 交錯——比對前有先核對過兩者欄位
   集合而非直接比位置）。

3 筆記錄、5 個項目，共 24 項斷言全數通過，包含情境 3 的舊版純字串 `activity`／缺省
`checkTime`／`method`／`frequency` 正規化後兩入口逐欄一致。

### 跨入口保存回測

另外用一次性腳本（未留在 repo；邏輯已併入下方重跑指令）驗證：在**獨立詳情頁**對情境 1（扁平
陣列紀錄）按 Save Document 後（此時底層 `detail_data` 會因 `ITPDetail.tsx` 自己的
`saveToBackend()` 從扁平陣列變回舊制 `{a,b,c}` 物件——見上方「修正」段落），改回**列表頁彈窗**
開啟同一筆記錄，3 筆項目文字與順序與存檔前完全一致，沒有因為底層格式切換而遺失或錯位。

### 三批既有回歸腳本補跑（原交接紀錄第 50–53 行標註「尚未實際重跑確認零迴歸」）

`ITPDetail.tsx` 同一輪還被 Record 連結修正、按鈕統一、響應式三批改過，原交接紀錄坦承未重跑對
應腳本確認零迴歸。本節補跑：

- `itp-record-link-fix-review.mjs`（`seed_itp_record_link_fix_review.py`）：4 種解析結果（真實
  ITR／真實 Checklist／查無資料／撞號）＋ 1 種無權限情境，共 8 個 OBSERVED 案例全數符合預期，
  無誤導向。
- `form-actions-review.mjs`：169 項斷言全數通過（含 `itp-detail-page`／`itp-detail-item`／
  `itp-english-phone` 三個涵蓋 `ITPDetail.tsx` 的案例）。
- `form-ux-responsive-review.mjs`：60 項斷言全數通過。

三批均無迴歸。

### 額外跑過

- `tsc --noEmit` 通過（零錯誤）。
- 前端單元測試 91 passed。
- Vite production build 通過（輸出至暫存目錄，未寫入 `react-app/dist`）。

### 結論

BACKLOG #35 的 Gap 2（解析格式不一致）：**既有修正 + 本輪獨立複驗，皆通過，判定可信**。未發現
缺陷，因此本輪沒有新增任何程式碼修正。Gap 1（`ITPDetail.tsx` 完全無 i18n）**維持獨立未處理**，
不隨本次解析驗證一起結案（使用者明確指示）。

驗證腳本：`react-app/tests-browser/itp-detail-parser-fix-field-review.mjs`（新增，已留在 repo，
可重跑）。重跑方式與既有 `itp-detail-parser-fix-review.mjs` 相同，只是把腳本檔名換掉：

```
cd backend
python scripts/verification/isolated_stack.py up --port 8198 --vite-port 3198 \
    --vite-script ../react-app/tests-browser/project-create-vite.mjs > stack.json
python scripts/verification/isolated_stack.py seed --root <root> \
    --script scripts/verification/seed_itp_detail_parser_fix_review.py
node ../react-app/tests-browser/itp-detail-parser-fix-field-review.mjs stack.json
python scripts/verification/isolated_stack.py down --root <root>
```

未使用 stash/reset/checkout，保留其他協作者未提交修改，未 commit/push/部署，未操作開發資料
庫／uploads／日誌。兩次隔離堆疊皆已在驗證結束後用 `isolated_stack.py down` 拆除。
