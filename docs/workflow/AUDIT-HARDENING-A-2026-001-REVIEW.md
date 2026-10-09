# AUDIT-HARDENING-A-2026-001 — REVIEW（獨立審查）

審查者：獨立 Claude 審查代理（GPT 額度用盡，使用者 2026-10-09 於對話中指定）

TASK_ID: AUDIT-HARDENING-A-2026-001
ROUND: R1
審查日期：2026-10-09
審查依據：`evidence/A-backend.patch`（不是工作樹 `git diff`；工作樹已含 B 批變更）。

## EVIDENCE_CHECK

**差異與雜湊（實測）**
- 把 `A-backend.patch` 套到 `git archive HEAD backend`（52986ac2）的暫存目錄後，7 個檔案的 SHA-256 與 `A-final-file-sha256.txt` 完全一致；patch 本身的 SHA-256 `9d39a318…4b91` 與 handoff 一致。CRLF 檔案套用正常。後續的測試都是在這個重建出來的「A 狀態」目錄跑的，不是在含 B 批的工作樹跑。
- 根目錄 TASK／STATUS／REVIEW 的修改時間是 10/7–10/8，本輪沒有動，與 STATUS 相符。

**測試（實測，Python 3.14.6，拋棄式 SQLite，沒有碰開發資料庫、沒有 import main）**
- A 狀態：`tests/test_audit_hardening_http.py` 和 `tests/test_audit_service.py` → **49 passed**。
- 重現「新測試套在 HEAD 上」：HEAD 的 backend 只放入新測試檔 → **26 failed、7 passed**，與 `new-tests-against-HEAD.txt` 一致。
- **A 狀態（最終雜湊）的完整後端測試由審查者補跑**，補上 STATUS 說明的缺口（作者的完整測試跑的是最後一次修改 Closed 鎖之前的版本）：結果是 **2367 passed、2 failed、16 skipped**（47 分鐘）。這些失敗和略過都是審查者暫存目錄造成的環境因素，與 A 批無關：
  - 2 failed 是 `test_itr_revoke_approval_acceptance.py::test_lock_messages_approved_points_to_revoke_void_does_not`，原因是 `FileNotFoundError: react-app/src/context/LanguageContext.tsx`（暫存目錄一開始只解出了 backend）。補上 HEAD 的 `react-app/src` 後重跑這個檔案 → **12 passed**。
  - 多出來的略過有 13 項在 `test_material_schema_migration.py`，因為暫存目錄沒有 git 歷史，無法 `git archive` 基準提交；另外 2 項是 `test_isolated_stack_tool.py`，因為沙箱裡不能用 `ps`。兩者都和 Audit 無關。
  - 結論：A 最終版本的完整測試，扣除上述環境因素後沒有失敗。
- 審查者另外寫了 6 項探測測試（只放在暫存目錄，跑完已刪除，沒有進 repo），全部通過：Closed 紀錄送 `date: null` → 400（Closed 鎖，不是 500）；未 Closed 的紀錄把 `date` 改成 `''` → 200；精靈的建立內容帶 `vendor_id`／`auditNo: 'CLIENT-1'` → 編號由伺服器產生，vendor_id 由承包商名稱解析；前後有空白的日期或數字日期 → 422；精靈完整流程 Draft→Planned→In Progress→Completed→Closed，每次都送 `auditNo: ''`，最後再重送一次 Closed → 都是 200，編號不變；編號空白的舊紀錄在更新時帶上承包商 → 補到新編號。

**逐項讀碼結論**
- #3 建立狀態：`_CREATE_STATUSES` 由 `WorkflowEngine.TRANSITIONS["Audit"]` 推導，結果是 Draft／Planned／In Progress／Completed。狀態檢查放在取得寫入鎖、取號和任何寫入之前，所以 400 時不會消耗序號（有測試用 snapshot 證明，ReferenceSequence 也包含在內）。比對區分大小寫（`closed` → 400），符合精靈實際送出的值。
- #4 auditNo：更新時在轉換檢查、Closed 比較、稽核紀錄之前就 `pop("auditNo")`，所以不會寫入，也不會出現在稽核紀錄的 new_value。「沒有編號才補號」的分支保留，而且現在補號前會先取寫入鎖。
- #5 日期：建立時欄位層用 `strict_date_input`；服務層用 `validate_date_write` 檢查最終內容。缺 date 欄位時預設是 None，欄位驗證器不會跑，但服務層的 required 會擋下 → 422（以前是違反 NOT NULL 的 500）。更新時只檢查有變動的欄位，順序規則只在其中一邊有變動時才檢查，所以重送舊資料不會被擋（有測試）。`AuditBase` 移除了日期驗證和 model_validator，讀取用的 schema `Audit` 遇到壞資料不再拋錯（有測試：清單和單筆都回 200，原值不動）。
- #6 編號：建立時 `begin_write_transaction` 在 `generate_reference_no` 之前（有呼叫順序測試）；`_DOC_TYPE_TABLES['AUDIT'] = ('audits', 'auditNo')` 的表名和欄位名與 models 一致，`doc_type.upper()` 對得上。審查者也確認了並發測試在 HEAD 上真的會撞號，修改後 6 個執行緒拿到 6 個不同編號。
- #7：一律產生新的 `uuid4`；`IntegrityError` → rollback → `AuditConflict` → 409。建立的寫入路徑（鎖、取號、新增、稽核紀錄、commit）全部在同一個 try 裡，任何例外都會明確 rollback。更新路徑同樣如此，`enforce_update_scope` 丟出的 ScopeForbidden 也會先 rollback 再回 403。
- 例外對應順序（routers/audit.py）：建立和更新都是 ScopeForbidden → DateValidationError（ValueError 的子類，排在 ValueError 前面，所以是 422）→ AuditConflict（不是 ValueError）→ ValueError → 400。順序正確。建立端點以前沒有接 ValueError（會變 500），現在是 400。
- #12 Closed 鎖：`_comparable` 會把 JSON 欄位解析後再比，NULL 和 `[]` 視為相同，其他欄位的 NULL 和 `''` 也視為相同。沒有實質變更時直接回傳，不寫入、不留稽核紀錄；有真的變更仍然是 400（兩個 HTTP 測試加上審查者的探測都證明了）。把 NULL 和 `''` 視為相同只會用在「Closed 而且不寫入」這條路，所以不會把錯的值寫進資料庫。

**對既有呼叫端的回歸風險（HEAD 的 AuditWizard／auditStore）**
- 唯一的呼叫端是 `auditStore.addAudit／updateAudit`。精靈的 `prepareAuditData` 會把空白欄位送成 `''`、日期來自 `<input type="date">`（YYYY-MM-DD 或 `''`）、狀態只有標準的大小寫寫法、`auditNo` 送 `formData.auditDocNo || ''`、`vendor_id` 是 undefined 或字串（不在 AuditUpdate 裡，會被忽略）。這些都還能通過，而且第二次儲存清空編號的問題在後端就被擋下了。
- 唯一會讓使用者看到不同結果的是「新紀錄選 Closed 或 Void」→ 400，前端只顯示通用錯誤訊息。STATUS 已揭露，屬於 B 批 #9。

**測試本身是否證明了它宣稱的事**
- 大致上有：HTTP 測試走真實的登入和路由，用檔案型 SQLite，用新的 session 讀回，而且「不寫入」是用整張表的 snapshot（Audit、AuditLog、ReferenceSequence）來比，比只看回應碼強很多。
- 小瑕疵（不影響結論）：`test_audit_log_failure_rolls_everything_back` 把 `after_rollback` listener 掛在全域的 `sqlalchemy.orm.Session` 類別（`env.Session.class_`），而且從來沒有移除，每次參數化都會留下一個 listener 到同一個 pytest 程序裡。功能上沒有害處（只是往一個區域 list 裡加東西），但應該跟 `before_flush` 一樣在 finally 裡 `event.remove`。另外 STATUS 已經老實說明：HEAD 上這個測試失敗只是因為沒有明確 rollback，HEAD 的資料本來就不會留下。

**STATUS 是否誠實**
- 有揭露：完整測試跑在最終修改之前、Python 3.11 沒跑、沒有瀏覽器實測、沒查正式站是否已有被清空的編號、HEAD rollback 測試的限制。審查者核對的雜湊、測試數字和 HEAD 重現結果都與 STATUS 相符，沒有發現誇大的地方。

## SCOPE_CHECK
- patch 只動了 TASK 列出的 7 個後端檔案（5 個產品檔、1 個修改的測試、1 個新測試），沒有前端、migration、schema 結構或部署腳本的變更。
- 6 項都有實作，沒有混入 #13、Close／Void 權限、Void 唯讀（這些是 B 批或待決策事項）。
- 回應契約：沒有新增欄位（沒有 `date_issues`）。讀取時的行為變化：舊的寬鬆驗證會把讀出的時間戳截成日期，現在原值回傳。這是讀取 schema 不再驗證日期的必然結果，正常寫入的資料不受影響。STATUS 寫了「原值回傳」，但沒有特別點出這個「截斷」的差別，可以接受。
- 非阻擋的註記（文件小誤差）：`core/strict_dates.py` 的模組說明仍寫「cross-field order rules (NCR only; NOI and OBS have none)」，現在 Audit 也有順序規則；「seven other modules」實際上是 6 處呼叫（這個誤差在本輪之前就存在）。

## DECISIONS_CHECK
- 沒有違反 DECISIONS.md 的任何條目。日期規則沿用 NOI／NCR／OBS 已上線的 strict_dates 寫法。
- 「建立時只擋死路狀態（允許 Completed 等）」：這不是 DECISIONS 裡的業務政策，而是 TASK 中說明理由的實作選擇，也是比較保守的選擇（保留既有的合法用法，只擋掉建立後就再也不能編輯或刪除的狀態）。使用者回覆「先做 A 批」等於同意了這份清單，不算把未確認的規則升格為政策。若使用者之後想把建立狀態收緊為只允許 Draft／Planned，那需要另外決策。
- 「Closed 沒有實質變更時不寫入、不留 UPDATE 稽核紀錄」：沒有變更就沒有可稽核的事件，審查者認為合理，不需要另外決策。
- 部署：依「每批 PASS 後完成準備即提交、推送及部署」的持續授權處理；前提條件見 NEXT_STEP。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無必修項目。

PASS 的前提條件與非阻擋建議：
1. **部署前必須用 Python 3.11 跑過**（DECISIONS 的要求；本輪作者和審查者都沒有 3.11 環境）。至少要跑 `tests/test_audit_hardening_http.py`、`tests/test_audit_service.py` 以及完整後端測試。審查者用肉眼檢查過，修改的檔案裡沒有 3.12 才支援的 f-string 寫法（巢狀的同種引號），但這不能取代實際執行。
2. 部署範圍只能包含 `A-backend.patch` 的內容。工作樹中同一批檔案已經疊上 B 批的變更（例如 audit_service 的 Void 鎖），B 批還沒有審查，不能混進來。提交時要把 A 的狀態從 B 的變更中分離出來（例如用 patch 重建），或等 B 批也 PASS 後合併部署，二者擇一，並且在部署紀錄中寫清楚。
3. （非阻擋）`test_audit_log_failure_rolls_everything_back` 應該在 finally 裡移除 `after_rollback` listener；`strict_dates.py` 模組說明可順手更正（Audit 也有順序規則）。可在 B 批或下一輪處理。
4. （非阻擋，既有問題）Closed 鎖的檢查不在寫入鎖之下：兩個同時進來的更新（一個關閉、一個編輯）理論上可能繞過 Closed 鎖。這在本輪之前就存在，也不在 A 批範圍內，記錄供日後參考。
5. 正式站可能已有編號被清空的紀錄：部署後依 TASK，可以用唯讀查詢確認是否存在 `auditNo = ''` 的 Audit。如果有，下一次帶承包商儲存時會補一個新編號，這是預期的行為，但應該讓使用者知道。

## NEXT_STEP
1. 處理 REQUIRED_FIXES 第 2 點的部署範圍分離（A 單獨部署，或與已 PASS 的 B 一起部署）。
2. 在 Python 3.11 環境跑相關測試和完整後端測試，結果存到 evidence。
3. 依 DECISIONS 的持續授權：核對建置來源與範圍 → 正式環境唯讀預檢 → 備份與回退準備 → 提交、推送、部署 → 冒煙檢查（不建立正式業務資料）→ 回報。
4. B 批（AUDIT-HARDENING-B-2026-001）另外送審；Close／Void 權限與 Void 唯讀仍待使用者決策。
