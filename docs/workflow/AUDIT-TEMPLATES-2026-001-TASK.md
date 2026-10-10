# AUDIT-TEMPLATES-2026-001 — TASK（稽核模板庫）

TASK_ID: AUDIT-TEMPLATES-2026-001
ROUND: R0（規格，尚未實作）

SOURCE：2026-10-11 使用者在 3320 預覽第 4 步「Template Selection」時，問「可以自己新增嗎？」協調中心提出 A（自訂名稱）與 B（真正的模板庫）兩案，使用者選 **B**。四個細節在 Audit 工作階段由使用者選定，全部依建議（見「已定案」）。

## 現況
- 4 個名稱寫死在 `AuditWizard.tsx`：ISO 9001:2015、ISO 45001、品質管理程序書、供應商評鑑表。
- 勾選後只把名稱記在 `audits.selected_templates`，計畫的「選用模板」會顯示這些名稱，但不會帶入任何查檢項目。

## 已定案（使用者 2026-10-11 選擇）
1. **取消勾選**：只移除還沒填結果和備註的帶入項目。已填的保留，並跳提示說明保留了幾項。
2. **管理頁**：放在 Audit 頁的「模板管理」分頁。
3. **權限**：新增 `audit:template:manage`，預設給 ADMIN 和 QA_MANAGER。
   - ADMIN 會由 seeder 自動同步。
   - 正式站的 QA_MANAGER 不經 seeder 或 migration 處理：部署後由協調中心帶使用者在 IAM UI 加上。
   - DECISIONS 不改「IAM 角色權限矩陣」那一條（a2b36097），另外新增一條「稽核查檢模板庫（AUDIT-TEMPLATES-2026-001）」，寫明使用者的 4 個選擇和新權限，並註明 IAM 矩陣因此變動：QA_MANAGER 69→70、總數 72→73。
4. **既有 4 個名稱**：轉成 4 個初始模板，條文先留空，之後由使用者在管理頁填寫。ISO 9001:2015 可預先帶入精靈現有的 20 條 ISO 條文（`ISO_CLAUSES`）。實作前確認時，要把這 20 條的清單列給使用者看。舊稽核 `selected_templates` 裡的名稱照常顯示。

## 規格（草案，實作前送審時一併確認）
- **資料**：新資料表 `audit_templates`，欄位為 id、name（唯一）、description、version、is_active、items（JSON：`[{no, clause, task}]`，格式和 `custom_check_items` 一致）、created_at／updated_at。
  - 用 `db_migrations` 建表，4 個初始模板以帶旗標的一次性步驟寫入，可以重複執行。
  - 需要修改 models、schemas。
- **API**：
  - `GET /api/audit-templates`：有 audit:view 就能讀，精靈選模板時使用。
  - `POST`／`PUT /api/audit-templates/{id}`：需要 audit:template:manage。
  - 停用取代刪除：稽核會引用模板名稱，所以不硬刪。
- **帶入方式**：勾選模板時，把條文複製到這筆稽核的 `custom_check_items`。每一項標記 `templateId`、`templateItemNo`，用來避免重複帶入，取消勾選時也靠這個找到要移除的項目。之後修改模板，不會影響已經建立的稽核。
- **稽核記錄**：`selected_templates` 繼續存名稱，舊資料也能用；另外加存模板 id，實作時決定欄位怎麼放。
- **之後再做**：從 Excel／Word 匯入條文。

## 協調中心的條件（2026-10-11）
- 共用檔疊在 HEAD 上。HEAD 已包含 CHECKLIST 第 23 步、AGENDA 的 agenda 欄，以及 MEETING-TABS 的 meetingEndTime。旗標名稱不可和既有的重複。
- 只 stage 自己的 hunk。這份規格（TASK.md）和程式要分開提交。
- 開始動手前，再和協調中心確認一次共用檔。

## 共用檔（實作前先通知協調中心）
`backend/models.py`、`backend/schemas.py`、`backend/db_migrations.py`、`backend/core/perms.py`（新權限）、`backend/db_seeder.py`（ADMIN 權限同步）、`DECISIONS.md`（IAM 矩陣）、`react-app/src/context/LanguageContext.tsx`。

## 順序
AUDIT-BUTTONS 由使用者確認、提交之後，再以它為基礎開始做（兩者都會改到 `AuditWizard.tsx` 第 4 步）。
