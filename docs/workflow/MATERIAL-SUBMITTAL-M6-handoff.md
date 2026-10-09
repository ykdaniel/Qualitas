# MATERIAL-SUBMITTAL-M6 — handoff（R2，待獨立審查）

**一句話**：依 R1 REVIEW 補正 R1–R7：
- 同一表單只會產生一筆紀錄（request id 冪等、防重入、以最後寫入的內容作基準）；
- 照片以實際解碼驗證；查重在伺服器端涵蓋全部紀錄，失敗時如實提示；
- 儀表板由伺服器統計全部可見專案；
- Excel 套用表頭欄位篩選並匯出全部符合資料；載入更多防重入，丟棄過期回應；
- migration 移除舊的 record_result 權限。

另外依使用者要求併入**材料展示架**：材料頁可切換「表格／展示架」，依分類分層顯示照片樣品卡，點卡片開啟既有的材料視窗；清單每筆多帶第一張照片與張數。

R1 控制文件已逐字封存為 `MATERIAL-SUBMITTAL-M6-R1-REVISE-*-archive.md`。`/api/materials` POST／PUT 只列出方案（STATUS），未實作。

## 審查請看
- `MATERIAL-SUBMITTAL-M6-TASK.md`「R2 補正範圍」、`-STATUS.md`（逐項對照表）
- 後端：
  - `services/material_submittal_service.py`（`_by_request_id`、`register`、`duplicates`、`stats`）
  - `routers/material_submittals.py`（`/duplicates`、`/stats`）
  - `schemas.py`（`client_request_id`、`MaterialDuplicates`、`MaterialStats`）
  - `models.py`、`db_migrations.py`（第 21 步的欄位與索引、第 22 步）
  - `routers/file_router.py`（`_decoded_image_mime`）
- 測試：`test_material_submittals_http.py`（R2 新增 12 項，含展示架 1 項）、`test_attachment_authorization_http.py`（照片解碼）、`test_material_schema_migration.py`（索引 12、R2 新增 2 項 boot 測試）、`tests-unit/materialSubmittal.test.ts`（R2 新增 5 項，含展示架 1 項）
- 前端：
  - `RegisterDialog.tsx`、`MaterialSubmittal.tsx`、`MaterialShelf.tsx`、`MaterialShelf.module.css`、`Dashboard/MaterialStatsTile.tsx`
  - `utils/materialSubmittal.ts`、`services/materialApi.ts`、`materialText.ts`
  - `Shared/DataTable/DataTable.tsx`（只多一個可選的 prop，CRLF 保留）
- 證據：
  - `MATERIAL-SUBMITTAL-M6-evidence/` 中以 `r2-` 開頭的檔案；
  - 各彙總檔的「R2」一節（`frontend-checks.txt`、`backend-material-tests.txt`、`file-hashes.txt`）；
  - `browser-acceptance.txt` 的「R2 ROUND」一節。

## 請審查者特別看
1. 同一個 request id、承包商不同時回 409，是否合理；以及結果未知後鎖定承包商的做法。
2. 照片驗證依賴 `qrcode[pil]` 間接安裝的 Pillow，是否要另外寫進 requirements；HEIC 會被拒。
3. 第 22 步是盡力而為（失敗不擋啟動），與第 20、21 步不同。
4. `/api/materials` POST／PUT 的三個方案（建議 A），等使用者決定。
5. 展示架：`coverPhotoPath` 直接回傳儲存路徑（由既有下載路由依權限提供）是否可接受；表格在展示架模式下隱藏而不卸載，以保留表頭篩選。
