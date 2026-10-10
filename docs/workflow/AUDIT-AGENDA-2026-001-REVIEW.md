# AUDIT-AGENDA-2026-001 — REVIEW（R2 獨立審查）

- 審查者：獨立 Claude 審查（GPT 額度用盡，使用者指定）
- TASK_ID: AUDIT-AGENDA-2026-001
- ROUND: R2（R1 判定 REVISE，原文見 `AUDIT-AGENDA-2026-001-R1-REVISE-REVIEW-archive.md`）
- 審查日期：2026-10-11
- 基準：`git archive fcc83c62` 套上 `evidence/G.patch`（SHA-256 `9d3a1c56a2b59ceecc2389b1d8aa06ab30ea2db71fb07e71b9aedf1d09c5f028`）
  - 候選樹建在 `$TMPDIR/agenda-review/r2/cand`。
  - 除本檔外，沒有修改 repo 內任何檔案。

## EVIDENCE_CHECK

以下都是我自己重新驗證的結果，沒有沿用 STATUS 的結論。

### 1. 補丁
| 項目 | 結果 |
|---|---|
| SHA-256 | `9d3a1c56…f028`，與 STATUS 相同。<br>`G-R1.patch` 是 `60a9cceb…247c`，與 R1 審查時的補丁相同，留存正確。 |
| 乾淨套用 | 在 `fcc83c62` 上 19 個檔案全部 `--check` 通過，並已實際套上。 |
| 共用檔只含本輪 hunk | `db_migrations.py` 只多 1 行。<br>`LanguageContext.tsx` 只多 30 行。<br>工作樹的 `db_migrations.py` 比候選樹多出的 66 行，全部是協調中心的 `_clean_legacy_bare_template_results`／第 23 步，沒有進入補丁。<br>`routers/noi.py`、`checklist_service.py`、`itr_service.py`、`db_seeder.py` 都不在補丁內。<br>本輪其餘自有檔案與工作樹逐位元組相同。 |
| CRLF | 5 個 CRLF 檔全部保留 CRLF：`db_migrations` 1722/1722、`audit_service` 576/576、`AuditWizard` 1246/1246、`LanguageContext` 3022/3022、`auditStore` 139/139。<br>LF 檔沒有混入 CRLF。 |
| 與 R1 的差異 | 只改了 `schemas.py`（`_AGENDA_TIME`）、`test_audit_agenda_http.py`（多 1 個 422 案例）、`AuditWizard.tsx`（重新同步的邏輯、載入時正規化、註解）、`audit-agenda-check.mjs`（新增 5b）。<br>`LanguageContext.tsx` 的 6 行差異來自基準改變（`97bf3723` 的字串），不是本輪新增。<br>其餘檔案與 R1 完全相同，R1 已審過的後端與列印部分沒有變動。 |

附註：STATUS 說新基準多出的 3 個 commit「沒有動到本輪的檔案」，但 `97bf3723` 其實改了共用檔 `LanguageContext.tsx`（多 6 行）。補丁仍能乾淨套上，也只加入本輪的 30 行，所以不影響判定。

### 2. R1 必改項的處理
- **必改 1：存檔期間的編輯被誤判為已儲存，已修正。**
  - 讀碼結果：
    - `resynced` 物件只建立一次，同時用於 `setFormData` 的 updater（`prev === formAtSave ? resynced : prev`）和 `setAgendaResyncTarget`。
    - effect 只有在 `formData === agendaResyncTarget` 時才呼叫 `markSaved()`，執行後一律清除 target。
    - 兩次 setState 在同一個 `await` 之後執行，React 18 會合併成一次 render。所以沒有編輯時兩者相等，有編輯時一定不相等。
    - 先前那次 `markSaved()` 的 baseline 是 `formAtSave`，存檔期間的編輯因此仍然算「未儲存」。
  - 實測：在 R2 候選上，我跑了自己寫的獨立探針，也就是 R1 用來重現問題的同一支腳本：延遲 PUT，存檔期間修改地點。
    - 結果：畫面顯示 `EDITED-DURING-SAVE`，資料庫是 `""`，**列印標示為未儲存，關閉時有離開提醒**。
    - 對照組（排序不變）的行為也相同。R1 時的資料遺失問題已經不存在。
  - 沒有編輯、只是重新排序的情況：agenda-check 中「存檔後畫面依序排好，且不會被判定為未儲存」這項仍通過。
  - 新增的瀏覽器回歸測試 5b：確實會延遲 PUT，並檢查列印中的「含未儲存的修改」標示。協調中心另附的 R1 對照（`browser-check-control-on-R1.txt`）顯示 5b 在 R1 上 FAIL、exit=1，與我在 R1 時重現的結果一致。
- **必改 2：證據檔已更正。**
  - 檔頭註明 R2 候選與補丁雜湊 `9d3a1c56`。
  - 每支腳本都用全新的 stack 跑，exit 記錄的是腳本自己的結束碼。
  - layout 有通過的紀錄。
  - 我重跑的結果與證據相符，見第 4 節。
- **R1 的建議項**
  - 載入時只保留物件型別的列，並補上唯一 id。實測如下：
    - 資料庫值為 `{"a":1}` 時，畫面顯示 0 列，精靈沒有當掉。
    - 資料庫值為 `[1,null,"x",{A},{B},{id:5,C},{id:5,D}]` 時，畫面顯示 A、B、C、D 共 4 列。
    - 修改 A 只影響 A，刪除 D 只刪掉 D。
    - 存檔後的 id 為 `loaded-0`、`loaded-1`、`5`。
    - 整個過程沒有 pageerror。
  - `_AGENDA_TIME` 已改用 `[0-9]`，探針送 `'1٠:00'` 現在回 422。
  - 註解已更新。第 2 步裡的舊列印摘要保留，STATUS 有說明理由（直接用瀏覽器選單列印時仍會用到），可以接受。

### 3. 後端（R1 的探針在 R2 候選上重跑）
- 12 個探針全部通過，包括：
  - 欄位為 null 轉成 `''`、額外欄位被忽略。
  - 排序符合規格。
  - Closed 鎖定：只送部分欄位的重存可以通過；改 id、送 `[]`、送 null 都回 400。
  - 舊資料存 NULL 的 Closed 紀錄：送 `[]` 通過，新增一列回 400。
  - Void 狀態下改內容回 400。
  - 舊前端不送 agenda 時，原值不受影響。
  - id 為 `True` 時回 422；Unicode 數字的時間回 422。
- Word 第 4 段、migration 可重複執行等 R1 的結論，在 R2 都沒有受到影響（相關程式碼與 R1 完全相同）。

### 4. 自行跑測試（R2 候選）
- **後端**：設定拋棄式 `DATABASE_URL`（$TMPDIR），用 Python 3.14.6 跑 8 個測試檔（agenda、export-docx、hardening、contractor-scope、docx-path-guard 兩檔、contractor-options、integrity_fixes）：**103 passed，exit 0**。
- **前端**：`tsc --noEmit` 結果 0；eslint `--max-warnings 0`（4 個檔案）結果 0；`npm run build` 結果 0。
- **瀏覽器**：以 `isolated_stack.py` 在 8320/3320 啟動，每支腳本都用全新的 stack 和資料庫。
  - `audit-agenda-check.mjs`：**ALL PASS，共 17 項（含 5b 與對照），exit 0**。
  - layout、print-template、export-docx、smoke-all：ALL PASS，exit 0。
  - polish、ime-enter：沒有 FAIL，exit 0。
  - 自己寫的探針（存檔期間編輯、對照、異常資料）都符合預期。
- **收尾**：每個 stack 都已執行 `down` 並刪除。8320/3320 沒有任何 LISTEN，也沒有殘留本審查的程序或 run 目錄。沒有碰 8198/3198、8240/3240、8330/3330、8340/3340，也沒有連正式站。啟動前沙箱擋了本機埠綁定，這一步是在沙箱外執行的。

### 5. Python 3.11
這一輪還沒跑。**最終候選在 Python 3.11 上全數通過，是部署的前提條件。**
協調中心已告知：AUDIT-PRINT 最終候選在 3.11 上有一個 ITR 競態測試失敗，正在另外調查。這跟本輪的改動無關，但本輪的最終候選同樣必須在 3.11 上全數通過才能部署。

## SCOPE_CHECK
- R2 只處理了 R1 的必改項與建議項，沒有新增功能或範圍。
- TASK 範圍 1–5 都已涵蓋。「不在本輪」所列的項目（與條文連動、檢查時段重疊）都沒有做。
- 共用檔只含本輪的 hunk；沒有新增依賴；API 只多了 `agenda` 欄位。
- 文件小瑕疵（不影響判定）：STATUS「修改」表裡的 `AuditWizard.tsx` 那一列仍寫著 `agendaResynced`（R2 已改名為 `agendaResyncTarget`），`audit-agenda-check.mjs` 那一列仍寫「共 15 項」（R2 是 17 項）。這兩處的正確內容都已寫在「R2 修正」和「證據」兩節，部署前整理 STATUS 時可以順手更正。

## DECISIONS_CHECK
- migration 透過 `db_migrations._add_missing_columns` 和 `_add_column_if_missing`，可以重複執行，沒有直接改 schema，符合 AGENTS.md。
- 既有表只新增一個可為 NULL 的 TEXT 欄位，舊資料讀出 `[]`，相容。
- Closed／Void 的鎖定沒有變弱。
- 與 DECISIONS.md 現有的決策沒有衝突。本輪的業務選擇都來自 TASK 所記錄的使用者決定，沒有自行升格為政策。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無。

（選做：更正 STATUS「修改」表中過時的 `agendaResynced` 和「15 項」兩處文字。）

## NEXT_STEP
1. 依協調中心佇列（第 4 順位，排在 AUDIT-PRINT、CHECKLIST-TEMPLATE-CLEAN、NOI 之後）處理。輪到時以當時的正式站版本重建最終候選；如果基準有變，要確認 G.patch 仍能乾淨套上，共用檔也仍只含本輪的 hunk。
2. **部署前提**：最終候選在 Python 3.11 上全數通過，包含本輪的 `test_audit_agenda_http.py` 和相關測試。
3. 部署內容包含 migration（`audits.agenda`）、後端重建與前端切換。部署後只做唯讀檢查，不建立任何資料。
