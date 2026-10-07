# Dashboard UI/UX 呈現調整 — 2026-09-29

使用者要求：讓使用者進入 Dashboard 後能清楚理解目前範圍、主要數字與可採取的操作。範圍限定呈現
（資訊順序、數字命名、圖表排版、中英文），不新增逾期算法、不改狀態分類／權限／資料範圍。若已
開始的 ITP 語系批次（Codex）尚未動手（確認：`react-app/src/components/ITP/` 於本批開始時無新
異動），本批不影響它。

## 改動範圍

`react-app/src/components/Dashboard/Dashboard.tsx`、`Dashboard.module.css`、
`TrendAnalysisSection.tsx`、`ITPGaugeChart.tsx`、`PQPGaugeChart.tsx`、
`react-app/src/context/LanguageContext.tsx`（新增 19 組 key，附加在既有協作者已新增的大量
uncommitted key 之後，未動任何既有 key 的值）。未改 `useDashboardStats.ts`、任何 store 的
fetch／filter 邏輯、任何後端程式碼。

## 1. 資訊順序

原順序：副標題 → loadFailed 提示 → 承包商篩選 → 到期提醒 → 趨勢分析 → PQP/ITP 成熟度 → OBS/NCR
Pareto。

新順序：**Scope Bar（專案＋承包商）→ loadFailed 提示 → 關鍵統計摘要（新增）→ 到期提醒 → 「趨勢
與詳細分析」標題 → 趨勢分析 → PQP/ITP 成熟度 → OBS/NCR Pareto**。

- **專案範圍**：Dashboard 頁面本身原本完全沒有顯示目前專案，只有承包商篩選。新增唯讀的專案
  chip，讀自既有 `useProjectStore().currentProject`——沒有新增第二套篩選／範圍邏輯，實際切換專案
  仍是既有的 App Header `Shared/ProjectSelector.tsx`；Dashboard 只是把目前值秀出來。
- **承包商篩選**：沿用既有 `useDashboardFilterStore` / `<select>`，只是從獨立的 `toolbar` 移進
  新的 scope bar，事件與 store 完全沒動。
- **關鍵統計摘要**：新增區塊，5 個磚（ITP／PQP／NCR／OBS／NOI），**讀的是既有
  `useDashboardStats()` 算出的同一份 `statistics` 物件**——跟下方 `ITPStatsCard`／`PQPStatsCard`
  等本來就在用的資料源完全相同，沒有另外計算。點擊導到對應模組（沿用各卡片本來就有的
  `navigate('/itp')` 等路徑）。

## 2. 數字意義

逐一核對每張趨勢卡真正用哪個日期欄位算（`TrendAnalysisSection.tsx` 的 `getDate` extractor），
命名前先核對過既有前端單元測試裡就有的說明（`dashboard-workflow-review` 系列測試本來就寫著
「NCR/OBS raiseDate, NOI issueDate, ITP submissionDate, Checklist date, PQP updatedAt then
dueDate」），沒有自己重新判斷。標題改為：

| 卡片 | 舊標題 | 新標題（依實際算法） |
|---|---|---|
| NCR | "NCR Trend" | "NCR — 依發生日期" |
| OBS | "OBS Trend" | "OBS — 依發生日期" |
| NOI | "NOI Trend" | "NOI — 依核發日期" |
| PQP | "PQP Trend" | "PQP — 依最近更新日期（無則採到期日）" |
| ITP | "ITP Trend" | "ITP — 依送審日期" |
| Checklist | "Checklist Trend" | "Checklist — 依檢查日期" |

不是全部都叫「新增件數」（原本也沒有，本來就是「當月落在該日期的筆數」，只是沒說清楚是哪個
日期）。另外新增區塊說明文字「目前所有狀態的總量，非近 6 個月趨勢」，明確區分「關鍵統計摘要」
（目前總量）跟下方「趨勢」（近 6 個月月度統計）兩種完全不同的數字，避免混淆。

PQP／ITP 的 Gauge 標題也順手核對過：原本「PQP Total (Qty & %)」其實畫的是 `maturity`（核准率），
不是「Total」，屬於既有的命名不準——改成「PQP 已核准／成熟度」；ITP 原本「ITP Approved or with
comment (Qty & %)」語意正確但偏長，改成「ITP 已核准（含附帶意見）」，保留「含附帶意見」這個關鍵
語意（approved 同時計入 Approved 與 Approved with comments，算法本身未動）。

**沒有改的**：`useDashboardStats.ts` 的任何計算、`ncrOpen`/`obsOpen`/... 的狀態判斷條件、
denominator 定義——全部逐行核對過，維持原樣，只換了顯示用的文字。

## 3. 圖表排版

- **PQP／ITP 統計卡擠壓儀表圖**：根因是 `.itpChartWrapper`／`.pqpChartWrapper` 原本
  `display:flex` 沒有 `flex-wrap`，而統計卡（`min-width:280px`）+ 儀表圖欄（固定 320px）+
  24px 間距 ≈ 624px 是這兩個子項目的最小總寬；`.dualChartContainer` 在 1024px 以下才整體改直
  排，但 1024px～約 1344px 這段（兩欄並排、每欄卻塞不下 624px）就會被硬壓。改法：加
  `flex-wrap: wrap`（`.itpChartWrapper`／`.pqpChartWrapper`／`.obsChartWrapper`／
  `.ncrChartWrapper` 均加），讓統計卡跟圖表在欄寬不夠時各自換成上下兩排，而不是被壓扁——沒有改
  既有 1024px 那條「整體改直排」的規則,也沒有改 `ITPGaugeChart`/`PQPGaugeChart` 既有的
  `ResizeObserver` 半徑計算邏輯（那段本身沒問題，是外層容器在擠它）。
- **標題過度斷行**：改成上表列出的較短標題，並在 `.gaugeTitle`／`.trendCardTitle` 補
  `overflow-wrap: break-word` 與適當的 `line-height`，長文案換行時不會把卡片其他內容擠壓變形。
- 沒有改成「數字＋比例條」——CSS `flex-wrap` 修正後桌面／平板／手機都驗證無擠壓（見下方驗證），
  維持既有 Gauge 視覺，改動面更小、風險更低。

## 4. 中英文統一

`LanguageContext.tsx` 新增 19 組 key（`dashboard.scopeLabel`／`dashboard.keyStats`／
`dashboard.trendBasisXxx`／`dashboard.trendPeriod`／`dashboard.trendEmpty`／
`dashboard.gaugeItpTitle`／`dashboard.gaugePqpTitle`／`dashboard.maturityValue` 等，EN／ZH 都
有），取代原本寫死在 `TrendAnalysisSection.tsx`／`ITPGaugeChart.tsx`／`PQPGaugeChart.tsx` 裡的
英文字串（"Trend Analysis"、"X Trend"、"Maturity = {n}%"、兩個 Gauge 標題、近 N 個月無資料）。
空資料提示、期間說明、Gauge 標題、新增的 scope bar／關鍵統計摘要全部文字都接語系機制，沒有再新
增中英文混寫的字串。

## 本輪驗證（隔離環境）

`backend/scripts/verification/seed_dashboard_uiux_review.py`（帳號 `dash_full`，密碼
`Accept-Test-1234`，1 個專案、2 個承包商、ITP/PQP/NCR/OBS/NOI 各數筆手算好的資料）＋
`react-app/tests-browser/dashboard-uiux-review.mjs`：

1. **同一份資料及篩選條件的統計值一致**：獨立算出的 ground truth（ITP 4/3/75%、PQP 4/2/50%、
   NCR 4/2/50%、OBS 3/2/67%、NOI 3/2/67%）跟「關鍵統計摘要」磚、既有的 `ITPStatsCard`／
   `PQPStatsCard`、PQP Gauge 四個不同顯示位置逐一比對，數字完全一致；切到承包商篩選
   「Dash Review Co A」後（ITP 3/2/67%、PQP 3/2/67%、NCR 2/1/50%）同樣在關鍵統計摘要與既有
   `ITPStatsCard` 上一致——**沒有出現「同一個數字兩個地方顯示不同」**的情況。
2. **中英文與不同畫面寬度無截斷、重疊或溢出**：桌面 1440px／平板 820px／手機 390px 三種寬度下
   `document.documentElement.scrollWidth - clientWidth` 皆為 0（無水平溢出）；趨勢卡標題
   （含最長的「PQP — 依最近更新日期（無則採到期日）」）與 Gauge 標題實際截圖檢查無破版。
3. **承包商篩選與既有入口仍正常**：見上方第 1 點,同一顆既有 `<select>`、同一個
   `useDashboardFilterStore`,行為未變。
4. **有資料／確實無資料／尚未驗證的錯誤情境區分**：本批新增的「關鍵統計摘要」磚**沒有**加任何
   新的錯誤處理——它讀的是跟 `ITPStatsCard` 等既有卡片相同的 `statistics`,那些卡片原本就沒有
   区分「列表是空的」跟「列表載入失敗」，這批也維持原樣，沒有把載入失敗的模組當成 0（既有的
   `failedModules` 提示只覆蓋 NCR／OBS／NOI，仍然是原本的行為，未擴大也未縮小）。**建置過程中
   發現這個既有缺口比原本以為的更大——見下方「獨立記錄」**。
5. **型別檢查／相關測試／建置**：`tsc --noEmit` 通過；前端單元測試 91 passed（其中
   `dashboard-workflow-review` 系列既有測試本身就驗證了本批用來核對趨勢命名的日期欄位對應關
   係）；Vite production build 通過（輸出至暫存目錄）。
6. 額外重跑 `dashboard-workflow-review.mjs`（既有腳本，也會經過這個頁面）：零迴歸，P0
   專案範圍隔離、NOI 數字皆與預期相符。

### 截圖

僅有「本批修改後」的截圖（桌面／平板／手機），見
`react-app/tests-browser`（執行時輸出到隔離暫存目錄，未提交進 repo，需要時可用下方指令重
跑取得）。**沒有附上「修改前」截圖**——本批明確禁止 stash／reset／checkout，而 Dashboard 這個
路由先前完全沒有專屬審閱腳本／截圖存證，若要精確重現修改前畫面必須另外複製一份未受本批影響的
原始碼到獨立目錄再起一個 vite，判斷這筆額外成本不划算；上方「改動範圍」與這份文件裡列出的每
一行舊字串／舊 class 定義就是修改前狀態最準確的紀錄。

### 重跑方式

```
cd backend
python scripts/verification/isolated_stack.py up --port 8198 --vite-port 3198 \
    --vite-script ../react-app/tests-browser/project-create-vite.mjs > stack.json
python scripts/verification/isolated_stack.py seed --root <root> \
    --script scripts/verification/seed_dashboard_uiux_review.py
node ../react-app/tests-browser/dashboard-uiux-review.mjs stack.json <screenshot-dir>
python scripts/verification/isolated_stack.py down --root <root>
```

## 獨立記錄（不隨本批一起結案）

建置「關鍵統計摘要」磚時發現：`useDashboardStats.ts` 完全沒有處理各 store 的 `error` 狀態——
它只讀 `xxxList`，一個因為網路錯誤而「列表是空的」跟一個「這個模組真的沒有資料」在**每一張**卡
片（`ITPStatsCard`／`PQPStatsCard`／Gauge／新的關鍵統計磚）上都顯示相同的 `0`，無法分辨。目前
只有 `Dashboard.tsx` 頂部一個 `failedModules` 提示涵蓋 NCR／OBS／NOI 三個 store 的
`error`，PQP／ITP／ITR／Checklist 完全沒有涵蓋，即使那三個 store 也載入失敗，`failedModules`
橫幅也不會提及,因為 `Dashboard.tsx` 目前只呼叫了 `useNCRStore`／`useOBSStore`／`useNOIStore`
三個 store 的 error 旗標。已記錄為 BACKLOG #37,本批未修改任何一個 store 或這個判斷邏輯——
使用者明確要求本批不把載入失敗視為零筆的問題混進呈現調整,只需獨立記錄證據。

## Claude 接續

- 新增／調整 Dashboard 上的數字顯示時，優先重用 `useDashboardStats()` 回傳的 `statistics`，不要
  另外算一份——目前 5 個地方（關鍵統計磚、4 張既有卡片/Gauge）都共用同一份，維持這個規則以後才
  不會出現「同個數字兩個地方顯示不同」。
- Trend 卡片標題如果要再調整措辞，先核對 `TrendAnalysisSection.tsx` 裡對應那個 `getDate`
  extractor 用的欄位，不要憑印象命名。
- `.itpChartWrapper`／`.pqpChartWrapper` 等 4 個 wrapper 的 `flex-wrap: wrap` 是本批修正擠壓
  問題的關鍵，之後若要再改這幾個 class 請保留這個屬性或改用等效的響應式方案。
- BACKLOG #37（load-failed 未涵蓋 PQP/ITP/ITR/Checklist）尚未處理，等使用者排優先序再動。

未使用 stash/reset/checkout，保留了 Codex 在其他檔案（`react-app/src/components/ITP/` 等）與
`LanguageContext.tsx` 裡本來就有的大量未提交修改。未 commit/push/部署，未操作開發資料庫／
uploads／日誌。隔離堆疊皆於驗證結束後用 `isolated_stack.py down` 拆除。

---

## 補查：1280px 排版（2026-09-29 第二輪，未改任何程式碼）

原本擠壓問題落在 1024–1344px 區間，1280px 剛好在中間。使用者要求補查此寬度，若沒發現問題就不
動。

隔離環境（同一套 `seed_dashboard_uiux_review.py` 測資，`dash_full`／`Accept-Test-1234`）以
1280×1600 分別截圖中文、英文：

- 中英文皆 `document.documentElement.scrollWidth - clientWidth === 0`（無水平溢出）。
- PQP／ITP 統計卡與 Gauge 並排正常，無擠壓、無重疊。
- 唯一觀察：英文標題「ITP Approved (incl. w/ Comments)」在 1280px 會換成兩行（中文「ITP 已核准
  （含附帶意見）」維持一行）；沒有溢出、沒有跟其他內容重疊，判斷不算「過度斷行」，**未修改**。

**同時觀察到（純記錄，不刪除區塊，使用者裁示）**：「關鍵統計摘要」磚、下方 PQP／ITP 統計卡、
Gauge 三個位置重複顯示同一組數字（例如 PQP 總數／已批准／成熟度）。這是版面設計上的資訊重複，
不是本批「載入狀態」或先前「排版擠壓」的缺陷，留給使用者決定是否要精簡；已記錄於
[BACKLOG #37](../../BACKLOG.md)。

截圖：`react-app/tests-browser/dashboard-1280-check.mjs`（新增，已留在 repo，可重跑），輸出至
隔離暫存目錄，未提交進 repo。

重跑方式：
```
cd backend
python scripts/verification/isolated_stack.py up --port 8198 --vite-port 3198 \
    --vite-script ../react-app/tests-browser/project-create-vite.mjs > stack.json
python scripts/verification/isolated_stack.py seed --root <root> \
    --script scripts/verification/seed_dashboard_uiux_review.py
node ../react-app/tests-browser/dashboard-1280-check.mjs stack.json <screenshot-dir>
python scripts/verification/isolated_stack.py down --root <root>
```

未使用 stash/reset/checkout，未 commit/push/部署，未操作開發資料庫。隔離堆疊已拆除。
