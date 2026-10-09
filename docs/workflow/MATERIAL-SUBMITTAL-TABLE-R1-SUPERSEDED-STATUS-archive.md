# MATERIAL-SUBMITTAL-TABLE — STATUS（R1，待獨立審查）

TASK_ID: MATERIAL-SUBMITTAL-TABLE-2026-001
ROUND: R1。根目錄 DEPLOY-EXEC 控制文件與使用者預覽 8240／3240 未動。**未提交、推送或部署；未修改後端與共用 DataTable。不自填 PASS。**

## RESULT
- [x] DONE（交獨立審查）

## 本輪實際修改
| 檔案 | 內容 |
|---|---|
| `components/MaterialSubmittal/columns.tsx`（新增） | 兩組 DataTable 欄位定義，比照 OSD、NCR：`#` 欄、`DataTableColumnHeader`（排序、隱藏、篩選，作用於已載入的資料，與其他模組相同）、內容置中。版次欄同時顯示兩個值，因此不開放排序與篩選，只能隱藏。逾期保留紅色粗體與 `data-overdue`；編號格保留 `data-testid=row-<編號>` |
| `components/MaterialSubmittal/MaterialSubmittal.tsx` | 兩張手寫 `<table>` 改為 `<DataTable searchKey="" …>`，每頁預設 10 筆（共用元件的預設值）。點列：送審開啟詳細頁；材料資料只有在具備維護權限時才可點。伺服器篩選列、「已載入 N／共 T＋載入更多」與看板都保留。移除不再使用的 `VersionPair` import |
| `components/MaterialSubmittal/materialText.ts` | 新增 `navTitle`：英文 `Material`，中文 `材料送審`（不變） |
| `components/Shared/AppLayout.tsx` | 側邊欄改用 `navTitle`，麵包屑也一起改變 |

雜湊見 `MATERIAL-SUBMITTAL-TABLE-evidence/file-hashes.txt`。

## 驗證（`MATERIAL-SUBMITTAL-TABLE-evidence/`）
- `frontend-checks.txt`（EXIT 是指令本身的退出碼）：npm test 168 pass／0 fail，EXIT 0；tsc EXIT 0；4 個變更檔 eslint EXIT 0；vite build EXIT 0。
- `browser-acceptance.txt`（隔離環境 3310，Chrome 實測）：
  - 每頁 10 筆，Page 1 of 20；載入更多之後變成 206／206，Page 1 of 21；
  - 實際點選排序（編號遞減）；點列開啟詳細頁或編輯材料；
  - 逾期標示；看板切換；材料資料分頁；中英文介面；
  - 1280 寬：頁面沒有橫向溢出，表格與看板在框內橫向捲動；
  - 截圖 4 張。
- 本輪沒有新增單元測試：改動只是把既有元件換成共用表格，以瀏覽器實測驗證。

## 觀察到但未修改（不在本輪範圍，供決定）
- 1280 寬時，「New submittal」按鈕會換到第二行；表格需要在框內橫向捲動，可以用 View 隱藏欄位。
- 頁首的送審／材料資料切換旁有一個小捲軸（共用 tabs 樣式的 overflow，M4 時在看板切換上修過同類問題）。
- 中文介面中，標題旁的「專案」標籤會斷成兩行。

## 對 M5 的影響
本輪改變了前端部署範圍。M5 已建構的前端候選（`frontend-dist`、`frontend-candidate-*`、雜湊核對）在本輪 PASS 後必須重做。

## 下一步
交獨立審查；PASS 後再重做 M5 的前端候選。不部署。
