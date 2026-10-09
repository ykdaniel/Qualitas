# MATERIAL-SUBMITTAL-M1 — handoff（待獨立審查）

**一句話**：M1（材料 schema、具名 migration、權限碼、材料新增／查詢／修改 API、專案回覆天數）已實作。新增 44 項隔離測試全過；乾淨的全套測試 2261 passed／3 skipped，退出碼 0。未提交、未部署，**不自填 PASS**。

## 審查請看
- `MATERIAL-SUBMITTAL-M1-STATUS.md`：修改清單、§9.4 逐項對照、全套與作廢紀錄、限制。
- 證據 `MATERIAL-SUBMITTAL-M1-evidence/`：
  - `full-suite-attempt2.txt`：完整輸出與退出碼；
  - `full-suite-attempt1-VOID.txt`；
  - `file-hashes.txt`；
  - `mutation-checks.txt`。
- 程式：
  - `backend/db_migrations.py` 第 21 步與 `MATERIAL_INDEXES`；
  - `backend/models.py` 末段；
  - `backend/routers/materials.py`、`services/material_service.py`、`repositories/material_repository.py`；
  - `schemas.py` 的專案與 Material 段落；
  - `core/perms.py`、`core/validators.py`。
- 測試：`backend/tests/test_material_schema_migration.py`、`backend/tests/test_materials_http.py`。

## 證據界線
- migration 的升級與回退：以基準 commit `056c245c` 的舊程式實際啟動驗證。
- 專案引用保護：**只在 service 層驗證**。透過 HTTP 刪除仍回 500，這是既有行為，未修改，不算 HTTP 驗收通過。
- 未在 Python 3.11 執行（M5 前必做）。

## 已同步
- `DECISIONS.md`：新增「材料送審：誤登外部結果的更正」，內容為：有權限者可更正最新版、原因必填、原登錄保留、有後續版次時禁止。安排於 M2。
- 規格 §3.5／§7／AC-R4-* 改為已確認；§9 為 r2 補註的收尾。

## 仍待
- 獨立審查 M1；通過後才進 M2。
- 部署依 M5（完整版本、Python 3.11、migration 與回退方案、獨立審查）。
- 根目錄部署任務 DEPLOY-EXEC-2026-001 不受影響：後端預檢 r3 已 PASS，等待使用者執行。
