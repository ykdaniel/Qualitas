# AUDIT-ENDPOINT-CLEANUP-2026-001 — STATUS（R1，待獨立審查）

TASK_ID: AUDIT-ENDPOINT-CLEANUP-2026-001
ROUND: R1。基準是 HEAD `0798dbb9`。差異見 `evidence/G.patch`（SHA-256 `31616ebe…b632`）。部署候選是 `git archive HEAD` 套上 G.patch，已確認相同。`schemas.py` 只移除 `AuditContractorOption`，不含另一個工作階段的材料改動。
**未提交、推送或部署。不自填 PASS。**

## RESULT
- [x] DONE（交 R1 獨立審查）

## 修改
| 檔案 | 內容 |
|---|---|
| `backend/routers/audit.py` | 移除 `GET /audit/contractors`。檔案與 `98b4971d`（AUDIT-CONTRACTORS 之前）逐位元組相同（`cmp` 確認）。 |
| `backend/services/audit_service.py` | 移除 `get_contractor_options`，其餘不變。 |
| `backend/schemas.py` | 移除 `AuditContractorOption`。`Audit` 到 `KPIWeightBase` 這一段與 `98b4971d` 相同（`cmp` 確認）。 |
| `backend/tests/test_audit_contractor_options_http.py` | 刪除（測的是被移除的端點）。 |
| `backend/tests/test_audit_contractor_scope_http.py`（新） | #13 測試原樣搬過來（綁定承包商的帳號建立 Audit 時，名稱與前綴用自己的承包商，不動用別家的序號）；新增：`/api/audit/contractors` 回 404「Audit not found」，`/audit/{id}` 仍是 200。 |

audit.py、audit_service.py 維持 CRLF。

## 證據（`AUDIT-ENDPOINT-CLEANUP-2026-001-evidence/`）
- 全 repo（backend、react-app/src、tests-browser）用 grep 找 `audit/contractors`、`AuditContractorOption`、`get_contractor_options`：只剩共用端點自己的 `ContractorService.get_contractor_options`，沒有其他引用。
- `backend-related-tests.txt`：候選樹上 Audit、承包商選項、scope 的 6 個測試檔，**76 passed**。
- `isolated-run-report.txt`（隔離環境從候選樹啟動，全新資料庫）：
  - `netwatch.mjs`：用 Audit 頁與精靈時，瀏覽器呼叫舊端點 **0 次**、共用清單 8 次。
  - `audit-smoke-all.mjs`、`audit-layout-check.mjs`：全部 PASS。
- Python 3.11 完整測試在候選樹上 **2386 passed、16 skipped，exit 0**（`py311-full-suite.txt`）。上一輪是 2387，加上 CONTRACTOR-OPTIONS R2 新增的 2 個後是 2389，本輪刪除舊檔的 5 個測試、新增 2 個，所以是 2386。

## 行為變化
- `GET /api/audit/contractors` 不再回傳承包商清單。它會落到 `/audit/{audit_id}`，有 audit:view 的人得到 404「Audit not found」，沒有權限的人照舊被拒絕。新版前端不使用它。

## 未做／限制
- 只有後端變動，部署需要重建後端（sudo）；前端不變。
