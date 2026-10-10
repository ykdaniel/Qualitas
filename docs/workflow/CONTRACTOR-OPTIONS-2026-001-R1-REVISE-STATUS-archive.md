# CONTRACTOR-OPTIONS-2026-001 — STATUS（R1，待獨立審查）

TASK_ID: CONTRACTOR-OPTIONS-2026-001
ROUND: R1。基準是 HEAD `c8bba156`。差異見 `evidence/F.patch`（SHA-256 `512045c3…caa2`）。部署候選是 `git archive HEAD` 匯出後放入本輪檔案；`schemas.py` 是 HEAD 加上本輪新增的兩個 schema，不含另一個工作階段的材料改動。已確認候選 = HEAD + F.patch。
**未提交、推送或部署。不自填 PASS。**

## RESULT
- [x] DONE（交 R1 獨立審查）

## 修改檔案
| 檔案 | 內容 |
|---|---|
| `backend/schemas.py` | `ContractorOption`、`ContractorContact`。 |
| `backend/services/contractor_service.py` | `get_contractor_options(scope)`、`get_contractor_contact(id, scope)`。 |
| `backend/core/dependencies.py` | `AnyPermissionChecker(*perms)`（啟用、有角色，持有其中任一權限即可）。 |
| `backend/routers/contractors.py` | `GET /contractors/options`（`get_current_user` + `get_scope`），放在 `/{contractor_id}` 之前。 |
| `backend/routers/noi.py` | `GET /noi/contractor-contact/{contractor_id}`（`AnyPermissionChecker(NOI_CREATE, NOI_UPDATE)`）。 |
| `react-app/src/services/api.ts` | `getContractorOptions`、`getNoiContractorContact` 和對應型別。 |
| `react-app/src/store/contractorsStore.ts` | `ContractorOption`、`isActiveStatus`（不分大小寫）、`options`／`fetchOptions`／`optionsLoaded`／`optionsError`；`getActiveContractors` 改讀選項；新增、修改、刪除後重新抓選項；完整清單的狀態判斷也改用 `isActiveStatus`。 |
| `react-app/src/components/Shared/AppProviders.tsx` | 啟動時預先載入選項，取代完整清單。 |
| `react-app/src/components/Contractors/Contractors.tsx` | 進入頁面時自己載入完整清單。 |
| `react-app/src/components/Dashboard/MaterialStatsTile.tsx`、`Dashboard.tsx`、`MaterialSubmittal/MaterialSubmittal.tsx`、`Checklist/Checklist.tsx` | 改用選項（型別、抓取、錯誤狀態）。 |
| `react-app/src/components/NOI/modals/NOIDetailModal.tsx` | 聯絡資料改用聯絡端點：新紀錄開啟時帶入預設承包商的聯絡資料；切換承包商時，系統來源欄位先清空，再以回應填入。用請求序號（只採用最新一次）、目前承包商比對、`contactSourceRef`（只寫入當下仍是系統來源的欄位）防止過期回應覆蓋。沒有 NOI 新增或更新權限時不呼叫。 |
| `react-app/src/components/Audit/Audit.tsx`、`AuditWizard.tsx`、`store/auditStore.ts` | 改用共用選項，移除 auditStore 的 `contractorOptions`。 |
| 新增 `backend/tests/test_contractor_options_http.py`、`backend/scripts/verification/seed_contractor_options_review.py`、`react-app/tests-browser/contractor-options-check.mjs` | 測試、種子、瀏覽器檢查。 |

CRLF 檔案（contractor_service.py、dependencies.py、routers/contractors.py、routers/noi.py、contractorsStore.ts、Checklist.tsx、NOIDetailModal.tsx、AuditWizard.tsx、auditStore.ts）維持 CRLF。

## 證據（`CONTRACTOR-OPTIONS-2026-001-evidence/`）
- **後端**：
  - `test_contractor_options_http.py` 共 8 個測試（含參數化）：
    - 只有 NCR 權限的帳號、沒有任何權限的帳號都拿得到選項，只有 5 個欄位，包含停用的承包商和狀態為 `Active` 的承包商，依名稱排序；
    - `/contractors/` 和 `/contractors/{id}` 對他們仍是 403；
    - 未登入 401；
    - 綁定承包商的帳號只拿到自己的；
    - NOI 新增或更新權限可讀聯絡資料，NOI 查看權限和 NCR 權限都是 403；
    - 不存在或在綁定範圍外回 404。
  - 在候選樹上跑相關測試檔（含既有的 NOI、scope、audit 路徑），共 **124 passed**。
  - Python 3.11 完整測試在候選樹上執行中（`py311-full-suite.txt`）。
- **瀏覽器**（`browser-contractor-options.txt`，在隔離環境從候選樹啟動，全新資料庫）：**10／10 PASS**。
  - 只有模組權限的帳號：NCR、OBS、PQP 的新增表單都列出承包商（含 `Active`，不含停用的），完整清單仍是 403。
  - Audit 精靈的下拉包含狀態為 `Active` 的承包商。
  - 只能新增 NOI 的帳號：
    - 開新 NOI 時，預設承包商（依名稱排第一）的聯絡人、電話、Email 都帶入；
    - 切換承包商後，三個欄位改成新承包商的資料；
    - 自己改過電話再切換，電話保留、其他兩欄跟著換。
  - 承包商管理員：管理頁顯示完整資料（含 Email）。
  - 截圖在 `screens/`。
- **Audit 回歸**（`browser-audit-regression.txt`，在候選樹上用全新資料庫）：版面全部通過、小項 9／9、輸入法 3／3、列印 1／9／11 頁且 60／60 個項目、整體測試全部通過。
- **前端檢查**（`frontend-checks.txt`）：`tsc` exit 0、單元測試 144／144、修改到的前端檔 eslint 0 個問題、`vite build` 成功。

## 行為變化
- 任何已登入的帳號都能取得所有承包商的名稱、縮寫、工作範圍、狀態（綁定承包商的帳號只有自己）。聯絡資料只有承包商管理頁（需要權限）和 NOI 聯絡端點（需要 NOI 新增或更新權限，一次一家）拿得到。
- 只有模組權限的角色，各模組的承包商下拉、篩選、列表名稱現在都有資料。
- Audit 頁會把狀態為 `Active` 的承包商當成啟用（修正正式站上 2 家承包商在 Audit 頁消失的問題）。
- NOI 的聯絡資料改成選了承包商之後才帶入，會有很短的延遲（一次請求）。沒有 NOI 新增或更新權限的人不會自動帶入，但這種人本來就無法新增或編輯 NOI。
- App 啟動時不再抓完整承包商清單，只有承包商管理頁會抓。

## 未做／限制
- `/api/audit/contractors` 後端保留未刪（前端已不用，理由見 TASK）。
- 沒有逐一在瀏覽器點開每個模組的表單：只實測了 NCR、OBS、PQP、Audit、NOI、承包商管理頁。其他模組（OSD、ITP、ITR、FAT、Checklist、會議紀錄、Follow Up、儀表板、KPI、IAM、材料）都是透過同一個 `getActiveContractors()`，以讀碼和 `tsc` 確認。
