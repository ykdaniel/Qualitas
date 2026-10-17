# REVIEW.md — REF-PROJECT-SEQ-2026-001-B4

TASK_ID: REF-PROJECT-SEQ-2026-001-B4
ROUND: R1（2026-10-17，獨立審查，基準 247ee771，工作樹 scratchpad/b4）

## 判定：PASS with notes（前提：3.11 全套第 2 輪綠燈，見 P2-1）

沒有 P1。差異只在 TASK 核定的檔案清單內（含預告的「既有 scope=None 測試改帶專案」，審查期間又多了 4 個同類測試檔，見 P2-1 與第 8 點）；第 29 步未改是合理偏離（已在正式站執行過、flag 已設，改了也不會再跑）。4 個取號入口（generate／preview／pattern／reclaim）都經過 `_reference_format`，守門一次到位；crud 刪除乾淨；行尾無破壞；本機目標測試 96 passed、前端 tsc 0 錯、npm test 217 passed。

## P1（上線前必修）
無。

## P2（應修）
1. **3.11 全套第 1 輪不是綠的（`-B4-evidence/py311-full-suite-r1.txt`：6 failed、2829 passed、17 skipped）。** 6 個失敗都在 4 個既有測試（`test_audit_hardening_http.py`、`test_checklist_itr_isolation_integration.py`、`test_itr_revoke_approval_evidence_integrity.py`、`test_obs_engineer_approval_identity.py`）用 `scope=None` 建無專案的稽核／ITR 重新檢驗／OBS 再取號——正是 B4 設計要拒絕的情境，不是產品缺陷。實作者已在審查期間依 TASK 預告的方式（只補 `project_id`，斷言不動）調整這 4 個檔並列入 STATUS；我在工作樹實測這 4 檔 **61 passed**。但上線前仍需 **3.11 全套第 2 輪綠燈**（STATUS 寫執行中），以第 2 輪的 evidence 檔為準；這一條不需要改程式，只是 PASS 的前提。

## P3（備註，不擋上線）

1. **`backend/db_migrations.py:1170–1181`：候選 NOI 在 `begin_write_transaction` 之前讀取。** `begin_write_transaction` 的契約是「任何讀取之前」；這裡 LEFT JOIN 查候選列在鎖之前、計數讀取在鎖之後。只在啟動時執行、沒有並行建立者，實務無害；若要與契約一致，把 `begin_write_transaction(db)` 提到 `candidates = ...` 之前（正式站每個 NOI 都有列時會多拿一次無害的寫鎖，可接受），或在 docstring 註明理由。

2. **`backend/core/utils.py:587–621` 與第 29 步語意不同（偏安全方向）。** 第 29 步只在「舊前綴文字換上代碼後等於新前綴」時才接續計數（`db_migrations.py:850–851` 的 different-text 檢查）；共用 helper 無法再拿到舊規則，所以只要存在 `(QTS, <代碼>, <類型>)` 的舊列就接續。結果只會「多跳號」、不會撞號（只往上調），符合 TASK「只往上調」。情境：某類型舊前綴曾被改成別的文字、而新專案代碼恰好等於該縮寫 → 第一號從舊計數之後開始，留下空號。接受即可；若在意，可在 docstring 註明「可能留空號」。

3. **B3 上線（2026-10-14）到 B4 上線之間新建或改代碼的專案沒有被補到。** helper 只在 create／update 時呼叫，第 29 步只跑一次；這段期間若有人新建代碼等於舊縮寫的專案，仍只靠 self-heal。正式站當時只有 1 個專案（HL，第 29 步已處理），預期沒有。建議主要調度上線前在唯讀複本跑一句核對：`SELECT p.id, p.code, s.doc, s.last_seq FROM projects p JOIN reference_sequences s ON UPPER(s.vendor)=UPPER(TRIM(p.code)) AND s.vendor<>'*'` 對照 `(p.id,'*',UPPER(s.doc))` 的 last_seq；若有低於舊計數的，改一次代碼再改回即可補上（或臨時呼叫 helper）。

4. **正式站若仍有 `project_id IS NULL` 的非範本單據，衍生建立會從 STD 號變 400。** B2 的指派步驟已把所有無專案單據歸到唯一專案（`db_migrations.py:607–611`），正式站預期為 0；受影響路徑只有 ITR 開 NCR／重新檢驗（`itr_service.py:1319, 1441`）、無專案 Meeting 的 Draft 刪除 reclaim（`meeting_minutes_service.py:396`，已包在 try/except → 只記 warning，刪除照常）。建議上線前在複本數一次：`SELECT COUNT(*) FROM itr WHERE project_id IS NULL`（ncr／noi／meeting_minutes／audits 同）。

5. **`backend/scripts/verification/export_itp_renumber_map.py`：缺檔或缺表時是未捕捉的 traceback（exit 1）。** `sqlite3.connect(..., mode=ro)` 對不存在的檔案、或沒有 `itp_renumber_map` 的資料庫會直接拋 OperationalError；結果仍是非 0 退出，可用但不友善。另外 `mode=ro` 在 WAL 模式下需要能寫 `-shm`，在 NAS 上請對**複本**或用 `?mode=ro&immutable=1` 執行，不要指向容器正在使用的檔案。CSV 欄位、排序與唯讀（雜湊不變）已由測試證明。

6. **`_reference_format` 的 `docType` 參數是顯示代碼（FUI／AUD／MOM／CHK）。** 前端文案「A {docType} must belong to a project…」會顯示「A FUI must…」；與既有 LINK_OTHER_PROJECT 等代碼的用法一致，只是提醒文案觀感，不必改。

7. **`project_service.py:123` 改代碼的比較用 `old.strip().upper()`。** 舊資料若存小寫代碼（B3 之前的列）、新值只是大小寫不同時不會呼叫 helper；因為取號本來就 `UPPER`，計數不受影響，正確。

## 與 ITP-VP-CODES-2026-001 的合併相容性（主要調度追加問題）
- B4 對 `db_migrations.py` 只改 `_backfill_qworkflows` 函式本體（現檔 1144–1215 行，diff 兩個 hunk 都在其中）；`run_migrations` 的結尾（`_naming_rules_to_project_format()` 後的 `logger.info("Migrations completed.")`，約 200–202 行）B4 沒有碰。另一批在結尾追加一步，與 B4 的 hunk 相距約 950 行，git 三方合併不會衝突；只是兩批都動同一檔，後落地者需要 rebase 一次。
- B4 **沒有新增任何 `migration_flags` 名稱**，也沒有新步驟編號（diff 中無 FLAG／migration_flags 字樣），不會與對方的 flag 撞名。
- 語意上互不影響：backfill 在第 6 步執行、對方在最後一步；backfill 只碰 `qworkflow`、`reference_sequences`、`projects.code`（讀）。

## 逐項核對（依主要調度的 9 點）
1. **utils 守門**：`_reference_format` 是 generate／preview／pattern／reclaim 唯一的格式來源（`core/utils.py:544, 553, 559, 571`），`project_id is None` 且類型不在 `{ITP, CHECKLIST}` 就 400；無法從任何 HTTP 路徑再發無專案的非範本號。合法路徑不受影響：共用 Checklist 範本（`checklist_service.py:562`，`project_id=None`）、重新檢驗時複製 Checklist（`itr_service.py:1494`，帶新 ITR 的 project_id；None 時仍是 CHECKLIST）、`_migrate_itr_linked_checklists`（`db_migrations.py:1329`，CHECKLIST）、seeder 的 ITP（`db_seeder.py:305`）。`continue_counters_from_legacy_abbreviation`：只在 `row.last_seq < old_last` 時改、否則 `continue`；`UPPER(vendor)`／`UPPER(doc)` 處理大小寫（測試用 `zz`／`ZZ`、`audit`）；`vendor <> '*'` 排除新式列；QWORKFLOW 明確跳過；FAT／KM 不在 `_DOC_TYPE_TABLES`，自然排除，與第 29 步一致。
2. **project_service**：`normalize_project_id` 去空白後不分大小寫比對 `{SHARED_CODE}`，空白→None→uuid，其他 id 保留；`Refusal` 是 `ValueError` 子類，`_code_clash` 原樣回傳非 IntegrityError，router 既有 `ValueError → refusal_http` 轉 400（測試實測 `STD`／` std `→400、`MY-SITE` 可指定）。create 在 flush 後、commit 前呼叫 helper（同一交易，INSERT 已持寫鎖）；update 只在正規化後代碼不同時呼叫。2b-1 的 `DUPLICATE_NAME`／`PROJECT_CODE_DUPLICATE` 映射未動。
3. **noi_service**：`_reference_seq_lock` 其他使用者只剩 `km_repository.py:10`（自己 import，不受影響）；`_create_qworkflow_for_noi` 只有 `create_noi` 呼叫，而 `enforce_create_scope` 已要求專案（B2，`PROJECT_REQUIRED_FOR_CREATE`），`noi.project_id` 不會是 None；萬一是，utils 拋的是 `RefusalHTTPException(400)` 不是 500。
4. **backfill**：Session 版，寫鎖在計數讀取之前（見 P3-1 對候選讀取的備註）；有專案寫 `project_id`；全域最大值只認 `re.fullmatch(r"Q-WorkFlow-(\d+)")`；單一專案取號失敗 `continue` 並記 warning；外層 except 做 `rollback`，`finally` 關 session；`rows` 為空時在拿寫鎖前就 return（正式站預期如此 → no-op）；`noi_has_own_qworkflow(ncr_number)` 的套用方式與原本相同。測試實測：PA／PB 各自 000001、無專案 000008、既有列不動、重跑不變、PN 無代碼被跳過後補代碼再補齊。
5. **crud.py**：只刪 `re`／`DocumentNamingRule`／`ReferenceSequence` import、`PROJECT_CODE`、`get_contractor_abbreviation`、`_resolve_vendor_id`、`generate_reference_no`；`log_audit`、`_json_serialize`、user／role／contractor 函式都在。grep `backend/`（排除 .venv）：沒有任何呼叫端引用被刪的名稱；`crud.` 的使用只剩 user／role／itp 函式。
6. **匯出腳本**：`file:<abs>?mode=ro` + `uri=True`，只 SELECT；參數錯 exit 2、空表 exit 1、有列 exit 0；CSV 表頭 + 依 `new_referenceNo` 排序（見 P3-5）。
7. **前端**：`LanguageContext.tsx` diff stat +4/−0，新增 4 行皆為 CRLF，全檔 CRLF 行數 3659→3663；en／zh 各有兩個新鍵；`refusal.test.ts` PARAMS `NUMBERING_PROJECT_REQUIRED: ['docType']`、`PROJECT_ID_RESERVED: ['projectId']` 與後端 `{"docType": label}`／`projectId=value` 一致，且該測試會掃後端原始碼找代碼，缺鍵會失敗。
8. **測試**：新檔 10 個測試涵蓋 STATUS 的每一條主張（含 `db.query(ReferenceSequence).count()==2` 證明拒絕前沒有寫計數、`reference_sequences` 為 0 證明 ITR 衍生拒絕前沒取號、資料庫雜湊不變）。三個既有測試的改動都是把「無專案得 STD／全域號」改成設計後的確定值，不是放寬：backfill_rule 第 82／113 行改成 `-PA-` 號且保留全域 000005／000009 不動的斷言；create_atomic 第 351 行改成 000001 並註明原因；integration 只加 `project_id="p-int"`，號碼尾碼與 reclaim 斷言未動。審查期間新增的 4 個檔（3.11 第 1 輪抓到）同樣只補專案：audit_hardening 的 6 個並發 worker 改 `body(project_id=TEST_PROJECT_ID)`（「號碼互異」斷言不動）；checklist_itr_isolation 的 `vendor` fixture 建 `p-iso`、`_make_itr` 預設 `project_id`；itr_revoke 的 fixture 建 `p-rev`，`itr-1`／`itr-4` 帶專案；obs_engineer 的單一 create 測試建 `p-obs` 並帶專案。讀過 4 個 diff（+12／−3），沒有任何斷言被放寬。
9. **範圍**：`git status` 的 12 個修改（審查期間增為 16 個，多出的 4 個都是上述既有測試）+ 2 個新增檔都在 TASK 清單內（BACKLOG 條號由 57 改 59 是因 2b 之後已到 58，合理）；`routers/projects.py`、`itr_service.py`、`test_ref_project_seq_b3_http.py` 如預期未改；沒有意外變更；後端 5 個 CRLF 檔行尾全數保留（行數差等於實際增刪）。

## 實測 vs 讀碼
- **實測**（工作樹、拋棄式 `DATABASE_URL=sqlite:///$TMPDIR/review-b4.db`、本機 Python 3.14）：`pytest tests/test_ref_project_seq_b4_http.py tests/test_noi_qworkflow_backfill_rule_http.py tests/test_noi_create_atomic_http.py tests/test_integration_real_db.py tests/test_ref_project_seq_b3_http.py tests/test_noi_service.py` → **96 passed（81s）**；另跑審查期間多出的 4 個檔 `tests/test_audit_hardening_http.py tests/test_checklist_itr_isolation_integration.py tests/test_itr_revoke_approval_evidence_integrity.py tests/test_obs_engineer_approval_identity.py` → **61 passed（15s）**。前端 `npx tsc --noEmit -p .` exit 0；`npm test` **217 passed**。行尾：`grep -c $'\r$'` 逐檔比對 247ee771 與現況。
- **讀碼**：守門覆蓋面、各 generate_reference_no 呼叫端的 project 來源、backfill 交易／回滾／no-op 路徑、helper 與第 29 步的語意差異、crud 呼叫端 grep、匯出腳本、合併相容性。
- **沒做**：3.11 全套（第 1 輪 r1 已結束：6 failed／2829 passed，失敗都在 P2-1 的 4 個檔；第 2 輪由實作者另行執行中，以其 evidence 檔為準，審查者未跑全套）；正式資料庫複本演練（待快照；P3-3／P3-4 的兩句核對建議併入演練）；隔離預覽（本批無畫面）。
