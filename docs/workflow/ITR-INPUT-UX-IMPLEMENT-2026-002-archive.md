# ITR-INPUT-UX-IMPLEMENT-2026-002 — 封存（TASK / STATUS / REVIEW 逐字快照，封存時尚未審查）

封存日期：2026-10-04。**本輪在獨立審查完成前就先封存**——使用者已確認要開下一批
（ITR-INPUT-UX-IMPLEMENT-2026-003），選擇不等 002 審查結果，先把 002 的 TASK/STATUS 原樣封存，
REVIEW.md 封存時仍是待審空白模板，尚未有 VERDICT。獨立審查者之後若要審查本輪，請直接審查這份
封存檔內的 TASK/STATUS 內容（對應程式碼狀態：ChecklistSnapshotModal.tsx／
ChecklistResultControls.tsx 在本輪未被修改，與 ITR-INPUT-UX-IMPLEMENT-2026-001 封存時的版本相同；
本輪只改了 itr-input-ux-implement-review.mjs 與 DECISIONS.md）。

## TASK.md（逐字）

````markdown
# TASK.md — ITR 內嵌 Checklist Situation：R1/R2/R3 補正

TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-002
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-001

## 狀態
已交辦，Claude 執行中。只處理上一輪 REVIEW 的 R1、R2、R3。

## 重要前提：R1 範圍已在本次對話中與使用者確認並改變
上一輪 REVIEW 的 R1 原文要求「375px 下讓每個項目的 Situation 與 Result 能完整放進可視內容區；可採
項目卡片或該項目的全寬編輯列」。本輪開始前，已在對話中與使用者過了兩個視覺方案（卡片式、連續清單式
堆疊），**使用者兩個都明確拒絕**，指示「不要做成卡片，因為這不符合實際使用以及閱讀」「保持原本的」
——即維持 `ChecklistSnapshotModal.tsx` 現有的 `# / Item / Criteria / Situation / Result` 五欄表格
結構，不拆成堆疊欄位。追問「375px 下要怎麼處理『完整放進可視範圍』這個 R1 要求」，使用者選擇
「接受表格內橫向捲動（現狀）」。

這個決定已記錄為 `DECISIONS.md` 的新條目（2026-10-04，標題「ITR 內嵌 Checklist 表格窄螢幕排版：
保留橫向捲動，不拆成堆疊/卡片」）。**R1 因此不是版面改動任務，是驗證方法修正任務**——R1 原文本身
也沒有強制要求移除橫向捲動，只要求「不可只用 isVisible 或整頁 scrollWidth」「以實際外框/裁切容器
幾何及互動證明可點選結果、填寫 Situation、操作該 Checklist 保存」。本輪用真實互動（捲動進表格、
填寫、點擊 Result、存檔）取代原本過於寬鬆的 `isVisible()` 斷言，不改動任何產品版面程式碼。

## REQUIRED_FIXES（逐字沿用上一輪 REVIEW 原文，不得自行弱化）

### R1 — 窄螢幕填寫版面（產品與驗證）
375px 下讓每個項目的 Situation 與 Result 能完整放進可視內容區；可採項目卡片或該項目的全寬編輯列，
Item/Criteria 同項保留供對照。桌面維持目前方向。不要求重排 ITR 主表單。以實際外框/裁切容器幾何及
互動證明可點選結果、填寫 Situation、操作該 Checklist 保存；不可只用 isVisible 或整頁 scrollWidth。
留下能看清文字開頭、欄位和結果選項的截圖。

**本批處理方式（經使用者確認的範圍調整，見上方前提）**：不實作卡片/堆疊版面（使用者已否決）；改為
在既有的表格橫向捲動設計下，用真實互動（捲動進表格容器、驗證元素在捲動後落在容器可視範圍內、實際
填寫 Situation、點擊 Result、觸發存檔）取代 `isVisible()`/整頁 `scrollWidth` 這類不足以證明可用性的
斷言，並留存「捲動前只看到 Item/Criteria」「捲動後看到 Situation/Result 且可操作」的對照截圖。

### R2 — 補齊已有流程的精確證據
保存與失敗後重試都等目標 Checklist id 的 PUT，讀 response body 核對該 id 與 Situation 完整字串；
若契約不回傳內容，如實記錄並改用獨立 GET。保留已有 fresh-context 精確重讀，重試後也核對持久化值。
鎖定顯示改為與已知種子字串完整相等，確認文字可選取及 Result controls 停用，將證據限縮為實測的 UI
保護，不宣稱全面授權測試。無需另做後端權限測試。

**PRECHECK 已確認**：`PUT /checklist/{id}/` 的 `response_model=schemas.Checklist`
（`backend/routers/checklist.py:86`），`schemas.ChecklistBase` 含 `detail_data: str | None`
（`backend/schemas.py:1222`）——**回應本身就會回傳完整的 `id` 與 `detail_data`**，不需要額外的
獨立 GET；直接在 save1/fail3 解析 response body 的 JSON，核對 `body.id` 等於目標 checklist id、
`JSON.parse(body.detail_data).items[0].situation` 與送出的字串逐字相等即可。

### R3 — 文件精確化（不另跑測試）
列明 seed 修改；移除「Checklist 窄版排列不在範圍」及未實測的全面保護宣稱。lint 明列仍失敗且改動檔未
列入報錯，不把數字相同當作完整歸因證據。保留本輪未跑 build/unit 的揭露。

## SCOPE
1. **R1（純測試修正，不改產品）**：重寫 `itr-input-ux-implement-review.mjs` 的 Scenario E：
   - 用 `page.evaluate` 或 locator 操作把 Items 表格自己的 `.overflow-x-auto` 容器 `scrollLeft`
     捲動到能看到 Situation 欄，**斷言捲動前後的差異**（捲動前 Situation textarea 的
     `boundingBox()` x 座標在容器可視範圍外或被裁切，捲動後落在容器可視範圍內）。
   - 捲動後，對該欄位做真實互動：`fill()` 一段新文字、點擊一個 Result 按鈕、點擊 Save、等待 PUT
     成功——證明的是「使用者真的能在 375px 操作完整流程」，不是「DOM 存在且沒有 display:none」。
   - 捲動前、捲動後各留一張截圖（捲動前只看到 `#/Item/Criteria`，捲動後看到 Situation 欄位開頭文字
     與 Result 選項）。
   - 移除/替換掉舊版只憑 `isVisible()` 與整頁 `scrollWidth` 的 narrow2/narrow3 斷言，改成上述真實
     互動斷言。整頁 `scrollWidth <= clientWidth`（narrow1，確認不是整頁溢出）維持，因為這部分本來
     就成立且與 R1 無關的部分不需重做。
2. **R2（純測試修正，不改產品）**：
   - save1：`await saveResponse.json()`，斷言 `body.id === 'IUX2-CKT1'`，
     `JSON.parse(body.detail_data).items.find(i => i.id === '1').situation === NEW_SITUATION`
     （完整逐字相等）。
   - fail3（重試成功後）：同樣解析 response body 核對 id 與 situation 完整字串；**新增**：重試成功
     後，用全新 context 重新打開同一筆 ITR，核對重試送出的 `RETRY_SITUATION` 真的持久化到資料庫
     （不只是這次回應裡有，先前的 round 001 只驗到 response，沒驗到這次重試之後的持久化重讀）。
   - locked3：改成與種子腳本裡 `LONG_SITUATION_2` 常數逐字 `===` 比較（不是 `includes(marker)`），
     在審閱腳本裡重新宣告同一個常數字串（附註明來源是 `seed_itr_input_ux_review.py`，兩邊要保持
     一致，不是各自猜測）。
   - 新增 `locked_selectable`：用 `page.evaluate` 對該 `<div>` 建立一個 `Range` 並
     `window.getSelection()` 實際選取文字，斷言 `getSelection().toString()` 的長度大於 0 且包含
     已知子字串——這才是「文字可選取」的直接證明，不是只看 tagName。
   - 新增 `locked_result_disabled`：斷言該筆鎖定 item 的全部 4 個 `[data-result-option]` 按鈕都帶有
     真實的 HTML `disabled` 屬性（`ChecklistResultControls.tsx` 的 `ResultSelect` 已經會把
     `disabled={locked}` 傳給每個 `<button>`，本輪只是把這個既有行為納入斷言，不改程式碼）。
   - 移除「沒有 Save 按鈕＝沒有任何 PUT 路徑」這種過度推論的措辭（STATUS.md 文字修正，不是程式碼
     修正）——改為「本輪實測確認的 UI 層保護：沒有 Save 按鈕、Result 按鈕皆 disabled」，不宣稱涵蓋
     所有可能的繞過路徑或後端授權測試。
3. **R3（純文件修正，不重跑產品相關測試）**：
   - STATUS.md 明確列出 `seed_itr_input_ux_review.py` 的本輪異動（新增第二個 checklist item）屬於
     測試資產修改，不要用「只改了一個產品檔案」這種語句覆蓋掉這個事實。
   - 移除／更正任何暗示「Checklist 窄版排列不在這批範圍內」的措辭——它明明就是 R1 的對象。
   - lint 段落明確寫「這 13 errors / 21 warnings 目前仍未修，是既有基線，不是本輪待辦」，不要讓
     「本次修改的檔案沒有新增 lint 問題」這句話讀起來像是在暗示專案 lint 狀況跟這輪改動有因果關係
     上的完整歸因證明——它只證明了「這個檔案」沒有新增問題，不是更廣的宣稱。
   - 保留「本輪未跑 build/unit test」的既有揭露，不刪除。
4. **本批預期完全不修改任何產品程式碼**——`ChecklistSnapshotModal.tsx`、`ChecklistResultControls.tsx`
   維持 round 001 實作的版本不變。若驗證過程中意外發現真的有產品缺陷（非常不預期），僅限最小修正，
   且必須先在 STATUS 說明原因再動手。

## ALLOWED_PATHS
- `react-app/tests-browser/itr-input-ux-implement-review.mjs`（R1/R2 的驗證邏輯修正）
- `backend/scripts/verification/seed_itr_input_ux_review.py`（僅限需要時微調測資，預期不需要）
- `docs/workflow/`（本輪 handoff／evidence；上一輪 archive 已建立）
- `DECISIONS.md`（已在本輪開始前新增一條，見上方前提）
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- `react-app/src/components/ITR/ChecklistSnapshotModal.tsx`、
  `react-app/src/components/Checklist/ChecklistResultControls.tsx`——round 001 已實作的版本維持
  不變，本輪不改版面、不改任何渲染邏輯（R1 已改為純驗證任務，見上方前提）。
- `react-app/src/components/ITR/ITRModals.tsx`、`Checklist.tsx`、`ChecklistPrintTemplate.tsx`、
  任何後端檔案——與上一輪相同，不在範圍內。
- 已通過的 14 項既有斷言（exact1/exact2、cancel1/cancel2、save2、pre1、fill1 等）——不得重新設計，
  只能因為程式碼結構調整而連帶微調不涉及邏輯變更的部分。
- 開發資料庫、使用者 8198/3198、`stash`/`reset`/`checkout`。
- commit／push／部署。

## ACCEPTANCE_CRITERIA
1. R1：腳本證明 375px 下使用者能透過表格自身的橫向捲動，真正完成「捲動→找到 Situation→填寫→
   點擊 Result→存檔成功」整個流程，並非只憑 `isVisible()`/整頁 `scrollWidth`；捲動前後對照截圖。
2. R2：save1／fail3 直接核對 PUT response body 的 `id` 與 `situation` 完整字串；重試成功後新增
   fresh-context 重讀核對持久化；locked3 改為與已知種子字串完整相等；新增可選取文字與 Result
   按鈕 disabled 的直接證明。
3. R3：STATUS.md 如實列出 seed 腳本異動、移除「窄版排列不在範圍」的錯誤措辭、lint 段落語意精確化、
   保留未跑 build/unit 的揭露。
4. 未修改任何產品程式碼（FORBIDDEN_PATHS 列出的檔案均不變）。
5. 未操作使用者 8198/3198 或開發資料庫；未 commit/push/部署；REVIEW.md 留待獨立審查。

## CLAUDE_PRECHECK
1. 已讀上一輪 archive（`docs/workflow/ITR-INPUT-UX-IMPLEMENT-2026-001-archive.md`），理解 R1/R2/R3
   的具體要求與上一輪已接受的 14 項既有斷言範圍邊界。
2. 已與使用者在本次對話中確認 R1 的範圍調整（拒絕卡片／堆疊版面，接受表格內橫向捲動），並已寫入
   `DECISIONS.md`。
3. 已讀 `backend/routers/checklist.py:86`／`backend/schemas.py:1222` 確認 PUT 回應會回傳完整
   `id`／`detail_data`，R2 不需要額外 GET。
4. 已讀 `ChecklistResultControls.tsx` 確認 `ResultSelect` 的每個按鈕都有
   `data-result-option`／`disabled={disabled}`，R2 的 Result-disabled 斷言可直接查詢既有 DOM
   屬性，不需要新增任何 `data-*` 標記。
````

## STATUS.md（逐字）

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-002
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-001

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪變更範圍
**未修改任何產品程式碼**——`ChecklistSnapshotModal.tsx`、`ChecklistResultControls.tsx` 維持上一輪
實作的版本，完全不動。只修改了驗證腳本
`react-app/tests-browser/itr-input-ux-implement-review.mjs`。

**測試資產異動需在此如實列出，不得用「只改測試腳本」這種籠統說法蓋過去**：上一輪
（ITR-INPUT-UX-IMPLEMENT-2026-001）已經在 `backend/scripts/verification/seed_itr_input_ux_review.py`
加了第二個 checklist item（用於驗證「未編輯項目維持原值」）；本輪**沒有再變更**這支 seed 腳本，直接
沿用上一輪的版本。

另外新增了一條 `DECISIONS.md` 條目（2026-10-04，「ITR 內嵌 Checklist 表格窄螢幕排版：保留橫向捲動，
不拆成堆疊/卡片」）——這不是程式碼變更，是把本次對話中使用者明確做出的設計決定記錄下來，避免未來
被誤判為缺陷重新提出。

## R1 — 窄螢幕版面：範圍已由使用者確認調整（非程式碼缺陷）
上一輪 REVIEW 的 R1 要求「375px 下讓每個項目的 Situation 與 Result 能完整放進可視內容區；可採項目
卡片或該項目的全寬編輯列」。本輪開始前，已在對話中向使用者展示「卡片式」「連續清單堆疊式」兩種視覺
方案，**使用者明確拒絕兩者**："不要做成卡片，因為這不符合實際使用以及閱讀""保持原本的"，並在後續
選項中選擇「接受表格內橫向捲動（現狀）」。

這代表 R1 的產品面要求已由使用者重新定義：**不要求移除橫向捲動**，維持現有 `# / Item / Criteria /
Situation / Result` 五欄表格。R1 剩下的、真正屬於本批工作範圍的部分，是它原文裡本來就有的另一半：
「以實際外框/裁切容器幾何及互動證明可點選結果、填寫 Situation、操作該 Checklist 保存；不可只用
isVisible 或整頁 scrollWidth」——這是**驗證方法**的要求，不是版面的要求，本輪把這部分做完整了。

### 本輪新增的 narrow3/4/5/6/7/8/9 實測（取代舊版過於寬鬆的 narrow2/narrow3）
- `narrow3`：**捲動前**，用 `boundingBox()` 的真實座標確認 Situation textarea 確實在表格可視框
  之外（`textarea x=292.8`，框右緣在 `295`，幾乎貼齊框緣——這才是「看不到」的真實幾何證明，不是
  猜測）。
- 用 Playwright 的 `scrollIntoViewIfNeeded()`（捲動該欄位所在的捲動容器，等同使用者在表格框內
  橫向滑動的真實效果）捲動表格自己的容器——**不是整頁捲動**。
- `narrow4`：**捲動後**，再次用 `boundingBox()` 確認 Situation textarea 的座標確實落在表格可視框
  範圍內（`textarea x=79.8`，框範圍 `[80, 295]`）。
- `narrow5`〜`narrow9`：捲動後做**真實互動**——實際 `fill()` 一段含換行的新文字、點擊 Pass 按鈕
  （確認 `aria-checked` 真的變成 `true`，不是只確認按鈕存在）、點擊 Save、等待 PUT 200——證明的是
  「使用者在 375px 真的能走完整個填寫流程」，不是「元素沒有被 `display:none`」。

對照截圖：`narrow-375-before-scroll.png`（只看得到 `#/Item/Criteria`）、
`narrow-375-after-scroll.png`（捲動後看到 `Situation` 欄位標題與文字內容）。

**本輪移除的舊版斷言**：原本的 `narrow2`（`isVisible()`）、`narrow3`（整頁 `scrollWidth`，現在變成
新版的 `narrow1`，語意不變但措辭更精確地寫明「只確認頁面本身不橫向溢出，捲動本來就在表格框內」）。

## R2 — 補齊已有流程的精確證據
- **save1b/save1c**（新增）：`PUT /checklist/{id}/` 的 `response_model=schemas.Checklist` 會回傳
  完整的 `id` 與 `detail_data`（已讀 `backend/routers/checklist.py:86`／
  `backend/schemas.py:1222` 確認），不需要額外 GET。直接解析 response body 的 JSON，核對
  `body.id === 'IUX2-CKT1'` 且 `JSON.parse(body.detail_data).items` 裡 id=1 的 `situation` 與
  送出的字串逐字相等。
- **fail3b/fail3c**（新增）：重試成功後的 PUT response body 同樣核對到位。
- **fail5**（新增）：重試成功後，額外用**全新瀏覽器 context** 重新打開同一筆 ITR，確認
  `RETRY_SITUATION` 真的持久化到資料庫——上一輪只驗到「這次回應是 200」，沒有驗到「重試這次存的
  值真的留下來了」，這次補上。
- **locked3**：從 `includes(marker)` 子字串比對，改成與 seed 腳本裡 `LONG_SITUATION_2` 常數（在
  審閱腳本裡逐字複製一份，附註明來源需手動保持同步）做完整 `===` 比較。
- **locked_selectable**（新增）：不再只憑 `tagName === 'DIV'` 推論「可選取」，改成用
  `document.createRange()` + `window.getSelection()` 對該元素實際建立選取範圍，讀
  `getSelection().toString()` 確認真的選到了完整文字。
- **locked_result1/locked_result2**（新增）：直接查詢鎖定列的 4 個 `[data-result-option]` 按鈕，
  確認每一個都帶有真實的 HTML `disabled` 屬性（`ChecklistResultControls.tsx` 的 `ResultSelect`
  本來就會傳 `disabled={locked}`，本輪只是把這個既有行為納入斷言，不是新增產品邏輯）。
- **locked6 措辭修正**：原本寫「沒有 Save 按鈕＝沒有任何 PUT 路徑」這種過度推論，改成「本輪實測
  確認的 UI 層保護：沒有 Save 按鈕、Result 按鈕皆 disabled」，**不宣稱**涵蓋所有可能的繞過路徑或
  後端授權測試（後端授權本來就不在本批範圍內，上一輪 REVIEW 也明確說「無需另做後端權限測試」）。

## R3 — 文件精確化
已反映在本文件：
- 明確列出 seed 腳本異動屬於測試資產修改（上方「本輪變更範圍」段落），不用「只改了一個產品檔案」
  這種語句蓋過去。
- 不再有任何「Checklist 窄版排列不在範圍」的措辭——它就是 R1 的對象，只是範圍由使用者重新定義為
  「驗證方法修正」而非「版面重寫」。
- lint 段落（見下方）明確寫「這是既有基線，本輪未修，不是本輪待辦」。

## 實測結果
隔離環境（`isolated_stack.py up --port 8280 --vite-port 3280`，與使用者 8198/3198 無關，執行前後
`lsof` 確認未受影響），沿用上一輪的 seed（`seed_itr_input_ux_review.py`，本輪未變更）：

```
35 checks executed, 35 PASS, 0 FAIL
```

全文見 `docs/workflow/ITR-INPUT-UX-IMPLEMENT-2026-002-evidence/run.log`。上一輪 21 項既有斷言全部
沿用、邏輯未重寫（只有 narrow 區塊因 R1 重做、locked3/新增 locked_selectable/locked_result 因 R2
重寫，其餘 pre1/fill1/save1/save2/exact1/exact2/cancel1/cancel2/locked1/locked2/locked4/locked5/
fail1/fail2/fail4 維持原樣），本輪新增 14 項斷言（save1b/c、narrow3-9 共 7 項取代舊 2 項等於淨增
5 項、locked_selectable、locked_result1/2、fail3b/c、fail5），總數從 21 增至 35。

截圖：`desktop-after-save-reopen.png`、`desktop-locked-readonly.png`（與上一輪相同，桌面版面未變不
重拍）、`narrow-375-before-scroll.png`、`narrow-375-after-scroll.png`（本輪新拍，取代舊版
`narrow-375-edit-panel.png`）。

## 前端檢查
- `npx tsc --noEmit`：整個前端，無任何錯誤（本輪未改任何 `.ts`/`.tsx` 檔案，純粹是重新確認沒有
  因為其他並行工作而產生型別錯誤）。
- `npm run lint`：**這是既有基線，本輪未修，不是本輪待辦**——13 errors / 21 warnings，與上一輪
  記載的數字相同；本輪沒有修改任何會被 lint 掃到的檔案（只改了 `tests-browser/*.mjs`，不在 lint
  掃描範圍內），這個「數字沒變」只能證明「這次沒有新增」，不是「專案 lint 已經處理過」的證據。
- `npm run build`／既有單元測試套件：本批未重跑——本輪完全沒有修改任何產品程式碼，依 SOURCE
  TASK（round 001）TASK.md 第 4 點與本輪 TASK.md 第 4 點的既有約定，不要求重跑。

## 隔離環境
`isolated_stack.py up/seed/down`，backend port 8280、vite port 3280，與使用者 8198/3198 無關，
執行前後 `lsof -i :8198 -i :3198` 確認使用者本機開發環境全程未被影響；測試完畢已正常 `down` 回收。
未使用 `stash`/`reset`/`checkout`。

## 範圍確認
- 未修改 FORBIDDEN_PATHS 列出的任何檔案（`ChecklistSnapshotModal.tsx`、
  `ChecklistResultControls.tsx`、`ITRModals.tsx`、`Checklist.tsx`、`ChecklistPrintTemplate.tsx`、
  後端任何檔案）。
- 未操作使用者 8198/3198 或開發資料庫。
- 未 commit／push／部署。
- REVIEW.md 留待獨立審查。
````

## REVIEW.md（逐字，封存時仍待審）

````markdown
# REVIEW.md — 獨立審查

TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-002
SOURCE_TASK_ID: ITR-INPUT-UX-IMPLEMENT-2026-001
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
