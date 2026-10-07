# 空清單分頁呈現修正（2026-09-30）

## 問題與修正
在使用者隔離環境 3198/km 以 admin 開啟空文章清單，畫面實際顯示 Page 1 of 0。共用 DataTablePagination 對空清單仍將 pageIndex 加一，與總頁數零矛盾。

僅調整共用分頁元件：總頁數零時目前頁顯示零，四個換頁按鈕強制停用；非空資料維持既有 pageIndex + 1，不改查詢、資料、權限、翻譯或表格捲動。

## 驗證
- 3198/km 唯讀讀取畫面，確認 Page 0 of 0 且四個換頁按鈕停用；未操作業務資料。
- 新增 dataTableEmptyPagination.test.ts，使用真實 TanStack table 與正式元件渲染：零筆為0/0、一筆為1/1、21筆在第二頁為2/3；零筆確認四個按鈕停用。
- 前端117項單元測試、型別檢查與建置通過。未跑後端測試（無後端變動），未宣稱跨模組瀏覽器驗收。
- 測試使用 server.browser 入口，避免現有 esbuild ESM 測試打包器對 Node server 入口的 require 不相容；未修改測試執行器。

使用者管理員登入與試用資料保留，未 commit/push/部署。
