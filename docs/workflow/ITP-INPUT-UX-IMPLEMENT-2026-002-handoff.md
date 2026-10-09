# ITP-INPUT-UX-IMPLEMENT-2026-002 — 多行文字完整保存與呈現補驗 handoff

只處理 `ITP-INPUT-UX-IMPLEMENT-2026-001` REVIEW.md 的 R1。版面方向（桌面寬度、
Activity/Standard/Criteria 整列、手機堆疊、Header/Footer 可見）**已接受，本輪
未重做、未重新產生版面截圖**。

## R1 要求與本輪補驗內容

### 1. 測試資料：長中英文 + 明確換行 + 尾端唯一標記

`react-app/tests-browser/itp-input-ux-implement2-review.mjs` 新增一組測資，
每次執行用 `RUN_ID = Date.now().toString(36)` 產生當次唯一標記（例如
`>>>R1-NEW-ACT-EN-mutn1wgd<<<`），確保可重複執行、不與歷史資料混淆：
- 新增項目的 Activity（EN/CH）與第一筆 Criteria（EN/CH）：皆為長文字，文字
  中段**真的有 `\n`**（不是靠自動折行），結尾附唯一標記。
- 複製既有項目（B1）衍生出的新項目：Activity（EN/CH）同樣長文字＋換行＋
  唯一標記。
- 編輯既有項目（A1）：Activity（EN/CH）同樣長文字＋換行＋唯一標記。

### 2. 新增／複製／編輯三種入口，同一條流程完成

見腳本「Entry 1」「Entry 2」「Entry 3」三段：新增一筆、複製 B1 並修改、編輯
A1，依序在同一個 ITP 記錄裡完成，沒有排列組合成多條獨立情境。

### 3. Apply → Save → 全新 context 重開 → 逐字串完整比對

`page2`（全新登入、全新瀏覽器 context）重新開啟同一筆 ITP 記錄，對每個本輪
新增/修改的項目開啟編輯面板，讀出 `textarea.inputValue()`，與原始測資字串
**逐字相等比對**（`===`，含換行字元本身、含結尾標記），不是子字串搜尋或只比
前 60 字元：
- `exact1`/`exact2`：新增項目 Activity EN/CH 完整比對，長度 304/99 字元精確
  相符。
- `exact3`/`exact4`：複製衍生項目 Activity EN/CH 完整比對。
- `exact5`/`exact6`：編輯項目 Activity EN/CH 完整比對。
- `exact7`/`exact8`：新增項目的第一筆 Criteria EN/CH 完整比對，長度
  201/76 字元精確相符。

**過程中抓到並修正了一個本輪自己的測試腳本錯誤**（不是產品問題）：第一版
腳本用 `textareas.count() - 2` 計算「新增 Criteria 項」應該填入的欄位索引，
誤以為新加的 Criteria 欄位會出現在 textarea 清單最後面；實際上 DOM 順序是
Activity→Standard→**Criteria**→Check Time→Method→Frequency，新增的 Criteria
欄位會插入在 Standard 之後、Check Time 之前，正確索引是固定的 4，不是
「總數減 2」。修正前這個計算錯誤讓測試腳本把 Criteria 測資誤填進了
Frequency 欄位，導致 `exact7`/`exact8` 一度顯示「長度 0」看起來像資料遺失；
用 `DEBUG` log 逐一印出 12 個 textarea 的實際內容後確認是腳本索引算錯，不是
`handleSaveItem`／`detail_data` 保存邏輯的問題——修正腳本索引後兩項都精確
相符。

### 4. 複製來源未被修改、取消不套用草稿

- `source1`：複製 B1 衍生出新項目並 Apply、Save 之後，獨立重新開啟 B1 本身
  的編輯面板，確認 B1 的 Activity 內容與複製操作**之前**記錄的值一致——複製
  操作沒有意外改到來源。
- `cancel1`：開啟一個項目的編輯面板，修改 Activity 內容但**不按 Apply**，
  改點 Cancel（面板本身的 leave-guard 會跳出與全站共用的「Unsaved
  Changes」ConfirmModal，點擊「Leave」確認丟棄）；重新開啟同一項目，確認值
  與修改前完全相同、草稿字串完全沒有出現在任何地方。

### 5. 列表與列印預覽的換行呈現——找到真實問題並修正

**核對前**：`ITPAdvancedEditor.tsx` 的 Inspection Plan 表格與
`ITPPrintTemplate.tsx` 的列印輸出，Activity／Standard／Criteria／Check
Time／Method／Frequency 的文字都是用純 `<div>{...}</div>` 直接渲染，**沒有**
任何保留換行的 CSS。瀏覽器預設 `white-space: normal` 會把字串裡的 `\n` 在
視覺上摺疊成一個空白——**資料本身沒有遺失**（`item.activity.en` 這個字串
完整保留了 `\n` 字元，`innerHTML`/`innerText` 都讀得到完整內容，包含換行與
標記），但**視覺上看不出使用者原本按的那個 Enter**，兩行會黏成一行。

**確認方式**：不只檢查「標記字串有沒有出現在頁面某處」（這個就算換行被摺疊
也會通過，摺疊只是把 `\n` 變成空白，字元本身都還在），而是直接讀取容器元素
的 `getComputedStyle(el).whiteSpace`——這才是真正決定換行是否視覺保留的
CSS 機制。核對前這個值是 `"normal"`（會摺疊），確認換行確實沒有被保留。

**局部修正**：只在 `ITPAdvancedEditor.tsx` 的表格渲染與 `ITPPrintTemplate.
tsx` 這兩個檔案裡，原本顯示 Activity／Standard／Criteria／Check Time／
Method／Frequency 文字的既有 `<div>`/`<span>` 元素上，各自加上一個 Tailwind
的 `whitespace-pre-line` class（CSS `white-space: pre-line`：摺疊多餘的
空白字元，但保留使用者輸入的換行，長行仍會自動換行，不會破版）。**只加
樣式 class，沒有新增/移除任何元素、沒有改變資料讀取邏輯、沒有改變保存流程、
沒有重新設計表格或列印版型**。

**修正後重新驗證**：`list2`／`print2` 直接讀取修正後的
`getComputedStyle(el).whiteSpace`，確認值為 `"pre-line"`；`list1`／`print1`
確認完整文字（含結尾標記）仍然存在。截圖
[`list-rendering.png`](./ITP-INPUT-UX-IMPLEMENT-2026-002-evidence/list-rendering.png)
清楚可見 A1 項目的 Activity 欄位在「...completed on site.」之後真的換了一
行顯示「Second line noting...」，再換一行顯示結尾標記，不是黏成一段。

## 證據與測試結果

`react-app/tests-browser/itp-input-ux-implement2-review.mjs`：
**16 checks executed, 16 PASS, 0 FAIL**（`run.log`）。截圖見
`docs/workflow/ITP-INPUT-UX-IMPLEMENT-2026-002-evidence/`：
`list-rendering.png`（清單換行保留，視覺可見）、
`print-preview-rendering.png`（這張截圖的可視畫面與清單畫面相同，因為
「Print」目前在這個檢視裡沒有切換成獨立的列印版面截圖，`print1`/`print2`
兩項斷言是直接查詢列印元件的 DOM／computed style 得出，不是只看這張截圖）、
`reread-source-unmodified.png`（複製來源未被修改的佐證畫面）。

## 本輪實際修改的產品檔案（僅限換行呈現，未動其他版面/邏輯）

- `react-app/src/components/ITP/ITPAdvancedEditor.tsx`：表格列表渲染區段
  （約 397-429 行）的既有文字 `<div>` 加上 `whitespace-pre-line`；未改動
  上一輪已接受的面板版面（寬度、Event No 區塊、textarea 結構）、未改動
  `handleChange`/`handleSaveItem`/`handleCopyClick` 等既有邏輯。
- `react-app/src/components/ITP/ITPPrintTemplate.tsx`：列印表格的對應文字
  `<div>`/`<span>` 同樣加上 `whitespace-pre-line`；本輪**新增**允許觸碰此
  檔案（上一輪 FORBIDDEN_PATHS 未列入），範圍嚴格限定在這個換行相關的樣式
  修正，未改動列印版型、頁首、欄位配置。

## 本輪未重新執行的檢查（有修改產品程式碼，已重新執行必要項目）

本輪因為 R1 要求的呈現問題確實存在、做了上述局部 CSS 修正，依 TASK.md 第 6
點指示：
- `npx tsc --noEmit`：重新執行，通過，0 錯誤。
- `npm run lint`：重新執行，**13 個錯誤、21 個警告**——與既有基線相同，本輪
  修改的兩個檔案都不在既有錯誤清單中。**如實列出，不稱「全部檢查正常」**。
- **未**重新執行 `node scripts/run-unit-tests.mjs`（本批未觸碰任何單元測試
  涵蓋的邏輯，純樣式修正）、**未**重新產生桌面/窄螢幕的版面幾何截圖（上一輪
  已接受，不在本批範圍）。
