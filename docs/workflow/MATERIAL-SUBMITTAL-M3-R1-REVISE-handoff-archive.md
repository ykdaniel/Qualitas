# MATERIAL-SUBMITTAL-M3 — handoff（待獨立審查）

**一句話**：M3 前端已完成：材料資料、送審列表、詳細頁與各項版次操作。畫面清楚區分最新送審版與現行核准版，並依 §9.3 處理「附件已上傳但結果未保存」與「斷線時先重新讀取再判斷」。

自動檢查結果：單元測試 147 pass、tsc、lint（M3 檔案）、正式建置的退出碼都是 0。瀏覽器驗收在本批的隔離環境完成，已關閉。未提交、未部署，不自填 PASS。

## 審查請看
- `MATERIAL-SUBMITTAL-M3-STATUS.md`。
- 程式：
  - `react-app/src/utils/materialSubmittal.ts`：結果未知的分類與重新讀取後的判斷；
  - `components/MaterialSubmittal/ResultDialogs.tsx`：兩段式保存、重試、無法確認；
  - `SubmittalDetailModal.tsx`、`parts.tsx`：最新／現行並列；
  - `Dialogs.tsx`；`AppLayout.tsx`：入口與權限閘。
- 證據 `MATERIAL-SUBMITTAL-M3-evidence/`：
  - `browser-acceptance.txt`：15 項，含 4 種保存情境的 DOM 與 API 讀回；
  - `frontend-checks.txt`：完整輸出與退出碼；
  - 3 張截圖；
  - `file-hashes.txt`。

## 證據界線
- 結果未知的情境用測試攔截程式模擬（只攔結果端點），判斷都以重新讀取的伺服器資料為準。
- 只做桌面寬度。
- 全專案 lint 有其他檔案的既有問題，只檢查 M3 檔案。
- 文件編號規則頁的分頁無法翻頁：只觀察到、根因未查證、未修改。
- Python 3.11 未驗證；最新版本後端沒有重跑全套。
