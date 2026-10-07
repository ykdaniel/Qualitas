# ITR-INPUT-UX-IMPLEMENT-2026-005 — 封存（TASK / STATUS / REVIEW 逐字快照，封存時尚未審查）

封存日期：2026-10-05。本輪在獨立審查完成前先封存，使用者發現列印出來完全沒有 Checklist
測試結果與項目，繼續下一批（ITR-INPUT-UX-IMPLEMENT-2026-006）。REVIEW.md 封存時仍是待審空白
模板。

## TASK.md（逐字）

````markdown
# TASK.md — Related ITP 列印預覽同步顯示即時推導值

TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-005
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-004

## 狀態
已交辦，Claude 執行中。使用者從「還有什麼需要改」的清單裡選了「1. Related ITP 列印預覽」。

## 範圍
round 003 把 ITR 主表單的 Related ITP 改成「從連結的 NOI 即時推導顯示」，但當時明確記錄的已知限制
是：`ITRPrintPreview`（列印預覽，獨立元件）沒有拿到 `noiList`/`itpList`，列印出來的 Related ITP
欄位仍讀取舊的死欄位 `displayData.itpNo`，對任何正常建立的新記錄幾乎都是空的。本批把這個限制補上。

## PRECHECK
- `ITRModals.tsx` 的 `relatedItp`（`useMemo`，依 `formData.noiNumber`／`noiList`／`itpList`
  計算）在 round 003 已經存在，本批直接重用，不需要重新計算邏輯。
- `ITRPrintPreview` 是獨立元件（`export const ITRPrintPreview: React.FC<ITRPrintPreviewProps>`，
  約 1372 行），透過 `data: ITRDetailData` prop 接收資料，渲染時讀 `displayData.itpNo`
  （約 1385 行附近的表格列）。`ITRDetailData` 介面本來就已經有 `itpNo: string` 這個欄位
  （round 003 刻意保留，供列印 fallback 用），不需要新增型別欄位。
- 呼叫端（`ITRModals.tsx` 約 629-636 行）：
  ```
  if (showPrintPreview) {
      return (
          <ITRPrintPreview
              data={{ ...formData, linkedChecklists: instances }}
              onClose={() => setShowPrintPreview(false)}
          />
      );
  }
  ```
  `formData.itpNo` 本身是 round 003 保留下來、已經不會再被寫入的死欄位（NOI 選取 handler 已經移除
  了 `handleFieldChange('itpNo', ...)` 這行）。

## SCOPE
在 `data={{ ...formData, linkedChecklists: instances }}` 這個物件字面量裡，把 `itpNo` 欄位
**覆寫**成 `relatedItp ? (relatedItp.referenceNo || relatedItp.description || '') : ''`——與畫面上
唯讀欄位顯示的邏輯完全一致（同一個 `relatedItp` 計算結果，不重新計算一次）。`ITRPrintPreview`
元件本身**不需要修改**——它已經讀 `displayData.itpNo`，只要呼叫端傳進去的值是對的，列印就會對。
不新增任何 props、不傳 `noiList`/`itpList` 進 `ITRPrintPreview`（維持它是自包含、不依賴這兩份
清單的元件）。

## ALLOWED_PATHS
- `react-app/src/components/ITR/ITRModals.tsx`
- `react-app/tests-browser/`（驗收腳本）
- `docs/workflow/`
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- `ITRPrintPreview` 元件本身的渲染邏輯（除了這次呼叫端傳入值的那一行以外，元件內部不動）。
- `ChecklistSnapshotModal.tsx`、`Checklist.tsx`、`ChecklistPrintTemplate.tsx`、任何後端檔案。
- 開發資料庫、使用者 8198/3198、`stash`/`reset`/`checkout`。
- commit／push／部署。

## ACCEPTANCE_CRITERIA
1. 選定 NOI（且該 NOI 有關聯 ITP）的 ITR，點 Print 開啟列印預覽，Related ITP 那一列顯示真實的 ITP
   編號，不是空白。
2. 列印預覽顯示的值與主表單畫面上唯讀欄位顯示的值**一致**（同一個 `relatedItp` 來源）。
3. 沒有連結 NOI，或連結的 NOI 沒有關聯 ITP 時，列印預覽該欄位顯示空白（不是報錯或顯示
   undefined/null 字樣）。
4. `npx tsc --noEmit` 無錯誤；`npm run lint` 基線不變。
5. 獨立隔離環境真實瀏覽器驗證；未操作使用者 8198/3198；未 commit/push/部署；REVIEW.md 留待獨立
   審查。
````

## STATUS.md（逐字）

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-005
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-004

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪變更範圍
只修改 `react-app/src/components/ITR/ITRModals.tsx` 一處：在觸發 `ITRPrintPreview` 的呼叫點，把
傳入的 `itpNo` 欄位覆寫成 round 003 已經算好的 `relatedItp`（同一個 `useMemo`，依
`formData.noiNumber`／`noiList`／`itpList` 從連結的 NOI 即時推導出 ITP）。`ITRPrintPreview` 元件
本身**完全沒有修改**——它本來就讀 `displayData.itpNo`，只要呼叫端傳進去的值是對的，列印就對了，
不需要把 `noiList`/`itpList` 這兩份清單一起傳進那個原本自包含的元件。

新增驗收腳本 `react-app/tests-browser/itr-input-ux-implement5-review.mjs`。

## 實測（隔離環境，真實瀏覽器）
```
4 checks executed, 4 PASS, 0 FAIL
```
- `pre1`：確認畫面上 Related ITP 顯示 `QTS-IUX2-ITP-000001`。
- `print1`：點 Print 開啟列印預覽，Related ITP 那一列的值與畫面上**逐字相等**。
- `print2`：另外新增一筆未儲存、沒有連結 NOI 的 ITR，列印預覽該欄位正確顯示佔位符「-」。
- `print3`：確認沒有洩漏 `undefined`/`null` 字樣到列印畫面（這是檢查「沒有關聯值時好好處理空值」
  而不是順手把 JS 的 falsy 值字串化印出來）。

截圖：`docs/workflow/ITR-INPUT-UX-IMPLEMENT-2026-005-evidence/print-preview-related-itp.png`
（可見 Related ITP 列正確顯示 `QTS-IUX2-ITP-000001`）。

## 前端檢查
- `npx tsc --noEmit`：無錯誤。
- `npm run lint`：13 errors / 21 warnings，基線不變。
- `npm run build`／既有單元測試套件：本批未重跑——單行值覆寫，範圍極小。

## 隔離環境
`isolated_stack.py up/seed/down`，backend port 8280、vite port 3280，與使用者 8198/3198 無關，
執行前後 `lsof -i :8198 -i :3198` 確認使用者本機開發環境全程未被影響；測試完畢已正常 `down` 回收。
未使用 `stash`/`reset`/`checkout`。

## 範圍確認
- 未修改 `ITRPrintPreview` 元件本身的渲染邏輯。
- 未操作使用者 8198/3198 或開發資料庫。
- 未 commit／push／部署。
- REVIEW.md 留待獨立審查。

至此，ITR-INPUT-UX-2026-001 當初盤點出的四項（Situation、附件排序/收合、NOI 來源分組、Related
ITP）全部處理完畢，含這次補上的列印預覽同步；僅剩 `itr.relatedITP`/`itr.selectITP` 既有中文翻譯
缺口未補（刻意排除在範圍外）。
````

## REVIEW.md（逐字，封存時仍待審）

````markdown
# REVIEW.md — 獨立審查

TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-005
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-004
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
