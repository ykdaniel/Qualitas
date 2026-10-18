# OPTIMISTIC-LOCK-2026-001 STATUS — B1（後端＋store）

- **基準**：6f68c768。工作樹 scratchpad/ol-b1。
- **程式碼指紋**：5afbb0f8d854efa5。算法：backend 與 react-app 底下所有檔案（排除 node_modules、dist、__pycache__），逐檔 shasum 後再整體 shasum，取前 16 碼。3.11 r2 跑的就是這份程式碼：r2 開始之後只改過 docs/workflow 底下的文件。
- **證據**：docs/workflow/OPTIMISTIC-LOCK-2026-001-evidence/
- **標示**：「實測」＝實際跑過；「讀碼」＝只讀程式確認；「未測」＝沒有驗證。

## 1. 實際修改

### 後端
| 檔案 | 內容 |
|---|---|
| core/concurrency.py（新檔） | `claim_row_version(db, obj, expected, doc_type, number, column, null_as, refresh, warn_missing)`：一句 `UPDATE … SET v = COALESCE(v, base) + 1 WHERE id = ? [AND COALESCE(v, base) = ?]`，影響 0 列時丟 Refusal VERSION_CONFLICT {docType, number}。新版本用 `set_committed_value` 寫回物件，不會被當成待寫入的變更。`bump_row_version`：不比對、不記 log。缺版本時記 `row_version missing: <table> <id>` |
| core/refusals.py | `refusal_http`：VERSION_CONFLICT 一律回 409 |
| models.py | 19 張表加 `row_version`：itp、ncr、followup、noi、itr、pqp、obs、osd、meeting_minutes、contractors、contractor_personnel、projects、users、roles、audits、audit_templates、checklist、fat、material_submittals |
| db_migrations.py（CRLF） | 31a `_add_row_version_columns`：只補缺的欄位，在第 3 步之後執行（之後的步驟用 ORM 讀這些表）。31b `_copy_itr_detail_version`：接在第 30 步之後，靠 migration_flags 只跑一次，非整數、負數、布林、壞掉的 JSON 都當 0。material_submittals 由第 21 步自己的 DDL 補上，並通過嚴格的結構檢查 |
| schemas.py | 讀取 schema 加 `row_version`。更新 schema 加 `row_version = Field(exclude=True)`：model_dump 永遠不會帶出來，不會被寫回記錄。新增 `UserScopeRead`（範圍讀回時帶帳號版本）。材料 API 用 `rowVersion` |
| services | 每個存檔路徑在載入並檢查範圍之後、改任何欄位之前呼叫 claim：ncr、noi、obs、osd、pqp（含發行）、followup、meeting_minutes、audit（放在 Closed／Void 未變更直接回傳之後）、itp（含計畫）、fat（含明細）、checklist、contractor（含人員）、project、user（含範圍；放在「沒變更就不寫」之後）、role、audit_template（放在沒變更直接回傳之後）、km、material_submittal、itr（update、revoke、create-ncr；批次不記 log） |
| routers | 409 對應：material `_call`、audit templates；IAM 的使用者與角色在 service 內轉成 409（route 不攔 service 的拒絕）。新增可選的版本參數：itp detail（body）、fat details（`?row_version=`）、pqp publish（body）、itr revoke（body）、create-ncr（`?row_version=`）、user scope（body） |
| KM | `version_no` 改用 claim，補上原本「先比對再寫入」中間的空檔；舊資料的 NULL 當 1。repository 改為記錄呼叫端傳入的新版本；匯入 Word 不記 log |

### 前端（只動 store 和 api，沒有動任何視窗）
| 檔案 | 內容 |
|---|---|
| utils/rowVersion.ts（新檔） | `withRowVersion(payload, rowVersion?)`：丟掉 payload 自帶的 row_version，只有明確傳入時才帶上。`rowVersionParams` |
| ncr/noi/obs/osd/pqp/audit/followUp/fat/itp/meetingMinutes/itr Store | 型別 `extends RowVersioned`。update 多一個可選的 `rowVersion`。PQP 發行、ITP 計畫、FAT 明細（版本放 query）也是。FAT 明細存完回寫版本 |
| contractors/project/iam/checklist/auditTemplate Store | 只挑特定欄位的 normalize 補上 row_version；update 多一個可選的 `rowVersion` |
| services/api.ts、materialApi.ts | 型別補上版本。updateContractor、Personnel、Project、User、Role、Checklist、setUserScope、revokeItrApproval、createNcrFromItr 多一個可選的 rowVersion。沒傳版本時，呼叫形狀和原本完全相同 |

### 測試與文件
- **新增**：backend/tests/test_optimistic_lock_http.py（34 項）、react-app/tests-unit/rowVersion.test.ts（6 項）。
- **既有測試調整**（沒有放寬）：
  - test_itr_service.py：mock 的 db 補上 claim 需要的回傳值（rowcount 1、新版本 1），斷言不變。
  - test_refusal_dialog_2026_002_http.py：ITR 舊版本的衝突從 400 改為 409（使用者的決定）。函式改名為 `test_stale_itr_version_is_a_409`，英文句子改為新的統一句型，另外加驗版本沒變。KM 衝突同樣改用新句子，另外加驗 version_no 沒變。
- **文件**：DECISIONS.md 新增一條；DESIGN 第 8 節。

## 2. 和 DESIGN 不同的地方（實作時的決定，請審查確認）
1. **ITR 舊的 `_version`**：DESIGN 原本寫「改用欄位，detail_data 的 `_version` 仍接受一段時間」。
   - 實作時發現：如果拿 `_version` 和 row_version 比，revoke 或開 NCR 之後（這兩個動作會加 row_version），ITR 視窗手上還是舊的 `_version`，下一次存檔就會變成假的 409。這是行為退步。
   - 所以改為：**沒送 row_version 時，舊的 `_version` 完全照原樣檢查**（和存著的 `_version` 比，只有 update 會加 1）。另外 row_version 照樣比對、加 1，並記錄缺版本。
   - 有送 row_version 時就只比 row_version。
   - 在 B4（ITR 視窗改送 row_version）之後、B5 移除。
2. **store 只在明確傳入時送版本**：讀取已經會帶 row_version，表單如果整筆送回，就會連帶送出開表單時的版本。存完不關、可以連續存的視窗，第二次存檔就會變成假的 409。所以 B1 一律丟掉 payload 裡的版本，等 B2–B4 的視窗明確傳入。B1 上線後，使用者看到的行為不變。

## 3. 驗證
| 項目 | 結果 | 證據 |
|---|---|---|
| 新的 HTTP 測試 34 項（19 種記錄的首存贏、後存 409、資料不變、重新載入後可以存、缺版本放行並記 log；KM、材料；次要寫入；附件不動母單；Closed 稽核未變更不加版本；兩個 session 原子性；bump；409 對應；遷移帶入與只跑一次） | **實測** 34 passed（本機 3.14） | — |
| 加開伺服器端例外直接拋出的除錯模式，再跑一次同樣的 34 項，確認沒有藏起來的 500 | **實測** 34 passed（除錯外掛已刪除） | — |
| 受影響的既有測試（ITR service、KM docx、ITR 原子寫入、refusal 002、audit 路徑、approval events、checklist service、scope instance、ref seq b1） | **實測** 全過（調整後再跑：78 passed） | — |
| 前端 tsc、eslint（store、services、utils） | **實測** 無錯誤、無警告 | — |
| 前端單元測試 | **實測** 223 passed（含新的 6 項） | — |
| CRLF | **實測** 每個修改過的 CRLF 檔，CRLF 行數都等於總行數 | — |
| 隔離環境 HTTP 併發示範（協調中心要求 3） | **實測**：A 先存 200（版本 1）；B 用舊版本存 409，NCR 沒被改。A、B 用 Barrier 同時送版本 1：一個 200、一個 409。不帶版本 200（版本 3），伺服器 log 有 `row_version missing: ncr olb1-ncr-1` | evidence/B1-http-concurrency-demo.txt |
| R1 修正後再跑（新測試 37 項、FollowUp／Meeting／NCR／KM 共 23 個測試檔、全部 service／router 單元測試） | **實測** 81 passed；273+1 項（唯一失敗的 test_followup_service 是 mock 把 `__table__` 換掉，已改 `_target` 用 `mapper.local_table`，重跑 42 passed）；service／router 215 passed | — |
| 前端（R1 修正後） | **實測** tsc 無錯誤；單元測試 224 passed | — |
| 3.11 全套 r1 | **實測** 4 failed、2872 passed、17 skipped（57 分鐘），見第 4 節之二 | evidence/B1-py311-full-suite-r1.txt |
| r1 失敗修正後再跑（4 個失敗檔，加上 Docker 會跳過的舊資料庫遷移測試 test_material_schema_migration、test_audit_templates_migration） | **實測** 64 + 27 passed | — |
| 3.11 全套 r2 | **實測 PASS**：2876 passed、17 skipped（57 分 48 秒，05:32–06:30Z），pytest_exit=0 | evidence/B1-py311-full-suite-r2.txt |
| 獨立審查 | R1 PASS with notes（沒有 P1／P2）→ R2 PASS（修正確認）→ R3 PASS（r1 失敗的修正確認） | REVIEW |

## 4. R1 之後的修改
- followup_service、meeting_minutes_service：claim 之後被拒時在 service 內 rollback（P3-1）。
- km_service：稽核的 old_val 在 claim 之前擷取（P3-2）。
- itpStore：`updateITPDetail` 收到不是物件的 detail 時原樣送出（P3-3）。
- db_migrations 31a：補完欄位後逐表確認，仍缺就以 MigrationError 停止啟動（P3-4）。
- ncr_service：結案權限檢查移到 claim 加 refresh 之後（P3-6）。
- core/concurrency `_target`：改用 `mapper.local_table`。
- 測試：新增 3 項（rollback 參數化 2 項、遷移停止 1 項），KM 加驗稽核舊值，前端加 1 項。

## 4 之二. 3.11 r1 的 4 個失敗與修正
1. **欄位順序**：models 把 row_version 宣告在類別最前面，create_all 建出來的新資料庫就把它放在第 0 欄，用 `SELECT *` 按位置讀的測試（test_itr_approval_events_migration）因此失敗。正式站是用 ALTER 加欄位，會放在最後。
   - **修正**：19 個 model 都把 row_version 移到最後一欄，新舊資料庫的欄位順序一致。已確認 19 張表的最後一欄都是 row_version。
2. **材料「沒改就不寫」**：test_material_submittals_http 驗證沒有變更的存檔什麼都不寫，但 claim 照樣加了 1。
   - **修正**：claim 移到「沒有變更就 return」之後。claim 只動版本欄；同一次存檔的其他待寫入變更，跟著 commit 或一起 rollback。
3. **既有測試寫死欄位集合**：test_contractor_personnel_http 列舉 contractor_personnel 的所有欄位。
   - **修正**：期望的欄位集合加入 row_version，斷言仍是完全相等。
4. **mock 的記錄沒有 mapper**：test_checklist_validation 用 Mock 當作記錄。
   - **修正**：這個測試裡用 patch 取代 claim，測試的是參照檢查本身；版本檢查由 HTTP 測試覆蓋。斷言不變。
- **本機才跑的測試**：test_material_schema_migration（需要舊後端，Docker 裡會跳過）原本逐欄比對 contractors、ncr 遷移前後的 `SELECT *`。
  - **修正**：比照它原本對 projects 的做法，改成用舊欄位逐值比對，並另外斷言新的 row_version 都是 0。

## 5. 留給 B3／B4（R1 P3-5）
- ITR create-NCR 回傳的是 NCR：ITR 視窗開完 NCR 之後，要重新讀 ITR 才拿得到新的 row_version（目前流程會關掉視窗，所以沒有影響）。
- 同一次存檔有兩次寫入（updateUser 接著 setUserScope；revoke 或開 NCR 之後再存 ITR）時，第二次要用第一次回傳的版本。

## 6. 未測／限制
- **沒有在瀏覽器裡操作**：B1 不動畫面，依協調中心要求 3 改用 HTTP 示範。
- **舊資料的寫入**：沒有對正式站資料副本跑過遷移。31a 只補缺的欄位；31b 只讀 ITR 的 detail_data，只寫 row_version。
- **系統連帶寫入不加版本**：啟動遷移、附件、登入、2FA。這是 DESIGN 的設計。
