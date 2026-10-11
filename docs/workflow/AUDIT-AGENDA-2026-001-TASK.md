# AUDIT-AGENDA-2026-001 — TASK（Audit 稽核行程 Agenda）

TASK_ID: AUDIT-AGENDA-2026-001
ROUND: R1

SOURCE：2026-10-10 使用者交辦：「第二步跟第三步之間要加一個 Agenda 排每天的行程，然後這頁要有列印稽核計劃的按鈕」。

使用者當天的選擇：
- 欄位：日期、開始–結束時間、稽核項目／流程、受稽核對象、稽核員、備註。
- 「列印稽核計畫」從第 2 步移到 Agenda 這一步。
- Word 和列印報告也加入 Agenda，放在範圍與準則之後。
- 先上線 AUDIT-PRINT，Agenda 另開一輪。
- 編輯方式用「表格直接填」。
- 儲存時自動依日期、時間排序。
- 結束時間早於開始時間就擋下；日期超出稽核期間只提醒。

基準：HEAD `ff19c25b`，已含 AUDIT-PRINT 的本地 commit `8a57ae85`、`78394437`。部署排在 AUDIT-PRINT、CHECKLIST-TEMPLATE-CLEAN、NOI 之後（協調中心佇列第 4），最終候選到時再以當時的正式站版本為基準重建。

## 範圍
1. **資料**：`audits` 新增 `agenda` TEXT 欄位，存 JSON list。
   - migration：在 `db_migrations._add_missing_columns` 加 `_add_column_if_missing(conn, "audits", "agenda", "TEXT")`，可重複執行。
   - `models.Audit.agenda = Column(Text)`。
2. **Schema**：新增 `AuditAgendaEntry`，欄位為 id、date、start、end、item、auditee、auditor、remarks。
   - date 用 strict YYYY-MM-DD；start、end 為 HH:MM（24 小時制）；end 不得早於 start。
   - `AuditCreate`、`AuditUpdate` 收 `list[AuditAgendaEntry]`，並依日期、開始時間排序，沒有日期或時間的排在後面、其餘維持原順序。
   - 讀取用的 `AuditBase.agenda` 對資料寬鬆：壞掉的 JSON 讀成 `[]`，NULL 也讀成 `[]`。
3. **Service**：
   - `agenda` 列入 `_JSON_FIELDS`，存成 JSON，並納入 Closed／Void 鎖定的比對。
   - update 時，agenda 每一列都完整 dump，避免 `exclude_unset` 把列裡有預設值的欄位漏掉。
   - Word 匯出新增第 4 段「稽核行程 Agenda」，後面各段依序改號：5 查檢結果（5.1）、6 發現、7 簽核（7.1–7.3）。
4. **前端**：
   - 精靈改成 5 步：專案資訊、人員與範圍、稽核行程、配置查檢表、執行與評估。
   - 新元件 `AuditAgendaEditor`：表格直接填、新增一列、刪除。新的一列預設接續上一列的日期和結束時間，並帶入主任稽核員。
   - 結束早於開始：該列標紅並擋下儲存。超出稽核期間：標黃並提醒，仍可儲存。
   - 空白的列在儲存時移除；存檔後，畫面直接顯示存好的順序。
   - 唯讀狀態下不能新增或刪除，但仍可列印。
   - 「列印稽核計畫」按鈕移到這一步。
   - 列印：計畫為第 1–4 段加上第 5 段計畫簽核；報告與 Word 同為 7 段。
   - 新增中英文字串。
5. **測試**：
   - 後端：`test_audit_agenda_http.py`。
   - 瀏覽器：`audit-agenda-check.mjs`，以及種子 `seed_audit_agenda_review.py`。
   - 既有瀏覽器檢查腳本的步驟編號改成 5 步。
   - layout 檢查改為：第 2 步沒有列印按鈕，第 3 步有 Agenda 表格和列印按鈕，且不能有水平溢出。

## 不在本輪
- Agenda 的稽核項目不和查檢表條文連動，維持自由文字。
- 不新增時間衝突（重疊時段）的檢查。

## 限制
- 共用檔（`db_migrations.py`、`LanguageContext.tsx`）只放本輪的 hunk，用暫存 index 建 blob 產生補丁。工作樹裡其他工作階段未提交的修改不包含在內。
- 開發與測試都在隔離環境進行，不碰 NAS。
