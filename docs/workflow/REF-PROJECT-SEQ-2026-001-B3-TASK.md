# TASK.md — REF-PROJECT-SEQ 第 3 批：依專案編號、STD 改號、原始文件號

TASK_ID: REF-PROJECT-SEQ-2026-001-B3
SOURCE: 設計 v2（`REF-PROJECT-SEQ-2026-001-DESIGN.md`）第 4、5、7 節；DECISIONS「專案隔離與依專案編號」D2、D11、D12、D14、D17、D21，以及第 8 點。B2 已於 2026-10-14 上線（09f6a688），協調中心通知開始規劃。
基準：開工時由協調中心指定。

## 本輪使用者決定（2026-10-14）
- **共用 Checklist 範本的編號**：比照 ITP，用 `QTS-RKS-STD-CHK-######`。既有範本的號碼不改。
- **Q-WorkFlow 的編號**：`Q-WorkFlow-<專案代碼>-######`，例如 `Q-WorkFlow-HL-000001`。既有的 `Q-WorkFlow-000001` 不改。

## 範圍
1. **編號格式**（D2）
   - 格式為 `QTS-RKS-[PROJECT]-<類型>-######`，不含承包商縮寫。
   - 序號 key 是 `(專案 id, '*', 類型)`。
   - 共用範本（沒有專案）用代碼 `STD`，序號 key 是 `('STD', '*', 類型)`；適用於 ITP 和 Checklist 範本。
   - 規則表沒有設定時，退回 `QTS-RKS-<代碼>-<類型>-`。新增常數：`SYSTEM_CODE='QTS'`、`COMPANY_CODE='RKS'`、`SHARED_CODE='STD'`。
2. **共用編號函式**：`generate_reference_no(db, vendor_name, doc_type, project_id=...)`。
   - 有傳 project_id 時，用專案代碼和新的序號 key。
   - self-heal 改用新前綴比對，並補上 FOLLOWUP。
   - `preview_reference_no` 和 `reference_pattern` 也照新格式。
3. **所有呼叫端改傳 project_id**，取自建立時已經確定的專案：
   - noi（建立；修改時「改承包商就重新編號」的規則拿掉，因為號碼裡已經沒有承包商）
   - itr（建立、開 NCR、重新檢驗、連結 Checklist）、ncr、obs、osd、pqp、followup、meeting_minutes、checklist、itp、audit（建立、修改）、material_submittal
   - db_migrations 裡產生 linkedChecklists 的步驟
4. **專案代碼**（D14）
   - 必填、唯一、2–8 碼英數字、存成大寫；`STD` 是保留字。
   - 在 project_service 的建立和修改時檢查。
   - migration 在非空值上建唯一索引。
   - 專案沒有代碼時，在這個專案新建單據會被拒（400，`PROJECT_CODE_MISSING`）。
5. **命名規則**
   - 預設值改成 `QTS-RKS-[PROJECT]-<TYPE>-`。
   - 設定頁和 API：除了 km 以外，前綴都必須含 `[PROJECT]`；`[ABBREV]` 改為不允許，因為 D2 已經拿掉承包商縮寫。
   - migration 把正式站的規則列改成新的預設值，舊值寫進 audit，作為回滾依據。
6. **STD 改號與原始文件號**（D11、D21、DECISIONS 第 8 點）：一次性 migration，用 migration_flags 確保只跑一次，全部在同一個交易內完成。
   - ITP 新增欄位 `external_doc_no`（可為空）。
   - **對象**：沒有專案的 ITP 中，「系統編的號」才改號。
     - 判斷條件：referenceNo 是 NULL、以 `QTS-` 開頭，或以 `TEST-` 開頭。
     - 正式站是 61＋1＋1＝63 筆。
   - **排序**：先排 `QTS-` 開頭的，依流水號數值；再排其他（`TEST-1`），依字串；最後是 NULL。
   - **改號**：分兩段完成（先改成暫時值，再改成正式值），避免撞到唯一索引。
   - **同步引用**：`noi.itpNo`、`followup.sourceReferenceNo`（sourceModule 為 ITP）、`itr.detail_data` 裡的 itpNo 鍵。
   - **對照表**：新資料表 `itp_renumber_map(old_referenceNo, new_referenceNo, itp_id, migrated_at)`，另外匯出 CSV。
   - **不改**：`audit_logs` 和 `itr_approval_events` 快照。
   - **外部文件號**：其餘 81 筆不改號，把 referenceNo 複製到 `external_doc_no`；只在欄位為空時寫入，每筆寫 audit。
   - **序號**：
     - `('STD', '*', 'ITP')` 設為已改號的最大號；
     - 每個專案的 `(專案 id, '*', 'ITP')` 設為舊前綴 `QTS-RKS-<代碼>-ITP-` 的最大流水號，避免舊號被重複使用。以 Hailong 為例是 75。
7. **Q-WorkFlow**：建立時用 `Q-WorkFlow-<代碼>-######`，序號依專案計算。
8. **預計編號**（第 7 節）
   - `GET /noi/next-reference` 改用目前專案，不再接受 contractor 參數；選「所有專案」時回 400。
   - **拿掉 #8 遮罩**，所有人都看得到完整的預計號碼。
   - 前端 NOIDetailModal 跟著修改。
9. **前端**
   - 命名規則設定頁：說明 `[PROJECT]`，並加上檢查。
   - 專案管理頁：代碼必填和格式檢查，提示代碼設定後不要再改。
   - ITP：顯示「原始文件號」欄位、可以搜尋；共用範本由管理者編輯時可以填寫。
   - NOI 預計編號。
   - LanguageContext 只新增鍵。

## 範圍追加（2026-10-14，經協調中心轉來）
### A. 「document naming rules」工作階段盤點的 5 點
那個工作階段目前閒置；B3 期間 DocumentNamingRules/*、settings.py、utils.py 由本工作階段獨佔。
1. **規則要寫齊**：目前要等有人呼叫 `GET /settings/naming-rules`，規則才會補進資料庫，所以正式站可能還沒有 msa 規則。migration 改成新預設格式時，要確保 13 種 doc_type（含 meeting、msa）都寫入，缺的就建。**B3 吸收**：由 migration 補齊。
2. **計數鍵**：reference_sequences 改成（專案 id, '*', 類型）。新格式下不能跳號，也不能和舊前綴撞號：self-heal 用新前綴比對；舊前綴的最大號，用第 27 步的方式設成序號起點。**B3 吸收**。
3. **驗證和 km 例外**：「必須含 `[PROJECT]`、不准 `[ABBREV]`」，前端 `DocumentNamingRules.tsx` 的 handleSave 和後端 `settings.py` 的 update_naming_rules 一起改；km 不需要 `[PROJECT]`，也不檢查 `[ABBREV]`。**B3 吸收**。
4. **FAT**：規則沒有作用（FAT 沒有編號欄位），前端已經鎖住，維持現狀。
5. **會議記錄**：New Occurrence 是同一個號碼換 rev（使用者 2026-10-11 決定）。已發出的 `QTS-NA-MEETING-000001` 不改號，和 DECISIONS 第 11 點「既有號碼不改」一致。

**不吸收**，留給 naming rules 工作階段在 B3 上線後處理：
- 前端規則清單改由後端提供；
- 清理沒用到的 i18n 鍵；
- 存檔錯誤改用 i18n。

### B. 「ITR模組檢查」工作階段回報：取號競態
- **問題**：ITR 建立時沒有先呼叫 `begin_write_transaction` 就取號，兩筆同時建立可能撞號，撞號時回 500。
- **處理**：和 B3 的取號是同一處，一起修。
- **其他模組**：也檢查 create 是否在取號前就開了寫入交易，沒有的一併補上。
- **測試**：每個補上的模組各加一個測試，在同一交易內連續建立，確認號碼不會重複。

## 預計修改的檔案（★ 為共用檔）
**後端**
- `core/constants.py`、`core/utils.py`（產號、預覽、樣式、self-heal）、★ `core/refusals.py`（只新增代碼）。
- **services**：noi、itr、ncr、obs、osd、pqp、followup、meeting_minutes、checklist、itp、audit、material_submittal（各自的產號呼叫），以及 project_service（代碼檢查）。
- **routers**：settings.py（命名規則的預設值和檢查）、noi.py（next-reference）、projects.py（如果需要）。
- ★ `models.py`：ITP 新增 `external_doc_no`；新資料表 `ItpRenumberMap`。
- ★ `schemas.py`：ITP 加 `external_doc_no`；Project 的代碼檢查。
- ★ `db_migrations.py`：
  - 新增欄位、唯一索引；
  - 命名規則改成新預設值；
  - STD 改號、原始文件號、序號種子；
  - linkedChecklists 產號改傳專案。
- `repositories/km_repository.py`：不改，KM 例外。

**前端**
- `components/DocumentNamingRules/*`；專案管理在 `components/Contractors/Contractors.tsx` 和 `columns.tsx` 裡（專案新增和修改的入口在這裡）。
- `components/ITP/*`（原始文件號欄位、搜尋）、`components/NOI/modals/NOIDetailModal.tsx`（CRLF）。
- `services/api.ts`、`store/itpStore.ts`、★ `context/LanguageContext.tsx`。

**測試**
- 新增 `tests/test_ref_project_seq_b3_http.py`，涵蓋：
  - 每個專案從 1 起算，兩個專案不撞號；
  - 同前綴時接續舊號；
  - 共用範本用 STD；
  - 改專案代碼後序號接續；
  - `STD` 是保留字；
  - 沒有代碼的專案不能建單；
  - 命名規則缺 `[PROJECT]` 時拒絕；
  - STD 改號 migration 的雜湊、引用、對照表；
  - external_doc_no 只寫入空的；
  - Q-WorkFlow 的格式；
  - next-reference。
- **既有測試**：預期會有大量號碼格式的斷言要調整，例如 `QTS-ACC-NOI-000001` 要改成新格式。照 B1、B2 的做法，用共用 helper 處理，不放寬斷言，並列出「依設計改變的斷言」。
- **STD 改號演練**：用正式資料庫的唯讀複本在隔離環境演練，由協調中心提供複本或在部署前執行。

## 限制
- 依 AGENTS.md 和協調規則：只在隔離環境測試；不動 NAS，不推送。
- 共用檔依協調中心的安排處理；和 REFUSAL 第 2 批的重疊，由協調中心排順序。
- 完成後要經過獨立審查、在隔離環境預覽並請使用者確認；3.11 全套通過之後才提交。
