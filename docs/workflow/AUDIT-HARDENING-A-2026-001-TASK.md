# AUDIT-HARDENING-A-2026-001 — TASK（內部稽核 Audit 模組：後端 A 批）

TASK_ID: AUDIT-HARDENING-A-2026-001
ROUND: R1
SOURCE: 使用者在對話中問「audit 模組有啥要修正」（2026-10-09）。Claude 以兩個唯讀審查（後端、前端）整理出分級清單並自行抽查重點後回報；使用者回覆「先做 A 批」。
根目錄 TASK／STATUS／REVIEW 仍是 `DEPLOY-EXEC-2026-001`（後端部署 blocked），所以本輪控制文件放在 `docs/workflow/`（同 MATERIAL-SUBMITTAL 各輪做法），根目錄三份檔案不動。

## 範圍（A 批 = 回報清單的 #3、#4、#5、#6、#7、#12，只改後端）
1. **#3 建立時的狀態**：新建 Audit 只能使用「還有後續轉換」的狀態（Draft／Planned／In Progress／Completed，由 `WorkflowEngine.TRANSITIONS["Audit"]` 推導）；Closed、Void、未知狀態一律 400，不寫入任何資料。
   - 做法說明：選這個規則，而不是只允許 Draft／Planned，是因為前端精靈目前讓新紀錄選任何狀態（例如事後補登 Completed）；只擋死路狀態，不改變既有合法用法。
2. **#4 auditNo 不可在更新時變更**：更新時忽略 `auditNo`（不寫入、不記入稽核紀錄的 new_value）。前端第二次儲存送出 `auditNo: ''` 的錯誤（前端 #1）因此在後端就被擋下，不再清空編號。
3. **#5 日期**：Audit 改用 `core/strict_dates`（與 NOI／NCR／OBS 相同）。建立時欄位層嚴格格式；建立與更新都在服務層以最終內容檢查格式、`date` 不可為 NULL（`''` 仍允許，草稿沒有開始日期的既有用法不變）、開始日不可晚於結束日；更新只檢查有變動的欄位，舊資料原值重送不擋。讀取用的 schema 不再帶日期驗證，一筆壞資料不會讓整個清單 500。
4. **#6 編號**：建立時先 `begin_write_transaction` 再取號；`_DOC_TYPE_TABLES` 加入 `'AUDIT': ('audits', 'auditNo')`，計數器落後時可依資料表自我修正。
5. **#7 錯誤對應**：不採用用戶端送來的 `id`；`IntegrityError` → 409（`AuditConflict`）；建立端點補上 `ValueError` → 400、日期錯誤 → 422。建立與更新都明確 rollback。
6. **#12 Closed 鎖的比較**：JSON 欄位（`selected_templates`／`custom_check_items`）以解析後的值比較，NULL 與 `[]` 視為相同，完整重送一筆 Closed 紀錄不再被誤擋；真的變更仍拒絕。

## 不在本輪
- 前端（B 批：#1、#2、#8、#10、#11，#9 待決策）與 Low 項目（C 批）。
- #13（承包商範圍使用者建立時，編號前綴取自用戶端送的承包商名稱）：回報清單未列入 A 批，維持原樣。
- 待使用者決策：Close／Void 是否需要獨立權限（如 `AUDIT_CLOSE`）、Close 前是否要求必填，以及 Void 是否也要唯讀。未決前不實作。
- 正式站是否已有被清空編號的紀錄：本輪沒有查正式資料。若有，更新時保留的「沒有編號才補號」分支會在下次帶承包商儲存時補一個新號。

## 限制
本地測試只用拋棄式 SQLite 檔與暫存目錄；不碰開發資料庫、8240／3240、8198／3198；不 stash／reset／checkout。未經獨立審查 PASS 不提交、不推送、不部署（PASS 後依 DECISIONS 的持續授權處理，部署前需 Python 3.11 檢查）。
