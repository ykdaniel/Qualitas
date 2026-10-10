# AUDIT-PRINT-2026-001 — TASK（Audit 三份列印改為正式格式）

TASK_ID: AUDIT-PRINT-2026-001
ROUND: R1
SOURCE：2026-10-10 使用者回報「列印的資料跟 word 不一樣」。核對後，原本三個列印按鈕都只是把當下那一步的畫面印出來。使用者選擇方案 A：「列印報告」要和 Word 相同；第 2、3 步保留原本用途，不要印出按鈕和圖示。

實作過程中發現一個既有 bug：NCR、OSD、OBS、PQP、FAT、材料、會議紀錄的列印 CSS 會在列印時無條件隱藏 `#root`。所以在同一個分頁裡先開過這些模組、再回 Audit 列印，會印出整頁空白。使用者同意：「好，三份都改成正式格式」。

基準：正式站目前跑的是 `688d87b3`（AUDIT-EXPORT-DOCX 上線版本），部署候選以它為基準。HEAD `3665860e` 多了另一個工作階段尚未部署的 ITR 修正，不能一起上線。

## 範圍（只動前端）
1. 新增 `AuditPrintTemplate.tsx`（report / plan / checklist）和 `Audit.print.css`，比照 NCR、OSD 的 portal 列印模式。
   - **report**：章節、欄位名稱、數值、結果文字、統計算法、簽核欄，都和 Word 匯出（`audit_service.export_docx`）一致。
   - **plan**：第 1～3 段，加上計畫簽核（主任稽核員、專案經理）。
   - **checklist**：稽核基本資料，加上題目表。結果欄印「☐ 符合／☐ 不符合／☐ 注意」，備註欄留白，供現場手寫；另附簽核欄。
   - 列印 CSS 只在 Audit 列印內容掛載時隱藏 `#root`（`body:has(> .audit-print-root)`），不會讓其他頁面的瀏覽器列印變成空白頁。
2. `AuditWizard.tsx`：三個列印按鈕改成先掛載對應的列印內容再呼叫 `window.print()`，`afterprint` 之後卸載。列印內容取自目前畫面上的表單；有未儲存的修改時，抬頭會標示「含未儲存的修改」。
3. 瀏覽器檢查腳本 `audit-print-template-check.mjs`。

## 不在本輪
- 新增 Agenda 步驟：使用者 2026-10-10 已交辦，選定的做法是另開一輪（需要 migration）。
- 其他模組會無條件隱藏 `#root` 的列印 CSS：本輪不改，只確保 Audit 不受影響。
- 後端、Word 匯出都不變。
