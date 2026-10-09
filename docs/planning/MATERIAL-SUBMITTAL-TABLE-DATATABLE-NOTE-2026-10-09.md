# 材料送審：表格改用共用 DataTable（待辦紀錄，尚未開工）

日期：2026-10-09
來源：使用者在隔離環境（3310）實際檢視後提出：「表格格式跟其他模組不同」。
使用者決定（同日，在對話中選定）：
1. **改用共用 `Shared/DataTable`**。送審列表與材料資料兩張表都要換。
2. **等 M4 R2 獨立審查完成後，另立新的 TASK 處理**，不併入 M4。

## 現況（讀碼確認）
- 其他 22 個模組（NCR、OSD、PQP、ITP、Contractors 等）都使用 `components/Shared/DataTable/DataTable.tsx`：深色表頭、可排序、View 欄位開關、Rows per page／Page x of y，並放在圓角卡片中。
- `components/MaterialSubmittal/MaterialSubmittal.tsx` 是手寫的 `<table>`，兩處：
  - `data-testid="submittal-table"`
  - `data-testid="material-table"`
  - 樣式為淺色表頭、沒有卡片外框、不能排序、沒有欄位開關。

## 新一輪需注意
- 分頁機制不同：送審資料由伺服器分批取得（每批 200 筆，spec r2 §2／§4.2：「已載入 N／共 T 筆」與「載入更多」，看板也不得把第一頁當成全部）。DataTable 只對已載入的資料做前端分頁。
  - 預定做法：表格下方保留「已載入 N／共 T＋載入更多」，因為看板與列表共用同一份資料。
  - 若要改成一次全部載入，屬於規格變更，須另行確認。
- 須保留的行為：
  - 列點擊開啟詳細頁；
  - 逾期的紅色粗體與 `data-overdue`；
  - 「最新版次／現行核准」兩行顯示（`VersionPair`）；
  - 篩選列（搜尋、狀態、承包商、只看逾期）與看板切換；
  - 既有的 data-testid 或等效的選擇器（瀏覽器驗收腳本會用到）。
- 篩選目前由伺服器處理，DataTable 內建的 `searchKey` 應保持關閉，避免出現兩套搜尋。
- 驗收：1280 寬度的版面、排序只作用於已載入的資料（須在畫面上說明，或限制可排序的欄位，屆時再與使用者確認）、載入更多之後筆數正確、中英文。
- 依 [[feedback_discuss_ui_decisions_first]]：欄位排序範圍、預設每頁筆數等細節，開工前先提出選項給使用者確認。
