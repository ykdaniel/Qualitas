# CONTRACTOR-PERSONNEL-2026-001 — TASK

TASK_ID: CONTRACTOR-PERSONNEL-2026-001 · 指派：協調中心「登入測試」→ 會議記錄工作階段（2026-10-11）

## 使用者需求
截了會議 Attendees 表（Company／Name／Position），原話：「這裡要從contractor 內取得資料 contractor 有人員 但不一定能進系統」。經協調中心給選項，選「廠商新增人員名單，出席人員從名單選」。本公司／業主人員來源由會議記錄工作階段詢問，使用者選「都當成公司維護名單」。

## 範圍（協調中心核可的草案）
1. 新表 contractor_personnel（id、contractor_id FK、name、position、email、phone、is_active、created_at、updated_at），啟動 create_all 建立；不需系統帳號；停用取代刪除；有人員的公司拒絕刪除（400）。
2. API：GET /api/contractors/{id}/personnel（contractors:view:all）；POST /api/contractors/{id}/personnel、PUT /api/contractors/personnel/{pid}（contractors:manage:all）；GET /api/contractors/personnel/options（任何登入者，只回 id／name／position／contractor_id）。廠商範圍帳號只看得到、只改得到自己公司。不新增權限、沒有刪除端點。
3. 廠商管理頁：公司表單內「人員」區塊，新增、修改、停用／重新啟用，預設隱藏已停用；只有 manage 權限可編輯；變更立即儲存。
4. 會議 Attendees：選公司（廠商選項，以縮寫顯示）→ 選該公司在職人員（職稱帶入，可改）；名單外可打字，有 manage 權限可勾「加入此公司人員名單」。存快照文字＋contractorId／personnelId；舊資料照常。
5. 列印與 Word 照舊（快照文字）。
6. 測試：後端 HTTP、瀏覽器、3.11（協調中心排程）、隔離環境給使用者看。
7. 部署：另一批，排在 MEETING-FIX＋MEETING-TABS 之後。

## 共用檔
models.py、schemas.py、LanguageContext.tsx、DECISIONS.md 有其他工作階段未提交的修改：只暫存本任務的區塊，提交前以 `git diff --cached` 確認無 AuditTemplate／audit.*／namingRules 的行、無 mode change。
