# AUDIT-BUTTONS-2026-001 — STATUS（R2，待獨立審查）

TASK_ID: AUDIT-BUTTONS-2026-001
ROUND: R2。R1 審查結果為 REVISE，原文保留在 `AUDIT-BUTTONS-2026-001-R1-REVISE-*-archive.md`，當時的補丁為 `evidence/G-R1.patch`。
- 基準：HEAD `86932e29`。HEAD 多出的 MEETING-TABS commit 改過 `LanguageContext.tsx` 的其他行，本輪的修改仍只有 `audit.wizard.stepAgenda` 中英各 1 行。
- 差異見 `evidence/G.patch`（SHA-256 `24e5d9fe1e774e1b4b12e49b71f7e316bb5789c9324c0d0ddf9c01141cf95778`），共 15 個檔案，沒有任何 mode 變更。
- 候選樹 = `git archive HEAD` 加上 G.patch。

**未提交、推送或部署。不自填 PASS。**

## RESULT
- [x] DONE（交 R2 獨立審查）

## R2 修正（R1 審查 REVISE）
| R1 審查項目 | 處理 |
|---|---|
| 必改 1：每次 onChange 都觸發午餐預設。Chrome 日期欄在逐字輸入或按方向鍵時，每一步都會送出一個中間日期，例如 0002-10-01、0020-10-01，結果錯誤的午餐列被存進資料庫。另外，某天唯一的一列被移走後，會留下孤立的午餐列。 | `update` 只改值，不再補午餐。新增 `commitDate`，掛在日期欄的 **onBlur**，比較的是 `committedDate` ref：每列第一次出現時的日期，之後是上一次離開日期欄時的日期。<br>• 列移到新的一天時，補一列午餐。<br>• 原本那天如果已經沒有任何行程，就一併移除那天**仍是預設、未改過**的午餐列（12:00–13:00、Lunch Time、其他欄位空白）；改過的午餐列保留。<br>• `addRow` 仍會在新的一天直接補午餐，因為新增的列日期是一次給定的。<br>瀏覽器檢查新增 3 項（7b）：在新稽核用 `keyboard.type('10012026')` 逐字輸入，輸入過程中沒有任何午餐列，離開欄位後只有一列，日期正確；按兩次 ↑，只有最終那天有一列午餐，原本那天的預設午餐被移除；改過的午餐（remarks=keep）在那天的行程移走後保留，新的一天另外補一列。<br>測試輔助函式在 `fill()` 日期之後會 focus 再 blur，模擬使用者離開欄位。原因是 Playwright 的 `fill()` 不會讓日期欄失焦，而 Tab 只會在日期欄的月、日、年之間移動。 |
| 必改 2：`LanguageContext.tsx` 的檔案權限變成 100755 | 檔案在工作樹裡被改成可執行，原因不明，修改時間 06:48，不是本輪的操作。已用 `chmod 644` 改回，新的 G.patch 已沒有任何 `old mode／new mode`。 |
| 必改 3：證據截圖不是最終版 | 截圖全部改用 R2 最終候選 `audit-buttons-check` 產生的（開始、結束欄 132px）：`step3-footer`、`step5-footer`、`sticky-1400`、`sticky-390`、`lunch-step3`、`agenda-width-800`、`agenda-width-1400`。 |

**對照組**（`browser-check-control-on-R1.txt`）：用 R2 的 buttons-check 跑 R1 候選，7b 三項全部 FAIL（輸入過程中多出 4 列午餐：0002、0020、0202、2026），exit=1。這證明新的檢查確實能抓到 R1 的 bug。

## 修改
| 檔案 | 內容 |
|---|---|
| `backend/services/audit_service.py` | `export_docx(kind)`：<br>• 新增 `_DOCX_KINDS`、`AUDIT_DOCX_KINDS`（給 router 做白名單）。<br>• checklist 分支：稽核資訊、查檢項目（結果欄印空白勾選框，備註留白）、簽核 3.1／3.2。<br>• plan 分支：第 1–4 段，加上第 5 段計畫簽核。<br>• Agenda 表裡 `kind=lunch` 的列以 `_shade` 上灰底。<br>• `_comparable` 處理沒有 kind 的舊列。<br>• 維持 CRLF。 |
| `backend/routers/audit.py` | `kind: str = Query("report")`，不在白名單內就回 400，再呼叫 service。維持 CRLF。 |
| `backend/schemas.py` | `AuditAgendaEntry.kind` 只接受 `''` 或 `'lunch'`，null 轉成 `''`。 |
| `backend/tests/test_audit_export_docx_http.py` | 新增 3 個測試：kind=plan、kind=checklist、預設與白名單（`summary`、`REPORT`、空字串、`../plan` 都回 400）。 |
| `backend/tests/test_audit_agenda_http.py` | 新增 3 個測試：午餐列可存、排序、編輯、刪除，不合法的 kind 回 422；舊的 Closed 稽核重存；Word 灰底。原本的回傳斷言補上 `kind`。 |
| `react-app/src/services/api.ts` | `exportAuditDocx(id, filename, kind='report')`，以 `params: { kind }` 傳出。 |
| `react-app/src/store/auditStore.ts` | `AuditAgendaEntry.kind?: ''\|'lunch'`。維持 CRLF。 |
| `react-app/src/components/Audit/AuditWizard.tsx` | • `STEP_DOCUMENTS`、`DOCX_SUFFIX`。<br>• 底部 tools 區顯示「上一步」，加上該步的列印和 Word 按鈕（`data-step-print`、`data-step-word`）。<br>• 移除第 3、4、5 步卡片上的按鈕。<br>• `handleExportDocx(kind)`。<br>• sticky header 和 footer、`overflow-clip`，垂直內距移到內層。<br>• 步驟圓圈拿掉 transition 和 hover 放大。<br>• 第 4 步標題修正。<br>• 維持 CRLF。 |
| `react-app/src/components/Audit/AuditAgendaEditor.tsx` | • `lunchRow()`、`isUntouchedLunch()`；`addRow` 在新的一天時補午餐；日期欄 onBlur 時由 `commitDate` 判斷是否補午餐，並移除未改過的孤立午餐（R2）。<br>• 午餐列灰底，加 `data-agenda-kind`。<br>• `table-fixed` 和各欄寬度。 |
| `react-app/src/components/Audit/AuditPrintTemplate.tsx`、`Audit.print.css` | 午餐列加上 `tr.lunch` class，灰底。 |
| `react-app/src/context/LanguageContext.tsx` | `audit.wizard.stepAgenda`：en 改為 `Audit Plan`，zh 改為 `稽核計畫`。維持 CRLF。 |
| `react-app/tests-browser/audit-buttons-check.mjs`（新） | 27 項，見下方證據。 |
| `react-app/tests-browser/audit-agenda-check.mjs` | 步驟名稱改為「稽核計畫」／「Audit Plan」。agenda 測試出現自動補上的午餐列時，用 `dropLunch` 刪掉；午餐的行為由 buttons-check 驗證。 |
| `react-app/tests-browser/audit-export-docx-check.mjs` | Word 按鈕的位置改到底部左側。 |

## 證據（`AUDIT-BUTTONS-2026-001-evidence/`）
- `backend-related-tests.txt`：R2 候選樹 8 個測試檔，**109 passed**，exit 0。
- `frontend-checks.txt`：tsc、eslint（`--max-warnings 0`，5 個檔案）、build 都是 0。
- `browser-check.txt`：每支腳本都在全新的隔離 stack（8321/3321）上跑。3320 留給使用者預覽。exit 為腳本本身的結束碼。
  - `audit-buttons-check.mjs` **ALL PASS（27 項，含 R2 新增的 7b 三項：鍵盤輸入、方向鍵、孤立午餐）**：
    - 第 1–5 步底部左側的按鈕都正確，卡片上沒有按鈕，按鈕都有圖示。
    - 三個列印按鈕各自印出對應的 kind。
    - 三個 Word 按鈕的 kind、檔名、文件內的標題都正確。
    - 新紀錄在第一次儲存草稿之後才出現 Word 按鈕。
    - 只能檢視的使用者看 Closed 稽核時，仍有兩個按鈕。
    - 英文介面正確。
    - 手機寬度 390 時按鈕都在畫面內。
    - 午餐 7 項：舊資料不會自動補；第一列帶出灰底的午餐列；同一天不會補第二列；改到新日期會補；刪掉的不會回來；存入的資料正確（kind=lunch，含編輯內容）；列印和 Word 只有午餐列是灰底。
    - 欄寬 2 項：1400 寬時稽核項目欄 310px，800 寬時 252px，都是最寬的一欄；開始、結束欄 132px；精靈沒有溢出。
    - sticky 2 項：1400×700 和 390×700 捲動之後，header top=0、footer bottom 等於視窗高度；步驟圓圈 transition 為 0s，hover 時沒有 transform。
  - 回歸測試 agenda、print-template（PDF）、export-docx、layout、smoke-all、polish、ime-enter 全部通過。
- 截圖：`step3-footer.png`、`step5-footer.png`、`sticky-1400.png`、`sticky-390.png`、`lunch-step3.png`、`agenda-width-800.png`。
- 協調中心在內建瀏覽器（zh-TW，寬度約 800）實際看過：開始、結束時間完整顯示為「上午09:00」「下午12:00」。
- 使用者在 3320 確認：「Audit 可以」。

## 未做／限制
- Python 3.11 尚未執行（協調中心的 NOI 3.11 正在跑，不可同時進行）。要在最終候選上跑，而最終候選以那時的正式站為基準。
- 部署會改後端（export-docx 的 kind、Agenda 的 kind），需要重建，也要切換前端。不需要 migration：agenda 是 JSON，kind 存在 JSON 裡。
- 無頭 Chromium 不會顯示 zh-TW 的時間格式，所以「下午12:00」是否完整顯示，是由協調中心在 zh-TW 內建瀏覽器實際確認的。
