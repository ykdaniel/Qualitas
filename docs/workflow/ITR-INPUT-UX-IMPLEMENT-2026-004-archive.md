# ITR-INPUT-UX-IMPLEMENT-2026-004 — 封存（TASK / STATUS / REVIEW 逐字快照，封存時尚未審查）

封存日期：2026-10-04。本輪在獨立審查完成前先封存，使用者挑選「Related ITP 列印預覽」繼續下一批
（ITR-INPUT-UX-IMPLEMENT-2026-005）。REVIEW.md 封存時仍是待審空白模板。

## TASK.md（逐字）

````markdown
# TASK.md — Checklist 快照面板（鎖定狀態）呈現優化

TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-004
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-003

## 狀態
已交辦，Claude 執行中。使用者看過鎖定（ITR Approved）狀態下 Checklist 快照面板的實際畫面後，在對話中
主動詢問「這部分還可以怎麼做比較好」，我提出兩項低風險建議，使用者回覆「好」確認要做。

## 範圍（使用者確認的兩項）
1. 鎖定狀態下的 Checklist 快照面板，預設直接開在「Checklist Items」分頁，不要停在「General
   Information」——鎖定記錄的 Reference no./Activity 在外層摺疊列已經看得到，使用者通常是要查
   Situation/Result。
2. 鎖定狀態下的兩段提示文字（「這是一份快照唯讀畫面」＋「因為 ITR 已核准而鎖定」）合併成一個提示框，
   不要用兩個橫幅疊在一起佔掉可視空間。

## PRECHECK
- 唯一要修改的檔案：`react-app/src/components/ITR/ChecklistSnapshotModal.tsx`——round 001 已經改過
  Situation 欄位渲染方式，這次只動初始分頁狀態與提示橫幅的 JSX，不動任何資料/驗證/保存邏輯。
- `activeTab` 原本固定初始化為 `'general'`；改成 `readOnly ? 'items' : 'general'`——`readOnly`
  prop 是 `ITRModals.tsx` 傳入的，對應 ITR 本身 Approved/Void 鎖定（不是 Checklist 自己的
  Pass/Fail closed 狀態，那個是另一個獨立的 `closed` 變數，用在 Reopen 提示區塊，這次不動）。
- 原本兩個橫幅：(1) 永遠顯示的藍色「viewing snapshot」提示（文字依 edit/view 不同）；(2) 只在
  `readOnly` 時顯示的黃色「locked because...」提示。這次把這兩個在 `readOnly` 為真時合併成一個
  黃色橫幅（文案直接複用既有的兩個翻譯鍵接在一起，不新增翻譯鍵）；`readOnly` 為假時維持原本的藍色
  橫幅不變。`closed` 狀態的第三個橫幅（含 Reopen 按鈕/確認流程，功能完整獨立）完全不動。

## SCOPE
1. `const [activeTab, setActiveTab] = useState<'general' | 'items'>(readOnly ? 'items' : 'general');`
2. 把原本「永遠顯示的藍色橫幅」+「`readOnly` 時額外顯示的黃色橫幅」改成條件式：`readOnly` 為真時
   只顯示一個合併後的黃色橫幅（含 Lock icon，文字是 snapshot 說明 + 鎖定原因）；`readOnly` 為假時
   維持原本的藍色橫幅。
3. 不新增任何翻譯鍵、不新增 state、不改變 `closed`/Reopen 相關邏輯、不改 Save/Cancel/Result 判定。

## ALLOWED_PATHS
- `react-app/src/components/ITR/ChecklistSnapshotModal.tsx`
- `react-app/tests-browser/`（新建驗收腳本）
- `docs/workflow/`
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- `react-app/src/components/ITR/ITRModals.tsx`、`Checklist.tsx`、`ChecklistPrintTemplate.tsx`、
  `ChecklistResultControls.tsx`——round 001/003 已完成版本維持不變。
- `closed`/Reopen 相關的第三個橫幅區塊與其按鈕邏輯——完全不動。
- 任何後端檔案、`utils/checklistResult.ts` 判定邏輯。
- 開發資料庫、使用者 8198/3198、`stash`/`reset`/`checkout`。
- commit／push／部署。

## ACCEPTANCE_CRITERIA
1. 鎖定（ITR Approved/Void）狀態下開啟 Checklist 快照，預設分頁是「Checklist Items」，Result 欄位
   在不額外點擊的情況下就看得到。
2. 鎖定狀態下只看到一個提示橫幅（合併後），不是兩個疊在一起；未鎖定狀態的藍色橫幅維持原樣不變。
3. `npx tsc --noEmit` 無錯誤；`npm run lint` 基線不變（13 errors/21 warnings）。
4. 使用獨立隔離環境以真實瀏覽器**唯讀互動**驗證（只點擊checklist列、讀取畫面內容，不點擊
   Revoke Approval 或任何會改變資料狀態的按鈕）。
5. 未操作使用者 8198/3198 或開發資料庫；未 commit/push/部署；REVIEW.md 留待獨立審查。
````

## STATUS.md（逐字）

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-004
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-003

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪變更範圍
只修改 `react-app/src/components/ITR/ChecklistSnapshotModal.tsx`，兩處改動：
1. `activeTab` 初始狀態從固定 `'general'` 改成 `readOnly ? 'items' : 'general'`——鎖定（ITR
   Approved/Void）時直接開在「Checklist Items」分頁。
2. `readOnly` 為真時，原本疊在一起的「viewing snapshot」藍色橫幅＋「locked because...」黃色橫幅，
   合併成一個黃色橫幅（文案直接接續既有兩個翻譯鍵的內容，**未新增任何翻譯鍵**）；`readOnly` 為假時
   維持原本的藍色橫幅不變；`closed`/Reopen 相關的第三個橫幅區塊完全沒有動。

新增驗收腳本 `react-app/tests-browser/itr-input-ux-implement4-review.mjs`。

## 實測（隔離環境，唯讀互動，不點擊任何會變更資料的按鈕）
```
7 checks executed, 7 PASS, 0 FAIL
```
- `pre1`：確認測試用的 ITR2 開啟時是「View ITR」（鎖定/Approved），不是「Edit ITR」。
- `default-tab1`/`default-tab2`：確認開啟 Checklist 快照後，「Checklist Items」分頁預設是 active
  的（有 `border-blue-600` class），「General Information」不是。
- `default-tab3`：確認不用再點一次分頁，Result 欄位的表格就已經在畫面上。
- `banner1`/`banner2`：確認鎖定狀態下不再有獨立的藍色橫幅，只有一個黃色橫幅。
- `banner3`：合併後的橫幅文字讀出來是
  「You are viewing the snapshot...It is read-only right now...— Locked — the parent ITR is
  Approved, so this record is read-only. An ITR-approve permission holder must revoke the
  approval first before it can be edited.」——兩段原本的說明文字都還在，只是合併成一個框。

截圖：`docs/workflow/ITR-INPUT-UX-IMPLEMENT-2026-004-evidence/locked-default-items-tab-merged-
banner.png`。

## 一個題外插曲（誠實記錄，與本輪程式碼改動無關）
驗證過程中，**上一個**隔離環境（非本輪最終使用的那個）裡的 ITR2 記錄，在我沒有主動點擊
「Revoke Approval」的情況下，狀態從 Approved 變成了 In Progress（透過該堆疊自己的
`uvicorn.out` 存取記錄查到確實有一筆 `POST /api/itr/IUX2-ITR2/revoke-approval` 200 OK 的請求，
但不是我的驗收腳本或我手動下的指令發出的）。懷疑是某個會在我編輯檔案後自動操作瀏覽器畫面的機制
（PostToolUse hook 的「verification_workflow」）誤點到了那顆按鈕。這筆資料本身只存在於一次性的
隔離測試資料庫裡，與使用者的 8198/3198 無關，已經整組 `down` 銷毀，不影響任何真實資料；本輪最終
驗收用的是另一個全新的隔離堆疊，過程中沒有再出現同樣狀況。記錄下來是為了讓使用者知道這個現象，
不是本輪程式碼的缺陷。

## 前端檢查
- `npx tsc --noEmit`：無錯誤。
- `npm run lint`：13 errors / 21 warnings，基線不變，本輪修改的檔案未新增問題。
- `npm run build`／既有單元測試套件：本批未重跑——純 JSX 條件渲染調整，範圍極小。

## 隔離環境
`isolated_stack.py up/seed/down`，backend port 8280、vite port 3280，與使用者 8198/3198 無關，
執行前後 `lsof -i :8198 -i :3198` 確認使用者本機開發環境全程未被影響；測試完畢已正常 `down` 回收
（含上方插曲提到的那個先被銷毀重建的堆疊）。未使用 `stash`/`reset`/`checkout`。

## 範圍確認
- 未修改 FORBIDDEN_PATHS 列出的任何檔案。
- 未操作使用者 8198/3198 或開發資料庫。
- 未 commit／push／部署。
- REVIEW.md 留待獨立審查。
````

## REVIEW.md（逐字，封存時仍待審）

````markdown
# REVIEW.md — 獨立審查

TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-004
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-003
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
