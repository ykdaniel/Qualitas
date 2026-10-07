# 專案篩選未生效修正 — 2026-09-29（BACKLOG #28）

使用者要求：修正「選定專案未實際篩選清單資料」，逐一確認每個模組，查詢結果須為「帳號授權範圍」
與「畫面選定專案」的交集，不得讓前端 project_id 取代後端授權；保留既有承包商篩選／搜尋／分頁／
狀態條件／回應格式；切換專案不得殘留舊專案數字，較晚返回的舊請求不得覆蓋新範圍；失敗時沿用
BACKLOG #37 的明確狀態；不自動替既有 project_id 為空的資料指定專案。

## 根因（逐一核對後確認，12 個模組全部同一根因）

追完整條路徑「專案選擇 → 請求參數 → 後端查詢 → store → 清單／Dashboard」發現：**前端一直都有
正確送出 `project_id`**（`utils/projectFilter.ts::getProjectFilterParams()`，所有 12 個
store 都有呼叫），**後端的 repository 層也一直都正確支援**（`apply_scope` 與
`project_id == X` 兩個條件本來就用 AND 組合，語意上早就是交集）——問題出在中間：**12 個模組的
路由（router）清單端點全部沒有宣告 `project_id` 這個查詢參數**，FastAPI 收到就直接丟棄，
`project_id` 從未真正傳到 repository。核對過 `ITR.get_stats()` 這個既有端點本來就有
`project_id` 參數且運作正常，證實這個修法本身在這個系統裡已有先例，不是新設計。

## 修正範圍（逐一模組列表，12 個全部同一模式，皆已驗證）

| 模組 | Router 改動 | Service 改動 | Repository | 前端 Store |
|---|---|---|---|---|
| ITP | 加 `project_id` 參數並傳遞 | **需要**：明確簽名，加 `project_id` 參數並傳給 repo | 已支援（未改） | 加序號防競態＋跨範圍失敗清空 |
| PQP | 同上 | 不需要（`**filters` 直通） | 已支援（未改） | 同上 |
| NCR | 同上 | 不需要 | 已支援（未改） | 同上 |
| OBS | 同上 | 不需要 | 已支援（未改） | 同上 |
| NOI | 同上 | 不需要 | 已支援（未改） | 同上 |
| ITR | 同上（風格沿用既有 `Optional[str]`） | 不需要 | 已支援（未改） | 同上 |
| FAT | 同上 | 不需要 | 已支援（未改） | 同上（含 `fatDetails` 一併清空） |
| OSD | 同上 | 不需要 | 已支援（未改） | 同上 |
| Audit | 同上 | **需要**：明確簽名，加 `project_id` 參數並傳給 repo | 已支援（未改） | 加序號防競態（既有邏輯本來就在任何錯誤時清空清單，已滿足跨範圍不殘留，未改） |
| Meeting Minutes | 同上 | 不需要 | 已支援（未改） | 同上 |
| Checklist | 同上（另含既有 `itr_id`／`noi_number`／`include_instances` 參數，皆保留） | 不需要 | 已支援（未改） | 同上 |
| FollowUp | 同上 | 不需要 | 已支援（未改） | 同上，另見下方「額外發現」 |

**後端未改**：`core/scope.py::apply_scope`（既有交集邏輯完全未動）、任何權限判斷、任何資料庫遷
移、任何既有 `search`／`status`／`start_date`／`end_date`／`skip`／`limit` 行為。**前端未
改**：承包商篩選（`useDashboardFilterStore`，純前端已載入清單再篩選，本來就與後端無關，未
動）、任何回應格式解析。「全部專案」語意未變：`getProjectFilterParams()` 在未選定專案時回傳
`{}`，router 收到 `project_id=None` 時完全跳過該條件，維持「僅受帳號自身 scope 限制」的既有
行為。

## 額外發現：FollowUpIssue.tsx 有獨立於共用 store 的另一條抓取路徑

逐一核對每個模組時發現：其餘 11 個模組的清單頁全部透過共用 store 抓資料，`FollowUpIssue.tsx`
（`/followup` 頁面）卻是唯一例外——它有自己的 `fetchManualIssues()`，直接呼叫
`api.get('/followup/')`，**完全沒有帶 `project_id`，也沒有在切換專案時重新抓取**（掛載時抓一
次，`useEffect(..., [])`）。頁面上合併顯示的 NCR／OBS／NOI／ITR／ITP／PQP 來源項目走的是共用
store（已修正，正確反應範圍），只有「Follow-up」來源的真實項目沒有反應範圍切換——這個落差只在
瀏覽器實測時才發現，純檢查程式碼容易漏掉（因為頁面確實有 `getProjectFilterParams` 的匯入軌
跡，只是用在別處）。

修正：比照 store 的做法就地補上——`getProjectFilterParams()` 帶入請求、`useProjectStore` 的專
案 id 作為 `useEffect` 依賴（切換即重新抓取）、序號防競態、跨範圍失敗清空 `manualIssues`（不
沿用舊範圍資料）。新建／刪除後呼叫 `fetchManualIssues()` 重新整理的既有行為未動。

## 競態保護（12 個 store + FollowUpIssue.tsx 本地狀態，共 13 處）

每個 `fetchXxx` 新增：
1. **序號防競態**：呼叫時取一個遞增序號，回應／錯誤處理前檢查序號是否仍是最新——較晚建立、較
   晚返回的請求，就算真的回來了也不會覆蓋較新請求已寫入的資料。
2. **跨範圍失敗清空**：另外記錄「目前清單資料是為哪個範圍成功抓到的」。若這次失敗的請求是為了
   一個**不同**範圍（例如剛切換專案），清空清單並顯示錯誤，不讓使用者以為看到的是新範圍的資
   料；若失敗的請求是同一個範圍內的重試，維持既有行為（保留舊資料，只標記錯誤——多數 store 本
   來就是這樣，`Audit` store 本來對任何錯誤都清空,更嚴格，未改）。

## 既有 project_id 為空的資料：目前行為與影響（未修改，僅記錄）

`backend/db_seeder.py` 的內建示範資料（4 筆 ITP、1 筆 Checklist）從未設定 `project_id`，一直是
`NULL`。這批修正前：選特定專案時 `project_id` 參數被後端忽略，這些示範資料在任何專案選擇下都
會出現。**這批修正後**：後端現在真的套用 `project_id` 篩選，`project_id == 'X'` 不會匹配
`NULL`，所以這些示範資料在選定任一特定專案時**會消失**（在「全部專案」仍會依原本的 scope 規
則出現，未受影響的帳號一樣看得到）。這是修正後的正確交集語意（沒有歸屬任何專案的資料，不屬於
「選定某專案」這個交集），但畫面上是一個可觀察的行為改變，如實記錄，**未自動替這些資料指定專
案**，也未清洗、未遷移。

## 本輪驗證

### 隔離環境（真實後端）

`backend/scripts/verification/seed_project_filter_review.py`：2 個專案 PF-A／PF-B，12 個模組
各在 PF-A 放 2 筆、PF-B 放 3 筆（刻意不同數量與不同編號，單比對總數不夠嚴謹，逐筆核對記錄
id）。帳號 `pf_full`（範圍涵蓋兩專案）、`pf_a_only`（僅 PF-A）。

**1. 直接 API 比對（涵蓋全部 12 個模組）**：`curl` 分別打
`GET /{module}/`、`?project_id=PF-A`、`?project_id=PF-B`，全部 12 個模組結果為
`all=5 A=2 B=3`，與種子資料精確相符。

**2. 承包商／搜尋／分頁／狀態條件共同作用**：`project_id=PF-A&search=ITP-1` 正確只回
`PF-A-ITP-1`；`project_id=PF-B&skip=1&limit=1` 正確回第二筆 `PF-B-ITP-2`；
`project_id=PF-A&status=Open` 正確只回 PF-A 的 2 筆 Open NCR。

**3. 單一專案帳號指定範圍外專案**：`pf_a_only`（僅 PF-A）打
`GET /itp/?project_id=PF-B`／`/pqp/`／`/ncr/` 皆回傳**空陣列**（不是 403、不是錯誤訊息），符
合既有「範圍過濾當作查詢條件」的契約（與 `apply_scope` 本來的行為一致：交集為空就是空，不是拒
絕）；`pf_a_only` 不帶 `project_id`（等同前端「全部專案」）一樣只看得到 PF-A 自己的 2 筆——證
實「帳號範圍」本身沒有被 `project_id` 參數放寬或繞過。

**4. 瀏覽器真實操作（`project-filter-review.mjs`）**：
   - `pf_full` 切換 ITP 頁面的專案下拉：全部專案 5 筆 → 切 PF-A 精確顯示
     `PF-A-ITP-1`／`PF-A-ITP-2` 兩筆（不含任何 PF-B 記錄）→ 切 PF-B 精確顯示 3 筆（不含任何
     PF-A 記錄）——**逐筆內容比對，不只比總數**。
   - 同一帳號在 FollowUp 頁面、Dashboard 的 NCR 關鍵統計磚上重複驗證，證實不是只有 ITP 單一模
     組正確。
   - `pf_a_only` 在 ITP 頁面（不論下拉狀態）只看得到 PF-A 自己的 2 筆。

**5. 延遲舊請求 + 快速切換（模擬網路）**：攔截 PF-A 的 `/api/itp/` 回應延遲 2 秒，切到 PF-A
（慢）再立刻切到 PF-B（快，不攔截）。PF-B 的回應先落地，畫面正確顯示 PF-B 的 3 筆；1.5 秒後
PF-A 延遲的回應才姍姍來遲，畫面**仍然**是 PF-B 的 3 筆——較晚返回的舊請求沒有覆蓋較新的資料。

**6. 切換失敗沿用 #37 狀態**：先正常載入，攔截 `/api/itp/` 全部回 500，切換專案——畫面沒有殘留
舊專案的任何一筆記錄（ITP 清單頁本身沒有 #37 那樣的完整狀態 UI，但至少不會誤顯示錯誤範圍的資
料；Dashboard 的對應磚會顯示明確的「無法載入」＋重試，見下方迴歸驗證）。

### 迴歸驗證

同一隔離堆疊重新跑 `dashboard-loadstate-review.mjs`（上一批 BACKLOG #37 的完整驗證腳本）：全數
通過，載入中／失敗無資料／失敗有舊資料／成功零筆／範圍切換五種狀態與數字皆與上一批結論一致，
證實這批的路由與 store 改動沒有破壞 #37 的修正。

### 型別／測試／建置

- `tsc --noEmit` 通過。
- 前端單元測試 97 passed（未新增測試，沿用既有覆蓋；這批改動以隔離瀏覽器實測為主要證據）。
- Vite production build 通過。
- 後端：`test_itp_service.py`／`test_audit_service.py`／`test_pqp_service.py`／
  `test_pqp_router.py`／`test_ncr_service.py`／`test_ncr_router.py`／`test_obs_service.py`／
  `test_noi_service.py`／`test_itr_service.py`／`test_fat_service.py`／`test_osd_service.py`／
  `test_meeting_minutes_service.py`／`test_checklist_service.py`／`test_followup_service.py`
  共 151 項全過；擴大到這 12 個模組相關的全部非 HTTP 測試檔（29 個檔案）共 265 項全過。
  `test_audit_service.py::test_get_audits` 原本斷言呼叫簽名不含 `project_id`，已更新斷言以符
  合新增的既有邏輯（真實邏輯變動，非放寬測試）。**22 個 `_http.py` 測試檔**因這個環境未安裝
  `httpx`（`starlette.testclient` 的相依套件，環境既有缺口，與本批改動無關）**無法執行**，改
  以上方「隔離環境（真實後端）」的 `curl`／Playwright 對真實 HTTP 層直接驗證彌補這個空缺。

## Claude 接續

- 之後任何模組新增清單篩選條件，router 記得同時檢查 repository 是否已支援（這次證實 12 個
  repository 全部早就支援 `project_id`，只是沒接上——先查 repository 往往比直接動手寫查詢邏
  輯快)。
- store 的「序號防競態」＋「跨範圍失敗清空」是現在 13 處（12 store + FollowUpIssue.tsx）共用
  的固定寫法，之後新增列表抓取務必比照，不要重新發明。
- **務必先查有沒有元件繞過共用 store 自己發請求**——`FollowUpIssue.tsx` 這次就是漏網之魚，純
  看程式碼容易漏掉，瀏覽器實測才抓到。
- 這個環境沒有 `httpx`，`_http.py` 測試檔在這裡跑不了；如果之後要跑，需要
  `pip install httpx`（`backend/requirements-dev.txt` 這次順手發現已經是 uncommitted 檔案，
  未確認內容是否已含 httpx，未動它）。

未使用 stash/reset/checkout，保留協作者未提交修改。未 commit/push/部署，未操作開發資料庫／
uploads／日誌。所有隔離堆疊皆於驗證結束後用 `isolated_stack.py down` 拆除。
