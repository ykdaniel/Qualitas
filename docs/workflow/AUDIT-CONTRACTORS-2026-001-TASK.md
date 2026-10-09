# AUDIT-CONTRACTORS-2026-001 — TASK（Audit 頁的承包商清單不再需要承包商權限）

TASK_ID: AUDIT-CONTRACTORS-2026-001
ROUND: R1
SOURCE：2026-10-09，使用者在隔離環境預覽 A＋B 批時，發現 Audit 頁左邊的承包商統計和右邊的排程表沒有資料，並附上截圖詢問原因。Claude 查到原因：這兩塊都要先讀 `/api/contractors/`，該端點需要 `contractors:view:all`，只指派 Audit 權限的角色會被拒絕（403）。精靈的承包商下拉也因此是空的，建立的編號前綴會變成 `NA`。B 批 STATUS 已把這件事列為「發現、未修」。Claude 提了兩種做法：在 IAM 補權限，或改程式；使用者回覆「用第 2 種，改程式」。
基準：HEAD `98b4971d`，也就是 A＋B 批的提交，已推送但還沒部署。這批疊在 A＋B 之上。

## 範圍
1. 後端新增 `GET /api/audit/contractors`：
   - 只需要 `audit:view:all`；
   - 回傳 `AuditContractorOption`，只有 id、名稱、狀態，不含聯絡人、電話、email 等；
   - 依名稱排序；
   - 綁定承包商的帳號只會拿到自己的承包商（建立 Audit 時 `enforce_create_scope` 本來就會強制成這一個）；
   - 這條路由放在 `/{audit_id}` 之前。
2. 前端：
   - `auditStore` 新增 `contractorOptions` 與 `fetchContractorOptions`；
   - Audit 頁（承包商統計、排程表、表格欄位）和精靈的承包商下拉，都改用這份清單，不再用 `contractorsStore`；
   - 精靈原本的 `useMemo(() => getActiveContractors(), [getActiveContractors])` 在清單晚一步載入時不會更新，這次一併改成依清單內容更新。

## 不在本輪
- NCR、NOI 等其他模組也用 `contractorsStore` 讀承包商清單，只有模組權限的角色在那些頁面會有同樣問題。這次只處理 Audit（使用者問的是 Audit），其他模組另列待辦。
- `/api/contractors` 本身的權限與範圍過濾不變。
- 先前列入 C 批的事項（例如 Void 被當成未完成、翻譯缺漏等）。

## 限制
同 A／B 批：只用隔離環境；不碰開發資料庫、8240／3240、8198／3198；不 stash、reset、checkout。工作樹裡有另一個工作階段尚未提交的材料模組改動（含 `schemas.py`），這批的差異與部署候選都只包含本輪內容，不包含那些改動。獨立審查 PASS、Python 3.11 通過後，才和 A＋B 一起部署。
