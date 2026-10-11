# NOI 全功能模擬測試（協調中心，2026-10-11）

使用者指示「先跑 NOI 模擬測試 所有功能」，在部署 NOI 2 個提交（127d187e、b13b8dff，ITR模組檢查，獨立 Claude 審查 R2 PASS）之前。

## 環境
- 乾淨的 git worktree `/Users/nook/Documents/Qualitas-worktrees/noi-sim`，固定在 `b13b8dff`（＝準備部署的版本；**不含**工作樹裡其他工作階段未提交的修改，例如 PRINT-EXPORT-UI 的 NOIDetailModal.tsx）。
- 隔離環境 8340／3340（isolated_stack，從 worktree 啟動）；種子 `backend/scripts/verification/seed_noi_simulation_review.py`（6 筆 NOI 涵蓋所有承包商／編號規則情境，含 ITR、NCR、複驗、Follow-up、無承包商舊資料）。
- 操作：Claude 內建瀏覽器（使用者可同步觀看）；規則案例以同一登入身分從頁面呼叫 API。

## 結果
| # | 功能 | 結果 |
|---|---|---|
| 1 | 列表：統計卡、狀態標籤、欄位、6 筆資料 | ✅ |
| 2 | 搜尋（"UT inspection" → 只回 NOI-000003）、狀態篩選 | ✅ |
| 3 | 新增 NOI（Add New NOI）：選承包商自動帶入聯絡人／電話／Email；必填未填時 Save 停用；存檔後編號 `QTS-FHS-NOI-000001`、狀態 Open、欄位正確 | ✅ |
| 4 | 承包商聯絡人端點（另一承包商 Huang Mei-Ling） | ✅ |
| 5 | 編輯時更換承包商：ITP 選單依承包商過濾並清空、提示保留原聯絡人 | ✅（畫面先以「ITP 必填」擋下） |
| 6 | 未存檔離開確認（Leave／Stay & Save） | ✅ |
| 7 | **規則**：無文件 NOI 換承包商 → 允許並重編號（000001 → `QTS-SMI-NOI-000001`） | ✅ |
| 8 | **規則**：有 ITR（000002）→ 拒絕，訊息列出 1 ITR | ✅ |
| 9 | **規則**：有 ITR＋NCR＋複驗（000003）→ 拒絕，訊息列出 2 ITR、1 NCR | ✅ |
| 10 | **規則**：只有 Follow-up（000004）→ 拒絕（Follow-up 計入） | ✅ |
| 11 | **規則**：無承包商舊資料＋有 ITR（000005）→ 可補選、保留原編號 | ✅ |
| 12 | **規則**：無承包商舊資料＋無文件（000006）→ 可補選、重編號 `QTS-SMI-NOI-000002` | ✅ |
| 13 | 狀態流程 Open → In Progress → Resolved → Closed | ✅ |
| 14 | 不合法轉換（Open → Closed）拒絕 | ✅ 400 |
| 15 | 已關閉的 NOI 不能再修改 | ✅ 400 |
| 16 | 關閉檢查：底下 ITR 未完成（000002）不能關閉，訊息清楚 | ✅ 400 |
| 17 | 關聯紀錄（000003）：上游 ITP；下游 ITR×2＋NCR | ✅ |
| 18 | Word 匯出（API）：200、docx、37,934 bytes、檔名正確 | ✅ |
| 19 | Word 匯出按鈕（編輯視窗）：下載檔名＝目前開啟的 NOI | ✅ |
| 20 | 批次列印：勾選 2 筆 → 依承包商分 2 頁、內容正確、觸發列印 | ✅ |
| 21 | 單筆列印（編輯視窗 Print）：版面只含目前 NOI、觸發列印 | ✅ |
| 22 | 批次新增（API）：2 筆、編號連續 | ✅（見發現 2） |
| 23 | 刪除：無文件的 NOI 可刪 | ✅ |
| 24 | 刪除：有 ITR 的 NOI 被拒、資料保留 | ⚠️ 拒絕正確，但回 **HTTP 500**（見發現 1） |

## 發現（皆為既有行為，非 127d187e／b13b8dff 引入）
1. **刪除被引用的 NOI 回 500**：`routers/noi.py` 的 `delete_noi` 沒有攔截服務層的 `ValueError`，「被 ITR 引用、不能刪」的業務拒絕被全域處理包成 `500 Internal Server Error: Cannot delete NOI … referenced by 1 ITR record(s)`。資料未被刪除；但違反「不將領域拒絕誤報為伺服器錯誤」，畫面可能顯示為伺服器錯誤。建議另開小修正（router 映射為 400／409＋測試）。
2. **API 不帶 status 建立 NOI 時預設為 "Draft"**：`noi_service.create_noi` 的預設值；NOI 狀態流程（core/utils.py）沒有 "Draft"。畫面的單筆與批次新增都送 "Open"，使用者不會遇到；屬低優先度不一致。
3. 自動化限制（非產品問題）：原生日期輸入不接受模擬按鍵，改用表單填值。

## 後端測試（Python 3.11）
乾淨 worktree（b13b8dff），所有內容提到 NOI 的測試檔（28 個）：**924 passed、1 skipped，EXIT 0**（27 分鐘）。完整清單與輸出見 `NOI-SIMULATION-2026-10-11-evidence/py311-noi-tests.txt`。

## 結論
NOI 2 個提交的規則（承包商鎖定、Follow-up 計入、補選承包商、編號保留／重編）在畫面與 API 上都照 DECISIONS 運作，其餘 NOI 功能正常。發現的 2 點都是既有行為，與這兩個提交無關，不阻擋部署；是否另開修正由使用者決定。

## 後續：刪除 500 修正（2026-10-11，使用者指示「修第 1 個問題，NOI 排進佇列」）
- `backend/routers/noi.py` `delete_noi`：服務層的 ValueError（被 ITR／NCR／Checklist 引用）改回 400 並附原因；ScopeForbidden 403、找不到 404 不變。
- 新測試 `backend/tests/test_noi_delete_http.py` 5 項：被 ITR／NCR／Checklist 引用 → 400 且資料不刪；沒被引用 → 200，再刪一次 → 404；沒有 noi:delete → 403。修正版 5 passed；換回 HEAD 版 router：3 failed（就是那 3 個 400 案例）、2 passed。
- 本機 NOI 相關測試（`-k noi`）169 passed。Python 3.11 全套（b13b8dff＋本修正）：見 `NOI-SIMULATION-2026-10-11-evidence/py311-full-suite-delete-fix.txt`。
- 另外發現：`validators.check_noi_references` 不檢查 Observation 與 Follow-up，被這兩種引用的 NOI 可以直接刪除；b13b8dff 的承包商鎖定則有把這兩種算進去。

## 後續 2：Observation／Follow-up 也擋刪除、預設狀態改 Open（2026-10-11，使用者「照建議」）
- `core/validators.py` `check_noi_references`：也計入 Observation（noiNumber）與來源為 NOI 的 Follow-up（sourceModule 去空白、不分大小寫），錯誤訊息格式不變。
- `services/noi_service.py` `create_noi`：沒帶 status 時預設 "Open"（原為 "Draft"）。
- `tests/test_noi_delete_http.py` 擴充為 10 項：修正版 10 passed；換回 HEAD 的 validators＋noi_service：OBS、Follow-up×2、預設狀態 共 4 項失敗。
- 決策已寫入 DECISIONS.md「NOI 刪除：被任何文件引用就拒絕（400）；未指定狀態時預設 Open」。
