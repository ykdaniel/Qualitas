# MATERIAL-SUBMITTAL-M4 — handoff（待獨立審查）

**一句話**：材料送審加入看板（依狀態或分類分欄，卡片不能拖曳）與看板／列表切換，兩者共用同一份分頁資料與篩選。既有的專案表單加入「材料送審回覆天數」（可空白，否則為非負整數）。後端沒有修改。

前端檢查：單元測試 163 pass，tsc、eslint、build 的退出碼都是 0。隔離環境的瀏覽器驗收 AC-M4-1～6，以及回覆天數的設定、清除與帶入日期，全部實測，有截圖與 network 證據。不自填 PASS，不部署。

## 審查請看
- `MATERIAL-SUBMITTAL-M4-STATUS.md`
- `react-app/src/utils/materialSubmittal.ts`（`boardColumns`、`parseReplyDays`），以及 `tests-unit/materialBoard.test.ts`
- `components/MaterialSubmittal/SubmittalBoard.tsx`、`MaterialSubmittal.tsx`（切換與共用的載入更多）
- `components/Contractors/ProjectModal.tsx`、`services/api.ts`、`store/projectStore.ts`：這三個檔案在工作樹裡原本就有其他未提交的修改，請只看 `materialReplyDays` 的部分。
- 證據：
  - `MATERIAL-SUBMITTAL-M4-evidence/browser-acceptance.txt`、`frontend-checks.txt`、`file-hashes.txt`、`teardown.txt`
  - 截圖 6 張

## 證據界線
- 只驗證桌面寬度 1280 與 1366。
- 依分類分組只檢查第 1 頁。
- AC-M4-6 前三個狀態由種子建立，最後的登錄在 UI 操作。
- Python 3.11、後端全套、文件編號規則頁分頁：維持原有限制。
