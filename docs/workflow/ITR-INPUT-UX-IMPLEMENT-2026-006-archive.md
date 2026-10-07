# ITR-INPUT-UX-IMPLEMENT-2026-006 — 封存（TASK / STATUS / REVIEW 逐字快照，封存時尚未審查）

封存日期：2026-10-05。本輪在獨立審查完成前先封存，使用者確認要做 ITR 匯出 Word（.docx）功能，
開新批 ITR-EXPORT-DOCX-2026-001（不同任務族系，因為這是全新能力而非既有 Input UX 系列的延伸，
但承接同一條 ITR 工作的 archive 鏈）。REVIEW.md 封存時仍是待審空白模板。

## TASK.md（逐字）

````markdown
# TASK.md — ITR 列印補上 Checklist 測試項目與結果

TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-006
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-005

## 狀態
已交辦，Claude 執行中。使用者點了 Print 後發現「都沒有測試結果跟項目」——讀碼確認 `ITRPrintPreview`
從來沒有渲染過 Checklist 的 Item／Criteria／Situation／Result 資料，是真實缺陷，使用者回「修」確認
要修。

## PRECHECK
- `ITRPrintPreview`（`ITRModals.tsx` 約 1372 行起）只印基本資料表、幾個自由文字欄位、Remark、
  簽名欄——完全沒有渲染 `displayData.linkedChecklists`（這個 prop 本身已經在呼叫端傳入，
  `data={{ ...formData, linkedChecklists: instances, itpNo: ... }}`，只是從未被拿來 render）。
- `instances: ChecklistRecordApi[]`——每筆是後端原始記錄，`detail_data` 是 JSON 字串，需要
  parse 出 `items: [{id, item, criteria, situation, result}]`（跟 `ChecklistSnapshotModal.tsx`／
  `parseInstance` 用的是同一種資料形狀，但 `parseInstance` 是定義在 `ITRDetailModal` 內部的
  closure，沒有 export，`ITRPrintPreview` 是獨立元件拿不到，所以在列印元件內部另外寫一次
  輕量 parse，不共用那個 closure）。
- Result 顯示：沿用 `utils/checklistResult.ts` 的 `classifyResult`，比照畫面上 `ResultBadge`／
  `useResultLabel` 的判斷邏輯（pass/fail/na/unfilled/unknown），轉成既有的
  `checklist.result.*` 翻譯鍵文字，不自己發明新的顯示字串。

## SCOPE
在 `ITRPrintPreview` 的 `printContent` 裡，基本資料表之後、自由文字欄位之前，新增一段：
對 `displayData.linkedChecklists` 裡每一筆記錄，parse 出 `items`，印出一個小標題（記錄編號＋
Activity＋狀態）＋一個 # / Item / Criteria / Situation / Result 五欄表格；Situation 欄位用
`white-space: pre-wrap` 保留換行（比照 round 001 Checklist 本身的修法，不要重蹈列印壓縮換行的
覆轍）；沒有 items 時顯示「無項目」提示文字，不是空白一片看起來像漏印。

不改 `ITRPrintPreview` 以外的任何渲染邏輯，不改 `ITRModals.tsx` 呼叫端傳入 `linkedChecklists` 的
方式（round 005 已經在傳了，不需要動）。

## ALLOWED_PATHS
- `react-app/src/components/ITR/ITRModals.tsx`
- `react-app/tests-browser/`（驗收腳本）
- `docs/workflow/`
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- `ChecklistSnapshotModal.tsx`、`Checklist.tsx`、`ChecklistPrintTemplate.tsx`（ITP 的列印模板，
  不是這次要改的對象）、任何後端檔案。
- 開發資料庫、使用者 8198/3198、`stash`/`reset`/`checkout`。
- commit／push／部署。

## ACCEPTANCE_CRITERIA
1. 有連結 Checklist 且已填寫過 Situation/Result 的 ITR，列印預覽能看到每筆 Checklist 的
   Item/Criteria/Situation/Result 完整內容，Situation 的換行有保留（不是擠成一行）。
2. 連結了 Checklist 但該筆尚未填寫任何項目（items 為空陣列）時，顯示提示文字，不是空白。
3. 沒有連結任何 Checklist 時，這個新區塊不渲染任何東西（不是印出空標題或空表格）。
4. `npx tsc --noEmit` 無錯誤；`npm run lint` 基線不變。
5. 獨立隔離環境真實瀏覽器驗證；未操作使用者 8198/3198；未 commit/push/部署；REVIEW.md 留待獨立
   審查。
````

## STATUS.md（逐字）

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-006
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-005

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪變更範圍
只修改 `react-app/src/components/ITR/ITRModals.tsx` 的 `ITRPrintPreview` 元件：在基本資料表之後、
自由文字欄位之前，新增一段渲染 `displayData.linkedChecklists`（這個 prop 其實已經在呼叫端傳入，
round 005 也沿用了同一個傳入點，只是從未被拿來 render）——對每一筆連結的 Checklist，parse 它的
`detail_data` 取出 `items`，印出記錄編號＋Activity＋狀態的小標題，再接一個 # / Item / Criteria /
Situation / Result 五欄表格。Result 欄位沿用 `utils/checklistResult.ts` 的 `classifyResult` 轉成
既有的 `checklist.result.*` 翻譯文字（Pass/Fail/N/A/Not filled），不是另外發明字串。Situation
欄位用 `white-space: pre-wrap` 保留換行，比照 round 001 Checklist 本身的修法。

新增驗收腳本 `react-app/tests-browser/itr-input-ux-implement6-review.mjs`。

## 實測（隔離環境，真實瀏覽器）
```
6 checks executed, 6 PASS, 0 FAIL
```
- `print1`：ITR2（已連結且已判定為 Pass 的 Checklist）列印出來看得到記錄編號＋Activity 標題。
- `print2`：Result 欄位顯示人類可讀的「Pass」，不是存檔用的代碼 `O`。
- `print3`/`print4`：Situation 欄位完整印出含結尾標記的長文字，且 `white-space: pre-wrap`
  確認換行真的保留（截圖可見兩段文字分行清楚，不是擠成一行）。
- `print5`：ITR1（該項目尚未判定）印出的 Result 是「Not filled」這個有意義的字，不是空白或一個
  孤零零的破折號。
- `print6`：新建、沒有連結任何 Checklist 的 ITR，列印預覽裡完全沒有這個新區塊（沒有印出空標題或
  空表格），確認「沒有資料時不要印出看起來像漏東西的殘影」這個防呆有做到。

截圖：`docs/workflow/ITR-INPUT-UX-IMPLEMENT-2026-006-evidence/print-with-checklist-results.png`
（可見完整的 Item/Criteria/Situation/Result 表格，換行正確保留）。

## 前端檢查
- `npx tsc --noEmit`：無錯誤。
- `npm run lint`：13 errors / 21 warnings，基線不變。
- `npm run build`／既有單元測試套件：本批未重跑——只在既有元件裡新增一段渲染邏輯，沒有改動任何
  資料流或既有渲染路徑。

## 隔離環境
`isolated_stack.py up/seed/down`，backend port 8280、vite port 3280，與使用者 8198/3198 無關，
執行前後 `lsof -i :8198 -i :3198` 確認使用者本機開發環境全程未被影響；測試完畢已正常 `down` 回收。
未使用 `stash`/`reset`/`checkout`。

## 範圍確認
- 未修改 `ChecklistSnapshotModal.tsx`、`ChecklistPrintTemplate.tsx`（ITP 的列印模板）、任何後端
  檔案。
- 未操作使用者 8198/3198 或開發資料庫。
- 未 commit／push／部署。
- REVIEW.md 留待獨立審查。
````

## REVIEW.md（逐字，封存時仍待審）

````markdown
# REVIEW.md — 獨立審查

TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-006
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-005
審查日期：待審

## EVIDENCE_CHECK
（待審）

## SCOPE_CHECK
（待審）

## DECISIONS_CHECK
（待審）

## VERDICT
- [ ] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
（待審）

## NEXT_STEP
（待審）
````
