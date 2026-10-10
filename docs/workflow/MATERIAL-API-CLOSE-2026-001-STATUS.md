# MATERIAL-API-CLOSE-2026-001 — STATUS（R1，已上線；未經獨立審查）

TASK_ID: MATERIAL-API-CLOSE-2026-001 · ROUND: R1 · 使用者決定略過獨立審查直接部署（見 REVIEW）。不自填 PASS。

## RESULT
- [x] DONE（已上線 2026-10-10 03:45:20Z）

## 修改
| 檔案 | 內容 |
|---|---|
| `backend/routers/materials.py` | 刪除 `POST /`、`PUT /{material_id}`；只留兩個 GET；docstring 註明唯讀與原因；不再引用 `MATERIAL_MANAGE` |
| `backend/services/material_service.py` | 刪除 `create`／`update` 及只供它們用的 `_now`、`_AUDIT_FIELDS`、logger、`log_audit` 等匯入；`list`／`get` 不變 |
| `backend/schemas.py` | 刪除 `MaterialCreate`、`MaterialUpdate`（全專案無其他引用）；`Material`、`MaterialPage` 與登錄簿 schema 不變 |
| `backend/tests/test_materials_http.py` | 測試資料改為直接寫入資料庫；新增「路由只剩兩個 GET、五種帳號 POST／PUT／PATCH 皆 405 且零寫入（含稽核表）」與 GET camelCase；移除新增／修改／稽核回滾測試；查詢、範圍、權限、承包商拒絕、無刪除、專案刪除保護保留 |
| `backend/tests/test_material_submittals_http.py` | 路由清單斷言改為材料主檔只有兩個 GET |
| `DECISIONS.md` | 新增「材料主檔 API 只留查詢（2026-10-09）」 |

資料表、既有資料、權限代碼、登錄簿 API、前端都沒有改（前端從未呼叫這兩條路由；全 repo 搜尋確認）。

## 驗證（`MATERIAL-API-CLOSE-2026-001-evidence/`）
- 本機 Python 3.14：materials＋material_submittals＋attachment authorization **311 passed，EXIT 0**（`backend-tests.txt`）。
- Python 3.11（python:3.11-slim）：materials＋material_submittals **44 passed，EXIT 0**（`py311-tests.txt`）。
- 雜湊：`file-hashes.txt`。

## 部署影響
後端 3 個檔案（routers/materials.py、services/material_service.py、schemas.py）＋2 個測試；無 migration、無前端。上線後 `POST /api/materials/`、`PUT /api/materials/{id}` 會回 405。

## 部署（2026-10-10）
- 期間另一工作階段完成 AUDIT-HARDENING 系列部署；本輪暫停到對方確認「無部署進行中、正式站後端＝HEAD `78b8cfd9`」後才開始，並自行重新核對：正式站應用程式碼＝HEAD `78b8cfd9`（只有不部署的 `scripts/verification/`、部分測試檔與 2 個檔名經 git 轉義的 KM 上傳圖不同）。
- 候選：`git archive 78b8cfd9`＋5 檔（`schemas.py` 以 HEAD 為基準，只移除 `MaterialCreate`／`MaterialUpdate`，保留 `ContractorOption`／`ContractorContact`）。Python 3.11（`evidence/py311-candidate-HEAD-78b8cfd9.txt`）：收集 2386 個測試、匯入正常；materials＋submittals＋contractor options＋audit hardening **87 passed，EXIT 0**。
- 備份（NAS `~/deploy-material-api-close-20261010T034328Z`）：DB online backup `fd3aa04c…a5df` integrity ok（材料主檔 0 筆、登錄 0 筆）；5 個舊檔與 manifest；回退腳本；回退映像 `qualitas-backend:pre-material-api-close-20261010T034328Z`。
- 上傳與套用：包雜湊兩端相同、暫存 5 OK、套用後 live＝manifest。使用者以 sudo 重建，輸出 `BUILD-DONE`。
- 啟動：2026-10-10 03:45:20Z；migrations completed、權限 72、無 STARTUP ABORTED／MigrationError。
- 對外（未登入）：`POST /api/materials/` **405**、`PUT /api/materials/x` **405**（原為 401）、`GET /api/materials/` 401、`POST /api/material-submittals/register` 401、`/api/user/profile` 401。
- 回退：`sh ~/deploy-material-api-close-20261010T034328Z/rollback.sh` 後重建，或改用 pre 映像；無資料變更。
