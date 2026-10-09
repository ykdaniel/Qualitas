# MATERIAL-SUBMITTAL-TABLE — TASK（材料送審表格改用共用 DataTable）

TASK_ID: MATERIAL-SUBMITTAL-TABLE-2026-001
ROUND: R1
SOURCE: 使用者在隔離環境（3310）檢視後指出：「表格格式跟其他模組不同」（2026-10-09）。之後在對話中逐項決定：
- 改用共用 `Shared/DataTable`，送審與材料資料兩張表都改；
- M4 R2 審完再另開一輪（M4 R2 已 PASS）；使用者指示「先改表格」；
- 排序：「要跟其他業務的表格一致」；
- 每頁預設 10 筆，與其他模組一致。
背景紀錄：`docs/planning/MATERIAL-SUBMITTAL-TABLE-DATATABLE-NOTE-2026-10-09.md`。

## 範圍（只有前端，材料模組內）
- `MaterialSubmittal.tsx` 的兩張手寫 `<table>`（送審列表、材料資料）改用 `DataTable`，欄位定義另放在 `columns.tsx`，比照 OSD、NCR 的寫法：
  - `#` 欄、`DataTableColumnHeader`（排序、隱藏欄位、篩選，與其他模組相同）、內容置中、深色表頭、View、Rows per page（預設 10）。
- 保留：
  - 伺服器端的篩選列（搜尋、狀態、承包商、只看逾期）；
  - 「已載入 N／共 T＋載入更多」，看板也用同一份資料；
  - 點列開啟詳細頁（材料資料：有維護權限才能點）；
  - 逾期的紅色粗體與 `data-overdue`；
  - 「最新版次／現行核准」兩行顯示；
  - 看板切換。
- 驗收：單元測試、tsc、變更檔 lint、build，以及隔離環境瀏覽器實測（1280 寬、排序、分頁、載入更多、點列、逾期、中英）。

- 側邊欄英文名稱改為「Material」（使用者在本輪對話中追加：「改為material」）。只改側邊欄與麵包屑；頁面標題「Material Submittal」與中文「材料送審」不變。

## 不在範圍
- 共用 DataTable 本身、其他模組、後端、看板、專案天數設定、文件編號分頁問題、部署。

## 限制
- 保留 8240／3240、8198／3198；不碰開發資料庫；不使用 stash／reset／checkout；不提交、推送、部署。
- **與 M5 的關係**：本輪會改變前端部署範圍。M5 的前端候選（`frontend-dist`、雜湊核對）必須在本輪 PASS 之後重做。這件事會寫進 M5 的 STATUS。
