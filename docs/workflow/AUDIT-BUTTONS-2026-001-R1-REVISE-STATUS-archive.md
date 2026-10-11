# AUDIT-BUTTONS-2026-001 — STATUS（R1，待獨立審查）

TASK_ID: AUDIT-BUTTONS-2026-001
ROUND: R1。基準 HEAD `ce7cc83a`。差異見 `evidence/G.patch`（SHA-256 `8b9fa1138726231615ecc74ee332e3baff8d723b09652912622fba53a0e2c583`），共 15 個檔案，都只有本輪的修改：
- `LanguageContext.tsx` 只改了 `audit.wizard.stepAgenda` 中英各 1 行。
- `schemas.py` 只動 AuditAgendaEntry。
- 候選樹 = `git archive HEAD` 加上 G.patch。

**未提交、推送或部署。不自填 PASS。**

## RESULT
- [x] DONE（交 R1 獨立審查）

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
| `react-app/src/components/Audit/AuditAgendaEditor.tsx` | • `lunchRow()`；`addRow` 和 `update(date)` 在出現新的一天時補上午餐列。<br>• 午餐列灰底，加 `data-agenda-kind`。<br>• `table-fixed` 和各欄寬度。 |
| `react-app/src/components/Audit/AuditPrintTemplate.tsx`、`Audit.print.css` | 午餐列加上 `tr.lunch` class，灰底。 |
| `react-app/src/context/LanguageContext.tsx` | `audit.wizard.stepAgenda`：en 改為 `Audit Plan`，zh 改為 `稽核計畫`。維持 CRLF。 |
| `react-app/tests-browser/audit-buttons-check.mjs`（新） | 24 項，見下方證據。 |
| `react-app/tests-browser/audit-agenda-check.mjs` | 步驟名稱改為「稽核計畫」／「Audit Plan」。agenda 測試出現自動補上的午餐列時，用 `dropLunch` 刪掉；午餐的行為由 buttons-check 驗證。 |
| `react-app/tests-browser/audit-export-docx-check.mjs` | Word 按鈕的位置改到底部左側。 |

## 證據（`AUDIT-BUTTONS-2026-001-evidence/`）
- `backend-related-tests.txt`：候選樹 8 個測試檔，**109 passed**，exit 0。
- `frontend-checks.txt`：tsc、eslint（`--max-warnings 0`，5 個檔案）、build 都是 0。
- `browser-check.txt`：每支腳本都在全新的隔離 stack（8321/3321）上跑。3320 留給使用者預覽。exit 為腳本本身的結束碼。
  - `audit-buttons-check.mjs` **ALL PASS（24 項）**：
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
