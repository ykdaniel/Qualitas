# ITR-INPUT-UX-2026-001 — 交接摘要（REVIEW 更正後版本）

純 UX 審閱任務，未修改任何產品程式碼；但隔離環境資料庫本身有寫入種子資料，不等於整批是唯讀操作
（見 STATUS.md 開頭說明）。完整內容見 STATUS.md，這裡只列重點，已依 REVIEW REQUIRED_FIXES 更正。

## 1. Checklist Situation 欄位（優先項目）
目前是單行 `<input>`，不是 `<textarea>`。實機證實：
- **可編輯**：600 字元內容擠在 220px 寬框裡，要逐字元用鍵盤捲動才看得完。
- **唯讀（鎖定）**：欄位是 `disabled`，瀏覽器標準行為下無法 focus/捲動——本輪測過的入口裡看不到全文
  （未窮舉放大/改變視窗寬度等替代方式）。
- **讀碼推論，非本輪已驗證結論**：瀏覽器讀到的 DOM `.value` 已經不含換行（`<input>` 的標準行為），
  但本輪沒有實際觸發 Save、沒有重新載入核對存檔內容、也沒看列印預覽——「存檔後換行必然消失」是
  讀碼推論，不是實測結論；`ChecklistSnapshotModal.tsx` 保存來源是 React state 不是直接讀 DOM
  value，兩者關係要看 onChange 是否真的觸發過。列印模板（`ChecklistPrintTemplate.tsx:108`）是純
  文字 `<td>`，不是 input。

建議：比照 ITP 已接受的做法改成 `textarea + pre-line`，但表格版面（Item/Criteria/Situation/Result
四欄並排）也要一起調整，不是單純換元件。本批不實作；實際「存檔是否真的丟換行」留給
ITR-INPUT-UX-IMPLEMENT-2026-001 實作輪驗證。

## 2. Inspection Result/Remark/附件順序（優先項目）
目前順序：Checklist → 照片上傳 → 附件三區 → Inspection Result → Remark → Related Documents。
使用者提議的「移到 Checklist 後面、附件可收合」是合理的體驗改善方向；專案內沒有現成的共用
Collapsible 元件，建議新寫一個最小 wrapper 或沿用 Linked Checklists 既有的 accordion pattern。
本批只列方案，不實作（本輪不在 IMPLEMENT-2026-001 範圍內，分開處理）。

## 3. ITR 基本資料的 NOI 來源盤點
Subject／Inspection Date／Contractor 連結 NOI 後鎖成唯讀（無來源標記機制，與 NOI 聯絡資訊的
system/user 設計不同）；Version 僅在**未鎖定時**可編輯；Due Date 本輪未深入確認計算邏輯，不歸類為
可編輯。提出分組建議（來自 NOI／ITR 自己的／待檢討呈現方式）。

## 4. Related ITP vs Related Documents（更正後結論）
確認的實機現象：重新打開既有 ITR 記錄時「Related ITP」顯示空白，即使透過 NOI 確實關聯到一個 ITP
（Related Documents 正確顯示）。**更正**：撤回「使用者選了也存不進去」「永遠空白」「從未存在」這類
全稱陳述——新增 ITR 選定 NOI 時，若該 NOI 有 `itpNo`，介面會立刻帶入這個值（`ITRModals.tsx:680-681`），
當下不是空的；本輪測試用的是直接寫入 DB 的種子資料，跳過了這段流程，只證實了「重新打開後顯示空白」，
沒有實測「建立→選NOI→存檔→重新打開」這個完整流程裡值到底在哪一步消失。ITR 後端沒有獨立持久化的
`itpNo` 欄位是確認的讀碼結論；真正反映 ITR↔ITP 關聯的是透過 NOI 的間接查詢。
分類為**確認的呈現缺口**（非全稱的「死介面元件」），建議優先方向是依既有 NOI 關聯做唯讀呈現，而非
新增獨立 schema 欄位；要不要改、怎麼改留給使用者決定，本批未回填任何資料。

## 證據
`docs/workflow/ITR-INPUT-UX-2026-001-evidence/`：8 張截圖 + 1 份 DOM 檢查記錄
（`situation-field-inspection.log`，記錄的是實際讀到的原始 DOM 數值，解讀以上方更正後文字為準）。
隔離環境 backend:8280/vite:3280，與使用者 8198/3198 無關，執行前後以 `lsof` 確認未受影響；期間未
觸發任何 Save（兩次 Checklist Snapshot 編輯皆按 Cancel 關閉）。

## 未做的事
未改任何產品程式碼、未回填 Related ITP 資料、未重開 ITP 系列、未補翻譯、未 commit/push/部署、未實際
驗證保存後的換行是否留存（讀碼推論，非實測）。

本輪為純 UX 審閱並通過獨立審查（PASS，文件收尾版）；下一批 ITR-INPUT-UX-IMPLEMENT-2026-001 將實際
實作 Situation 多行填寫／唯讀全文呈現，並驗證保存＋重新載入的完整性。
