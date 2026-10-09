# MATERIAL-SUBMITTAL-M2 — handoff（獨立審查 PASS；以下為交審時內容，保留）

**一句話**：M2 後端已實作。依使用者決定採**方案 A**：依 id 或路徑存取的附件端點，範圍外回 404 優先，範圍內的承包商帳號回 403。已補充規格 §9.2，並把承包商案例拆成 3 個帳號 × 5 個端點，每個案例都有精確斷言。**產品程式沒有變動。** 通用附件權限測試檔加 M2 測試檔：**392 passed，PYTEST EXIT CODE 0**。

歷次失敗紀錄都保留：
- 全套 1 failed：`material_rev` 未納入通用矩陣；
- 補正後 2 failed：狀態碼不一致，而且只測到第一個端點。

**最新版本沒有重跑全套。** 不自填 PASS，不進 M3。
## 審查請看（重點依審查方指定）
- **附件競態與權限**：
  - `routers/file_router.py`：上傳與刪除的 `material_rev` 區塊；
  - `core/attachment_access.py`：`CATEGORY_UPDATE_PERMISSIONS`、`VENDOR_REFUSED_ENTITY_TYPES`、鎖表；
  - 測試：`test_upload_matrix`、`test_delete_matrix`、`test_upload_racing_a_submit…`、`test_delete_racing_a_submit…`、`test_state_cannot_change_between_the_locked_check_and_the_write`。
- **更正的歷史保存**：
  - `services/material_submittal_service.py::correct_result`；
  - `models.py` 的只追加保護；
  - 測試：`test_correction_*`、`test_result_entries_are_append_only_in_the_orm`。
- **現行核准版的計算**：
  - `_recompute_current_approved`（只查欄位值，避開 ORM 舊值）；
  - 測試：`test_rev2_*`、`test_correction_falls_back…`、`test_current_approved_cache_always_equals_recomputation`。
- **共用附件流程對其他模組的影響**：
  - 其他類型的既有測試全過；
  - 補正後通用矩陣已涵蓋 `material_rev`；剩下的不一致見 STATUS「發現」。
- **補正輪與方案 A 輪**：`tests/test_attachment_authorization_http.py`（只改測試）；證據 `affected-tests-after-matrix-fix.txt`、`plan-a-step1-affected-cases.txt`、`plan-a-step2-two-files.txt`；規格 §9.2 的補充。
- 證據 `MATERIAL-SUBMITTAL-M2-evidence/`：
  - `full-suite.txt`：完整輸出、退出碼 1；
  - `file-hashes.txt`：測試前後雜湊相同；
  - `mutation-checks.txt`：最初 2 項 MISSED，補強後 CAUGHT。

## 證據界線
- Python 3.11 未執行；前端未做；PostgreSQL 分支未驗證。
- M1 R2 證據措辭已在 STATUS 更正（migration 沒有改寫既有值，不代表 NUMERIC 欄位曾保留字串）。
