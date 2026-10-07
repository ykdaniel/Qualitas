# Dashboard 載入狀態修正 — 2026-09-29（BACKLOG #37）

使用者要求：先核對各模組載入狀態與資料來源，涵蓋 Dashboard 摘要、趨勢、統計卡及 Gauge，修正
「載入失敗顯示成零筆」的問題，區分首次載入中／失敗無資料／失敗但有舊資料／成功零筆／範圍切換
五種情境。沿用現有載入機制，保留既有統計算法、日期依據與資料範圍。

## 改動範圍

新增 `react-app/src/hooks/useDashboardModuleStatus.ts`、
`react-app/src/components/Dashboard/ModuleStatus.tsx`、
`react-app/tests-unit/dashboardModuleStatus.test.ts`。修改
`react-app/src/components/Dashboard/Dashboard.tsx`、`TrendAnalysisSection.tsx`、
`Dashboard.module.css`（新增樣式）、`LanguageContext.tsx`（新增 3 組 key）。**未修改**任何
store 的 `loading`/`error`/fetch 邏輯、`useDashboardStats.ts` 的任何計算、後端任何程式碼。

## 設計

每個 store（ITP/PQP/NCR/OBS/NOI/Checklist）本來就有 `loading`／`error`／清單三個既有欄位，未新
增任何 store 狀態。新的 `useDashboardModuleStatus()` 純粹把這三個既有欄位轉成一個明確狀態：

- **`loading`**：這個模組目前沒有「已確認屬於目前範圍」的資料可顯示——首次載入，或專案範圍剛
  切換、新的請求還沒開始／還沒回來。
- **`error-empty`**：載入失敗，且沒有可用資料。
- **`error-stale`**：載入失敗，但目前範圍先前成功載入過的資料還在，應繼續顯示並標示「更新失
  敗」。
- **`ok`**：沒有錯誤；筆數可能真的是 0（成功的零筆），現在能跟「載入中」「失敗」明確分開。

Dashboard 上每個顯示這些模組數字的地方（關鍵統計磚、既有統計卡、Gauge、Pareto 區塊、趨勢小卡）
都改讀同一個 `moduleStatus`，不會出現「這裡顯示 0，那裡顯示錯誤」的矛盾。

### 範圍切換不得沿用舊資料

`AppProviders.tsx` 既有的「專案切換時重新抓取所有模組」機制原封不動；`useDashboardModuleStatus`
額外用兩個 ref（不觸發重新渲染）追蹤「目前的資料是為哪個範圍確認成功的」與「這個範圍是否已經
觀察到至少一次 loading」。只有在**同一個範圍**內先成功、後續同範圍的重新整理失敗，才會顯示
「更新失敗＋保留舊資料」；範圍已切換但新範圍的請求失敗，一律顯示「無法載入」，不會誤把舊範圍
的數字標成「這個範圍的舊資料」。

### 403 與重試

沿用既有的 `fetchXxx()`／`error` 訊息機制，未改變 401/403 的處理方式。「重試」按鈕呼叫的就是
store 原本的 `fetchXxx()`，是使用者手動觸發的單次請求，沒有自動重試迴圈。

## 驗證過程中抓到並修正的兩個真實程式問題（本批範圍內，非既有已知缺陷）

1. **無限重新渲染迴圈**：第一版 `useDashboardModuleStatus` 用 `useXStore(s => ({...}))`（selector
   回傳新物件字面量）——這是 zustand 的已知反模式，物件參照每次都不同，導致訂閱該 store 的元件
   在該 store**任何**欄位變動時都會重新渲染。結合 ref 寫入的時機，實際造成
   `TrendAnalysisSection` 觸發 React「Maximum update depth exceeded」錯誤，整個 Dashboard 白
   屏。用隔離環境的真實瀏覽器（非本地開發環境）直接複現、修正：改成逐一讀取基本型別
   （`loading`/`error`/`list.length > 0`），不再回傳物件。
2. **範圍切換的競態**：`currentProject` 變更（進而 `currentScopeId` 變更）跟
   `AppProviders.tsx` 實際呼叫 `fetchXxx()`（把 `loading` 設成 `true`）不是同一個 React
   render——中間有一個畫面，`currentScopeId` 已經是新範圍，但該模組的 `loading`/`error`/清單都
   還是「舊範圍已經成功過」的狀態。若直接信任「沒有 loading、沒有 error」＝可以標記為新範圍已
   確認，會在**這個中間畫面**就誤把舊範圍的資料標記成新範圍的已確認資料；之後若新範圍的請求真
   的失敗，就會誤顯示成「新範圍的舊資料，更新失敗」而不是「無法載入」。修正：新增
   `sawLoadingForScope` ref，只有「已經觀察到這個範圍至少觸發過一次 `loading=true`」才允許把
   資料標記為該範圍已確認；中間那個畫面因為還沒觀察到，會正確顯示為 `loading`。兩者皆為隔離環
   境真實瀏覽器操作時當場發現、當場修正，不是憑空猜測。

## 本輪驗證

### 隔離環境（真實後端）

`backend/scripts/verification/seed_dashboard_loadstate_review.py`：2 個專案（LS-P1: PQP 2／
ITP 1／NCR 0 真實零筆；LS-P2: PQP 5／ITP 3／NCR 2），2 個帳號（`ls_full` 同時有兩個專案的權限
範圍；`ls_p1_only` 只有 LS-P1）。`react-app/tests-browser/dashboard-loadstate-review.mjs`：

1. **REAL**（真實後端、真實資料，無攔截）：`ls_full`「所有專案」範圍下 PQP=7／ITP=4／NCR=2（兩
   專案合計），與底層資料完全一致。
2. **REAL**：另開 `ls_p1_only`（只有 LS-P1 權限範圍）一個獨立 session，PQP=2／ITP=1／**NCR=0
   顯示為 0（`ok` 狀態），不是「載入中」或「無法載入」**——證明真正的零筆會被正確辨識。
3. **SIMULATED**（`page.route` 攔截 `/api/pqp/` 延遲 2.5 秒）：請求進行中畫面顯示「載入中」骨
   架，不是提早顯示的 0 或舊值；回應到達後正確顯示真實數字。
4. **SIMULATED**（`/api/ncr/` 固定回 500，全新 session 無舊資料）：NCR 磚顯示「無法載入」＋可
   點擊的「重試」按鈕，不是 0；同一頁面**未被攔截**的 PQP 仍正常顯示真實數字（單一模組失敗不
   阻斷其他模組）。
5. **SIMULATED→REAL**：情境 4 的失敗狀態下，移除攔截並點擊磚上的「重試」，正確恢復顯示真實數
   字，錯誤訊息消失。
6. **SIMULATED**（先真實成功載入「所有專案」PQP=7，攔截 `/api/pqp/` 後切換到 LS-P1）：切換後
   的請求失敗，畫面顯示「無法載入」，**沒有**把舊範圍的「7」標成「LS-P1 的舊資料、更新失敗」
   （這正是上方競態問題修正後的效果）。

**關於「已有資料、同範圍重新整理失敗」（`error-stale`）**：這個情境需要「已成功載入、且在**不
切換範圍**的情況下重新整理」，但目前 Dashboard 除了專案切換（會被視為範圍改變）之外，沒有任何
「手動重新整理單一模組」的 UI 入口；用整頁 `reload()` 實測會清空記憶體中的 zustand store（等同
重新載入整個 App，不是「保留舊資料」的情境），實際嘗試後判定這條路徑無法代表真實情境，予以捨
棄，不列入瀏覽器證據。改為直接對 `deriveModuleStatus`（實際production 用的同一個函式，抽成
`useDashboardModuleStatus.ts` 匯出的 pure function）寫 6 個真實單元測試
（`tests-unit/dashboardModuleStatus.test.ts`），涵蓋 `error-stale` 分支與所有其他分支組合。這
不是瀏覽器證據，而是對正式程式碼的直接單元測試，已在文件與程式碼註解中清楚標示區別。

### 型別／測試／建置

`tsc --noEmit` 通過；前端單元測試 97 passed（91 既有 + 6 新增，含 `deriveModuleStatus` 的完整
分支）；Vite production build 通過（輸出至暫存目錄）。

### 迴歸確認

同一隔離堆疊重新跑上一批（2026-09-29 呈現調整）的 `dashboard-uiux-review.mjs`：24 項全數通過，
數字、順序、無溢出結論不變，證明本輪的狀態包裝沒有改變任何既有計算結果。

## 驗證過程中順手發現、獨立記錄（未修正，未混入本批）

**BACKLOG #28 從「無法驗證」升級為「已確認」**：建置本批驗證用的雙專案帳號時發現，
`routers/itp.py`／`pqp.py`／`ncr.py`／`obs.py`／`noi.py` 的清單端點**完全沒有宣告 `project_id`
查詢參數**——前端 `getProjectFilterParams()` 送出的 `?project_id=X` 被後端直接忽略，篩選完全依
賴使用者自己的後端 `scope`。對只能看一個專案的帳號而言，恰好「範圍本身就只有那個專案」掩蓋了這
個問題；對能看多個專案的帳號（本批的 `ls_full`），切換下拉選單**完全不會改變畫面數字**——直接
比對 `GET /pqp/` 與 `GET /pqp/?project_id=LS-P1` 的回應內容，兩者逐位元組相同，皆為 7 筆。這是
資料範圍層級的問題，明確不在本批（呈現狀態）範圍內，已更新 BACKLOG #28 記錄根因，未修改任何路
由或服務層程式碼。

## Claude 接續

- 之後任何 Dashboard 新增的「目前總量」或趨勢顯示，都應該透過 `useDashboardModuleStatus()` 取得
  狀態，不要用 `list.length === 0` 自行推斷，也不要另外發明一套 loading/error 呈現規則。
- `deriveModuleStatus`（`useDashboardModuleStatus.ts` 匯出）是唯一的狀態判斷邏輯，改規則只改
  這一個函式，`tests-unit/dashboardModuleStatus.test.ts` 會保護所有分支。
- BACKLOG #28（專案下拉篩選對多專案帳號無效）是下一個值得處理的資料範圍問題，但需要先決定設計
  方向（見 BACKLOG 條目裡的兩個選項），不是單純的程式碼修正。
- 「關鍵統計磚／統計卡／Gauge 顯示同一組數字三次」的版面重複，記錄在 BACKLOG #37，交由使用者決
  定是否精簡，本批未動。

未使用 stash/reset/checkout，保留協作者在其他檔案的未提交修改。未 commit/push/部署，未操作開
發資料庫／uploads／日誌。所有隔離堆疊皆於驗證結束後用 `isolated_stack.py down` 拆除。
