# TASK.md — REF-PROJECT-SEQ 第 4 批：B3 收尾（草稿，待主要調度核定）

TASK_ID: REF-PROJECT-SEQ-2026-001-B4
SOURCE: B3 收尾清單（2026-10-14 交給協調中心，來源為 B3 R1 P3-1／P3-7／P3-9／P3-10、第二審查建議 (1)，以及上線後的對照表匯出）。使用者 2026-10-17 決定「2b 提交後先派第 1 組（REF-PROJECT-SEQ B4 收尾）」。
基準：REFUSAL 2b（REFUSAL-DIALOG-2026-003）的 commit，由主要調度在 2b 提交後指定。**在那之前只做唯讀準備，不改程式。**
狀態：檔案清單與決定已由主要調度核定（2026-10-17）；等 2b-1 commit hash 開工。

已不必做：「命名規則存檔時 strip 前綴」已由 NAMING-RULES-CLEANUP-2026-001（9da76d9f）完成。

## 範圍
1. **STD 只給範本**（B3 R1 P3-1、第二審查 (1)）
   - 現況：`core/utils.numbering_code` 在 `project_id=None` 時，對所有類型都回 `STD`，所以沒有專案的 NCR／ITR／NOI 等會被編成 `QTS-RKS-STD-NCR-…`。
   - 改法：`project_id is None` 時，只有 `ITP`、`CHECKLIST` 可以用 STD；其他類型（含 `QWORKFLOW`）拋 `RefusalHTTPException(400, …, "NUMBERING_PROJECT_REQUIRED")`（代碼名稱可由審查調整；沿用 `core/refusals` 的既有類別，不改 `refusals.py`）。
   - 影響範圍（讀碼確認）：HTTP 建立流程碰不到（B2 要求一律有專案）。會受影響的是內部呼叫：
     - `itr_service` 從沒有專案的舊 ITR 開 NCR（1315）、重新檢驗（1437）：ITR 沒有專案時改為拒絕；連結 Checklist（1095、1490）是 CHECKLIST，仍允許。
     - `audit_service` 補號（196、321）：B3 已改成 `or db_audit.project_id`，只在稽核本身沒有專案時會拒絕。
     - `db_migrations._migrate_itr_linked_checklists`（1320）：CHECKLIST，仍允許。
     - `scope=None` 的內部與測試呼叫：預期有既有測試從「得到 STD 號」改成「400」，照 B1–B3 做法用共用 helper 處理，不放寬斷言。
   - 前端：`LanguageContext.tsx` 只新增 `refusal.code.NUMBERING_PROJECT_REQUIRED`（en／zh）；`tests-unit/refusal.test.ts` PARAMS 補上。
2. **Q-WorkFlow 補建與無專案分支改依專案**（B3 R1 P3-7）
   - `db_migrations._backfill_qworkflows`：目前用 raw SQL 發全域 `Q-WorkFlow-######`，而且不寫 `project_id`。改成：有專案的 NOI 用 `generate_reference_no(db, "", "QWORKFLOW", project_id=noi.project_id)`（需改用 Session 並先 `begin_write_transaction`），同時寫入 `qworkflow.project_id`；沒有專案的 NOI 維持全域 MAX+1（只剩舊資料會碰到；若第 1 項決定 QWORKFLOW 也拒絕 None，這裡要明確分流，不能讓 backfill 因拒絕而整批跳過）。
   - `noi_service._create_qworkflow_for_noi`：無專案分支（389–410）保留給舊資料，或在第 1 項落地後拿掉；二擇一，草稿建議**拿掉**，因為 create 一律有專案（B2），無專案的 NOI 不會再新增。
   - 既有測試 `test_noi_qworkflow_backfill_rule_http.py` 第 82、113 行斷言 backfill 發全域號；若測試資料的 NOI 帶專案，改成 `Q-WorkFlow-<代碼>-`；不帶專案的維持全域號。列為「依設計改變的斷言」。
3. **新建或改代碼的專案沿用同名舊承包商計數**（B3 R1 P3-9）
   - 現況：第 29 步只在 migration 當下處理已有代碼的專案。之後新建或改代碼的專案，如果代碼等於某個舊承包商縮寫（舊 key `(QTS, <縮寫>, <doc>)`），只靠 self-heal 比對現存最大號；該縮寫下已刪除的號碼可能重發。
   - 改法：把第 29 步的「舊計數設為序號起點」抽成 `core/utils.continue_counters_from_legacy_abbreviation(db, project_id, code)`（只往上調，`UPPER(doc)=TYPE`，fat／km 除外），第 29 步和 `project_service.create_project`／`update_project`（代碼有變時）都呼叫它。
4. **拒絕 id 為 "STD" 的專案**（B3 R1 P3-10）
   - 現況：`ProjectCreate.id` 允許客戶端指定；`scripts/verification/m5_upgrade_rollback_rehearsal.py` 第 112 行有用到，所以**保留客戶端指定 id**，只拒絕保留值。
   - 改法：`project_service.create_project` 在 id（去空白、不分大小寫）等於 `STD` 時拋 `Refusal("PROJECT_ID_RESERVED", …)`；router 既有的 `ValueError → refusal_http` 會轉成 400。前端不送 id，不用改畫面；`LanguageContext` 新增一組鍵、`refusal.test.ts` PARAMS 補上。
5. **刪除 `crud.py` 的舊取號程式**
   - `crud.generate_reference_no`（94–142）沒有任何呼叫端（已 grep：`db_seeder`、`middleware/auth`、`core/security`、scripts 只用 user／role 相關函式）。一併檢查 `get_contractor_abbreviation`（76）和只為它存在的 import（`re`、`DocumentNamingRule`、`ReferenceSequence`、`PROJECT_CODE`）是否還有人用，沒有就一起刪。
6. **匯出 ITP 改號對照表 CSV**（正式站，唯讀）
   - 不是程式改動，是上線收尾。提供 `scripts/verification/export_itp_renumber_map.py`：以唯讀模式（`file:<db>?mode=ro`）開資料庫，把 `itp_renumber_map` 的 `itp_id, old_referenceNo, new_referenceNo, migrated_at` 依新號排序寫到指定路徑。由主要調度在 NAS 執行；CSV 依協調規則存放，**不放進 repo**。
7. **BACKLOG.md 補記**：這 6 項目前只在協調看板，BACKLOG.md 沒有。B4 開工時新增第 54 條（或一條含 6 個子項），各子項註明來源（B3 R1 P3-x／第二審查）、狀態，完成後更新。**等 2b 提交後才改 BACKLOG.md。**

## 決定（2026-10-17，主要調度依使用者「自動回應」授權依建議值決定，使用者已知；若使用者改口再更新）
- D-B4-1：`QWORKFLOW` 在 `project_id=None` 時**也拒絕**；backfill 對無專案 NOI 走全域號分流。
- D-B4-2：**拿掉** `noi_service` 的無專案 Q-WorkFlow 分支。
- D-B4-3：`ProjectCreate.id` **只拒絕 "STD"**，仍接受客戶端指定 id。
- 寫進 DECISIONS.md 時註明「協調中心依建議值決定、使用者已知」（等 2b 提交後再改 DECISIONS.md）。
- BACKLOG.md 的新條目用**第 57 條**（2b 在 rd2b 已新增 54–56）。
- 開工基準：**2b-1 的 commit**（2b-2 只改橫幅、清鍵、tests-browser，不碰 B4 的檔案，不必等）。

## 預計修改的檔案（★ 與 REFUSAL 2b 重疊，以 2b 的 commit 為基準再改）
以 2b 工作樹 `git status`（2026-10-17 唯讀查看）核對，**2b 實際改到的檔案比預期多**：除了預期的 itr_service、noi_service、LanguageContext、refusal.test.ts、BACKLOG.md，還有 `project_service.py`、`tests/test_ref_project_seq_b3_http.py`、`ProjectModal.tsx`、`projectStore.ts`、`DocumentNamingRules.tsx`。B4 會碰到前兩個。`core/refusals.py` 2b 沒有改，B4 也不需要改。

**後端**
- `core/utils.py`：第 1 項（`numbering_code`／`_reference_format` 的類型限制）、第 3 項（抽出共用 helper）。
- `services/project_service.py` ★：第 3 項（建立／改代碼後補序號起點）、第 4 項（拒絕 id STD）。
- `services/noi_service.py` ★：第 2 項（無專案分支）。
- `services/itr_service.py` ★：預期**不改**；第 1 項的拒絕由 `core/utils` 統一拋出。若審查要求在 ITR 端先檢查再取號，才會改。
- `db_migrations.py`：第 2 項（backfill 改依專案、寫 project_id）、第 3 項（第 29 步改呼叫共用 helper；flag 與行為不變）。
- `crud.py`：第 5 項。
- `routers/projects.py`：預期不改（既有 `ValueError → refusal_http`）。
- `scripts/verification/export_itp_renumber_map.py`（新增）：第 6 項。

**前端**（只新增鍵，不改畫面）
- `context/LanguageContext.tsx` ★：`refusal.code.NUMBERING_PROJECT_REQUIRED`、`refusal.code.PROJECT_ID_RESERVED`（en／zh）。
- `tests-unit/refusal.test.ts` ★：PARAMS 補兩個代碼。

**測試**
- 新增 `tests/test_ref_project_seq_b4_http.py`：
  - 沒有專案的 NCR／ITR／NOI／QWORKFLOW 取號回 400；ITP／CHECKLIST 仍是 STD；
  - 從沒有專案的 ITR 開 NCR／重新檢驗回 400，連結 Checklist 仍可；
  - backfill：有專案的 NOI 補到 `Q-WorkFlow-<代碼>-` 並寫 project_id，無專案的維持全域號，重跑不重複；
  - 新建專案代碼等於舊承包商縮寫時，第一個號接續舊計數；改代碼時同樣；只往上調；
  - id 為 `STD`／` std `的專案回 400 `PROJECT_ID_RESERVED`，其他指定 id 仍可；
  - `crud` 不再有 `generate_reference_no`；
  - 匯出腳本在唯讀複本上產生正確 CSV，且不改動資料庫。
- `tests/test_ref_project_seq_b3_http.py` ★：若第 1 項影響 `test_two_creates_in_one_transaction_get_distinct_numbers_for_every_type`（該測試用專案 P，預期不受影響），再調整。
- `tests/test_noi_qworkflow_backfill_rule_http.py`、`tests/test_noi_create_atomic_http.py`：依第 2 項調整斷言，列為「依設計改變」。
- 既有測試中 `scope=None` 且不帶專案的建立，預期一批會從 STD 號變 400：照 B1–B3 做法用共用 helper 處理，逐檔列出。

**文件**
- `BACKLOG.md` ★：第 7 項，新增第 57 條。
- `DECISIONS.md` ★：只在 D-B4-1～3 由使用者決定後新增一條。
- `docs/workflow/REF-PROJECT-SEQ-2026-001-B4-{TASK,STATUS,REVIEW}.md`、`-B4-evidence/`。

## 驗證
- 後端 3.11 全套（`docs/workflow/py311-full-suite.sh`）；前端 `tsc`、`npm test`。
- 第 2 項與第 3 項用正式資料庫複本演練（唯讀來源、複本放隔離目錄、演練後刪除、只留統計）：確認 backfill 在正式站不會新增任何列（每個 NOI 都已有列），第 29 步重跑無變更。
- 第 6 項在複本上試跑匯出，核對 63 筆。

## 限制
- 依 AGENTS.md 和協調規則：只在隔離環境測試；不動 NAS，不推送；不用 stash／reset／checkout；提交用臨時 index、不移動 ref，排除 COORDINATION.md 和 py311-full-suite.sh。
- 2b 提交前不改任何程式；2b 提交後以其 commit 為基準，重疊檔案（★）以 2b 版本為底再改。
- 完成後經獨立審查、3.11 全套、隔離預覽（本批沒有畫面變更，預覽只看拒絕訊息文字）後，由使用者確認再提交。
