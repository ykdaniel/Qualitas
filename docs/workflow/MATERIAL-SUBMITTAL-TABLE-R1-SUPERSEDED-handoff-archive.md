# MATERIAL-SUBMITTAL-TABLE — handoff（R1，待獨立審查）

**一句話**：材料送審與材料資料兩張表改用共用 DataTable，與其他模組一致：深色表頭、排序／隱藏／篩選、View、每頁 10 筆。伺服器篩選與載入更多保留。側邊欄英文改為「Material」。前端檢查的退出碼都是 0，Chrome 隔離環境實測通過。不自填 PASS，不部署。

## 審查請看
- `MATERIAL-SUBMITTAL-TABLE-STATUS.md`
- `components/MaterialSubmittal/columns.tsx`、`MaterialSubmittal.tsx`、`materialText.ts`（navTitle）、`Shared/AppLayout.tsx`
- 證據：`MATERIAL-SUBMITTAL-TABLE-evidence/`（browser-acceptance、frontend-checks、file-hashes、4 張截圖）

## 證據界線
- 排序與篩選只作用於已載入的資料，與其他模組的行為相同（使用者選擇「與其他業務表格一致」）。
- STATUS 中列出 3 個觀察到但未修改的版面問題。
- 本輪 PASS 後，M5 的前端候選必須重做。
