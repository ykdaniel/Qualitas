# ITP-INPUT-UX-IMPLEMENT-2026-001 — 封存（原文保留；獨立審查 REVISE，下一輪補 R1）

本檔封存 ITP-INPUT-UX-IMPLEMENT-2026-001 這一輪的 TASK.md、STATUS.md、
REVIEW.md 原文。依 AGENTS.md 規則，原文保留，不因後續工作修改內容。REVIEW.md
判定為 **REVISE**；版面方向（桌面 1100px、Activity/Standard/Criteria 各自整列、
手機堆疊、Header/Footer 維持可見）**已被接受，不重做，也不補不存在的修改前
手機截圖**。下一輪 ITP-INPUT-UX-IMPLEMENT-2026-002 只補 R1：多行文字（含明確
換行）的完整保存驗證與列表/列印呈現核對。

---

## TASK.md（原文，完整保留）

````markdown
# TASK.md — ITP Inspection Plan 項目面板：長文字輸入與版面改善

TASK_ID: ITP-INPUT-UX-IMPLEMENT-2026-001
SOURCE_TASK_ID: ITP-INPUT-UX-2026-001
狀態：已交辦，待 Claude 執行。實作 ITP-INPUT-UX-2026-001 的 Finding 1（已 PASS
核可：長文字輸入改善方向），並納入使用者後續補充的完整版面需求。**只處理
Inspection Plan 的新增/編輯/複製共用面板**；日期標籤語意（Finding 2）與
Subject 必填（Finding 3）**不納入本批**。

## GOAL
`ITPAdvancedEditor.tsx` 的「Add/Edit/Copy Inspection Item」面板目前整體偏小、
內容欄位（Activity／Standard／Criteria／Check Time／Method／Frequency）全部是
固定高度單行 `<input>`，真實長度的工程規範文字（80-140 字元）一律被截斷，必須
點進欄位捲動才看得到完整內容（已於 ITP-INPUT-UX-2026-001 Finding 1 以截圖
佐證）。本批把這些欄位改為可視多行、並重新設計面板版面，讓使用者能一次看到
填寫中的完整內容，不必在小框裡橫向捲動核對。

## 使用者補充需求（逐字沿用，不得自行弱化或簡化）
1. 桌面編輯視窗以約 1000–1100px 為設計起點，受 viewport 限制；窄螢幕接近全寬。
2. 壓縮 Event No.／Phase／Insert After 區塊的留白與高度。
3. Activity、Standard、Criteria 分別占完整一列；桌面在各列內並排 EN／中文，
   手機上下排列。不要再讓 Activity 與整組 Standard／Criteria 擠在左右兩側。
4. 長文字欄位初始顯示約 3 行，可向下擴展；Criteria 保留逐條新增／刪除。
5. 內容區捲動，標題與 Apply／Cancel 保持可見，不遮住最後一個欄位。
用長中英文內容驗證實際填寫與閱讀，提供桌面、窄螢幕修改前後截圖。沿用原任務的
資料保存與複製驗收，不改業務規則。

## PRECHECK 已確認事項（既有基礎，不得重新調查或誤判）
- `docs/workflow/ITP-INPUT-UX-2026-001-archive.md`（PASS）：Finding 1 核可
  長文字輸入改善方向；**不核可**改日期語意（Finding 2）或新增 Subject 必填
  （Finding 3）——這兩項本批**不得順手處理**。
- 面板目前結構（`ITPAdvancedEditor.tsx:470-618`）：外層
  `max-w-2xl`（672px）、`max-h-[90vh] flex flex-col`；Header 固定於頂部
  （`shrink-0`）；Body 為 `p-8 space-y-6 overflow-y-auto flex-1`（已經是可
  捲動的 flex 子項，Header 與 Footer 理論上已不會被蓋住——本批需驗證這個
  既有捲動結構在改寬版面後仍然成立，不是從零重建捲動機制）；Footer 用既有
  `FormActions` 元件（`cancel`／`primary` 插槽），緊跟在 Body 後面，同層於
  外層 flex 容器。
- Activity 欄位目前在 `grid grid-cols-2 gap-6` 的左欄；Standard 與 Criteria
  目前**同時**塞在同一個 `grid grid-cols-2` 的右欄裡（`ITPAdvancedEditor.
  tsx:526-552`）——這正是使用者指出「Activity 與整組 Standard／Criteria
  擠在左右兩側」的現狀，本批要拆開成三個獨立的整列區塊。
- `InspectionItem` 的欄位型別（`types/itp.ts`）本來就是純字串（`activity.en`/
  `activity.ch` 等），本批只改輸入元件（`<input>`→`<textarea>`）與版面排列，
  **不改資料結構、不改 `handleChange`／`handleCriteriaChange`／
  `handleSaveItem` 等既有狀態與保存邏輯**。
- 既有複製流程（`handleCopyClick`，`ITPAdvancedEditor.tsx:108-117`）已於
  ITP-INPUT-UX-2026-001 驗證入口與預填正確；**獨立審查已指出**那次驗證不等於
  完整驗證「複製後修改、Apply、保存、重新開啟後內容仍正確」這整條流程——本批
  驗收必須補上這條完整流程的實測，不能只看面板打開時預填正確就當作複製功能
  已驗收。

## SCOPE
1. **面板寬度與 viewport 限制**：外層容器從 `max-w-2xl` 改為約
   `max-w-[1100px]`（可用 Tailwind 任意值或既有斷點組合，精確數值以
   1000-1100px 這個區間為準），保留既有 `w-full` 與 `max-h-[90vh]`，確保
   寬螢幕時視窗寬度落在設計區間內、且不超出 viewport；窄螢幕（手機寬度）
   因 `w-full` 已存在，視窗本來就會接近全寬——用 Browser pane 的窄螢幕模擬
   （如 375px 寬）實際驗證這點仍然成立，不是只看桌面寬度。
2. **壓縮 Event No./Phase/Insert After 區塊**：這個區塊目前是
   `grid grid-cols-2 gap-6 bg-slate-50 p-5 rounded-xl`，標籤
   `text-xs font-bold uppercase mb-2`、輸入框 `h-10`；Insert After 子區塊
   另有 `border-t pt-4 mt-2`。本批縮小間距與留白（例如 `p-5`→`p-3`、
   `gap-6`→`gap-4`、`mb-2`→`mb-1`、`pt-4 mt-2`→`pt-2 mt-1`，實際數值以
   視覺上「明顯更緊湊但仍可讀、可點擊」為準，不要求逐字比照這裡列出的數字），
   不改這三個欄位本身的功能或資料邏輯。
3. **Activity／Standard／Criteria 各自獨立成一個整列區塊**：
   - 拆開現有 `grid grid-cols-2` 的左右配置，Activity、Standard、Criteria
     三者各自是面板裡一個獨立、滿版寬度的區塊（不再用左右兩欄把它們擠在一起）。
   - 每個區塊內部，EN／中文兩個欄位在桌面寬度下左右並排（例如
     `grid grid-cols-1 sm:grid-cols-2 gap-3`），在窄螢幕（`sm` 斷點以下）
     改為上下堆疊。
   - Criteria 維持既有「逐條新增／刪除」的互動（`handleCriteriaAdd`／
     `handleCriteriaRemove`／`+ Add Criteria` 按鈕），每一條 Criteria 的
     EN/中文一樣在桌面並排、窄螢幕堆疊，刪除按鈕位置可依新版面調整但功能
     必須保留。
4. **長文字欄位改為可視多行、可向下擴展**：Activity／Standard／Criteria／
   Check Time／Method／Frequency 這些欄位（含 EN/CH 兩個子欄位）從
   `<input>` 改為 `<textarea>`，初始可視高度約 3 行（例如 `rows={3}`），
   允許使用者向下拖曳擴展（`resize-y`，不限制 `resize-none`）；樣式比照
   既有輸入框的邊框／圓角／字級，不要讓改動後的視覺風格與其他欄位不一致。
   Record 欄位內容通常是短文件編號，維持現狀單行 `<input>` 即可，不強制改
   textarea。
5. **內容區捲動、標題與操作按鈕維持可見**：確認（必要時微調）外層
   `max-h-[90vh] flex flex-col` 配合 Header `shrink-0`、Body
   `flex-1 overflow-y-auto`、Footer（FormActions）維持在捲動區域外——改寬
   改高版面後，用長內容撐滿好幾個欄位，實際捲動到最底部，確認最後一個欄位
   （目前是 Verification Points 區塊）沒有被 Footer 的 Apply/Cancel 蓋住，
   Header 與 Footer 在捲動過程中都維持可見/可點擊。
6. **驗證（獨立隔離環境，不得只讀程式碼推論）**：
   - 用與 ITP-INPUT-UX-2026-001 查核時相近或更長的中英文內容（可沿用該輪
     `seed_itp_input_ux_review.py` 的既有測資風格），實際操作新增一筆項目、
     編輯一筆既有項目、**複製一筆既有項目並修改後 Apply**，確認：
     a. 填寫與閱讀過程中，Activity/Standard/Criteria 等欄位的完整內容在
        桌面寬度下可以直接看到（不需要橫向捲動），textarea 高度足夠容納
        三行左右、可視需要向下擴展。
     b. 複製產生的新項目 Apply 後，保存（Save）整份 ITP，**重新開啟同一筆
        紀錄**，確認複製／新增／編輯的內容與送出前一致（這是回應獨立審查
        指出「複製流程只驗證到入口與預填，沒驗證完整流程」的具體補強）。
   - 用 Browser pane 的窄螢幕模擬（例如 375px 寬，行動裝置寬度）重複上述
     操作，確認版面确实接近全寬、EN/CH 兩欄改為上下堆疊、Apply/Cancel 仍可
     點擊、沒有內容被截斷或遮住。
   - 截圖：桌面修改前／修改後各至少一張能看到完整面板的截圖，窄螢幕修改前／
     修改後各至少一張，存入本輪 evidence 目錄。
7. **不**修改任何必填規則、**不**修改 `itp.submissionDate` 或任何其他 i18n
   key 的顯示文字、**不**補全站翻譯、**不**操作使用者環境（8198/3198）或
   開發資料庫。

## ALLOWED_PATHS
- `react-app/src/components/ITP/ITPAdvancedEditor.tsx`（本批實作的唯一產品
  程式碼檔案）
- `backend/scripts/verification/`（若需要調整/新建隔離測試種子腳本）
- `react-app/tests-browser/`（本輪驗證腳本/截圖）
- `docs/workflow/`（本輪 handoff/evidence；上一輪 archive 已建立）
- `TASK.md` / `STATUS.md` / `REVIEW.md`

## FORBIDDEN_PATHS
- `react-app/src/components/ITP/ITPModals.tsx`、`ITP.tsx`、`ITPDetail.tsx`、
  任何其他 ITP 檔案——本批只動 `ITPAdvancedEditor.tsx` 這個面板本身。
- `react-app/src/context/LanguageContext.tsx`——不修改任何既有 i18n key 的
  顯示文字（含 `itp.submissionDate`，該項待確認，不在本批範圍）；若版面
  調整需要新的、單純描述版面元素的 i18n key（非業務語意），先在 STATUS
  說明必要性。
- `InspectionItem`／`EMPTY_ITEM`（`constants/itp.ts`、`types/itp.ts`）的
  欄位型別與資料結構——只改輸入元件與版面，不改資料形狀。
- `handleChange`／`handleCriteriaChange`／`handleCriteriaAdd`／
  `handleCriteriaRemove`／`handleSaveItem`／`calculateNextId`／
  `handleCopyClick`／`handleDragStart`等既有狀態與邏輯函式的行為語意——只能
  因為改用 textarea 而調整呼叫介面（例如 `onChange` 的事件型別從
  `ChangeEvent<HTMLInputElement>` 改成同時接受 `HTMLTextAreaElement`），
  不得改變這些函式本身「做什麼」。
- 任何必填欄位規則、驗證邏輯。
- `backend/**`——本批純前端版面與輸入元件調整。
- 既有 `docs/workflow/*-archive.md`（唯讀，含本輪新建的
  `ITP-INPUT-UX-2026-001-archive.md`）／`TASK.md`（上一輪）／
  `DECISIONS.md`／`AGENTS.md`。
- 開發資料庫、使用者 8198/3198。

## ACCEPTANCE_CRITERIA
1. 面板桌面寬度落在約 1000-1100px 區間（受 viewport 限制），窄螢幕下接近
   全寬；有桌面與窄螢幕的修改前/後截圖對照。
2. Event No./Phase/Insert After 區塊的留白與高度有實際縮小（截圖可比對出
   差異），功能不變。
3. Activity、Standard、Criteria 各自是面板裡獨立的整列區塊，不再與其他欄位
   左右擠在一起；每個區塊內桌面 EN/中文並排、窄螢幕上下堆疊。
4. Activity／Standard／Criteria／Check Time／Method／Frequency 改為多行
   textarea，初始約 3 行高、可向下擴展；Criteria 的逐條新增/刪除功能維持
   正常運作。
5. 捲動到面板最底部，Header 與 Apply/Cancel 按鈕仍可見/可點擊，最後一個
   欄位（Verification Points）沒有被遮住。
6. 用長中英文內容實測新增、編輯、複製（複製後修改並 Apply、保存整份 ITP、
   重新開啟同一筆紀錄核對內容一致）三種操作，皆在隔離環境實際操作，非讀碼
   推論。
7. 未修改任何必填規則、`itp.submissionDate` 或其他既有 i18n key 顯示文字、
   `InspectionItem` 資料結構、後端程式碼。
8. STATUS.md 完整記錄操作過程、證據檔名與路徑；REVIEW.md 留待獨立審查，不
   自行判定 PASS。

## CLAUDE_PRECHECK
1. 已讀 `docs/workflow/ITP-INPUT-UX-2026-001-archive.md`（含完整 REVIEW
   原文），確認 Finding 1 已核可、Finding 2/3 不納入本批、獨立審查指出的
   「複製流程驗證不完整」這點需要在本批補強。
2. 已讀 `ITPAdvancedEditor.tsx` 全文，確認面板現狀結構（寬度、Event No 區塊、
   Activity/Standard/Criteria 現有左右配置、既有捲動結構）與上方 PRECHECK
   所述一致。
3. 已讀 `types/itp.ts`、`constants/itp.ts` 確認 `InspectionItem` 的欄位
   型別與 `EMPTY_ITEM` 預設值，確認本批不需要、也不會變動這些。
4. 隔離環境沿用既有 `isolated_stack.py`；種子資料可沿用或微調
   `ITP-INPUT-UX-2026-001` 使用的 `seed_itp_input_ux_review.py` 風格，不
   操作使用者 8198/3198、不操作開發資料庫。
````

## STATUS.md（原文，完整保留）

````markdown
# STATUS.md — Claude 執行結果

TASK_ID: ITP-INPUT-UX-IMPLEMENT-2026-001
SOURCE_TASK_ID: ITP-INPUT-UX-2026-001

## RESULT
- [x] DONE
- [ ] PARTIAL
- [ ] BLOCKED

實作 ITP-INPUT-UX-2026-001 Finding 1，並納入使用者補充的完整版面需求（桌面
1000-1100px 寬度、壓縮 Event No 區塊、Activity/Standard/Criteria 各自整列、
長文字 textarea 可擴展、捲動時 Header/Footer 維持可見）。**只修改
`ITPAdvancedEditor.tsx` 一個產品檔案**，日期標籤與 Subject 必填未納入。隔離
環境實測含**完整**複製→修改→Apply→Save→重新開啟核對流程（回應獨立審查對上
一輪「複製流程驗證不完整」的指摘），詳見下方與
`docs/workflow/ITP-INPUT-UX-IMPLEMENT-2026-001-handoff.md`。

## 對使用者的改善
1. 面板加寬到約 1000-1100px（桌面），Activity/Standard/Criteria 不再被壓縮
   成兩欄文字框，長內容一次就能看到完整句子，不用點進欄位捲動核對。
2. 長文字欄位改為可多行顯示、可向下拖曳擴展的文字區，初始約 3 行高。
3. 新增/編輯/複製面板本身的留白更緊湊（Event No/Phase/Insert After 區塊），
   同樣視窗高度能看到更多實際內容。
4. 窄螢幕（手機寬度）下面板接近全寬，EN/中文欄位改為上下堆疊，不會被壓成
   窄窄兩欄看不清楚。
5. 捲動到面板最底部，標題列與 Apply/Cancel 仍然可見可點擊，不會被蓋住最後
   一個欄位。

## CLAUDE_PRECHECK 執行記錄
1. 已讀 `docs/workflow/ITP-INPUT-UX-2026-001-archive.md`（含完整 REVIEW
   原文），確認 Finding 1 已核可、Finding 2/3 不納入、獨立審查指出的「複製
   流程驗證不完整」需要在本批補強。
2. 已讀 `ITPAdvancedEditor.tsx` 全文，確認面板現狀結構（寬度、Event No 區塊、
   Activity/Standard/Criteria 現有左右配置、既有捲動結構）。
3. 已讀 `types/itp.ts`、`constants/itp.ts` 確認 `InspectionItem` 欄位型別
   與 `EMPTY_ITEM`，確認本批不需要變動。

## 修復內容
`react-app/src/components/ITP/ITPAdvancedEditor.tsx`（新增/編輯/複製共用的
Inspection Item 面板，唯一修改的產品檔案）：
- 外層容器 `max-w-2xl`→`max-w-[1100px]`，保留 `w-full`／`max-h-[90vh]`。
- Event No./Phase/Insert After 區塊縮小留白與高度（`p-5`→`p-3`、
  `gap-6`→`gap-3`、`mb-2`→`mb-1`、`h-10`→`h-9`、Insert After 子區塊
  `pt-4 mt-2`→`pt-2 mt-1`）。
- Activity／Standard／Criteria 從原本「Activity 左欄、Standard+Criteria
  共用右欄」的 `grid grid-cols-2` 拆開，各自成為獨立滿版區塊；區塊內
  EN/中文用 `grid grid-cols-1 sm:grid-cols-2`（桌面並排、窄螢幕堆疊）。
- Activity／Standard／Criteria／Check Time／Method／Frequency 的 EN/CH
  欄位從 `<input>` 改為 `<textarea rows={3} resize-y>`；Record 維持
  `<input>`。
- Verification Points 區塊的 4 欄網格在窄螢幕改為 2 欄（`grid-cols-2
  sm:grid-cols-4`），避免過窄。
- 既有 `handleChange`／`handleCriteriaChange`／`handleCriteriaAdd`／
  `handleCriteriaRemove`／`handleSaveItem`／`calculateNextId`／
  `handleCopyClick`／拖曳排序等函式**完全未修改**，只是呼叫它們的輸入元件
  從 input 換成 textarea（`e.target.value` 讀取方式不變）。

## 隔離環境驗證（已完成，依本輪實際操作紀錄）
- `isolated_stack.py up --port 8250`，新建本輪專屬 launcher
  `react-app/tests-browser/itp-input-ux-implement-vite-launcher.mjs`
  （8250/3250）。
- 種子：沿用 `ITP-INPUT-UX-2026-001` 的
  `backend/scripts/verification/seed_itp_input_ux_review.py`（本輪**未
  修改**此腳本）。
- 先以 Browser pane 互動操作確認桌面版面（寬度 1100px、捲動到底部
  Header/Footer 皆可見、Verification Points 未被遮住），再新建
  `react-app/tests-browser/itp-input-ux-implement-review.mjs`（Playwright，
  沿用既有 `verifyIsolatedTarget`）重新跑一次取得可複查證據：
  **10 checks executed, 10 PASS, 0 FAIL**，涵蓋：
  - 桌面面板寬度／Activity-Standard 同列起點／捲動後 Header-Footer-最後
    欄位的座標核對（非肉眼判斷，用 `boundingBox()` 數值斷言）。
  - **完整**複製→修改長文字→Apply→Save→**全新瀏覽器 context 重新開啟同一筆
    紀錄**→核對修改內容仍存在（回應獨立審查對上一輪「複製流程驗證不完整」
    的指摘）。
  - 窄螢幕（375px）面板寬度／EN-CH 堆疊／捲動後 Apply 仍可見。
  截圖與 `run.log` 見 `docs/workflow/ITP-INPUT-UX-IMPLEMENT-2026-001-evidence/`，
  索引對照表見 handoff 文件。
- 隔離堆疊已拆除（`isolated_stack.py down`），`lsof` 確認 8250/3250 埠號
  釋放；使用者 8198/3198 全程監聽未受影響。
- 啟動/拆除隔離環境因本機埠號綁定／跨行程存活檢查被沙盒封鎖（`EPERM`），以
  `dangerouslyDisableSandbox` 執行這幾個明確需要的指令；其餘操作維持在沙盒
  內。

## 「修改前」對照截圖的限制（如實記錄，不補假證據）
本批未用 git stash 重建舊版畫面截圖——`ITPAdvancedEditor.tsx` 在這個 WIP
分支上本來就已有大量此批次之前、尚未提交的其他改動，stash 這個檔案會跳回
比「這批開始之前」更早、不確定是哪個狀態的版本，拿來當對照基準會失真，也不
符合既有「不用 stash 做範圍隔離」的協作慣例（見 memory
`feedback_isolate_via_stash_not_edit`）。**桌面「修改前」沿用上一輪
ITP-INPUT-UX-2026-001 的既有截圖**（同一個 Copy 入口、同一筆測資，可直接
對照）；**窄螢幕「修改前」沒有可用的既有截圖**（上一輪純審閱沒有測窄螢幕），
如實記錄這個限制，不生成一張用猜測重建的「修改前」窄螢幕畫面。

## FILES_CHANGED
- `react-app/src/components/ITP/ITPAdvancedEditor.tsx`（Inspection Item
  面板版面與輸入元件改善，詳見上方「修復內容」；本輪唯一修改的產品檔案）。

## FILES_ADDED
- `react-app/tests-browser/itp-input-ux-implement-vite-launcher.mjs`（本輪
  專屬隔離 vite launcher，8250/3250）。
- `react-app/tests-browser/itp-input-ux-implement-review.mjs`（本輪證據擷取
  /驗證腳本）。
- `docs/workflow/ITP-INPUT-UX-2026-001-archive.md`（封存上一輪 PASS 原文，
  含依審查 REQUIRED_FIXES 更正後的 Finding 2/3）。
- `docs/workflow/ITP-INPUT-UX-IMPLEMENT-2026-001-handoff.md`。
- `docs/workflow/ITP-INPUT-UX-IMPLEMENT-2026-001-evidence/`（6 張截圖 +
  `run.log`）。

## FILES_DELETED
無。

## TESTS_RUN
- `npx tsc --noEmit`：通過，0 錯誤。
- `npm run build`：通過。
- `node scripts/run-unit-tests.mjs`：123/123 全部通過，0 失敗。
- `npm run lint`：13 個錯誤、21 個警告，與既有基線相同；本輪修改的
  `ITPAdvancedEditor.tsx` 不在既有錯誤清單中。
- `itp-input-ux-implement-review.mjs`（隔離瀏覽器驗證，Playwright）：
  **10 checks executed, 10 PASS, 0 FAIL**，動態執行期計數，log 已存檔。

## RISKS / LIMITATIONS
- 「修改前」窄螢幕對照截圖不存在（見上方專節說明），只有桌面修改前對照（沿用
  上一輪既有截圖）。
- Check Time／Method／Frequency 三組欄位維持原本的 2 欄網格排列（窄螢幕改
  1 欄），只有 Activity／Standard／Criteria 依使用者需求改為各自獨立整列——
  這三組目前觀察到的實際內容長度（60-90 字元）比 Activity/Standard 短，維持
  2 欄網格；若未來這三組也出現經常性的更長內容，可能需要再評估是否也要改成
  獨立整列，本輪未預先處理這個假設情境。
- `resize-y` 允許使用者手動拖曳 textarea 高度，但沒有限制最大高度；極端情況
  使用者可能把一個欄位拖得很高，尚未測試這個邊界對整體面板捲動體驗的影響。
- 只處理了 Inspection Item 面板本身；ITP 其他分頁（General Information、
  Attachments）與其他模組的輸入體驗不在本批範圍。

## SAFETY_CHECK
- 只修改了 `ITPAdvancedEditor.tsx` 一個產品檔案；未修改
  `itp.submissionDate` 或任何其他既有 i18n key、未新增必填規則、未修改
  `InspectionItem`/`EMPTY_ITEM` 資料結構、未修改既有狀態/保存/複製/排序
  函式的行為邏輯。
- 未修改 `AGENTS.md`、`DECISIONS.md`、任何既有 `docs/workflow/*-archive.md`
  （含本輪新建的 `ITP-INPUT-UX-2026-001-archive.md`，建立後未再修改）。
  `REVIEW.md` 已重置為待審查狀態，**未自行填入任何審查結論**。
- 未修改後端程式碼。
- 未操作或拆除使用者 8198/3198、日常開發 5173 及其後端；只操作自建隔離堆疊
  （8250/3250，已拆除，`lsof` 確認埠號釋放、使用者埠號前後皆正常監聽）。
- 未使用 stash/reset/checkout 對產品檔案做任何還原或範圍隔離（見上方專節
  說明為何本輪刻意不用 stash）；未還原協作者既有修改。
- 未 commit/push/部署。
- 未將任何測試帳密寫入 repo。
- 啟動/拆除隔離環境的指令因本機埠號綁定被沙盒封鎖（`EPERM`），以
  `dangerouslyDisableSandbox` 執行這幾個明確需要的指令；其餘操作維持在沙盒
  內執行，未因此繞過其他安全限制。
````

## REVIEW.md（原文，完整保留）

````markdown
# REVIEW.md — 獨立審查

TASK_ID: ITP-INPUT-UX-IMPLEMENT-2026-001
SOURCE_TASK_ID: ITP-INPUT-UX-2026-001
審查日期：2026-10-04

## EVIDENCE_CHECK
已讀 STATUS、handoff、完整驗證腳本及 10 項 run.log，目視 after-desktop-top.png 與 after-narrow-bottom.png，核對面板 JSX 與 ITPPrintTemplate 文字輸出。未獨立重跑環境。
版面方向接受：桌面 1100px、Activity/Standard/Criteria 各自整列、中英文分欄、手機堆疊與 footer 保持可見，實際截圖清楚改善原先過窄問題。不要求重做版面或補不存在的修改前手機截圖。
但保存驗證只比對 Activity 英文前 60 字元，且測資沒有手動換行；不能證明新多行輸入的完整內容保存、中文及換行不遺失。列表與列印未驗證新換行內容，仍缺原交辦的重要驗收。

## SCOPE_CHECK
只針對新 textarea 帶來的多行文字輸入風險補驗，不擴大業務或已接受版面。窄螢幕缺修改前截圖已充分揭露，不需重建。口頭過程出現打算 stash，但 STATUS 明確稱未執行；本次沒有實際命令紀錄足以判定執行與否，不據此指控違規，也不要求額外歷史調查。

## DECISIONS_CHECK
維持日期名稱、Subject 非必填、欄位與保存契約。列表及列印應核對多行文字的呈現，不可把自動折行與使用者輸入的換行混為一談。

## VERDICT
- [ ] PASS
- [x] REVISE
- [ ] HUMAN_REQUIRED

## REQUIRED_FIXES
### R1 — 補驗多行文字完整保存與呈現
保留現有版面與已接受幾何證據。只新增一組有長英文、中文、明確換行與尾端唯一標記的測資：
- 在新增／編輯／複製共用面板涵蓋三種入口；可在一條短流程完成，不必做全排列。至少 Activity 及一筆 Criteria 填入中英文含換行內容。
- Apply、保存後全新 context 重開，進入對應項目的編輯面板，逐字比對完整 inputValue，而非只在整頁找前 60 字元。確認複製來源未被修改、取消編輯不套用草稿。
- 核對列表與列印預覽完整文字、尾端標記及換行呈現；若新輸入的換行被摺成空白，做局部文字呈現修正，保留既有資料結構与列印流程，不重設整份列印版型。
- 留存針對性證據，未改產品則不重跑整套前端檢查；若為上述呈現問題改產品，只跑必要檢查與受影響情境。

## NEXT_STEP
封存本輪並交辦 R1 補正。不重跑已接受桌面／手機版面整套測試，不新增其他 UX 改造。收尾文件如實列 lint 仍為 13 errors / 21 warnings，不能統稱「lint 皆正常」。完成後再審完整文字保存與呈現證據。
````
