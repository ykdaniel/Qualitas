# ITR-INPUT-UX-IMPLEMENT-2026-002 — 交接摘要

處理上一輪 REVISE 的 R1/R2/R3，**未修改任何產品程式碼**，只改了驗證腳本。35/35 實測通過。

## R1 範圍變更（使用者本次對話中確認）
使用者看過卡片式與連續清單堆疊式兩個窄螢幕方案後都拒絕，明確要求保留現有五欄表格、接受表格內橫向
捲動。已記錄為 `DECISIONS.md` 新條目。R1 因此從「版面改動」變成「驗證方法修正」：用真實
`boundingBox()` 幾何（捲動前確認欄位在框外、捲動後確認落在框內）＋實際填寫／點擊 Result／存檔的
互動，取代原本只憑 `isVisible()`／整頁 `scrollWidth` 的寬鬆斷言。對照截圖見 evidence 目錄。

## R2 補齊的精確證據
- 保存與重試的 PUT response body 直接核對目標 checklist id 與 Situation 完整字串（不只看 2xx）。
- 重試成功後新增一次全新 context 重新打開，確認真的持久化（上一輪只驗到回應，沒驗到落地）。
- 鎖定狀態的文字比對改成與種子字串完整相等（不是子字串）；新增用 Selection API 實際選取文字的證明；
  新增直接查 Result 按鈕 `disabled` 屬性的證明。
- 「沒有 Save 按鈕」的措辭改成「本輪實測確認的 UI 層保護」，不再暗示涵蓋所有繞過路徑或後端授權。

## R3 文件修正
STATUS.md 已明確列出測試資產異動（seed 腳本上一輪就改過，本輪沿用未再動）、移除「窄版排列不在範圍」
的錯誤措辭、lint 段落寫清楚是既有基線不是本輪待辦、保留未跑 build/unit 的揭露。

## 證據
`docs/workflow/ITR-INPUT-UX-IMPLEMENT-2026-002-evidence/`：35/35 PASS 的 run.log，桌面截圖沿用上一輪
（版面未變），新拍窄螢幕捲動前/後對照截圖。

## 未做的事
未改任何產品程式碼、未改附件收合／主表單／Related ITP、未重跑 build/unit test、未 commit/push/部署，
隔離堆疊已拆除，8198/3198 全程未受影響。

REVIEW.md 留待獨立審查。
