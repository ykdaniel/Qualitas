# MATERIAL-API-CLOSE-2026-001 — TASK

TASK_ID: MATERIAL-API-CLOSE-2026-001 · ROUND: R1
SOURCE: 使用者 2026-10-09 於對話中：「用方案 A 關閉 /api/materials 新增修改」（方案見 `MATERIAL-SUBMITTAL-M6-STATUS.md`「`/api/materials` 的 POST／PUT」；源自 M6 R1 獨立審查建議 4）。

## 範圍
- 移除 `POST /api/materials/` 與 `PUT /api/materials/{id}`，保留 `GET /api/materials/`、`GET /api/materials/{id}`。
- 移除只供這兩條路由使用的 service 方法（`create`／`update`）與 schema（`MaterialCreate`／`MaterialUpdate`）。
- 測試：路由清單只剩兩個 GET；各種帳號 POST／PUT／PATCH 都是 405 且零寫入（含稽核表）；既有的查詢、範圍、權限、承包商拒絕、無刪除、專案刪除保護照舊。
- DECISIONS 新增「材料主檔 API 只留查詢」。

## 不在範圍
- 資料表、既有資料、權限代碼、登錄簿 API、前端（前端未使用這兩條路由）。
- 提交、推送、部署（另由使用者指示）。
