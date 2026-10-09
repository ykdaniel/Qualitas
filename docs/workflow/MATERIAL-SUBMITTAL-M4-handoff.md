# MATERIAL-SUBMITTAL-M4 — handoff（R2 補正輪，待獨立審查）

**一句話**：看板欄位改用帶 `kind` 的識別：狀態欄為 `status:*`，分類欄為 `category:<原文>`，另有 `uncategorised` 與 `otherStatus`。分類標題直接顯示原文，只有狀態欄會翻譯。`Draft`、`Approved`、`other`、`constructor`、`__uncategorised__` 等合法分類名稱不再被誤譯，也不會產生重複的 key。只有空白或缺少分類才歸入「未分類」。

檢查結果：單元測試 168 pass，tsc 與變更檔 lint 的退出碼皆為 0。兩種變異都會被新測試抓到。實際元件的標題渲染結果另存為證據。看板的其餘部分與專案天數設定沒有改動。不自填 PASS，不部署。

## 審查請看
- `MATERIAL-SUBMITTAL-M4-STATUS.md`（R2）
- `react-app/src/utils/materialSubmittal.ts`（`BoardColumn`、`boardColumns`）
- `components/MaterialSubmittal/SubmittalBoard.tsx`（`columnHeading`）
- `tests-unit/materialBoardCategoryNames.test.ts`、`tests-unit/materialBoard.test.ts`
- 證據：
  - `r2-frontend-checks.txt`（含變異測試）、`r2-category-heading-render.txt`、`r2-file-hashes.txt`
  - R1 的證據保留
  - 上一輪控制文件：`MATERIAL-SUBMITTAL-M4-R1-REVISE-*-archive.md`

## 證據界線
- 標題以 react-dom/server 渲染實際元件核對，未啟動瀏覽器。
- R1 瀏覽器紀錄中的欄位 testid 是舊名稱（例如 `column-Submitted`）。
- 手機寬度、Python 3.11、後端全套、DEPLOY-EXEC 與文件編號分頁：維持原有限制。
