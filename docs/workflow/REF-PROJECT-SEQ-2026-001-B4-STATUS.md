# STATUS.md — Claude 執行結果

TASK_ID: REF-PROJECT-SEQ-2026-001-B4
ROUND: 1（2026-10-17）
基準：開發與審查在 REFUSAL 2b-1 的 commit 247ee771 上（commit 4f089266）；2b＋ITP-VP-CODES 於 2026-10-17 15:52Z 上線後，依主要調度指示用 format-patch 重放到正式站 HEAD **1b37ce9d** 之上（3-way，無衝突；`db_migrations.py` 與 ITP 第 30 步同檔不同區塊，步驟順序與旗標名已核對），以 1b37ce9d 為父重新提交。

## RESULT
- [x] LIVE 2026-10-17 18:10Z（台灣 10-18 02:10），正式站 69edeac5（＝9749c2b4＋REFUSAL 文件 cherry-pick）：R1 PASS with notes（P3 已處理或列入上線前核對）；3.11 全套第 2 輪 2835 passed、0 failed（在 247ee771 上）；合併樹 3.11 2839 passed（協調中心）；正式快照演練無變更；上線實測 Migrations completed、0 ERROR、無 backfill 警告、qworkflow 仍 1 列、bundle 含兩個新代碼；對照表 63 筆已匯出。未做登入功能測試。

## 決定
DECISIONS「第 4 批編號收尾」：D-B4-1 拒絕、D-B4-2 拿掉、D-B4-3 只拒絕 STD（主要調度 2026-10-17 依建議值決定，使用者已知）。

## 本輪修改：產品程式

### 後端
| 檔案 | 內容 |
|---|---|
| `core/utils.py` | • `SHARED_TEMPLATE_TYPES = {ITP, CHECKLIST}`；`_reference_format` 在 `project_id=None` 且類型不在其中時，拋 400 `NUMBERING_PROJECT_REQUIRED`（參數 `docType`），取號、預覽、reclaim 都經過這裡。<br>• 新增 `continue_counters_from_legacy_abbreviation(db, project_id, code)`：對每個會編號的類型（QWORKFLOW 除外），把舊 key `(QTS, <縮寫>, <doc>)` 的最大計數設為 `(專案 id, '*', TYPE)` 的起點，只往上調，由呼叫端 commit。 |
| `services/project_service.py` | • `normalize_project_id`：id 去空白後不分大小寫等於 `STD` 時拋 `Refusal("PROJECT_ID_RESERVED", projectId=…)`；空白仍自動產生 id；其他指定 id 照舊（D-B4-3）。<br>• 建立：取得代碼後呼叫 `continue_counters_from_legacy_abbreviation`。<br>• 修改：代碼有變（和舊值去空白大寫比較不同）才呼叫；同代碼再存一次不會動計數。 |
| `services/noi_service.py` | `_create_qworkflow_for_noi` 拿掉無專案分支和 `_reference_seq_lock`，一律 `generate_reference_no(..., 'QWORKFLOW', project_id=noi.project_id)`；沒有專案時由 utils 拒絕（D-B4-2）。 |
| `db_migrations.py` | `_backfill_qworkflows` 改用 Session：先 `begin_write_transaction`；有專案的 NOI 用 `generate_reference_no(QWORKFLOW, project_id)` 並寫入 `project_id`；沒有專案的 NOI 用全域號，全域最大值只認 `Q-WorkFlow-\d+`（不把 `Q-WorkFlow-PA-000001` 的尾碼算進去）。某個專案不能取號時（例如沒有代碼），該 NOI 跳過並記 warning，其餘照常，下次啟動再補。第 29 步**沒有改**（已在正式站跑過，flag 已設；TASK 草稿原本寫要改成呼叫共用 helper，為了不動已執行過的 migration 而取消）。 |
| `crud.py` | 刪除 `PROJECT_CODE`、`get_contractor_abbreviation`、`_resolve_vendor_id`、`generate_reference_no`（都沒有呼叫端），以及只為它們存在的 `re`、`DocumentNamingRule`、`ReferenceSequence` import。`log_audit`、`_json_serialize` 和 user／role／contractor 函式保留（seeder、auth、user_service 仍在用）。 |
| `scripts/verification/export_itp_renumber_map.py`（新增） | 以 `file:<db>?mode=ro` 唯讀開啟，把 `itp_renumber_map` 依新號排序寫成 CSV；map 為空時 exit 1。由主要調度在 NAS 執行，CSV 不進 repo。 |

### 前端（只新增鍵，沒有畫面變更）
- `context/LanguageContext.tsx`（CRLF，+4／−0）：`refusal.code.NUMBERING_PROJECT_REQUIRED`、`refusal.code.PROJECT_ID_RESERVED`（en／zh）。
- `tests-unit/refusal.test.ts`：PARAMS 補 `NUMBERING_PROJECT_REQUIRED: ['docType']`、`PROJECT_ID_RESERVED: ['projectId']`。

### 文件
- `BACKLOG.md`：新增第 59 條（IN PROGRESS）。
- `DECISIONS.md`：新增「第 4 批編號收尾」一條，接在 2b 的條目之後。

### 實作中的失誤（已修正）
- 刪 `crud.py` 時第一次切太寬，把 `_json_serialize` 和 `log_audit` 一起刪掉，`user_service` 因此 import 失敗。從 247ee771 取回原檔，只刪三個取號函式和 import 後重跑，`crud.log_audit` 正常。

## 本輪修改：測試
- **新增 `tests/test_ref_project_seq_b4_http.py`**（沿用 B3 的 fixture，10 個測試）：
  - 沒有專案時 ITP／CHECKLIST 得到 STD 號，其餘 11 種（含 QWORKFLOW、小寫 `ncr`）回 `NUMBERING_PROJECT_REQUIRED`，`docType` 是顯示用代碼（NCR、FUI、AUD、CHK、MOM…），而且沒有寫入任何計數；`preview_reference_no` 同樣拒絕；
  - 從沒有專案的失敗 ITR 開 NCR、重新檢驗：400 `NUMBERING_PROJECT_REQUIRED`，沒有新增任何列、沒有計數；
  - backfill：PA／PB 的 NOI 各自 `Q-WorkFlow-<代碼>-000001` 並寫入 project_id，無專案的舊 NOI 接全域號 000008（既有 000007 之後），既有列不動，重跑不變；之後在 PA 建 NOI 得到 `-PA-000002`；
  - 沒有代碼的專案 PN：其 NOI 被跳過，PA 的照常補；補上代碼後下次 backfill 完成；
  - 新專案代碼 `zz` 等於舊承包商縮寫：`(QTS, zz, NCR)=41`、`(QTS, ZZ, audit)=3` 變成該專案的起點，`km` 不算；第一個 NCR 是 `QTS-RKS-ZZ-NCR-000042`；
  - 改代碼為 YY：NCR 已是 50 不下調、OBS 從 4 接續；同代碼再存一次不動；
  - id `STD`／` std `：400 `PROJECT_ID_RESERVED`，params `{projectId}`，沒有建立；`MY-SITE` 仍可指定；
  - `crud` 沒有 `generate_reference_no`／`get_contractor_abbreviation`／`PROJECT_CODE`，仍有 `create_user`、`get_role_by_name`；
  - 匯出腳本：空 map 回 0，2 筆時 CSV 內容正確、資料庫檔案雜湊不變。
- **依設計改變的斷言**：
  | 測試檔 | 改變 |
  |---|---|
  | `test_noi_qworkflow_backfill_rule_http.py` | 第 82 行歷史 NOI（P-A）補列的號碼從全域 `000001` 改成 `Q-WorkFlow-PA-000001`；第 113 行兩筆補列從全域 `000010／000011` 改成 `PA-000001／000002`（既有全域 000005／000009 不動）。 |
  | `test_noi_create_atomic_http.py` | 第 351 行無專案的 legacy NOI 補列從 `000002` 改成 `000001`：新建 NOI 的 `-PA-000001` 不再算進全域序列。 |
  | `test_integration_real_db.py` | `vendor` fixture 多建一個專案 `p-int`（代碼 INT）；7 個 `NCRCreate`、8 個 `MeetingMinutesCreate`、1 個 `ITRCreate` 都帶 `project_id="p-int"`。這些測試原本用 `scope=None` 建立無專案的單據，B4 起會被拒絕；斷言本身沒有放寬（號碼尾碼、reclaim 行為不變）。 |
  | `test_audit_hardening_http.py` | 並發建立稽核的 6 個 worker 改成 `body(project_id=TEST_PROJECT_ID)`（原本 `scope=None` 無專案）；「6 個號碼互不相同」的斷言不變。 |
  | `test_checklist_itr_isolation_integration.py` | `vendor` fixture 多建專案 `p-iso`；`_make_itr` 預設 `project_id="p-iso"`（可被 overrides 覆蓋）。3 個重新檢驗的測試因此能取號；斷言不變。 |
  | `test_itr_revoke_approval_evidence_integrity.py` | `vendor` fixture 多建專案 `p-rev`；`_make_approved_itr_with_evidence` 的 ITR 和 `itr-4` 帶 `project_id="p-rev"`。只有重新檢驗那一個測試需要，其餘 ITR 不取號、未改。斷言不變。 |
  | `test_obs_engineer_approval_identity.py` | `test_create_strips_any_client_submitted_approved_by` 先建專案 `p-obs`，`OBSCreate` 帶 `project_id`；「偽造的核准人被清掉」的斷言不變。 |
  這 4 個檔是 3.11 全套第 1 輪才抓到的（本機只跑了編號相關的套件）。
- **沒做的反向驗證**：B4 的斷言都是舊程式產生不出來的確定值（新代碼、`-PA-` 格式、計數起點、`crud` 屬性不存在），所以沒有另外做「拿掉修正會失敗」的驗證。

## R1 之後的修正（R1：PASS with notes，沒有 P1／P2）
| 項目 | 處理 |
|---|---|
| P3-1 backfill 的候選查詢在寫鎖之前 | `begin_write_transaction` 移到任何讀取之前；提早 return 時由 `finally` 的 rollback 釋放鎖。 |
| P3-2 helper 和第 29 步語意不同（可能留空號、不會撞號） | 在 docstring 寫明。 |
| P3-5 匯出腳本缺檔／缺表是 traceback | 缺檔或沒有 `itp_renumber_map` 時給訊息、exit 2；docstring 註明要對複本或 `.backup` 執行。 |
| P3-3、P3-4 上線前核對 | 寫進下方「上線影響」，由主要調度在唯讀複本執行。 |
| P3-6、P3-7 | 文案觀感與既有代碼一致、比較方式正確，不改。 |
| 合併相容性（ITP-VP-CODES） | 審查確認：B4 只改 `_backfill_qworkflows` 本體，沒有新 flag、沒有新步驟；對方在 `run_migrations` 結尾追加一步，hunk 相距約 950 行，三方合併不衝突。後落地者 rebase 後核對步驟順序與 flag 名稱即可。 |

## 重放到 1b37ce9d（2026-10-17）
- `git format-patch` 的 4f089266 以 `git apply -3` 套到 1b37ce9d：7 個 hunk 走 3-way 重新定位，沒有衝突標記；`db_migrations.py` 只含 B4 的 `_backfill_qworkflows`（第 6 步）變更，ITP 的 `_clear_itp_vp_q()`（最後一步，flag `itp_vp_q_cleared_v1`）不受影響，B4 沒有新 flag。
- `LanguageContext.tsx` 在 2b-2 清過鍵之後仍只是 +4／−0；CRLF 檔行尾全數保留。
- 重放後的測試見「執行證據」最後一項。

## 執行證據
- **本機 Python 3.14（開發參考）**：`test_ref_project_seq_b4_http.py`＋B2／B3＋backfill＋create_atomic＋integration＋settings＋utils＋noi_audit＋materials＋seeder：第一次 11 failed（1 個是我的 ITR 測試狀態不對，10 個是 integration 的無專案建立）；修正後 **全部通過**（24 passed 最後一輪，之前各檔 159／86 passed）。
- **前端**：`tsc --noEmit` 通過；`npm test` **217 passed**（含 refusal.test.ts 的 PARAMS 對照）。
- **行尾**：逐檔比對 247ee771 與現在的 CRLF 行數，CRLF 檔（utils、crud、db_migrations、noi_service、project_service、LanguageContext）都仍是 CRLF，行數變化等於實際增刪。
- **3.11 全套**：（執行中，`docs/workflow/py311-full-suite.sh`，輸出到 `REF-PROJECT-SEQ-2026-001-B4-evidence/py311-full-suite-r1.txt`）
- **3.11 全套第 1 輪**：**6 failed、2829 passed、17 skipped**（1 小時 1 分）。6 個失敗都是同一類：既有測試用 `scope=None` 建立沒有專案的 ITR／OBS／稽核再取號（4 個檔，見上表），已依設計調整。輸出見 `REF-PROJECT-SEQ-2026-001-B4-evidence/py311-full-suite-r1.txt`。
- **3.11 全套第 2 輪**（最終 tree，含 R1 修正）：**2835 passed、17 skipped、0 failed**（56 分 3 秒），pytest_exit=0，見 [py311-full-suite-r2.txt](REF-PROJECT-SEQ-2026-001-B4-evidence/py311-full-suite-r2.txt)。
- **正式資料庫複本演練**（2026-10-17，快照 `prod-snapshot-20261017T092449Z.db`，sha256 前 16 碼 `1250bea2c8094915`，NAS `.backup` 一致性備份）：只複製到 scratchpad，原檔不開寫入；以 B4 程式跑 `create_all → run_migrations → run_seeding` 兩輪；複本已刪除，只留統計：

  | 統計 | 演練前 | 第 1 輪後 | 第 2 輪後 |
  |---|---|---|---|
  | noi | 1 | 1 | 1 |
  | qworkflow（全域格式／依專案格式／project_id 為 NULL） | 1（1／0／0） | 1（1／0／0） | 同左 |
  | 沒有 Q-WorkFlow 列的 NOI | 0 | 0 | 0 |
  | itp／STD 號／沒有專案的 HL 號 | 144／63／0 | 144／63／0 | 同左 |
  | reference_sequences（vendor='*'） | 8 | 8 | 8 |
  | migration_flags | 9 | 9 | 9 |
  | integrity_check | ok | ok | ok |

  log：`Migrations completed`、seeder「Rebar／Formwork ITP already exists, skipping seed」，沒有 backfill 警告、沒有 ERROR。結論：B4 在正式站啟動時**不改任何資料**（backfill 新增 0 列、seeder 不重建），和預期一致。

## 上線影響
- 啟動時 `_backfill_qworkflows` 照常執行；正式站每個 NOI 都有列，預期新增 0 列。若有專案沒有代碼而有 NOI 缺列，log 會有 `Q-WorkFlow backfill left N NOI(s) without a row`，補代碼後下次啟動會補齊。
- 沒有 migration 新步驟、沒有 schema 變更。
- **上線前在唯讀複本核對（R1 P3-3、P3-4）**：
  1. B3 上線（10-14）到 B4 上線之間新建或改代碼的專案，是否有代碼等於舊承包商縮寫而計數落後：
     `SELECT p.id, p.code, UPPER(s.doc) AS doc, s.last_seq AS old_last, (SELECT last_seq FROM reference_sequences n WHERE n.project = p.id AND n.vendor = '*' AND n.doc = UPPER(s.doc)) AS new_last FROM projects p JOIN reference_sequences s ON s.vendor <> '*' AND UPPER(s.vendor) = UPPER(TRIM(p.code));`
     有 `new_last` 為 NULL 或小於 `old_last` 的列時，上線後把該專案的代碼改一次再改回，helper 會補上（本次演練的快照只有 HL，第 29 步已處理，預期 0 列）。
     **上線前實跑結果（2026-10-17）**：8 列，7 列 new ≥ old；`doc=AUD` 那列 new_last 為 NULL 是這句 SQL 沒有把顯示代碼對應回類型——`AUD` 是 AUDIT 的顯示代碼，舊鍵 `(QTS, HL, AUD)=1` 對應的計數是 `(HL, '*', AUDIT)=5`，視為 AUDIT 即可；現行程式不讀不寫 `AUD` 鍵。
  2. 仍有 `project_id IS NULL` 的非範本單據：`SELECT 'itr', COUNT(*) FROM itr WHERE project_id IS NULL UNION ALL SELECT 'ncr', COUNT(*) FROM ncr WHERE project_id IS NULL UNION ALL SELECT 'noi', COUNT(*) FROM noi WHERE project_id IS NULL UNION ALL SELECT 'meeting_minutes', COUNT(*) FROM meeting_minutes WHERE project_id IS NULL UNION ALL SELECT 'audits', COUNT(*) FROM audits WHERE project_id IS NULL;`
     預期全部 0（B1／B2 的第 25、26 步已歸到唯一專案）。若不是 0，這些單據衍生 NCR／重新檢驗會回 400，要先歸到專案。
- 上線後請主要調度對資料庫**複本或 `.backup`** 執行一次匯出：`python scripts/verification/export_itp_renumber_map.py <db copy> <csv>`，預期 63 筆。
- 回滾：直接換回 2b-1 的映像檔即可；本批沒有改資料。
