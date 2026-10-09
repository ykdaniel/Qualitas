# Dashboard 統計一致性＋PQP／ITP 呈現簡化 — 2026-09-29

使用者要求：先確認並修正同名數字（NCR/OBS「開啟」）在摘要／卡片／圖表三處的定義差異，若是同一
指標就抽成共用計算；再把 PQP／ITP 整合成一張核准摘要卡，移除摘要磚／詳細卡／Gauge 三處重複，
Gauge 改單色比例條、移除未確認的品質分級色帶。開始前先確認 BACKLOG #28 的 HTTP 測試收尾是否完
成。

## 零、#28 HTTP 測試收尾

嘗試安裝 `httpx`（`requirements-dev.txt` 已釘選 `>=0.27.0,<0.28`）：`pip install --user` 被
Homebrew Python 的 PEP 668 保護擋下；加 `--break-system-packages` 後改成連線到 PyPI 時遇到
**沙盒的 SSL 憑證驗證失敗**（`SSLCertVerificationError`），非權限問題，多次重試皆同樣失敗。判斷
是這個環境的網路沙盒限制，不是可以透過調整旗標解決的問題，如實記錄為**未完成**，未進一步嘗試
繞過憑證驗證（那會是安全性妥協，不是修正）。22 個 `_http.py` 測試檔在這個環境依然無法執行；本
批與上一批一樣，改用隔離環境的真實 HTTP（curl／Playwright）驗證彌補這個測試層級的缺口。

## 一、統計一致性

### 先重現（隔離資料，涵蓋五種真實合法狀態）

後端 `core/utils.py::WorkflowEngine.TRANSITIONS["NCR"]`／`["OBS"]` 定義的合法狀態一致：
`Open → In Progress/Resolved/Closed/Void`。種子腳本
`backend/scripts/verification/seed_dashboard_stats_consistency_review.py` 建立 NCR／OBS 各 7
筆，涵蓋全部五種狀態（2 Open、2 In Progress、1 Resolved、1 Closed、1 Void）。

**修正前實測**：

| | Key Stats 磚（`useDashboardStats.ts`） | NCR/OBSStatsCard.tsx | 結論 |
|---|---|---|---|
| NCR 開啟 | 2（29%）—只認字面 "open" | 5（71%）—非 Closed 且非 Void | 不一致，磚**少算**了 In Progress／Resolved |
| OBS 開啟 | 6（86%）—非 Closed（含 Void） | 5（71%）—非 Closed 且非 Void | 不一致，磚**多算**了 Void |

### 查既有已確認規則

- `NCRStatsCard.tsx`／`NCRParetoChart.tsx` 本來就用「非 Closed 且非 Void」，且
  `NCRParetoChart.tsx` 的既有註解明講這是「配合 NCRStatsCard 的既有排除規則，兩者先前不一
  致」——代表這兩處在**更早一批**就已經被拉齊過，只是沒有推廣到 `useDashboardStats.ts`。
  `OBSStatsCard.tsx`／`OBSParetoChart.tsx` 同一模式。
- BACKLOG #24 第 4 點（2026-09-19 已記錄，NOT STARTED）：NCR／OBS 模組**自己頁面**的摘要卡跟
  狀態分頁本來就有這個落差，並點名這是跟 2026-08-27 KPI Void-exclusion 那次修正**同一種根因形
  狀**——KPI 那次的先例確立了「Void 從開啟中排除」是這個系統已確認的規則，不是本批自己認定。

綜合以上：這是**同一個指標**（未結案／outstanding）在三個地方各自重寫、其中一處算錯，不是需要
分別命名的兩種指標。抽成共用 `react-app/src/utils/statusBuckets.ts`
（`isClosedStatus`／`isVoidStatus`／`isOutstandingStatus`），`useDashboardStats.ts`、
`NCRStatsCard.tsx`、`OBSStatsCard.tsx`、`NCRParetoChart.tsx`、`OBSParetoChart.tsx` 五處全部改
用同一份計算。

**修正後實測**：三處全部 NCR 5（71%）、OBS 5（71%），一致。

### Pareto 累積比例範圍（使用者裁示）

`NCRParetoChart.tsx`／`OBSParetoChart.tsx` 原本：累積比例分母含 Void（`total`），柱狀圖只畫
Open／Closed（排除 Void）——問過使用者後，改成**累積比例分母也排除 Void**，與柱狀圖範圍一致
（選項一，非柱狀圖新增 Void 區塊，也非維持現狀只記錄）。左軸上限（`leftAxisMax`）比照改用
Open+Closed 計算，不再用含 Void 的 `total`。修正後單一承包商情境下柱高＝Open+Closed，累積線落
在 100% 對齊柱頂（實測截圖：`dash-simplify-full.png` 一節）。

### 刻意沒有動的部分

- NOI 的「開啟」判斷（`useDashboardStats.ts` 的 `noiOpen`）同樣只認字面 "open"，可能有同一種
  問題，但使用者這批只點名 NCR／OBS，NOI 未在範圍內，**未動**，未記錄新待辦（如需要請另外提
  出）。
- BACKLOG #24 第 4 點描述的是 NCR／OBS **模組自己頁面**（狀態分頁 vs 摘要卡）的落差，跟本批修
  的 Dashboard 三處不是同一段程式碼，**未一併修正**，該待辦繼續開著。

## 二、PQP／ITP 呈現簡化

新增 `react-app/src/components/Dashboard/ApprovalSummaryCard.tsx`（PQP／ITP 共用同一個元件，
用 props 帶入各自的標籤／分母／其他狀態列）。

**版面變化**：

- 「關鍵統計摘要」磚：PQP／ITP 移除，只留 NCR／OBS／NOI（這兩個模組不在本批範圍，維持原樣）。
- 「PQP／ITP 成熟度分析」區塊：原本的 `PQPStatsCard`+`PQPGaugeChart`（並排兩欄）、
  `ITPStatsCard`+`ITPGaugeChart` 改成各一張 `ApprovalSummaryCard`：
  - PQP：總數、已核准／比例、審核中、退件（紅字，沿用既有規則）、查看詳情。
  - ITP：總數（既有規則排除 Void）、已核准（含附帶意見）／比例、已提交、查看詳情。
- 比例呈現改成純色比例條（`.approvalSummaryBarTrack`/`.approvalSummaryBarFill`，單一顏色
  `#b8945a`），**移除**原本 Gauge 的 Low／Medium／High 三色帶（那三個色帶的門檻從未有過業務確
  認，維持會暗示一種沒人簽核過的品質分級）。
- 成功零筆：卡片顯示總數 0 與「尚無資料」，不顯示比例列、不顯示比例條（不會出現 0% 或空比例
  條，不表達為品質不佳）。
- `ApprovalSummaryCard` 內部直接整合 BACKLOG #37 的四種狀態（loading／error-empty／
  error-stale／ok），沿用既有 `useDashboardModuleStatus`／`ModuleStatusBox`／`StaleFlag`，未
  重寫載入邏輯。

**未刪除、未修改**：`ITPGaugeChart.tsx`／`PQPGaugeChart.tsx`／`ITPStatsCard.tsx`／
`PQPStatsCard.tsx` 四個檔案還在，只是 `Dashboard.tsx` 不再引用；NCR／OBS 自己的
StatsCard／Pareto 兩欄式呈現維持原樣（不在這批「PQP／ITP 簡化」範圍內）；既有核准範圍、分母、
承包商／專案篩選規則全部未動，`useDashboardStats.ts` 只多讀一個既有欄位公式算出的
`underReview`（新增計算，未改既有欄位的定義）。

## 本輪驗證

### 隔離環境（真實後端）

`backend/scripts/verification/seed_dashboard_stats_consistency_review.py`：NCR／OBS 各 7 筆
（五種狀態齊全）、PQP 5 筆（2 Approved／1 Under Review／1 Reject／1 Void）、ITP 6 筆（2
Approved／1 Approved with comments／1 Pending／1 Revise & Resubmit／1 Void）。帳號
`sc_full`。

1. **修正前／修正後對照**（見上方表格）：Key Stats 磚與 StatsCard 從不一致變成一致。
2. **PQP／ITP 新卡片數字**：PQP 總數 5、已核准 2（40%）、審核中 1、退件 1；ITP 總數 5（排除 1
   筆 Void）、已核准（含附帶意見）3（60%，2 Approved + 1 Approved with comments）、已提交 5。
   與種子資料逐一核對相符。
3. **零筆情境**：另建一個沒有任何關聯記錄的承包商，切承包商篩選後兩張卡片皆顯示「總數 0」＋
   「尚無資料」，無比例列、無比例條（實測截圖 `dash-zero-state2.png`）。
4. **載入失敗／重試**：攔截 `/api/pqp/` 回 500，卡片顯示「無法載入」＋重試；移除攔截點重試後
   正確恢復。範圍切換失敗（沿用 BACKLOG #37 那批的腳本，已更新選擇器指向新的
   `approvalSummaryCard` 而非舊的 `keyStatsTile`）：全部重跑仍 ALL PASSED，零迴歸。
5. **中英文與四種寬度**（1440／1280／820／390px）：截圖確認排版正常、無擠壓重疊；
   `document.documentElement.scrollWidth - clientWidth` 於中文全數為 0，英文 1440/1280/820 皆
   為 0，**英文 390px 出現 42–80px 溢出**——追查後確認是 App Shell 頁首（非本批修改的元件）造
   成，`/pqp` 頁面（完全沒碰過）同樣溢出，且量測 `ApprovalSummaryCard` 本身寬度僅 332px（在
   390px 視窗內），排除是本批內容造成，已獨立記錄為 BACKLOG #38，未修改。

### 型別／測試／建置

`tsc --noEmit` 通過；前端單元測試 97 passed（未新增，沿用既有覆蓋，本批以隔離瀏覽器實測為主要
證據）；Vite production build 通過。後端本批未修改任何檔案（只嘗試安裝 httpx 未成功，見上方第
零節），未重跑後端測試。

## Claude 接續

- NCR／OBS 之後若要新增任何「開啟／未結案」相關統計，一律用
  `utils/statusBuckets.ts::isOutstandingStatus`，不要在第四個地方重新手刻一次判斷式。
- BACKLOG #24 第 4 點（NCR／OBS **模組自己頁面**的摘要卡跟狀態分頁的落差）跟本批不是同一段程
  式碼，還沒修。
- NOI 的「開啟」定義可能有跟本批修正前 NCR 一樣的問題（只認字面 "open"），使用者這批沒有點
  名，未動、未另外立待辦，如果之後要處理請先跟使用者確認這是否也是同一種指標。
- BACKLOG #38（App Shell 英文 390px 溢出）是跟這批完全無關、順手發現的既有問題，下次處理
  Header／`AppLayout.tsx` 或響應式相關批次時可以一併排入。
- `ApprovalSummaryCard.tsx` 是 PQP／ITP 共用元件，之後如果要幫其他模組做類似的「核准摘要卡」
  （例如 ITR），可以直接重用，不用再寫一個新元件。

未使用 stash/reset/checkout，保留協作者未提交修改。未 commit/push/部署，未操作開發資料庫／
uploads／日誌。隔離堆疊已於驗證結束後用 `isolated_stack.py down` 拆除。
