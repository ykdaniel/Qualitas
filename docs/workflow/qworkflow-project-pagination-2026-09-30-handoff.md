# Q-Workflow 專案篩選與清單漏列修正

## 後續：待關注 API 缺日期排序（2026-09-30，Codex）

新增真實 ORM 案例確認同進度的 NULL／空字串日期原本排在有效日期之前，與既有函式「缺日期最後」註解及日期降序意圖不符。修正排序鍵為「是否缺日期、反向日期」，不改進度優先順序、不改任何儲存值。回歸測試包含新／舊日期、NULL、空字串，以及限制只取前兩筆時仍選到有日期的兩筆；修正前測試失敗。

目前搜尋前端僅找到 `fetchNeedsAttention` 的定義，沒有呼叫端。本項屬後端 API 正確性修正，不宣稱改變目前 Dashboard 的顯示；未新增 UI 入口或业务規則。

本項實際執行 `test_workflow_service.py` 與 `test_workflow_project_filter_http.py`，32 passed，198 warnings。未重跑前端、瀏覽器或完整後端套件。未啟動伺服器或碰使用者試用資料，未 commit／push／部署。

日期：2026-09-30。已實作、完成本節列出的驗證，未 commit／push／部署。

## 確認的問題與修正

1. Q-Workflow 頁面未依目前選取的專案載入；後端清單、統計、待關注三個端點也沒有接收專案條件。新增 `project_id` 傳遞，在原有資料範圍條件之上以 AND 篩選來源 NOI 的專案，不擴大可見範圍。
2. 頁面原本只載入前 200 筆，摘要卻計算全部紀錄。新增逐頁載入，全部成功才顯示完整清單；後續頁失敗時不把部分資料當作完整成功。

`useWorkflowData` 集中處理專案切換、載入與錯誤狀態。切換專案立即隱藏舊範圍數值，effect 清理旗標防止過期回應寫回；失敗顯示錯誤與重試入口，不顯示成零筆。沒有修改 checkpoint、照片證據、完成比例或權限的業務規則。

## 檔案

- `backend/routers/workflow.py`、`backend/services/workflow_service.py`
- `react-app/src/services/workflowService.ts`
- `react-app/src/hooks/useWorkflowData.ts`（新增）
- `react-app/src/components/Workflow/Workflow.tsx`
- `backend/tests/test_workflow_project_filter_http.py`（新增）
- `react-app/tests-unit/workflowService.test.ts`（新增）
- `backend/scripts/verification/seed_workflow_pagination_review.py`（新增）

## 本輪執行的驗證

- 修正前新增三個端點的 HTTP 專案篩選測試，三項皆失敗：指定專案仍回傳全部四筆。修正後通過。
- `test_workflow_project_filter_http.py`、`test_workflow_service.py`、`test_workflow_photo_evidence_http.py`：合計 **56 passed**。涵蓋三端點、全部／指定／不存在專案，以及既有 scope 與指定專案的交集；非完整後端套件。
- 前端單元測試 **108 passed**（原 105 加新增 3）：203 筆跨頁完整載入、後續頁失敗拒絕部分結果、統計及待關注 API 傳遞專案條件。
- 前端型別檢查與 production build 通過。
- 獨立隔離後端 8202／前端 3202，以真實瀏覽器操作：全部專案兩筆，切專案一、二各一筆，摘要及列內容隨之變更；點專案二的流程列開啟正確 NOI 單號。
- 再用新增種子脚本在同一獨立環境為專案二新增 201 筆。頁面摘要與清單皆為 **202**，DOM 逐列計數為 202，原本在尾端的既有流程仍出現，證實未止於前 200 筆。

## 重跑與限制

建立獨立堆疊後，先執行既有 `seed_dashboard_workflow_review.py`，再執行 `seed_workflow_pagination_review.py`。後者要求 `QUALITAS_REQUIRE_ISOLATED_DB=1`，只供全新隔離資料使用。

本輪瀏覽器未注入延遲回應測競態，也未注入失敗實測重試按鈕；過期回應防護為程式碼核對，後續頁失敗則有服務函式單元測試，不能混稱為畫面驗證。沒有跑全部 checkpoint 導頁、完整業務鏈或完整後端套件。逐頁載入不是資料庫快照，不宣稱同時新增／刪除時仍具快照一致性；未做大規模效能測試。

使用者手動試用環境 8198／3198、開發資料庫及協作者其他修改未觸碰。未使用 stash／reset／checkout。

本輪獨立堆疊已拆除，8202／3202 已釋放；8198／3198 仍在監聽。僅關閉本輪建立的測試分頁。

## 追加：競態／失敗重試／分頁失敗真實瀏覽器驗收（2026-09-30 第二輪，本輪新增）

補齊上一輪明確列為未涵蓋的三項，在**新建立的獨立隔離環境**（非使用者的 8198／3198，非開發資料庫；`isolated_stack.py up --port 8201 --vite-port 3201`，種子為 `seed_dashboard_workflow_review.py` + `seed_workflow_pagination_review.py`，DW-P2 共 202 筆）中，以 Playwright 透過 `page.route()` 注入延遲／中斷實際操作介面驗證，補上一輪「程式碼核對」與「單元測試」的畫面缺口。腳本：`react-app/tests-browser/qworkflow-resilience-review.mjs`。

**Test 1（切換專案競態）**：先切到 P2（基準），對 `project_id=DW-P1` 的請求注入 3 秒延遲，切到 P1（觸發延遲請求），200ms 內再切回 P2（P2 請求不延遲、正常完成）。切換後立即檢查：畫面顯示 P2 的 202 筆與 `QTS-DRC-NOI-000002`；等待延遲窗口（3 秒後，此時延遲的 P1 回應理論上已抵達）再次檢查：仍為 P2 的 202 筆，且 P1 專屬內容（`DW Accepted (P1)`）從未出現。確認攔截到 2 次延遲請求，證實時序確實構成競態，而 `useWorkflowData` 的 `cancelled` 旗標與 `visible` 二次防護皆生效，過期回應未覆蓋新專案畫面。截圖：`01-race-right-after-switch.png`、`02-race-after-delay.png`。

**Test 2（失敗與重試）**：在 P1（1 筆基準）之後，對 `**/api/workflow/**` 全面 `route.abort()`，切到 P2。結果：錯誤橫幅（`errorBanner`）顯示、表格 0 列（無「顯示成 0 筆」的空清單訊息，因為 `!loading && !error` 條件不成立所以完全不顯示空清單列）、摘要卡片區塊（`summaryGrid`）整段不渲染（不殘留 P1 的舊數字）。解除攔截並點擊 Retry 按鈕後：錯誤橫幅消失、清單恢復為 P2 的 202 筆。截圖：`03-failure-state.png`、`04-after-retry.png`。

**Test 3（後續分頁失敗）**：DW-P2 共 202 筆（第一頁 `skip=0,limit=200` 成功取得 200 筆，第二頁 `skip=200` 才能取到剩餘 2 筆）。切換專案觸發重新載入時，攔截 `skip=200` 的請求令其失敗（第一頁維持成功）。結果：畫面顯示錯誤橫幅、表格 0 列——`fetchAllWorkflows` 的 `for(;;)` 迴圈在任何一頁失敗時會直接把例外往上拋，不會把已成功的第一頁 200 筆當作「完整清單」呈現，`useWorkflowData` 據此整體標記為 error 而非顯示部分清單。截圖：`05-pagination-failure.png`。

**結論**：三項全部通過，**未發現缺陷，本輪未修改任何後端或前端程式碼**。三項行為均與程式碼原本設計（`cancelled`／`visible` 雙重防護、`error` 時摘要卡片整段不渲染、`fetchAllWorkflows` 任一頁失敗即整體拋錯）一致。

**沿用證據，未在本輪重跑**：全部專案／單專案切換的基本畫面內容、202 筆分頁完整載入的逐列計數、後端 56 + 前端 108 項既有測試、型別檢查與 build——均沿用上一輪紀錄，本輪未變動對應程式碼故不重跑。

**本輪仍未涵蓋**：多次快速連續切換（超過兩次）專案的競態；同時對 stats 與 list 兩個端點分別注入不同時序延遲的交叉情境；行動裝置或慢速網路模擬；長時間掛在錯誤畫面後使用者操作其他功能是否受影響。

使用者手動試用環境 8198／3198、開發資料庫及協作者其他修改未觸碰。未使用 stash／reset／checkout，未 commit／push／部署。本輪自建的兩個獨立堆疊（8200／3200、8201／3201）已於驗收完成後拆除。
