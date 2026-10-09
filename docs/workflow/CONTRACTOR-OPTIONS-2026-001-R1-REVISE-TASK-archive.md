# CONTRACTOR-OPTIONS-2026-001 — TASK（各模組的承包商清單不再需要「查看承包商」權限）

TASK_ID: CONTRACTOR-OPTIONS-2026-001
ROUND: R1
SOURCE：2026-10-10，使用者交辦「處理其他模組的承包商清單問題」。這是 `AUDIT-CONTRACTORS-2026-001` 時發現、但只在 Audit 修正的問題：NCR、NOI、OBS、OSD、PQP、ITP、ITR、FAT、Checklist、會議紀錄、Follow Up、儀表板、材料、KPI、IAM 都用 `contractorsStore` 讀 `/api/contractors/`，而它需要 `contractors:view:all`，所以只有模組權限的角色，承包商下拉、篩選、列表名稱都是空的。
Claude 盤點各模組實際用到的欄位後，請使用者決定兩件事，使用者都選了建議選項：
- 做法：「共用精簡端點」。只要登入就能讀，只回傳下拉需要的欄位（id、名稱、縮寫、狀態、工作範圍），綁定承包商的帳號只看得到自己。所有模組的下拉改用它，承包商管理頁仍用完整清單（需要權限）。Audit 剛上線的專用清單也改用它。
- NOI 聯絡資料：「只給有 NOI 權限的人」。另加一個小端點：有 NOI 新增或更新權限的人，選了承包商時才讀那一家的聯絡人、電話、Email 來自動帶入；共用端點不含聯絡資料。
基準：HEAD `c8bba156`（Audit 各批已上線）。

## 實作中發現的正式站問題（一併修正）
- 正式站的承包商狀態有 `Active`（2 家，承包商管理頁存的就是這個寫法）和 `active`（1 家）兩種（已在 NAS 備份資料庫上唯讀確認）。`AUDIT-CONTRACTORS-2026-001` 上線的 Audit 頁用 `status === 'active'` 篩選，所以那 2 家在 Audit 頁的承包商統計、排程表、精靈下拉都不會出現。當時的測試資料都是小寫，所以沒有測出來。
- 本輪：選項清單在前端一律不分大小寫地判斷狀態（`isActiveStatus`），Audit 改用共用清單；測試資料加入狀態為 `Active` 的承包商。

## 範圍
1. 後端
   - `GET /api/contractors/options`（`get_current_user`，任何已登入且啟用的帳號）：回傳 `ContractorOption`（id、name、abbreviation、scope、status，status 照原值），依名稱排序；綁定承包商的帳號只回傳自己。路由放在 `/{contractor_id}` 之前。
   - `GET /api/noi/contractor-contact/{contractor_id}`（新的 `AnyPermissionChecker(noi:create, noi:update)`）：回傳 `ContractorContact`（id、contactPerson、phone、email）；不存在或在綁定範圍外回 404。
   - `/api/contractors/` 與 `/api/contractors/{id}` 的權限不變。`/api/audit/contractors` 這輪保留：部署時後端先換、前端還沒切的空窗期，舊前端仍能使用。之後可移除。
2. 前端
   - `contractorsStore`：新增 `options`、`fetchOptions`、`optionsLoaded`、`optionsError`；`getActiveContractors()` 改讀選項（型別改為 `ContractorOption`）；承包商管理頁新增、修改、刪除後重新抓選項。
   - App 啟動時改為預先載入選項（不再抓完整清單），承包商管理頁自己載入完整清單。
   - 直接讀完整清單的地方改用選項：Checklist、儀表板材料卡片、材料頁、Audit 頁與精靈（移除 auditStore 的專用清單）。
   - NOI 新增／編輯視窗：聯絡資料改為依選定的承包商呼叫聯絡端點後帶入。原有規則不變：系統帶入的欄位跟著承包商；使用者改過或既有紀錄的欄位不覆蓋；切換時保留欄位會顯示提示。只採用最後一次請求的結果，而且只寫入那時仍是系統來源的欄位。

## 不在本輪
- 移除 `/api/audit/contractors`（後端仍保留，前端已不使用）。
- 承包商以名稱比對（各模組既有做法）。
- NOI 批次新增的聯絡欄位（原本就不自動帶入，維持不變）。

## 限制
同前幾批。工作樹裡另一個工作階段的材料改動（含 `schemas.py`）不包含在本輪補丁與候選中。
