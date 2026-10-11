# AUDIT-AGENDA-2026-001 — REVIEW（R1 獨立審查）

- 審查者：獨立 Claude 審查（GPT 額度用盡，使用者指定）
- TASK_ID: AUDIT-AGENDA-2026-001
- ROUND: R1
- 審查日期：2026-10-11
- 基準：`git archive ff19c25b` 套上 `evidence/G.patch`（SHA-256 `60a9cceb9140506ed67babcfc8ec9aba234b625b671b04ecbf9e873e3389247c`）。候選樹建在 `$TMPDIR/agenda-review/cand`，repo 內除本檔外沒有任何修改。
- 附註：目前 HEAD 已前進到 `db9d2991`（多了 `97bf3723`、`db9d2991` 兩個 commit，其中一個改到 `LanguageContext.tsx`）。G.patch 對 `db9d2991` 用 `git apply --check` 也能乾淨套上。部署前仍須依 TASK，以當時正式站版本重建最終候選。

## EVIDENCE_CHECK

以下都是我自己重新驗證的結果，沒有沿用 STATUS 的結論。

### 1. 補丁
| 項目 | 結果 |
|---|---|
| SHA-256 | `60a9cceb…247c`，與 STATUS 相同。 |
| 乾淨套用 | `git archive ff19c25b` 解開後執行 `git apply --check -v`，19 個檔案全部通過，可以正式套上。 |
| 共用檔只含本輪 hunk | `db_migrations.py` 只多 1 行：`_add_column_if_missing(conn, "audits", "agenda", "TEXT")`。<br>`LanguageContext.tsx` 只多中英各 15 個 key，共 30 行。<br>工作樹與候選樹的差異只有其他工作階段的內容：`_clean_legacy_bare_template_results`／第 23 步、`common.exporting`、`common.exportFailed`、`itr.checklistUnsavedAction`。這些都沒有進入補丁。<br>`routers/noi.py`、`checklist_service.py`、`itr_service.py`、`db_seeder.py` 都不在補丁內。<br>本輪自有的 13 個檔案與工作樹逐位元組相同。 |
| CRLF | `db_migrations.py`（1722/1722）、`audit_service.py`（576/576）、`AuditWizard.tsx`（1239/1239）、`LanguageContext.tsx`（3016/3016）、`auditStore.ts`（139/139）全部是 CRLF，新增的行也一樣。<br>LF 檔（schemas、models、PrintTemplate、AgendaEditor）沒有混入 CRLF。 |

### 2. 後端（讀碼，並在候選樹上另寫 11 個探針測試，放在 $TMPDIR，未進 repo）
- **AuditAgendaEntry**
  - 日期使用 `strict_dates.strict_date_input`：`2026/10/01`、`2026-02-30` 回 422。
  - 時間必須是 HH:MM：`9:00`、`24:00` 回 422；結束早於開始回 422。只有開始、只有結束、開始等於結束都允許。
  - 欄位送 null 會轉成 `''`；額外欄位 `foo` 會被忽略。id 為 `True`、`1.5`、`1.0` 時回 422；id 為 null 時接受。
- **排序**：探針輸入 `[id1 只有 item, id2 只有日期, id3/id4 同為 10-01 08:00, id5 只有時間, id6 09-30 23:00]`，結果是 `[6,3,4,2,5,1]`。依日期、再依開始時間排；空的排後面；鍵值相同時維持原順序。與規格一致。
- **讀取寬鬆**：NULL 與 `'not json'` 都讀成 `[]`，列表 API 不會壞。
  - 但如果存的是合法 JSON 卻不是 list（`{"a":1}`、`5`、`"str"`），或 list 裡有非物件元素（`[1,null,"x"]`），API 會原樣回傳。見「建議」第 1 項。
- **Closed／Void 鎖定**
  - create 存的是 `model_dump()` 的完整形狀；update 每一列都完整 dump，所以兩邊形狀一致。
  - 只送部分欄位的重存（例如省略 `remarks`）與已存資料相等，可以通過。
  - 改 id、送 `[]`、送 null 都回 400。
  - 舊的 Closed 紀錄存 NULL：送 `[]` 通過，新增一列回 400。
  - Void 狀態下改內容回 400。
  - 順序不同但內容相同時，因為會先排序，所以視為相等。
  - 沒有發現漏洞。
- **舊前端與契約相容**
  - 建立時沒送 agenda：存成 `[]`。
  - 更新時沒送 agenda：不會動到原本的值（探針 `OMIT`）。
  - 更新時 agenda 為 null：存成 NULL，讀出 `[]`。
  - 回應只多了 `agenda` 欄位，其他欄位不變。
  - 後端沒有其他地方寫入 audits 的 JSON 欄位（已 grep 確認）。
- **Word**
  - 第 4 段為「稽核行程 Agenda」，6 欄寬度合計 17.4 cm。時間只有一端時只顯示那一端；空欄位顯示 `—`。
  - 後續各段改為 5／5.1／6／7（7.1–7.3）。
  - 沒有行程時顯示「（尚無行程 No agenda）」；異常列會被濾掉。
  - 測試與探針都通過。
- **migration**：自己在拋棄式 SQLite 上驗證。先把 `agenda` 欄位刪掉，第一次執行補上 TEXT 欄位，第二次執行不做任何事（仍只有 1 欄）。舊資料的值是 NULL，經 schema 讀出為 `[]`。

### 3. 前端（讀碼與瀏覽器實測）
- 步驟編號：`WIZARD_STEPS` 有 5 項，`LAST_STEP` 由長度推算。step 3 是 Agenda，4 是查檢表，5 是執行與評估。6 支既有瀏覽器腳本都已改為新編號。
- 「列印稽核計畫」已從第 2 步移到第 3 步。
- `sortAgenda` 的排序鍵 `[無日期?, 日期, 無開始?, 開始]` 與後端的 tuple 等價。字串只會是 ASCII 數字，JS 與 Python 比較結果一致，而且都是穩定排序。
- 空白列在 `prepareAuditData` 與 printData 中都會先移除再排序。
- 時間順序錯誤時，`blockSaveForUnconfirmedNewItem` 會同時擋下儲存草稿和送出。
- 唯讀狀態下，`fieldset disabled`，新增與刪除按鈕隱藏，仍可列印。
- 列印計畫是 1–4 段加上第 5 段計畫簽核；報告是 1–7 段，章節與 Word 一致。
- 中英文字串齊全。
- **儲存後重新同步的邏輯有問題（必改，見 REQUIRED_FIXES 1）**：
  - `markSaved` 會把 baseline 設成「呼叫它那次 render」的 `formData`。
  - `handleSaveDraft` 只有在 `prev === formAtSave` 時才會替換行程，但不論有沒有替換，都會執行 `setAgendaResynced(true)`。
  - 結果是：存檔期間如果有其他編輯，effect 會在下一次 render 用含有這些編輯的表單呼叫 `markSaved()`，把尚未儲存的編輯誤判為已儲存。
  - **瀏覽器實測重現**（8320/3320 隔離環境，攔截並延遲 PUT）：
    1. 新增一列較早日期的行程（存檔後順序會改變），按儲存草稿。
    2. 在 PUT 還沒回來時，把第 2 步的地點改成 `EDITED-DURING-SAVE`。
    3. 結果：畫面顯示 `EDITED-DURING-SAVE`，但資料庫裡是 `""`；列印計畫沒有標示「未儲存」；按關閉時沒有跳出離開提醒。關閉後，這筆修改會在沒有任何提示的情況下遺失。
  - 對照組：新增一列排序後順序不變的行程，其餘步驟相同。這時有「未儲存」標示，也有離開提醒。可見這個問題是本輪的 `agendaResynced` 引入的。

### 4. 自行跑測試
- **後端**：在候選樹上設定拋棄式 `DATABASE_URL`（$TMPDIR），用 Python 3.14.6 跑 8 個檔案（agenda、export-docx、hardening、contractor-scope、docx-path-guard 兩檔、contractor-options、integrity_fixes）：**103 passed，exit 0**。
- **前端**（候選樹）：`tsc --noEmit` 結果 0；eslint `--max-warnings 0`（4 個檔案）結果 0；`npm run build` 結果 0。
- **瀏覽器**：從候選樹以 `isolated_stack.py` 啟動 8320/3320，每一段都用全新資料庫。
  - `audit-agenda-check.mjs`（種子 hardening_b + agenda）：**ALL PASS，15 項，exit 0**。
  - `audit-layout-check.mjs`（含 Agenda 步驟不溢出，1440、1024、390 三種寬度）：ALL PASS。
  - `audit-print-template-check.mjs`、`audit-export-docx-check.mjs`：ALL PASS。
  - `audit-smoke-all.mjs`：ALL PASS。
  - `audit-polish-check.mjs`、`audit-ime-enter-check.mjs`：沒有 FAIL，exit 0。
  - 收尾：每一段都執行了 `down`。print-template 那段 down 時 vite 結束得較慢，回傳 `left_in_place`；確認程序已經不在後，再執行一次 down 清掉了。最後 8320/3320 沒有任何 LISTEN，也沒有殘留本審查的程序或 run 目錄。沒有碰 8198/3198、8240/3240、8330/3330、8340/3340。
- **原證據的缺口**（我的重跑已經補上驗證，但 R2 的證據必須更正）：
  - `browser-check.txt` 裡的 layout 只有第一次失敗的那次（`3 FAILED`），沒有 STATUS 所說的「重跑通過」紀錄。
  - 那段印出 `3 FAILED`，旁邊卻記錄 `exit=0`。但腳本本身會執行 `process.exit(failures ? 1 : 0)`，所以這份證據記錄 exit code 的方式不可靠（很可能被 pipe 吃掉了）。
  - 檔頭寫的是 `G.patch 76b4aff7`，不是最終補丁 `60a9cceb`。

### 5. Python 3.11
這一輪還沒跑。**最終候選在 Python 3.11 上全數通過，是部署的前提條件**（本審查不等待這一項）。

## SCOPE_CHECK
- 所做的事與 TASK 範圍 1–5 一一對應：資料欄位與 migration、schema、service 與 Word、前端 5 步與編輯器、列印、字串、測試。
- 沒有做「不在本輪」所列的項目：沒有與條文連動，也沒有檢查時段重疊。
- 共用檔只含本輪的 hunk，其他工作階段未提交的修改都不在補丁內。
- 沒有新增依賴，沒有改 API 路徑，回應只多了 `agenda` 欄位。
- 新種子在沒有 `DATABASE_URL` 時會拒絕執行。新測試不會 import main，也不會碰開發資料庫。

## DECISIONS_CHECK
- migration 透過 `db_migrations._add_missing_columns` 和 `_add_column_if_missing`，可以重複執行，沒有直接改 schema，符合 AGENTS.md 的資料庫規範。
- 既有表只新增一個可為 NULL 的 TEXT 欄位，舊資料讀出來是 `[]`，相容。
- Closed／Void 的鎖定沒有變弱：agenda 已納入比對，探針確認沒有漏洞。
- 與 DECISIONS.md 現有的決策沒有衝突。本輪的業務選擇（排序、時間順序錯誤擋存、超出期間只提醒）都來自 TASK 所記錄的使用者決定，沒有自行升格為政策。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
1. **`AuditWizard.tsx` 存檔後重新同步會把存檔期間的編輯誤判為已儲存**（已在瀏覽器重現，對照組也已確認）。
   - 修法：只有在行程「確實替換」時才把該 render 的表單當成已儲存。可以擇一：
     - 用 ref 保存最新的 `formData`，在 `await` 之後判斷 `ref.current === formAtSave`，成立時才執行 `setFormData` 和 `setAgendaResynced`。
     - 或者讓 effect 比對：只有當前 `formData` 的 JSON 等於「formAtSave 換上 updates.agenda」的 JSON 時，才呼叫 `markSaved()`。
   - 補一個瀏覽器回歸測試：延遲 PUT，存檔期間修改其他欄位，存完後必須仍顯示「未儲存」，關閉時要跳出離開提醒；沒有編輯時，行為維持現在的 PASS 項目。
2. **證據更正**：`browser-check.txt` 必須是最終補丁跑出來的結果，檔頭註明正確的 G.patch 雜湊，包含 layout 通過的那次，並記錄真實的 exit code（不能被 pipe 吃掉）。

### 建議（不擋本輪，可一併處理或另開）
1. 讀取端更寬鬆：前端載入時用 `Array.isArray(agenda) ? agenda.filter(物件) : []` 正規化，也可以在後端讀取的 schema 裡做。目前若資料庫裡有合法 JSON 但不是 list，或含非物件元素，精靈會在 `.filter` 或 `row.id` 當掉。這只會發生在直接改資料庫的情況。
2. `_AGENDA_TIME` 的 `\d` 會匹配 Unicode 數字：探針送 `"1٠:00"` 回 200，存進去之後排序會錯。建議改成 `[0-9]` 或加上 `re.ASCII`。`strict_dates` 也有同樣的情況（`"٢026-10-01"` 被接受），那是既有問題，不在本輪範圍。
3. 透過 API 建立、id 為 null 或重複的列，在編輯器裡會被一起修改或一起刪除，React key 也會重複。可以在載入時補上 id。
4. 有兩處小地方：`AuditWizard.tsx` 第 33–34 行的註解還寫著列印計畫在第 2 步；第 2 步裡有一段 `hidden print:block` 的舊計畫摘要（既有的死碼）。都可以順手整理。

## NEXT_STEP
1. 依 REQUIRED_FIXES 1、2 修正，重新產生 G.patch，並在 STATUS 更新雜湊，交 R2 審查。R2 只需重驗修改的部分，加上 agenda、layout 兩支瀏覽器腳本和相關後端測試。
2. R2 通過後，以當時的正式站版本重建最終候選。**最終候選在 Python 3.11 上全數通過**，才能依協調中心佇列（第 4 順位，排在 AUDIT-PRINT、CHECKLIST-TEMPLATE-CLEAN、NOI 之後）部署。部署包含 migration、後端重建與前端切換。
