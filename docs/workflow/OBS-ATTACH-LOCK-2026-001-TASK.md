# OBS-ATTACH-LOCK-2026-001 — OBS 結案或作廢後，後端擋照片與附件的上傳和刪除

TASK_ID: OBS-ATTACH-LOCK-2026-001
SOURCE: 使用者 2026-10-12 同意「OBS Closed／Void 時照片和附件全部鎖定」（協調中心轉述）。協調中心指定由本工作階段在 REFUSAL-DIALOG-2026-001 第 1 批之後接著做，基準 `15612688`。

## 範圍
- 後端 `core/attachment_access.py`：
  - 共用判斷 `OBS_LOCKED_STATUSES`／`obs_locked()`，文字與 OBS-PRINT-PHOTOS 逐字相同；哪一批先上線就由哪一批定義，後上線的在合併時刪掉自己那份。
  - `lock_refusal` 加 OBS 分支：所有類別的上傳、刪除都回 409 `ATTACHMENT_LOCKED`，`kind=record`。
  - 移除原本 Closed 只鎖兩類照片的規則；更新 `PENDING_STATE_DECISIONS`。
- 測試：新增 OBS 鎖定測試；調整寫死舊規則的既有測試。
- DECISIONS：只加本條。

## 不在範圍
- `services/obs_service.py`：OBS 紀錄本身的照片欄位（defectPhotos／improvementPhotos／attachments）在 Void 時不鎖、在 Closed 時 attachments 不鎖。由 OBS-PRINT-PHOTOS 處理（協調中心選 A），本批不動。
- 前端：OBSModals 在 Closed／Void 時隱藏上傳與刪除，由 OBS-PRINT-PHOTOS 處理。

## 前置條件（上線前必須滿足）
- **OBS-PRINT-PHOTOS 的「結案／作廢時擋下待上傳或待刪除的檔案」必須先上線。** 前端存檔順序是先寫紀錄、再刪除、再上傳（`utils/saveFlow.ts`），OBSModals 的結案檢查又把待上傳的照片算進去。沒有這個修正，在同一次存檔中結案或作廢並增刪檔案時，紀錄會先存成 Closed／Void，之後每個檔案步驟都回 409，結案佐證也會被繞過。
- 修法：方案 (a)，比照 NCR-19a／19b：待上傳的照片不算進結案條件；有待上傳或待刪除的檔案時，不能在同一次存檔中結案或作廢，畫面提示「請先存檔上傳照片，再結案／作廢」。
  - 使用者 2026-10-13 在本工作階段選定 (a)；協調中心也依常設授權選 (a)。
  - 由 OBS-PRINT-PHOTOS 實作，本批不改前端。

## 上線順序（協調中心）
REFUSAL b1 → OBS-PRINT-PHOTOS → OBS-ATTACH-LOCK → REF-PROJECT-SEQ b1。
