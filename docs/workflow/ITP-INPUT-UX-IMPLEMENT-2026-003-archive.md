# ITP-INPUT-UX-IMPLEMENT-2026-003 — 封存（TASK / STATUS / REVIEW 逐字快照）

封存日期：2026-10-04。本輪 VERDICT：PASS，本系列結案，不另開 004。

## TASK.md（逐字）

````markdown
# TASK.md — ITP Inspection Plan：列印容器定位與複製來源嚴格比對補正

TASK_ID: ITP-INPUT-UX-IMPLEMENT-2026-003
SOURCE_TASK_ID: ITP-INPUT-UX-IMPLEMENT-2026-002
狀態：已交辦，待 Claude 執行。只處理 REVIEW.md 的 R1、R2，**都是驗證腳本本身
的定位/比對方式問題，不是產品程式碼問題**。產品版面、換行呈現修正（兩個
`whitespace-pre-line` 檔案）與八項完整保存逐字比對、取消不套用草稿驗證**皆
已接受，不重做**。

## REQUIRED_FIXES（逐字沿用審查原文，不得自行弱化）

### R1 — 列印驗證限定真正列印容器
printActivityDiv 使用全頁 div.filter({hasText: marker}).last()，fallback 更
退到 body；列表本來也有同一 marker 與 pre-line，因此可能完全沒驗到
ITPPrintTemplate。將定位限定到實際 printablePage/列印根節點，先確認根存在且
命中項目唯一，再比對完整 Activity/Criteria 文字與換行樣式。移除 body
fallback 與缺元素時跳過的成功路徑。可用 print media 或列印 DOM 驗證，不強求
原生系統列印視窗截圖；文件明列證據類型。

### R2 — 複製來源採完整相等比較
source1 目前是完整相等 OR 原字串含來源前 30 字元，後半段變動也能過。複製前
從來源編輯面板讀出 Activity EN/CH 完整 inputValue，保存重開後同欄完整 ===
比較，取消前 30 字元後援。不需重跑其他全部欄位。

## PRECHECK 已確認事項（既有基礎，不得重新調查）
- `docs/workflow/ITP-INPUT-UX-IMPLEMENT-2026-002-archive.md`（REVISE）：
  產品的兩處 `whitespace-pre-line` 修正、八項完整保存逐字比對（新增/複製/
  編輯的 Activity/Criteria EN/CH）、取消不套用草稿驗證**皆已接受，本批不
  重做、不重新驗證**。
- 已讀 `ITPModals.tsx:140-174,948-954` 確認「Print」的實際機制：點擊
  `handlePrint` 把 `isPrinting` 設為 `true`，觸發
  `ReactDOM.createPortal(<ITPPrintTemplate items={advancedItems}
  headerData={headerData} />, document.body)`——`ITPPrintTemplate` 是
  **直接掛載在 `document.body` 底下的獨立 DOM 子樹**（不在 Inspection Plan
  清單表格所在的那個元件樹裡），根元素是 `<div className={styles.
  printablePage}>`（`ITP.module.css` 的 CSS Module class，實際 class 名稱
  會被雜湊，不能直接用字面 `printablePage` 當 CSS selector）。掛載後
  100ms 呼叫 `window.print()`，`afterprint` 事件觸發後卸載（`isPrinting`
  設回 `false`）。
- `ITPPrintTemplate.tsx` 的表格標題固定是英文「Inspection & Test Plan」
  （`h1` 元素，`ITPPrintTemplate.tsx` 約第 25 行），這段文字**只存在於
  列印元件本身**，Inspection Plan 清單表格或其他畫面都沒有這段文字——可以
  當作「確實找到的是列印元件，不是清單」的可靠錨點，不依賴本輪測資裡的
  標記字串（標記字串本身在清單與列印都會出現，不能拿來分辨到底命中哪一個
  容器，這正是上一輪 R1 被抓到的問題）。
- `ITPPrintTemplate.tsx` 表格的欄位順序（無拖曳欄，與清單不同）：Event(0)、
  Activity(1)、Standard/Criteria(2)、Check Time(3)、Method(4)、Freq(5)、
  Record(6)、VP×4(7-10)——Activity 是每列的第 2 個 `<td>`（index 1，不是
  清單裡的 index 2）。
- 上一輪 `source1` 的斷言：
  `sourceAfter.en.trim() === sourceActivityBefore.trim() ||
  sourceActivityBefore.includes(sourceAfter.en.trim().slice(0, 30))` ——
  OR 的第二個分支只要求「複製後讀到的值的前 30 字元，出現在複製前記錄的
  完整字串裡」，這個條件在複製來源**被意外修改**時也可能為真（例如只改了
  開頭沒改中段，或者兩個字串前 30 字元剛好重疊但後面完全不同），不是真正
  的「沒有被修改」證明。且上一輪 `sourceActivityBefore` 是從**清單儲存格**
  的 `innerText()` 讀出，不是從編輯面板的 `inputValue()` 讀出——兩者理論上
  應該一致，但 REVIEW 明確要求改成「從編輯面板讀取」，統一用同一種讀取
  方式比較複製前後，排除清單呈現層可能引入的任何差異。

## SCOPE
1. **R1：列印驗證改為鎖定真正的列印容器根節點**
   - 點擊「Print」後，等待列印 portal 實際掛載：用
     `page.locator('body > div').filter({ has: page.getByRole('heading',
     { name: 'Inspection & Test Plan' }) })` 這類「以列印元件獨有的標題
     文字為錨點」的方式定位，`waitFor({ state: 'attached' })`。
   - **先斷言**這個列印根節點確實存在且**命中數量為 1**（不是 0、也不是
     多個），這個斷言本身失敗就是失敗，不得略過或當作「找不到就算過」。
   - 在這個**限定範圍內**（不是整頁 `page.locator('div')`）找到本輪新增
     項目對應的列（用唯一標記文字 filter 這個根節點**內部**的 `tr`），
     取該列 Activity 欄位（`td` index 1）的 `<div>`，比對：
     - 完整文字（`innerText()`）與原始測資字串逐字相等（不是只檢查標記
       字串存在）。
     - `getComputedStyle(el).whiteSpace` 確實是 `pre-line`（或
       `pre-wrap`/`pre`，只要能保留換行即可），不是 `normal`。
   - 同樣在這個限定範圍內核對本輪新增項目的第一筆 Criteria 文字與換行
     樣式。
   - **移除**所有「找不到列印根節點／找不到特定元素就退回整頁或
     `document.body` 搜尋，然後照樣算通過」的 fallback 路徑——找不到就是
     找不到，assertTrue 失敗，不得用別的檢查結果掩蓋。
   - 不要求截到瀏覽器原生列印對話框的畫面（這類系統層級 UI 本來就不是
     Playwright 能控制的對象）；DOM 層級的列印元件存在性、完整文字、
     `white-space` computed style，以及（如果方便）截圖存證列印 portal
     的畫面，都算合格證據。
2. **R2：複製來源改為完整字串嚴格相等比較**
   - 複製操作**之前**：直接開啟來源項目（B1）的編輯面板，讀出 Activity
     EN／CH 的完整 `textarea.inputValue()`，記錄下來，Cancel 關閉（不修改
     不 Apply）。
   - 完成本輪「複製既有項目、修改衍生項目、Apply、Save」流程後，用全新
     瀏覽器 context 重新開啟同一筆 ITP，開啟來源項目（B1）的編輯面板，
     再次讀出 Activity EN／CH 的完整 `inputValue()`。
   - 斷言：複製操作前後讀到的 Activity EN 完整字串 `===` 相等，Activity
     CH 完整字串 `===` 相等。**移除**任何「前 30 字元／前 N 字元相符就算
     過」的後援邏輯——只接受完整字串的嚴格相等。
   - 不需要對來源項目的其他欄位（Standard/Criteria/CheckTime 等）重複做
     這個比對（REVIEW 明確說「不需重跑其他全部欄位」），只需要 Activity
     EN/CH。
3. **文件措辭**：STATUS／handoff 明確區分「列印 DOM／`@media print` CSS
   證據」與「作業系統原生列印預覯視窗」兩種不同層級的證據，不得混稱後者
   已經驗證（本批只做得到、也只需要做前者）。
4. **只重跑本次受影響的兩條流程**（列印驗證、複製來源比對），**不**重新
   執行上一輪已經通過的其他 14 項檢查（新增/編輯/複製/criteria 的完整
   保存比對、取消草稿驗證、清單換行呈現）——可以在同一支腳本、同一次
   隔離環境執行裡**一併跑完整支腳本**（因為這些檢查本來就在同一條操作
   流程裡，技術上無法只抽跑兩條而跳過其他步驟），但**不需要為了這兩條
   驗證而新增或修改其他已通過的斷言**，其餘 14 項沿用上一輪已經寫好、
   通過的程式碼，不重寫。
5. 本批**預期不需要修改任何產品程式碼**（純粹是驗證腳本的定位方式與比對
   邏輯問題）。若在過程中意外發現列印或複製功能本身真的有資料問題（不是
   測試腳本誤判），才需要修改產品程式碼，且僅限該問題本身，修改後只需要
   針對受影響檔案重新執行 `npx tsc --noEmit`，`npm run lint` 如實列出既有
   基線數字；**不需要**重新執行 `npm run build`、單元測試、或重新驗證
   桌面/窄螢幕版面幾何。

## ALLOWED_PATHS
- `react-app/tests-browser/itp-input-ux-implement2-review.mjs`（僅限 R1/R2
  要求的列印容器定位與複製來源比對邏輯修正）
- `docs/workflow/`（本輪 handoff/evidence；上一輪 archive 已建立）
- `TASK.md` / `STATUS.md` / `REVIEW.md`
- `react-app/src/components/ITP/ITPAdvancedEditor.tsx`、
  `ITPPrintTemplate.tsx`——**僅限**若驗證過程中意外發現列印/複製功能本身
  真的有資料問題時的最小修正（預期不需要，見上方 SCOPE 第 5 點）。

## FORBIDDEN_PATHS
- `react-app/src/components/ITP/ITPModals.tsx`、`ITP.tsx`、`ITPDetail.tsx`、
  任何其他 ITP 檔案。
- `ITPAdvancedEditor.tsx`／`ITPPrintTemplate.tsx` 裡已接受的
  `whitespace-pre-line` 修正與其他既有版面/邏輯——不得重寫或「順手」調整，
  除非上方 SCOPE 第 5 點的例外情況發生。
- `itp-input-ux-implement2-review.mjs` 裡已通過的其他 14 項斷言（exact1-8、
  cancel1、copy1、save1、list1、list2）的既有邏輯——不得重新設計或擴大
  範圍，只能因為程式碼結構調整（例如把 `source1` 改寫）而連帶調整周邊
  程式碼本身不涉及邏輯變更的部分。
- `react-app/src/context/LanguageContext.tsx`、`InspectionItem`／
  `EMPTY_ITEM` 資料結構、任何必填欄位規則、後端程式碼
  （`backend/**`，不涉及）。
- 既有 `docs/workflow/*-archive.md`（唯讀，含本輪新建的
  `ITP-INPUT-UX-IMPLEMENT-2026-002-archive.md`）／`TASK.md`（上一輪）／
  `DECISIONS.md`／`AGENTS.md`。
- 開發資料庫、使用者 8198/3198。
- 桌面/窄螢幕版面幾何、`npm run build`、單元測試套件的重新執行（上一輪
  已確認不需要，本批同樣不需要，除非 SCOPE 第 5 點的例外發生）。

## ACCEPTANCE_CRITERIA
1. 列印驗證：先斷言列印根節點（以「Inspection & Test Plan」標題為錨點）
   確實存在、命中數量為 1；在這個限定範圍內核對本輪新增項目的 Activity／
   Criteria 完整文字（逐字相等，不是子字串搜尋）與 `white-space` computed
   style 確實保留換行；**不存在**任何「找不到就退回整頁/body 搜尋」的
   fallback 路徑。
2. 複製來源驗證：複製操作前後，皆從編輯面板讀出 Activity EN／CH 的完整
   `inputValue()`，用嚴格 `===` 比較；**不存在**任何「前 N 字元相符就算
   過」的後援邏輯。
3. 兩項修正後，重新執行同一支驗證腳本，確認這兩項與其餘既有 14 項皆通過
   （因技術限制必須完整跑過一次流程，但其餘 14 項的程式碼本身未被重新
   設計）。
4. STATUS／handoff 明確區分「列印 DOM／print media 證據」與「原生系統
   列印預覽視窗」，不混稱。
5. 若本批未修改任何產品程式碼：不重跑 `tsc`/`build`/單元測試/`lint`。若
   因為發現真實產品問題而修改了程式碼：只跑受影響檔案的 `tsc`，`lint`
   基線如實列出，不跑完整套件或版面矩陣。
6. STATUS.md 精確描述本輪新增/修正的驗證結果；REVIEW.md 留待獨立審查，不
   自行判定 PASS。

## CLAUDE_PRECHECK
1. 已讀 `docs/workflow/ITP-INPUT-UX-IMPLEMENT-2026-002-archive.md`（含完整
   REVIEW 原文），理解 R1/R2 的具體要求與「其餘已接受項目不重做」的範圍
   邊界。
2. 已讀 `ITPModals.tsx` 的 `isPrinting`／`handlePrint`／
   `ReactDOM.createPortal` 機制（約 140-174、948-954 行），確認列印元件是
   掛載在 `document.body` 的獨立 DOM 子樹，`<h1>Inspection & Test
   Plan</h1>` 是列印元件獨有、可當錨點的文字。
3. 已讀 `ITPPrintTemplate.tsx` 的表格欄位順序（無拖曳欄，Activity 是
   index 1 的 `<td>`），確認與清單表格的欄位順序不同。
4. 已讀 `itp-input-ux-implement2-review.mjs` 現有的 `printActivityDiv`／
   `source1` 程式碼，確認上方 PRECHECK 描述的問題（全頁搜尋、body
   fallback、前 30 字元後援、從清單而非編輯面板讀取來源值）屬實。
5. 隔離環境沿用既有 `isolated_stack.py` 與既有的
   `seed_itp_input_ux_review.py`，不操作使用者 8198/3198、不操作開發
   資料庫。
````

## STATUS.md（逐字，含收尾文案更正）

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: ITP-INPUT-UX-IMPLEMENT-2026-003
SOURCE_TASK_ID: ITP-INPUT-UX-IMPLEMENT-2026-002

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

## 本輪變更範圍
只修改測試腳本 `react-app/tests-browser/itp-input-ux-implement2-review.mjs`，**未修改任何產品程式碼**（`ITPAdvancedEditor.tsx`／`ITPPrintTemplate.tsx` 本輪未觸碰；round 002 的 `whitespace-pre-line` 修正原樣保留）。本輪未發現新產品缺陷，因此未重跑 build/lint/unit test/版面矩陣，符合 TASK.md SCOPE 第 5 點。

### R1 — 列印驗證改為限定真正的 ITPPrintTemplate 根容器
- 以 `page.getByRole('heading', { name: 'Inspection & Test Plan' })` 為錨點定位 `body > div` 中的列印 portal 根節點（該標題只存在於 `ITPPrintTemplate` 的 createPortal 掛載內容，列表畫面不會出現）。
- 先斷言根節點 `waitFor({state:'attached'})` 且命中數量 **恰好為 1**（`print1`），再斷言根節點內該筆測試項目的 `<tr>` 恰好 1 筆（`print2`）。
- 在該根節點範圍內取 Activity 欄（`td` index 1，無拖曳把手欄，與列表的 index 2 不同，已於 PRECHECK 核對 `ITPPrintTemplate.tsx` 實際欄位順序），比對完整 Activity EN 文字 **嚴格相等**（`print3`，而非子字串比對）與 `getComputedStyle().whiteSpace`（`print4`）。
- **完全移除**原本的 `document.body` 全頁搜尋 fallback 與「找不到特定元素就跳過白名單檢查」的路徑；根節點或列不唯一時直接判定失敗，不再有可以悄悄跳過的成功路徑。

### R2 — 複製來源改為嚴格完整相等比較
- 複製操作**之前**：直接開啟來源項目（B1）自己的編輯面板，用與其他比對相同的 `textarea.inputValue()` 機制讀出 Activity EN／CH 完整值（`sourceActivityEnBefore`／`sourceActivityChBefore`），非列表格的 `innerText()`，讀畢 Cancel 關閉不留草稿。
- 複製＋修改衍生項＋Save＋全新 context 重新開啟後，再次開啟來源項目編輯面板讀出完整 `inputValue()`，與操作前的值分別做 EN／CH **嚴格 `===` 比較**（`source1`／`source2`）。
- **完全移除**原本「完整相等 OR 前 30 字元子字串相符即通過」的後援邏輯。

## 實測證據
使用獨立隔離環境執行（`isolated_stack.py up/seed/down`，backend port 8260、vite port 3260，與使用者環境 8198/3198 無關，執行前後以 `lsof` 確認 8198/3198 未被本輪動作），沿用既有 seed script `backend/scripts/verification/seed_itp_input_ux_review.py`。

腳本本身是單一連續流程，無法只抽跑 R1/R2 兩步而跳過其他步驟，因此是整支連續腳本一次執行到底，共 20 項檢查：

```
20 checks executed, 20 PASS, 0 FAIL
```

全文見 `docs/workflow/ITP-INPUT-UX-IMPLEMENT-2026-003-evidence/run.log`。R1/R2 本輪實際改寫／新增的斷言與其核對欄位：
- `print1`: 列印 portal 根節點（以「Inspection & Test Plan」標題為錨點）確實存在且命中數量恰為 1
- `print2`: 根節點內該筆測試項目的 `<tr>` 命中數量恰為 1
- `print3`: 根節點內該列 **Activity EN** 欄位文字與原始測資完整逐字相等（len 304 vs 304）——本輪精確比對範圍僅 Activity EN，**未**對 Criteria 或其他欄位新增獨立的列印比對（Criteria 的完整保存證據仍只來自既有的 `exact7`/`exact8`，那是編輯面板讀值，不是列印畫面讀值）
- `print4`: 該欄位 `getComputedStyle().whiteSpace` 為 `pre-line`（確認列印畫面換行未被壓縮）
- `source1`/`source2`: 複製來源 Activity EN/CH 操作前後完整相等未變（len 111 vs 111, len 28 vs 28）

截圖：`list-rendering.png`、`print-preview-rendering.png`、`reread-source-unmodified.png`（均在同一 evidence 目錄）。

### 證據類型說明（依 TASK.md 要求區分）
本輪 R1 驗證的是 **列印 portal DOM 與其 computed style**——即 `ITPPrintTemplate` 元件透過 `ReactDOM.createPortal` 實際掛載到 `document.body` 後，該節點內 Activity EN 欄位的渲染文字與 `white-space` computed style。**未**驗證瀏覽器原生系統列印預覽視窗的畫面（該視窗由作業系統/瀏覽器原生渲染，Playwright 無法直接截圖其內容），也未驗證 `@media print` 樣式表或實際 PDF 分頁結果；`window.print()` 呼叫本身未被攔截驗證。

## 隔離環境
`isolated_stack.py up --port 8260 --vite-script react-app/tests-browser/itp-input-ux-implement2-vite-launcher.mjs --vite-port 3260`，seed 用獨立產生的測試密碼（未寫入任何檔案以外的地方，不含硬編碼密碼），執行完畢後 `down` 正常回收（`"removed"` 確認），期間與事後以 `lsof -i :8198 -i :3198` 確認使用者本機開發環境（Python pid 59075 / node pid 59082）全程未被影響。

## 範圍確認
- 未修改 TASK.md FORBIDDEN_PATHS 列出的任何檔案。
- 未重跑版面矩陣或 build/lint/unit test（NEW_ACTIVITY_EN 等測試資料字串、textarea 索引邏輯、Cancel 草稿檢查等均未變動）。
- 未 commit／push／部署。

## 協作流程更正（REVIEW 已指出）
上一輪結束時我誤以為「舊 REVIEW 內容要保留到新輪審查完才能覆寫」，因此沒有在本輪開始時把 REVIEW.md 清成待審空白模板。正確流程：新輪開始時，舊輪 REVIEW 已封存到上一輪 archive 後，REVIEW.md 即可建立新 TASK_ID 的待審空白模板，不必刻意保留舊 REVISE 內容等待下一次判定。本輪審查已將 REVIEW.md 更新為 ITP-INPUT-UX-IMPLEMENT-2026-003／PASS；往後新開一批時會依此更正流程處理。
````

## REVIEW.md（逐字）

````markdown
# REVIEW.md — 獨立審查

TASK_ID: ITP-INPUT-UX-IMPLEMENT-2026-003
SOURCE_TASK_ID: ITP-INPUT-UX-IMPLEMENT-2026-002
審查日期：2026-10-04

## EVIDENCE_CHECK
核對本輪 TASK/STATUS/handoff、itp-input-ux-implement2-review.mjs 及完整 run.log。本次未獨立重跑環境。
R1 核心缺口已修正：列印定位限於具有 Inspection & Test Plan 標題的 portal 根節點，根與測試列各斷言唯一，Activity EN 完整相等並確認 pre-line；不再用列表或 body 後援。
R2 通過：複製前從来源編輯面板取 Activity EN/CH，保存重開後兩欄嚴格相等，不再容許前綴後援。
執行紀錄為 20 checks / 20 PASS / 0 FAIL，包含同一腳本連帶重跑的既有保存及取消斷言；並非 20 項全新測試。前輪已接受版面、多行保存與局部樣式修正維持有效。
證據限制：本輪列印精確比對為 Activity EN，Criteria 的中英文完整保存有 exact7/8 證據，但未新增獨立的列印 Criteria 比對。列印內容證據為 portal DOM 與 computed style，不宣稱原生列印預覽或實際 PDF 分頁驗收。本輪主要定位缺口已關閉，不因此再擴大補測。

## SCOPE_CHECK
本輪只改驗證方法與文件。沒有新產品修改時不重跑 build/unit/lint/版面矩陣合理。全專案 lint 最近留存仍有 13 errors / 21 warnings，本批 PASS 不表示全專案 lint 已通過。

## DECISIONS_CHECK
僅改善 ITP 項目輸入空間與多行顯示，不改日期語意、Subject 必填、授權或保存契約。
協作規則更正：新輪 TASK/STATUS/REVIEW 必須同 TASK_ID；舊 REVIEW 應封存在上一輪 archive，新 REVIEW 可建立待審空白模板，不是保持舊 REVISE 到下一次審查。此次審查已將 REVIEW 更新為 003。

## VERDICT
- [x] PASS
- [ ] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
無阻斷項目，不另開 004。封存收尾時只修正文案：
- 列印證據精確寫為 portal DOM/computed style，不籠統並列已驗證 print media；列明實際核對欄位。
- 20 項為整支連續腳本總數，不說只執行兩條獨立流程；省略不精確的新舊拆分計數。
- 移除「舊 REVIEW 必須留到新輪判定」的錯誤流程說明。

## NEXT_STEP
本系列 PASS 結案。完整逐字封存本輪 TASK/STATUS/REVIEW，更新對應待辦，保留已揭露限制及各輪證據。不重跑、不重寫產品、不自動開下一批。未 commit/push/部署。
````
