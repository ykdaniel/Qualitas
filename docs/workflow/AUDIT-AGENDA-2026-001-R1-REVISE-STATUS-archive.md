# AUDIT-AGENDA-2026-001 — STATUS（R1，待獨立審查）

TASK_ID: AUDIT-AGENDA-2026-001
ROUND: R1。基準 HEAD `ff19c25b`。差異見 `evidence/G.patch`（SHA-256 `60a9cceb9140506ed67babcfc8ec9aba234b625b671b04ecbf9e873e3389247c`），共 19 個檔案。
- 補丁是用 `~/Documents/Qualitas-deploy-artifacts/AUDIT-AGENDA-2026-001/make-patch.sh` 產生的：先用暫存 index 從 HEAD 讀出，自己的檔案整個 add；共用的 `db_migrations.py` 只在 HEAD 版本加上我那 1 行，`LanguageContext.tsx` 只加上我那 30 行。
- 候選樹 = `git archive HEAD` 套上 G.patch。
- 兩個共用檔維持 CRLF，裡面不含其他工作階段未提交的修改：協調中心的 `_clean_legacy_bare_template_results`，以及別人的 4 行字串。

**未提交、推送或部署。不自填 PASS。**

## RESULT
- [x] DONE（交 R1 獨立審查）

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
| `react-app/src/components/Audit/AuditWizard.tsx` | 精靈改成 5 步，加入第 3 步 Agenda，「列印計畫」移到這一步，第 2 步拿掉列印按鈕。<br>`formData.agenda`；`prepareAuditData` 移除空白列後排序。<br>時間順序錯誤時擋下儲存。<br>printData 加入 agenda。<br>儲存草稿後，如果儲存期間沒有其他修改，就把畫面上的行程換成存好的順序，並在 render 之後 markSaved（`agendaResynced`）。<br>維持 CRLF。 |
| `react-app/src/components/Audit/AuditPrintTemplate.tsx` | 新增 `agendaSection`（欄位和文字與 Word 相同）。<br>報告改為 1–7 段；計畫改為 1–4 段加上第 5 段計畫簽核。 |
| `react-app/src/components/Audit/Audit.print.css` | 新增 `.agenda-items` 的欄寬。 |
| `react-app/src/store/auditStore.ts` | 新增 `AuditAgendaEntry` 型別和 `AuditItem.agenda`。維持 CRLF。 |
| `react-app/src/context/LanguageContext.tsx` | 中英各 15 個 key：`audit.wizard.stepAgenda`、`audit.agenda.*`。維持 CRLF。 |
| `react-app/tests-browser/audit-agenda-check.mjs`（新） | 隔離環境用的瀏覽器檢查，共 15 項。 |
| 6 支既有的瀏覽器檢查 | 步驟編號改為 5 步：export-docx、ime-enter、layout、polish、print-template、smoke-all。<br>print-template：計畫在第 3 步、查檢表在第 4 步、報告在第 5 步；章節順序加入「4. 稽核行程」。<br>layout：改成驗證第 2 步沒有列印按鈕，第 3 步有表格和列印按鈕，且不能有溢出。 |

## 證據（`AUDIT-AGENDA-2026-001-evidence/`）
- `backend-related-tests.txt`：在候選樹上跑 8 個測試檔（agenda、export-docx、hardening、contractor-scope、docx-path-guard 兩檔、contractor-options、integrity_fixes），**103 passed，exit 0**。
- 新測試 6 個：
  1. 儲存後依序排好並回傳，update 會重排。
  2. 沒有 agenda、NULL、壞掉的 JSON 都讀成 `[]`。
  3. 不合法的日期、時間，以及結束早於開始，都回 422；只有開始、只有結束、開始等於結束都允許。
  4. Closed 紀錄的行程被鎖定，但順序不同、內容相同的重存可以通過。
  5. Word 有 7 段，第 4 段是行程，內容逐列正確。
  6. Word 在沒有行程或資料異常時，仍能正常匯出。
- `migration-check.txt`：在拋棄式 SQLite 上，把 `audits` 的 agenda 欄位刪掉後執行 `_add_missing_columns`：欄位補上（TEXT），舊資料讀出來是 `[]`，第二次執行不做任何事。
- `frontend-checks.txt`：tsc、eslint（`--max-warnings 0`，4 個檔案）、build 都是 exit 0。
- `browser-check.txt`（隔離環境 8320/3320，從候選樹啟動，每段都用全新資料庫）：
  - `audit-agenda-check.mjs` **ALL PASS**：
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
    - layout 第一次跑失敗 3 項，原因是它仍要求第 2 步要有列印按鈕；這是本輪刻意的改動，已把斷言改掉並重跑通過。
- 截圖：`agenda-step.png`。

## 未做／限制
- Python 3.11 完整測試還沒跑：AUDIT-PRINT 的 3.11 正在跑，同時跑兩個會互相拖慢。會在最終候選上執行，而且必須全數通過才能部署。
- 部署需要 migration 和後端重建（sudo），也要切換前端。排在協調中心佇列第 4。
