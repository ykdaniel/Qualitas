# AUDIT-AGENDA-2026-001 — STATUS（R2，PASS；待部署佇列與最終候選 3.11）

TASK_ID: AUDIT-AGENDA-2026-001
ROUND: R2（R1 審查 REVISE，原文留存於 `AUDIT-AGENDA-2026-001-R1-REVISE-*-archive.md`，R1 補丁為 `evidence/G-R1.patch`）。基準 HEAD `fcc83c62`。HEAD 在 R1 之後多了 `97bf3723`、`db9d2991`、`fcc83c62`，都是其他工作階段的 ITR／UI 修改。其中 `97bf3723` 動到共用檔 `LanguageContext.tsx`（別人的 4 行），補丁以新的 HEAD 為基準重建，仍能乾淨套上。差異見 `evidence/G.patch`（SHA-256 `9d3a1c56a2b59ceecc2389b1d8aa06ab30ea2db71fb07e71b9aedf1d09c5f028`），共 19 個檔案。
- 補丁是用 `~/Documents/Qualitas-deploy-artifacts/AUDIT-AGENDA-2026-001/make-patch.sh` 產生的：先用暫存 index 從 HEAD 讀出，自己的檔案整個 add；共用的 `db_migrations.py` 只在 HEAD 版本加上我那 1 行，`LanguageContext.tsx` 只加上我那 30 行。
- 候選樹 = `git archive HEAD` 套上 G.patch。
- 兩個共用檔維持 CRLF，裡面不含其他工作階段未提交的修改：協調中心的 `_clean_legacy_bare_template_results`，以及別人的 4 行字串。

審查 R2 結果為 PASS（見 REVIEW），已在本地提交，推送由協調中心負責。部署排在協調中心佇列第 4，屆時會以當時的正式站版本重建最終候選，並重跑 3.11。

## RESULT
- [x] DONE（R2 PASS）

## R2 修正（R1 審查 REVISE）
| R1 審查項目 | 處理 |
|---|---|
| 必改 1：存檔期間做的編輯被誤判為已儲存，關閉後就遺失 | 原因：`setAgendaResynced(true)` 不管畫面有沒有真的換掉都會執行。<br>改法：`agendaResyncTarget` 記住重新排序後的那個表單物件；effect 裡只有在 `formData === agendaResyncTarget` 時才呼叫 `markSaved()`。如果存檔期間有編輯，`setFormData` 的 updater 會保留含有編輯的表單，兩者不相等，就不會標成已儲存。<br>新增瀏覽器回歸測試（agenda-check 5b）：延遲 PUT 2.5 秒，在存檔期間把地點改成 `EDITED-DURING-SAVE`。結果：畫面上看得到這個值，但資料庫裡沒有，列印標示為未儲存。另有對照：再存一次後，資料庫寫入新值，未儲存的標示也消失。 |
| 必改 2：`browser-check.txt` 對應的是舊補丁，沒有重跑紀錄，exit 也記錯 | 全部在 R2 候選上重跑。每一支腳本都用全新的 stack，`exit=` 記錄的是腳本自己的結束碼，不再經過 pipe。 |
| 建議：資料庫值不是陣列或含有非物件時，精靈會當掉 | 精靈載入時只保留物件型的列。 |
| 建議：id 是 null 或重複時，編輯器會一起修改、一起刪除 | 載入時補上唯一的 id（`loaded-<i>`）。 |
| 建議：`\d` 會接受 Unicode 數字 | `_AGENDA_TIME` 改用 `[0-9]`；422 測試加上 `'1\u0660:00'`。`strict_dates` 原本就有的同樣問題不在本輪範圍。 |
| 建議：第 33–34 行的註解是舊的 | 已更新。第 2 步裡舊的列印摘要保留：直接用瀏覽器選單列印時（沒有掛載列印內容）仍然有用。 |

**對照組**（`browser-check-control-on-R1.txt`）：用 R2 的 agenda-check 跑 R1 候選，5b 會 FAIL（`unsavedFlag:false`），exit=1。可見新測試確實抓得到 R1 的 bug。

## 修改
| 檔案 | 內容 |
|---|---|
| `backend/models.py` | `Audit.agenda = Column(Text)`。 |
| `backend/db_migrations.py` | `_add_missing_columns` 加 1 行，新增 audits.agenda（TEXT）。 |
| `backend/schemas.py` | 新增 `_AGENDA_TIME`、`AuditAgendaEntry`、`_sorted_agenda`。<br>`AuditBase.agenda: Any`（寬鬆），並把 agenda 加進 `parse_json_fields`；新增 `agenda_list`，把 None 轉成 []。<br>`AuditCreate.agenda` 和 `AuditUpdate.agenda` 都是 `list[AuditAgendaEntry]`，並加上 `sort_agenda`。 |
| `backend/services/audit_service.py` | `_JSON_FIELDS` 加入 agenda。<br>update 時把每一列完整 dump。<br>Word 匯出加入第 4 段，各段重新編號；新增 `_AGENDA_COLUMN_WIDTHS_CM`。<br>維持 CRLF。 |
| `backend/tests/test_audit_agenda_http.py`（新） | 6 個測試，見下方「證據」。 |
| `backend/scripts/verification/seed_audit_agenda_review.py`（新） | 隔離環境用的種子：AHB-AGENDA-1（草稿，沒有行程）、AHB-AGENDA-CLOSED-1（已關閉，3 列行程）。沒有 DATABASE_URL 時拒絕執行。 |
| `react-app/src/components/Audit/AuditAgendaEditor.tsx`（新） | 編輯表格。匯出 `sortAgenda`（排序規則同後端）、`isBlankAgendaRow`、`agendaRowTimeInvalid`。 |
| `react-app/src/components/Audit/AuditWizard.tsx` | 精靈改成 5 步，加入第 3 步 Agenda，「列印計畫」移到這一步，第 2 步拿掉列印按鈕。<br>`formData.agenda`；`prepareAuditData` 移除空白列後排序。<br>時間順序錯誤時擋下儲存。<br>printData 加入 agenda。<br>儲存草稿後，如果儲存期間沒有其他修改，就把畫面上的行程換成存好的順序；只有畫面上的確是那份重新排序過的表單時，才在 render 之後 markSaved（`agendaResyncTarget`，R2）。<br>維持 CRLF。 |
| `react-app/src/components/Audit/AuditPrintTemplate.tsx` | 新增 `agendaSection`（欄位和文字與 Word 相同）。<br>報告改為 1–7 段；計畫改為 1–4 段加上第 5 段計畫簽核。 |
| `react-app/src/components/Audit/Audit.print.css` | 新增 `.agenda-items` 的欄寬。 |
| `react-app/src/store/auditStore.ts` | 新增 `AuditAgendaEntry` 型別和 `AuditItem.agenda`。維持 CRLF。 |
| `react-app/src/context/LanguageContext.tsx` | 中英各 15 個 key：`audit.wizard.stepAgenda`、`audit.agenda.*`。維持 CRLF。 |
| `react-app/tests-browser/audit-agenda-check.mjs`（新） | 隔離環境用的瀏覽器檢查，共 17 項（R2 新增 5b 及其對照）。 |
| 6 支既有的瀏覽器檢查 | 步驟編號改為 5 步：export-docx、ime-enter、layout、polish、print-template、smoke-all。<br>print-template：計畫在第 3 步、查檢表在第 4 步、報告在第 5 步；章節順序加入「4. 稽核行程」。<br>layout：改成驗證第 2 步沒有列印按鈕，第 3 步有表格和列印按鈕，且不能有溢出。 |

## 證據（`AUDIT-AGENDA-2026-001-evidence/`）
- `backend-related-tests.txt`：在 R2 候選樹上跑 8 個測試檔（agenda、export-docx、hardening、contractor-scope、docx-path-guard 兩檔、contractor-options、integrity_fixes），**103 passed，exit 0**。
- 新測試 6 個：
  1. 儲存後依序排好並回傳，update 會重排。
  2. 沒有 agenda、NULL、壞掉的 JSON 都讀成 `[]`。
  3. 不合法的日期、時間，以及結束早於開始，都回 422；只有開始、只有結束、開始等於結束都允許。
  4. Closed 紀錄的行程被鎖定，但順序不同、內容相同的重存可以通過。
  5. Word 有 7 段，第 4 段是行程，內容逐列正確。
  6. Word 在沒有行程或資料異常時，仍能正常匯出。
- `migration-check.txt`：在拋棄式 SQLite 上，把 `audits` 的 agenda 欄位刪掉後執行 `_add_missing_columns`：欄位補上（TEXT），舊資料讀出來是 `[]`，第二次執行不做任何事。
- `frontend-checks.txt`：tsc、eslint（`--max-warnings 0`，4 個檔案）、build 都是 exit 0。
- `browser-check.txt`（R2，隔離環境 8320/3320，從 R2 候選樹啟動，每支腳本都用全新的 stack，exit 是腳本自己的結束碼）：
  - `audit-agenda-check.mjs` **ALL PASS**，共 17 項，含 5b 和它的對照：
    - 5 個步驟，「稽核行程」是第 3 步；列印按鈕只在這一步。
    - 新的一列帶入預設值。
    - 結束早於開始時，該列標紅、擋下儲存、不送出請求。
    - 儲存後依序排好、空白列移除，畫面也同步排序，而且不會被判定成「未儲存」。
    - 超出稽核期間只提醒，仍會儲存。
    - 重新打開時順序正確。
    - **列印計畫、列印報告、Word 三者的行程內容逐列相同。**
    - 只能檢視的使用者和已關閉的稽核：唯讀，但可以列印。
    - 英文字串正確。
  - 回歸測試：print-template（PDF）、export-docx、layout（1440、1024、390 三種寬度，含 Agenda 這一步不溢出）、smoke-all、polish、ime-enter 都通過。
    - R1 時 layout 第一次失敗 3 項，原因是它仍要求第 2 步要有列印按鈕，已改掉這個斷言；R2 重跑通過。
- 截圖：`agenda-step.png`。

## 未做／限制
- Python 3.11 完整測試還沒跑：AUDIT-PRINT 的 3.11 正在跑，同時跑兩個會互相拖慢。會在最終候選上執行，而且必須全數通過才能部署。
- 部署需要 migration 和後端重建（sudo），也要切換前端。排在協調中心佇列第 4。
