# AUDIT-BUTTONS-2026-001 — TASK（Audit 列印／Word 按鈕位置一致、步驟列固定、午餐預設、欄寬）

TASK_ID: AUDIT-BUTTONS-2026-001
ROUND: R1

SOURCE：使用者 2026-10-11 提出的需求，由協調中心「登入測試」轉達，部分也在 Audit 工作階段直接回覆。
1. 「audit 列印以及 word 輸出按鈕位置應該要跟其他模組一致」：使用者選**方案 A**，按鈕移到底部按鈕列左側，各步只顯示該步自己的按鈕。另外補充：「agenda 改成 audit plan，這裡要有匯出 word，最後步驟四、五也要」。
2. 兩個細節使用者選了建議做法：第 3、4 步的 Word 內容和該步列印一致（稽核計畫、查檢表）；改名只改步驟名稱，列印和 Word 裡「4. 稽核行程 Agenda」那一段不改。
3. 頂部步驟列「要固定不要轉動」：標題與步驟列固定在頂端，拿掉步驟圓圈的動畫；底部按鈕列也固定在底端。
4. 「預設中午 12 點到 1 點標示為 Lunch Time」：午餐列是預設值，存成真正的資料，可以修改或刪除。
5. 協調中心在 3320 預覽時發現兩個問題：「稽核項目／流程」欄太窄；開始、結束時間顯示不完整。
6. 第 4 步標題重複，顯示成「Checklist Setup Checklist」。

使用者在 3320 隔離預覽確認：「Audit 可以」。
基準：HEAD `ce7cc83a`。

## 範圍
- **後端**
  - `export-docx` 新增 `?kind=report|plan|checklist`，預設為 report。kind 有白名單，不在清單內的回 400。plan 和 checklist 的版型與列印一致；檔名後綴為 `-Plan` 和 `-Checklist`。
  - Agenda 每一列新增 `kind` 欄位，值只能是 `''` 或 `'lunch'`，其他值回 422。Word 匯出時，午餐列加灰底（E5E7EB）。
  - Closed 稽核的鎖定比對：AGENDA 上線後存的列沒有 `kind`，比對時視為 `kind=''`，避免誤判為有修改。
- **前端**
  - 第 3、4、5 步的列印和 Word 按鈕放在 FormActions 的 tools 區，位置在「上一步」旁邊，加上 Printer／FileText 圖示；卡片右上角的按鈕全部移除。Word 按鈕只在紀錄已經儲存過之後才出現。
  - 第 3 步改名為「稽核計畫 Audit Plan」。第 4 步標題修正，不再重複。
  - 標題與步驟列 `sticky top-0`，底部按鈕列 `sticky bottom-0`。卡片改成 `overflow-clip`。步驟圓圈拿掉放大效果和 transition。
  - 午餐預設：新增某天的第一列，或某列改到一個新日期時，自動補一列 12:00–13:00「Lunch Time」（`kind=lunch`），顯示為灰底，可以編輯或刪除。某天已經有任何一列時，就不再自動補，所以刪掉的午餐不會跑回來。列印也套用灰底。
  - Agenda 表格改用 `table-fixed`，最小寬度 1210px：稽核項目欄自動佔滿剩下的寬度；開始、結束欄各 156px；窄螢幕時表格在框內橫向捲動。
- **測試**
  - 後端：`test_audit_export_docx_http.py` 新增 3 個測試，`test_audit_agenda_http.py` 新增 3 個測試。
  - 瀏覽器：新增 `audit-buttons-check.mjs`，共 24 項；agenda、export-docx 兩支檢查腳本配合本次修改調整。

## 不在本輪
模板庫，另開 AUDIT-TEMPLATES-2026-001 處理。
