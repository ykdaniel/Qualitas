# AUDIT-CONTRACTORS-2026-001 — STATUS（R1，待獨立審查）

TASK_ID: AUDIT-CONTRACTORS-2026-001
ROUND: R1。基準是 HEAD `98b4971d`（A＋B 批）。本輪差異見 `evidence/C.patch`，只包含本輪內容。工作樹裡另一個工作階段的材料改動（`schemas.py`、materials router／service／tests、DECISIONS.md）沒有包含在內，也沒有被修改。
**未提交、推送或部署。不自填 PASS。**

## RESULT
- [x] DONE（交 R1 獨立審查）

## 修改
| 檔案 | 內容 |
|---|---|
| `backend/schemas.py` | 新增 `AuditContractorOption`（id／name／status）。 |
| `backend/services/audit_service.py` | 新增 `get_contractor_options(scope)`：依名稱排序；綁定承包商的帳號只回傳自己的承包商。 |
| `backend/routers/audit.py` | 新增 `GET /audit/contractors`（`audit:view:all`），放在 `/{audit_id}` 之前。 |
| `backend/tests/test_audit_contractor_options_http.py`（新） | 4 項：只有 audit 權限的角色拿得到全部承包商的名稱，只有三個欄位、依名稱排序、含停用的承包商；沒有 audit:view 回 403；綁定承包商的帳號只拿到自己的；`/audit/{id}` 和 404 仍正常。 |
| `react-app/src/store/auditStore.ts` | `AuditContractorOption` 型別、`contractorOptions`、`fetchContractorOptions`。失敗時只記錄錯誤、清單保持空白，不顯示在頁面的錯誤橫幅。 |
| `react-app/src/components/Audit/Audit.tsx` | 承包商來源改成 `contractorOptions`；掛載時抓取。 |
| `react-app/src/components/Audit/AuditWizard.tsx` | 承包商下拉改用 `contractorOptions`，只列啟用中的承包商（篩選條件不變）。 |

CRLF 檔案（audit_service.py、routers/audit.py、AuditWizard.tsx、auditStore.ts）維持 CRLF。

## 證據（`AUDIT-CONTRACTORS-2026-001-evidence/`）
- `C.patch`：`git apply --check --reverse` 確認部署候選樹 = HEAD + C.patch。
- 後端：Audit 相關 4 個測試檔共 **58 passed**（Python 3.14，拋棄式資料庫）。Python 3.11 完整測試在候選樹（HEAD + C，不含材料改動）上執行中，結果見 `py311-full-suite.txt`。
- `frontend-checks.txt`：`tsc` exit 0；單元測試 144/144；eslint 只有 HEAD 既有的 1 個警告；`vite build` 成功。
- 隔離環境瀏覽器實測（3320／8320，帳號 `audit_full`，角色沒有 `contractors:view:all`）：
  - 修改前（`before-audit-only-role-empty-panel.jpg`）：承包商統計只有「All 4」，排程表沒有任何列。
  - 修改後（`after-audit-only-role-panel.jpg`）：`/api/contractors/` 仍然是 403，`/api/audit/contractors` 回 200（4 個承包商）。左邊顯示「Review Vendor 4」，排程表在 10/1 有一筆。
  - 精靈（`after-wizard-contractor-rv-number.jpg`）：承包商下拉有 4 個選項；選 Review Vendor 存草稿後，編號為 `QTS-RV-AUDIT-000001`（以前沒有承包商可選，前綴是 `NA`）。

## 行為變化
- 有 `audit:view:all` 的人都能看到所有承包商的名稱與狀態（綁定承包商的帳號除外，只看得到自己的），不需要承包商權限。聯絡資訊仍然只有 `/api/contractors`（需要承包商權限）才拿得到。
- Audit 頁不再呼叫 `contractorsStore.fetchContractors()`。AppProviders 啟動時本來就會抓一次，這部分不變。

## 發現、未修
- NCR、NOI 等其他模組有同樣的依賴（見 TASK）。
