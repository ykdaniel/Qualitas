# AUDIT-ENDPOINT-CLEANUP-2026-001 — TASK（移除舊的 Audit 專用承包商端點）

TASK_ID: AUDIT-ENDPOINT-CLEANUP-2026-001
ROUND: R1
SOURCE：2026-10-10，使用者交辦「移除舊的 Audit 承包商端點」。`CONTRACTOR-OPTIONS-2026-001`（已上線）把 Audit 頁和精靈改用共用的 `GET /api/contractors/options`，當時刻意在後端保留 `GET /api/audit/contractors`：部署時若後端先換、前端還沒切，舊前端仍能使用。新版前端已上線，這個端點已經沒有使用者。
基準：HEAD `0798dbb9`。

## 範圍（只改後端）
1. 移除 `routers/audit.py` 的 `GET /audit/contractors`（`read_audit_contractor_options`），檔案回到 `AUDIT-CONTRACTORS-2026-001` 之前的內容。
2. 移除 `AuditService.get_contractor_options`。
3. 移除 `schemas.AuditContractorOption`。
4. 測試：刪除 `tests/test_audit_contractor_options_http.py`（測的就是這個端點）。其中 AUDIT-POLISH #13 的測試（綁定承包商的帳號建立 Audit 時的承包商名稱與編號前綴）搬到新檔 `tests/test_audit_contractor_scope_http.py`，內容不變；另加一個測試：`/api/audit/contractors` 現在會落到 `/audit/{audit_id}`，回 404「Audit not found」，`/audit/{id}` 不受影響。

## 不在本輪
- 前端：已不使用這個端點（全前端 grep 沒有引用），不需要改。
- 共用端點 `/api/contractors/options` 與 NOI 聯絡端點不變。

## 限制
同前幾批。工作樹裡另一個工作階段的材料改動（含 `schemas.py`）不包含在本輪；`schemas.py` 只移除本輪那一段。
