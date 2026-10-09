# Q-Workflow 作廢 ITR 導向修正

## 問題與修正

Q-Workflow 的 W/H Inspection 與複驗檢查已排除 Void ITR，但 `_summarise` 的 `itr_ids`／`reinsp_itr_ids` 仍回傳作廢紀錄。前端節點以這些陣列選擇導向目標，因此節點進度與可導向紀錄不一致。

本批只修改 `backend/services/workflow_service.py` 的連結 ID 輸出，兩個陣列排除 Void。原始關聯與計算 context 保留，沒有修改 Accepted、完成比例、核准／作廢／複驗權限或狀態機。前端現有導向程式未修改；作廢紀錄本身仍保留在原模組。

## 驗證證據

`backend/tests/test_workflow_service.py` 新增兩項參數化案例：透過 NCR 複驗單號找到作廢紀錄，以及透過 originalItrId 找到作廢紀錄。兩者同時準備有效與作廢 ITR，確認輸出只保留有效 ITR；再把最後有效 ITR 作廢，確認兩個 ID 陣列皆空且 W/H Inspection 未完成。

修改前兩項均失敗，實際輸出包含作廢來源及作廢複驗 ITR。測試使用記憶體 SQLite 的真實 ORM 關聯，沒有寫入使用者或開發資料庫。

修正後執行 `test_workflow_service.py`、`test_workflow_project_filter_http.py`、`test_workflow_photo_evidence_http.py`：**58 passed**（包含本批新增 2 項），1366 warnings。未重跑完整後端套件。

本批未改前端，未重跑前端測試、建置或瀏覽器點擊驗收；前端對上述欄位的使用以讀碼確認。未宣稱所有流程或所有導向已完整驗證。未 commit／push／部署，未使用 stash／reset／checkout。

## 追加：真實瀏覽器節點導向驗收（2026-09-30 第二輪，本輪新增）

延續上述後端修正，本輪在**新建立的獨立隔離環境**（非使用者的 8198／3198，非開發資料庫；`isolated_stack.py up --port 8200 --vite-port 3200`）中，以 Playwright 實際點擊節點驗證前端導向行為，補齊上一輪「未重跑瀏覽器點擊驗收」的缺口。

**測試資料**（`backend/scripts/verification/seed_qworkflow_void_nav_review.py`，疊加於 `seed_dashboard_workflow_review.py` 之上，同一 DW-P1 專案）：
- Scenario 1（`QTS-DRC-NOI-000003`）：同一 NOI 下有 `ITR-DW-VOID-3`（Void，先建立）與 `ITR-DW-VALID-3`（Approved，後建立）。
- Scenario 2（`QTS-DRC-NOI-000004`）：只有 `ITR-DW-VOID-4`（Void），無任何有效 ITR。
- Scenario 3（`QTS-DRC-NOI-000005`）：原始 ITR `ITR-DW-ORIG-5`（Reject/Fail）+ 一筆 NCR（`NCR-DW-5`，無 reInspectionNumber）+ 兩筆共用 `originalItrId` 的複驗 ITR：`ITR-DW-REINSP-VOID-5`（Void，先建立）與 `ITR-DW-REINSP-VALID-5`（In Progress／Pass，後建立）。

**測試腳本**：`react-app/tests-browser/qworkflow-void-nav-and-resilience-review.mjs`，以 `dw_unscoped` 登入，逐一點擊每筆 NOI 對應的 `td[data-checkpoint="wh_inspection"]` 或 `td[data-checkpoint="itr"]`，讀取彈出視窗中「Reference no.」欄位實際值，並用截圖佐證。

**結果（全部通過，無缺陷）**：
| 案例 | 點擊節點 | 開啟結果 | 是否曾開到 Void |
|---|---|---|---|
| Scenario 1（混合） | wh_inspection | `ITR-DW-VALID-3` | 否 |
| Scenario 2（僅 Void） | wh_inspection | Fallback 開啟 NOI `QTS-DRC-NOI-000004` | 不適用（無有效 ITR 可開） |
| Scenario 3（混合複驗） | itr | `ITR-DW-REINSP-VALID-5` | 否 |

三案例皆與既有 fallback 邏輯一致：只要陣列非空必開最新有效紀錄，陣列為空（全 Void）則正確退回開啟 NOI。截圖存於 `/private/tmp/claude-501/qworkflow-void-nav-review/`（00~03，本機暫存，非 repo 產物）。

**過程中一次環境級雜訊（非本模組缺陷，已排除）**：第一次嘗試時，同一隔離環境內疊加了 `seed_workflow_pagination_review.py`（見另一份交接文件的 202 筆分頁測試資料），其中 201 筆 NOI fixture 未設定 `itpNo`，導致 `schemas.py::NOIBase.itpNo` 非空字串驗證整批失敗，使 `/api/noi/` 清單 500，連帶讓 Scenario 2 的 NOI fallback 彈窗打不開內容（URL 導向本身正確，但視窗讀不到資料）。判斷為測試資料集組合造成的環境問題，與 Void 導向修正本身無關，**未在本批修正**（不在 Q-Workflow 範圍內，另有一份 NOI schema 對已存在可為 null 欄位要求非空字串的潛在健檢項目，僅記錄於此供未來參考，不建立新的 BACKLOG 項目）。拆除該混合環境後，改用只含 dashboard + void-nav 兩份 seed 的乾淨環境重測，三案例皆全數通過並可讀到彈窗內容。

**本輪未涵蓋**：切換專案競態、失敗重試、分頁失敗三項，記錄於 `qworkflow-project-pagination-2026-09-30-handoff.md` 的追加段落。未修改任何後端或前端程式碼（本輪為純驗證，未發現缺陷）。已拆除本輪自建的隔離環境，未動到使用者的 8198／3198 或開發資料庫。

### 後續處理（Codex，2026-09-30）

上述測資缺少 ITP 與 NOI 讀取契約問題已另批處理，見 [NOI 空值讀取交接](noi-null-itp-read-2026-09-30-handoff.md)。保留以上原輪觀察，不把後續測試混入原輪瀏覽器結果。另外「必開最新有效紀錄」並非這三個案例能證明的保證：目前程式取回傳陣列中的第一個有效 ID，測試只證明排除 Void，未驗證多筆有效紀錄間的時間排序。
